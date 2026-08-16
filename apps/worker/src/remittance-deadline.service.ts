import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AgentStatus,
  AuditActorType,
  AuditSeverity,
  RemittanceStatus,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { V2nSmsService } from './v2n-sms.service';
import { remittanceDueWarning, remittanceOverdueLock } from './sms-templates';

const CHECK_MS = 5 * 60_000;
const WAT_OFFSET_MS = 60 * 60 * 1000;

// Settlement is due by 11:00 WAT the morning after a day closes. The warning
// goes out at 09:00, when sales reopen and the agent is at their terminal.
const DEADLINE_MINUTES_WAT = 11 * 60;
const WARNING_MINUTES_WAT = 9 * 60;

// Marks the suspension so it can be told apart from one a compliance officer
// applied. Only suspensions carrying this reason are ever lifted here.
export const DEBT_SUSPENSION_REASON = 'UNSETTLED_REMITTANCE';

// Enforces the 11am settlement deadline: warns, then locks the agent out of
// selling, then releases them the moment they settle.
//
// Runs on a poll rather than a cron so that a worker restart cannot skip the
// deadline. Every action is guarded so repeated ticks are harmless.
@Injectable()
export class RemittanceDeadlineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemittanceDeadlineService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: V2nSmsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), CHECK_MS);
    void this.tick();
    this.logger.log('Remittance deadline watch started (every 5m)');
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private watMinutes(now: Date): number {
    const wat = new Date(now.getTime() + WAT_OFFSET_MS);
    return wat.getUTCHours() * 60 + wat.getUTCMinutes();
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Release first: an agent who has just settled should be selling again
      // before anything else is considered, including on the same tick that
      // would otherwise lock someone else.
      await this.releaseSettled();

      const minutes = this.watMinutes(new Date());
      if (minutes >= DEADLINE_MINUTES_WAT) {
        await this.lockOverdue();
      } else if (minutes >= WARNING_MINUTES_WAT) {
        await this.warnDueToday();
      }
    } catch (error) {
      this.logger.error(
        `Deadline watch failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }

  // ── 09:00 — warn, once per remittance ────────────────────────────────
  private async warnDueToday(): Promise<void> {
    const due = await this.prisma.remittance.findMany({
      where: {
        status: RemittanceStatus.PENDING,
        amountDueNgn: { gt: 0 },
        deadlineWarnedAt: null,
      },
      select: {
        remittanceId: true,
        amountDueNgn: true,
        periodDate: true,
        agent: { select: { agentCode: true, phoneNumber: true } },
      },
      take: 200,
    });

    for (const r of due) {
      // Stamped before sending: a duplicate warning is a worse failure than
      // a missed one, since agents treat repeat alerts as noise.
      const claimed = await this.prisma.remittance.updateMany({
        where: { remittanceId: r.remittanceId, deadlineWarnedAt: null },
        data: { deadlineWarnedAt: new Date() },
      });
      if (claimed.count === 0) continue;

      await this.sms.sendSms(
        r.agent.phoneNumber,
        remittanceDueWarning({
          amountNgn: r.amountDueNgn,
          periodDate: r.periodDate,
        }),
        `rem-warn-${r.remittanceId}`,
      );
    }

    if (due.length > 0) {
      this.logger.log(`Deadline warnings sent: ${due.length}`);
    }
  }

  // ── 11:00 — lock out ─────────────────────────────────────────────────
  private async lockOverdue(): Promise<void> {
    const overdue = await this.prisma.remittance.findMany({
      where: {
        status: RemittanceStatus.PENDING,
        amountDueNgn: { gt: 0 },
      },
      select: {
        remittanceId: true,
        amountDueNgn: true,
        periodDate: true,
        agentId: true,
        agent: {
          select: { agentCode: true, phoneNumber: true, status: true },
        },
      },
      take: 200,
    });

    for (const r of overdue) {
      // The record is LATE regardless of what happens to the agent — an
      // agent already suspended for something else still owes the money.
      await this.prisma.remittance.updateMany({
        where: { remittanceId: r.remittanceId, status: RemittanceStatus.PENDING },
        data: { status: RemittanceStatus.LATE },
      });

      // Only an ACTIVE agent is locked. Someone compliance already suspended
      // is left exactly as they are, so this job never overwrites a reason
      // it is not allowed to reverse.
      const locked = await this.prisma.agent.updateMany({
        where: { agentId: r.agentId, status: AgentStatus.ACTIVE },
        data: {
          status: AgentStatus.SUSPENDED,
          suspensionReason: DEBT_SUSPENSION_REASON,
          suspendedAt: new Date(),
        },
      });
      if (locked.count === 0) continue;

      await this.prisma.auditLog.create({
        data: {
          severity: AuditSeverity.WARNING,
          actorType: AuditActorType.SYSTEM,
          action: 'AGENT_SUSPENDED_UNSETTLED_REMITTANCE',
          resourceType: 'Agent',
          resourceId: r.agentId,
          metadata: {
            agentCode: r.agent.agentCode,
            remittanceId: r.remittanceId,
            amountDueNgn: r.amountDueNgn,
            periodDate: r.periodDate.toISOString().slice(0, 10),
          },
        },
      });

      await this.sms.sendSms(
        r.agent.phoneNumber,
        remittanceOverdueLock({ amountNgn: r.amountDueNgn }),
        `rem-lock-${r.remittanceId}`,
      );

      this.logger.warn(
        `${r.agent.agentCode} suspended — NGN ${r.amountDueNgn.toLocaleString(
          'en-NG',
        )} unsettled for ${r.periodDate.toISOString().slice(0, 10)}`,
      );
    }
  }

  // ── Any time — release agents who have settled ───────────────────────
  private async releaseSettled(): Promise<void> {
    // Suspended for debt, and no longer carrying any. Confirmed by the agent
    // is enough: they are locked out of selling, which is the leverage, and
    // holding them until finance reconciles would punish them for a delay on
    // our side.
    const locked = await this.prisma.agent.findMany({
      where: {
        status: AgentStatus.SUSPENDED,
        suspensionReason: DEBT_SUSPENSION_REASON,
        remittances: {
          none: {
            status: { in: [RemittanceStatus.PENDING, RemittanceStatus.LATE] },
            amountDueNgn: { gt: 0 },
          },
        },
      },
      select: { agentId: true, agentCode: true },
      take: 200,
    });

    for (const a of locked) {
      // Guarded on the reason as well as the status: if compliance changed
      // the reason in the meantime, this must not fire.
      const released = await this.prisma.agent.updateMany({
        where: {
          agentId: a.agentId,
          status: AgentStatus.SUSPENDED,
          suspensionReason: DEBT_SUSPENSION_REASON,
        },
        data: {
          status: AgentStatus.ACTIVE,
          suspensionReason: null,
          suspendedAt: null,
        },
      });
      if (released.count === 0) continue;

      await this.prisma.auditLog.create({
        data: {
          severity: AuditSeverity.INFO,
          actorType: AuditActorType.SYSTEM,
          action: 'AGENT_REACTIVATED_REMITTANCE_SETTLED',
          resourceType: 'Agent',
          resourceId: a.agentId,
          metadata: { agentCode: a.agentCode },
        },
      });

      this.logger.log(`${a.agentCode} reactivated — remittance settled`);
    }
  }
}
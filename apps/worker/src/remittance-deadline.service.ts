import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AgentStatus,
  AuditActorType,
  AuditSeverity,
  RemittanceStatus,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { V2nSmsService } from './v2n-sms.service';
import { remittanceDueWarning } from './sms-templates';

const CHECK_MS = 5 * 60_000;
const WAT_OFFSET_MS = 60 * 60 * 1000;

// Settlement is due by 11:00 WAT the morning after a day closes. The warning
// goes out at 09:00, when sales reopen and the agent is at their terminal.
const DEADLINE_MINUTES_WAT = 11 * 60;
const WARNING_MINUTES_WAT = 9 * 60;

// Historical reason used by the retired debt-lockout model. We keep the
// literal so existing debt-only suspensions can be identified and safely
// reactivated without touching compliance/admin suspensions.
export const DEBT_SUSPENSION_REASON = 'UNSETTLED_REMITTANCE';

// Historical remittances still have a due date and can become LATE, but under
// prepaid wallet selling they no longer control whether an agent may sell.
//
// Runs on a poll rather than a cron so a worker restart cannot skip the
// deadline or the one-time cleanup of legacy debt suspensions.
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
      // Debt-based suspension is retired under prepaid selling. Clear only
      // the exact legacy reason; manual/compliance suspensions are untouched.
      await this.retireDebtSuspensions();

      const minutes = this.watMinutes(new Date());
      if (minutes >= DEADLINE_MINUTES_WAT) {
        await this.markOverdue();
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

  // ── 11:00 — mark overdue, never suspend ─────────────────────────────
  private async markOverdue(): Promise<void> {
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
          select: { agentCode: true },
        },
      },
      take: 200,
    });

    for (const r of overdue) {
      const marked = await this.prisma.remittance.updateMany({
        where: {
          remittanceId: r.remittanceId,
          status: RemittanceStatus.PENDING,
        },
        data: { status: RemittanceStatus.LATE },
      });
      if (marked.count === 0) continue;

      await this.prisma.auditLog.create({
        data: {
          severity: AuditSeverity.WARNING,
          actorType: AuditActorType.SYSTEM,
          action: 'REMITTANCE_MARKED_LATE',
          resourceType: 'Remittance',
          resourceId: r.remittanceId,
          metadata: {
            agentId: r.agentId,
            agentCode: r.agent.agentCode,
            amountDueNgn: r.amountDueNgn,
            periodDate: r.periodDate.toISOString().slice(0, 10),
            sellingBlocked: false,
            settlementModel: 'HISTORICAL_REMITTANCE',
          },
        },
      });

      this.logger.warn(
        `${r.agent.agentCode} historical remittance marked LATE — NGN ${r.amountDueNgn.toLocaleString(
          'en-NG',
        )} for ${r.periodDate.toISOString().slice(0, 10)}; prepaid selling remains available`,
      );
    }
  }

  // ── Any time — retire legacy debt-only suspensions ──────────────────
  private async retireDebtSuspensions(): Promise<void> {
    const locked = await this.prisma.agent.findMany({
      where: {
        status: AgentStatus.SUSPENDED,
        suspensionReason: DEBT_SUSPENSION_REASON,
      },
      select: {
        agentId: true,
        agentCode: true,
        remittances: {
          where: {
            status: {
              in: [
                RemittanceStatus.PENDING,
                RemittanceStatus.LATE,
              ],
            },
            amountDueNgn: { gt: 0 },
          },
          select: {
            amountDueNgn: true,
          },
        },
      },
      take: 200,
    });

    for (const a of locked) {
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

      const outstandingRemittanceNgn =
        a.remittances.reduce(
          (sum, remittance) =>
            sum + remittance.amountDueNgn,
          0,
        );

      await this.prisma.auditLog.create({
        data: {
          severity: AuditSeverity.INFO,
          actorType: AuditActorType.SYSTEM,
          action: 'AGENT_REACTIVATED_DEBT_SUSPENSION_RETIRED',
          resourceType: 'Agent',
          resourceId: a.agentId,
          metadata: {
            agentCode: a.agentCode,
            retiredReason: DEBT_SUSPENSION_REASON,
            openRemittanceCount: a.remittances.length,
            outstandingRemittanceNgn,
            remittancesPreserved: true,
            settlementModel: 'PREPAID_WALLET',
          },
        },
      });

      this.logger.log(
        `${a.agentCode} reactivated — debt-based selling suspension retired; historical remittances remain payable`,
      );
    }
  }

}

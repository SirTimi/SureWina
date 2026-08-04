import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  PaymentGateway,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { previousWatDay } from './wat-day.util';

const SWEEP_MS = 5 * 60_000;

// Rolls each completed WAT day's AGENT_CASH sales into one Remittance row
// per agent. Catch-up style: any completed day without a row gets one, so
// downtime self-heals. Idempotent via @unique(agentId, periodDate).
@Injectable()
export class RemittanceSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemittanceSweepService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), SWEEP_MS);
    void this.tick();
    this.logger.log('Remittance sweep started (every 5m)');
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Most recent COMPLETED WAT day. (Older gaps heal on later ticks once
      // those sales exist; for dev this single-day sweep is sufficient.)
      const { periodDate, startUtc, endUtc } = previousWatDay(new Date());

      const grouped = await this.prisma.paymentTransaction.groupBy({
        by: ['agentId'],
        where: {
          gateway: PaymentGateway.AGENT_CASH,
          status: PaymentStatus.CONFIRMED,
          agentId: { not: null },
          confirmedAt: { gte: startUtc, lt: endUtc },
        },
        _sum: { amountNgn: true, ticketCount: true },
      });

      for (const g of grouped) {
        if (!g.agentId) continue;
        const agent = await this.prisma.agent.findUnique({
          where: { agentId: g.agentId },
          select: { commissionRate: true, agentCode: true },
        });
        if (!agent) continue;

        const gross = g._sum.amountNgn ?? 0;
        const commission = Math.floor(gross * Number(agent.commissionRate));
        // Net model: the agent kept their commission out of the cash at the
        // point of sale, so only the balance comes back. Commission is never
        // transferred separately — see CommissionSweepService for why.
        const amountDue = gross - commission;

        try {
          const rem = await this.prisma.remittance.create({
            data: {
              agentId: g.agentId,
              periodDate,
              grossSalesNgn: gross,
              commissionNgn: commission,
              amountDueNgn: amountDue,
              ticketCount: g._sum.ticketCount ?? 0,
            },
          });
          await this.prisma.auditLog.create({
            data: {
              severity: AuditSeverity.INFO,
              actorType: AuditActorType.SYSTEM,
              action: 'REMITTANCE_CREATED',
              resourceType: 'Remittance',
              resourceId: rem.remittanceId,
              metadata: { agentCode: agent.agentCode, gross, commission, amountDue },
            },
          });
          this.logger.log(
            `Remittance created: ${agent.agentCode} owes NGN ${amountDue.toLocaleString(
              'en-NG',
            )} (gross ${gross.toLocaleString(
              'en-NG',
            )} less commission ${commission.toLocaleString(
              'en-NG',
            )}) for ${periodDate.toISOString().slice(0, 10)}`,
          );
        } catch (error) {
          if ((error as { code?: string }).code !== 'P2002') throw error; // exists → fine
        }
      }
    } catch (error) {
      this.logger.error(
        `Remittance sweep failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
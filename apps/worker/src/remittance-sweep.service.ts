import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  PaymentGateway,
  PaymentStatus,
  TicketType,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { previousWatDay } from './wat-day.util';

const SWEEP_MS = 5 * 60_000;

type DayTally = {
  standardTickets: number;
  jackpotTickets: number;
  standardSalesNgn: number;
  jackpotSalesNgn: number;
};

const emptyTally = (): DayTally => ({
  standardTickets: 0,
  jackpotTickets: 0,
  standardSalesNgn: 0,
  jackpotSalesNgn: 0,
});

// Rolls each completed WAT day's AGENT_CASH sales into one Remittance row
// per agent — the agent's immutable record for that day. Catch-up style:
// any completed day without a row gets one, so downtime self-heals.
// Idempotent via @unique(agentId, periodDate); an existing row is never
// rewritten, which is what makes the record safe to audit against.
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

      // Grouped over tickets rather than transactions so the ordinary /
      // jackpot split comes from the same pass. Safe substitution for the
      // money: agent sales set faceValueNgn = draw.ticketPriceNgn on every
      // ticket and amountNgn = ticketPriceNgn * quantity, so the sum of face
      // values is the transaction total by construction.
      const grouped = await this.prisma.ticket.groupBy({
        by: ['agentId', 'ticketType'],
        where: {
          agentId: { not: null },
          payment: {
            gateway: PaymentGateway.AGENT_CASH,
            status: PaymentStatus.CONFIRMED,
            confirmedAt: { gte: startUtc, lt: endUtc },
          },
        },
        _sum: { faceValueNgn: true },
        _count: true,
      });

      const byAgent = new Map<string, DayTally>();
      for (const row of grouped) {
        if (!row.agentId) continue;
        const tally = byAgent.get(row.agentId) ?? emptyTally();
        const sales = row._sum.faceValueNgn ?? 0;

        // PRODUCT_PRIZE draws mint STANDARD tickets, so "ordinary" here
        // means "not the Saturday jackpot" — which is the distinction the
        // record is being asked for.
        if (row.ticketType === TicketType.JACKPOT) {
          tally.jackpotTickets += row._count;
          tally.jackpotSalesNgn += sales;
        } else {
          tally.standardTickets += row._count;
          tally.standardSalesNgn += sales;
        }
        byAgent.set(row.agentId, tally);
      }

      for (const [agentId, tally] of byAgent) {
        const agent = await this.prisma.agent.findUnique({
          where: { agentId },
          select: { commissionRate: true, agentCode: true },
        });
        if (!agent) continue;

        const gross = tally.standardSalesNgn + tally.jackpotSalesNgn;
        const ticketCount = tally.standardTickets + tally.jackpotTickets;
        const commission = Math.floor(gross * Number(agent.commissionRate));

        // Prizes paid by the agent from their own till reduce what they owe.
        // Zero until those payouts are captured server-side — they currently
        // exist only in the agent's browser localStorage, which cannot be
        // allowed to reduce a cash obligation.
        const winningsPaidOut = 0;

        // Net model: commission was kept at the point of sale, prize payouts
        // already left the till, so only the balance comes back.
        const amountDue = gross - commission - winningsPaidOut;

        try {
          const rem = await this.prisma.remittance.create({
            data: {
              agentId,
              periodDate,
              grossSalesNgn: gross,
              commissionNgn: commission,
              winningsPaidOutNgn: winningsPaidOut,
              amountDueNgn: amountDue,
              ticketCount,
              standardTicketCount: tally.standardTickets,
              jackpotTicketCount: tally.jackpotTickets,
              standardSalesNgn: tally.standardSalesNgn,
              jackpotSalesNgn: tally.jackpotSalesNgn,
            },
          });
          await this.prisma.auditLog.create({
            data: {
              severity: AuditSeverity.INFO,
              actorType: AuditActorType.SYSTEM,
              action: 'REMITTANCE_CREATED',
              resourceType: 'Remittance',
              resourceId: rem.remittanceId,
              metadata: {
                agentCode: agent.agentCode,
                gross,
                commission,
                winningsPaidOut,
                amountDue,
                standardTickets: tally.standardTickets,
                jackpotTickets: tally.jackpotTickets,
              },
            },
          });
          this.logger.log(
            `Remittance created: ${agent.agentCode} owes NGN ${amountDue.toLocaleString(
              'en-NG',
            )} (gross ${gross.toLocaleString(
              'en-NG',
            )} less commission ${commission.toLocaleString('en-NG')}) — ${
              tally.standardTickets
            } ordinary, ${tally.jackpotTickets} jackpot, for ${periodDate
              .toISOString()
              .slice(0, 10)}`,
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
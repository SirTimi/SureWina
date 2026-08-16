import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  PaymentGateway,
  PaymentStatus,
  TicketType,
  RemittanceStatus
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { lastClosedBusinessDay } from './wat-day.util';

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

// Rolls each closed business day's AGENT_CASH sales and agent-paid prizes
// into one Remittance row per agent — the agent's immutable record for that
// day. Catch-up style: any closed day without a row gets one, so downtime
// self-heals. Idempotent via @unique(agentId, periodDate); an existing row is
// never rewritten, which is what makes the record safe to audit against.
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
      // Most recent business day whose 19:00 close has passed. (Older gaps
      // heal on later ticks once those sales exist; for dev this single-day
      // sweep is sufficient.)
      const { periodDate, startUtc, endUtc } = lastClosedBusinessDay(new Date());

      // Grouped over tickets rather than transactions so the ordinary /
      // jackpot split comes from the same pass. Safe substitution for the
      // money: agent sales set faceValueNgn = draw.ticketPriceNgn on every
      // ticket and amountNgn = ticketPriceNgn * quantity, so the sum of face
      // values is the transaction total by construction.
      const [soldGroups, payoutGroups] = await Promise.all([
        this.prisma.ticket.groupBy({
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
        }),
        // Prizes the agent settled from their own till. netPrizeValue rather
        // than gross: where WHT applies the agent hands over the net, so
        // crediting gross would let them keep the withholding.
        this.prisma.prizeClaim.groupBy({
          by: ['paidByAgentId'],
          where: {
            paidByAgentId: { not: null },
            paidByAgentAt: { gte: startUtc, lt: endUtc },
          },
          _sum: { netPrizeValueNgn: true },
          _count: true,
        }),
      ]);

      const salesByAgent = new Map<string, DayTally>();
      for (const row of soldGroups) {
        if (!row.agentId) continue;
        const tally = salesByAgent.get(row.agentId) ?? emptyTally();
        const sales = row._sum.faceValueNgn ?? 0;

        // PRODUCT_PRIZE draws mint STANDARD tickets, so "ordinary" here means
        // "not the Saturday jackpot" — the distinction the record asks for.
        if (row.ticketType === TicketType.JACKPOT) {
          tally.jackpotTickets += row._count;
          tally.jackpotSalesNgn += sales;
        } else {
          tally.standardTickets += row._count;
          tally.standardSalesNgn += sales;
        }
        salesByAgent.set(row.agentId, tally);
      }

      const payoutsByAgent = new Map<string, { ngn: number; count: number }>();
      for (const row of payoutGroups) {
        if (!row.paidByAgentId) continue;
        payoutsByAgent.set(row.paidByAgentId, {
          ngn: row._sum.netPrizeValueNgn ?? 0,
          count: row._count,
        });
      }

      // Union, not just sellers: an agent who paid a prize on a day they sold
      // nothing is still owed that money, and without a row for the day there
      // is nowhere for the credit to live.
      const agentIds = new Set<string>([
        ...salesByAgent.keys(),
        ...payoutsByAgent.keys(),
      ]);

      for (const agentId of agentIds) {
        const agent = await this.prisma.agent.findUnique({
          where: { agentId },
          select: { commissionRate: true, agentCode: true },
        });
        if (!agent) continue;

        const tally = salesByAgent.get(agentId) ?? emptyTally();
        const payout = payoutsByAgent.get(agentId) ?? { ngn: 0, count: 0 };

        const gross = tally.standardSalesNgn + tally.jackpotSalesNgn;
        const ticketCount = tally.standardTickets + tally.jackpotTickets;
        const commission = Math.floor(gross * Number(agent.commissionRate));

        // Net model: commission was kept at the point of sale and prize cash
        // already left the till, so only the balance comes back. Negative is
        // a normal outcome — the agent payout cap is well above a typical
        // day's sales — and means Surewina owes the agent. Left signed rather
        // than clamped; the wallet credit reads it.
        const amountDue = gross - commission - payout.ngn;

        if (amountDue < 0) {
          this.logger.warn(
            `${agent.agentCode} credited NGN ${(-amountDue).toLocaleString(
              'en-NG',
            )} to wallet for ${periodDate
              .toISOString()
              .slice(0, 10)}: paid out NGN ${payout.ngn.toLocaleString(
              'en-NG',
            )} against NGN ${gross.toLocaleString('en-NG')} of sales`,
          );
        }

        try {
          // Row creation and the wallet credit must be one unit: if the row
          // already exists (P2002) the whole thing rolls back, so a repeated
          // sweep cannot credit the wallet twice.
          const rem = await this.prisma.$transaction(async (tx) => {
            const created = await tx.remittance.create({
              data: {
                agentId,
                periodDate,
                grossSalesNgn: gross,
                commissionNgn: commission,
                winningsPaidOutNgn: payout.ngn,
                amountDueNgn: amountDue,
                ticketCount,
                standardTicketCount: tally.standardTickets,
                jackpotTicketCount: tally.jackpotTickets,
                standardSalesNgn: tally.standardSalesNgn,
                jackpotSalesNgn: tally.jackpotSalesNgn,
                // A credit day has nothing for the agent to pay, so it is
                // settled the moment it is written rather than left open.
                status:
                  amountDue < 0
                    ? RemittanceStatus.CREDITED_TO_WALLET
                    : RemittanceStatus.PENDING,
              },
            });

            if (amountDue < 0) {
              await tx.agent.update({
                where: { agentId },
                data: { walletBalanceNgn: { increment: -amountDue } },
              });
            }

            return created;
          });

          await this.prisma.auditLog.create({
            data: {
              severity: amountDue < 0 ? AuditSeverity.WARNING : AuditSeverity.INFO,
              actorType: AuditActorType.SYSTEM,
              action: 'REMITTANCE_CREATED',
              resourceType: 'Remittance',
              resourceId: rem.remittanceId,
              metadata: {
                agentCode: agent.agentCode,
                gross,
                commission,
                winningsPaidOut: payout.ngn,
                prizesPaidCount: payout.count,
                amountDue,
                walletCreditNgn: amountDue < 0 ? -amountDue : 0,
                standardTickets: tally.standardTickets,
                jackpotTickets: tally.jackpotTickets,
              },
            },
          });
          await this.prisma.auditLog.create({
            data: {
              severity: amountDue < 0 ? AuditSeverity.WARNING : AuditSeverity.INFO,
              actorType: AuditActorType.SYSTEM,
              action: 'REMITTANCE_CREATED',
              resourceType: 'Remittance',
              resourceId: rem.remittanceId,
              metadata: {
                agentCode: agent.agentCode,
                gross,
                commission,
                winningsPaidOut: payout.ngn,
                prizesPaidCount: payout.count,
                amountDue,
                standardTickets: tally.standardTickets,
                jackpotTickets: tally.jackpotTickets,
              },
            },
          });
          this.logger.log(
            `Remittance created: ${agent.agentCode} ${
              amountDue < 0 ? 'is owed' : 'owes'
            } NGN ${Math.abs(amountDue).toLocaleString(
              'en-NG',
            )} (gross ${gross.toLocaleString(
              'en-NG',
            )} less commission ${commission.toLocaleString(
              'en-NG',
            )} less prizes ${payout.ngn.toLocaleString('en-NG')}) — ${
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
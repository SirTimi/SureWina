import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  LedgerAccountPurpose,
  PaymentGateway,
  PaymentStatus,
  TicketType,
  RemittanceStatus,
  DrawType
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

// Legacy catch-up only: rolls receivable-backed AGENT_CASH sales and legacy
// agent-paid prizes into immutable Remittance rows. Current prepaid sales and
// wallet-reimbursed prizes are excluded by ledger-account linkage below.
// Catch-up style: any eligible closed day without a row gets one, so downtime
// self-heals. Idempotent via @unique(agentId, periodDate); an existing row is
// never rewritten, which is what makes the historical record safe to audit.
@Injectable()
export class RemittanceSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemittanceSweepService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), SWEEP_MS);
    void this.tick();
    this.logger.log('Legacy remittance catch-up started (every 5m)');
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

    // The daily draw's own sales cutoff, which is also when the day's record
  // seals. Read from the active template rather than a constant so an admin
  // changing the draw time moves the accounting day with it.
  //
  // Falls back to 19:00 only when no template is active — a state the
  // scheduler already warns about, and one in which there are no sales to
  // sweep anyway.
  private async closeMinutesWat(): Promise<number> {
    const template = await this.prisma.drawTemplate.findFirst({
      where: { templateType: DrawType.DAILY_STANDARD, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      select: { cutoffMinutesWat: true },
    });

    if (!template) {
      this.logger.warn(
        'No ACTIVE daily draw template — falling back to 19:00 WAT for the business day boundary',
      );
      return 19 * 60;
    }

    return template.cutoffMinutesWat;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Most recent business day whose close has passed.
      const closeMinutes = await this.closeMinutesWat();
      const { periodDate, startUtc, endUtc } = lastClosedBusinessDay(
        new Date(),
        closeMinutes,
      );

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

              /*
               * Only legacy receivable-backed sales belong in remittance.
               * Prepaid sales debit AGENT_AVAILABLE instead and are already
               * settled at the instant the ticket is issued.
               */
              collectionLedgerTxn: {
                is: {
                  entries: {
                    some: {
                      account: {
                        purpose: LedgerAccountPurpose.AGENT_RECEIVABLE,
                      },
                    },
                  },
                },
              },
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

            /*
             * New prepaid payouts reimburse the agent wallet immediately and
             * must never flow into remittance. Keep only legacy payouts that
             * either predate ledger linkage or settled through the agent
             * receivable account.
             */
            OR: [
              {
                agentPayoutLedgerTxnId: null,
              },
              {
                agentPayoutLedgerTxn: {
                  is: {
                    entries: {
                      some: {
                        account: {
                          purpose:
                            LedgerAccountPurpose.AGENT_RECEIVABLE,
                        },
                      },
                    },
                  },
                },
              },
            ],
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

      // Union, not just sellers: a legacy prize payout may still need a
      // remittance credit even when the agent had no sales that day. New
      // wallet-reimbursed payouts are excluded above.
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
                  RemittanceStatus.PENDING,
              },
            });

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
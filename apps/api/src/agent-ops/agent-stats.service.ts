import { Injectable } from '@nestjs/common';
import {
  PaymentGateway,
  PaymentStatus,
  Prisma,
  RemittanceStatus
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { isWithinSalesWindow } from '../common/sales-window.util'
const WAT_OFFSET_MS = 60 * 60 * 1000; // UTC+1, no DST

// Start of the current WAT calendar day, as a UTC Date.
function startOfWatDay(now = new Date()): Date {
  const wat = new Date(now.getTime() + WAT_OFFSET_MS);
  wat.setUTCHours(0, 0, 0, 0);
  return new Date(wat.getTime() - WAT_OFFSET_MS);
}

const DEBT_SUSPENSION_REASON = 'UNSETTLED_REMITTANCE';

function settlementDeadline(periodDate: Date): Date {
  return new Date(periodDate.getTime() + 86_400_000 + 10 * 60 * 60_000);
}

@Injectable()
export class AgentStatsService {
  constructor(private readonly prisma: PrismaService) {}

    async dashboard(agentId: string) {
    const agent = await this.prisma.agent.findUniqueOrThrow({
      where: { agentId },
      select: {
        agentCode: true,
        fullName: true,
        tier: true,
        commissionRate: true,
        status: true,
        suspensionReason: true,
        walletBalanceNgn: true,
      },
    });

    const now = new Date();
    const todayStart = startOfWatDay(now);

    const [today, prizesPaid, open] = await Promise.all([
      this.salesBetween(agentId, todayStart, now),
      // Prizes the agent has paid from their own till today reduce what they
      // will owe at close, so the live figure has to carry them.
      this.prisma.prizeClaim.aggregate({
        where: {
          paidByAgentId: agentId,
          paidByAgentAt: { gte: todayStart, lte: now },
        },
        _sum: { netPrizeValueNgn: true },
        _count: true,
      }),
      this.prisma.remittance.findMany({
        where: {
          agentId,
          status: { in: [RemittanceStatus.PENDING, RemittanceStatus.LATE] },
          amountDueNgn: { gt: 0 },
        },
        orderBy: { periodDate: 'asc' },
        select: { periodDate: true, amountDueNgn: true, status: true },
      }),
    ]);

    const commissionRate = Number(agent.commissionRate);
    const commissionNgn = Math.floor(today.grossSalesNgn * commissionRate);
    const winningsPaidOutNgn = prizesPaid._sum.netPrizeValueNgn ?? 0;

    const totalOwedNgn = open.reduce((s, r) => s + r.amountDueNgn, 0);
    const oldest = open[0] ?? null;

    return {
      agent: {
        agentCode: agent.agentCode,
        fullName: agent.fullName,
        tier: agent.tier,
        commissionRate: agent.commissionRate,
        status: agent.status,
        // Distinguishes a lockout the agent can clear themselves from a
        // compliance suspension, which they cannot.
        lockedForDebt: agent.suspensionReason === DEBT_SUSPENSION_REASON,
      },
      today: { ...today, commissionNgn, winningsPaidOutNgn },
      // The day in progress. Provisional until sales close at 19:00, at
      // which point the sweep seals it and it moves into `settlement`.
      accruing: {
        salesOpen: isWithinSalesWindow(now),
        // Same basis the sweep uses at close, so the live figure and the
        // sealed remittance agree to the naira.
        netNgn: today.grossSalesNgn - commissionNgn - winningsPaidOutNgn,
      },
      // Closed days still to be paid, plus any credit held.
      settlement: {
        totalOwedNgn,
        walletBalanceNgn: agent.walletBalanceNgn,
        openCount: open.length,
        oldest: oldest
          ? {
              periodDate: oldest.periodDate.toISOString().slice(0, 10),
              amountDueNgn: oldest.amountDueNgn,
              status: oldest.status,
              deadlineAt: settlementDeadline(oldest.periodDate).toISOString(),
              overdue: oldest.status === RemittanceStatus.LATE,
            }
          : null,
      },
    };
  }

  async sales(agentId: string, page = 1, pageSize = 20) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.findMany({
        where: this.saleWhere(agentId),
        orderBy: { confirmedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          gatewayReference: true,
          amountNgn: true,
          ticketCount: true,
          buyerPhone: true,
          confirmedAt: true,
        },
      }),
      this.prisma.paymentTransaction.count({ where: this.saleWhere(agentId) }),
    ]);

    return {
      sales: rows.map((r) => ({
        saleReference: r.gatewayReference,
        amountNgn: r.amountNgn,
        ticketCount: r.ticketCount,
        buyerPhone: r.buyerPhone,
        soldAt: r.confirmedAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async performance(agentId: string) {
    const now = new Date();
    const todayStart = startOfWatDay(now);
    const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000);
    const monthStart = new Date(todayStart.getTime() - 29 * 86_400_000);

    const [today, week, month, allTime] = await Promise.all([
      this.salesBetween(agentId, todayStart, now),
      this.salesBetween(agentId, weekStart, now),
      this.salesBetween(agentId, monthStart, now),
      this.salesBetween(agentId, new Date(0), now),
    ]);

    return { today, week, month, allTime };
  }

  // ─── helpers ──────────────────────────────────────────────

  private saleWhere(
    agentId: string,
    from?: Date,
    to?: Date,
  ): Prisma.PaymentTransactionWhereInput {
    return {
      agentId,
      gateway: PaymentGateway.AGENT_CASH,
      status: PaymentStatus.CONFIRMED,
      ...(from || to ? { confirmedAt: { gte: from, lte: to } } : {}),
    };
  }

  private async salesBetween(agentId: string, from: Date, to: Date) {
    const agg = await this.prisma.paymentTransaction.aggregate({
      where: this.saleWhere(agentId, from, to),
      _sum: { amountNgn: true, ticketCount: true },
      _count: true,
    });
    return {
      grossSalesNgn: agg._sum.amountNgn ?? 0,
      ticketsSold: agg._sum.ticketCount ?? 0,
      saleCount: agg._count,
    };
  }
}
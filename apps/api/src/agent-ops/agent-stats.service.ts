import { Injectable } from '@nestjs/common';
import {
  PaymentGateway,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const WAT_OFFSET_MS = 60 * 60 * 1000; // UTC+1, no DST

// Start of the current WAT calendar day, as a UTC Date.
function startOfWatDay(now = new Date()): Date {
  const wat = new Date(now.getTime() + WAT_OFFSET_MS);
  wat.setUTCHours(0, 0, 0, 0);
  return new Date(wat.getTime() - WAT_OFFSET_MS);
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
      },
    });

    const todayStart = startOfWatDay();
    const today = await this.salesBetween(agentId, todayStart, new Date());

    const commissionRate = Number(agent.commissionRate);
    const commissionNgn = Math.floor(today.grossSalesNgn * commissionRate);

    return {
      agent,
      today: { ...today, commissionNgn },
      // Net model: the agent has already taken commission out of the cash in
      // hand, so what they owe is the balance. Computed on the day's total
      // gross — the same basis the sweep uses when the day closes, so the
      // live figure and the settled remittance agree to the naira.
      remittance: {
        owedNgn: today.grossSalesNgn - commissionNgn,
        status: 'ACCRUING',
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
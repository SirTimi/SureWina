import { Injectable } from '@nestjs/common';
import {
  DrawStatus,
  PaymentGateway,
  PaymentStatus,
  PrizeClaimStatus,
  PurchaseChannel,
  RemittanceStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const WAT_OFFSET_MS = 60 * 60 * 1000;

function startOfWatDay(now = new Date()): Date {
  const wat = new Date(now.getTime() + WAT_OFFSET_MS);
  wat.setUTCHours(0, 0, 0, 0);
  return new Date(wat.getTime() - WAT_OFFSET_MS);
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const todayStart = startOfWatDay();

    const [direct, agent, drawCounts, claimGroups, remOutstanding, commOpen] =
      await Promise.all([
        // Today's confirmed direct (gateway) sales
        this.prisma.paymentTransaction.aggregate({
          where: {
            status: PaymentStatus.CONFIRMED,
            channel: PurchaseChannel.DIRECT,
            confirmedAt: { gte: todayStart },
          },
          _sum: { amountNgn: true, ticketCount: true },
          _count: true,
        }),
        // Today's confirmed agent cash sales
        this.prisma.paymentTransaction.aggregate({
          where: {
            status: PaymentStatus.CONFIRMED,
            gateway: PaymentGateway.AGENT_CASH,
            confirmedAt: { gte: todayStart },
          },
          _sum: { amountNgn: true, ticketCount: true },
          _count: true,
        }),
        this.prisma.draw.groupBy({ by: ['status'], _count: true }),
        this.prisma.prizeClaim.groupBy({ by: ['status'], _count: true }),
        this.prisma.remittance.aggregate({
          where: {
            status: {
              in: [
                RemittanceStatus.PENDING,
                RemittanceStatus.AGENT_CONFIRMED,
                RemittanceStatus.LATE,
              ],
            },
          },
          _sum: { amountDueNgn: true },
          _count: true,
        }),
        // Net model: commission is retained by the agent at the point of
        // sale, so nothing is ever pending disbursement. The figure that
        // pairs with outstanding remittance is the commission already kept
        // on those same open periods — the two sum to gross sales for the
        // periods concerned.
        this.prisma.remittance.aggregate({
          where: {
            status: {
              in: [
                RemittanceStatus.PENDING,
                RemittanceStatus.AGENT_CONFIRMED,
                RemittanceStatus.LATE,
              ],
            },
          },
          _sum: { commissionNgn: true },
          _count: true,
        }),
      ]);

    const toCount = (groups: { status: string; _count: number }[]) =>
      Object.fromEntries(groups.map((g) => [g.status, g._count]));

    return {
      asOf: new Date().toISOString(),
      today: {
        direct: {
          salesNgn: direct._sum.amountNgn ?? 0,
          tickets: direct._sum.ticketCount ?? 0,
          transactions: direct._count,
        },
        agent: {
          salesNgn: agent._sum.amountNgn ?? 0,
          tickets: agent._sum.ticketCount ?? 0,
          transactions: agent._count,
        },
        totalSalesNgn: (direct._sum.amountNgn ?? 0) + (agent._sum.amountNgn ?? 0),
      },
      draws: toCount(drawCounts as never),
      claims: toCount(claimGroups as never),
      remittance: {
        outstandingNgn: remOutstanding._sum.amountDueNgn ?? 0,
        openCount: remOutstanding._count,
      },
      commission: {
        retainedNgn: commOpen._sum.commissionNgn ?? 0,
        periodCount: commOpen._count,
      },
      // Claims awaiting compliance action — the number that should be zero
      // at end of each business day.
      actionRequired: {
        kycPendingReview:
          (claimGroups as { status: string; _count: number }[]).find(
            (g) => g.status === PrizeClaimStatus.KYC_PENDING,
          )?._count ?? 0,
        activeDraws:
          (drawCounts as { status: string; _count: number }[]).find(
            (g) => g.status === DrawStatus.ACTIVE,
          )?._count ?? 0,
      },
    };
  }

  // The jackpot has no monetary fund: a fixed template prize, paid direct
  // entries, and free entries earned via 10-for-1 accumulation. This is the
  // visibility view of that entries system.
  async jackpotOverview() {
    const draws = await this.prisma.draw.findMany({
      where: {
        drawType: 'SATURDAY_JACKPOT',
        status: { in: ['SCHEDULED', 'ACTIVE'] },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 4,
      select: { drawId: true, drawCode: true, scheduledAt: true, status: true, prizeValueNgn: true, ticketPriceNgn: true },
    });

    const perDraw = await Promise.all(
      draws.map(async (d) => {
        const bySource = await this.prisma.jackpotEntry.groupBy({
          by: ['source'],
          where: { drawId: d.drawId, status: 'ACTIVE' },
          _count: true,
        });
        const counts = Object.fromEntries(bySource.map((s) => [s.source, s._count]));
        return {
          drawId: d.drawId,
          drawCode: d.drawCode,
          scheduledAt: d.scheduledAt.toISOString(),
          status: d.status,
          prizeValueNgn: d.prizeValueNgn,
          ticketPriceNgn: d.ticketPriceNgn,
          entries: {
            direct: counts['DIRECT_PURCHASE'] ?? 0,
            accumulated: counts['ACCUMULATION'] ?? 0,
            total: bySource.reduce((s, r) => s + r._count, 0),
          },
        };
      }),
    );

    const [accumAgg, nearThreshold] = await Promise.all([
      this.prisma.jackpotAccumulation.aggregate({
        _count: true,
        _sum: { cumulativeCount: true, jackpotEntriesTotal: true },
      }),
      this.prisma.jackpotAccumulation.findMany({
        where: { cumulativeCount: { gte: 7 } },
        orderBy: { cumulativeCount: 'desc' },
        take: 10,
        select: { buyerPhone: true, cumulativeCount: true, jackpotEntriesTotal: true, lastTicketAt: true },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      upcomingDraws: perDraw,
      accumulation: {
        participants: accumAgg._count,
        totalEntriesEarned: accumAgg._sum.jackpotEntriesTotal ?? 0,
        ticketsCounted: accumAgg._sum.cumulativeCount ?? 0,
        nearThreshold: nearThreshold.map((n) => ({
          buyerPhone: n.buyerPhone,
          progress: n.cumulativeCount % 10,
          entriesEarned: n.jackpotEntriesTotal,
          lastTicketAt: n.lastTicketAt.toISOString(),
        })),
      },
    };
  }
}
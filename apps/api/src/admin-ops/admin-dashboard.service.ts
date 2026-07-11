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

    const [direct, agent, drawCounts, claimGroups, remOutstanding, commPending] =
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
        this.prisma.commissionDisbursement.aggregate({
          where: { status: 'PENDING' },
          _sum: { amountNgn: true },
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
        pendingNgn: commPending._sum.amountNgn ?? 0,
        pendingCount: commPending._count,
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
}
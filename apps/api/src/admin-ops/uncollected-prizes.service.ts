import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, RetainedPrizeKind } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

export type UncollectedPrizesQuery = {
  fromDate?: string;
  toDate?: string;
  kind?: RetainedPrizeKind;
  page?: number;
};

const PAGE_SIZE = 100;

// The uncollected prizes ledger: prize money that stays with the company,
// with the date it was recorded.
//
//   ROUNDING   the part of a pool too small for one more whole winner
//   UNAWARDED  prizes the pool allowed but there were not enough entries for
//   UNCLAIMED  a winner's prize forfeited after the claim deadline
//
// Rows are written by the draw engine (rounding, unawarded) and the claims
// sweep (unclaimed). Nothing here can change them.
@Injectable()
export class UncollectedPrizesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: UncollectedPrizesQuery) {
    const where: Prisma.RetainedPrizeWhereInput = {};
    const recordedAt = range(q.fromDate, q.toDate);
    if (recordedAt) where.recordedAt = recordedAt;
    if (q.kind) where.kind = q.kind;

    const page = Math.max(1, q.page ?? 1);

    const [rows, total, byKind] = await Promise.all([
      this.prisma.retainedPrize.findMany({
        where,
        orderBy: [{ recordedAt: 'desc' }, { retainedId: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          draw: {
            select: {
              drawId: true,
              drawCode: true,
              scheduledAt: true,
              prizeTiers: { select: { tierNo: true, name: true } },
            },
          },
        },
      }),
      this.prisma.retainedPrize.count({ where }),
      this.prisma.retainedPrize.groupBy({
        by: ['kind'],
        where,
        _sum: { amountNgn: true },
        _count: { _all: true },
      }),
    ]);

    // Unclaimed rows: the claim they came from.
    const claimIds = rows.map((r) => r.claimId).filter((id): id is string => !!id);
    const claims = claimIds.length
      ? await this.prisma.prizeClaim.findMany({
          where: { claimId: { in: claimIds } },
          select: {
            claimId: true,
            winnerTicketRef: true,
            winnerPhone: true,
            claimDeadlineAt: true,
            drawWinner: { select: { tierName: true, prizeDescription: true } },
          },
        })
      : [];
    const claimById = new Map(claims.map((c) => [c.claimId, c]));

    const totals = Object.fromEntries(
      Object.values(RetainedPrizeKind).map((k) => {
        const g = byKind.find((x) => x.kind === k);
        return [k, { count: g?._count._all ?? 0, amountNgn: g?._sum.amountNgn ?? 0 }];
      }),
    ) as Record<RetainedPrizeKind, { count: number; amountNgn: number }>;

    return {
      rows: rows.map((r) => {
        const claim = r.claimId ? claimById.get(r.claimId) : undefined;
        const tierName =
          claim?.drawWinner?.tierName ??
          (r.tierNo != null ? r.draw.prizeTiers.find((t) => t.tierNo === r.tierNo)?.name ?? `Tier ${r.tierNo}` : null);
        return {
          retainedId: r.retainedId,
          recordedAt: r.recordedAt.toISOString(),
          kind: r.kind,
          amountNgn: r.amountNgn,
          drawId: r.draw.drawId,
          drawCode: r.draw.drawCode,
          drawDate: r.draw.scheduledAt.toISOString(),
          tierName,
          note: r.note,
          claim: claim
            ? {
                claimId: claim.claimId,
                winnerTicketRef: claim.winnerTicketRef,
                winnerPhone: maskPhone(claim.winnerPhone),
                claimDeadlineAt: claim.claimDeadlineAt.toISOString(),
                prizeDescription: claim.drawWinner?.prizeDescription ?? null,
              }
            : null,
        };
      }),
      totals: {
        ...totals,
        all: {
          count: total,
          amountNgn: Object.values(totals).reduce((s, t) => s + t.amountNgn, 0),
        },
      },
      page,
      pageSize: PAGE_SIZE,
      total,
    };
  }
}

function range(fromDate?: string, toDate?: string): Prisma.DateTimeFilter | undefined {
  if (!fromDate && !toDate) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (fromDate) {
    const from = new Date(fromDate);
    if (Number.isNaN(from.getTime())) throw new BadRequestException('Invalid fromDate');
    filter.gte = from;
  }
  if (toDate) {
    const to = new Date(toDate);
    if (Number.isNaN(to.getTime())) throw new BadRequestException('Invalid toDate');
    // A bare date means the whole of that day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(toDate)) to.setUTCHours(23, 59, 59, 999);
    filter.lte = to;
  }
  return filter;
}

function maskPhone(phone: string): string {
  return phone.length > 7 ? `${phone.slice(0, 6)}****${phone.slice(-3)}` : '****';
}

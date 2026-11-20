import { Injectable } from '@nestjs/common';
import { PrizeClaimStatus, TicketStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async recent() {
    const [results, totalWinnersAllTime, paid] = await Promise.all([
      this.prisma.drawResult.findMany({
        orderBy: { executedAt: 'desc' },
        take: 8,
        include: { draw: { select: { drawCode: true, drawType: true, prizeDescription: true } } },
      }),
      // Pool and stage draws have many winners each.
      this.prisma.drawResult.aggregate({ _sum: { totalWinners: true } }),
      this.prisma.prizeClaim.aggregate({
        where: {
          status: { in: [PrizeClaimStatus.CASH_PAID, PrizeClaimStatus.DELIVERED] },
        },
        _sum: { grossPrizeValueNgn: true },
      }),
    ]);

    // Winner's state comes off the winning ticket; free-entry winners have
    // no ticket, so fall back to 'NA'.
    const recentWinners = await Promise.all(
      results.map(async (r) => {
        const winningTicket = await this.prisma.ticket.findFirst({
          where: { ticketRef: r.winnerTicketRef, status: TicketStatus.WINNING },
          select: { stateOfPlayCode: true },
        });
        return {
          drawDate: r.executedAt.toISOString(),
          drawType: r.draw.drawType,
          prizeValueNgn: r.prizeValueNgn,
          prizeDescription: r.draw.prizeDescription,
          winnerStateCode: winningTicket?.stateOfPlayCode ?? 'NA',
          winnerTicketRef: r.winnerTicketRef,
          drawCode: r.draw.drawCode,
          totalWinners: r.totalWinners,
        };
      }),
    );

    return {
      recentWinners,
      totalWinnersAllTime: totalWinnersAllTime._sum.totalWinners ?? 0,
      totalPrizesPaidNgn: paid._sum.grossPrizeValueNgn ?? 0,
    };
  }
}
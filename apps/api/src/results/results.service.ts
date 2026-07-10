import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DrawStatus, Prisma, DrawType, JackpotEntryStatus, TicketStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ListResultsQueryDto } from './dto/list-results-query.dto';
import {
  GetResultDetailResponseDto,
  ListPastResultsResponseDto,
  toDrawResultPublic,
} from './results.types';

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPast(
    query: ListResultsQueryDto,
  ): Promise<ListPastResultsResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    // Filter on the related Draw where drawType is specified, and on the
    // result's own executedAt for the date range.
    const where: Prisma.DrawResultWhereInput = {};

    if (query.drawType) {
      where.draw = { drawType: query.drawType };
    }

    const executedAt = this.buildDateRange(query.fromDate, query.toDate);
    if (executedAt) {
      where.executedAt = executedAt;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.drawResult.findMany({
        where,
        include: { draw: true },
        orderBy: { executedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.drawResult.count({ where }),
    ]);

    return {
      results: rows.map(toDrawResultPublic),
      total,
      page,
      pageSize,
    };
  }

  async getByDrawCode(drawCode: string): Promise<GetResultDetailResponseDto> {
    const draw = await this.prisma.draw.findUnique({
      where: { drawCode },
      include: { result: true },
    });

    // Only surface results for draws that actually completed. A cancelled or
    // still-scheduled draw has no public result.
    if (!draw || !draw.result || draw.status !== DrawStatus.COMPLETED) {
      throw new NotFoundException('Result not found');
    }

    const resultWithDraw = { ...draw.result, draw };

    return {
      result: toDrawResultPublic(resultWithDraw),
      drawDescription: draw.prizeDescription,
      prizeImageUrl: draw.prizeImageUrl,
    };
  }

  private buildDateRange(
    fromDate?: string,
    toDate?: string,
  ): Prisma.DateTimeFilter | undefined {
    if (!fromDate && !toDate) {
      return undefined;
    }

    const filter: Prisma.DateTimeFilter = {};

    if (fromDate) {
      const from = new Date(fromDate);
      if (Number.isNaN(from.getTime())) {
        throw new BadRequestException('Invalid fromDate');
      }
      filter.gte = from;
    }

    if (toDate) {
      const to = new Date(toDate);
      if (Number.isNaN(to.getTime())) {
        throw new BadRequestException('Invalid toDate');
      }
      filter.lte = to;
    }

    return filter;
  }

  // Full public evidence bundle for a completed draw: revealed seed, Merkle
  // root, the exact eligible pool, and the engine's signature. Everything an
  // independent party needs to recompute the winner — see packages/verify.
  async getVerification(drawCode: string) {
    const draw = await this.prisma.draw.findUnique({
      where: { drawCode },
      include: { result: true },
    });

    if (!draw || !draw.result || draw.status !== DrawStatus.COMPLETED) {
      throw new NotFoundException('Verification data not available');
    }

    // Reconstruct the pool exactly as the engine locked it: tickets that
    // were ACTIVE at lock time (the winner is WINNING now), ordered by
    // ticketRef; for jackpots, free entries appended, ordered by entryId.
    const tickets = await this.prisma.ticket.findMany({
      where: {
        drawId: draw.drawId,
        status: { in: [TicketStatus.ACTIVE, TicketStatus.WINNING] },
      },
      orderBy: { ticketRef: 'asc' },
      select: { ticketRef: true },
    });

    const pool: string[] = tickets.map((t) => t.ticketRef);

    if (draw.drawType === DrawType.SATURDAY_JACKPOT) {
      const entries = await this.prisma.jackpotEntry.findMany({
        where: {
          drawId: draw.drawId,
          status: { in: [JackpotEntryStatus.ACTIVE, JackpotEntryStatus.WINNING] },
        },
        orderBy: { entryId: 'asc' },
        select: { entryId: true },
      });
      pool.push(...entries.map((e) => `ENTRY-${e.entryId}`));
    }

    const r = draw.result;
    return {
      drawId: draw.drawId,
      drawCode: draw.drawCode,
      winnerTicketRef: r.winnerTicketRef,
      prizeValueNgn: r.prizeValueNgn,
      totalTicketsSold: r.totalTicketsSold,
      totalEligibleParticipants: r.totalEligibleParticipants,
      rngSeedHash: r.rngSeedHash,
      rngSeed: r.rngSeed,
      merkleRoot: r.merkleRoot,
      engineVersion: r.engineVersion,
      engineSignature: r.engineSignature,
      executedAt: r.executedAt.toISOString(),
      seedCommittedAt: r.rngSeedHashedAt.toISOString(),
      pool,
    };
  }
}
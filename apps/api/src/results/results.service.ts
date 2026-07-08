import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DrawStatus, Prisma } from '@prisma/client';
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
}
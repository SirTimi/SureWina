import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TicketStatus, TicketType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DrawStatus, Prisma } from '@prisma/client'
export type TicketPublicDto = {
  ticketRef: string;
  drawCode: string;
  ticketType: TicketType;
  faceValueNgn: number;
  stateOfPlayCode: string;
  status: TicketStatus;
  isWinner: boolean;
  createdAt: string;
};

export type LookupTicketResponseDto = {
  ticket: TicketPublicDto;
  isWinner: boolean;
  claimUrl: string | null;
};

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async lookup(ticketRefRaw: string): Promise<LookupTicketResponseDto> {
    // Refs are generated uppercase; accept any case from the user.
    const ticketRef = ticketRefRaw.toUpperCase();

    const ticket = await this.prisma.ticket.findUnique({
      where: { ticketRef },
      include: { draw: { select: { drawCode: true } } },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Winners get a link to their claim (created by the worker on draw
    // completion). Losing or not-yet-drawn tickets get null.
    let claimUrl: string | null = null;
    if (ticket.isWinner) {
      const claim = await this.prisma.prizeClaim.findFirst({
        where: { winnerTicketRef: ticket.ticketRef },
        select: { claimId: true },
      });
      if (claim) {
        const webBase =
          this.config.get<string>('PUBLIC_WEB_BASE_URL') ??
          'http://localhost:3000';
        claimUrl = `${webBase}/claim/${claim.claimId}`;
      }
    }

    return {
      ticket: {
        ticketRef: ticket.ticketRef,
        drawCode: ticket.draw.drawCode,
        ticketType: ticket.ticketType,
        faceValueNgn: ticket.faceValueNgn,
        stateOfPlayCode: ticket.stateOfPlayCode,
        status: ticket.status,
        isWinner: ticket.isWinner,
        createdAt: ticket.createdAt.toISOString(),
      },
      isWinner: ticket.isWinner,
      claimUrl,
    };


  }

  async listMine(
    phoneNumber: string,
    filter: 'active' | 'past' | 'all' = 'all',
    page = 1,
    pageSize = 20,
  ) {
    // "Active" = the draw hasn't resolved yet; "past" = it has.
    const unresolvedDraw = {
      status: { in: [DrawStatus.SCHEDULED, DrawStatus.ACTIVE, DrawStatus.SALES_CLOSED, DrawStatus.EXECUTING] },
    };
    const where: Prisma.TicketWhereInput = {
      buyerPhone: phoneNumber,
      ...(filter === 'active' ? { draw: unresolvedDraw } : {}),
      ...(filter === 'past' ? { draw: { status: { in: [DrawStatus.COMPLETED, DrawStatus.CANCELLED] } } } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include: {
          draw: {
            select: { drawCode: true, drawType: true, prizeDescription: true, scheduledAt: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      tickets: rows.map((t) => ({
        ticketRef: t.ticketRef,
        drawCode: t.draw.drawCode,
        drawType: t.draw.drawType,
        drawPrizeDescription: t.draw.prizeDescription,
        ticketType: t.ticketType,
        faceValueNgn: t.faceValueNgn,
        stateOfPlayCode: t.stateOfPlayCode,
        status: t.status,
        isWinner: t.isWinner,
        drawScheduledAt: t.draw.scheduledAt.toISOString(),
        awaitingDraw: t.draw.status !== DrawStatus.COMPLETED && t.draw.status !== DrawStatus.CANCELLED,
        createdAt: t.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }
}
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TicketStatus, TicketType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

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
        claimUrl = `${webBase}/claims/${claim.claimId}`;
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
}
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Ticket, TicketStatus, TicketType } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

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
      // Claims arrive in Phase 8; until then winners see isWinner=true with
      // no claim link. The shape is contract-stable for the frontend swap.
      claimUrl: null,
    };
  }
}
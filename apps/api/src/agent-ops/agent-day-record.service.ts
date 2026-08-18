import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentGateway, PaymentStatus, TicketType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { businessDayBounds } from '../common/sales-window.util';

// The line-by-line backing for one agent's daily record: every ticket they
// sold and every prize they paid on that business day.
//
// Shared by the agent's own view and finance's, so both sides of a dispute
// are looking at the same rows. The window comes from businessDayBounds, the
// same 19:00-to-19:00 boundary the sweep seals on — anything else and the
// lines would not add up to the sealed totals.
@Injectable()
export class AgentDayRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async dayRecord(agentId: string, periodDate: string) {
    const { startUtc, endUtc } = businessDayBounds(periodDate);

    const [agent, sealed, tickets, prizes] = await Promise.all([
      this.prisma.agent.findUnique({
        where: { agentId },
        select: { agentCode: true, fullName: true, phoneNumber: true },
      }),
      // The sealed figures for the day, if it has closed. Null while the day
      // is still open — the lines below are then a live view.
      this.prisma.remittance.findFirst({
        where: { agentId, periodDate: new Date(periodDate) },
        select: {
          remittanceId: true,
          ticketCount: true,
          standardTicketCount: true,
          jackpotTicketCount: true,
          grossSalesNgn: true,
          standardSalesNgn: true,
          jackpotSalesNgn: true,
          commissionNgn: true,
          winningsPaidOutNgn: true,
          amountDueNgn: true,
          status: true,
        },
      }),
      this.prisma.ticket.findMany({
        where: {
          agentId,
          payment: {
            gateway: PaymentGateway.AGENT_CASH,
            status: PaymentStatus.CONFIRMED,
            confirmedAt: { gte: startUtc, lt: endUtc },
          },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          ticketRef: true,
          ticketType: true,
          faceValueNgn: true,
          buyerPhone: true,
          status: true,
          isWinner: true,
          createdAt: true,
          draw: { select: { drawCode: true, drawNumber: true } },
        },
      }),
      this.prisma.prizeClaim.findMany({
        where: {
          paidByAgentId: agentId,
          paidByAgentAt: { gte: startUtc, lt: endUtc },
        },
        orderBy: { paidByAgentAt: 'asc' },
        select: {
          claimId: true,
          winnerTicketRef: true,
          winnerPhone: true,
          grossPrizeValueNgn: true,
          whtAmountNgn: true,
          netPrizeValueNgn: true,
          payoutReference: true,
          paidByAgentAt: true,
        },
      }),
    ]);

    if (!agent) throw new NotFoundException('Agent not found');

    const ticketRows = tickets.map((t) => ({
      ticketRef: t.ticketRef,
      ticketType: t.ticketType,
      drawCode: t.draw.drawCode,
      drawNumber: t.draw.drawNumber,
      faceValueNgn: t.faceValueNgn,
      buyerPhone: t.buyerPhone,
      status: t.status,
      isWinner: t.isWinner,
      soldAt: t.createdAt.toISOString(),
    }));

    const prizeRows = prizes.map((p) => ({
      claimId: p.claimId,
      winnerTicketRef: p.winnerTicketRef,
      winnerPhone: p.winnerPhone,
      grossPrizeValueNgn: p.grossPrizeValueNgn,
      whtAmountNgn: p.whtAmountNgn,
      netPrizeValueNgn: p.netPrizeValueNgn,
      payoutReference: p.payoutReference,
      paidAt: p.paidByAgentAt?.toISOString() ?? null,
    }));

    const lineTotals = {
      ticketCount: ticketRows.length,
      standardTicketCount: ticketRows.filter((t) => t.ticketType === TicketType.STANDARD).length,
      jackpotTicketCount: ticketRows.filter((t) => t.ticketType === TicketType.JACKPOT).length,
      grossSalesNgn: ticketRows.reduce((s, t) => s + t.faceValueNgn, 0),
      prizesPaidCount: prizeRows.length,
      winningsPaidOutNgn: prizeRows.reduce((s, p) => s + p.netPrizeValueNgn, 0),
    };

    return {
      agent,
      periodDate,
      windowStartUtc: startUtc.toISOString(),
      windowEndUtc: endUtc.toISOString(),
      sealed,
      tickets: ticketRows,
      prizesPaid: prizeRows,
      lineTotals,
      // The point of the drill-down: do the lines still add up to the figures
      // the day was sealed with? They will differ if a ticket was voided
      // after close — the sealed record is deliberately never rewritten, so
      // the discrepancy has to be visible rather than silently reconciled.
      reconciles: sealed
        ? sealed.ticketCount === lineTotals.ticketCount &&
          sealed.grossSalesNgn === lineTotals.grossSalesNgn &&
          sealed.winningsPaidOutNgn === lineTotals.winningsPaidOutNgn
        : null,
    };
  }
}
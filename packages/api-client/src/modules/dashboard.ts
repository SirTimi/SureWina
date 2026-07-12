import type {
  DashboardSummary,
  GetTicketDetailResponse,
  ListMyClaimsResponse,
  ListMyTicketsRequest,
  ListMyTicketsResponse,
  UserMe,
} from '@surewina/types';
import type { ApiClient } from '../client.js';

type BackendClaim = {
  claimId: string; winnerTicketRef: string; drawCode: string;
  prizeDescription: string; status: string; claimType: 'PRODUCT' | 'CASH' | null;
  grossPrizeValueNgn: number; whtAmountNgn: number; netPrizeValueNgn: number;
  selectionDeadlineAt: string; claimDeadlineAt: string; createdAt: string;
};

export class DashboardModule {
  constructor(private readonly client: ApiClient) {}

  private async fetchClaims(): Promise<BackendClaim[]> {
    const res = await this.client.get<{ claims: BackendClaim[] }>('/claims');
    return res.claims;
  }

  async getSummary(): Promise<DashboardSummary> {
    // Composed from real endpoints; no dedicated summary API needed.
    const [user, mine, claims] = await Promise.all([
      this.client.get<UserMe>('/auth/me'),
      this.client.get<ListMyTicketsResponse>('/tickets/mine', {
        query: { filter: 'all', pageSize: 100 },
      }),
      this.fetchClaims(),
    ]);

    const tickets = mine.tickets;
    const activeTickets = tickets.filter((t) => t.awaitingDraw);
    const dailyStandardCount = tickets.filter((t) => t.ticketType === 'STANDARD').length;

    const byDraw = new Map<string, typeof activeTickets>();
    for (const t of activeTickets) {
      const list = byDraw.get(t.drawCode) ?? [];
      list.push(t);
      byDraw.set(t.drawCode, list);
    }
    const activeDrawGroups = Array.from(byDraw.entries())
      .map(([drawCode, group]) => ({
        drawCode,
        drawType: group[0].drawType,
        drawPrizeDescription: group[0].drawPrizeDescription,
        drawScheduledAt: group[0].drawScheduledAt,
        ticketCount: group.length,
        ticketRefs: group.map((t) => t.ticketRef),
        awaitingDraw: true,
      }))
      .sort((a, b) => a.drawScheduledAt.localeCompare(b.drawScheduledAt));

    // Mirrors the backend 10-for-1 rule over lifetime daily tickets.
    const cumulativeCount = dailyStandardCount;
    const freeEntries = Math.floor(cumulativeCount / 10);
    const ticketsToNextEntry = cumulativeCount % 10 === 0 ? 10 : 10 - (cumulativeCount % 10);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const totalSpentMonthlyNgn = tickets
      .filter((t) => new Date(t.createdAt) >= monthStart)
      .reduce((sum, t) => sum + t.faceValueNgn, 0);

    const wins = claims.filter((c) => c.status === 'DELIVERED' || c.status === 'CASH_PAID');
    const lifetimeWinningsNgn = wins.reduce((s, c) => s + c.netPrizeValueNgn, 0);
    const lastWinAt = wins.length > 0 ? wins[0].createdAt : null;

    return {
      user,
      activeTicketCount: activeTickets.length,
      activeDrawGroups,
      jackpot: { freeEntries, cumulativeCount, ticketsToNextEntry },
      totalSpentMonthlyNgn,
      monthlyLimitNgn: user.spendLimit?.capNgn ?? null,
      lifetimeWinningsNgn,
      lifetimeWinCount: wins.length,
      lastWinAt,
    } as DashboardSummary;
  }

  async listMyTickets(req: ListMyTicketsRequest = {}): Promise<ListMyTicketsResponse> {
    return this.client.get<ListMyTicketsResponse>('/tickets/mine', {
      query: { filter: req.filter, page: req.page, pageSize: req.pageSize },
    });
  }

  async getTicketDetail(ticketRef: string): Promise<GetTicketDetailResponse> {
    // Composed: my tickets (for the ticket + siblings), public draw detail,
    // and my claims (for a claimId if this ref won).
    const mine = await this.client.get<ListMyTicketsResponse>('/tickets/mine', {
      query: { filter: 'all', pageSize: 100 },
    });
    const ticket = mine.tickets.find((t) => t.ticketRef === ticketRef);
    if (!ticket) throw new Error(`Ticket not found: ${ticketRef}`);

    const siblingTickets = mine.tickets
      .filter((t) => t.drawCode === ticket.drawCode && t.ticketRef !== ticketRef)
      .map((t) => t.ticketRef);

    const drawRes = await this.client
      .get<{ draw: GetTicketDetailResponse['draw'] }>(
        `/draws/${encodeURIComponent(ticket.drawCode)}`, { skipAuth: true })
      .catch(() => null);

    let claimId: string | null = null;
    if (ticket.isWinner) {
      const claims = await this.fetchClaims();
      claimId = claims.find((c) => c.winnerTicketRef === ticketRef)?.claimId ?? null;
    }

    return {
      ticket,
      draw: drawRes?.draw ?? {
        drawCode: ticket.drawCode,
        drawType: ticket.drawType,
        status: ticket.awaitingDraw ? 'ACTIVE' : 'COMPLETED',
        prizeDescription: ticket.drawPrizeDescription,
        prizeValueNgn: 0,
        prizeImageUrl: null,
        ticketPriceNgn: ticket.faceValueNgn,
        scheduledAt: ticket.drawScheduledAt,
        cutoffAt: ticket.drawScheduledAt,
      },
      siblingTickets,
      claimId,
    } as GetTicketDetailResponse;
  }

  async listMyClaims(): Promise<ListMyClaimsResponse> {
    const claims = await this.fetchClaims();
    return {
      claims: claims.map((c) => ({
        claimId: c.claimId,
        ticketRef: c.winnerTicketRef,
        drawCode: c.drawCode,
        drawType: c.drawCode.includes('JACKPOT')
          ? ('SATURDAY_JACKPOT' as const)
          : ('DAILY_STANDARD' as const),
        prizeDescription: c.prizeDescription,
        status: c.status,
        claimType: c.claimType,
        grossPrizeValueNgn: c.grossPrizeValueNgn,
        whtAmountNgn: c.whtAmountNgn,
        netPrizeValueNgn: c.netPrizeValueNgn,
        selectionDeadlineAt: c.selectionDeadlineAt,
        claimDeadlineAt: c.claimDeadlineAt,
        drawDate: c.createdAt,
      })),
    } as ListMyClaimsResponse;
  }
}
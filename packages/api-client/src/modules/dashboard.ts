import type {
  DashboardSummary,
  GetTicketDetailResponse,
  ListMyClaimsResponse,
  ListMyTicketsRequest,
  ListMyTicketsResponse,
  UserMe,
} from '@surewina/types';
import type { ApiClient } from '../client.js';
import {
  MOCK_ACTIVE_DRAWS,
  MOCK_DASHBOARD_CLAIMS,
  MOCK_DASHBOARD_TICKETS,
  MOCK_USER_ME,
} from './mock-data.js';
import type { AccountModule } from './account.js';

export class DashboardModule {
  private accountModule?: AccountModule;

  constructor(private readonly client: ApiClient) {}

  _setAccountModule(account: AccountModule): void {
    this.accountModule = account;
  }

  private getCurrentUser(): UserMe {
    return this.accountModule ? this.accountModule.getCurrentMockState() : { ...MOCK_USER_ME };
  }

  async getSummary(): Promise<DashboardSummary> {
    const user = this.getCurrentUser();
    const activeTickets = MOCK_DASHBOARD_TICKETS.filter((t) => t.awaitingDraw);
    const dailyStandardCount = activeTickets.filter(
      (t) => t.ticketType === 'STANDARD',
    ).length;

    const byDraw = new Map<string, typeof activeTickets>();
    for (const t of activeTickets) {
      const list = byDraw.get(t.drawCode) ?? [];
      list.push(t);
      byDraw.set(t.drawCode, list);
    }

    const activeDrawGroups = Array.from(byDraw.entries())
      .map(([drawCode, tickets]) => ({
        drawCode,
        drawType: tickets[0].drawType,
        drawPrizeDescription: tickets[0].drawPrizeDescription,
        drawScheduledAt: tickets[0].drawScheduledAt,
        ticketCount: tickets.length,
        ticketRefs: tickets.map((t) => t.ticketRef),
        awaitingDraw: tickets[0].awaitingDraw,
      }))
      .sort((a, b) => a.drawScheduledAt.localeCompare(b.drawScheduledAt));

    const cumulativeCount = dailyStandardCount;
    const freeEntries = Math.floor(cumulativeCount / 10);
    const ticketsToNextEntry = cumulativeCount % 10 === 0 ? 10 : 10 - (cumulativeCount % 10);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const totalSpentMonthlyNgn = MOCK_DASHBOARD_TICKETS
      .filter((t) => new Date(t.createdAt) >= monthStart)
      .reduce((sum, t) => sum + t.faceValueNgn, 0);

    const wins = MOCK_DASHBOARD_CLAIMS.filter(
      (c) => c.status === 'DELIVERED' || c.status === 'CASH_PAID',
    );
    const lifetimeWinningsNgn = wins.reduce((sum, c) => sum + c.netPrizeValueNgn, 0);
    const lastWinAt = wins.length > 0 ? wins[0].drawDate : null;

    return Promise.resolve({
      user,
      activeTicketCount: activeTickets.length,
      activeDrawGroups,
      jackpot: { freeEntries, cumulativeCount, ticketsToNextEntry },
      totalSpentMonthlyNgn,
      monthlyLimitNgn: user.spendLimit?.capNgn ?? null,
      lifetimeWinningsNgn,
      lifetimeWinCount: wins.length,
      lastWinAt,
    });
  }

  async listMyTickets(req?: ListMyTicketsRequest): Promise<ListMyTicketsResponse> {
    const filter = req?.filter ?? 'all';
    const page = req?.page ?? 1;
    const pageSize = req?.pageSize ?? 20;

    let tickets = [...MOCK_DASHBOARD_TICKETS];
    if (filter === 'active') tickets = tickets.filter((t) => t.awaitingDraw);
    if (filter === 'past') tickets = tickets.filter((t) => !t.awaitingDraw);

    tickets.sort((a, b) => b.drawScheduledAt.localeCompare(a.drawScheduledAt));
    const start = (page - 1) * pageSize;

    return Promise.resolve({
      tickets: tickets.slice(start, start + pageSize),
      total: tickets.length,
      page,
      pageSize,
    });
  }

  async getTicketDetail(ticketRef: string): Promise<GetTicketDetailResponse> {
    const ticket = MOCK_DASHBOARD_TICKETS.find((t) => t.ticketRef === ticketRef);
    if (!ticket) throw new Error(`Ticket not found: ${ticketRef}`);

    const draw = MOCK_ACTIVE_DRAWS.find((d) => d.drawCode === ticket.drawCode);
    const siblings = MOCK_DASHBOARD_TICKETS
      .filter((t) => t.drawCode === ticket.drawCode && t.ticketRef !== ticketRef)
      .map((t) => t.ticketRef);

    const claim = MOCK_DASHBOARD_CLAIMS.find((c) => c.ticketRef === ticketRef);

    return Promise.resolve({
      ticket,
      draw: draw ?? {
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
      siblingTickets: siblings,
      claimId: claim?.claimId ?? null,
    });
  }

  async listMyClaims(): Promise<ListMyClaimsResponse> {
    return Promise.resolve({ claims: [...MOCK_DASHBOARD_CLAIMS] });
  }
}
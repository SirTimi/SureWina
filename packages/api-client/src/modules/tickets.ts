import type {
  ConfirmPurchaseResponse,
  InitiatePurchaseRequest,
  InitiatePurchaseResponse,
  LookupTicketRequest,
  LookupTicketResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';
import {
  getFreeJackpotEntriesFromRegularTickets,
  getTicketsToNextFreeJackpotEntry,
} from '@surewina/types';

export class TicketsModule {
  constructor(private readonly client: ApiClient) {}

  async lookup(req: LookupTicketRequest): Promise<LookupTicketResponse> {
    return this.client.post<LookupTicketResponse>(
      '/tickets/lookup',
      { ticketRef: req.ticketRef },
      { skipAuth: true },
    );
  }

  // ─────────────────────────────────────────────────────────────
  // STAGE B (still mocked): purchase flow.
  // Known contract drift to resolve when un-mocking:
  //  - backend initiate returns { authorizationUrl, reference, txnId,
  //    amountNgn }, not { purchaseSessionId, redirectUrl, ... }
  //  - backend has no confirm/status endpoint yet; confirmation happens via
  //    webhook. Stage B adds GET /tickets/purchase/status?reference=... and
  //    this module polls it after Paystack redirects back.
  // ─────────────────────────────────────────────────────────────

  async initiatePurchase(req: InitiatePurchaseRequest): Promise<InitiatePurchaseResponse> {
    // STAGE B: replace with this.client.post('/tickets/purchase/initiate', ...)
    const total = req.quantity * (req.drawCode.includes('JACKPOT') ? 5000 : 500);
    const sessionId = `ps_${Math.random().toString(36).slice(2, 11)}`;
    return Promise.resolve({
      purchaseSessionId: sessionId,
      totalNgn: total,
      redirectUrl: `/draws/${req.drawCode}/buy/processing?session=${sessionId}&qty=${req.quantity}&phone=${encodeURIComponent(req.phoneE164)}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  }

  async confirmPurchase(sessionId: string, drawCode: string, quantity: number, phoneE164: string): Promise<ConfirmPurchaseResponse> {
    // STAGE B: replace with a status poll against the real backend.
    const isJackpot = drawCode.includes('JACKPOT');
    const ticketPrice = isJackpot ? 5000 : 500;
    const today = new Date();

    const ticketRefs = Array.from({ length: quantity }, (_, i) => {
      const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
      const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
                     String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
                     String(Math.floor(Math.random() * 99)).padStart(2, '0');
      return `SW-${seq.slice(0, 2)}${suffix.slice(0, 2)}-${suffix.slice(2)}${String(i).padStart(2, '0')}`;
    });

    const previousRegularTicketCount = isJackpot ? 0 : 7;
    const newRegularTicketCount = isJackpot
      ? 0
      : previousRegularTicketCount + quantity;

    const newEntries = isJackpot
      ? 0
      : getFreeJackpotEntriesFromRegularTickets(newRegularTicketCount) -
        getFreeJackpotEntriesFromRegularTickets(previousRegularTicketCount);

    const ticketsToNext = isJackpot
      ? 0
      : getTicketsToNextFreeJackpotEntry(newRegularTicketCount);

    const drawScheduled = new Date();
    drawScheduled.setHours(20, 0, 0, 0);
    if (drawScheduled < today) drawScheduled.setDate(drawScheduled.getDate() + 1);

    return Promise.resolve({
      success: true,
      ticketRefs,
      drawCode,
      drawScheduledAt: drawScheduled.toISOString(),
      drawPrizeDescription: isJackpot ? 'Sure Jackpot' : 'Today’s Surewina draw',
      totalPaidNgn: quantity * ticketPrice,
      buyerPhoneE164: phoneE164,
      jackpotAccumulation: {
        cumulativeCount: newRegularTicketCount,
        ticketsToNextEntry: ticketsToNext,
        newJackpotEntries: newEntries,
      },
    });
  }
}
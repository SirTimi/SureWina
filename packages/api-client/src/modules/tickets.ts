import type {
  ConfirmPurchaseResponse,
  InitiatePurchaseRequest,
  InitiatePurchaseResponse,
  LookupTicketRequest,
  LookupTicketResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';
import { MOCK_TICKET_BY_REF } from './mock-data.js';

export class TicketsModule {
  constructor(private readonly client: ApiClient) {}

  async lookup(req: LookupTicketRequest): Promise<LookupTicketResponse> {
    // TODO Phase 6+: return this.client.post('/tickets/lookup', req);
    const ticket = MOCK_TICKET_BY_REF[req.ticketRef.toUpperCase()];
    if (!ticket) throw new Error(`Ticket not found: ${req.ticketRef}`);
    return Promise.resolve(ticket);
  }

  async initiatePurchase(req: InitiatePurchaseRequest): Promise<InitiatePurchaseResponse> {
    // TODO Phase 6+: return this.client.post('/tickets/purchase', req);
    const total = req.quantity * (req.drawCode.includes('JACKPOT') ? 5000 : 500);
    const sessionId = `ps_${Math.random().toString(36).slice(2, 11)}`;
    return Promise.resolve({
      purchaseSessionId: sessionId,
      totalNgn: total,
      // Mock gateway redirect — in real life this is a Paystack/Flutterwave URL
      redirectUrl: `/draws/${req.drawCode}/buy/processing?session=${sessionId}&qty=${req.quantity}&phone=${encodeURIComponent(req.phoneE164)}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  }

  async confirmPurchase(sessionId: string, drawCode: string, quantity: number, phoneE164: string): Promise<ConfirmPurchaseResponse> {
    // TODO Phase 6+: real call returns based on actual session
    const isJackpot = drawCode.includes('JACKPOT');
    const ticketPrice = isJackpot ? 5000 : 500;
    const today = new Date();
    const yyyymmdd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    const ticketRefs = Array.from({ length: quantity }, (_, i) => {
      const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
      const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
                     String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
                     String(Math.floor(Math.random() * 99)).padStart(2, '0');
      return `SW-${seq.slice(0, 2)}${suffix.slice(0, 2)}-${suffix.slice(2)}${String(i).padStart(2, '0')}`;
    });

    // Calculate jackpot accumulation — pretend they had 7 already, now have 7+quantity
    const previousCount = 7;
    const newTotal = previousCount + quantity;
    const newEntries = Math.floor(newTotal / 10) - Math.floor(previousCount / 10);
    const ticketsToNext = 10 - (newTotal % 10);

    const drawScheduled = new Date();
    drawScheduled.setHours(20, 0, 0, 0);
    if (drawScheduled < today) drawScheduled.setDate(drawScheduled.getDate() + 1);

    return Promise.resolve({
      success: true,
      ticketRefs,
      drawCode,
      drawScheduledAt: drawScheduled.toISOString(),
      drawPrizeDescription: isJackpot ? 'Saturday ₦4M jackpot' : 'Samsung Galaxy A55 5G',
      totalPaidNgn: quantity * ticketPrice,
      buyerPhoneE164: phoneE164,
      jackpotAccumulation: {
        cumulativeCount: newTotal,
        ticketsToNextEntry: ticketsToNext === 10 ? 0 : ticketsToNext,
        newJackpotEntries: newEntries,
      },
    });
  }
}
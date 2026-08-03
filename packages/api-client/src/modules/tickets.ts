import type {
  ConfirmPurchaseResponse,
  InitiatePurchaseRequest,
  InitiatePurchaseResponse,
  LookupTicketRequest,
  LookupTicketResponse,
} from '@surewina/types';
import type { ApiClient } from '../client.js';

export interface TicketReceipt {
  terminal: string;
  drawNumber: string;
  drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT';
  scheduledAt: string;
  cutoffAt: string;
  soldAt: string;
  ticketPriceNgn: number;
  amountNgn: number;
  tickets: string[];
  buyerPhone: string;
}

export class TicketsModule {
  constructor(private readonly client: ApiClient) {}

  async lookup(req: LookupTicketRequest): Promise<LookupTicketResponse> {
    return this.client.post<LookupTicketResponse>(
      '/tickets/lookup',
      { ticketRef: req.ticketRef },
      { skipAuth: true },
    );
  }

  async initiatePurchase(
    req: InitiatePurchaseRequest,
  ): Promise<InitiatePurchaseResponse> {
    // Explicit field mapping: backend whitelist rejects unknown fields, and
    // paymentMethod is chosen on Paystack's checkout page, not ours.
    const res = await this.client.post<{
      authorizationUrl: string;
      reference: string;
      txnId: string;
      amountNgn: number;
    }>(
      '/tickets/purchase/initiate',
      {
        drawCode: req.drawCode,
        quantity: req.quantity,
        phoneE164: req.phoneE164,
        stateOfPlayCode: req.stateOfPlayCode,
      },
      { skipAuth: true },
    );

    return {
      purchaseSessionId: res.reference,
      totalNgn: res.amountNgn,
      redirectUrl: res.authorizationUrl, // real Paystack checkout URL
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }

  async confirmPurchase(
    sessionId: string,
    _drawCode: string,
    _quantity: number,
    _phoneE164: string,
  ): Promise<ConfirmPurchaseResponse> {
    // Poll the backend status endpoint. Verify-on-return server-side means
    // a completed Paystack payment confirms within a poll or two.
    const POLL_MS = 2500;
    const MAX_POLLS = 24; // ~60s

    for (let i = 0; i < MAX_POLLS; i++) {
      const s = await this.client.get<{
        status: 'PENDING' | 'CONFIRMED' | 'FAILED';
        ticketRefs: string[];
        drawCode: string | null;
        drawScheduledAt: string | null;
        drawPrizeDescription: string | null;
        totalPaidNgn: number;
        buyerPhoneE164: string;
        jackpotAccumulation: {
          cumulativeCount: number;
          ticketsToNextEntry: number;
          newJackpotEntries: number;
        } | null;
      }>('/tickets/purchase/status', {
        skipAuth: true,
        query: { reference: sessionId },
      });

      if (s.status === 'CONFIRMED') {
        return {
          success: true,
          ticketRefs: s.ticketRefs,
          drawCode: s.drawCode ?? _drawCode,
          drawScheduledAt: s.drawScheduledAt ?? new Date().toISOString(),
          drawPrizeDescription: s.drawPrizeDescription ?? '',
          totalPaidNgn: s.totalPaidNgn,
          buyerPhoneE164: s.buyerPhoneE164,
          jackpotAccumulation: s.jackpotAccumulation ?? {
            cumulativeCount: 0,
            ticketsToNextEntry: 10,
            newJackpotEntries: 0,
          },
        };
      }
      if (s.status === 'FAILED') {
        throw new Error('Payment failed');
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }

    throw new Error('Payment confirmation timed out — check your tickets shortly');
  }

  // Public: the signed token in the path is the credential, so no auth header.
  async receipt(token: string): Promise<TicketReceipt> {
    return this.client.get(`/tickets/receipt/${encodeURIComponent(token)}`, {
      skipAuth: true,
    });
  }
}
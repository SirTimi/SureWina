import type {
  CurrentJackpotOffersResponse,
  JackpotOfferView,
  JackpotWeeklyProgress,
  PromotionalJackpotPaystackPurchaseInput,
  PromotionalJackpotWalletPurchaseInput,
} from '@surewina/types';
import type { ApiClient } from '../client.js';
import type { WalletTicketPurchaseResponse } from './wallet.js';

export interface PromotionalJackpotPaystackPurchaseResponse {
  authorizationUrl: string;
  reference: string;
  txnId: string;
  amountNgn: number;
}

export class JackpotOffersModule {
  constructor(private readonly client: ApiClient) {}

  progress(): Promise<JackpotWeeklyProgress> {
    return this.client.get<JackpotWeeklyProgress>(
      '/jackpot-offers/progress',
    );
  }

  current(): Promise<CurrentJackpotOffersResponse> {
    return this.client.get<CurrentJackpotOffersResponse>(
      '/jackpot-offers/current',
    );
  }

  get(offerId: string): Promise<JackpotOfferView> {
    return this.client.get<JackpotOfferView>(
      `/jackpot-offers/${offerId}`,
    );
  }

  claim(offerId: string): Promise<JackpotOfferView> {
    return this.client.post<JackpotOfferView>(
      `/jackpot-offers/${offerId}/claim`,
    );
  }

  release(offerId: string): Promise<JackpotOfferView> {
    return this.client.post<JackpotOfferView>(
      `/jackpot-offers/${offerId}/release`,
    );
  }

  decline(offerId: string): Promise<JackpotOfferView> {
    return this.client.post<JackpotOfferView>(
      `/jackpot-offers/${offerId}/decline`,
    );
  }

  declineFromPurchase(
    offerId: string,
    reference: string,
  ): Promise<{ status: 'DECLINED' }> {
    return this.client.post<{ status: 'DECLINED' }>(
      `/jackpot-offers/${offerId}/decline-from-purchase`,
      { reference },
      { skipAuth: true },
    );
  }

  purchaseWithPaystack(
    offerId: string,
    input: PromotionalJackpotPaystackPurchaseInput,
  ): Promise<PromotionalJackpotPaystackPurchaseResponse> {
    return this.client.post<PromotionalJackpotPaystackPurchaseResponse>(
      `/jackpot-offers/${offerId}/purchase/paystack`,
      input,
    );
  }

  purchaseWithWallet(
    offerId: string,
    input: PromotionalJackpotWalletPurchaseInput,
  ): Promise<WalletTicketPurchaseResponse> {
    return this.client.post<WalletTicketPurchaseResponse>(
      `/jackpot-offers/${offerId}/purchase/wallet`,
      input,
    );
  }
}

import type {
  CurrentJackpotOffersResponse,
  JackpotOfferView,
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

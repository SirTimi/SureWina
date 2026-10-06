import type {
  CurrentJackpotOffersResponse,
  JackpotOfferView,
} from '@surewina/types';
import type { ApiClient } from '../client.js';

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
}

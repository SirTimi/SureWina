export type JackpotDiscountOfferStatus =
  | 'AVAILABLE'
  | 'CLAIMING'
  | 'CLAIMED'
  | 'DECLINED'
  | 'EXPIRED';

export interface JackpotDiscountOfferSummary {
  offerId: string;
  jackpotDrawId: string;
  thresholdNumber: number;
  regularTicketsAtUnlock: number;
  originalPriceNgn: number;
  offerPriceNgn: number;
  status: JackpotDiscountOfferStatus;
  issuedAt: string;
  expiresAt: string;
}

export interface JackpotOfferUnlockResult {
  accumId: string;
  buyerPhone: string;
  offersUnlocked: number;
  latestOffer: JackpotDiscountOfferSummary | null;
  weeklyTicketCount: number;
  ticketsToNextOffer: number;
  jackpotDrawId: string;
  jackpotDrawCode: string;
  jackpotScheduledAt: string;
}

export interface JackpotOfferView extends JackpotDiscountOfferSummary {
  jackpotDrawCode: string;
  jackpotScheduledAt: string;
  claimingAt: string | null;
  reservationExpiresAt: string | null;
  claimedAt: string | null;
  declinedAt: string | null;
}

export interface CurrentJackpotOffersResponse {
  offers: JackpotOfferView[];
}

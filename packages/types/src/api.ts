import type { DrawPublic, DrawResultPublic } from './draws.js';
import type { TicketPublic } from './tickets.js';
import type { UserPublic } from './identity.js';

export interface ListActiveDrawsResponse {
  draws: DrawPublic[];
}

export interface GetDrawResponse {
  draw: DrawPublic;
  ticketsSold: number;
  prizePoolNgn: number;
  jackpotEligible: boolean;
}

export interface ListPastResultsRequest {
  page?: number;
  pageSize?: number;
  drawType?: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT' | 'PRODUCT_PRIZE';
  fromDate?: string;
  toDate?: string;
}

export interface ListPastResultsResponse {
  results: DrawResultPublic[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GetResultDetailResponse {
  result: DrawResultPublic;
  drawDescription: string;
  prizeImageUrl: string | null;
}

export interface LookupTicketRequest {
  ticketRef: string;
}

export interface LookupTicketResponse {
  ticket: TicketPublic;
  isWinner: boolean;
  claimUrl: string | null;
}

export interface RecentWinnerStat {
  drawDate: string;
  drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT' | 'PRODUCT_PRIZE';
  prizeValueNgn: number;
  prizeDescription: string;
  winnerStateCode: string;
  winnerTicketRef: string;
}

export interface RecentStatsResponse {
  recentWinners: RecentWinnerStat[];
  totalWinnersAllTime: number;
  totalPrizesPaidNgn: number;
}

export type PaymentMethod = 'CARD' | 'TRANSFER' | 'USSD' | 'OPAY';

export interface InitiatePurchaseRequest {
  drawCode: string;
  quantity: number;
  phoneE164: string;
  stateOfPlayCode: string;
  paymentMethod: PaymentMethod;
}

export interface InitiatePurchaseResponse {
  purchaseSessionId: string;
  totalNgn: number;
  redirectUrl: string;
  expiresAt: string;
}

export interface ConfirmPurchaseResponse {
  success: boolean;
  ticketRefs: string[];
  drawCode: string;
  drawScheduledAt: string;
  drawPrizeDescription: string;
  totalPaidNgn: number;
  buyerPhoneE164: string;
  jackpotAccumulation: {
    cumulativeCount: number;
    ticketsToNextEntry: number;
    newJackpotEntries: number;
  };
}

// === Auth ===

export interface RequestOtpRequest {
  phoneE164: string;
}

export interface RequestOtpResponse {
  /** Opaque session key the verify call needs. */
  challengeId: string;
  /** Where to send the OTP. Always 'SMS' for customers in v1. */
  channel: 'SMS';
  /** UTC ISO timestamp after which the OTP expires. */
  expiresAt: string;
  /** Mock-only: in real life this comes via SMS. Helps testing. */
  mockOtp?: string;
}

export interface VerifyOtpRequest {
  challengeId: string;
  otp: string;
}

export interface VerifyOtpResponse {
  user: UserPublic;
  /** Short-lived access token (JWT in real life). */
  accessToken: string;
  /** Long-lived refresh token (httpOnly cookie in real life). */
  refreshToken: string;
  /** True if this was the user's first sign-in (account just created). */
  isNewUser: boolean;
}
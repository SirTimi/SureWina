import type { DrawPublic, DrawResultPublic, DrawType } from './draws.js';
import type { TicketPublic, TicketStatus, TicketType } from './tickets.js';
import type { UserMe, UserPublic } from './identity.js';
import type { ClaimType, PrizeClaimStatus } from './prizes.js';

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
  challengeId: string;
  channel: 'SMS';
  expiresAt: string;
  mockOtp?: string;
}

export interface VerifyOtpRequest {
  challengeId: string;
  otp: string;
}

export interface VerifyOtpResponse {
  user: UserPublic;
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
}

// === Dashboard ===

/** Detailed ticket view used in dashboard lists. */
export interface DashboardTicket {
  ticketRef: string;
  drawCode: string;
  drawType: DrawType;
  drawPrizeDescription: string;
  ticketType: TicketType;
  faceValueNgn: number;
  stateOfPlayCode: string;
  status: TicketStatus;
  isWinner: boolean;
  drawScheduledAt: string;
  /** True if drawScheduledAt is in the future. */
  awaitingDraw: boolean;
  /** ISO timestamp of purchase. */
  createdAt: string;
}

/** Group of tickets for the same draw. */
export interface DashboardDrawGroup {
  drawCode: string;
  drawType: DrawType;
  drawPrizeDescription: string;
  drawScheduledAt: string;
  ticketCount: number;
  ticketRefs: string[];
  awaitingDraw: boolean;
}

export interface DashboardSummary {
  user: UserMe;
  activeTicketCount: number;
  activeDrawGroups: DashboardDrawGroup[];
  jackpot: {
    freeEntries: number;
    cumulativeCount: number;
    ticketsToNextEntry: number;
  };
  totalSpentMonthlyNgn: number;
  monthlyLimitNgn: number | null;
  lifetimeWinningsNgn: number;
  lifetimeWinCount: number;
  lastWinAt: string | null;
}

export interface DashboardClaim {
  claimId: string;
  drawCode: string;
  drawType: DrawType;
  prizeDescription: string;
  ticketRef: string;
  grossPrizeValueNgn: number;
  netPrizeValueNgn: number;
  whtAmountNgn: number;
  claimType: ClaimType | null;
  status: PrizeClaimStatus;
  selectionDeadlineAt: string;
  claimDeadlineAt: string;
  fulfilledAt: string | null;
  drawDate: string;
}

export interface ListMyTicketsRequest {
  filter?: 'active' | 'past' | 'all';
  page?: number;
  pageSize?: number;
}

export interface ListMyTicketsResponse {
  tickets: DashboardTicket[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GetTicketDetailResponse {
  ticket: DashboardTicket;
  draw: DrawPublic;
  /** Other tickets the user holds for the same draw. */
  siblingTickets: string[];
  /** If past + winner, link to claim. */
  claimId: string | null;
}

export interface ListMyClaimsResponse {
  claims: DashboardClaim[];
}
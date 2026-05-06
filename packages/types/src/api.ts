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
  awaitingDraw: boolean;
  createdAt: string;
}

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
  siblingTickets: string[];
  claimId: string | null;
}

export interface ListMyClaimsResponse {
  claims: DashboardClaim[];
}

// === Account ===

export interface UpdateProfileRequest {
  displayName?: string | null;
  email?: string | null;
}

export interface UpdateNotificationPreferencesRequest {
  sms?: boolean;
  push?: boolean;
  email?: boolean;
}

export interface UpdateBankAccountRequest {
  bankCode: string;
  accountNumber: string;
}

export interface UpdateBankAccountResponse {
  bankAccount: {
    bankName: string;
    accountNumber: string; // last-4 only
    accountName: string;
  };
}

export interface UpdateSpendLimitRequest {
  period: 'WEEKLY' | 'MONTHLY';
  capNgn: number;
}

export interface RemoveSpendLimitRequest {
  // Empty body — confirms removal intent.
  reason?: string;
}

export interface RequestBreakRequest {
  duration: '7d' | '30d' | '6mo' | 'permanent';
  reason?: string;
}

export interface RequestBreakResponse {
  selfExclusionUntil: string | null; // null if permanent
}

// === Winner / Claim ===

export interface WinnerNotification {
  claimId: string;
  ticketRef: string;
  drawCode: string;
  drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT' | 'PRODUCT_PRIZE';
  prizeDescription: string;
  prizeImageUrl: string | null;
  grossPrizeValueNgn: number;
  drawnAt: string;
  /** Public RNG seed hash (committed before draw). */
  seedHash: string;
  /** Revealed seed (post-draw). */
  seedReveal: string | null;
  /** UTC ISO timestamp of the selection deadline (typically draw + 7 days). */
  selectionDeadlineAt: string;
  /** Last 4 digits of the phone we'll call. */
  buyerPhoneLast4: string;
}

export interface GetWinnerNotificationResponse {
  notification: WinnerNotification;
}

// === Live draw ===

export interface LiveDrawState {
  drawCode: string;
  drawType: 'DAILY_STANDARD' | 'SATURDAY_JACKPOT' | 'PRODUCT_PRIZE';
  prizeDescription: string;
  prizeValueNgn: number;
  /** When the draw is scheduled to execute. */
  scheduledAt: string;
  ticketsSold: number;
  seedHash: string;
  /** 'PRE_DRAW' | 'DRAWING' | 'COMPLETE' */
  phase: 'PRE_DRAW' | 'DRAWING' | 'COMPLETE';
  /** Set when phase === 'COMPLETE'. */
  winningTicketRef: string | null;
  /** Set when phase === 'COMPLETE'. */
  seedReveal: string | null;
}

export interface GetLiveDrawResponse {
  state: LiveDrawState;
}

// === Claim flow ===

export interface ClaimPath {
  claimId: string;
  ticketRef: string;
  drawCode: string;
  prizeDescription: string;
  grossPrizeValueNgn: number;
  /** WHT only applies to cash conversions over ₦10,000. */
  estimatedWhtNgn: number;
  netCashIfChosenNgn: number;
  /** True if user already chose. */
  selectionMade: boolean;
  selectedPath: 'PRODUCT' | 'CASH' | null;
  /** Selection deadline (typically draw + 7 days). */
  selectionDeadlineAt: string;
  /** 48h from selection — the user can change once. */
  changeWindowEndsAt: string | null;
  /** True if jackpot — affects T&Cs (photo-op required). */
  isJackpot: boolean;
}

export interface GetClaimPathResponse {
  claim: ClaimPath;
}

export interface ChooseClaimPathRequest {
  claimId: string;
  path: 'PRODUCT' | 'CASH';
}

export interface ChooseClaimPathResponse {
  claim: ClaimPath;
}

// === Product collection ===

export interface CollectionPoint {
  id: string;
  name: string;
  address: string;
  city: string;
  stateCode: string;
  openingHours: string;
}

export interface ListCollectionPointsRequest {
  stateCode?: string;
}

export interface ListCollectionPointsResponse {
  points: CollectionPoint[];
}

export interface BookCollectionRequest {
  claimId: string;
  collectionPointId: string;
  /** ISO date of preferred collection day. */
  preferredDate: string;
}

export interface BookCollectionResponse {
  bookingId: string;
  collectionPoint: CollectionPoint;
  scheduledAt: string;
}

// === KYC for cash conversion ===

export interface ClaimKycStatus {
  claimId: string;
  status:
    | 'NOT_STARTED'
    | 'DOCS_UPLOADED'
    | 'BVN_PENDING'
    | 'BVN_VERIFIED'
    | 'BANK_PENDING'
    | 'BANK_VERIFIED'
    | 'COMPLETE'
    | 'REJECTED';
  rejectionReason: string | null;
  bvnLast4: string | null;
  bankAccount: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  } | null;
  documentUploaded: boolean;
  selfieUploaded: boolean;
  /** Hard deadline — claim forfeits if KYC not complete. */
  kycDeadlineAt: string;
}

export interface GetClaimKycStatusResponse {
  kyc: ClaimKycStatus;
}

export interface SubmitKycDocumentRequest {
  claimId: string;
  documentType: 'NIN' | 'DRIVER_LICENCE' | 'INTERNATIONAL_PASSPORT' | 'VOTER_CARD';
  /** Mock: any base64 string is accepted. */
  documentImageBase64: string;
  selfieImageBase64: string;
}

export interface SubmitKycDocumentResponse {
  kyc: ClaimKycStatus;
}

export interface SubmitKycBvnRequest {
  claimId: string;
  bvn: string;
}

export interface SubmitKycBvnResponse {
  kyc: ClaimKycStatus;
}

export interface SubmitKycBankRequest {
  claimId: string;
  bankCode: string;
  accountNumber: string;
}

export interface SubmitKycBankResponse {
  kyc: ClaimKycStatus;
}

// === Claim status (timeline) ===

export interface ClaimStatusEvent {
  id: string;
  timestamp: string;
  label: string;
  description: string | null;
  /** Lucide icon name as string — UI maps to component. */
  iconKey: 'trophy' | 'check' | 'shield' | 'package' | 'banknote' | 'truck' | 'home' | 'clock' | 'alert';
  state: 'done' | 'current' | 'future';
}

export interface GetClaimStatusResponse {
  claimId: string;
  prizeDescription: string;
  selectedPath: 'PRODUCT' | 'CASH' | null;
  currentStatus: string;
  events: ClaimStatusEvent[];
  estimatedCompletionAt: string | null;
}
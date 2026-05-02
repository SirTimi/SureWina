import type { Timestamp, UUID, PhoneE164, NairaAmount } from './common.js';

export type ClaimType = 'PRODUCT' | 'CASH';

export type PrizeClaimStatus =
  | 'NOTIFIED'
  | 'SELECTION_MADE'
  | 'KYC_PENDING'
  | 'KYC_CLEARED'
  | 'PRODUCT_BOOKED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CASH_PAID'
  | 'FORFEITED'
  | 'REVERTED_TO_PRODUCT';

export interface PrizeClaim {
  claimId: UUID;
  drawResultId: UUID;
  winnerTicketRef: string;
  winnerPhone: PhoneE164;
  winnerUserId: UUID | null;
  claimType: ClaimType | null;
  claimTypeSelectedAt: Timestamp | null;
  status: PrizeClaimStatus;
  grossPrizeValueNgn: NairaAmount;
  whtApplicable: boolean;
  whtAmountNgn: NairaAmount;
  netPrizeValueNgn: NairaAmount;
  photoOpRequired: boolean;
  photoOpConsented: boolean;
  selectionDeadlineAt: Timestamp;
  kycDeadlineAt: Timestamp | null;
  claimDeadlineAt: Timestamp;
  contactAttempts: number;
  forfeitedAt: Timestamp | null;
  fulfilledAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PrizeClaimWinner {
  claimId: UUID;
  winnerTicketRef: string;
  winnerPhone: PhoneE164;
  drawCode: string;
  prizeDescription: string;
  grossPrizeValueNgn: NairaAmount;
  netPrizeValueNgn: NairaAmount;
  whtAmountNgn: NairaAmount;
  whtApplicable: boolean;
  claimType: ClaimType | null;
  status: PrizeClaimStatus;
  selectionDeadlineAt: Timestamp;
  kycDeadlineAt: Timestamp | null;
  claimDeadlineAt: Timestamp;
  photoOpRequired: boolean;
  canStillFlipSelection: boolean;
}
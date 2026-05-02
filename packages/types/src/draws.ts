import type { Timestamp, UUID, NairaAmount } from './common.js';

export type DrawType = 'DAILY_STANDARD' | 'SATURDAY_JACKPOT' | 'PRODUCT_PRIZE';

export type DrawStatus =
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'SALES_CLOSED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'POSTPONED'
  | 'CANCELLED';

export interface Draw {
  drawId: UUID;
  drawCode: string;
  drawType: DrawType;
  status: DrawStatus;
  prizeDescription: string;
  prizeValueNgn: NairaAmount;
  prizeImageUrl: string | null;
  ticketPriceNgn: NairaAmount;
  ticketQuota: number | null;
  scheduledAt: Timestamp;
  cutoffAt: Timestamp;
  executedAt: Timestamp | null;
  rescheduledFrom: UUID | null;
  configVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DrawPublic {
  drawCode: string;
  drawType: DrawType;
  status: DrawStatus;
  prizeDescription: string;
  prizeValueNgn: NairaAmount;
  prizeImageUrl: string | null;
  ticketPriceNgn: NairaAmount;
  scheduledAt: Timestamp;
  cutoffAt: Timestamp;
}

export type DrawStateBreakdown = Record<string, number>;

export interface DrawResult {
  resultId: UUID;
  drawId: UUID;
  winnerTicketRef: string;
  prizeValueNgn: NairaAmount;
  totalTicketsSold: number;
  totalEligibleParticipants: number;
  rngSeedHash: string;
  rngSeedHashedAt: Timestamp;
  stateBreakdown: DrawStateBreakdown;
  zeroInterventionConfirmed: boolean;
  engineVersion: string;
  executedAt: Timestamp;
}

export interface DrawResultPublic {
  drawCode: string;
  drawType: DrawType;
  prizeDescription: string;
  prizeValueNgn: NairaAmount;
  totalTicketsSold: number;
  winnerTicketRef: string;
  rngSeedHash: string;
  stateBreakdown: DrawStateBreakdown;
  executedAt: Timestamp;
}
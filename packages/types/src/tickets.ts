import type {
  Timestamp,
  UUID,
  PhoneE164,
  StateCode,
  NairaAmount,
  PurchaseChannel,
} from './common.js';

export type TicketType = 'STANDARD' | 'JACKPOT';

export type TicketStatus = 'ACTIVE' | 'EXPIRED' | 'WINNING' | 'ROLLED_OVER';

export interface Ticket {
  ticketId: UUID;
  ticketRef: string;
  drawId: UUID;
  ticketType: TicketType;
  faceValueNgn: NairaAmount;
  buyerPhone: PhoneE164;
  buyerUserId: UUID | null;
  agentId: UUID | null;
  purchaseChannel: PurchaseChannel;
  stateOfPlayCode: StateCode;
  paymentTxnId: UUID;
  status: TicketStatus;
  isWinner: boolean;
  drawResultId: UUID | null;
  rolledToDrawId: UUID | null;
  confirmationSmsSentAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TicketPublic {
  ticketRef: string;
  drawCode: string;
  ticketType: TicketType;
  faceValueNgn: NairaAmount;
  stateOfPlayCode: StateCode;
  status: TicketStatus;
  isWinner: boolean;
  createdAt: Timestamp;
}

export interface JackpotAccumulation {
  accumId: UUID;
  buyerPhone: PhoneE164;
  buyerUserId: UUID | null;
  cumulativeCount: number;
  jackpotEntriesTotal: number;
  lastTicketAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type JackpotEntrySource = 'ACCUMULATION' | 'DIRECT_PURCHASE';
export type JackpotEntryStatus = 'ACTIVE' | 'WINNING' | 'EXPIRED';

export interface JackpotEntry {
  entryId: UUID;
  drawId: UUID;
  source: JackpotEntrySource;
  sourceTicketId: UUID | null;
  sourceAccumId: UUID | null;
  buyerPhone: PhoneE164;
  buyerUserId: UUID | null;
  status: JackpotEntryStatus;
  createdAt: Timestamp;
}
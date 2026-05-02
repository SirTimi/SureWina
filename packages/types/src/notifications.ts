import type { Timestamp, UUID, PhoneE164 } from './common.js';

export type NotificationChannel = 'PUSH' | 'SMS' | 'EMAIL' | 'WHATSAPP';

export type NotificationType =
  | 'TICKET_CONFIRMATION'
  | 'JACKPOT_ENTRY_GENERATED'
  | 'WINNER_ALERT'
  | 'NO_WIN_RESULT'
  | 'REMITTANCE_REMINDER'
  | 'REMITTANCE_CONFIRMATION'
  | 'COMMISSION_DISBURSEMENT'
  | 'KYC_REMINDER'
  | 'TIER_UPGRADE'
  | 'PRIZE_CLAIM_REMINDER'
  | 'JACKPOT_FUND_ALERT';

export type NotificationStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'BOUNCED';

export interface NotificationLogEntry {
  logId: UUID;
  type: NotificationType;
  channel: NotificationChannel;
  recipientPhone: PhoneE164 | null;
  recipientEmail: string | null;
  recipientUserId: UUID | null;
  recipientAgentId: UUID | null;
  referenceId: UUID;
  referenceType: string;
  templateId: string;
  messageContent: string;
  status: NotificationStatus;
  failureReason: string | null;
  retryCount: number;
  queuedAt: Timestamp;
  sentAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  failedAt: Timestamp | null;
}
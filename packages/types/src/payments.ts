import type { Timestamp, UUID, PhoneE164, NairaAmount, PurchaseChannel } from './common.js';

export type PaymentGateway = 'PAYSTACK' | 'FLUTTERWAVE';

export type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'DUPLICATE' | 'REFUNDED';

export interface PaymentTransaction {
  txnId: UUID;
  gatewayReference: string;
  gateway: PaymentGateway;
  amountNgn: NairaAmount;
  buyerPhone: PhoneE164;
  buyerUserId: UUID | null;
  channel: PurchaseChannel;
  agentId: UUID | null;
  ticketCount: number;
  status: PaymentStatus;
  confirmedAt: Timestamp | null;
  failureReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
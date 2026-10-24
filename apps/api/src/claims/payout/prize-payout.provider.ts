
import { PrizePayoutStatus } from '@prisma/client';

export type PrizePayoutProviderCode =
  | 'DEV'
  | 'MONNIFY'
  | 'FLUTTERWAVE'
  | 'PAYSTACK';

export type InitiatePrizePayoutInput = {
  idempotencyKey: string;
  accountNumber: string;
  bankCode: string;
  accountName: string;
  amountNgn: number;
  reason: string;
};

export type PrizePayoutProviderResult = {
  provider: PrizePayoutProviderCode;
  reference: string;
  providerTransactionId?: string | null;
  status: PrizePayoutStatus;
  rawStatus?: string;
  failureReason?: string;

  amountNgn?: number | null;
  currency?: string | null;
  destinationBankCode?: string | null;
  destinationAccountLast4?: string | null;

  // HMAC of the FULL bank code and NUBAN.
  // Never the raw account number.
  destinationAccountFingerprint?: string | null;
};

export interface PrizePayoutProvider {
  readonly providerCode: PrizePayoutProviderCode;

  initiate(
    input: InitiatePrizePayoutInput,
  ): Promise<PrizePayoutProviderResult>;

  getStatus(
    reference: string,
  ): Promise<PrizePayoutProviderResult>;
}

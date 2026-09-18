import { PrizePayoutStatus } from '@prisma/client';

export const PRIZE_PAYOUT_PROVIDER = Symbol('PRIZE_PAYOUT_PROVIDER');

export type PrizePayoutProviderCode =
  | 'DEV'
  | 'MONNIFY'
  | 'FLUTTERWAVE';

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

  /**
   * SureWina's/provider merchant reference used to locate
   * this exact payout again.
   */
  reference: string;

  /**
   * Provider's own transfer/transaction identifier where available.
   */
  providerTransactionId?: string | null;

  status: PrizePayoutStatus;

  rawStatus?: string;

  failureReason?: string;

  /**
   * Financial identity returned by the provider when available.
   *
   * Phase 6 finalization will compare these against the immutable
   * PrizePayoutAttempt before allowing SUCCEEDED.
   */
  amountNgn?: number | null;
  currency?: string | null;
  destinationBankCode?: string | null;
  destinationAccountLast4?: string | null;
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
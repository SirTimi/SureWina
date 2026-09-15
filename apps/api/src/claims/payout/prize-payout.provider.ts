import { PrizePayoutStatus } from '@prisma/client';

export const PRIZE_PAYOUT_PROVIDER = Symbol('PRIZE_PAYOUT_PROVIDER');

export type InitiatePrizePayoutInput = {
  idempotencyKey: string;

  accountNumber: string;
  bankCode: string;
  accountName: string;

  amountNgn: number;
  reason: string;
};

export type PrizePayoutProviderResult = {
  provider: string;
  reference: string;

  /**
   * Normalised SureWina payout status.
   *
   * Provider-specific statuses such as:
   * pending, processing, completed, reversed etc
   * must be converted to PrizePayoutStatus by the provider adapter.
   */
  status: PrizePayoutStatus;

  /**
   * Original provider status for debugging/reconciliation.
   */
  rawStatus?: string;

  failureReason?: string;
};

export interface PrizePayoutProvider {
  readonly providerCode: string;

  initiate(
    input: InitiatePrizePayoutInput,
  ): Promise<PrizePayoutProviderResult>;

  getStatus(
    reference: string,
  ): Promise<PrizePayoutProviderResult>;
}
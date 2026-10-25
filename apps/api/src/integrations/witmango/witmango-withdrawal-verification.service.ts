import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PrizePayoutStatus,
  WalletWithdrawalStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { WitmangoClientService } from './witmango-client.service';
import { PaystackPrizePayoutProvider } from '../../claims/payout/paystack-prize-payout.provider';

type ExternalRecord = Record<string, unknown>;
type EvidenceState = 'NOT_SUBMITTED' | 'CONFIRMED' | 'UNKNOWN' | 'MISMATCH';

function record(value: unknown): ExternalRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as ExternalRecord
    : null;
}

function nairaToKobo(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) &&
    Math.abs(result - value * 100) < 0.000001 ? result : null;
}

/**
 * Read-only evidence inspection across SureWina, CBA and Paystack.
 *
 * Neither a CBA savings withdrawal nor a Paystack balance lookup proves
 * that custodial funds were settled between the two institutions.
 * This service deliberately never creates money, marks a withdrawal paid,
 * releases a hold or initiates a transfer.
 */
@Injectable()
export class WitmangoWithdrawalVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly witmango: WitmangoClientService,
    private readonly paystack: PaystackPrizePayoutProvider,
    private readonly config: ConfigService,
  ) {}

  async inspect(withdrawalId: string) {
    const withdrawal = await this.prisma.walletWithdrawal.findUnique({
      where: { withdrawalId },
    });

    if (!withdrawal) {
      throw new NotFoundException('Wallet withdrawal not found');
    }

    if (
      !this.witmango.isEnabled() ||
      withdrawal.tenantId !==
        this.config.get<string>('WITMANGO_TENANT_ID')?.trim()
    ) {
      throw new ConflictException('CBA withdrawal tenant is unavailable');
    }

    const hold = await this.prisma.walletHold.findUnique({
      where: { holdId: withdrawal.holdId },
      select: { status: true, amountNgn: true, walletId: true },
    });

    const problems: string[] = [];
    if (
      !hold ||
      hold.walletId !== withdrawal.walletId ||
      hold.amountNgn !== withdrawal.amountNgn
    ) {
      problems.push('INTERNAL_HOLD_MISMATCH');
    } else if (
      hold.status !== 'HELD' &&
      ![
        WalletWithdrawalStatus.SUCCEEDED,
        WalletWithdrawalStatus.RESTORED,
        WalletWithdrawalStatus.CANCELLED,
      ].includes(withdrawal.status)
    ) {
      problems.push('UNRESOLVED_WITHDRAWAL_HOLD_NOT_HELD');
    }

    // No Fineract debit evidence should be fabricated from a balance
    // difference. Only the EXACT externally persisted transaction counts.
    let cbaState: EvidenceState = 'NOT_SUBMITTED';
    let cbaTransactionId = withdrawal.cbaTransactionId;
    if (withdrawal.cbaSubmissionStartedAt || cbaTransactionId) {
      cbaState = 'UNKNOWN';
      if (!cbaTransactionId) {
        problems.push('CBA_TRANSACTION_ID_MISSING');
      } else {
        try {
          const result = record(
            await this.witmango.getSavingsAccountWithTransactions(
              withdrawal.savingsAccountId,
            ),
          );
          const transactions = result?.transactions;
          if (
            result?.id !== withdrawal.savingsAccountId ||
            record(result?.currency)?.code !== 'NGN' ||
            !Array.isArray(transactions)
          ) {
            problems.push('CBA_ACCOUNT_EVIDENCE_INCOMPLETE');
          } else {
            const matching = transactions.filter((item) => {
              const tx = record(item);
              return tx && String(tx.id) === cbaTransactionId;
            });
            if (matching.length !== 1) {
              problems.push('CBA_TRANSACTION_NOT_UNIQUELY_FOUND');
            } else {
              const tx = record(matching[0])!;
              const type = record(tx.transactionType);
              // Require explicit non-reversal evidence; the supplied
              // collection does not guarantee this property, so an
              // incomplete API response remains UNKNOWN, not CONFIRMED.
              if (
                type?.withdrawal !== true ||
                nairaToKobo(tx.amount) !== withdrawal.amountNgn * 100
              ) {
                cbaState = 'MISMATCH';
                problems.push('CBA_DEBIT_IDENTITY_MISMATCH');
              } else if (tx.reversed !== false) {
                problems.push('CBA_REVERSAL_STATUS_UNVERIFIED');
              } else {
                cbaState = 'CONFIRMED';
              }
            }
          }
        } catch {
          problems.push('CBA_LOOKUP_UNAVAILABLE');
        }
      }
    }

    let paystackState: EvidenceState = 'NOT_SUBMITTED';
    let paystackStatus: PrizePayoutStatus | null = null;
    let paystackTransactionId = withdrawal.paystackTransactionId;
    if (
      withdrawal.paystackSubmissionStartedAt ||
      paystackTransactionId
    ) {
      paystackState = 'UNKNOWN';
      try {
        const verified = await this.paystack.getStatus(
          withdrawal.paystackReference,
        );
        paystackStatus = verified.status;
        paystackTransactionId =
          verified.providerTransactionId ?? paystackTransactionId;

        if (
          verified.provider !== 'PAYSTACK' ||
          verified.reference !== withdrawal.paystackReference ||
          verified.amountNgn !== withdrawal.amountNgn ||
          verified.currency !== 'NGN' ||
          verified.destinationBankCode !== withdrawal.bankCode ||
          verified.destinationAccountLast4 !== withdrawal.bankAccountLast4 ||
          verified.destinationAccountFingerprint !== withdrawal.bankFingerprint
        ) {
          paystackState = 'MISMATCH';
          problems.push('PAYSTACK_TRANSFER_IDENTITY_MISMATCH');
        } else if (
          [
            PrizePayoutStatus.SUCCEEDED,
            PrizePayoutStatus.FAILED,
            PrizePayoutStatus.REVERSED,
          ].includes(verified.status)
        ) {
          paystackState = 'CONFIRMED';
        } else {
          problems.push('PAYSTACK_OUTCOME_NOT_TERMINAL');
        }
      } catch {
        problems.push('PAYSTACK_LOOKUP_UNAVAILABLE');
      }
    }

    if (
      paystackState === 'CONFIRMED' &&
      paystackStatus === PrizePayoutStatus.SUCCEEDED &&
      cbaState !== 'CONFIRMED'
    ) {
      problems.push('BANK_PAID_WITHOUT_CONFIRMED_CBA_DEBIT');
    }
    if (
      cbaState === 'CONFIRMED' &&
      paystackState === 'CONFIRMED' &&
      (
        paystackStatus === PrizePayoutStatus.FAILED ||
        paystackStatus === PrizePayoutStatus.REVERSED
      )
    ) {
      problems.push('CBA_DEBIT_NEEDS_CONTROLLED_RESTORATION');
    }

    // Even when both provider outcomes are confirmed, the funding
    // handoff CBA -> Paystack and internal ledger journal have not
    // been independently established by these APIs.
    const readyForManualSettlementReview =
      cbaState === 'CONFIRMED' &&
      paystackState === 'CONFIRMED' &&
      paystackStatus === PrizePayoutStatus.SUCCEEDED &&
      problems.length === 0;

    return {
      withdrawalId: withdrawal.withdrawalId,
      walletId: withdrawal.walletId,
      status: withdrawal.status,
      amountNgn: withdrawal.amountNgn,
      currency: withdrawal.currency,
      destination: {
        bankCode: withdrawal.bankCode,
        accountLast4: withdrawal.bankAccountLast4,
      },
      internalHold: {
        status: hold?.status ?? null,
        amountNgn: hold?.amountNgn ?? null,
      },
      cba: {
        savingsAccountId: withdrawal.savingsAccountId,
        reference: withdrawal.cbaReference,
        transactionId: cbaTransactionId,
        evidence: cbaState,
      },
      paystack: {
        reference: withdrawal.paystackReference,
        transactionId: paystackTransactionId,
        status: paystackStatus,
        evidence: paystackState,
      },
      readyForManualSettlementReview,
      autoFinalizePermitted: false,
      problems,
    };
  }
}

import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  AuditActorType,
  AuditSeverity,
  LedgerEntrySide,
  LedgerTransactionKind,
  Prisma,
  PrizeClaimStatus,
  PrizePayoutStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';

import {
  LedgerService,
} from '../../ledger/ledger.service';

import {
  SYSTEM_LEDGER_ACCOUNT_CODES,
} from '../../ledger/ledger.constants';

import {
  WhtDeductionService,
} from '../wht-deduction.service';

import {
  PrizePayoutProviderResult,
} from './prize-payout.provider';

export type PayoutAttemptFinalizationActor = {
  type: AuditActorType;
  id: string;
};

const NON_TERMINAL_STATUSES: PrizePayoutStatus[] = [
  PrizePayoutStatus.REQUESTED,
  PrizePayoutStatus.SUBMITTED,
  PrizePayoutStatus.PROCESSING,
  PrizePayoutStatus.UNKNOWN,
];

@Injectable()
export class PrizePayoutAttemptFinalizationService {
  private readonly logger =
    new Logger(
      PrizePayoutAttemptFinalizationService.name,
    );

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly ledger:
      LedgerService,

    private readonly audit:
      AuditService,

    private readonly wht:
      WhtDeductionService,
  ) {}

  async applyForAttempt(
    attemptId: string,
    result: PrizePayoutProviderResult,
    actor: PayoutAttemptFinalizationActor,
  ): Promise<boolean> {
    const attempt =
      await this.prisma.prizePayoutAttempt.findUnique({
        where: {
          attemptId,
        },
        include: {
          claim: true,
        },
      });

    if (!attempt) {
      throw new NotFoundException(
        'Prize payout attempt not found',
      );
    }

    if (
      attempt.provider !==
      result.provider
    ) {
      await this.auditMismatch(
        attemptId,
        actor,
        'PAYOUT_ATTEMPT_PROVIDER_MISMATCH',
        {
          storedProvider:
            attempt.provider,
          receivedProvider:
            result.provider,
        },
      );

      return false;
    }

    if (
      attempt.providerReference &&
      attempt.providerReference !==
        result.reference &&
      attempt.idempotencyKey !==
        result.reference
    ) {
      await this.auditMismatch(
        attemptId,
        actor,
        'PAYOUT_ATTEMPT_REFERENCE_MISMATCH',
        {
          storedReference:
            attempt.providerReference,
          idempotencyKey:
            attempt.idempotencyKey,
          receivedReference:
            result.reference,
        },
      );

      return false;
    }

    if (
      result.status ===
      PrizePayoutStatus.SUCCEEDED
    ) {
      const mismatch =
        this.financialMismatch(
          attempt,
          result,
        );

      if (mismatch) {
        await this.markVerificationMismatch(
          attemptId,
          result,
          actor,
          mismatch,
        );

        return false;
      }

      return this.markSucceeded(
        attemptId,
        result,
        actor,
      );
    }

    switch (result.status) {
      case PrizePayoutStatus.FAILED:
        return this.markFailed(
          attemptId,
          result,
          actor,
        );

      case PrizePayoutStatus.REVERSED:
        return this.markReversed(
          attemptId,
          result,
          actor,
        );

      case PrizePayoutStatus.SUBMITTED:
      case PrizePayoutStatus.PROCESSING:
      case PrizePayoutStatus.UNKNOWN:
        return this.markNonTerminal(
          attemptId,
          result,
          actor,
        );

      case PrizePayoutStatus.REQUESTED:
      default:
        return false;
    }
  }

  private async markSucceeded(
    attemptId: string,
    result: PrizePayoutProviderResult,
    actor: PayoutAttemptFinalizationActor,
  ): Promise<boolean> {
    const completedAt =
      new Date();

    const outcome =
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT "attempt_id"
            FROM "prize_payout_attempts"
            WHERE "attempt_id" = ${attemptId}
            FOR UPDATE
          `;

          const attempt =
            await tx.prizePayoutAttempt.findUnique({
              where: {
                attemptId,
              },
              include: {
                claim: true,
              },
            });

          if (!attempt) {
            throw new NotFoundException(
              'Prize payout attempt not found',
            );
          }

          if (
            attempt.status ===
            PrizePayoutStatus.SUCCEEDED
          ) {
            return {
              changed: false,
              claimId:
                attempt.claimId,
            };
          }

          if (
            !NON_TERMINAL_STATUSES.includes(
              attempt.status,
            )
          ) {
            return {
              changed: false,
              claimId:
                attempt.claimId,
            };
          }

          if (
            attempt.claim.status ===
            PrizeClaimStatus.CASH_PAID
          ) {
            return {
              changed: false,
              claimId:
                attempt.claimId,
            };
          }

          const otherSuccess =
            await tx.prizePayoutAttempt.findFirst({
              where: {
                claimId:
                  attempt.claimId,

                attemptId: {
                  not:
                    attempt.attemptId,
                },

                status:
                  PrizePayoutStatus.SUCCEEDED,
              },

              select: {
                attemptId:
                  true,
              },
            });

          if (otherSuccess) {
            return {
              changed: false,
              claimId:
                attempt.claimId,
            };
          }

          if (
            !attempt.claim
              .prizeAccrualLedgerTxnId
          ) {
            throw new Error(
              'Prize payout cannot succeed before prize accrual is posted',
            );
          }

          const prizePayable =
            await this.requireAccount(
              tx,
              SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_PAYABLE,
            );

          const payoutClearing =
            await this.requireAccount(
              tx,
              this.payoutClearingCode(
                attempt.provider,
              ),
            );

          const journal =
            await this.ledger.postInTransaction(
              tx,
              {
                idempotencyKey:
                  `ledger:prize-payout:${attempt.attemptId}`,

                kind:
                  LedgerTransactionKind.PRIZE_PAYOUT,

                referenceType:
                  'PrizePayoutAttempt',

                referenceId:
                  attempt.attemptId,

                description:
                  `Prize payout ${attempt.attemptId}`,

                metadata: {
                  claimId:
                    attempt.claimId,

                  provider:
                    attempt.provider,

                  providerReference:
                    result.reference,
                },

                lines: [
                  {
                    accountId:
                      prizePayable.accountId,

                    side:
                      LedgerEntrySide.DEBIT,

                    amountNgn:
                      attempt.amountNgn,

                    memo:
                      'Settle winner prize payable',
                  },
                  {
                    accountId:
                      payoutClearing.accountId,

                    side:
                      LedgerEntrySide.CREDIT,

                    amountNgn:
                      attempt.amountNgn,

                    memo:
                      `${attempt.provider} payout`,
                  },
                ],
              },
            );

          await tx.prizePayoutAttempt.update({
            where: {
              attemptId,
            },
            data: {
              status:
                PrizePayoutStatus.SUCCEEDED,

              providerReference:
                result.reference,

              providerTransactionId:
                result.providerTransactionId ??
                attempt.providerTransactionId,

              rawStatus:
                result.rawStatus ??
                null,

              failureReason:
                null,

              lastCheckedAt:
                completedAt,

              completedAt,

              payoutLedgerTxnId:
                journal.ledgerTxnId,
            },
          });

          await tx.prizeClaim.update({
            where: {
              claimId:
                attempt.claimId,
            },
            data: {
              payoutStatus:
                PrizePayoutStatus.SUCCEEDED,

              payoutProvider:
                attempt.provider,

              payoutReference:
                result.reference,

              payoutIdempotencyKey:
                attempt.idempotencyKey,

              payoutLastCheckedAt:
                completedAt,

              payoutCompletedAt:
                completedAt,

              payoutFailureReason:
                null,

              status:
                PrizeClaimStatus.CASH_PAID,

              fulfilledAt:
                completedAt,
            },
          });

          return {
            changed: true,
            claimId:
              attempt.claimId,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );

    if (!outcome.changed) {
      return false;
    }

    await this.wht.recordForClaim(
      outcome.claimId,
    );

    await this.audit.write({
      severity:
        AuditSeverity.INFO,

      actor,

      action:
        'PRIZE_PAYOUT_ATTEMPT_SUCCEEDED',

      resource: {
        type:
          'PrizePayoutAttempt',
        id:
          attemptId,
      },

      metadata: {
        provider:
          result.provider,

        reference:
          result.reference,

        rawStatus:
          result.rawStatus ??
          null,
      },
    });

    return true;
  }

  private async markFailed(
    attemptId: string,
    result: PrizePayoutProviderResult,
    actor: PayoutAttemptFinalizationActor,
  ): Promise<boolean> {
    const checkedAt =
      new Date();

    const attempt =
      await this.prisma.prizePayoutAttempt.findUnique({
        where: {
          attemptId,
        },
      });

    if (!attempt) {
      throw new NotFoundException(
        'Prize payout attempt not found',
      );
    }

    const updated =
      await this.prisma.prizePayoutAttempt.updateMany({
        where: {
          attemptId,

          status: {
            in:
              NON_TERMINAL_STATUSES,
          },
        },

        data: {
          status:
            PrizePayoutStatus.FAILED,

          providerReference:
            result.reference,

          providerTransactionId:
            result.providerTransactionId ??
            attempt.providerTransactionId,

          rawStatus:
            result.rawStatus ??
            null,

          failureReason:
            result.failureReason ??
            result.rawStatus ??
            'Provider reported payout failure',

          lastCheckedAt:
            checkedAt,
        },
      });

    if (updated.count !== 1) {
      return false;
    }

    await this.mirrorCurrentAttempt(
      attempt.claimId,
      attemptId,
    );

    await this.audit.write({
      severity:
        AuditSeverity.WARNING,

      actor,

      action:
        'PRIZE_PAYOUT_ATTEMPT_FAILED',

      resource: {
        type:
          'PrizePayoutAttempt',
        id:
          attemptId,
      },

      metadata: {
        provider:
          result.provider,

        reference:
          result.reference,

        reason:
          result.failureReason ??
          null,
      },
    });

    return true;
  }

  private async markNonTerminal(
    attemptId: string,
    result: PrizePayoutProviderResult,
    actor: PayoutAttemptFinalizationActor,
  ): Promise<boolean> {
    const checkedAt =
      new Date();

    const attempt =
      await this.prisma.prizePayoutAttempt.findUnique({
        where: {
          attemptId,
        },
      });

    if (!attempt) {
      throw new NotFoundException(
        'Prize payout attempt not found',
      );
    }

    const updated =
      await this.prisma.prizePayoutAttempt.updateMany({
        where: {
          attemptId,

          status: {
            in:
              NON_TERMINAL_STATUSES,
          },
        },

        data: {
          status:
            result.status,

          providerReference:
            result.reference,

          providerTransactionId:
            result.providerTransactionId ??
            attempt.providerTransactionId,

          rawStatus:
            result.rawStatus ??
            null,

          failureReason:
            result.status ===
            PrizePayoutStatus.UNKNOWN
              ? result.failureReason ??
                'Provider payout state is unknown'
              : null,

          lastCheckedAt:
            checkedAt,
        },
      });

    if (updated.count !== 1) {
      return false;
    }

    await this.mirrorCurrentAttempt(
      attempt.claimId,
      attemptId,
    );

    await this.audit.write({
      severity:
        result.status ===
        PrizePayoutStatus.UNKNOWN
          ? AuditSeverity.WARNING
          : AuditSeverity.INFO,

      actor,

      action:
        result.status ===
        PrizePayoutStatus.UNKNOWN
          ? 'PRIZE_PAYOUT_ATTEMPT_UNKNOWN'
          : 'PRIZE_PAYOUT_ATTEMPT_UPDATED',

      resource: {
        type:
          'PrizePayoutAttempt',
        id:
          attemptId,
      },

      metadata: {
        provider:
          result.provider,

        reference:
          result.reference,

        status:
          result.status,

        rawStatus:
          result.rawStatus ??
          null,
      },
    });

    return true;
  }

  private async markReversed(
    attemptId: string,
    result: PrizePayoutProviderResult,
    actor: PayoutAttemptFinalizationActor,
  ): Promise<boolean> {
    const reversedAt =
      new Date();

    const outcome =
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT "attempt_id"
            FROM "prize_payout_attempts"
            WHERE "attempt_id" = ${attemptId}
            FOR UPDATE
          `;

          const attempt =
            await tx.prizePayoutAttempt.findUnique({
              where: {
                attemptId,
              },
            });

          if (!attempt) {
            throw new NotFoundException(
              'Prize payout attempt not found',
            );
          }

          if (
            attempt.status ===
            PrizePayoutStatus.REVERSED
          ) {
            return {
              changed: false,
              claimId:
                attempt.claimId,
            };
          }

          if (
            attempt.status !==
              PrizePayoutStatus.SUCCEEDED &&
            !NON_TERMINAL_STATUSES.includes(
              attempt.status,
            )
          ) {
            return {
              changed: false,
              claimId:
                attempt.claimId,
            };
          }

          let reversalLedgerTxnId:
            string | null =
              null;

          if (
            attempt.payoutLedgerTxnId
          ) {
            const reversal =
              await this.ledger.reverseInTransaction(
                tx,
                {
                  originalLedgerTxnId:
                    attempt.payoutLedgerTxnId,

                  idempotencyKey:
                    `ledger:prize-payout-reversal:${attempt.attemptId}`,

                  referenceType:
                    'PrizePayoutAttempt',

                  referenceId:
                    attempt.attemptId,

                  description:
                    `Reversal of prize payout ${attempt.attemptId}`,

                  metadata: {
                    claimId:
                      attempt.claimId,

                    provider:
                      attempt.provider,

                    providerReference:
                      result.reference,
                  },
                },
              );

            reversalLedgerTxnId =
              reversal.ledgerTxnId;
          }

          await tx.prizePayoutAttempt.update({
            where: {
              attemptId,
            },
            data: {
              status:
                PrizePayoutStatus.REVERSED,

              providerReference:
                result.reference,

              providerTransactionId:
                result.providerTransactionId ??
                attempt.providerTransactionId,

              rawStatus:
                result.rawStatus ??
                null,

              failureReason:
                result.failureReason ??
                'Provider reported payout reversal',

              lastCheckedAt:
                reversedAt,

              completedAt:
                reversedAt,

              reversalLedgerTxnId,
            },
          });

          await tx.prizeClaim.update({
            where: {
              claimId:
                attempt.claimId,
            },
            data: {
              payoutStatus:
                PrizePayoutStatus.REVERSED,

              payoutProvider:
                attempt.provider,

              payoutReference:
                result.reference,

              payoutLastCheckedAt:
                reversedAt,

              payoutCompletedAt:
                null,

              payoutFailureReason:
                result.failureReason ??
                'Provider reported payout reversal',

              status:
                PrizeClaimStatus.KYC_CLEARED,

              fulfilledAt:
                null,
            },
          });

          return {
            changed: true,
            claimId:
              attempt.claimId,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );

    if (!outcome.changed) {
      return false;
    }

    await this.audit.write({
      severity:
        AuditSeverity.CRITICAL,

      actor,

      action:
        'PRIZE_PAYOUT_ATTEMPT_REVERSED',

      resource: {
        type:
          'PrizePayoutAttempt',
        id:
          attemptId,
      },

      metadata: {
        provider:
          result.provider,

        reference:
          result.reference,

        requiresFinanceReview:
          true,
      },
    });

    return true;
  }

  private async markVerificationMismatch(
    attemptId: string,
    result: PrizePayoutProviderResult,
    actor: PayoutAttemptFinalizationActor,
    mismatch: string,
  ) {
    const checkedAt =
      new Date();

    const attempt =
      await this.prisma.prizePayoutAttempt.findUnique({
        where: {
          attemptId,
        },
      });

    if (!attempt) {
      return;
    }

    await this.prisma.prizePayoutAttempt.updateMany({
      where: {
        attemptId,

        status: {
          in:
            NON_TERMINAL_STATUSES,
        },
      },

      data: {
        status:
          PrizePayoutStatus.UNKNOWN,

        providerReference:
          result.reference,

        providerTransactionId:
          result.providerTransactionId ??
          attempt.providerTransactionId,

        rawStatus:
          result.rawStatus ??
          null,

        failureReason:
          `Provider verification mismatch: ${mismatch}`,

        lastCheckedAt:
          checkedAt,
      },
    });

    await this.mirrorCurrentAttempt(
      attempt.claimId,
      attemptId,
    );

    await this.audit.write({
      severity:
        AuditSeverity.CRITICAL,

      actor,

      action:
        'PRIZE_PAYOUT_FINANCIAL_IDENTITY_MISMATCH',

      resource: {
        type:
          'PrizePayoutAttempt',
        id:
          attemptId,
      },

      metadata: {
        provider:
          result.provider,

        reference:
          result.reference,

        mismatch,
      },
    });
  }

  private financialMismatch(
    attempt: {
      amountNgn: number;
      currency: string;
      destinationBankCode: string;
      destinationAccountLast4: string;
    },
    result: PrizePayoutProviderResult,
  ): string | null {
    if (
      result.amountNgn !==
        undefined &&
      result.amountNgn !==
        null &&
      result.amountNgn !==
        attempt.amountNgn
    ) {
      return `amount expected=${attempt.amountNgn} received=${result.amountNgn}`;
    }

    if (
      result.currency &&
      result.currency
        .trim()
        .toUpperCase() !==
        attempt.currency
    ) {
      return `currency expected=${attempt.currency} received=${result.currency}`;
    }

    if (
      result.destinationBankCode &&
      result.destinationBankCode.trim() !==
        attempt.destinationBankCode
    ) {
      return 'destination bank code mismatch';
    }

    if (
      result.destinationAccountLast4 &&
      result.destinationAccountLast4 !==
        attempt.destinationAccountLast4
    ) {
      return 'destination account mismatch';
    }

    return null;
  }

  private async mirrorCurrentAttempt(
    claimId: string,
    attemptId: string,
  ) {
    const current =
      await this.prisma.prizePayoutAttempt.findFirst({
        where: {
          claimId,
        },

        orderBy: {
          attemptNumber:
            'desc',
        },
      });

    if (
      !current ||
      current.attemptId !==
        attemptId
    ) {
      return;
    }

    await this.prisma.prizeClaim.update({
      where: {
        claimId,
      },

      data: {
        payoutStatus:
          current.status,

        payoutProvider:
          current.provider,

        payoutReference:
          current.providerReference,

        payoutIdempotencyKey:
          current.idempotencyKey,

        payoutLastCheckedAt:
          current.lastCheckedAt,

        payoutFailureReason:
          current.failureReason,
      },
    });
  }

  private payoutClearingCode(
    provider: string,
  ): string {
    switch (
      provider
        .trim()
        .toUpperCase()
    ) {
      case 'MONNIFY':
        return SYSTEM_LEDGER_ACCOUNT_CODES
          .MONNIFY_PAYOUT_CLEARING;

      case 'FLUTTERWAVE':
        return SYSTEM_LEDGER_ACCOUNT_CODES
          .FLUTTERWAVE_PAYOUT_CLEARING;

      case 'DEV':
        return SYSTEM_LEDGER_ACCOUNT_CODES
          .BANK_CASH;

      default:
        throw new Error(
          `No payout clearing account configured for ${provider}`,
        );
    }
  }

  private async requireAccount(
    tx: Prisma.TransactionClient,
    code: string,
  ) {
    const account =
      await tx.ledgerAccount.findUnique({
        where: {
          code,
        },
      });

    if (!account) {
      throw new Error(
        `Required ledger account ${code} does not exist`,
      );
    }

    return account;
  }

  private async auditMismatch(
    attemptId: string,
    actor: PayoutAttemptFinalizationActor,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    this.logger.error(
      `${action} for payout attempt ${attemptId}`,
    );

    await this.audit.write({
      severity:
        AuditSeverity.CRITICAL,

      actor,

      action,

      resource: {
        type:
          'PrizePayoutAttempt',
        id:
          attemptId,
      },

      metadata,
    });
  }
}
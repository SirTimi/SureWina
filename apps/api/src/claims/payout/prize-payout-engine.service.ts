import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  AuditActorType,
  AuditSeverity,
  ClaimType,
  LedgerEntrySide,
  LedgerTransactionKind,
  Prisma,
  PrizeClaimStatus,
  PrizePayoutStatus,
} from '@prisma/client';

import {
  createHash,
  randomUUID,
} from 'crypto';

import {
  PrismaService,
} from '../../database/prisma.service';

import {
  AuditService,
} from '../../audit/audit.service';

import {
  LedgerService,
} from '../../ledger/ledger.service';

import {
  SYSTEM_LEDGER_ACCOUNT_CODES,
} from '../../ledger/ledger.constants';

import {
  PrizePayoutProviderCode,
  PrizePayoutProviderResult,
} from './prize-payout.provider';

import {
  PrizePayoutProviderRegistry,
} from './prize-payout-provider.registry';

import {
  PrizePayoutAttemptFinalizationService,
} from './prize-payout-attempt-finalization.service';

@Injectable()
export class PrizePayoutEngineService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly ledger:
      LedgerService,

    private readonly audit:
      AuditService,

    private readonly providers:
      PrizePayoutProviderRegistry,

    private readonly finalizer:
      PrizePayoutAttemptFinalizationService,
  ) {}

  async initiate(
    claimId: string,
    adminId: string,
    providerCode:
      PrizePayoutProviderCode,
  ) {
    return this.startAttempt(
      claimId,
      adminId,
      providerCode,
      false,
    );
  }

  async retry(
    claimId: string,
    adminId: string,
    providerCode:
      PrizePayoutProviderCode,
  ) {
    return this.startAttempt(
      claimId,
      adminId,
      providerCode,
      true,
    );
  }

  async refreshCurrent(
    claimId: string,
    adminId: string,
  ) {
    const attempt =
      await this.prisma.prizePayoutAttempt.findFirst({
        where: {
          claimId,
        },

        orderBy: {
          attemptNumber:
            'desc',
        },
      });

    if (!attempt) {
      throw new NotFoundException(
        'No payout attempt exists for this claim',
      );
    }

    if (
      attempt.status ===
        PrizePayoutStatus.SUCCEEDED ||
      attempt.status ===
        PrizePayoutStatus.FAILED ||
      attempt.status ===
        PrizePayoutStatus.REVERSED
    ) {
      return this.getAttempt(
        attempt.attemptId,
      );
    }

    const provider =
      this.providers.get(
        attempt.provider,
      );

    const reference =
      attempt.providerReference ??
      attempt.idempotencyKey;

    let result:
      PrizePayoutProviderResult;

    try {
      result =
        await provider.getStatus(
          reference,
        );
    } catch (error) {
      await this.audit.write({
        severity:
          AuditSeverity.WARNING,

        actor: {
          type:
            AuditActorType.ADMIN,
          id:
            adminId,
        },

        action:
          'PRIZE_PAYOUT_ATTEMPT_REFRESH_FAILED',

        resource: {
          type:
            'PrizePayoutAttempt',
          id:
            attempt.attemptId,
        },

        metadata: {
          provider:
            attempt.provider,

          reference,

          error:
            error instanceof Error
              ? error.message
              : 'Unknown refresh error',
        },
      });

      throw error;
    }

    await this.finalizer.applyForAttempt(
      attempt.attemptId,
      result,
      {
        type:
          AuditActorType.ADMIN,
        id:
          adminId,
      },
    );

    return this.getAttempt(
      attempt.attemptId,
    );
  }

  async listAttempts(
    claimId: string,
  ) {
    const claim =
      await this.prisma.prizeClaim.findUnique({
        where: {
          claimId,
        },

        select: {
          claimId:
            true,

          winnerTicketRef:
            true,
        },
      });

    if (!claim) {
      throw new NotFoundException(
        'Claim not found',
      );
    }

    const attempts =
      await this.prisma.prizePayoutAttempt.findMany({
        where: {
          claimId,
        },

        orderBy: {
          attemptNumber:
            'asc',
        },
      });

    return {
      claimId:
        claim.claimId,

      winnerTicketRef:
        claim.winnerTicketRef,

      attempts:
        attempts.map(
          (attempt) =>
            this.toView(
              attempt,
            ),
        ),
    };
  }

  async getAttempt(
    attemptId: string,
  ) {
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

    return this.toView(
      attempt,
    );
  }

  private async startAttempt(
    claimId: string,
    adminId: string,
    providerCode:
      PrizePayoutProviderCode,
    retry: boolean,
  ) {
    const provider =
      this.providers.get(
        providerCode,
      );

    const reserved =
      await this.reserveAttempt(
        claimId,
        adminId,
        provider.providerCode,
        retry,
      );

    await this.audit.write({
      severity:
        AuditSeverity.INFO,

      actor: {
        type:
          AuditActorType.ADMIN,
        id:
          adminId,
      },

      action:
        retry
          ? 'PRIZE_PAYOUT_RETRY_REQUESTED'
          : 'PRIZE_PAYOUT_ATTEMPT_REQUESTED',

      resource: {
        type:
          'PrizePayoutAttempt',
        id:
          reserved.attemptId,
      },

      metadata: {
        claimId,

        attemptNumber:
          reserved.attemptNumber,

        provider:
          provider.providerCode,

        amountNgn:
          reserved.amountNgn,

        accountLast4:
          reserved.accountNumber.slice(
            -4,
          ),
      },
    });

    let result:
      PrizePayoutProviderResult;

    try {
      result =
        await provider.initiate({
          idempotencyKey:
            reserved.idempotencyKey,

          accountNumber:
            reserved.accountNumber,

          bankCode:
            reserved.bankCode,

          accountName:
            reserved.accountName,

          amountNgn:
            reserved.amountNgn,

          reason:
            `SureWina prize ${reserved.winnerTicketRef}`,
        });
    } catch (error) {
      /*
       * An exception after entering the provider adapter does not
       * prove no external transfer exists.
       *
       * UNKNOWN blocks automatic retry/provider switching.
       */
      result = {
        provider:
          provider.providerCode,

        reference:
          reserved.idempotencyKey,

        providerTransactionId:
          null,

        status:
          PrizePayoutStatus.UNKNOWN,

        rawStatus:
          'PROVIDER_EXCEPTION',

        failureReason:
          error instanceof Error
            ? error.message
            : 'Unknown payout provider error',
      };
    }

    await this.finalizer.applyForAttempt(
      reserved.attemptId,
      result,
      {
        type:
          AuditActorType.ADMIN,
        id:
          adminId,
      },
    );

    return this.getAttempt(
      reserved.attemptId,
    );
  }

  private async reserveAttempt(
    claimId: string,
    adminId: string,
    providerCode:
      PrizePayoutProviderCode,
    retry: boolean,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "claim_id"
          FROM "prize_claims"
          WHERE "claim_id" = ${claimId}
          FOR UPDATE
        `;

        const claim =
          await tx.prizeClaim.findUnique({
            where: {
              claimId,
            },

            select: {
              claimId:
                true,

              winnerTicketRef:
                true,

              claimType:
                true,

              status:
                true,

              grossPrizeValueNgn:
                true,

              whtAmountNgn:
                true,

              netPrizeValueNgn:
                true,

              prizeAccrualLedgerTxnId:
                true,

              payoutAccountNumber:
                true,

              kycBankCode:
                true,

              kycBankAccountName:
                true,
            },
          });

        if (!claim) {
          throw new NotFoundException(
            'Claim not found',
          );
        }

        if (
          claim.claimType !==
          ClaimType.CASH
        ) {
          throw new ConflictException(
            'Only cash claims can use bank payout',
          );
        }

        if (
          claim.status !==
          PrizeClaimStatus.KYC_CLEARED
        ) {
          throw new ConflictException(
            `Claim is not cleared for payout (status: ${claim.status})`,
          );
        }

        if (
          !claim.payoutAccountNumber ||
          !claim.kycBankCode ||
          !claim.kycBankAccountName
        ) {
          throw new ConflictException(
            'Winner has not confirmed a payout account',
          );
        }

        const latest =
          await tx.prizePayoutAttempt.findFirst({
            where: {
              claimId,
            },

            orderBy: {
              attemptNumber:
                'desc',
            },
          });

        if (!retry) {
          if (latest) {
            throw new ConflictException(
              `A payout attempt already exists with status ${latest.status}`,
            );
          }
        } else {
          if (!latest) {
            throw new ConflictException(
              'No previous payout attempt exists to retry',
            );
          }

          if (
            latest.status !==
              PrizePayoutStatus.FAILED &&
            latest.status !==
              PrizePayoutStatus.REVERSED
          ) {
            throw new ConflictException(
              `Payout cannot be retried while latest attempt is ${latest.status}`,
            );
          }
        }

        await this.ensurePrizeAccrual(
          tx,
          claim,
        );

        const attemptNumber =
          (
            latest?.attemptNumber ??
            0
          ) + 1;

        /*
         * 45 characters:
         *
         * sw-prize- + UUID
         *
         * Fits the payout reference constraint and remains
         * provider-neutral.
         */
        const idempotencyKey =
          `sw-prize-${randomUUID()}`;

        const normalizedName =
          claim.kycBankAccountName
            .trim()
            .replace(
              /\s+/g,
              ' ',
            )
            .toUpperCase();

        const accountNameHash =
          createHash(
            'sha256',
          )
            .update(
              normalizedName,
            )
            .digest(
              'hex',
            );

        const now =
          new Date();

        const attempt =
          await tx.prizePayoutAttempt.create({
            data: {
              claimId,

              attemptNumber,

              provider:
                providerCode,

              idempotencyKey,

              amountNgn:
                claim.netPrizeValueNgn,

              currency:
                'NGN',

              status:
                PrizePayoutStatus.REQUESTED,

              destinationBankCode:
                claim.kycBankCode,

              destinationAccountLast4:
                claim.payoutAccountNumber.slice(
                  -4,
                ),

              destinationAccountNameHash:
                accountNameHash,

              initiatedByAdminId:
                adminId,

              initiatedAt:
                now,
            },
          });

        /*
         * Compatibility summary.
         *
         * PrizePayoutAttempt is now the real history.
         * These fields remain useful for existing UI/code until
         * Phase 6 migration is fully completed.
         */
        await tx.prizeClaim.update({
          where: {
            claimId,
          },

          data: {
            payoutStatus:
              PrizePayoutStatus.REQUESTED,

            payoutProvider:
              providerCode,

            payoutReference:
              null,

            payoutIdempotencyKey:
              idempotencyKey,

            payoutInitiatedAt:
              now,

            payoutCompletedAt:
              null,

            payoutLastCheckedAt:
              null,

            payoutFailureReason:
              null,
          },
        });

        return {
          attemptId:
            attempt.attemptId,

          attemptNumber,

          idempotencyKey,

          winnerTicketRef:
            claim.winnerTicketRef,

          amountNgn:
            claim.netPrizeValueNgn,

          accountNumber:
            claim.payoutAccountNumber,

          bankCode:
            claim.kycBankCode,

          accountName:
            claim.kycBankAccountName,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async ensurePrizeAccrual(
    tx:
      Prisma.TransactionClient,

    claim: {
      claimId:
        string;

      winnerTicketRef:
        string;

      grossPrizeValueNgn:
        number;

      whtAmountNgn:
        number;

      netPrizeValueNgn:
        number;

      prizeAccrualLedgerTxnId:
        string | null;
    },
  ) {
    if (
      claim.prizeAccrualLedgerTxnId
    ) {
      return;
    }

    if (
      claim.grossPrizeValueNgn <=
        0 ||
      claim.netPrizeValueNgn <=
        0 ||
      claim.whtAmountNgn <
        0
    ) {
      throw new ConflictException(
        'Prize financial values are invalid',
      );
    }

    if (
      claim.grossPrizeValueNgn !==
      claim.netPrizeValueNgn +
        claim.whtAmountNgn
    ) {
      throw new ConflictException(
        'Prize gross/net/WHT values do not balance',
      );
    }

    const expense =
      await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_EXPENSE,
      );

    const payable =
      await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_PAYABLE,
      );

    const lines = [
      {
        accountId:
          expense.accountId,

        side:
          LedgerEntrySide.DEBIT,

        amountNgn:
          claim.grossPrizeValueNgn,

        memo:
          'Recognise prize expense',
      },

      {
        accountId:
          payable.accountId,

        side:
          LedgerEntrySide.CREDIT,

        amountNgn:
          claim.netPrizeValueNgn,

        memo:
          'Winner prize payable',
      },
    ];

    if (
      claim.whtAmountNgn >
      0
    ) {
      const wht =
        await this.requireAccount(
          tx,
          SYSTEM_LEDGER_ACCOUNT_CODES.WHT_PAYABLE,
        );

      lines.push({
        accountId:
          wht.accountId,

        side:
          LedgerEntrySide.CREDIT,

        amountNgn:
          claim.whtAmountNgn,

        memo:
          'Withholding tax payable',
      });
    }

    const journal =
      await this.ledger.postInTransaction(
        tx,
        {
          idempotencyKey:
            `ledger:prize-accrual:${claim.claimId}`,

          kind:
            LedgerTransactionKind.PRIZE_ACCRUAL,

          referenceType:
            'PrizeClaim',

          referenceId:
            claim.claimId,

          description:
            `Prize accrual for ${claim.winnerTicketRef}`,

          metadata: {
            claimId:
              claim.claimId,

            winnerTicketRef:
              claim.winnerTicketRef,

            grossPrizeValueNgn:
              claim.grossPrizeValueNgn,

            whtAmountNgn:
              claim.whtAmountNgn,

            netPrizeValueNgn:
              claim.netPrizeValueNgn,
          },

          lines,
        },
      );

    await tx.prizeClaim.update({
      where: {
        claimId:
          claim.claimId,
      },

      data: {
        prizeAccrualLedgerTxnId:
          journal.ledgerTxnId,
      },
    });
  }

  private async requireAccount(
    tx:
      Prisma.TransactionClient,

    code:
      string,
  ) {
    const account =
      await tx.ledgerAccount.findUnique({
        where: {
          code,
        },
      });

    if (!account) {
      throw new ConflictException(
        `Required ledger account ${code} does not exist`,
      );
    }

    return account;
  }

  private toView(
    attempt: {
      attemptId: string;
      claimId: string;
      attemptNumber: number;
      provider: string;
      idempotencyKey: string;
      amountNgn: number;
      currency: string;
      status: PrizePayoutStatus;
      providerReference: string | null;
      providerTransactionId: string | null;
      rawStatus: string | null;
      failureReason: string | null;
      destinationBankCode: string;
      destinationAccountLast4: string;
      initiatedByAdminId: string;
      initiatedAt: Date;
      lastCheckedAt: Date | null;
      completedAt: Date | null;
      payoutLedgerTxnId: string | null;
      reversalLedgerTxnId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ) {
    return {
      attemptId:
        attempt.attemptId,

      claimId:
        attempt.claimId,

      attemptNumber:
        attempt.attemptNumber,

      provider:
        attempt.provider,

      amountNgn:
        attempt.amountNgn,

      currency:
        attempt.currency,

      status:
        attempt.status,

      providerReference:
        attempt.providerReference,

      providerTransactionId:
        attempt.providerTransactionId,

      rawStatus:
        attempt.rawStatus,

      failureReason:
        attempt.failureReason,

      destination: {
        bankCode:
          attempt.destinationBankCode,

        accountLast4:
          attempt.destinationAccountLast4,
      },

      initiatedAt:
        attempt.initiatedAt.toISOString(),

      lastCheckedAt:
        attempt.lastCheckedAt
          ?.toISOString() ??
        null,

      completedAt:
        attempt.completedAt
          ?.toISOString() ??
        null,

      payoutLedgerTxnId:
        attempt.payoutLedgerTxnId,

      reversalLedgerTxnId:
        attempt.reversalLedgerTxnId,

      createdAt:
        attempt.createdAt.toISOString(),
    };
  }
}
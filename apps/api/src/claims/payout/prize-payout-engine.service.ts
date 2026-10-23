
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

import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { LedgerService } from '../../ledger/ledger.service';
import { SYSTEM_LEDGER_ACCOUNT_CODES } from '../../ledger/ledger.constants';

import { LockedPayoutDestinationService } from '../../payout-accounts/locked-payout-destination.service';
import { PayoutAccountCipherService } from '../../payout-accounts/payout-account-cipher.service';

import {
  PrizePayoutProviderCode,
  PrizePayoutProviderResult,
} from './prize-payout.provider';

import { PrizePayoutProviderRegistry } from './prize-payout-provider.registry';

import { PrizePayoutAttemptFinalizationService } from './prize-payout-attempt-finalization.service';

@Injectable()
export class PrizePayoutEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly providers: PrizePayoutProviderRegistry,
    private readonly finalizer: PrizePayoutAttemptFinalizationService,
    private readonly lockedDestination: LockedPayoutDestinationService,
    private readonly payoutCipher: PayoutAccountCipherService,
  ) {}

  // -------------------------------------------------------
  // INITIAL PAYOUT
  // -------------------------------------------------------

  async initiate(
    claimId: string,
    adminId: string,
    providerCode: PrizePayoutProviderCode,
  ) {
    return this.startAttempt(
      claimId,
      adminId,
      providerCode,
      false,
    );
  }

  // -------------------------------------------------------
  // FAILED / REVERSED PAYOUT RETRY
  // -------------------------------------------------------

  async retry(
    claimId: string,
    adminId: string,
    providerCode: PrizePayoutProviderCode,
  ) {
    return this.startAttempt(
      claimId,
      adminId,
      providerCode,
      true,
    );
  }

  // -------------------------------------------------------
  // REFRESH CURRENT PROVIDER STATUS
  // -------------------------------------------------------

  async refreshCurrent(
    claimId: string,
    adminId: string,
  ) {
    const attempt =
      await this.prisma.prizePayoutAttempt.findFirst({
        where: { claimId },
        orderBy: {
          attemptNumber: 'desc',
        },
      });

    if (!attempt) {
      throw new NotFoundException(
        'No payout attempt exists for this claim',
      );
    }

    // Terminal results must not be submitted again
    // merely because an admin requests a refresh.
    if (
      attempt.status === PrizePayoutStatus.SUCCEEDED ||
      attempt.status === PrizePayoutStatus.FAILED ||
      attempt.status === PrizePayoutStatus.REVERSED
    ) {
      return this.getAttempt(attempt.attemptId);
    }

    const provider = this.providers.get(
      attempt.provider,
    );

    const reference =
      attempt.providerReference ??
      attempt.idempotencyKey;

    let result: PrizePayoutProviderResult;

    try {
      result = await provider.getStatus(reference);
    } catch {
      // Provider exceptions may contain sensitive
      // destination details. Do not store raw messages.
      await this.audit.write({
        severity: AuditSeverity.WARNING,
        actor: {
          type: AuditActorType.ADMIN,
          id: adminId,
        },
        action: 'PRIZE_PAYOUT_ATTEMPT_REFRESH_FAILED',
        resource: {
          type: 'PrizePayoutAttempt',
          id: attempt.attemptId,
        },
        metadata: {
          provider: attempt.provider,
          reference,
          error: 'PROVIDER_STATUS_REFRESH_FAILED',
        },
      });

      throw new ConflictException(
        'Payout status could not be refreshed. Reconcile the existing attempt before retrying.',
      );
    }

    await this.finalizer.applyForAttempt(
      attempt.attemptId,
      result,
      {
        type: AuditActorType.ADMIN,
        id: adminId,
      },
    );

    return this.getAttempt(attempt.attemptId);
  }

  // -------------------------------------------------------
  // LIST ALL ATTEMPTS FOR A CLAIM
  // -------------------------------------------------------

  async listAttempts(claimId: string) {
    const claim =
      await this.prisma.prizeClaim.findUnique({
        where: { claimId },
        select: {
          claimId: true,
          winnerTicketRef: true,
        },
      });

    if (!claim) {
      throw new NotFoundException(
        'Claim not found',
      );
    }

    const attempts =
      await this.prisma.prizePayoutAttempt.findMany({
        where: { claimId },
        orderBy: {
          attemptNumber: 'asc',
        },
      });

    return {
      claimId: claim.claimId,
      winnerTicketRef: claim.winnerTicketRef,
      attempts: attempts.map((attempt) =>
        this.toView(attempt),
      ),
    };
  }

  // -------------------------------------------------------
  // FETCH ONE PAYOUT ATTEMPT
  // -------------------------------------------------------

  async getAttempt(attemptId: string) {
    const attempt =
      await this.prisma.prizePayoutAttempt.findUnique({
        where: { attemptId },
      });

    if (!attempt) {
      throw new NotFoundException(
        'Prize payout attempt not found',
      );
    }

    return this.toView(attempt);
  }

  // -------------------------------------------------------
  // PROVIDER EXECUTION
  // -------------------------------------------------------

  private async startAttempt(
    claimId: string,
    adminId: string,
    providerCode: PrizePayoutProviderCode,
    retry: boolean,
  ) {
    const provider = this.providers.get(
      providerCode,
    );

    // All authorization, destination verification,
    // financial checks, and reservation happen here.
    const reserved = await this.reserveAttempt(
      claimId,
      adminId,
      provider.providerCode,
      retry,
    );

    // Audit only masked destination information.
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: {
        type: AuditActorType.ADMIN,
        id: adminId,
      },
      action: retry
        ? 'PRIZE_PAYOUT_RETRY_REQUESTED'
        : 'PRIZE_PAYOUT_ATTEMPT_REQUESTED',
      resource: {
        type: 'PrizePayoutAttempt',
        id: reserved.attemptId,
      },
      metadata: {
        claimId,
        attemptNumber: reserved.attemptNumber,
        provider: provider.providerCode,
        amountNgn: reserved.amountNgn,
        accountLast4: reserved.accountLast4,
      },
    });

    let result: PrizePayoutProviderResult;

    try {
      // IMPORTANT:
      // The provider receives the account number
      // decrypted from the LOCKED beneficiary.
      //
      // This must never come from a request body or
      // PrizeClaim.payoutAccountNumber.
      result = await provider.initiate({
        idempotencyKey: reserved.idempotencyKey,
        accountNumber: reserved.accountNumber,
        bankCode: reserved.bankCode,
        accountName: reserved.accountName,
        amountNgn: reserved.amountNgn,
        reason: `SureWina prize ${reserved.winnerTicketRef}`,
      });
    } catch {
      // Once provider initiation has been attempted,
      // an exception does not establish that money
      // was never transferred.
      //
      // UNKNOWN prevents automatic resubmission and
      // requires reconciliation.
      //
      // Do not persist unfiltered provider exceptions
      // because they may contain bank account details.
      result = {
        provider: provider.providerCode,
        reference: reserved.idempotencyKey,
        providerTransactionId: null,
        status: PrizePayoutStatus.UNKNOWN,
        rawStatus: 'PROVIDER_EXCEPTION',
        failureReason:
          'Provider initiation outcome is uncertain; reconciliation required',
      };
    }

    await this.finalizer.applyForAttempt(
      reserved.attemptId,
      result,
      {
        type: AuditActorType.ADMIN,
        id: adminId,
      },
    );

    return this.getAttempt(reserved.attemptId);
  }

  // -------------------------------------------------------
  // PHASE 3D: SECURE PAYOUT RESERVATION
  // -------------------------------------------------------

  private async reserveAttempt(
    claimId: string,
    adminId: string,
    providerCode: PrizePayoutProviderCode,
    retry: boolean,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        // Serialize payout requests for the same claim.
        await tx.$queryRaw`
          SELECT "claim_id"
          FROM "prize_claims"
          WHERE "claim_id" = ${claimId}
          FOR UPDATE
        `;

        const claim =
          await tx.prizeClaim.findUnique({
            where: { claimId },
            select: {
              claimId: true,
              winnerTicketRef: true,
              winnerPhone: true,
              winnerUserId: true,

              claimType: true,
              status: true,

              grossPrizeValueNgn: true,
              whtAmountNgn: true,
              netPrizeValueNgn: true,

              prizeAccrualLedgerTxnId: true,

              kycBankCode: true,
              kycBankAccountLast4: true,
              kycBankAccountName: true,

              payoutStatus: true,
              payoutReference: true,
              paidByAgentId: true,
            },
          });

        if (!claim) {
          throw new NotFoundException(
            'Claim not found',
          );
        }

        if (claim.claimType !== ClaimType.CASH) {
          throw new ConflictException(
            'Only cash claims can use bank payouts',
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

        // Find historical attempts BEFORE reserving
        // any new financial work.
        const latest =
          await tx.prizePayoutAttempt.findFirst({
            where: { claimId },
            orderBy: {
              attemptNumber: 'desc',
            },
          });

        // ---------------------------------------------------
        // HISTORICAL PAYOUT PROTECTION
        // ---------------------------------------------------

        // Agent cash settlement can never be followed
        // by a new bank payout.
        if (claim.paidByAgentId) {
          throw new ConflictException(
            'Claim already has an agent payout record',
          );
        }

        // Legacy claims may have been paid before the
        // PrizePayoutAttempt table became authoritative.
        //
        // A previous payout record without attempt
        // history requires manual reconciliation.
        if (
          !latest &&
          (
            claim.payoutStatus !== null ||
            claim.payoutReference !== null
          )
        ) {
          throw new ConflictException(
            'Historical payout state requires reconciliation before bank payout',
          );
        }

        // ---------------------------------------------------
        // INITIAL ATTEMPT / RETRY VALIDATION
        // ---------------------------------------------------

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
            latest.status !== PrizePayoutStatus.FAILED &&
            latest.status !== PrizePayoutStatus.REVERSED
          ) {
            throw new ConflictException(
              `Payout cannot be retried while latest attempt is ${latest.status}`,
            );
          }

          // A mismatch between the compatibility
          // claim status and attempt history requires
          // reconciliation, not another transfer.
          if (
            claim.payoutStatus !== latest.status
          ) {
            throw new ConflictException(
              'Claim payout status and attempt history are inconsistent',
            );
          }
        }

        // ---------------------------------------------------
        // LOCKED BENEFICIARY AUTHORIZATION
        // ---------------------------------------------------

        // This service:
        // - Finds the actual winning customer.
        // - Requires a LOCKED beneficiary.
        // - Checks Paystack ownership evidence.
        // - Verifies the FULL ten-digit NUBAN.
        // - Decrypts the approved destination.
        //
        // It also takes the customer row lock, using
        // the same claim -> customer ordering used
        // by the verification and compliance flows.
        const destination =
          await this.lockedDestination.requireLocked(
            tx,
            claim,
          );

        const normalizedName =
          destination.accountName
            .trim()
            .replace(/\s+/g, ' ')
            .toUpperCase();

        const accountNameHash =
          createHash('sha256')
            .update(normalizedName)
            .digest('hex');

        // ---------------------------------------------------
        // RETRY DESTINATION INTEGRITY
        // ---------------------------------------------------

        if (retry && latest) {
          // Previous legacy attempts without a complete
          // destination snapshot cannot be retried
          // automatically.
          if (
            !latest.verifiedPayoutAccountId ||
            !latest.destinationAccountFingerprint ||
            !latest.destinationAccountCiphertext
          ) {
            throw new ConflictException(
              'Previous payout destination requires manual reconciliation',
            );
          }

          // Compare beneficiary identity, bank code,
          // fingerprint, masked account number and name.
          if (
            latest.verifiedPayoutAccountId !==
              destination.payoutAccountId ||
            latest.destinationAccountFingerprint !==
              destination.fingerprint ||
            latest.destinationBankCode !==
              destination.bankCode ||
            latest.destinationAccountLast4 !==
              destination.accountLast4 ||
            latest.destinationAccountNameHash !==
              accountNameHash
          ) {
            throw new ConflictException(
              'Payout retry destination does not match the previous attempt',
            );
          }

          // Decrypt the historical encrypted snapshot.
          //
          // This detects tampered ciphertext and
          // compares the ENTIRE original account number
          // against the currently locked beneficiary.
          //
          // No plaintext account is logged or returned.
          const previousAccountNumber =
            this.payoutCipher.decrypt(
              destination.userId,
              latest.destinationBankCode,
              latest.destinationAccountCiphertext,
            );

          if (
            previousAccountNumber !==
            destination.accountNumber
          ) {
            throw new ConflictException(
              'Payout retry cannot change the destination account',
            );
          }
        }

        // ---------------------------------------------------
        // FINANCIAL ACCOUNTING
        // ---------------------------------------------------

        // Existing double-entry prize accounting
        // must remain unchanged.
        await this.ensurePrizeAccrual(tx, claim);

        const attemptNumber =
          (latest?.attemptNumber ?? 0) + 1;

        // Each new attempt gets a fresh reference.
        //
        // A provider-uncertain attempt is never
        // automatically retried with a new reference.
        const idempotencyKey =
          `sw-prize-${randomUUID()}`;

        const now = new Date();

        // ---------------------------------------------------
        // IMMUTABLE ENCRYPTED DESTINATION SNAPSHOT
        // ---------------------------------------------------

        const attempt =
          await tx.prizePayoutAttempt.create({
            data: {
              claimId,
              attemptNumber,

              provider: providerCode,
              idempotencyKey,

              amountNgn: claim.netPrizeValueNgn,
              currency: 'NGN',

              status: PrizePayoutStatus.REQUESTED,

              verifiedPayoutAccountId:
                destination.payoutAccountId,

              destinationAccountFingerprint:
                destination.fingerprint,

              destinationAccountCiphertext:
                destination.snapshotCiphertext,

              destinationBankCode:
                destination.bankCode,

              destinationAccountLast4:
                destination.accountLast4,

              destinationAccountNameHash:
                accountNameHash,

              initiatedByAdminId: adminId,
              initiatedAt: now,
            },
          });

        // ---------------------------------------------------
        // UPDATE COMPATIBILITY PAYOUT SUMMARY
        // ---------------------------------------------------

        // Preserve existing financial dashboard and
        // payout recovery compatibility fields.
        //
        // Do NOT store any plaintext bank account
        // number on PrizeClaim.
        await tx.prizeClaim.update({
          where: { claimId },
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

        // Sensitive destination information exists
        // only inside this server-side execution path.
        return {
          attemptId: attempt.attemptId,
          attemptNumber,
          idempotencyKey,

          winnerTicketRef:
            claim.winnerTicketRef,

          amountNgn:
            claim.netPrizeValueNgn,

          payoutAccountId:
            destination.payoutAccountId,

          accountNumber:
            destination.accountNumber,

          accountLast4:
            destination.accountLast4,

          bankCode:
            destination.bankCode,

          accountName:
            destination.accountName,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  // -------------------------------------------------------
  // PRIZE ACCRUAL ACCOUNTING
  // -------------------------------------------------------

  private async ensurePrizeAccrual(
    tx: Prisma.TransactionClient,
    claim: {
      claimId: string;
      winnerTicketRef: string;
      grossPrizeValueNgn: number;
      whtAmountNgn: number;
      netPrizeValueNgn: number;
      prizeAccrualLedgerTxnId: string | null;
    },
  ) {
    if (claim.prizeAccrualLedgerTxnId) {
      return;
    }

    if (
      claim.grossPrizeValueNgn <= 0 ||
      claim.netPrizeValueNgn <= 0 ||
      claim.whtAmountNgn < 0
    ) {
      throw new ConflictException(
        'Prize financial values are invalid',
      );
    }

    if (
      claim.grossPrizeValueNgn !==
      claim.netPrizeValueNgn + claim.whtAmountNgn
    ) {
      throw new ConflictException(
        'Prize gross/net/WHT values do not balance',
      );
    }

    const expense = await this.requireAccount(
      tx,
      SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_EXPENSE,
    );

    const payable = await this.requireAccount(
      tx,
      SYSTEM_LEDGER_ACCOUNT_CODES.PRIZE_PAYABLE,
    );

    const lines = [
      {
        accountId: expense.accountId,
        side: LedgerEntrySide.DEBIT,
        amountNgn: claim.grossPrizeValueNgn,
        memo: 'Recognise prize expense',
      },
      {
        accountId: payable.accountId,
        side: LedgerEntrySide.CREDIT,
        amountNgn: claim.netPrizeValueNgn,
        memo: 'Winner prize payable',
      },
    ];

    if (claim.whtAmountNgn > 0) {
      const wht = await this.requireAccount(
        tx,
        SYSTEM_LEDGER_ACCOUNT_CODES.WHT_PAYABLE,
      );

      lines.push({
        accountId: wht.accountId,
        side: LedgerEntrySide.CREDIT,
        amountNgn: claim.whtAmountNgn,
        memo: 'Withholding tax payable',
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
            claimId: claim.claimId,
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
        claimId: claim.claimId,
      },
      data: {
        prizeAccrualLedgerTxnId:
          journal.ledgerTxnId,
      },
    });
  }

  // -------------------------------------------------------
  // LEDGER ACCOUNT LOOKUP
  // -------------------------------------------------------

  private async requireAccount(
    tx: Prisma.TransactionClient,
    code: string,
  ) {
    const account = await tx.ledgerAccount.findUnique({
      where: { code },
    });

    if (!account) {
      throw new ConflictException(
        `Required ledger account ${code} does not exist`,
      );
    }

    return account;
  }

  // -------------------------------------------------------
  // SAFE API REPRESENTATION
  // -------------------------------------------------------

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
    // Never expose:
    // - Full bank account number
    // - Encrypted beneficiary account
    // - Encrypted payout snapshot
    // - Account fingerprint
    // - Encryption keys

    return {
      attemptId: attempt.attemptId,
      claimId: attempt.claimId,
      attemptNumber: attempt.attemptNumber,

      provider: attempt.provider,

      amountNgn: attempt.amountNgn,
      currency: attempt.currency,

      status: attempt.status,

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
        attempt.lastCheckedAt?.toISOString() ??
        null,

      completedAt:
        attempt.completedAt?.toISOString() ??
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


import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  ClaimType,
  KycIdentityCheckStatus,
  Prisma,
  PrizeClaimStatus,
  VerifiedPayoutAccountStatus,
  PrizePayoutStatus,
  WalletWithdrawalStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { PayoutAccountCipherService } from '../../payout-accounts/payout-account-cipher.service';
import { StartKycIdentityDto } from '../dto/start-kyc-identity.dto';
import { BankResolveService } from './bank-resolve.service';
import { KycIdentityEvidenceService } from './kyc-identity-evidence.service';
import { PaystackIdentityClient } from './paystack-identity.client';
import { BankChangeStepUpService } from '../../payout-accounts/bank-change-step-up.service'
@Injectable()
export class PaystackIdentityCoordinatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly banks: BankResolveService,
    private readonly evidence: KycIdentityEvidenceService,
    private readonly paystack: PaystackIdentityClient,
    private readonly cipher: PayoutAccountCipherService,
    private readonly bankChange: BankChangeStepUpService
  ) {}

  async start(
    claimId: string,
    phoneNumber: string,
    input: StartKycIdentityDto,
  ): Promise<{ status: 'SUBMITTED' }> {
    // Explicit consent is mandatory.
    // Never submit identity information without authorization.
    if (input.consent !== true) {
      throw new BadRequestException(
        'Explicit identity verification consent is required',
      );
    }

    // Generate a deterministic fingerprint of the full
    // bank code and account number.
    //
    // A missing fingerprint key must fail closed.
    const fingerprint = this.evidence.fingerprintAccount(
      input.bankCode,
      input.accountNumber,
    );

    // Confirm the bank account exists through Paystack.
    // Bank resolution alone is NOT ownership verification.
    const resolved = await this.banks.resolve(
      input.accountNumber,
      input.bankCode,
    );

    // Retrieve the canonical Nigerian bank name.
    const { banks } = await this.banks.listBanks();

    const selectedBank = banks.find(
      (bank) => bank.code === input.bankCode,
    );

    if (!selectedBank) {
      throw new BadRequestException(
        'Unsupported Nigerian bank',
      );
    }

    // Reserve the identity verification attempt and
    // payout-account record in one transaction.
    //
    // The claim and customer are locked so simultaneous
    // requests cannot silently replace an approved account.
    const attempt = await this.prisma.$transaction(
      async (tx) => {
        // Serialize operations against this prize claim.
        await tx.$queryRaw`
          SELECT "claim_id"
          FROM "prize_claims"
          WHERE "claim_id" = ${claimId}
          FOR UPDATE
        `;

        const claim = await tx.prizeClaim.findUnique({
          where: { claimId },
        });

        if (!claim || claim.winnerPhone !== phoneNumber) {
          throw new NotFoundException('Claim not found');
        }

        const kycOpen: PrizeClaimStatus[] = [
          PrizeClaimStatus.SELECTION_MADE,
          PrizeClaimStatus.KYC_PENDING,
          PrizeClaimStatus.KYC_CLEARED
        ];

        if (
          claim.claimType !== ClaimType.CASH ||
          !kycOpen.includes(claim.status)
        ) {
          throw new ConflictException(
            'Cash claim is not open for identity verification',
          );
        }

        if (claim.claimDeadlineAt.getTime() <= Date.now()) {
          throw new ConflictException(
            'The claim window has closed',
          );
        }

        if (!claim.kycIdDocPath || !claim.kycSelfiePath) {
          throw new ConflictException(
            'Upload your ID document and selfie first',
          );
        }

        // Resolve the actual SureWina customer.
        // Never use an untrusted customer ID from the request.
        const user = await tx.user.findUnique({
          where: { phoneNumber },
          select: { userId: true },
        });

        if (
          !user ||
          (claim.winnerUserId &&
            claim.winnerUserId !== user.userId)
        ) {
          throw new NotFoundException(
            'Customer account not found',
          );
        }

        // Serialize payout-account registration across
        // multiple claims belonging to the same customer.
        await tx.$queryRaw`
          SELECT "user_id"
          FROM "users"
          WHERE "user_id" = ${user.userId}
          FOR UPDATE
        `;

        // Find the most recent identity attempt for this claim.
        
        const existing = await tx.kycIdentityCheck.findFirst({
          where: { claimId },
          orderBy: { attemptNumber: 'desc' },
        });

        const approved = await tx.verifiedPayoutAccount.findFirst({
          where: {
            userId: user.userId,
            status: {
              in: [
                VerifiedPayoutAccountStatus.VERIFIED,
                VerifiedPayoutAccountStatus.LOCKED,
              ],
            },
          },
        });

        const replacing = Boolean(
          approved &&
            (
              approved.bankCode !== input.bankCode ||
              approved.accountFingerprint !== fingerprint
            ),
        );

        // KYC_CLEARED claims are not open for another ordinary
        // identity submission. An authorized bank change
        // is the only exception.
        if (
          claim.status === PrizeClaimStatus.KYC_CLEARED &&
          !replacing
        ) {
          throw new ConflictException(
            'This claim has already completed KYC',
          );
        }

        // A previous VERIFIED check may only be superseded
        // through authorized bank replacement.
        //
        // A failed replacement may be retried with fresh
        // step-up authorization.
        const replacingPreviouslyVerified =
          replacing &&
          claim.status === PrizeClaimStatus.KYC_CLEARED &&
          existing?.status === KycIdentityCheckStatus.VERIFIED;

        const retryingFailedChange =
          replacing &&
          claim.status === PrizeClaimStatus.KYC_PENDING &&
          existing?.status === KycIdentityCheckStatus.FAILED &&
          !!existing.bankChangeAuthorizedAt;

        if (
          existing &&
          existing.status !== KycIdentityCheckStatus.FAILED &&
          !replacingPreviouslyVerified
        ) {
            throw new ConflictException(
              'Identity verification is pending, inconclusive, or already verified',
            );
          }

        if (existing && existing.attemptNumber >= 3) {
          throw new ConflictException(
            'Maximum identity verification attempts reached; contact support',
          );
        }

        if (
          existing?.failedAt &&
          Date.now() - existing.failedAt.getTime() < 60_000
        ) {
          throw new ConflictException(
            'Please allow a minute before retrying verification',
          );
        }

        if (replacing) {
          if (
            !replacingPreviouslyVerified &&
            !retryingFailedChange
          ) {
            throw new ConflictException(
              'Bank replacement is not permitted in the current KYC state',
            );
          }

          if (
            claim.payoutStatus ||
            claim.payoutReference ||
            claim.paidByAgentId
          ) {
            throw new ConflictException(
              'Payout history must be reconciled before changing banks',
            );
          }

          const previousAttempt =
            await tx.prizePayoutAttempt.findFirst({
      where: { claimId },
      select: { attemptId: true },
    });

  if (previousAttempt) {
    throw new ConflictException(
      'Bank cannot be changed after a payout attempt',
    );
  }

  const inFlightStatuses: PrizePayoutStatus[] = [
    PrizePayoutStatus.REQUESTED,
    PrizePayoutStatus.SUBMITTED,
    PrizePayoutStatus.PROCESSING,
    PrizePayoutStatus.UNKNOWN,
  ];

  const unresolved =
    await tx.prizePayoutAttempt.findFirst({
      where: {
        claim: {
          winnerPhone: phoneNumber,
        },
        status: {
          in: inFlightStatuses,
        },
      },
      select: { attemptId: true },
    });

  const unresolvedLegacy = await tx.prizeClaim.findFirst({
    where: {
      winnerPhone: phoneNumber,
      payoutStatus: {
        in: inFlightStatuses,
      },
    },
    select: { claimId: true },
  });

  if (unresolved || unresolvedLegacy) {
    throw new ConflictException(
      'Unresolved payouts prevent bank replacement',
    );
  }

  // The user row was locked above, and the withdrawal reservation
  // also locks that row. This prevents a bank change racing with
  // a newly created wallet withdrawal.
  const outstandingWithdrawal = await tx.walletWithdrawal.findFirst({
    where: {
      userId: user.userId,
      status: {
        in: [
          WalletWithdrawalStatus.RESERVED,
          WalletWithdrawalStatus.CBA_DEBIT_UNKNOWN,
          WalletWithdrawalStatus.CBA_DEBIT_CONFIRMED,
          WalletWithdrawalStatus.BANK_TRANSFER_PENDING,
          WalletWithdrawalStatus.BANK_TRANSFER_UNKNOWN,
          WalletWithdrawalStatus.RESTORE_REQUIRED,
          WalletWithdrawalStatus.REVIEW_REQUIRED,
        ],
      },
    },
    select: { withdrawalId: true },
  });

  if (outstandingWithdrawal) {
    throw new ConflictException(
      'Bank beneficiary cannot be changed while a wallet withdrawal is unresolved',
    );
  }

  // Consume the single-use authorization.
  // A failed database transaction requires fresh OTP.
  await this.bankChange.consume(
    user.userId,
    claimId,
    fingerprint,
    input.bankChangeGrant,
  );
}


        // Find any existing pending payout account.
        const pending = await tx.verifiedPayoutAccount.findFirst({
          where: {
            userId: user.userId,
            status: VerifiedPayoutAccountStatus.PENDING,
          },
        });

        if (pending) {
          // A definitive failed verification can leave a
          // PENDING payout-account row behind.
          //
          // It is safe to revoke that row only when it
          // belongs to the exact failed identity attempt
          // for this claim.
          const recoverableFailedAttempt =
            existing?.status === KycIdentityCheckStatus.FAILED &&
            pending.identityCheckId === existing.checkId;

          if (!recoverableFailedAttempt) {
            throw new ConflictException(
              'A payout account verification is already pending',
            );
          }

          await tx.verifiedPayoutAccount.update({
            where: {
              payoutAccountId: pending.payoutAccountId,
            },
            data: {
              status: VerifiedPayoutAccountStatus.REVOKED,
              revokedAt: new Date(),
            },
          });
        }

        // Reserve a new identity verification attempt.
        const row = await tx.kycIdentityCheck.create({
          data: {
            claimId,
            attemptNumber:
              (existing?.attemptNumber ?? 0) + 1,
            provider: 'PAYSTACK',
            status: KycIdentityCheckStatus.PREPARING,
            bankCode: input.bankCode,
            bankAccountLast4:
              input.accountNumber.slice(-4),
            bankAccountFingerprint: fingerprint,
            bankChangeAuthorizedAt: replacing ? new Date() : null,
          },
        });

        // A customer who has no approved beneficiary
        // receives a new PENDING payout-account record.
        //
        // No payout is permitted while the row is PENDING.
        if (!approved || replacing) {
          const encryptedAccountNumber =
            this.cipher.encrypt(
              user.userId,
              input.bankCode,
              input.accountNumber,
            );

          await tx.verifiedPayoutAccount.create({
            data: {
              userId: user.userId,
              currency: 'NGN',

              bankCode: input.bankCode,
              bankName: selectedBank.name,

              accountCiphertext: encryptedAccountNumber,
              accountLast4:
                input.accountNumber.slice(-4),
              accountFingerprint: fingerprint,

              resolvedAccountName:
                resolved.accountName,

              status:
                VerifiedPayoutAccountStatus.PENDING,

              identityCheckId: row.checkId,

              verifiedAt: null,
              lockedAt: null,
              revokedAt: null,
            },
          });
        }

        // Move the claim into KYC_PENDING.
        //
        // Clear legacy BVN evidence so it cannot
        // authorize any future payout.
        await tx.prizeClaim.update({
          where: { claimId },
          data: {
            status: PrizeClaimStatus.KYC_PENDING,

            kycBvnVerifiedAt: null,
            kycBvnHash: null,

            kycBankCode: input.bankCode,
            kycBankAccountLast4:
              input.accountNumber.slice(-4),
            kycBankAccountName:
              resolved.accountName,
          },
        });

        return row;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    try {
      // Create a unique Paystack customer reference
      // for this identity verification attempt.
      //
      // Never trust a customer_code supplied by the client.
      const customerCode = await this.paystack.createCustomer({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: phoneNumber,
      });

      // Persist the provider identity reference before
      // submitting the BVN verification request.
      await this.prisma.kycIdentityCheck.update({
        where: {
          checkId: attempt.checkId,
        },
        data: {
          paystackCustomerCode: customerCode,
        },
      });

      // Mark the request submitted before contacting
      // Paystack so a fast webhook can correlate correctly.
      await this.prisma.kycIdentityCheck.update({
        where: {
          checkId: attempt.checkId,
        },
        data: {
          status: KycIdentityCheckStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });

      // Submit the customer's BVN and nominated bank
      // account for Paystack identity verification.
      //
      // Acceptance is NOT ownership approval.
      await this.paystack.submit({
        customerCode,
        bvn: input.bvn,
        accountNumber: input.accountNumber,
        bankCode: input.bankCode,
        firstName: input.firstName,
        lastName: input.lastName,
      });
    } catch {
      // Fail closed when the provider result is uncertain.
      //
      // Do not downgrade a VERIFIED or FAILED result
      // that may already have arrived through a webhook.
      await this.prisma.kycIdentityCheck.updateMany({
        where: {
          checkId: attempt.checkId,
          status: {
            in: [
              KycIdentityCheckStatus.PREPARING,
              KycIdentityCheckStatus.SUBMITTED,
            ],
          },
        },
        data: {
          status: KycIdentityCheckStatus.UNKNOWN,
        },
      });

      // Leave the payout account PENDING.
      // Manual reconciliation is required before retrying.
      throw new ServiceUnavailableException(
        'Identity verification is unavailable or its outcome is uncertain; contact support',
      );
    }

    // Paystack has accepted the verification request.
    //
    // Only the authenticated identity webhook may
    // provide the final VERIFIED or FAILED outcome.
    return {
      status: 'SUBMITTED',
    };
  }
}

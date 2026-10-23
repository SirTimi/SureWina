
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ClaimType,
  KycIdentityCheckStatus,
  Prisma,
  PrizeClaimStatus,
  VerifiedPayoutAccountStatus,
  PrizePayoutStatus
} from '@prisma/client';
import {
  AuditActorType,
  AuditSeverity
} from '@prisma/client'
import { PrismaService } from '../../database/prisma.service';
import { PayoutAccountCipherService } from '../../payout-accounts/payout-account-cipher.service';
import type { PaystackEvent } from '../../payments/webhook/paystack-webhook.service';
import { KycIdentityEvidenceService } from './kyc-identity-evidence.service';

/**
 * Handles identity events forwarded by the existing signed
 * Paystack webhook endpoint.
 *
 * This service must never be exposed through a separate
 * unauthenticated HTTP controller.
 */
@Injectable()
export class PaystackIdentityWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: KycIdentityEvidenceService,
    private readonly cipher: PayoutAccountCipherService,
  ) {}

  async handleWebhook(event: PaystackEvent): Promise<void> {
    const isSuccess =
      event.event === 'customeridentification.success';

    const isFailure =
      event.event === 'customeridentification.failed';

    if (!isSuccess && !isFailure) {
      throw new BadRequestException(
        'Unexpected Paystack identification event',
      );
    }

    const payload = event.data;
    const customerCode = payload?.customer_code;
    const identification = payload?.identification;

    if (
      !customerCode ||
      !/^CUS_[A-Za-z0-9]+$/.test(customerCode) ||
      identification?.country !== 'NG' ||
      identification.type !== 'bank_account' ||
      typeof identification.bank_code !== 'string' ||
      typeof identification.account_number !== 'string' ||
      typeof identification.bvn !== 'string'
    ) {
      throw new BadRequestException(
        'Invalid Paystack identification payload',
      );
    }

    // The provider supplies masked identity details.
    // Never persist or log raw or masked BVN values.
    const maskedAccount = identification.account_number;
    const maskedBvn = identification.bvn;

    if (
      !/^\d{3}\*+\d{3}$/.test(maskedAccount) ||
      !/^\d{3}\*+\d{3}$/.test(maskedBvn)
    ) {
      throw new BadRequestException(
        'Unexpected Paystack masked identity format',
      );
    }

    const known = await this.prisma.kycIdentityCheck.findUnique({
      where: {
        paystackCustomerCode: customerCode,
      },
      select: {
        claimId: true,
      },
    });

    if (!known) {
      throw new NotFoundException(
        'No matching verification request',
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        // Keep the same lock ordering as the coordinator:
        // claim first, then customer.
        await tx.$queryRaw`
          SELECT "claim_id"
          FROM "prize_claims"
          WHERE "claim_id" = ${known.claimId}
          FOR UPDATE
        `;

        const claim = await tx.prizeClaim.findUnique({
          where: {
            claimId: known.claimId,
          },
        });

        if (!claim || claim.claimType !== ClaimType.CASH) {
          throw new ConflictException(
            'Invalid cash claim for identity verification',
          );
        }

        const user = await tx.user.findUnique({
          where: {
            phoneNumber: claim.winnerPhone,
          },
          select: {
            userId: true,
          },
        });

        if (
          !user ||
          (
            claim.winnerUserId &&
            claim.winnerUserId !== user.userId
          )
        ) {
          throw new ConflictException(
            'Claim and customer ownership mismatch',
          );
        }

        await tx.$queryRaw`
          SELECT "user_id"
          FROM "users"
          WHERE "user_id" = ${user.userId}
          FOR UPDATE
        `;

        const latest = await tx.kycIdentityCheck.findFirst({
          where: {
            claimId: known.claimId,
          },
          orderBy: {
            attemptNumber: 'desc',
          },
        });

        if (
          !latest ||
          latest.paystackCustomerCode !== customerCode ||
          latest.provider !== 'PAYSTACK'
        ) {
          throw new ConflictException(
            'Paystack verification correlation mismatch',
          );
        }

        if (!latest.submittedAt) {
          throw new ConflictException(
            'No identity submission exists for this event',
          );
        }

        if (
          latest.bankCode !== identification.bank_code ||
          latest.bankAccountLast4.slice(-3) !==
            maskedAccount.slice(-3) ||
          claim.kycBankCode !== latest.bankCode ||
          claim.kycBankAccountLast4 !==
            latest.bankAccountLast4 ||
          !claim.kycBankAccountName ||
          !/^[a-f0-9]{64}$/i.test(
            latest.bankAccountFingerprint,
          )
        ) {
          throw new ConflictException(
            'Verification does not match nominated bank details',
          );
        }

        const terminalStatus = isSuccess
          ? KycIdentityCheckStatus.VERIFIED
          : KycIdentityCheckStatus.FAILED;

        // Duplicate delivery must never repeat state changes.
        if (latest.status === terminalStatus) {
          return;
        }

        if (
          latest.status === KycIdentityCheckStatus.VERIFIED ||
          latest.status === KycIdentityCheckStatus.FAILED
        ) {
          throw new ConflictException(
            'Conflicting Paystack identity outcomes',
          );
        }

        if (claim.status !== PrizeClaimStatus.KYC_PENDING) {
          throw new ConflictException(
            'Claim is no longer awaiting identity verification',
          );
        }

        if (
          latest.status !== KycIdentityCheckStatus.SUBMITTED &&
          latest.status !== KycIdentityCheckStatus.UNKNOWN
        ) {
          throw new ConflictException(
            'Verification not eligible for completion',
          );
        }

        // Find the beneficiary created for this exact attempt.
        const pendingAccount =
          await tx.verifiedPayoutAccount.findUnique({
            where: {
              identityCheckId: latest.checkId,
            },
          });

        // Customers with an approved beneficiary may
        // verify that same bank account for a new claim
        // without creating another beneficiary record.
        const approvedAccount = pendingAccount
          ? null
          : await tx.verifiedPayoutAccount.findFirst({
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

        const account = pendingAccount ?? approvedAccount;

        if (!account) {
          throw new ConflictException(
            'No registered payout account matches this verification',
          );
        }

        if (
          account.userId !== user.userId ||
          account.currency !== 'NGN' ||
          account.bankCode !== latest.bankCode ||
          account.accountLast4 !==
            latest.bankAccountLast4 ||
          account.accountFingerprint !==
            latest.bankAccountFingerprint ||
          !account.resolvedAccountName ||
          account.resolvedAccountName
            .trim()
            .replace(/\s+/g, ' ')
            .toUpperCase() !==
            claim.kycBankAccountName
              .trim()
              .replace(/\s+/g, ' ')
              .toUpperCase()
        ) {
          throw new ConflictException(
            'Registered payout account does not match identity evidence',
          );
        }

        if (
          pendingAccount &&
          pendingAccount.status !==
            VerifiedPayoutAccountStatus.PENDING
        ) {
          throw new ConflictException(
            'Payout account is not awaiting verification',
          );
        }

        // Authenticated decryption validates the customer
        // and bank binding of the encrypted account number.
        const accountNumber = this.cipher.decrypt(
          user.userId,
          account.bankCode,
          account.accountCiphertext,
        );

        // Compare the ENTIRE account number using the
        // existing HMAC identity evidence, not just last4.
        this.evidence.assertDestinationMatches(
          latest,
          account.bankCode,
          accountNumber,
        );

        
// Only a beneficiary registered against the exact
// identity check may be used for replacement.
if (latest.bankChangeAuthorizedAt && !pendingAccount) {
  throw new ConflictException(
    'Authorized bank replacement has no matching pending account',
  );
}

if (pendingAccount && isSuccess) {
  const existingApproved =
    await tx.verifiedPayoutAccount.findFirst({
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

  if (latest.bankChangeAuthorizedAt && !existingApproved) {
    throw new ConflictException(
      'Original approved bank account is missing; reconciliation required',
    );
  }

  if (existingApproved) {
    // Ordinary Paystack identity verification can
    // never replace an already approved beneficiary.
    if (!latest.bankChangeAuthorizedAt) {
      throw new ConflictException(
        'Another payout account is already approved',
      );
    }

    if (
      existingApproved.userId !== user.userId ||
      existingApproved.accountFingerprint ===
        pendingAccount.accountFingerprint
    ) {
      throw new ConflictException(
        'Invalid bank replacement',
      );
    }

    // The same user-row lock held by the coordinator
    // and payout engine serializes beneficiary changes
    // against new payout reservations.
    const inFlightStatuses: PrizePayoutStatus[] = [
      PrizePayoutStatus.REQUESTED,
      PrizePayoutStatus.SUBMITTED,
      PrizePayoutStatus.PROCESSING,
      PrizePayoutStatus.UNKNOWN,
    ];

    const activeAttempt =
      await tx.prizePayoutAttempt.findFirst({
        where: {
          claim: {
            winnerPhone: claim.winnerPhone,
          },
          status: {
            in: inFlightStatuses,
          },
        },
        select: { attemptId: true },
      });

    const activeLegacy =
      await tx.prizeClaim.findFirst({
        where: {
          winnerPhone: claim.winnerPhone,
          payoutStatus: {
            in: inFlightStatuses,
          },
        },
        select: { claimId: true },
      });

    if (activeAttempt || activeLegacy) {
      throw new ConflictException(
        'An unresolved payout prevents bank replacement',
      );
    }

    // Revoke the previous beneficiary BEFORE promoting
    // the new one, inside the same transaction.
    //
    // The partial unique index permits only one
    // VERIFIED/LOCKED account per customer.
    await tx.verifiedPayoutAccount.update({
      where: {
        payoutAccountId:
          existingApproved.payoutAccountId,
      },
      data: {
        status:
          VerifiedPayoutAccountStatus.REVOKED,
        revokedAt: new Date(),
      },
    });
  }
}


        const now = new Date();

        // Update identity evidence and beneficiary status
        // within the SAME transaction.
        await tx.kycIdentityCheck.update({
          where: {
            checkId: latest.checkId,
          },
          data: {
            status: terminalStatus,
            verifiedAt: isSuccess ? now : null,
            failedAt: isSuccess ? null : now,
            failureCode: isSuccess
              ? null
              : 'PAYSTACK_IDENTIFICATION_FAILED',
          },
        });

        if (pendingAccount) {
          await tx.verifiedPayoutAccount.update({
            where: {
              payoutAccountId:
                pendingAccount.payoutAccountId,
            },
            data: isSuccess
              ? {
                  status:
                    VerifiedPayoutAccountStatus.VERIFIED,
                  verifiedAt: now,
                }
              : {
                  status:
                    VerifiedPayoutAccountStatus.REVOKED,
                  revokedAt: now,
                },
          });
        }

        if (pendingAccount && latest.bankChangeAuthorizedAt) {
  await tx.auditLog.create({
    data: {
      severity: isSuccess
        ? AuditSeverity.INFO
        : AuditSeverity.WARNING,
      actorType: AuditActorType.SYSTEM,
      action: isSuccess
        ? 'PAYOUT_BANK_CHANGE_VERIFIED'
        : 'PAYOUT_BANK_CHANGE_FAILED',
      resourceType: 'VerifiedPayoutAccount',
      resourceId: pendingAccount.payoutAccountId,
      metadata: {
        userId: user.userId,
        claimId: claim.claimId,
        identityCheckId: latest.checkId,
        bankCode: pendingAccount.bankCode,
        accountLast4: pendingAccount.accountLast4,
      },
    },
  });
}

        // An existing approved beneficiary remains
        // unchanged. A new failed claim verification
        // must not revoke an older legitimate approval.
        //
        // Do NOT set LOCKED here.
        // Compliance approval and payout authorization
        // are separate operations.
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
}

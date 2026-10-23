
import {
  ConflictException,
  Injectable,
} from '@nestjs/common';

import {
  ClaimType,
  KycIdentityCheckStatus,
  Prisma,
  VerifiedPayoutAccountStatus,
} from '@prisma/client';

import { PayoutAccountCipherService } from './payout-account-cipher.service';
import { KycIdentityEvidenceService } from '../claims/kyc/kyc-identity-evidence.service';

export type CashClaimDestinationContext = {
  claimId: string;
  winnerPhone: string;
  winnerUserId: string | null;
  claimType: ClaimType | null;
  kycBankCode: string | null;
  kycBankAccountLast4: string | null;
  kycBankAccountName: string | null;
};

const normalizeName = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toUpperCase();

@Injectable()
export class LockedPayoutDestinationService {
  constructor(
    private readonly evidence: KycIdentityEvidenceService,
    private readonly cipher: PayoutAccountCipherService,
  ) {}

  async requireLocked(
    tx: Prisma.TransactionClient,
    claim: CashClaimDestinationContext,
  ) {
    if (claim.claimType !== ClaimType.CASH) {
      
      throw new ConflictException('Only cash claims can use bank payouts');
    }

    const user = await tx.user.findUnique({
      where: { phoneNumber: claim.winnerPhone },
      select: { userId: true },
    });

    if (
      !user ||
      (claim.winnerUserId && claim.winnerUserId !== user.userId)
    ) {
      throw new ConflictException('Customer ownership mismatch');
    }

    // Caller must already hold the claim lock.
    // Keep claim -> customer lock order consistent.
    await tx.$queryRaw`
      SELECT "user_id"
      FROM "users"
      WHERE "user_id" = ${user.userId}
      FOR UPDATE
    `;

    const currentCheck = await this.evidence.requireVerified(
      tx,
      claim,
    );

    const account = await tx.verifiedPayoutAccount.findFirst({
      where: {
        userId: user.userId,
        status: VerifiedPayoutAccountStatus.LOCKED,
      },
      include: {
        identityCheck: {
          include: {
            claim: {
              select: {
                winnerPhone: true,
                winnerUserId: true,
                kycBankAccountName: true,
              },
            },
          },
        },
      },
    });

    if (
      !account ||
      !account.verifiedAt ||
      !account.lockedAt ||
      account.revokedAt ||
      account.currency !== 'NGN' ||
      account?.status !== VerifiedPayoutAccountStatus.LOCKED
    ) {
      throw new ConflictException(
        'A locked and verified payout account is required',
      );
    }

    const source = account.identityCheck;

    if (
      !source ||
      source.provider !== 'PAYSTACK' ||
      source.status !== KycIdentityCheckStatus.VERIFIED ||
      !source.verifiedAt ||
      !source.paystackCustomerCode ||
      source.claim.winnerPhone !== claim.winnerPhone ||
      (
        source.claim.winnerUserId &&
        source.claim.winnerUserId !== user.userId
      )
    ) {
      throw new ConflictException(
        'Payout account verification evidence is invalid',
      );
    }

    if (
      !claim.kycBankCode ||
      !claim.kycBankAccountName ||
      account.bankCode !== claim.kycBankCode ||
      account.accountLast4 !== claim.kycBankAccountLast4 ||
      account.accountFingerprint !== currentCheck.bankAccountFingerprint ||
      source.bankCode !== account.bankCode ||
      source.bankAccountLast4 !== account.accountLast4 ||
      source.bankAccountFingerprint !== account.accountFingerprint ||
      normalizeName(account.resolvedAccountName) !==
        normalizeName(claim.kycBankAccountName) ||
      !source.claim.kycBankAccountName ||
      normalizeName(source.claim.kycBankAccountName) !==
        normalizeName(account.resolvedAccountName)
    ) {
      throw new ConflictException(
        'Payout account does not match verified KYC evidence',
      );
    }

    const accountNumber = this.cipher.decrypt(
      user.userId,
      account.bankCode,
      account.accountCiphertext,
    );

    if (account.accountLast4 !== accountNumber.slice(-4)) {
      throw new ConflictException(
        'Stored payout account metadata mismatch',
      );
    }

    // Validate the full ten-digit NUBAN against BOTH
    // the current claim and the original identity check.
    this.evidence.assertDestinationMatches(
      currentCheck,
      account.bankCode,
      accountNumber,
    );

    this.evidence.assertDestinationMatches(
      source,
      account.bankCode,
      accountNumber,
    );

    return {
      userId: user.userId,
      payoutAccountId: account.payoutAccountId,
      bankCode: account.bankCode,
      accountNumber,
      accountName: account.resolvedAccountName,
      accountLast4: account.accountLast4,
      fingerprint: account.accountFingerprint,

      // Independent encrypted snapshot for payout history.
      snapshotCiphertext: this.cipher.encrypt(
        user.userId,
        account.bankCode,
        accountNumber,
      ),
    };
  }
}

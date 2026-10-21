
import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  timingSafeEqual,
} from 'crypto';
import {
  ClaimType,
  KycIdentityCheck,
  Prisma,
} from '@prisma/client';

type IdentityDatabase = Pick<
  Prisma.TransactionClient,
  'kycIdentityCheck'
>;

type ClaimIdentity = {
  claimId: string;
  claimType: ClaimType | null;
  kycBankCode: string | null;
  kycBankAccountLast4: string | null;
  kycBankAccountName: string | null;
};

@Injectable()
export class KycIdentityEvidenceService {
  constructor(private readonly config: ConfigService) {}

  async requireVerified(
    db: IdentityDatabase,
    claim: ClaimIdentity,
  ): Promise<KycIdentityCheck> {
    // Check the LATEST attempt, not any historical success.
    const latest = await db.kycIdentityCheck.findFirst({
      where: { claimId: claim.claimId },
      orderBy: { attemptNumber: 'desc' },
    });

    if (
      !latest ||
      latest.provider !== 'PAYSTACK' ||
      latest.status !== 'VERIFIED' ||
      !latest.verifiedAt ||
      !latest.paystackCustomerCode
    ) {
      throw new ConflictException(
        'Successful Paystack identity verification is required',
      );
    }

    // Cash claims require proof tied to their chosen bank.
    if (claim.claimType === ClaimType.CASH) {
      if (
        !claim.kycBankAccountName ||
        !claim.kycBankCode ||
        !claim.kycBankAccountLast4 ||
        latest.bankCode !== claim.kycBankCode ||
        latest.bankAccountLast4 !==
          claim.kycBankAccountLast4
      ) {
        throw new ConflictException(
          'Verified bank account does not match this claim',
        );
      }
    }

    return latest;
  }

  fingerprintAccount(
    bankCode: string,
    accountNumber: string,
  ): string {
    if (
      !/^\d{3,6}$/.test(bankCode) ||
      !/^\d{10}$/.test(accountNumber)
    ) {
      throw new ConflictException(
        'Invalid bank destination',
      );
    }

    const key = this.config
      .get<string>('KYC_BANK_FINGERPRINT_KEY')
      ?.trim();

    if (!key || key.length < 32) {
      throw new ServiceUnavailableException(
        'Bank ownership verification is not configured',
      );
    }

    return createHmac('sha256', key)
      .update(`surewina:bank:v1:${bankCode}:${accountNumber}`)
      .digest('hex');
  }

  assertDestinationMatches(
    check: KycIdentityCheck,
    bankCode: string,
    accountNumber: string,
  ): void {
    const expected = this.fingerprintAccount(
      bankCode,
      accountNumber,
    );

    const stored = check.bankAccountFingerprint;

    if (
      !/^[a-f0-9]{64}$/i.test(stored) ||
      !timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(stored, 'hex'),
      ) ||
      check.bankCode !== bankCode ||
      check.bankAccountLast4 !== accountNumber.slice(-4)
    ) {
      throw new ConflictException(
        'Payout destination does not match the verified account',
      );
    }
  }
}

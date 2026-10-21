import {
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
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BankResolveService } from './bank-resolve.service';
import { KycIdentityEvidenceService } from './kyc-identity-evidence.service';
import { PaystackIdentityClient } from './paystack-identity.client';
import { StartKycIdentityDto } from '../dto/start-kyc-identity.dto';

@Injectable()
export class PaystackIdentityCoordinatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly banks: BankResolveService,
    private readonly evidence: KycIdentityEvidenceService,
    private readonly paystack: PaystackIdentityClient,
  ) {}

  async start(claimId: string, phoneNumber: string, input: StartKycIdentityDto) {
    // Resolve before transaction; bank name resolution is NOT ownership proof.
    // A missing fingerprint key fails closed here, prior to reserving an attempt.
    const fingerprint = this.evidence.fingerprintAccount(
      input.bankCode,
      input.accountNumber,
    );
    const resolved = await this.banks.resolve(input.accountNumber, input.bankCode);

    // Serialize on the claim row, shared with the KYC approval and payout locks.
    // Retries are allowed only after a definitive FAILED result, and must
    // produce a DIFFERENT customer_code. Unique constraint prevents reuse.
    const attempt = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "claim_id" FROM "prize_claims"
        WHERE "claim_id" = ${claimId} FOR UPDATE
      `;
      const claim = await tx.prizeClaim.findUnique({ where: { claimId } });
      if (!claim || claim.winnerPhone !== phoneNumber) {
        throw new NotFoundException('Claim not found');
      }
      const kycOpen: PrizeClaimStatus[] = [
        PrizeClaimStatus.SELECTION_MADE, PrizeClaimStatus.KYC_PENDING,
      ];
      if (claim.claimType !== ClaimType.CASH || !kycOpen.includes(claim.status)) {
        throw new ConflictException('Cash claim is not open for identity verification');
      }
      if (claim.claimDeadlineAt.getTime() <= Date.now()) {
        throw new ConflictException('The claim window has closed');
      }
      if (!claim.kycIdDocPath || !claim.kycSelfiePath) {
        throw new ConflictException('Upload your ID document and selfie first');
      }
      const existing = await tx.kycIdentityCheck.findFirst({
        where: { claimId },
        orderBy: { attemptNumber: 'desc' },
      });
      if (existing && existing.status !== KycIdentityCheckStatus.FAILED) {
        throw new ConflictException('Identity verification is pending, inconclusive, or already verified');
      }
      if (existing && existing.attemptNumber >= 3) {
        throw new ConflictException('Maximum identity verification attempts reached; contact support');
      }
      if (existing?.failedAt && Date.now() - existing.failedAt.getTime() < 60_000) {
        throw new ConflictException('Please allow a minute before retrying verification');
      }
      const row = await tx.kycIdentityCheck.create({
        data: {
          claimId,
          attemptNumber: (existing?.attemptNumber ?? 0) + 1,
          provider: 'PAYSTACK',
          status: KycIdentityCheckStatus.PREPARING,
          bankCode: input.bankCode,
          bankAccountLast4: input.accountNumber.slice(-4),
          bankAccountFingerprint: fingerprint,
        },
      });
      await tx.prizeClaim.update({
        where: { claimId },
        data: {
          status: PrizeClaimStatus.KYC_PENDING,
          // Binding to a NEW nominated account invalidates the previous
          // legacy claim evidence, which must never authorize a payout.
          kycBvnVerifiedAt: null,
          kycBvnHash: null,
          kycBankCode: input.bankCode,
          kycBankAccountLast4: input.accountNumber.slice(-4),
          kycBankAccountName: resolved.accountName,
        },
      });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    try {
      // Create a distinct provider identity: do not trust a client-supplied
      // customer_code, and do not silently reuse a code from another attempt.
      const customerCode = await this.paystack.createCustomer({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: phoneNumber,
      });

      await this.prisma.kycIdentityCheck.update({
        where: { checkId: attempt.checkId },
        data: { paystackCustomerCode: customerCode },
      });

      // Set the submission timestamp immediately BEFORE sending so a very
      // fast webhook can correlate an in-flight request. The webhook must
      // be signed and have matching country, bank code and masked suffix.
      await this.prisma.kycIdentityCheck.update({
        where: { checkId: attempt.checkId },
        data: {
          status: KycIdentityCheckStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });

      await this.paystack.submit({
        customerCode,
        bvn: input.bvn,
        accountNumber: input.accountNumber,
        bankCode: input.bankCode,
        firstName: input.firstName,
        lastName: input.lastName,
      });
    } catch {
      // In any failure or timeout the upstream outcome may be uncertain.
      // Do not downgrade an already VERIFIED or FAILED webhook result.
      await this.prisma.kycIdentityCheck.updateMany({
        where: {
          checkId: attempt.checkId,
          status: {
            in: [KycIdentityCheckStatus.PREPARING, KycIdentityCheckStatus.SUBMITTED],
          },
        },
        data: { status: KycIdentityCheckStatus.UNKNOWN },
      });
      throw new ServiceUnavailableException(
        'Identity verification is unavailable or its outcome is uncertain; contact support',
      );
    }

    // The request was accepted by Paystack, not verified. The signed
    // customeridentification.success webhook is the verification authority.
    return { status: 'SUBMITTED' as const };
  }
}

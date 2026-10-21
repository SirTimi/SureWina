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
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { PaystackEvent } from '../../payments/webhook/paystack-webhook.service';

/**
 * Called ONLY through /webhooks/paystack, protected by the existing
 * PaystackSignatureGuard (HMAC-SHA512 over the exact raw request bytes).
 * Do not expose this service as an unauthenticated HTTP controller.
 */
@Injectable()
export class PaystackIdentityWebhookService {
  constructor(private readonly prisma: PrismaService) {}

  async handleWebhook(event: PaystackEvent): Promise<void> {
    const isSuccess = event.event === 'customeridentification.success';
    if (!isSuccess && event.event !== 'customeridentification.failed') {
      throw new BadRequestException('Unexpected Paystack identification event');
    }

    const payload = event.data;
    const customerCode = payload?.customer_code;
    const identification = payload?.identification;

    if (!customerCode || !/^CUS_[A-Za-z0-9]+$/.test(customerCode) ||
        identification?.country !== 'NG' ||
        identification.type !== 'bank_account' ||
        typeof identification.bank_code !== 'string' ||
        typeof identification.account_number !== 'string' ||
        typeof identification.bvn !== 'string') {
      throw new BadRequestException('Invalid Paystack identification payload');
    }

    // Paystack documents masked fields, not the raw BVN/account number.
    // Never persist or log even the masked BVN. Match only what the documented
    // format proves; customer_code is the unique primary correlation key.
    const maskedAccount = identification.account_number;
    const maskedBvn = identification.bvn;
    if (!/^\d{3}\*+\d{3}$/.test(maskedAccount) ||
        !/^\d{3}\*+\d{3}$/.test(maskedBvn)) {
      throw new BadRequestException('Unexpected Paystack masked identity format');
    }

    // Look up first, then serialize on claim row and re-read attempt inside
    // the transaction to prevent racing with compliance approval.
    const known = await this.prisma.kycIdentityCheck.findUnique({
      where: { paystackCustomerCode: customerCode },
      select: { claimId: true },
    });
    if (!known) {
      // Do not associate an unexpected event with a claim via email or last4.
      throw new NotFoundException('No matching verification request');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "claim_id" FROM "prize_claims"
        WHERE "claim_id" = ${known.claimId} FOR UPDATE
      `;
      const [claim, latest] = await Promise.all([
        tx.prizeClaim.findUnique({ where: { claimId: known.claimId } }),
        tx.kycIdentityCheck.findFirst({
          where: { claimId: known.claimId },
          orderBy: { attemptNumber: 'desc' },
        }),
      ]);

      if (!claim || !latest || latest.paystackCustomerCode !== customerCode ||
          latest.provider !== 'PAYSTACK') {
        throw new ConflictException('Paystack verification correlation mismatch');
      }
      if (claim.claimType !== ClaimType.CASH) {
        throw new ConflictException('Identity verification is only valid for cash claims');
      }
      if (!latest.submittedAt) {
        // A customer may be created before the verification request is sent.
        // Never accept an identification event from that interval.
        throw new ConflictException('No identity submission exists for this event');
      }
      if (latest.bankCode !== identification.bank_code ||
          latest.bankAccountLast4.slice(-3) !== maskedAccount.slice(-3) ||
          claim.kycBankCode !== latest.bankCode ||
          claim.kycBankAccountLast4 !== latest.bankAccountLast4 ||
          !claim.kycBankAccountName ||
          !/^[a-f0-9]{64}$/i.test(latest.bankAccountFingerprint)) {
        throw new ConflictException('Verification does not match nominated bank details');
      }

      const terminalStatus = isSuccess
        ? KycIdentityCheckStatus.VERIFIED
        : KycIdentityCheckStatus.FAILED;
      if (latest.status === terminalStatus) {
        return; // Duplicate event, including after claim clearance.
      }
      if (latest.status === KycIdentityCheckStatus.VERIFIED ||
          latest.status === KycIdentityCheckStatus.FAILED) {
        throw new ConflictException('Conflicting Paystack identity outcomes');
      }
      if (claim.status !== PrizeClaimStatus.KYC_PENDING) {
        throw new ConflictException('Claim is no longer awaiting identity verification');
      }
      const awaitingResult: KycIdentityCheckStatus[] = [
        KycIdentityCheckStatus.SUBMITTED, KycIdentityCheckStatus.UNKNOWN,
      ];
      if (!awaitingResult.includes(latest.status)) {
        throw new ConflictException('Verification not eligible for completion');
      }

      const now = new Date();
      await tx.kycIdentityCheck.update({
        where: { checkId: latest.checkId },
        data: {
          status: terminalStatus,
          verifiedAt: isSuccess ? now : null,
          failedAt: isSuccess ? null : now,
          failureCode: isSuccess ? null : 'PAYSTACK_IDENTIFICATION_FAILED',
        },
      });
      // Do not update legacy kycBvnVerifiedAt; all approval/payout logic must
      // derive from the authenticated identity attempt, not that old field.
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

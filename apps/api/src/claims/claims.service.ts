import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
  ClaimType,
  PrizeClaim,
  PrizeClaimStatus,
  PrizePayoutStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createHash } from 'crypto';
import { BvnVerificationService } from './kyc/bvn-verification.service';
import { BankResolveService } from './kyc/bank-resolve.service';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '@nestjs/config';
import { WhtDeductionService } from './wht-deduction.service';
import { SettingsService } from '../config/settings.service';
import { RedemptionService } from './redemption.service';
import { NotificationQueueService } from '../queue/notification-queue.service';
import { PRIZE_PAYOUT_PROVIDER, type PrizePayoutProvider } from './payout/prize-payout.provider';
import {
  PrizePayoutFinalizationService,
} from './payout/prize-payout-finalization.service';

export type ClaimViewDto = {
  claimId: string;
  winnerTicketRef: string;
  drawCode: string;
  prizeDescription: string;
  status: PrizeClaimStatus;
  claimType: ClaimType | null;
  grossPrizeValueNgn: number;
  whtAmountNgn: number;
  netPrizeValueNgn: number;
  selectionDeadlineAt: string;
  claimDeadlineAt: string;
  createdAt: string;
  // KYC surface for the customer portal (C2b): flags only, never raw data.
  kycBvnVerified: boolean;
  kycHasDocs: boolean;
  kycBank: {
    bankCode: string | null;
    accountLast4: string | null;
    accountName: string;
  } | null;
  payoutStatus: PrizePayoutStatus | null;
};

// Statuses in which the winner may still (re)choose product vs cash.
const CHOOSABLE: PrizeClaimStatus[] = [
  PrizeClaimStatus.NOTIFIED,
  PrizeClaimStatus.SELECTION_MADE, // the flip window: change of mind allowed
];

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bvnVerification: BvnVerificationService,
    private readonly bankResolve: BankResolveService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    @Inject(PRIZE_PAYOUT_PROVIDER)
    private readonly payoutProvider: PrizePayoutProvider,
    private readonly whtDeductions: WhtDeductionService,
    private readonly settings: SettingsService,
    private readonly redemption: RedemptionService,
    private readonly notificationQueue: NotificationQueueService,
    private readonly payoutFinalizer: PrizePayoutFinalizationService,
  ) {}

  async listMine(phoneNumber: string): Promise<{ claims: ClaimViewDto[] }> {
    const claims = await this.prisma.prizeClaim.findMany({
      where: { winnerPhone: phoneNumber },
      include: {
        drawResult: {
          select: { draw: { select: { drawCode: true, prizeDescription: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { claims: claims.map((c) => this.toView(c)) };
  }

  async getMine(claimId: string, phoneNumber: string): Promise<ClaimViewDto> {
    const claim = await this.findOwned(claimId, phoneNumber);
    return this.toView(claim);
  }

  async choose(
    claimId: string,
    phoneNumber: string,
    path: ClaimType,
  ): Promise<ClaimViewDto> {
    const claim = await this.findOwned(claimId, phoneNumber);

    if (!CHOOSABLE.includes(claim.status)) {
      throw new ConflictException(
        `Prize option can no longer be changed (status: ${claim.status})`,
      );
    }
    if (claim.selectionDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException('The selection window for this claim has closed');
    }

    const wht = await this.computeWht(claim.grossPrizeValueNgn, path);

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: {
        claimType: path,
        claimTypeSelectedAt: new Date(),
        status: PrizeClaimStatus.SELECTION_MADE,
        ...wht,
      },
      include: this.viewInclude(),
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_TYPE_SELECTED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: {
        path,
        previous: claim.claimType,
        winnerTicketRef: claim.winnerTicketRef,
      },
    });

    return this.toView(updated);
  }

  async listForReview(status?: PrizeClaimStatus) {
    const claims = await this.prisma.prizeClaim.findMany({
      where: status ? { status } : undefined,
      include: this.viewInclude(),
      orderBy: { createdAt: 'asc' },
    });
    return {
      claims: claims.map((c) => ({
        ...this.toView(c),
        winnerPhone: c.winnerPhone,
        kycBvnVerifiedAt: c.kycBvnVerifiedAt?.toISOString() ?? null,
        hasIdDoc: !!c.kycIdDocPath,
        hasSelfie: !!c.kycSelfiePath,
        bankResolved: !!c.kycBankAccountName,
      })),
    };
  }

  async reviewKyc(
    claimId: string,
    adminId: string,
    decision: 'APPROVE' | 'REJECT',
    note?: string,
  ) {
    const claim = await this.prisma.prizeClaim.findUnique({
      where: { claimId },
      include: this.viewInclude(),
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.status !== PrizeClaimStatus.KYC_PENDING) {
      throw new ConflictException(`Claim is not awaiting review (status: ${claim.status})`);
    }

    if (decision === 'APPROVE') {
      // The evidence gate: nothing clears without the full set.
      const missing: string[] = [];
      if (!claim.kycBvnVerifiedAt) missing.push('verified BVN');
      if (!claim.kycIdDocPath) missing.push('ID document');
      if (!claim.kycSelfiePath) missing.push('selfie');
      if (claim.claimType === ClaimType.CASH && !claim.kycBankAccountName) {
        missing.push('resolved bank account');
      }
      if (missing.length > 0) {
        throw new ConflictException(`Cannot approve — missing: ${missing.join(', ')}`);
      }

      const wht = await this.computeWht(claim.grossPrizeValueNgn, claim.claimType!);

      const updated = await this.prisma.prizeClaim.update({
        where: { claimId },
        data: {
          status: PrizeClaimStatus.KYC_CLEARED,
          kycReviewedBy: adminId,
          kycReviewedAt: new Date(),
          // Finalize WHT at certification time (backfills pre-WHT claims).
          ...wht,
        },
        include: this.viewInclude(),
      });

      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: { type: AuditActorType.ADMIN, id: adminId },
        action: 'CLAIM_KYC_APPROVED',
        resource: { type: 'PrizeClaim', id: claimId },
        metadata: { whtAmountNgn: updated.whtAmountNgn, netPrizeValueNgn: updated.netPrizeValueNgn },
      });

      // Clearance is the moment the winner becomes entitled, so it is the
      // moment the collection code exists. Issued for every claim type: a
      // cash winner may still collect in person from an agent rather than
      // take a transfer, and they need the code either way.
      //
      // Non-blocking. The claim is already cleared and the code is stored —
      // a failed SMS must not roll that back, and the code can be resent.
      void this.issueRedemptionCode(updated).catch((e) =>
        this.logger.error(
          `Redemption code issue failed for ${claimId}: ${
            e instanceof Error ? e.message : 'unknown'
          }`,
        ),
      );

      return this.toView(updated);
    }

    // REJECT: stays KYC_PENDING so the winner can fix and resubmit.
    await this.audit.write({
      severity: AuditSeverity.WARNING,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'CLAIM_KYC_REJECTED',
      resource: { type: 'PrizeClaim', id: claimId },
      metadata: { note: note ?? null },
    });
    return this.toView(claim);
  }

  async listCollectionPoints(stateCode?: string) {
    const points = await this.prisma.collectionPoint.findMany({
      where: { isActive: true, ...(stateCode ? { stateCode } : {}) },
      orderBy: [{ stateCode: 'asc' }, { name: 'asc' }],
    });
    return { points };
  }

  async bookCollection(
    claimId: string,
    phoneNumber: string,
    collectionPointId: string,
    preferredDate: string,
  ): Promise<ClaimViewDto> {
    const claim = await this.findOwned(claimId, phoneNumber);
    if (claim.claimType !== ClaimType.PRODUCT) {
      throw new ConflictException('Collection booking is for product claims');
    }
    if (claim.status !== PrizeClaimStatus.KYC_CLEARED) {
      throw new ConflictException(`Claim is not cleared for collection (status: ${claim.status})`);
    }
    const when = new Date(preferredDate);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) {
      throw new BadRequestException('preferredDate must be a future date');
    }
    const point = await this.prisma.collectionPoint.findFirst({
      where: { pointId: collectionPointId, isActive: true },
    });
    if (!point) throw new NotFoundException('Collection point not found');

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: {
        collectionPointId,
        collectionScheduledAt: when,
        status: PrizeClaimStatus.PRODUCT_BOOKED,
      },
      include: this.viewInclude(),
    });
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_COLLECTION_BOOKED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: { collectionPointId, preferredDate: when.toISOString() },
    });
    return this.toView(updated);
  }

  async confirmPayoutAccount(
    claimId: string,
    phoneNumber: string,
    accountNumber: string,
    bankCode: string,
  ) {
    const claim = await this.findOwned(claimId, phoneNumber);
    if (claim.claimType !== ClaimType.CASH) {
      throw new ConflictException('Payout account applies to cash claims only');
    }
    if (claim.status !== PrizeClaimStatus.KYC_CLEARED) {
      throw new ConflictException(`Claim is not cleared for payout (status: ${claim.status})`);
    }
    if (
      claim.payoutStatus &&
      claim.payoutStatus !== PrizePayoutStatus.FAILED &&
      claim.payoutStatus !== PrizePayoutStatus.REVERSED
    ) {
      throw new ConflictException(
        `Payout details cannot be changed while payout is ${claim.payoutStatus}`,
      );
    }
    // Must match what compliance approved: same bank, same last4, and the
    // freshly-resolved name must equal the stored one.
    if (bankCode !== claim.kycBankCode || accountNumber.slice(-4) !== claim.kycBankAccountLast4) {
      throw new ConflictException('Account does not match the KYC-verified details');
    }
    const resolved = await this.bankResolve.resolve(
  accountNumber,
  bankCode,
);

if (!claim.kycBankAccountName) {
  throw new ConflictException(
    'KYC-verified account name is missing',
  );
}

const normalizeAccountName = (
  value: string,
) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

if (
  normalizeAccountName(
    resolved.accountName,
  ) !==
  normalizeAccountName(
    claim.kycBankAccountName,
  )
) {
  throw new ConflictException(
    'Account name mismatch with KYC-verified details',
  );
}

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: { payoutAccountNumber: accountNumber },
      include: this.viewInclude(),
    });
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_PAYOUT_ACCOUNT_CONFIRMED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: { accountLast4: accountNumber.slice(-4) },
    });
    return { ...this.toView(updated), payoutAccountConfirmed: true };
  }

  async initiatePayout(
    claimId: string,
    adminId: string,
  ): Promise<ClaimViewDto> {
    const claim = await this.prisma.prizeClaim.findUnique({
      where: { claimId },
      include: this.viewInclude(),
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    } 

    if (
      claim.claimType !== ClaimType.CASH ||
      claim.status !== PrizeClaimStatus.KYC_CLEARED
    ) {
      throw new ConflictException(
        'Claim is not a cleared cash claim',
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

    if (claim.payoutStatus) {
      throw new ConflictException(
        `Payout already exists with status ${claim.payoutStatus}`,
      );
    }

    /*
    * Stable across retries and crashes.
    *
     * A provider adapter should use this as its merchant/client
    * transaction reference whenever the provider supports one.
     */
    const idempotencyKey = `SW-PRIZE-${claim.claimId}`;

    const startedAt = new Date();

    /*
    * Reserve before touching an external provider.
    *
     * This is the concurrency barrier that prevents two admins,
    * workers, or HTTP requests from initiating the same payout.
    */
    const reserved =
      await this.prisma.prizeClaim.updateMany({
        where: {
          claimId,
          status: PrizeClaimStatus.KYC_CLEARED,
          payoutStatus: null,
          payoutReference: null,
          payoutIdempotencyKey: null,
        },
        data: {
          payoutStatus: PrizePayoutStatus.REQUESTED,
          payoutProvider: this.payoutProvider.providerCode,
          payoutIdempotencyKey: idempotencyKey,
          payoutInitiatedAt: startedAt,
          payoutFailureReason: null,
        },
      });

    if (reserved.count !== 1) {
      throw new ConflictException(
        'Payout has already been started for this claim',
      );
    }

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: {
        type: AuditActorType.ADMIN,
        id: adminId,
      },
      action: 'CLAIM_PAYOUT_REQUESTED',
      resource: {
        type: 'PrizeClaim',
        id: claimId,
      },  
      metadata: {
        provider: this.payoutProvider.providerCode,
        idempotencyKey,
        netPrizeValueNgn: claim.netPrizeValueNgn,
        accountLast4:
          claim.payoutAccountNumber.slice(-4),
      },
    });

    try {
      const result =
        await this.payoutProvider.initiate({
        idempotencyKey,

        accountNumber: claim.payoutAccountNumber,
        bankCode: claim.kycBankCode,
        accountName: claim.kycBankAccountName,

        amountNgn: claim.netPrizeValueNgn,
        reason: `Surewina prize ${claim.winnerTicketRef}`,
      });

    const checkedAt = new Date();

    /*
     * Immediate confirmed success.
     *
     * This will normally only happen in dev or when a provider can
     * conclusively return final settlement synchronously.
     */
    if (
      result.status ===
      PrizePayoutStatus.SUCCEEDED
    ) {
      const updated =
        await this.prisma.prizeClaim.update({
          where: { claimId },
          data: {
            payoutProvider: result.provider,
            payoutReference: result.reference,

            payoutStatus:
              PrizePayoutStatus.SUCCEEDED,

            payoutLastCheckedAt: checkedAt,
            payoutCompletedAt: checkedAt,
            payoutFailureReason: null,

            status:
              PrizeClaimStatus.CASH_PAID,

            fulfilledAt: checkedAt,
          },
          include: this.viewInclude(),
        });

      await this.whtDeductions.recordForClaim(
        claimId,
      );

      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: {
          type: AuditActorType.ADMIN,
          id: adminId,
        },
        action: 'CLAIM_PAYOUT_SUCCEEDED',
        resource: {
          type: 'PrizeClaim',
          id: claimId,
        },
        metadata: {
          provider: result.provider,
          reference: result.reference,
          rawStatus:
            result.rawStatus ?? null,
          netPrizeValueNgn:
            claim.netPrizeValueNgn,
        },
      });

      return this.toView(updated);
    }

    /*
     * Conclusive provider failure.
     *
     * FAILED is deliberately different from UNKNOWN.
     *
     * Only a conclusive failure may later become eligible for
     * a controlled retry.
     */
    if (
      result.status === PrizePayoutStatus.FAILED
    ) {
      const updated =
        await this.prisma.prizeClaim.update({
          where: { claimId },
          data: {
            payoutProvider: result.provider,
            payoutReference: result.reference,

            payoutStatus:
              PrizePayoutStatus.FAILED,

            payoutLastCheckedAt: checkedAt,

            payoutFailureReason:
              result.failureReason ??
              result.rawStatus ??
              'Provider reported payout failure',
          },
          include: this.viewInclude(),
        });

      await this.audit.write({
        severity: AuditSeverity.WARNING,
        actor: {
          type: AuditActorType.ADMIN,
          id: adminId,
        },
        action: 'CLAIM_PAYOUT_FAILED',
        resource: {
          type: 'PrizeClaim',
          id: claimId,
        },
        metadata: {
          provider: result.provider,
          reference: result.reference,
          rawStatus:
            result.rawStatus ?? null,
          reason:
            result.failureReason ?? null,
        },
      });

      return this.toView(updated);
    }

    /*
     * Reversal means money may previously have appeared successful
     * before being returned/rejected.
     */
    if (
      result.status ===
      PrizePayoutStatus.REVERSED
    ) {
      const updated =
        await this.prisma.prizeClaim.update({
          where: { claimId },
          data: {
            payoutProvider: result.provider,
            payoutReference: result.reference,

            payoutStatus:
              PrizePayoutStatus.REVERSED,

            payoutLastCheckedAt: checkedAt,

            payoutFailureReason:
              result.failureReason ??
              'Provider reported payout reversal',
          },
          include: this.viewInclude(),
        });

      await this.audit.write({
        severity: AuditSeverity.CRITICAL,
        actor: {
          type: AuditActorType.ADMIN,
          id: adminId,
        },
        action: 'CLAIM_PAYOUT_REVERSED',
        resource: {
          type: 'PrizeClaim',
          id: claimId,
        },
        metadata: {
          provider: result.provider,
          reference: result.reference,
          rawStatus:
            result.rawStatus ?? null,
        },
      });

      return this.toView(updated);
    }

    /*
     * Normal production initiation result.
     *
     * SUBMITTED / PROCESSING / UNKNOWN
     *
     * None of these mean the customer has been paid.
     */
    const pendingStatus =
      result.status ===
        PrizePayoutStatus.SUBMITTED ||
      result.status ===
        PrizePayoutStatus.PROCESSING ||
      result.status ===
        PrizePayoutStatus.UNKNOWN
        ? result.status
        : PrizePayoutStatus.UNKNOWN;

    const updated =
      await this.prisma.prizeClaim.update({
        where: { claimId },
        data: {
          payoutProvider: result.provider,
          payoutReference: result.reference,

          payoutStatus: pendingStatus,

          payoutLastCheckedAt: checkedAt,

          payoutFailureReason:
            pendingStatus ===
            PrizePayoutStatus.UNKNOWN
              ? result.failureReason ??
                'Provider payout state is unknown'
              : null,
        },
        include: this.viewInclude(),
      });

    await this.audit.write({
      severity:
        pendingStatus ===
        PrizePayoutStatus.UNKNOWN
          ? AuditSeverity.WARNING
          : AuditSeverity.INFO,

      actor: {
        type: AuditActorType.ADMIN,
        id: adminId,
      },

      action:
        pendingStatus ===
        PrizePayoutStatus.UNKNOWN
          ? 'CLAIM_PAYOUT_STATUS_UNKNOWN'
          : 'CLAIM_PAYOUT_SUBMITTED',

      resource: {
        type: 'PrizeClaim',
        id: claimId,
      },

      metadata: {
        provider: result.provider,
        reference: result.reference,
        status: pendingStatus,
        rawStatus: result.rawStatus ?? null,
      },
    });

    return this.toView(updated);
  } catch (error) {
    /*
     * An exception does not prove the provider rejected the payout.
     *
     * Examples:
     *
     * request timeout
     * network disconnect
     * SureWina connection died after provider accepted request
     * provider returned malformed response
     *
     * Therefore: UNKNOWN.
     */
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown payout provider error';

    await this.prisma.prizeClaim.update({
      where: { claimId },
      data: {
        payoutProvider:
          this.payoutProvider.providerCode,

        payoutStatus:
          PrizePayoutStatus.UNKNOWN,

        payoutLastCheckedAt: new Date(),

        payoutFailureReason: message,
      },
    });

    await this.audit.write({
      severity: AuditSeverity.CRITICAL,

      actor: {
        type: AuditActorType.ADMIN,
        id: adminId,
      },

      action: 'CLAIM_PAYOUT_STATUS_UNKNOWN',

      resource: {
        type: 'PrizeClaim',
        id: claimId,
      },

      metadata: {
        provider:
          this.payoutProvider.providerCode,

        idempotencyKey,
        error: message,
        netPrizeValueNgn:
          claim.netPrizeValueNgn,
      },
    });

    throw error;
  }
}

  async refreshPayoutStatus(
  claimId: string,
  adminId: string,
): Promise<ClaimViewDto> {
  const claim =
    await this.prisma.prizeClaim.findUnique({
      where: {
        claimId,
      },

      include:
        this.viewInclude(),
    });

  if (!claim) {
    throw new NotFoundException(
      'Claim not found',
    );
  }

  if (!claim.payoutStatus) {
    throw new ConflictException(
      'No payout has been started for this claim',
    );
  }

  /*
   * Successful, failed and reversed payouts are terminal.
   *
   * They must not be repeatedly queried or silently changed
   * through this endpoint.
   */
  if (
    claim.payoutStatus ===
      PrizePayoutStatus.SUCCEEDED ||
    claim.payoutStatus ===
      PrizePayoutStatus.FAILED ||
    claim.payoutStatus ===
      PrizePayoutStatus.REVERSED
  ) {
    return this.toView(claim);
  }

  /*
   * Never query a payout through a different provider.
   *
   * For example, a MONNIFY payout must not suddenly be queried
   * through DEV or a future Flutterwave adapter because someone
   * changed PAYOUTS_MODE.
   */
  if (
    !claim.payoutProvider ||
    claim.payoutProvider !==
      this.payoutProvider.providerCode
  ) {
    throw new ConflictException(
      `Payout belongs to provider ${
        claim.payoutProvider ?? 'UNKNOWN'
      }, but active provider is ${
        this.payoutProvider.providerCode
      }`,
    );
  }

  /*
   * Prefer the provider's returned reference.
   *
   * If the server crashed after sending the transfer but before
   * storing the provider response, the stable idempotency key lets
   * us query Monnify safely.
   */
  const reference =
    claim.payoutReference ??
    claim.payoutIdempotencyKey;

  if (!reference) {
    throw new ConflictException(
      'Payout has no provider reference or idempotency key',
    );
  }

  try {
    const result =
      await this.payoutProvider.getStatus(
        reference,
      );

    await this.payoutFinalizer.applyForClaim(
      claimId,
      result,
      {
        type: AuditActorType.ADMIN,
        id: adminId,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown payout status refresh error';

    await this.audit.write({
      severity:
        AuditSeverity.WARNING,

      actor: {
        type:
          AuditActorType.ADMIN,
        id: adminId,
      },

      action:
        'CLAIM_PAYOUT_REFRESH_FAILED',

      resource: {
        type: 'PrizeClaim',
        id: claimId,
      },

      metadata: {
        provider:
          claim.payoutProvider,

        reference,

        error: message,
      },
    });

    throw error;
  }

  const updated =
    await this.prisma.prizeClaim.findUnique({
      where: {
        claimId,
      },

      include:
        this.viewInclude(),
    });

  if (!updated) {
    throw new NotFoundException(
      'Claim not found after payout refresh',
    );
  }

  return this.toView(updated);
}

  async markDelivered(claimId: string, adminId: string): Promise<ClaimViewDto> {
    const claim = await this.prisma.prizeClaim.findUnique({
      where: { claimId },
      include: this.viewInclude(),
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.status !== PrizeClaimStatus.PRODUCT_BOOKED) {
      throw new ConflictException(`Claim is not awaiting delivery (status: ${claim.status})`);
    }
    const updated = await this.prisma.prizeClaim.update({
      where: { claimId },
      data: { status: PrizeClaimStatus.DELIVERED, fulfilledAt: new Date() },
      include: this.viewInclude(),
    });
    await this.whtDeductions.recordForClaim(claimId);
    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.ADMIN, id: adminId },
      action: 'CLAIM_PRODUCT_DELIVERED',
      resource: { type: 'PrizeClaim', id: claimId },
      metadata: { winnerTicketRef: claim.winnerTicketRef },
    });
    return this.toView(updated);
  }

  // ─── helpers ──────────────────────────────────────────────

  // Mints the collection code and sends it to the winner. Split out so the
  // clear code lives in exactly one scope and is never returned to a caller
  // or logged — after this it exists only as a hash and in the winner's SMS.
  private async issueRedemptionCode(claim: {
    claimId: string;
    winnerPhone: string;
    claimDeadlineAt: Date;
    drawResult: { draw: { prizeDescription: string } };
  }) {
    const code = await this.redemption.issue(claim.claimId);
    await this.notificationQueue.enqueueRedemptionCodeSms({
      claimId: claim.claimId,
      winnerPhone: claim.winnerPhone,
      code,
      prizeDescription: claim.drawResult.draw.prizeDescription,
      claimDeadlineAt: claim.claimDeadlineAt.toISOString(),
    });
  }

  private viewInclude() {
    return {
      drawResult: {
        select: { draw: { select: { drawCode: true, prizeDescription: true } } },
      },
    } as const;
  }

  // Ownership check folded into the fetch. Not-yours returns 404, not 403:
  // a 403 would confirm the claimId exists to whoever is probing.
  private async findOwned(claimId: string, phoneNumber: string) {
    const claim = await this.prisma.prizeClaim.findUnique({
      where: { claimId },
      include: this.viewInclude(),
    });
    if (!claim || claim.winnerPhone !== phoneNumber) {
      throw new NotFoundException('Claim not found');
    }
    return claim;
  }

  private toView(
    c: PrizeClaim & {
      drawResult: { draw: { drawCode: string; prizeDescription: string } };
    },
  ): ClaimViewDto {
    return {
      claimId: c.claimId,
      winnerTicketRef: c.winnerTicketRef,
      drawCode: c.drawResult.draw.drawCode,
      prizeDescription: c.drawResult.draw.prizeDescription,
      status: c.status,
      claimType: c.claimType,
      grossPrizeValueNgn: c.grossPrizeValueNgn,
      whtAmountNgn: c.whtAmountNgn,
      netPrizeValueNgn: c.netPrizeValueNgn,
      selectionDeadlineAt: c.selectionDeadlineAt.toISOString(),
      claimDeadlineAt: c.claimDeadlineAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      payoutStatus: c.payoutStatus,
      kycBvnVerified: !!c.kycBvnVerifiedAt,
      kycHasDocs: !!(c.kycIdDocPath && c.kycSelfiePath),
      kycBank: c.kycBankAccountName
        ? { bankCode: c.kycBankCode, accountLast4: c.kycBankAccountLast4, accountName: c.kycBankAccountName }
        : null,
    };
  }

  async submitBvn(
    claimId: string,
    phoneNumber: string,
    bvn: string,
  ): Promise<ClaimViewDto> {
    const claim = await this.findOwned(claimId, phoneNumber);

    const kycOpen: PrizeClaimStatus[] = [
      PrizeClaimStatus.SELECTION_MADE,
      PrizeClaimStatus.KYC_PENDING,
    ];
    if (!kycOpen.includes(claim.status)) {
      throw new ConflictException(
        claim.status === PrizeClaimStatus.NOTIFIED
          ? 'Choose your prize option before starting KYC'
          : `KYC is not open on this claim (status: ${claim.status})`,
      );
    }
    if (claim.claimDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException('The claim window has closed');
    }

    const check = await this.bvnVerification.verify(bvn, phoneNumber);
    if (!check.verified) {
      throw new ConflictException('BVN verification failed');
    }

    const bvnHash = createHash('sha256').update(bvn).digest('hex');

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: {
        kycBvnHash: bvnHash,
        kycBvnVerifiedAt: new Date(),
        status: PrizeClaimStatus.KYC_PENDING, // locks the flip window
      },
      include: this.viewInclude(),
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_KYC_BVN_SUBMITTED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: { devMode: check.devMode, bvnLast4: bvn.slice(-4) },
    });

    return this.toView(updated);
  }

  async submitBank(
    claimId: string,
    phoneNumber: string,
    accountNumber: string,
    bankCode: string,
  ): Promise<ClaimViewDto & { resolvedAccountName: string }> {
    const claim = await this.findOwned(claimId, phoneNumber);

    if (claim.claimType !== ClaimType.CASH) {
      throw new ConflictException(
        'Bank details are only required for cash claims',
      );
    }
    const docsOpen: PrizeClaimStatus[] = [
      PrizeClaimStatus.SELECTION_MADE,
      PrizeClaimStatus.KYC_PENDING,
    ];
    if (!docsOpen.includes(claim.status)) {
      throw new ConflictException(
        claim.status === PrizeClaimStatus.NOTIFIED
          ? 'Choose your prize option before uploading documents'
          : `Documents cannot be submitted on this claim (status: ${claim.status})`,
      );
    }
    if (claim.claimDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException('The claim window has closed');
    }

    const resolved = await this.bankResolve.resolve(accountNumber, bankCode);

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data: {
        kycBankCode: bankCode,
        kycBankAccountLast4: accountNumber.slice(-4),
        kycBankAccountName: resolved.accountName,
      },
      include: this.viewInclude(),
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_KYC_BANK_RESOLVED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: {
        bankCode,
        accountLast4: accountNumber.slice(-4),
        accountName: resolved.accountName,
      },
    });

    return { ...this.toView(updated), resolvedAccountName: resolved.accountName };
  }

  async submitDocuments(
    claimId: string,
    phoneNumber: string,
    files: { kind: 'idDoc' | 'selfie'; buffer: Buffer; ext: string }[],
  ): Promise<ClaimViewDto> {
    const claim = await this.findOwned(claimId, phoneNumber);

    const docsOpen: PrizeClaimStatus[] = [
      PrizeClaimStatus.SELECTION_MADE,
      PrizeClaimStatus.KYC_PENDING,
    ];
    if (!docsOpen.includes(claim.status)) {
      throw new ConflictException(
        claim.status === PrizeClaimStatus.NOTIFIED
          ? 'Choose your prize option before uploading documents'
          : `Documents cannot be submitted on this claim (status: ${claim.status})`,
      );
    }
    if (claim.claimDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException('The claim window has closed');
    }
    if (files.length === 0) {
      throw new BadRequestException(
        'Attach at least one file field named idDoc or selfie',
      );
    }

    const data: { kycIdDocPath?: string; kycSelfiePath?: string } = {};
    for (const f of files) {
      const key = `kyc/${claim.claimId}/${f.kind}-${Date.now()}.${f.ext}`;
      const stored = await this.storage.save(key, f.buffer);
      if (f.kind === 'idDoc') data.kycIdDocPath = stored;
      else data.kycSelfiePath = stored;
    }

    const updated = await this.prisma.prizeClaim.update({
      where: { claimId: claim.claimId },
      data,
      include: this.viewInclude(),
    });

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.CUSTOMER, id: phoneNumber },
      action: 'CLAIM_KYC_DOCUMENTS_UPLOADED',
      resource: { type: 'PrizeClaim', id: claim.claimId },
      metadata: { kinds: files.map((f) => f.kind) },
    });

    return this.toView(updated);
  }

  // WHT applies to CASH prizes at/above the threshold. Integer naira,
  // rounded down in the winner's favour on the tax side.
  private async computeWht(grossNgn: number, path: ClaimType) {
    const rate = await this.settings.getNumber('WHT_RATE_PERCENT', 5);
    const threshold = await this.settings.getNumber('WHT_THRESHOLD_NGN', 0);

    if (path !== ClaimType.CASH || grossNgn < threshold || rate === 0) {
      return { whtApplicable: false, whtAmountNgn: 0, netPrizeValueNgn: grossNgn };
    }
    const whtAmountNgn = Math.floor((grossNgn * rate) / 100);
    return { whtApplicable: true, whtAmountNgn, netPrizeValueNgn: grossNgn - whtAmountNgn };
  }
}
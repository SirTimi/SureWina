import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  AuditActorType,
  AuditSeverity,
  PrizeClaimStatus,
  PrizePayoutStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { WhtDeductionService } from '../wht-deduction.service';

import {
  PrizePayoutProviderResult,
} from './prize-payout.provider';

export type PayoutFinalizationActor = {
  type: AuditActorType;
  id: string;
};

const NON_TERMINAL_PAYOUT_STATUSES: PrizePayoutStatus[] = [
  PrizePayoutStatus.REQUESTED,
  PrizePayoutStatus.SUBMITTED,
  PrizePayoutStatus.PROCESSING,
  PrizePayoutStatus.UNKNOWN,
];

@Injectable()
export class PrizePayoutFinalizationService {
  private readonly logger = new Logger(
    PrizePayoutFinalizationService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly whtDeductions: WhtDeductionService,
  ) {}

  /**
   * Used by webhooks/status polling where all we have is the
   * provider result/reference.
   */
  async applyByReference(
    result: PrizePayoutProviderResult,
    actor: PayoutFinalizationActor = {
      type: AuditActorType.SYSTEM,
      id: 'payout-sync',
    },
  ): Promise<{
    found: boolean;
    changed: boolean;
    claimId?: string;
  }> {
    const claim =
      await this.prisma.prizeClaim.findFirst({
        where: {
          OR: [
            {
              payoutReference:
                result.reference,
            },
            {
              payoutIdempotencyKey:
                result.reference,
            },
          ],
        },

        select: {
          claimId: true,
        },
      });

    if (!claim) {
      this.logger.warn(
        `No prize claim found for payout reference ${result.reference}`,
      );

      return {
        found: false,
        changed: false,
      };
    }

    const changed =
      await this.applyForClaim(
        claim.claimId,
        result,
        actor,
      );

    return {
      found: true,
      changed,
      claimId: claim.claimId,
    };
  }

  /**
   * This is the single payout state transition authority.
   *
   * Nothing else should directly turn a bank payout into CASH_PAID.
   */
  async applyForClaim(
    claimId: string,
    result: PrizePayoutProviderResult,
    actor: PayoutFinalizationActor,
  ): Promise<boolean> {
    const claim =
      await this.prisma.prizeClaim.findUnique({
        where: {
          claimId,
        },

        select: {
          claimId: true,
          status: true,

          payoutStatus: true,
          payoutProvider: true,
          payoutReference: true,
          payoutIdempotencyKey: true,

          fulfilledAt: true,
        },
      });

    if (!claim) {
      throw new NotFoundException(
        'Prize claim not found',
      );
    }

    /*
     * A Monnify result must never mutate a Flutterwave payout,
     * and vice versa.
     */
    if (
      claim.payoutProvider &&
      claim.payoutProvider !==
        result.provider
    ) {
      this.logger.error(
        `Payout provider mismatch for claim ${claimId}: ` +
          `stored=${claim.payoutProvider}, received=${result.provider}`,
      );

      await this.audit.write({
        severity:
          AuditSeverity.CRITICAL,

        actor,

        action:
          'CLAIM_PAYOUT_PROVIDER_MISMATCH',

        resource: {
          type: 'PrizeClaim',
          id: claimId,
        },

        metadata: {
          storedProvider:
            claim.payoutProvider,
          receivedProvider:
            result.provider,
          reference:
            result.reference,
        },
      });

      return false;
    }

    /*
     * If we already have an external provider reference,
     * reject an unrelated reference.
     *
     * The idempotency key is also allowed because that is the
     * reference sent to providers such as Monnify.
     */
    if (
      claim.payoutReference &&
      claim.payoutReference !==
        result.reference &&
      claim.payoutIdempotencyKey !==
        result.reference
    ) {
      this.logger.error(
        `Payout reference mismatch for claim ${claimId}`,
      );

      await this.audit.write({
        severity:
          AuditSeverity.CRITICAL,

        actor,

        action:
          'CLAIM_PAYOUT_REFERENCE_MISMATCH',

        resource: {
          type: 'PrizeClaim',
          id: claimId,
        },

        metadata: {
          storedReference:
            claim.payoutReference,
          idempotencyKey:
            claim.payoutIdempotencyKey,
          receivedReference:
            result.reference,
        },
      });

      return false;
    }

    switch (result.status) {
      case PrizePayoutStatus.SUCCEEDED:
        return this.markSucceeded(
          claimId,
          result,
          actor,
        );

      case PrizePayoutStatus.FAILED:
        return this.markFailed(
          claimId,
          result,
          actor,
        );

      case PrizePayoutStatus.REVERSED:
        return this.markReversed(
          claimId,
          result,
          actor,
        );

      case PrizePayoutStatus.SUBMITTED:
      case PrizePayoutStatus.PROCESSING:
      case PrizePayoutStatus.UNKNOWN:
        return this.markNonTerminal(
          claimId,
          result,
          actor,
        );

      case PrizePayoutStatus.REQUESTED:
        /*
         * REQUESTED is an internal SureWina state.
         * Providers should not normally send it back.
         */
        return false;

      default:
        return false;
    }
  }

  private async markSucceeded(
    claimId: string,
    result: PrizePayoutProviderResult,
    actor: PayoutFinalizationActor,
  ): Promise<boolean> {
    const completedAt = new Date();

    /*
     * Atomic compare-and-set.
     *
     * If two webhook/status requests arrive at the same time,
     * only one is allowed to perform fulfilment.
     */
    const updated =
      await this.prisma.prizeClaim.updateMany({
        where: {
          claimId,

          status:
            PrizeClaimStatus.KYC_CLEARED,

          payoutStatus: {
            in: NON_TERMINAL_PAYOUT_STATUSES,
          },
        },

        data: {
          payoutProvider:
            result.provider,

          payoutReference:
            result.reference,

          payoutStatus:
            PrizePayoutStatus.SUCCEEDED,

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

    /*
     * Duplicate webhook/status check.
     *
     * The first request already completed the payout.
     */
    if (updated.count !== 1) {
      return false;
    }

    /*
     * WHT certificate is issued only after confirmed payout success.
     */
    await this.whtDeductions.recordForClaim(
      claimId,
    );

    await this.audit.write({
      severity:
        AuditSeverity.INFO,

      actor,

      action:
        'CLAIM_PAYOUT_SUCCEEDED',

      resource: {
        type: 'PrizeClaim',
        id: claimId,
      },

      metadata: {
        provider:
          result.provider,

        reference:
          result.reference,

        rawStatus:
          result.rawStatus ?? null,
      },
    });

    return true;
  }

  private async markFailed(
    claimId: string,
    result: PrizePayoutProviderResult,
    actor: PayoutFinalizationActor,
  ): Promise<boolean> {
    const checkedAt = new Date();

    const updated =
      await this.prisma.prizeClaim.updateMany({
        where: {
          claimId,

          payoutStatus: {
            in: NON_TERMINAL_PAYOUT_STATUSES,
          },
        },

        data: {
          payoutProvider:
            result.provider,

          payoutReference:
            result.reference,

          payoutStatus:
            PrizePayoutStatus.FAILED,

          payoutLastCheckedAt:
            checkedAt,

          payoutFailureReason:
            result.failureReason ??
            result.rawStatus ??
            'Provider reported payout failure',
        },
      });

    if (updated.count !== 1) {
      return false;
    }

    await this.audit.write({
      severity:
        AuditSeverity.WARNING,

      actor,

      action:
        'CLAIM_PAYOUT_FAILED',

      resource: {
        type: 'PrizeClaim',
        id: claimId,
      },

      metadata: {
        provider:
          result.provider,

        reference:
          result.reference,

        rawStatus:
          result.rawStatus ?? null,

        reason:
          result.failureReason ??
          null,
      },
    });

    return true;
  }

  private async markNonTerminal(
    claimId: string,
    result: PrizePayoutProviderResult,
    actor: PayoutFinalizationActor,
  ): Promise<boolean> {
    const checkedAt = new Date();

    const updated =
      await this.prisma.prizeClaim.updateMany({
        where: {
          claimId,

          payoutStatus: {
            in: NON_TERMINAL_PAYOUT_STATUSES,
          },
        },

        data: {
          payoutProvider:
            result.provider,

          payoutReference:
            result.reference,

          payoutStatus:
            result.status,

          payoutLastCheckedAt:
            checkedAt,

          payoutFailureReason:
            result.status ===
            PrizePayoutStatus.UNKNOWN
              ? result.failureReason ??
                'Provider payout state is unknown'
              : null,
        },
      });

    if (updated.count !== 1) {
      return false;
    }

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
          ? 'CLAIM_PAYOUT_STATUS_UNKNOWN'
          : 'CLAIM_PAYOUT_STATUS_UPDATED',

      resource: {
        type: 'PrizeClaim',
        id: claimId,
      },

      metadata: {
        provider:
          result.provider,

        reference:
          result.reference,

        payoutStatus:
          result.status,

        rawStatus:
          result.rawStatus ?? null,
      },
    });

    return true;
  }

  private async markReversed(
    claimId: string,
    result: PrizePayoutProviderResult,
    actor: PayoutFinalizationActor,
  ): Promise<boolean> {
    const checkedAt = new Date();

    /*
     * A reversal can happen after success.
     *
     * The claim becomes unfulfilled again, but it is NOT automatically
     * retried. Finance must review it first.
     */
    const updated =
      await this.prisma.prizeClaim.updateMany({
        where: {
          claimId,

          payoutStatus: {
            in: [
              ...NON_TERMINAL_PAYOUT_STATUSES,
              PrizePayoutStatus.SUCCEEDED,
            ],
          },
        },

        data: {
          payoutProvider:
            result.provider,

          payoutReference:
            result.reference,

          payoutStatus:
            PrizePayoutStatus.REVERSED,

          payoutLastCheckedAt:
            checkedAt,

          payoutFailureReason:
            result.failureReason ??
            'Provider reported payout reversal',

          status:
            PrizeClaimStatus.KYC_CLEARED,

          fulfilledAt:
            null,
        },
      });

    if (updated.count !== 1) {
      return false;
    }

    await this.audit.write({
      severity:
        AuditSeverity.CRITICAL,

      actor,

      action:
        'CLAIM_PAYOUT_REVERSED',

      resource: {
        type: 'PrizeClaim',
        id: claimId,
      },

      metadata: {
        provider:
          result.provider,

        reference:
          result.reference,

        rawStatus:
          result.rawStatus ?? null,

        reason:
          result.failureReason ??
          null,

        requiresFinanceReview:
          true,
      },
    });

    return true;
  }
}
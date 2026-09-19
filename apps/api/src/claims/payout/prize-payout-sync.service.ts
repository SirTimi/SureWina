import { Injectable, Logger } from '@nestjs/common';
import { AuditActorType } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

import { PrizePayoutProviderCode } from './prize-payout.provider';

import { PrizePayoutProviderRegistry } from './prize-payout-provider.registry';

import { PrizePayoutAttemptFinalizationService } from './prize-payout-attempt-finalization.service';

@Injectable()
export class PrizePayoutSyncService {
  private readonly logger = new Logger(
    PrizePayoutSyncService.name,
  );

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly providers:
      PrizePayoutProviderRegistry,

    private readonly finalizer:
      PrizePayoutAttemptFinalizationService,
  ) {}

  async syncReference(
    providerCode:
      PrizePayoutProviderCode,

    incomingReference:
      string,

    actorId:
      string,
  ) {
    const reference =
      incomingReference.trim();

    if (!reference) {
      return {
        found: false,
        changed: false,
      };
    }

    /*
     * Resolve the SureWina payout attempt first.
     *
     * providerReference may be null if the provider accepted
     * the transfer but SureWina lost the response before saving
     * the returned reference.
     *
     * The immutable idempotency key therefore remains a valid
     * lookup path.
     */
    const attempt =
      await this.prisma.prizePayoutAttempt.findFirst({
        where: {
          provider:
            providerCode,

          OR: [
            {
              providerReference:
                reference,
            },
            {
              idempotencyKey:
                reference,
            },
          ],
        },

        orderBy: {
          attemptNumber:
            'desc',
        },
      });

    if (!attempt) {
      this.logger.warn(
        `No ${providerCode} payout attempt found for reference ${reference}`,
      );

      return {
        found: false,
        changed: false,
      };
    }

    const provider =
      this.providers.get(
        attempt.provider,
      );

    /*
     * Prefer the saved provider reference.
     *
     * Fall back to the immutable SureWina reference if the
     * original provider response was lost.
     */
    const lookupReference =
      attempt.providerReference ??
      attempt.idempotencyKey;

    /*
     * Never trust webhook status directly.
     *
     * Query the provider's authenticated API and use that result
     * as the source of truth.
     */
    const verified =
      await provider.getStatus(
        lookupReference,
      );

    const changed =
      await this.finalizer.applyForAttempt(
        attempt.attemptId,

        verified,

        {
          type:
            AuditActorType.SYSTEM,

          id:
            actorId,
        },
      );

    return {
      found: true,
      changed,

      attemptId:
        attempt.attemptId,

      claimId:
        attempt.claimId,
    };
  }
}
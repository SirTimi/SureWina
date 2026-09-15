import {
  Injectable,
} from '@nestjs/common';

import {
  AuditActorType,
} from '@prisma/client';

import {
  MonnifyPrizePayoutProvider,
} from './monnify-prize-payout.provider';

import {
  PrizePayoutFinalizationService,
} from './prize-payout-finalization.service';

@Injectable()
export class MonnifyPayoutSyncService {
  constructor(
    private readonly monnify:
      MonnifyPrizePayoutProvider,

    private readonly finalizer:
      PrizePayoutFinalizationService,
  ) {}

  async syncReference(
    reference: string,
  ) {
    /*
     * Never trust the webhook status by itself.
     *
     * Re-query Monnify using the authenticated API and use
     * that result as the source of truth.
     */
    const result =
      await this.monnify.getStatus(
        reference,
      );

    return this.finalizer.applyByReference(
      result,
      {
        type:
          AuditActorType.SYSTEM,

        id:
          'monnify-disbursement-sync',
      },
    );
  }
}
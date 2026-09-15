import {
  Body,
  Controller,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  MonnifyWebhookSignatureGuard,
} from './monnify-webhook-signature.guard';

import {
  MonnifyPayoutSyncService,
} from './monnify-payout-sync.service';

type MonnifyDisbursementWebhook = {
  eventType?: string;

  eventData?: {
    reference?: string;

    transactionReference?: string;

    status?: string;
  };
};

@Controller(
  'webhooks/monnify',
)
export class MonnifyPayoutWebhookController {
  private readonly logger =
    new Logger(
      MonnifyPayoutWebhookController.name,
    );

  constructor(
    private readonly sync:
      MonnifyPayoutSyncService,
  ) {}

  @Post('disbursement')
  @UseGuards(
    MonnifyWebhookSignatureGuard,
  )
  async handleDisbursement(
    @Body()
    body:
      MonnifyDisbursementWebhook,
  ) {
    const eventType =
      body?.eventType
        ?.trim()
        .toUpperCase();

    /*
     * The URL is dedicated to disbursement notifications.
     *
     * Still reject/ignore unrelated Monnify event types if
     * one is ever posted here accidentally.
     */
    if (
      eventType &&
      !eventType.includes(
        'DISBURSEMENT',
      )
    ) {
      return {
        received: true,
        ignored: true,
        reason:
          'Not a disbursement event',
      };
    }

    /*
     * We need SureWina's merchant reference, not Monnify's
     * internal transaction reference.
     */
    const reference =
      body?.eventData?.reference;

    if (!reference) {
      this.logger.warn(
        'Monnify disbursement webhook missing reference',
      );

      return {
        received: true,
        ignored: true,
        reason:
          'Missing payout reference',
      };
    }

    /*
     * We deliberately do not trust body.eventData.status.
     *
     * syncReference() performs an authenticated status query
     * against Monnify before any financial state changes.
     */
    const result =
      await this.sync.syncReference(
        reference,
      );

    return {
      received: true,
      reference,

      matched:
        result.found,

      changed:
        result.changed,
    };
  }
}
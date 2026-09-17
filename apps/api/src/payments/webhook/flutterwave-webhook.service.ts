import {
  Injectable,
  Logger,
} from '@nestjs/common';

import {
  PurchaseConfirmationService,
} from '../purchase-confirmation.service';

import {
  PaymentVerificationService,
} from '../payment-verification.service';

import {
  NotificationQueueService,
} from '../../queue/notification-queue.service';

import { WalletFundingService } from '../wallet-funding.service';

type FlwEvent = {
  event: string;

  data?: {
    id?:
      number | string;

    tx_ref?:
      string;

    status?:
      string;

    meta?:
      Record<string, unknown>;
  };
};

@Injectable()
export class FlutterwaveWebhookService {
  private readonly logger =
    new Logger(
      FlutterwaveWebhookService.name,
    );

  constructor(
    private readonly purchaseConfirmation:
      PurchaseConfirmationService,

    private readonly verification:
      PaymentVerificationService,

    private readonly notificationQueue:
      NotificationQueueService,

    private readonly walletFunding:
      WalletFundingService,
  ) {}

  async handle(
    event: FlwEvent,
  ): Promise<void> {
    /*
     * Do not trust webhook status.
     *
     * We only use the event as a signal that this
     * transaction should now be verified.
     */
    if (
      event.event !==
      'charge.completed'
    ) {
      this.logger.debug(
        `Ignoring Flutterwave event: ${event.event}`,
      );

      return;
    }

    const transactionId =
      event.data?.id;

    if (
      transactionId ===
        undefined ||
      transactionId === null
    ) {
      this.logger.warn(
        'Flutterwave charge.completed missing transaction id',
      );

      return;
    }

    try {
      const verified =
        await this.verification.verifyFlutterwave(
          transactionId,
        );

      if (!verified) {
        this.logger.warn(
          `Could not independently verify Flutterwave transaction ${transactionId}`,
        );

        return;
      }

      /*
       * Optional diagnostic check.
       *
       * Fulfilment still uses the authenticated verification
       * response as the authoritative reference.
       */
      if (
        event.data?.tx_ref &&
        event.data.tx_ref !==
          verified.reference
      ) {
        this.logger.warn(
          `Flutterwave webhook tx_ref mismatch: webhook=${event.data.tx_ref}, verified=${verified.reference}`,
        );
      }

      const funding = await this.walletFunding.confirmIfFunding({
        reference: verified.reference,
        verifiedPayment: verified,
        rawEvent: event,
      });

      if (funding) {
        this.logger.log(
          `Wallet funding processed for ${verified.reference}`,
        );
        return;
      }

      const confirmed =
        await this.purchaseConfirmation.confirmAndCreateTickets({
          reference:
            verified.reference,

          verifiedPayment:
            verified,

          rawEvent:
            event,
        });

      if (!confirmed) {
        return;
      }

      await this.notificationQueue.enqueueTicketConfirmationSms({
        txnId:
          confirmed.txnId,

        buyerPhone:
          confirmed.buyerPhone,

        drawCode:
          confirmed.drawCode,

        drawScheduledAt:
          confirmed.drawScheduledAt,

        ticketRefs:
          confirmed.ticketRefs,

        amountNgn:
          confirmed.amountNgn,
      });

      if (
        confirmed.jackpotMinted
      ) {
        await this.notificationQueue.enqueueJackpotEntrySms(
          confirmed.jackpotMinted,
        );
      }
    } catch (error) {
      this.logger.error(
        `Flutterwave webhook failed for transaction ${transactionId}: ${
          error instanceof Error
            ? error.message
            : 'unknown'
        }`,
      );
    }
  }
}
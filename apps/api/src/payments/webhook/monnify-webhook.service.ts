import {
  Injectable,
  Logger,
} from '@nestjs/common';

import { PurchaseConfirmationService } from '../purchase-confirmation.service';
import { PaymentVerificationService } from '../payment-verification.service';
import { WalletFundingService } from '../wallet-funding.service';
import { NotificationQueueService } from '../../queue/notification-queue.service';

type MonnifyCollectionWebhook = {
  eventType?: string;

  eventData?: {
    paymentReference?: string;
    transactionReference?: string;
    paymentStatus?: string;
  };
};

@Injectable()
export class MonnifyWebhookService {
  private readonly logger =
    new Logger(
      MonnifyWebhookService.name,
    );

  constructor(
    private readonly purchaseConfirmation:
      PurchaseConfirmationService,

    private readonly verification:
      PaymentVerificationService,

    private readonly walletFunding:
      WalletFundingService,

    private readonly notificationQueue:
      NotificationQueueService,
  ) {}

  async handle(
    event: MonnifyCollectionWebhook,
  ): Promise<void> {
    const eventType =
      event.eventType
        ?.trim()
        .toUpperCase();

    if (
      eventType !==
      'SUCCESSFUL_TRANSACTION'
    ) {
      this.logger.debug(
        `Ignoring Monnify collection event: ${eventType ?? 'unknown'}`,
      );

      return;
    }

    const reference =
      event.eventData
        ?.paymentReference
        ?.trim();

    if (!reference) {
      this.logger.warn(
        'Monnify collection webhook missing paymentReference',
      );

      return;
    }

    try {
      /*
       * Never trust webhook paymentStatus.
       *
       * Verify the merchant paymentReference through Monnify's
       * authenticated transaction query before delivering value.
       */
      const verified =
        await this.verification.verifyMonnify(
          reference,
        );

      if (!verified) {
        this.logger.warn(
          `Could not independently verify Monnify payment ${reference}`,
        );

        return;
      }

      const funding =
        await this.walletFunding.confirmIfFunding({
          reference,
          verifiedPayment:
            verified,
          rawEvent:
            event,
        });

      if (funding) {
        this.logger.log(
          `Monnify wallet funding processed for ${reference}`,
        );

        return;
      }

      const confirmed =
        await this.purchaseConfirmation.confirmAndCreateTickets({
          reference,
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
        `Monnify webhook processing failed for ${reference}: ${
          error instanceof Error
            ? error.message
            : 'unknown'
        }`,
      );
    }
  }
}

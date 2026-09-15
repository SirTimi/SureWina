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

type PaystackEvent = {
  event: string;

  data?: {
    reference?: string;
    status?: string;
    metadata?:
      Record<string, unknown>;
  };
};

@Injectable()
export class PaystackWebhookService {
  private readonly logger =
    new Logger(
      PaystackWebhookService.name,
    );

  constructor(
    private readonly purchaseConfirmation:
      PurchaseConfirmationService,

    private readonly verification:
      PaymentVerificationService,

    private readonly notificationQueue:
      NotificationQueueService,
  ) {}

  async handle(
    event: PaystackEvent,
  ): Promise<void> {
    if (
      event.event !==
      'charge.success'
    ) {
      this.logger.debug(
        `Ignoring Paystack event: ${event.event}`,
      );

      return;
    }

    const reference =
      event.data?.reference;

    if (!reference) {
      this.logger.warn(
        'charge.success with no reference — ignoring',
      );

      return;
    }

    try {
      /*
       * Signed webhook is only the trigger.
       *
       * Paystack's verification API is the authority.
       */
      const verified =
        await this.verification.verifyPaystack(
          reference,
        );

      if (!verified) {
        this.logger.warn(
          `Could not independently verify Paystack payment ${reference}`,
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

        ticketRefs:
          confirmed.ticketRefs,

        drawScheduledAt:
          confirmed.drawScheduledAt,

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
        `Webhook processing failed for ${reference}: ${
          error instanceof Error
            ? error.message
            : 'unknown'
        }`,
      );
    }
  }
}
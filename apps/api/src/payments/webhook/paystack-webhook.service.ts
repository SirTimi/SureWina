import { Injectable, Logger } from '@nestjs/common';
import { PurchaseConfirmationService } from '../purchase-confirmation.service';
import { NotificationQueueService } from '../../queue/notification-queue.service';

type PaystackEvent = {
  event: string;
  data?: {
    reference?: string;
    status?: string;
    metadata?: Record<string, unknown>;
  };
};

@Injectable()
export class PaystackWebhookService {
  private readonly logger = new Logger(PaystackWebhookService.name);

  constructor(
    private readonly purchaseConfirmation: PurchaseConfirmationService,
    private readonly notificationQueue: NotificationQueueService,
  ) {}

  // Never throws — the controller must be able to 200 any validly-signed event.
  async handle(event: PaystackEvent): Promise<void> {
    if (event.event !== 'charge.success') {
      this.logger.debug(`Ignoring Paystack event: ${event.event}`);
      return;
    }

    const reference = event.data?.reference;
    if (!reference) {
      this.logger.warn('charge.success with no reference — ignoring');
      return;
    }

    try {
      const confirmed = await this.purchaseConfirmation.confirmAndCreateTickets({
        reference,
        drawCode: event.data?.metadata?.drawCode as string | undefined,
        stateOfPlayCode: event.data?.metadata?.stateOfPlayCode as
          | string
          | undefined,
        rawEvent: event,
      });

      // Post-commit side effect only — an SMS can never exist for a
      // rolled-back purchase, and a queue outage can't undo a confirmation.
      if (confirmed) {
        await this.notificationQueue.enqueueTicketConfirmationSms({
          txnId: confirmed.txnId,
          buyerPhone: confirmed.buyerPhone,
          drawCode: confirmed.drawCode,
          ticketRefs: confirmed.ticketRefs,
          drawScheduledAt: confirmed.drawScheduledAt,
          amountNgn: confirmed.amountNgn,
        });
      }
    } catch (error) {
      this.logger.error(
        `Webhook processing failed for ${reference}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}
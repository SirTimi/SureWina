import { Injectable, Logger } from '@nestjs/common';
import { PurchaseConfirmationService } from '../purchase-confirmation.service';
import { NotificationQueueService } from '../../queue/notification-queue.service';

type FlwEvent = {
  event: string; // 'charge.completed'
  data?: {
    tx_ref?: string;
    status?: string; // 'successful'
    meta?: Record<string, unknown>;
  };
};

@Injectable()
export class FlutterwaveWebhookService {
  private readonly logger = new Logger(FlutterwaveWebhookService.name);

  constructor(
    private readonly purchaseConfirmation: PurchaseConfirmationService,
    private readonly notificationQueue: NotificationQueueService,
  ) {}

  async handle(event: FlwEvent): Promise<void> {
    if (event.event !== 'charge.completed' || event.data?.status !== 'successful') {
      this.logger.debug(`Ignoring Flutterwave event: ${event.event}/${event.data?.status}`);
      return;
    }

    const reference = event.data?.tx_ref;
    if (!reference) {
      this.logger.warn('charge.completed with no tx_ref — ignoring');
      return;
    }

    try {
      const confirmed = await this.purchaseConfirmation.confirmAndCreateTickets({
        reference,
        drawCode: event.data?.meta?.drawCode as string | undefined,
        stateOfPlayCode: event.data?.meta?.stateOfPlayCode as string | undefined,
        rawEvent: event,
      });

      if (confirmed) {
        await this.notificationQueue.enqueueTicketConfirmationSms({
          txnId: confirmed.txnId,
          buyerPhone: confirmed.buyerPhone,
          drawCode: confirmed.drawCode,
          drawScheduledAt: confirmed.drawScheduledAt,
          ticketRefs: confirmed.ticketRefs,
          amountNgn: confirmed.amountNgn,
        });
      }
    } catch (error) {
      this.logger.error(
        `Flutterwave webhook failed for ${reference}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}
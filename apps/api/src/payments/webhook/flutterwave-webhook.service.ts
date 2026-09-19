import { Injectable, Logger } from '@nestjs/common';

import { PurchaseConfirmationService } from '../purchase-confirmation.service';
import { PaymentVerificationService } from '../payment-verification.service';
import { NotificationQueueService } from '../../queue/notification-queue.service';
import { WalletFundingService } from '../wallet-funding.service';
import { PrizePayoutSyncService } from '../../claims/payout/prize-payout-sync.service';

type FlwEvent = {
  event?: string;
  type?: string;

  data?: {
    id?: number | string;

    tx_ref?: string;
    reference?: string;

    status?: string;

    meta?: Record<string, unknown>;
  };
};

@Injectable()
export class FlutterwaveWebhookService {
  private readonly logger = new Logger(
    FlutterwaveWebhookService.name,
  );

  constructor(
    private readonly purchaseConfirmation: PurchaseConfirmationService,
    private readonly verification: PaymentVerificationService,
    private readonly notificationQueue: NotificationQueueService,
    private readonly walletFunding: WalletFundingService,
    private readonly prizePayoutSync: PrizePayoutSyncService,
  ) {}

  async handle(event: FlwEvent): Promise<void> {
    const eventName =
      event.event
        ?.trim()
        .toLowerCase() ?? '';

    const eventType =
      event.type
        ?.trim()
        .toLowerCase() ?? '';

    /*
     * Prize payout event.
     *
     * Flutterwave v3 uses transfer.completed.
     *
     * We also recognise transfer.disburse so the handler remains
     * compatible with Flutterwave's newer transfer-event shape.
     *
     * IMPORTANT:
     * We do not trust event.data.status.
     */
    if (
      eventName === 'transfer.completed' ||
      eventType === 'transfer.disburse'
    ) {
      const reference =
        event.data?.reference?.trim();

      if (!reference) {
        this.logger.warn(
          'Flutterwave payout webhook missing transfer reference',
        );

        return;
      }

      try {
        const result =
          await this.prizePayoutSync.syncReference(
            'FLUTTERWAVE',
            reference,
            'flutterwave-transfer-webhook',
          );

        if (!result.found) {
          this.logger.warn(
            `Flutterwave transfer webhook did not match a payout attempt: ${reference}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Flutterwave payout sync failed for ${reference}: ${
            error instanceof Error
              ? error.message
              : 'unknown'
          }`,
        );
      }

      return;
    }

    /*
     * Everything below here is Flutterwave customer-payment handling.
     */
    if (eventName !== 'charge.completed') {
      this.logger.debug(
        `Ignoring Flutterwave event: ${eventName || eventType || 'unknown'}`,
      );

      return;
    }

    const transactionId =
      event.data?.id;

    if (
      transactionId === undefined ||
      transactionId === null
    ) {
      this.logger.warn(
        'Flutterwave charge.completed missing transaction id',
      );

      return;
    }

    try {
      /*
       * Webhook status is only a trigger.
       *
       * Independently verify the actual transaction with Flutterwave.
       */
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

      if (
        event.data?.tx_ref &&
        event.data.tx_ref !==
          verified.reference
      ) {
        this.logger.warn(
          `Flutterwave webhook tx_ref mismatch: webhook=${event.data.tx_ref}, verified=${verified.reference}`,
        );
      }

      /*
       * First determine whether this payment belongs to wallet
       * funding rather than a direct ticket purchase.
       */
      const funding =
        await this.walletFunding.confirmIfFunding({
          reference:
            verified.reference,

          verifiedPayment:
            verified,

          rawEvent:
            event,
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

      if (confirmed.jackpotMinted) {
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
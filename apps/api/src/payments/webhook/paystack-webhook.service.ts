
import {
  BadRequestException,
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
  WalletFundingService,
} from '../wallet-funding.service';

import {
  NotificationQueueService,
} from '../../queue/notification-queue.service';

import {
  PaystackIdentityWebhookService,
} from '../../claims/kyc/paystack-identity-webhook.service';

import { PrizePayoutSyncService } from '../../claims/payout/prize-payout-sync.service'
/**
 * Paystack webhook event payload.
 *
 * Payment events use reference, status and metadata.
 * Customer identification events use customer_code,
 * identification and, on failure, reason.
 */
export type PaystackEvent = {
  event: string;

  data?: {
    reference?: string;
    status?: string;
    metadata?: Record<string, unknown>;

    customer_id?: number | string;
    customer_code?: string;
    email?: string;

    identification?: {
      country?: string;
      type?: string;
      bvn?: string;
      account_number?: string;
      bank_code?: string;
    };

    reason?: string;
  };
};

@Injectable()
export class PaystackWebhookService {
  private readonly logger = new Logger(
    PaystackWebhookService.name,
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

    private readonly identityVerification:
      PaystackIdentityWebhookService,
    
    private readonly payoutSync: PrizePayoutSyncService
  ) {}

  async handle(event: PaystackEvent): Promise<void> {
    if (
      !event ||
      typeof event !== 'object' ||
      typeof event.event !== 'string'
    ) {
      throw new BadRequestException(
        'Invalid Paystack webhook event',
      );
    }

    /**
     * PHASE 2: CUSTOMER IDENTIFICATION
     *
     * These events are separate from payments.
     *
     * Paystack validates the submitted BVN and bank
     * details asynchronously.
     *
     * A successful identification event must be
     * correlated with an existing verification attempt
     * before KYC can be marked as verified.
     *
     * The controller's PaystackSignatureGuard verifies
     * the webhook's HMAC-SHA512 signature.
     */
    if (
      event.event === 'customeridentification.success' ||
      event.event === 'customeridentification.failed'
    ) {
      await this.handleIdentityEvent(event);
      return;
    }


    
    if (
      event.event === 'transfer.success' ||
      event.event === 'transfer.failed' ||
      event.event === 'transfer.reversed'
    ) {
      const reference = event.data?.reference;

        if (
          typeof reference !== 'string' ||
            !/^[a-z0-9_-]{16,50}$/.test(reference)
        ) {
          throw new BadRequestException(
            'Invalid Paystack transfer reference',
          );
        }

      // A signed webhook is only a notification.
      // The existing synchronization service independently
      // calls the provider's authenticated verification API.
      //
      // Never finalize from event.data.status.
      const result = await this.payoutSync.syncReference(
        'PAYSTACK',
        reference,
        'paystack-transfer-webhook',
      );

      if (!result.found) {
        // Do not invent a payout attempt from a webhook.
        // Log a reference only, never bank details.
        this.logger.warn(
          `Unmatched Paystack payout webhook: ${reference}`,
        );
      }

      return;
    }

    /**
     * EXISTING PAYMENT FLOW
     *
     * Preserve the current charge.success handling
     * for direct ticket purchases and wallet funding.
     */
    if (event.event !== 'charge.success') {
      this.logger.debug(
        `Ignoring Paystack event: ${event.event}`,
      );
      return;
    }

    const reference = event.data?.reference;

    if (
      typeof reference !== 'string' ||
      !reference.trim()
    ) {
      this.logger.warn(
        'charge.success with no reference — ignoring',
      );
      return;
    }

    try {
      /**
       * A signed payment webhook is only a trigger.
       *
       * Independently verify the transaction using
       * Paystack before issuing tickets or crediting
       * an eligible wallet funding.
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

      /**
       * Check whether the payment belongs to
       * an existing wallet funding request.
       */
      const funding =
        await this.walletFunding.confirmIfFunding({
          reference,
          verifiedPayment: verified,
          rawEvent: event,
        });

      if (funding) {
        this.logger.log(
          `Wallet funding processed for ${reference}`,
        );
        return;
      }

      /**
       * Otherwise, process a direct ticket purchase.
       *
       * The purchase confirmation service remains
       * responsible for idempotent ticket creation.
       */
      const confirmed =
        await this.purchaseConfirmation.confirmAndCreateTickets({
          reference,
          verifiedPayment: verified,
          rawEvent: event,
        });

      if (!confirmed) {
        return;
      }

      /**
       * Send the existing ticket confirmation SMS.
       */
      await this.notificationQueue.enqueueTicketConfirmationSms({
        txnId: confirmed.txnId,
        buyerPhone: confirmed.buyerPhone,
        drawCode: confirmed.drawCode,
        ticketRefs: confirmed.ticketRefs,
        drawScheduledAt: confirmed.drawScheduledAt,
        amountNgn: confirmed.amountNgn,
      });

    } catch (error) {
      /**
       * Preserves the existing payment webhook
       * exception behaviour.
       *
       * Payment verification and financial recovery
       * should be handled by their own services.
       */
      this.logger.error(
        `Webhook processing failed for ${reference}: ${
          error instanceof Error
            ? error.message
            : 'unknown'
        }`,
      );
    }
  }

  /**
   * PHASE 2: PAYSTACK IDENTITY EVENT DISPATCH
   *
   * No verification status is changed directly here.
   *
   * The dedicated handler must:
   * - Find the correct pending identity attempt.
   * - Validate the expected Paystack customer code.
   * - Validate the submitted bank identity.
   * - Reject stale or conflicting verification events.
   * - Persist successful or failed verification safely.
   * - Prevent duplicate processing.
   *
   * Errors are deliberately not swallowed, allowing
   * the controller to return a non-2xx response so
   * Paystack can retry a failed delivery.
   */
  private async handleIdentityEvent(
    event: PaystackEvent,
  ): Promise<void> {
    const customerCode = event.data?.customer_code;

    if (
      typeof customerCode !== 'string' ||
      !/^CUS_[A-Za-z0-9]+$/.test(customerCode)
    ) {
      this.logger.warn(
        'Customer identification event has no valid customer code',
      );

      throw new BadRequestException(
        'Invalid Paystack customer identification event',
      );
    }

    await this.identityVerification.handleWebhook(event);

    this.logger.log(
      'Paystack customer identification event processed',
    );
  }
}

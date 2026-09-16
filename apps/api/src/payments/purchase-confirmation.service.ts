import { Injectable, Logger } from '@nestjs/common';

import {
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  DrawType,
  PaymentStatus,
  Prisma,
  PurchaseChannel,
  TicketType,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { generateTicketRef } from './ticket-ref.util';

import {
  JackpotAccumulationService,
  type MintedJackpotEntries,
} from './jackpot-accumulation.service';

import { ZohoEmailProvider } from '../notifications/zoho-email.provider';
import { ReceiptService } from '../tickets/receipt.service';
import { ticketReceipt } from '../notifications/email.templates';

import {
  drawDisplayName,
  drawShortCode,
} from '../common/draw-naming.util';

import type {
  VerifiedProviderPayment,
} from './payment-verification.service';

/*
 * What the confirmation transaction hands back for
 * post-commit side effects.
 */
export type ConfirmedPurchase = {
  txnId: string;

  buyerPhone: string;

  drawCode: string;

  drawScheduledAt: string;

  ticketRefs: string[];

  amountNgn: number;

  /*
   * Non-null when this purchase crossed a 10-ticket
   * threshold and earned free jackpot entries.
   */
  jackpotMinted: MintedJackpotEntries;
};

export type ConfirmPurchaseParams = {
  /*
   * SureWina's SW-PAY-... reference.
   */
  reference: string;

  /*
   * Independently verified PSP transaction.
   */
  verifiedPayment: VerifiedProviderPayment;

  /*
   * Original signed webhook/callback event.
   */
  rawEvent: unknown;
};

/*
 * Gateway-agnostic purchase confirmation.
 *
 * Paystack and Flutterwave must independently verify
 * their transaction before calling this service.
 *
 * This service owns:
 *
 * - payment row locking
 * - idempotency
 * - provider verification comparison
 * - draw binding
 * - draw cutoff enforcement
 * - draw row locking
 * - ticket creation
 * - jackpot accumulation
 * - payment confirmation
 * - audit recording
 */
@Injectable()
export class PurchaseConfirmationService {
  private readonly logger =
    new Logger(
      PurchaseConfirmationService.name,
    );

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly audit:
      AuditService,

    private readonly jackpotAccumulation:
      JackpotAccumulationService,

    private readonly receipts:
      ReceiptService,

    private readonly email:
      ZohoEmailProvider,
  ) {}

  async confirmAndCreateTickets(
    params: ConfirmPurchaseParams,
  ): Promise<ConfirmedPurchase | null> {
    const {
      reference,
      verifiedPayment,
    } = params;

    return this.prisma.$transaction(
      async (tx) => {
        /*
         * Lock the payment transaction.
         *
         * Concurrent webhook deliveries, browser status
         * checks and provider retries all serialise here.
         */
        const lockedPayment =
          await tx.$queryRaw<
            Array<{
              txn_id: string;
              status: PaymentStatus;
            }>
          >`
            SELECT
              txn_id,
              status
            FROM payment_transactions
            WHERE gateway_reference = ${reference}
            FOR UPDATE
          `;

        if (
          lockedPayment.length === 0
        ) {
          this.logger.warn(
            `No transaction for reference ${reference}`,
          );

          return null;
        }

        const {
          txn_id: txnId,
          status,
        } = lockedPayment[0];

        /*
         * IDEMPOTENCY GATE
         *
         * A duplicate successful webhook must never
         * mint duplicate tickets.
         */
        if (
          status ===
          PaymentStatus.CONFIRMED
        ) {
          this.logger.debug(
            `${reference} already confirmed — no-op`,
          );

          return null;
        }

        /*
         * REVIEW_REQUIRED, FAILED, REFUNDED etc.
         * are intentionally not automatically retried.
         */
        if (
          status !==
          PaymentStatus.PENDING
        ) {
          this.logger.warn(
            `${reference} in status ${status}, cannot confirm`,
          );

          return null;
        }

        const txn =
          await tx.paymentTransaction.findUniqueOrThrow({
            where: {
              txnId,
            },
          });

        /*
         * Keep both the webhook and the authenticated
         * provider verification response for later
         * investigation/reconciliation.
         */
        const storedPayload = {
          event:
            params.rawEvent ??
            null,

          verification:
            verifiedPayment.raw ??
            null,
        } as Prisma.InputJsonValue;

        /*
         * A provider can conclusively tell us that the
         * payment failed.
         *
         * This is different from a successful payment
         * that cannot safely be fulfilled.
         */
        if (
          verifiedPayment.status ===
          'FAILED'
        ) {
          await tx.paymentTransaction.update({
            where: {
              txnId,
            },

            data: {
              status:
                PaymentStatus.FAILED,

              failureReason:
                'PROVIDER_VERIFIED_FAILED',

              webhookPayload:
                storedPayload,
            },
          });

          await this.audit.write({
            severity:
              AuditSeverity.WARNING,

            actor: {
              type:
                AuditActorType.SYSTEM,
            },

            action:
              'PAYMENT_PROVIDER_VERIFIED_FAILED',

            resource: {
              type:
                'PaymentTransaction',
              id:
                txnId,
            },

            metadata: {
              reference,

              gateway:
                verifiedPayment.gateway,

              providerTransactionId:
                verifiedPayment.providerTransactionId,
            },
          });

          return null;
        }

        /*
         * A provider transaction that is still pending
         * must not create tickets.
         *
         * Leave our transaction PENDING so another
         * verified event/status check can process it.
         */
        if (
          verifiedPayment.status !==
          'SUCCESS'
        ) {
          this.logger.debug(
            `${reference}: provider payment is ${verifiedPayment.status}`,
          );

          return null;
        }

        /*
         * -------------------------------------------------
         * FINANCIAL VERIFICATION
         * -------------------------------------------------
         *
         * A signed webhook does not authorise fulfilment.
         *
         * The independently verified transaction must
         * agree with SureWina's own internal record.
         */
        const mismatches:
          string[] = [];

        if (
          verifiedPayment.reference !==
          txn.gatewayReference
        ) {
          mismatches.push(
            `reference expected=${txn.gatewayReference} actual=${verifiedPayment.reference}`,
          );
        }

        if (
          verifiedPayment.reference !==
          reference
        ) {
          mismatches.push(
            `request-reference expected=${reference} actual=${verifiedPayment.reference}`,
          );
        }

        if (
          verifiedPayment.gateway !==
          txn.gateway
        ) {
          mismatches.push(
            `gateway expected=${txn.gateway} actual=${verifiedPayment.gateway}`,
          );
        }

        if (
          verifiedPayment.currency !==
          'NGN'
        ) {
          mismatches.push(
            `currency expected=NGN actual=${verifiedPayment.currency ?? 'NULL'}`,
          );
        }

        if (
          verifiedPayment.amountNgn ===
          null
        ) {
          mismatches.push(
            'amount missing from provider verification',
          );
        } else if (
          verifiedPayment.amountNgn !==
          txn.amountNgn
        ) {
          mismatches.push(
            `amount expected=${txn.amountNgn} actual=${verifiedPayment.amountNgn}`,
          );
        }

        /*
         * The draw must have been bound internally when
         * the payment was created.
         *
         * Never use provider metadata as the source of
         * truth for the destination draw.
         */
        const purchaseDrawId =
          txn.purchaseDrawId;

        if (!purchaseDrawId) {
          mismatches.push(
            'transaction has no internally bound purchaseDrawId',
          );
        }

        /*
         * The provider says SUCCESS, therefore money may
         * already have been received.
         *
         * Do NOT call the payment FAILED merely because
         * our verification expectations did not match.
         */
        if (
          mismatches.length > 0
        ) {
          const reason =
            `VERIFICATION_MISMATCH: ${mismatches.join(
              '; ',
            )}`;

          await tx.paymentTransaction.update({
            where: {
              txnId,
            },

            data: {
              status:
                PaymentStatus.REVIEW_REQUIRED,

              providerPaidAt:
                verifiedPayment.paidAt,

              failureReason:
                reason,

              webhookPayload:
                storedPayload,
            },
          });

          await this.audit.write({
            severity:
              AuditSeverity.CRITICAL,

            actor: {
              type:
                AuditActorType.SYSTEM,
            },

            action:
              'PAYMENT_VERIFICATION_MISMATCH',

            resource: {
              type:
                'PaymentTransaction',
              id:
                txnId,
            },

            metadata: {
              reference,

              gateway:
                txn.gateway,

              providerTransactionId:
                verifiedPayment.providerTransactionId,

              expectedAmountNgn:
                txn.amountNgn,

              verifiedAmountNgn:
                verifiedPayment.amountNgn,

              verifiedCurrency:
                verifiedPayment.currency,

              providerPaidAt:
                verifiedPayment.paidAt
                  ?.toISOString() ??
                null,

              verifiedAt:
                verifiedPayment.verifiedAt.toISOString(),

              mismatches,
            },
          });

          this.logger.error(
            `${reference}: payment verification mismatch: ${mismatches.join(
              '; ',
            )}`,
          );

          return null;
        }

        /*
         * TypeScript cannot infer purchaseDrawId from the
         * mismatches array above, although at runtime the
         * null case has already returned.
         */
        if (!purchaseDrawId) {
          return null;
        }

        /*
         * -------------------------------------------------
         * DRAW LOCK
         * -------------------------------------------------
         *
         * Lock the exact draw associated with this payment.
         *
         * This prevents the draw engine from changing:
         *
         * SALES_CLOSED -> EXECUTING
         *
         * while payment confirmation is deciding whether
         * this ticket belongs in the eligible draw pool.
         */
        const lockedDraw =
          await tx.$queryRaw<
            Array<{
              draw_id: string;
              status: DrawStatus;
              cutoff_at: Date;
            }>
          >`
            SELECT
              draw_id,
              status,
              cutoff_at
            FROM draws
            WHERE draw_id = ${purchaseDrawId}
            FOR UPDATE
          `;

        /*
         * The provider says SUCCESS but the internally
         * bound draw has disappeared.
         *
         * Money may exist, therefore manual review.
         */
        if (
          lockedDraw.length === 0
        ) {
          await tx.paymentTransaction.update({
            where: {
              txnId,
            },

            data: {
              status:
                PaymentStatus.REVIEW_REQUIRED,

              providerPaidAt:
                verifiedPayment.paidAt,

              failureReason:
                'BOUND_PURCHASE_DRAW_NOT_FOUND',

              webhookPayload:
                storedPayload,
            },
          });

          await this.audit.write({
            severity:
              AuditSeverity.CRITICAL,

            actor: {
              type:
                AuditActorType.SYSTEM,
            },

            action:
              'PAYMENT_BOUND_DRAW_MISSING',

            resource: {
              type:
                'PaymentTransaction',
              id:
                txnId,
            },

            metadata: {
              reference,

              purchaseDrawId,

              providerTransactionId:
                verifiedPayment.providerTransactionId,

              providerPaidAt:
                verifiedPayment.paidAt
                  ?.toISOString() ??
                null,

              verifiedAt:
                verifiedPayment.verifiedAt.toISOString(),
            },
          });

          return null;
        }

        /*
         * The row is now locked for the remainder of
         * this database transaction.
         */
        const draw =
          await tx.draw.findUniqueOrThrow({
            where: {
              drawId:
                purchaseDrawId,
            },
          });

        /*
         * -------------------------------------------------
         * DRAW CUTOFF ELIGIBILITY
         * -------------------------------------------------
         *
         * draw.cutoffAt is the source of truth here.
         *
         * That value came from the admin-controlled,
         * approved draw configuration when this specific
         * draw was created.
         *
         * No fixed clock time is used here.
         */
        const providerPaidAt =
          verifiedPayment.paidAt;

        const verifiedAt =
          verifiedPayment.verifiedAt;

        const reviewReasons:
          string[] = [];

        /*
         * If the PSP exposes a reliable exact payment
         * timestamp, use it.
         *
         * Payment must have completed strictly BEFORE
         * cutoffAt.
         *
         * At cutoffAt itself, sales are already closed,
         * matching the rest of SureWina's cutoff logic.
         */
        if (providerPaidAt) {
          if (
            providerPaidAt.getTime() >=
            draw.cutoffAt.getTime()
          ) {
            reviewReasons.push(
              'LATE_PAYMENT_AFTER_CUTOFF',
            );
          }
        } else {
          /*
           * Some providers may verify the transaction as
           * SUCCESS without exposing a reliable exact
           * successful-payment timestamp.
           *
           * If SureWina independently observed SUCCESS
           * before cutoff, the payment must already have
           * succeeded.
           *
           * If the first reliable verification is at or
           * after cutoff, we cannot prove eligibility.
           */
          if (
            verifiedAt.getTime() >=
            draw.cutoffAt.getTime()
          ) {
            reviewReasons.push(
              'PAYMENT_TIMING_UNPROVABLE_AFTER_CUTOFF',
            );
          }
        }

        /*
         * ACTIVE:
         * normal purchase confirmation.
         *
         * SALES_CLOSED:
         * can still be accepted only when payment timing
         * proves it completed before cutoff.
         *
         * The draw row lock prevents the execution engine
         * from starting until this transaction commits.
         *
         * Other states must never receive a new ticket.
         */
        if (
          draw.status !==
            DrawStatus.ACTIVE &&
          draw.status !==
            DrawStatus.SALES_CLOSED
        ) {
          reviewReasons.push(
            `DRAW_NOT_FULFILLABLE_${draw.status}`,
          );
        }

        /*
         * -------------------------------------------------
         * PROVIDER METADATA CONSISTENCY
         * -------------------------------------------------
         *
         * Metadata is NOT authoritative.
         *
         * But because SureWina originally sent the metadata
         * to the PSP, a conflicting drawCode is suspicious
         * enough to stop automatic fulfilment.
         */
        const metadataDrawCode =
          verifiedPayment.metadata
            ?.drawCode;

        if (
          typeof metadataDrawCode ===
            'string' &&
          metadataDrawCode !==
            draw.drawCode
        ) {
          reviewReasons.push(
            `PROVIDER_DRAW_METADATA_MISMATCH expected=${draw.drawCode} actual=${metadataDrawCode}`,
          );
        }

        /*
         * Successful provider payment but unsafe draw
         * eligibility.
         *
         * No tickets.
         * No automatic refund.
         * No automatic move into another draw.
         */
        if (
          reviewReasons.length > 0
        ) {
          await tx.paymentTransaction.update({
            where: {
              txnId,
            },

            data: {
              status:
                PaymentStatus.REVIEW_REQUIRED,

              providerPaidAt,

              failureReason:
                reviewReasons.join(
                  '; ',
                ),

              webhookPayload:
                storedPayload,
            },
          });

          await this.audit.write({
            severity:
              AuditSeverity.CRITICAL,

            actor: {
              type:
                AuditActorType.SYSTEM,
            },

            action:
              'PAYMENT_REQUIRES_REVIEW',

            resource: {
              type:
                'PaymentTransaction',
              id:
                txnId,
            },

            metadata: {
              reference,

              gateway:
                verifiedPayment.gateway,

              providerTransactionId:
                verifiedPayment.providerTransactionId,

              drawId:
                draw.drawId,

              drawCode:
                draw.drawCode,

              drawStatus:
                draw.status,

              cutoffAt:
                draw.cutoffAt.toISOString(),

              scheduledAt:
                draw.scheduledAt.toISOString(),

              providerPaidAt:
                providerPaidAt
                  ?.toISOString() ??
                null,

              verifiedAt:
                verifiedAt.toISOString(),

              reasons:
                reviewReasons,
            },
          });

          this.logger.warn(
            `${reference}: payment requires review: ${reviewReasons.join(
              '; ',
            )}`,
          );

          return null;
        }

        /*
         * -------------------------------------------------
         * INTERNAL PURCHASE AMOUNT CHECK
         * -------------------------------------------------
         *
         * The unit ticket value comes from the amount the
         * customer actually agreed to pay when the
         * transaction was created.
         *
         * It does not come from a possibly later draw price
         * configuration.
         */
        if (
          txn.ticketCount <= 0 ||
          txn.amountNgn %
            txn.ticketCount !==
            0
        ) {
          await tx.paymentTransaction.update({
            where: {
              txnId,
            },

            data: {
              status:
                PaymentStatus.REVIEW_REQUIRED,

              providerPaidAt,

              failureReason:
                'INVALID_INTERNAL_PURCHASE_AMOUNT',

              webhookPayload:
                storedPayload,
            },
          });

          await this.audit.write({
            severity:
              AuditSeverity.CRITICAL,

            actor: {
              type:
                AuditActorType.SYSTEM,
            },

            action:
              'PAYMENT_INTERNAL_AMOUNT_INVALID',

            resource: {
              type:
                'PaymentTransaction',
              id:
                txnId,
            },

            metadata: {
              reference,

              amountNgn:
                txn.amountNgn,

              ticketCount:
                txn.ticketCount,

              providerTransactionId:
                verifiedPayment.providerTransactionId,

              providerPaidAt:
                providerPaidAt
                  ?.toISOString() ??
                null,

              verifiedAt:
                verifiedAt.toISOString(),
            },
          });

          return null;
        }

        const faceValueNgn =
          txn.amountNgn /
          txn.ticketCount;

        const ticketType =
          draw.drawType ===
          DrawType.SATURDAY_JACKPOT
            ? TicketType.JACKPOT
            : TicketType.STANDARD;

        /*
         * stateOfPlayCode is currently carried through the
         * PSP metadata.
         *
         * It does not control financial fulfilment or draw
         * selection.
         */
        const metadataStateCode =
          verifiedPayment.metadata
            ?.stateOfPlayCode;

        const stateCode =
          typeof metadataStateCode ===
            'string' &&
          metadataStateCode.trim()
            ? metadataStateCode.trim()
            : 'NA';

        const ticketsData =
          Array.from(
            {
              length:
                txn.ticketCount,
            },

            () => ({
              ticketRef:
                generateTicketRef(),

              drawId:
                draw.drawId,

              ticketType,

              faceValueNgn,

              buyerPhone:
                txn.buyerPhone,

              buyerUserId:
                txn.buyerUserId,

              agentId:
                txn.agentId,

              purchaseChannel:
                txn.channel ??
                PurchaseChannel.DIRECT,

              stateOfPlayCode:
                stateCode,

              paymentTxnId:
                txnId,
            }),
          );

        /*
         * -------------------------------------------------
         * CONFIRM + CREATE TICKETS
         * -------------------------------------------------
         *
         * Payment confirmation and ticket creation remain
         * inside the same database transaction.
         */
        await tx.paymentTransaction.update({
          where: {
            txnId,
          },

          data: {
            status:
              PaymentStatus.CONFIRMED,

            confirmedAt:
              new Date(),

            /*
             * Keep the PSP's real payment timestamp when
             * available.
             */
            providerPaidAt:
              verifiedPayment.paidAt,

            providerTransactionId:
              verifiedPayment.providerTransactionId,

            failureReason:
              null,

            webhookPayload:
              storedPayload,
          },
        });

        await tx.ticket.createMany({
          data:
            ticketsData,
        });

        /*
         * 10-for-1 accumulation applies only to daily
         * standard tickets.
         */
        let jackpotMinted:
          MintedJackpotEntries =
            null;

        if (
          draw.drawType ===
          DrawType.DAILY_STANDARD
        ) {
          jackpotMinted =
            await this.jackpotAccumulation.recordDailyPurchase(
              tx,
              {
                buyerPhone:
                  txn.buyerPhone,

                buyerUserId:
                  txn.buyerUserId,

                ticketCount:
                  txn.ticketCount,
              },
            );
        }

        await this.audit.write({
          severity:
            AuditSeverity.INFO,

          actor: {
            type:
              AuditActorType.SYSTEM,
          },

          action:
            'PAYMENT_CONFIRMED',

          resource: {
            type:
              'PaymentTransaction',
            id:
              txnId,
          },

          metadata: {
            reference,

            gateway:
              verifiedPayment.gateway,

            providerTransactionId:
              verifiedPayment.providerTransactionId,

            verifiedAmountNgn:
              verifiedPayment.amountNgn,

            verifiedCurrency:
              verifiedPayment.currency,

            providerPaidAt:
              verifiedPayment.paidAt
                ?.toISOString() ??
              null,

            verifiedAt:
              verifiedPayment.verifiedAt.toISOString(),

            cutoffAt:
              draw.cutoffAt.toISOString(),

            scheduledAt:
              draw.scheduledAt.toISOString(),

            drawStatusAtConfirmation:
              draw.status,

            ticketsCreated:
              txn.ticketCount,

            drawCode:
              draw.drawCode,

            jackpotEntriesEarned:
              jackpotMinted
                ? jackpotMinted.entriesMinted
                : 0,
          },
        });

        this.logger.log(
          `Confirmed ${reference}: ${txn.ticketCount} ticket(s) for ${draw.drawCode}`,
        );

        /*
         * Receipt delivery remains non-fatal.
         *
         * A notification failure must not undo a valid
         * financial transaction or ticket creation.
         */
        if (
          txn.buyerEmail
        ) {
          const mail =
            ticketReceipt({
              drawName:
                drawDisplayName(
                  draw.drawType,
                  draw.scheduledAt,
                ),

              drawShortCode:
                drawShortCode(
                  draw.drawType,
                  draw.scheduledAt,
                ),

              drawDate:
                draw.scheduledAt,

              cutoffAt:
                draw.cutoffAt,

              ticketRefs:
                ticketsData.map(
                  (ticket) =>
                    ticket.ticketRef,
                ),

              amountNgn:
                txn.amountNgn,

              receiptUrl:
                await this.receipts.receiptUrl(
                  txnId,
                ),
            });

          void this.email
            .send({
              to:
                txn.buyerEmail,

              ...mail,
            })
            .catch(
              (error) =>
                this.logger.error(
                  `Receipt email failed for ${txnId}: ${
                    error instanceof Error
                      ? error.message
                      : 'unknown'
                  }`,
                ),
            );
        }

        return {
          txnId,

          buyerPhone:
            txn.buyerPhone,

          drawCode:
            draw.drawCode,

          drawScheduledAt:
            draw.scheduledAt.toISOString(),

          ticketRefs:
            ticketsData.map(
              (ticket) =>
                ticket.ticketRef,
            ),

          amountNgn:
            txn.amountNgn,

          jackpotMinted,
        };
      },
    );
  }
}
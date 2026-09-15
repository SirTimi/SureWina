import { Injectable, Logger } from '@nestjs/common';
import {
  AuditActorType,
  AuditSeverity,
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
import { ZohoEmailProvider } from '../notifications/zoho-email.provider'
import { ReceiptService } from '../tickets/receipt.service'
import { ticketReceipt } from '../notifications/email.templates'
import { drawDisplayName, drawShortCode } from '../common/draw-naming.util';
import type {
  VerifiedProviderPayment,
} from './payment-verification.service';

// What the confirmation transaction hands back for post-commit side effects
// (SMS enqueue lives in the callers, never inside the transaction).
export type ConfirmedPurchase = {
  txnId: string;
  buyerPhone: string;
  drawCode: string;
  drawScheduledAt: string;
  ticketRefs: string[];
  amountNgn: number;
  // Non-null when this purchase crossed a 10-ticket threshold and earned
  // free jackpot entries. Carried out rather than notified from inside the
  // transaction: a queued job cannot be rolled back with a failed commit,
  // so the customer would be told about entries that never existed.
  jackpotMinted: MintedJackpotEntries;
};

export type ConfirmPurchaseParams = {
  reference: string;

  verifiedPayment:
    VerifiedProviderPayment;

  // Original signed webhook / callback event.
  rawEvent: unknown;
};

// Gateway-agnostic purchase confirmation. Both the Paystack and Flutterwave
// webhook services parse their own event shapes, then call this with the
// normalised fields. All correctness properties live here, once:
// row-lock serialisation, the idempotency gate, transactional ticket
// creation, jackpot accumulation, and the audit write.
@Injectable()
export class PurchaseConfirmationService {
  private readonly logger = new Logger(PurchaseConfirmationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jackpotAccumulation: JackpotAccumulationService,
    private readonly receipts: ReceiptService,
    private readonly email: ZohoEmailProvider,
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
       * Serialise every fulfilment attempt for this payment.
       */
      const locked =
        await tx.$queryRaw<
          Array<{
            txn_id: string;
            status: PaymentStatus;
          }>
        >`
          SELECT txn_id, status
          FROM payment_transactions
          WHERE gateway_reference = ${reference}
          FOR UPDATE
        `;

      if (locked.length === 0) {
        this.logger.warn(
          `No transaction for reference ${reference}`,
        );

        return null;
      }

      const {
        txn_id: txnId,
        status,
      } = locked[0];

      /*
       * Idempotency.
       *
       * Duplicate webhook/callbacks can never mint
       * duplicate tickets.
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

      if (
        status !== PaymentStatus.PENDING
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

      const storedPayload = {
        event:
          params.rawEvent ?? null,

        verification:
          verifiedPayment.raw ?? null,
      } as Prisma.InputJsonValue;

      /*
       * A provider can conclusively tell us that the
       * payment failed.
       *
       * No tickets.
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
            id: txnId,
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
       * A payment still processing is not a payment
       * we can fulfil.
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
       * Financial verification.
       *
       * Build every mismatch first so one audit record
       * tells Finance exactly what went wrong.
       */
      const mismatches: string[] = [];

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
       * New purchases must have been bound to a draw
       * before the external PSP was called.
       *
       * Never fall back to webhook metadata here.
       */
      if (!txn.purchaseDrawId) {
        mismatches.push(
          'transaction has no internally bound purchaseDrawId',
        );
      }

      /*
       * If anything is wrong, money may still have
       * arrived.
       *
       * Therefore DO NOT mark FAILED.
       *
       * Keep it PENDING for finance investigation,
       * create zero tickets and leave a critical audit.
       */
      if (mismatches.length > 0) {
        const reason =
          `VERIFICATION_MISMATCH: ${mismatches.join(
            '; ',
          )}`;

        await tx.paymentTransaction.update({
          where: {
            txnId,
          },

          data: {
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
            id: txnId,
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
       * From here purchaseDrawId is guaranteed to exist.
       */
      const draw =
        await tx.draw.findUnique({
          where: {
            drawId:
              txn.purchaseDrawId!,
          },
        });

      if (!draw) {
        await tx.paymentTransaction.update({
          where: {
            txnId,
          },

          data: {
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
            id: txnId,
          },

          metadata: {
            reference,

            purchaseDrawId:
              txn.purchaseDrawId,
          },
        });

        return null;
      }

      /*
       * Provider metadata is never authoritative.
       *
       * But because the metadata originally came from
       * SureWina during initialization, it is useful as
       * an additional consistency check.
       */
      const metadataDrawCode =
        verifiedPayment.metadata?.drawCode;

      if (
        typeof metadataDrawCode ===
          'string' &&
        metadataDrawCode !==
          draw.drawCode
      ) {
        const reason =
          `VERIFICATION_MISMATCH: metadata draw expected=${draw.drawCode} actual=${metadataDrawCode}`;

        await tx.paymentTransaction.update({
          where: {
            txnId,
          },

          data: {
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
            'PAYMENT_DRAW_METADATA_MISMATCH',

          resource: {
            type:
              'PaymentTransaction',
            id: txnId,
          },

          metadata: {
            reference,

            internalDrawCode:
              draw.drawCode,

            providerDrawCode:
              metadataDrawCode,
          },
        });

        return null;
      }

      /*
       * The ticket unit value comes from the original
       * agreed transaction amount, not the draw's
       * current price.
       *
       * This prevents a later configuration/price
       * change from changing an already-paid purchase.
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
            id: txnId,
          },

          metadata: {
            reference,
            amountNgn:
              txn.amountNgn,
            ticketCount:
              txn.ticketCount,
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

      const metadataStateCode =
        verifiedPayment.metadata
          ?.stateOfPlayCode;

      const stateCode =
        typeof metadataStateCode ===
          'string' &&
        metadataStateCode.trim()
          ? metadataStateCode
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
       * Confirmation and ticket creation remain in the
       * same transaction.
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
          id: txnId,
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

      if (txn.buyerEmail) {
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
          .catch((error) =>
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
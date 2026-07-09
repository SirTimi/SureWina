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
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { generateTicketRef } from '../ticket-ref.util';
import { JackpotAccumulationService } from '../jackpot-accumulation.service';
import { NotificationQueueService } from '../../queue/notification-queue.service';

type PaystackEvent = {
  event: string;
  data?: {
    reference?: string;
    status?: string;
    metadata?: Record<string, unknown>;
  };
};

// What the confirmation transaction hands back for post-commit side effects.
type ConfirmedPurchase = {
  txnId: string;
  buyerPhone: string;
  drawCode: string;
  ticketRefs: string[];
  amountNgn: number;
};

@Injectable()
export class PaystackWebhookService {
  private readonly logger = new Logger(PaystackWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jackpotAccumulation: JackpotAccumulationService,
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
      const confirmed = await this.confirmAndCreateTickets(reference, event);

      // Post-commit side effects ONLY. The enqueue lives outside the
      // transaction so an SMS can never exist for a rolled-back purchase,
      // and a queue outage can never roll back a confirmed purchase.
      if (confirmed) {
        await this.notificationQueue.enqueueTicketConfirmationSms({
          txnId: confirmed.txnId,
          buyerPhone: confirmed.buyerPhone,
          drawCode: confirmed.drawCode,
          ticketRefs: confirmed.ticketRefs,
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

  private async confirmAndCreateTickets(
    reference: string,
    event: PaystackEvent,
  ): Promise<ConfirmedPurchase | null> {
    return this.prisma.$transaction(async (tx) => {
      // Row lock so concurrent duplicate webhooks serialise here.
      const locked = await tx.$queryRaw<
        Array<{ txn_id: string; status: PaymentStatus }>
      >`
        SELECT txn_id, status
        FROM payment_transactions
        WHERE gateway_reference = ${reference}
        FOR UPDATE
      `;

      if (locked.length === 0) {
        this.logger.warn(`No transaction for reference ${reference}`);
        return null;
      }

      const { txn_id: txnId, status } = locked[0];

      // ── IDEMPOTENCY GATE ──
      if (status === PaymentStatus.CONFIRMED) {
        this.logger.debug(`${reference} already confirmed — no-op`);
        return null;
      }
      if (status !== PaymentStatus.PENDING) {
        this.logger.warn(
          `${reference} in status ${status}, cannot confirm — ignoring`,
        );
        return null;
      }

      const txn = await tx.paymentTransaction.findUniqueOrThrow({
        where: { txnId },
      });

      const drawCode = event.data?.metadata?.drawCode as string | undefined;
      if (!drawCode) {
        this.logger.warn(`${reference}: no drawCode in metadata — ignoring`);
        return null;
      }

      const draw = await tx.draw.findUnique({ where: { drawCode } });
      if (!draw) {
        this.logger.warn(`${reference}: draw ${drawCode} not found — ignoring`);
        return null;
      }

      await tx.paymentTransaction.update({
        where: { txnId },
        data: {
          status: PaymentStatus.CONFIRMED,
          confirmedAt: new Date(),
          webhookPayload: event as unknown as Prisma.InputJsonValue,
        },
      });

      const ticketType =
        draw.drawType === DrawType.SATURDAY_JACKPOT
          ? TicketType.JACKPOT
          : TicketType.STANDARD;

      const stateCode =
        (event.data?.metadata?.stateOfPlayCode as string) ?? 'NA';

      const ticketsData = Array.from({ length: txn.ticketCount }, () => ({
        ticketRef: generateTicketRef(),
        drawId: draw.drawId,
        ticketType,
        faceValueNgn: draw.ticketPriceNgn,
        buyerPhone: txn.buyerPhone,
        buyerUserId: txn.buyerUserId,
        agentId: txn.agentId,
        purchaseChannel: txn.channel ?? PurchaseChannel.DIRECT,
        stateOfPlayCode: stateCode,
        paymentTxnId: txnId,
      }));

      await tx.ticket.createMany({ data: ticketsData });

      // 10-for-1 accumulation — DAILY tickets only, per product rule.
      if (draw.drawType === DrawType.DAILY_STANDARD) {
        await this.jackpotAccumulation.recordDailyPurchase(tx, {
          buyerPhone: txn.buyerPhone,
          buyerUserId: txn.buyerUserId,
          ticketCount: txn.ticketCount,
        });
      }

      await this.audit.write({
        severity: AuditSeverity.INFO,
        actor: { type: AuditActorType.SYSTEM },
        action: 'PAYMENT_CONFIRMED',
        resource: { type: 'PaymentTransaction', id: txnId },
        metadata: {
          reference,
          ticketsCreated: txn.ticketCount,
          drawCode: draw.drawCode,
        },
      });

      this.logger.log(
        `Confirmed ${reference}: ${txn.ticketCount} ticket(s) for ${draw.drawCode}`,
      );

      return {
        txnId,
        buyerPhone: txn.buyerPhone,
        drawCode: draw.drawCode,
        ticketRefs: ticketsData.map((t) => t.ticketRef),
        amountNgn: txn.amountNgn,
      };
    });
  }
}
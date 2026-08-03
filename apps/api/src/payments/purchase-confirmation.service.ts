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
import { JackpotAccumulationService } from './jackpot-accumulation.service';
import { ZohoEmailProvider } from '../notifications/zoho-email.provider'
import { ReceiptService } from '../tickets/receipt.service'
import { ticketReceipt } from '../notifications/email.templates'
import { drawDisplayName, drawShortCode } from '../common/draw-naming.util';

// What the confirmation transaction hands back for post-commit side effects
// (SMS enqueue lives in the callers, never inside the transaction).
export type ConfirmedPurchase = {
  txnId: string;
  buyerPhone: string;
  drawCode: string;
  drawScheduledAt: string;
  ticketRefs: string[];
  amountNgn: number;
};

export type ConfirmPurchaseParams = {
  // Our SW-PAY-... reference, echoed back by whichever gateway charged it.
  reference: string;
  drawCode: string | undefined;
  stateOfPlayCode: string | undefined;
  // The raw webhook event, stored verbatim for audit.
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
    const { reference } = params;

    return this.prisma.$transaction(async (tx) => {
      // Row lock so concurrent duplicate webhooks serialise here.
      const locked = await tx.$queryRaw<Array<{ txn_id: string; status: PaymentStatus }>>`
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

      if (!params.drawCode) {
        this.logger.warn(`${reference}: no drawCode in event — ignoring`);
        return null;
      }

      const draw = await tx.draw.findUnique({
        where: { drawCode: params.drawCode },
      });
      if (!draw) {
        this.logger.warn(
          `${reference}: draw ${params.drawCode} not found — ignoring`,
        );
        return null;
      }

      await tx.paymentTransaction.update({
        where: { txnId },
        data: {
          status: PaymentStatus.CONFIRMED,
          confirmedAt: new Date(),
          webhookPayload: params.rawEvent as Prisma.InputJsonValue,
        },
      });

      const ticketType =
        draw.drawType === DrawType.SATURDAY_JACKPOT
          ? TicketType.JACKPOT
          : TicketType.STANDARD;

      const stateCode = params.stateOfPlayCode ?? 'NA';

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

      // Receipt email. Post-commit and non-blocking: a mail failure must
      // never undo a confirmed purchase or fail the webhook.
      if (txn.buyerEmail) {
        const mail = ticketReceipt({
          drawName: drawDisplayName(draw.drawType, draw.scheduledAt),
          drawShortCode: drawShortCode(draw.drawType, draw.scheduledAt),
          drawDate: draw.scheduledAt,
          cutoffAt: draw.cutoffAt,
          ticketRefs: ticketsData.map((t) => t.ticketRef),
          amountNgn: txn.amountNgn,
          receiptUrl: await this.receipts.receiptUrl(txnId),
        });

        void this.email
          .send({ to: txn.buyerEmail, ...mail })
          .catch((e) =>
            this.logger.error(
              `Receipt email failed for ${txnId}: ${e instanceof Error ? e.message : 'unknown'}`,
            ),
          );
      }

      return {
        txnId,
        buyerPhone: txn.buyerPhone,
        drawCode: draw.drawCode,
        drawScheduledAt: draw.scheduledAt.toISOString(),
        ticketRefs: ticketsData.map((t) => t.ticketRef),
        amountNgn: txn.amountNgn,
      };
    });
  }
}
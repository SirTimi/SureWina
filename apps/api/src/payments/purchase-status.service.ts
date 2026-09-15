import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DrawType, PaymentGateway, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PurchaseConfirmationService } from './purchase-confirmation.service';
import { NotificationQueueService } from '../queue/notification-queue.service';
import { PaymentVerificationService } from './payment-verification.service';

export type PurchaseStatusResponse = {
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  reference: string;
  ticketRefs: string[];
  drawCode: string | null;
  drawScheduledAt: string | null;
  drawPrizeDescription: string | null;
  totalPaidNgn: number;
  buyerPhoneE164: string;
  jackpotAccumulation: {
    cumulativeCount: number;
    ticketsToNextEntry: number;
    newJackpotEntries: number;
  } | null;
};

@Injectable()
export class PurchaseStatusService {
  private readonly logger = new Logger(PurchaseStatusService.name);

  constructor(
    private readonly prisma:
      PrismaService,

    private readonly verification:
      PaymentVerificationService,

    private readonly purchaseConfirmation:
      PurchaseConfirmationService,

    private readonly notificationQueue:
      NotificationQueueService,
  ) {}

  async getStatus(reference: string): Promise<PurchaseStatusResponse> {
    let txn = await this.prisma.paymentTransaction.findUnique({
      where: { gatewayReference: reference },
    });
    if (!txn) throw new NotFoundException('Purchase not found');

    // Verify-on-return: for a still-PENDING Paystack txn, ask Paystack
    // directly. If it succeeded, confirm through the SAME service the
    // webhook uses — identical idempotency; a later webhook no-ops.
    if (
  txn.status ===
    PaymentStatus.PENDING &&
  txn.gateway ===
    PaymentGateway.PAYSTACK
) {
  const verified =
    await this.verification.verifyPaystack(
      reference,
    );

  if (verified) {
    const confirmed =
      await this.purchaseConfirmation.confirmAndCreateTickets({
        reference,

        verifiedPayment:
          verified,

        rawEvent: {
          source:
            'PURCHASE_STATUS_CHECK',

          providerVerification:
            verified.raw,
        },
      });

    if (confirmed) {
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
    }

    txn =
      await this.prisma.paymentTransaction.findUniqueOrThrow({
        where: {
          gatewayReference:
            reference,
        },
      });
  }
}

    const base = {
      reference,
      totalPaidNgn: txn.amountNgn,
      buyerPhoneE164: txn.buyerPhone,
    };

    if (txn.status !== PaymentStatus.CONFIRMED) {
      return {
        ...base,
        status: txn.status === PaymentStatus.FAILED ? 'FAILED' : 'PENDING',
        ticketRefs: [],
        drawCode: null,
        drawScheduledAt: null,
        drawPrizeDescription: null,
        jackpotAccumulation: null,
      };
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { paymentTxnId: txn.txnId },
      select: { ticketRef: true, drawId: true },
    });
    const draw = tickets.length
      ? await this.prisma.draw.findUnique({ where: { drawId: tickets[0].drawId } })
      : null;

    let jackpotAccumulation: PurchaseStatusResponse['jackpotAccumulation'] = null;
    if (draw?.drawType === DrawType.DAILY_STANDARD) {
      const accum = await this.prisma.jackpotAccumulation.findUnique({
        where: { buyerPhone: txn.buyerPhone },
      });
      if (accum) {
        const cum = accum.cumulativeCount;
        const qty = txn.ticketCount;
        jackpotAccumulation = {
          cumulativeCount: cum,
          ticketsToNextEntry: 10 - (cum % 10 === 0 ? 10 : cum % 10),
          newJackpotEntries: Math.floor(cum / 10) - Math.floor((cum - qty) / 10),
        };
      }
    }

    return {
      ...base,
      status: 'CONFIRMED',
      ticketRefs: tickets.map((t) => t.ticketRef),
      drawCode: draw?.drawCode ?? null,
      drawScheduledAt: draw?.scheduledAt.toISOString() ?? null,
      drawPrizeDescription: draw?.prizeDescription ?? null,
      jackpotAccumulation,
    };
  }
}
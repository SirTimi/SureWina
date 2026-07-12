import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrawType, PaymentGateway, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PurchaseConfirmationService } from './purchase-confirmation.service';
import { NotificationQueueService } from '../queue/notification-queue.service';

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
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly purchaseConfirmation: PurchaseConfirmationService,
    private readonly notificationQueue: NotificationQueueService,
  ) {}

  async getStatus(reference: string): Promise<PurchaseStatusResponse> {
    let txn = await this.prisma.paymentTransaction.findUnique({
      where: { gatewayReference: reference },
    });
    if (!txn) throw new NotFoundException('Purchase not found');

    // Verify-on-return: for a still-PENDING Paystack txn, ask Paystack
    // directly. If it succeeded, confirm through the SAME service the
    // webhook uses — identical idempotency; a later webhook no-ops.
    if (txn.status === PaymentStatus.PENDING && txn.gateway === PaymentGateway.PAYSTACK) {
      const verified = await this.verifyWithPaystack(reference);
      if (verified) {
        const confirmed = await this.purchaseConfirmation.confirmAndCreateTickets({
          reference,
          drawCode: verified.drawCode,
          stateOfPlayCode: verified.stateOfPlayCode,
          rawEvent: verified.raw,
        });
        if (confirmed) {
          await this.notificationQueue.enqueueTicketConfirmationSms({
            txnId: confirmed.txnId,
            buyerPhone: confirmed.buyerPhone,
            drawCode: confirmed.drawCode,
            ticketRefs: confirmed.ticketRefs,
            amountNgn: confirmed.amountNgn,
          });
        }
        txn = await this.prisma.paymentTransaction.findUniqueOrThrow({
          where: { gatewayReference: reference },
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

  private async verifyWithPaystack(reference: string): Promise<{
    drawCode?: string;
    stateOfPlayCode?: string;
    raw: unknown;
  } | null> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secretKey) return null;
    const baseUrl = this.config.getOrThrow<string>('PAYSTACK_BASE_URL');

    try {
      const res = await fetch(
        `${baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${secretKey}` } },
      );
      const payload = (await res.json().catch(() => null)) as {
        status?: boolean;
        data?: { status?: string; metadata?: Record<string, unknown> };
      } | null;

      if (!res.ok || !payload?.status || payload.data?.status !== 'success') {
        return null;
      }
      return {
        drawCode: payload.data.metadata?.drawCode as string | undefined,
        stateOfPlayCode: payload.data.metadata?.stateOfPlayCode as string | undefined,
        raw: payload,
      };
    } catch (error) {
      this.logger.warn(
        `Paystack verify failed for ${reference}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }
}
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentStatus,
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  DrawType,
  PaymentGateway,
  PaymentStatus,
  PurchaseChannel,
  TicketType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JackpotAccumulationService } from '../payments/jackpot-accumulation.service';
import type { JackpotOfferUnlockResult } from '@surewina/types';
import { NotificationQueueService } from '../queue/notification-queue.service';
import { generateTicketRef } from '../payments/ticket-ref.util';
import { CustomerAdminService } from '../admin-ops/customer-admin.service';
import { SellTicketsDto } from './dto/sell-tickets.dto';
import { AccountService } from '../account/account.service'
import { drawDisplayName, drawShortCode } from '../common/draw-naming.util';
import { AgentAccountingService } from './agent-accounting.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class AgentSalesService {
  private readonly logger = new Logger(AgentSalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jackpotAccumulation: JackpotAccumulationService,
    private readonly notificationQueue: NotificationQueueService,
    private readonly customerAdmin: CustomerAdminService,
    private readonly account: AccountService,
    private readonly agentAccounting: AgentAccountingService,
    private readonly wallets: WalletService,
  ) {}

  async sell(agentId: string, dto: SellTicketsDto) {
    const agent = await this.prisma.agent.findUnique({ where: { agentId } });
    if (!agent || agent.status !== AgentStatus.ACTIVE) {
      throw new ForbiddenException('Agent account is not active');
    }

    // Blocked customers can't buy through agents either. Anonymous sales
    // can't be phone-checked — that's inherent to cash-with-no-phone.
    if (dto.customerPhone) {
      await this.customerAdmin.assertNotBlocked(dto.customerPhone);
    }

    const draw = await this.prisma.draw.findUnique({
      where: { drawCode: dto.drawCode },
    });
    if (!draw) throw new NotFoundException('Draw not found');
    if (draw.status !== DrawStatus.ACTIVE || draw.cutoffAt.getTime() <= Date.now()) {
      throw new ConflictException('Draw is not open for ticket sales');
    }

    const amountNgn = draw.ticketPriceNgn * dto.quantity;
    const commissionNgn = Math.floor(
      amountNgn * Number(agent.commissionRate),
    );
    const walletChargeNgn = amountNgn - commissionNgn;

    if (walletChargeNgn <= 0) {
      throw new ConflictException(
        'Agent commission configuration leaves no payable ticket amount',
      );
    }

    const wallet = await this.wallets.ensureAgentWallet(agentId);

    if (dto.customerPhone) {
      await this.account.assertPurchaseAllowed(dto.customerPhone, amountNgn);
    }
    // Cash sales attribute to the customer's phone when given; otherwise to
    // the agent's own phone as custodian-of-record for the anonymous buyer.
    const buyerPhone = dto.customerPhone ?? agent.phoneNumber;
    const reference = `SW-AGT-${randomUUID()}`;

    const ticketType =
      draw.drawType === DrawType.SATURDAY_JACKPOT
        ? TicketType.JACKPOT
        : TicketType.STANDARD;

    // ONE atomic write: cash was handed over, so the transaction is born
    // CONFIRMED and the tickets exist immediately. No webhook, no PENDING.
    const { txn, ticketRefs, offerUnlock } = await this.prisma.$transaction(async (tx) => {
      const txn = await tx.paymentTransaction.create({
        data: {
          gatewayReference: reference,
          gateway: PaymentGateway.AGENT_CASH,
          amountNgn,
          buyerPhone,
          channel: PurchaseChannel.AGENT,
          agentId,
          ticketCount: dto.quantity,
          status: PaymentStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
      });

      await this.agentAccounting.recordSaleInTransaction(
        tx,
        {
          paymentTxnId: txn.txnId,
          agentId,
          walletId: wallet.walletId,
          amountNgn,
          commissionNgn,
          reference,
          occurredAt: txn.confirmedAt ?? txn.createdAt,
        },
      );

      const ticketsData = Array.from({ length: dto.quantity }, () => ({
        ticketRef: generateTicketRef(),
        drawId: draw.drawId,
        ticketType,
        faceValueNgn: draw.ticketPriceNgn,
        buyerPhone,
        agentId,
        purchaseChannel: PurchaseChannel.AGENT,
        stateOfPlayCode: dto.stateOfPlayCode,
        paymentTxnId: txn.txnId,
      }));
      await tx.ticket.createMany({ data: ticketsData });

      // Accumulation only for identified customers on daily draws. A sale
      // with no phone number cannot accrue to anyone, so the buyer earns
      // nothing toward the jackpot.
      //
      // Returned out of the transaction rather than assigned to an outer
      // variable: the notification must wait for the commit, and a value
      // assigned inside this callback gets narrowed away by the compiler.
      let offerUnlockInTx: JackpotOfferUnlockResult | null = null;
      if (dto.customerPhone && draw.drawType === DrawType.DAILY_STANDARD) {
        offerUnlockInTx = await this.jackpotAccumulation.recordDailyPurchase(tx, {
          buyerPhone: dto.customerPhone,
          buyerUserId: null,
          ticketCount: dto.quantity,
          sourcePaymentTxnId: txn.txnId,
        });
      }

      return {
        txn,
        ticketRefs: ticketsData.map((t) => t.ticketRef),
        offerUnlock: offerUnlockInTx,
      };
    });

    // The offer is already committed with the sale; notify only for offers
    // actually created by THIS agent transaction, not from selected quantity.
    if (dto.customerPhone && offerUnlock?.offersUnlocked) {
      const newOffers = await this.prisma.jackpotDiscountOffer.findMany({
        where: {
          unlockedByPaymentTxnId: txn.txnId,
          buyerPhone: dto.customerPhone,
        },
        select: {
          offerId: true,
          buyerPhone: true,
          offerPriceNgn: true,
          originalPriceNgn: true,
          expiresAt: true,
          jackpotDraw: { select: { scheduledAt: true } },
        },
        orderBy: { thresholdNumber: 'asc' },
      });

      for (const offer of newOffers) {
        await this.notificationQueue.enqueueJackpotOfferSms({
          offerId: offer.offerId,
          buyerPhone: offer.buyerPhone,
          offerPriceNgn: offer.offerPriceNgn,
          normalPriceNgn: offer.originalPriceNgn,
          jackpotScheduledAt: offer.jackpotDraw.scheduledAt.toISOString(),
          expiresAt: offer.expiresAt.toISOString(),
        });
      }
    }

    // Post-commit: SMS only when we have a real customer phone.
    if (dto.customerPhone) {
      await this.notificationQueue.enqueueTicketConfirmationSms({
        txnId: txn.txnId,
        buyerPhone: dto.customerPhone,
        drawCode: draw.drawCode,
        drawScheduledAt: draw.scheduledAt.toISOString(),
        ticketRefs,
        amountNgn,
      });
    }

    await this.audit.write({
      severity: AuditSeverity.INFO,
      actor: { type: AuditActorType.AGENT, id: agentId },
      action: 'AGENT_SALE_RECORDED',
      resource: { type: 'PaymentTransaction', id: txn.txnId },
      metadata: {
        drawCode: draw.drawCode,
        quantity: dto.quantity,
        amountNgn,
        commissionNgn,
        walletChargeNgn,
        customerPhoneProvided: !!dto.customerPhone,
        jackpotOffersUnlocked: offerUnlock?.offersUnlocked ?? 0,
      },
    });

    this.logger.log(
      `Agent sale: ${agent.agentCode} sold ${dto.quantity} for ${draw.drawCode} (${amountNgn} NGN cash)`,
    );

    // Everything the 60-second flow's confirmation screen needs.
    return {
      saleReference: reference,
      drawCode: draw.drawCode,
      quantity: dto.quantity,
      amountNgn,
      commissionNgn,
      walletChargeNgn,
      ticketRefs,
      customerNotified: !!dto.customerPhone,
      soldAt: txn.confirmedAt!.toISOString(),
      // Canonical server-computed promotion result. Consumers must use this
      // rather than deriving weekly eligibility from this sale's quantity.
      jackpotOfferUnlock: offerUnlock,
    };
  }

  // Everything a printed ticket needs, in one call. Also the reprint path —
  // query params can't serve a receipt an hour after the sale.
  async saleForPrint(agentId: string, reference: string) {
    const txn = await this.prisma.paymentTransaction.findFirst({
      where: { gatewayReference: reference, agentId },
      include: {
        tickets: {
          select: {
            ticketRef: true,
            faceValueNgn: true,
            draw: {
              select: {
                drawNumber: true,
                drawType: true,
                scheduledAt: true,
                cutoffAt: true,
                ticketPriceNgn: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        agent: { select: { terminalNumber: true, agentCode: true } },
      },
    });
    if (!txn) throw new NotFoundException('Sale not found');

    const draw = await this.prisma.draw.findFirst({
      where: { tickets: { some: { paymentTxnId: txn.txnId } } },
      select: {
        drawNumber: true,
        drawType: true,
        scheduledAt: true,
        cutoffAt: true,
        ticketPriceNgn: true,
      },
    });
    if (!draw) throw new NotFoundException('Draw not found for this sale');

    return {
      saleReference: reference,
      terminal: txn.agent?.terminalNumber
        ? String(txn.agent.terminalNumber).padStart(6, '0')
        : 'ONLINE',
      drawNumber: String(draw.drawNumber).padStart(4, '0'),
      drawType: draw.drawType,
      drawName: drawDisplayName(draw.drawType, draw.scheduledAt),
      drawShortCode: drawShortCode(draw.drawType, draw.scheduledAt),
      scheduledAt: draw.scheduledAt.toISOString(),
      cutoffAt: draw.cutoffAt.toISOString(),
      soldAt: (txn.confirmedAt ?? txn.createdAt).toISOString(),
      ticketPriceNgn: draw.ticketPriceNgn,
      amountNgn: txn.amountNgn,
      tickets: txn.tickets.map((t) => t.ticketRef),
    };
  }
}
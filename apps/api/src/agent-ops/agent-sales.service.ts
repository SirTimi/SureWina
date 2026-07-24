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
import { NotificationQueueService } from '../queue/notification-queue.service';
import { generateTicketRef } from '../payments/ticket-ref.util';
import { CustomerAdminService } from '../admin-ops/customer-admin.service';
import { SellTicketsDto } from './dto/sell-tickets.dto';
import { AccountService } from '../account/account.service'
@Injectable()
export class AgentSalesService {
  private readonly logger = new Logger(AgentSalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jackpotAccumulation: JackpotAccumulationService,
    private readonly notificationQueue: NotificationQueueService,
    private readonly customerAdmin: CustomerAdminService,
    private readonly account: AccountService
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
    const { txn, ticketRefs } = await this.prisma.$transaction(async (tx) => {
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

      // Accumulation only for identified customers on daily draws.
      if (dto.customerPhone && draw.drawType === DrawType.DAILY_STANDARD) {
        await this.jackpotAccumulation.recordDailyPurchase(tx, {
          buyerPhone: dto.customerPhone,
          buyerUserId: null,
          ticketCount: dto.quantity,
        });
      }

      return { txn, ticketRefs: ticketsData.map((t) => t.ticketRef) };
    });

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
        customerPhoneProvided: !!dto.customerPhone,
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
      ticketRefs,
      customerNotified: !!dto.customerPhone,
      soldAt: txn.confirmedAt!.toISOString(),
    };
  }
}
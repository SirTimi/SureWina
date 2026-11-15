import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AgentStatus,
  AuditActorType,
  AuditSeverity,
  CbaTransferPurpose,
  CbaTransferStatus,
  Draw,
  Prisma,
  DrawStatus,
  DrawType,
  PaymentGateway,
  PaymentStatus,
  PaymentTransaction,
  PurchaseChannel,
  TicketType,
  WitmangoWalletPurpose,
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
import { WitmangoWalletLinkService } from '../integrations/witmango/witmango-wallet-link.service';
import { WitmangoTransferService } from '../integrations/witmango/witmango-transfer.service';

// Where an agent sale was paid from. LEDGER: SureWina's agent wallet, net
// of commission. CBA: the agent's Float, in full, with commission paid
// separately into Earnings.
type SaleFundingSource = 'LEDGER' | 'CBA';

type CommittedSale = {
  txn: PaymentTransaction;
  ticketRefs: string[];
  offerUnlock: JackpotOfferUnlockResult | null;
};

type SaleInput = {
  agentId: string;
  dto: SellTicketsDto;
  draw: Draw;
  amountNgn: number;
  commissionNgn: number;
  walletId: string;
  buyerPhone: string;
  reference: string;
  ticketType: TicketType;
};

// Raised inside the issuing transaction when the draw closed while the
// float payment was being made. The float is returned.
class SalesClosedDuringPaymentError extends ConflictException {
  constructor() {
    super(
      'Ticket sales for this draw closed before the float payment completed. The float has been returned.',
    );
  }
}

function saleReviewMessage(reference: string): string {
  return (
    'The float payment could not be confirmed, so no tickets were issued. ' +
    'Do not hand over tickets or keep the cash for this sale. ' +
    `Support will confirm it. Reference: ${reference}`
  );
}

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
    private readonly cbaLinks: WitmangoWalletLinkService,
    private readonly cbaTransfers: WitmangoTransferService,
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

    const input: SaleInput = {
      agentId,
      dto,
      draw,
      amountNgn,
      commissionNgn,
      walletId: wallet.walletId,
      buyerPhone,
      reference,
      ticketType,
    };

    const fundingSource: SaleFundingSource =
      (await this.usesCba(wallet.walletId)) ? 'CBA' : 'LEDGER';

    let commissionStatus: CbaTransferStatus | null = null;
    let committed: CommittedSale;

    if (fundingSource === 'CBA') {
      const result = await this.commitFromFloat(input);
      committed = result.committed;
      commissionStatus = result.commissionStatus;
    } else {
      committed = await this.commitFromLedger(input);
    }

    const { txn, ticketRefs, offerUnlock } = committed;

    // What came out of the agent's own balance for this sale: net of
    // commission on the ledger, the full ticket value from Float.
    const chargedNgn =
      fundingSource === 'CBA' ? amountNgn : walletChargeNgn;

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
        walletChargeNgn: chargedNgn,
        fundingSource,
        commissionStatus,
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
      walletChargeNgn: chargedNgn,
      fundingSource,
      // CBA only: whether commission reached Earnings. A commission that did
      // not post is owed, not lost — the sale stands either way.
      commissionStatus,
      ticketRefs,
      customerNotified: !!dto.customerPhone,
      soldAt: txn.confirmedAt!.toISOString(),
      // Canonical server-computed promotion result. Consumers must use this
      // rather than deriving weekly eligibility from this sale's quantity.
      jackpotOfferUnlock: offerUnlock,
    };
  }

  // ─── CBA-funded: the agent's Float, in full ─────────────────
  //
  // Float pays the full ticket value into SureWina's sales account. Only
  // then are tickets issued, in a transaction that checks the draw is still
  // open. Commission is paid afterwards, from the sales account into
  // Earnings, as a transfer of its own.
  //
  // The sale and the commission are kept apart on purpose. Once tickets are
  // issued the sale is final; a commission that fails to post is owed to
  // the agent and recorded as such, never a reason to undo the sale.

  private async usesCba(walletId: string): Promise<boolean> {
    if (!this.cbaTransfers.isSpendingEnabled()) {
      return false;
    }

    return (await this.cbaLinks.getState(walletId)) === 'READY';
  }

  private async commitFromFloat(input: SaleInput): Promise<{
    committed: CommittedSale;
    commissionStatus: CbaTransferStatus | null;
  }> {
    const {
      agentId,
      dto,
      amountNgn,
      commissionNgn,
      walletId,
      buyerPhone,
      reference,
    } = input;

    if (commissionNgn < 0 || commissionNgn >= amountNgn) {
      throw new ConflictException(
        'Agent commission must be lower than the gross sale amount',
      );
    }

    const [float, earnings] = await Promise.all([
      this.cbaLinks.getActiveAccount(walletId, WitmangoWalletPurpose.FLOAT),
      this.cbaLinks.getActiveAccount(walletId, WitmangoWalletPurpose.EARNINGS),
    ]);

    const sales = this.cbaTransfers.salesEndpoint();

    let floatNgn: number;

    try {
      floatNgn = await this.cbaTransfers.availableNgn(float);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Float payments are temporarily unavailable. Try again shortly.',
      );
    }

    if (floatNgn < amountNgn) {
      throw new ConflictException('Insufficient wallet balance');
    }

    // Written down before it is sent.
    const saleLeg = await this.cbaTransfers.create({
      purpose: CbaTransferPurpose.AGENT_SALE,
      walletId,
      from: this.cbaTransfers.endpoint(float),
      to: sales,
      amountNgn,
      saleReference: reference,
    });

    const paid = await this.cbaTransfers.execute(saleLeg.transferId);

    if (paid.status === CbaTransferStatus.FAILED) {
      throw new ConflictException(
        'The float payment did not go through. No tickets were issued and no money was taken.',
      );
    }

    if (paid.status !== CbaTransferStatus.POSTED) {
      await this.audit.write({
        severity: AuditSeverity.CRITICAL,
        actor: { type: AuditActorType.AGENT, id: agentId },
        action: 'AGENT_SALE_PAYMENT_UNCERTAIN',
        resource: { type: 'CbaTransfer', id: paid.transferId },
        metadata: { saleReference: reference, amountNgn },
      });

      throw new ServiceUnavailableException(saleReviewMessage(reference));
    }

    let committed: CommittedSale & { commissionLegId: string | null };

    try {
      committed = await this.prisma.$transaction(async (tx) => {
        const lockedDraw = await tx.$queryRaw<Array<{ draw_id: string }>>`
          SELECT draw_id
          FROM draws
          WHERE draw_id = ${input.draw.drawId}
          FOR UPDATE
        `;

        if (lockedDraw.length === 0) {
          throw new NotFoundException('Draw not found');
        }

        const draw = await tx.draw.findUniqueOrThrow({
          where: { drawId: input.draw.drawId },
        });

        if (
          draw.status !== DrawStatus.ACTIVE ||
          draw.cutoffAt.getTime() <= Date.now()
        ) {
          throw new SalesClosedDuringPaymentError();
        }

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

        await tx.cbaTransfer.update({
          where: { transferId: paid.transferId },
          data: { paymentTxnId: txn.txnId },
        });

        const issued = await this.issueTicketsInTransaction(
          tx,
          { ...input, draw },
          txn.txnId,
        );

        const commissionLeg =
          commissionNgn > 0
            ? await this.cbaTransfers.createInTransaction(tx, {
                purpose: CbaTransferPurpose.AGENT_COMMISSION,
                walletId,
                from: sales,
                to: this.cbaTransfers.endpoint(earnings),
                amountNgn: commissionNgn,
                paymentTxnId: txn.txnId,
                saleReference: reference,
              })
            : null;

        return {
          txn,
          ...issued,
          commissionLegId: commissionLeg?.transferId ?? null,
        };
      });
    } catch (error) {
      // The commit may have succeeded with only its answer lost. Look
      // before returning the float.
      const existing = await this.prisma.paymentTransaction.findUnique({
        where: { gatewayReference: reference },
        include: {
          tickets: {
            select: { ticketRef: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (existing) {
        const commissionLeg = await this.prisma.cbaTransfer.findFirst({
          where: {
            paymentTxnId: existing.txnId,
            purpose: CbaTransferPurpose.AGENT_COMMISSION,
          },
        });

        const { tickets, ...txn } = existing;

        committed = {
          txn,
          ticketRefs: tickets.map((t) => t.ticketRef),
          offerUnlock: null,
          commissionLegId: commissionLeg?.transferId ?? null,
        };
      } else {
        this.logger.error(
          `Tickets not issued for paid agent sale ${reference}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );

        let returned = false;

        try {
          returned =
            (await this.cbaTransfers.reverse(paid)).status ===
            CbaTransferStatus.POSTED;
        } catch (reverseError) {
          this.logger.error(
            `Could not return float for ${reference}: ${
              reverseError instanceof Error ? reverseError.message : 'unknown'
            }`,
          );
        }

        await this.audit.write({
          severity: returned ? AuditSeverity.WARNING : AuditSeverity.CRITICAL,
          actor: { type: AuditActorType.AGENT, id: agentId },
          action: returned
            ? 'AGENT_SALE_FLOAT_RETURNED'
            : 'AGENT_SALE_FLOAT_RETURN_FAILED',
          resource: { type: 'CbaTransfer', id: paid.transferId },
          metadata: { saleReference: reference, amountNgn },
        });

        if (!returned) {
          throw new ServiceUnavailableException(saleReviewMessage(reference));
        }

        if (error instanceof SalesClosedDuringPaymentError) {
          throw error;
        }

        throw new ConflictException(
          'The sale could not be completed. No tickets were issued and the float has been returned.',
        );
      }
    }

    // After the sale is final. Nothing here can undo it.
    let commissionStatus: CbaTransferStatus | null = null;

    if (committed.commissionLegId) {
      try {
        commissionStatus = (
          await this.cbaTransfers.execute(committed.commissionLegId)
        ).status;
      } catch (error) {
        commissionStatus = CbaTransferStatus.SENDING;

        this.logger.error(
          `Commission for ${reference} not recorded: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }

      if (commissionStatus !== CbaTransferStatus.POSTED) {
        await this.audit
          .write({
            severity: AuditSeverity.WARNING,
            actor: { type: AuditActorType.AGENT, id: agentId },
            action: 'AGENT_COMMISSION_NOT_POSTED',
            resource: { type: 'CbaTransfer', id: committed.commissionLegId },
            metadata: {
              saleReference: reference,
              commissionNgn,
              status: commissionStatus,
            },
          })
          .catch(() => undefined);
      }
    }

    const { commissionLegId: _commissionLegId, ...sale } = committed;

    return { committed: sale, commissionStatus };
  }

  // ─── Ledger-funded: SureWina's agent wallet ─────────────────

  private async commitFromLedger(input: SaleInput): Promise<CommittedSale> {
    const {
      agentId,
      dto,
      amountNgn,
      commissionNgn,
      buyerPhone,
      reference,
    } = input;
    const wallet = { walletId: input.walletId };

    // ONE atomic write: cash was handed over, so the transaction is born
    // CONFIRMED and the tickets exist immediately. No webhook, no PENDING.
    return this.prisma.$transaction(async (tx) => {
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

      return {
        txn,
        ...(await this.issueTicketsInTransaction(tx, input, txn.txnId)),
      };
    });
  }

  // Tickets for a sale, plus jackpot accumulation. Shared by both funding
  // paths so a ticket is the same thing however it was paid for.
  private async issueTicketsInTransaction(
    tx: Prisma.TransactionClient,
    input: SaleInput,
    paymentTxnId: string,
  ): Promise<Omit<CommittedSale, 'txn'>> {
    const { agentId, dto, draw, buyerPhone, ticketType } = input;

    const ticketsData = Array.from({ length: dto.quantity }, () => ({
      ticketRef: generateTicketRef(),
      drawId: draw.drawId,
      ticketType,
      faceValueNgn: draw.ticketPriceNgn,
      buyerPhone,
      agentId,
      purchaseChannel: PurchaseChannel.AGENT,
      stateOfPlayCode: dto.stateOfPlayCode,
      paymentTxnId,
    }));
    await tx.ticket.createMany({ data: ticketsData });

    // Accumulation only for identified customers on daily draws. A sale
    // with no phone number cannot accrue to anyone, so the buyer earns
    // nothing toward the jackpot.
    //
    // Returned out of the transaction rather than assigned to an outer
    // variable: the notification must wait for the commit, and a value
    // assigned inside this callback gets narrowed away by the compiler.
    let offerUnlock: JackpotOfferUnlockResult | null = null;
    if (dto.customerPhone && draw.drawType === DrawType.DAILY_STANDARD) {
      offerUnlock = await this.jackpotAccumulation.recordDailyPurchase(tx, {
        buyerPhone: dto.customerPhone,
        buyerUserId: null,
        ticketCount: dto.quantity,
        sourcePaymentTxnId: paymentTxnId,
      });
    }

    return {
      ticketRefs: ticketsData.map((t) => t.ticketRef),
      offerUnlock,
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
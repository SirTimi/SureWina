import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  AuditActorType,
  AuditSeverity,
  DrawStatus,
  DrawType,
  LedgerTransactionKind,
  Prisma,
  PurchaseChannel,
  TicketType,
  WalletPurchaseStatus,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AccountService } from '../account/account.service';
import { CustomerAdminService } from '../admin-ops/customer-admin.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationQueueService } from '../queue/notification-queue.service';
import { SYSTEM_LEDGER_ACCOUNT_CODES } from '../ledger/ledger.constants';

import { JackpotAccumulationService } from './jackpot-accumulation.service';
import { generateTicketRef } from './ticket-ref.util';
import { WalletTicketPurchaseDto } from './dto/wallet-ticket-purchase.dto';

@Injectable()
export class WalletTicketPurchaseService {
  private readonly logger = new Logger(WalletTicketPurchaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly account: AccountService,
    private readonly customerAdmin: CustomerAdminService,
    private readonly wallets: WalletService,
    private readonly jackpotAccumulation: JackpotAccumulationService,
    private readonly notifications: NotificationQueueService,
  ) {}

  async purchase(userId: string, dto: WalletTicketPurchaseDto) {
    const stateOfPlayCode = dto.stateOfPlayCode.trim();

    const replay = await this.prisma.walletPurchase.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: {
        draw: true,
        tickets: {
          select: { ticketRef: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (replay) {
      return this.replayResult(userId, dto, replay);
    }

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        phoneNumber: true,
        email: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Customer not found');
    }

    await this.customerAdmin.assertNotBlocked(user.phoneNumber);

    const wallet = await this.wallets.getCustomerWallet(userId);

    try {
      const committed = await this.prisma.$transaction(
        async (tx) => {
          const lockedDraw = await tx.$queryRaw<
            Array<{ draw_id: string }>
          >`
            SELECT draw_id
            FROM draws
            WHERE draw_code = ${dto.drawCode}
            FOR UPDATE
          `;

          if (lockedDraw.length === 0) {
            throw new NotFoundException('Draw not found');
          }

          const draw = await tx.draw.findUniqueOrThrow({
            where: { drawId: lockedDraw[0].draw_id },
          });

          if (draw.status !== DrawStatus.ACTIVE) {
            throw new ConflictException(
              'Draw is not open for ticket sales',
            );
          }

          if (draw.cutoffAt.getTime() <= Date.now()) {
            throw new ConflictException(
              'Ticket sales for this draw have closed',
            );
          }

          const amountNgn = draw.ticketPriceNgn * dto.quantity;

          if (!Number.isSafeInteger(amountNgn) || amountNgn <= 0) {
            throw new ConflictException('Invalid purchase amount');
          }

          await this.account.assertWalletPurchaseAllowedInTransaction(
            tx,
            userId,
            amountNgn,
          );

          const revenueAccount = await tx.ledgerAccount.findUnique({
            where: {
              code: SYSTEM_LEDGER_ACCOUNT_CODES.TICKET_SALES_REVENUE,
            },
          });

          if (!revenueAccount) {
            throw new ConflictException(
              'Ticket sales ledger account is missing',
            );
          }

          const purchase = await tx.walletPurchase.create({
            data: {
              idempotencyKey: dto.idempotencyKey,
              walletId: wallet.walletId,
              buyerUserId: userId,
              buyerPhone: user.phoneNumber,
              drawId: draw.drawId,
              stateOfPlayCode,
              ticketCount: dto.quantity,
              amountNgn,
              status: WalletPurchaseStatus.PENDING,
            },
          });

          const hold = await this.wallets.createHoldInTransaction(
            tx,
            {
              walletId: wallet.walletId,
              amountNgn,
              idempotencyKey:
                `WALLET-PURCHASE-HOLD:${purchase.purchaseId}`,
              referenceType: 'WalletPurchase',
              referenceId: purchase.purchaseId,
              description:
                `Hold for ticket purchase ${purchase.purchaseId}`,
              metadata: {
                purchaseId: purchase.purchaseId,
                drawId: draw.drawId,
                drawCode: draw.drawCode,
                ticketCount: dto.quantity,
              },
            },
          );

          const ticketType =
            draw.drawType === DrawType.SATURDAY_JACKPOT
              ? TicketType.JACKPOT
              : TicketType.STANDARD;

          const tickets = Array.from(
            { length: dto.quantity },
            () => ({
              ticketRef: generateTicketRef(),
              drawId: draw.drawId,
              ticketType,
              faceValueNgn: draw.ticketPriceNgn,
              buyerPhone: user.phoneNumber,
              buyerUserId: userId,
              agentId: null,
              purchaseChannel: PurchaseChannel.DIRECT,
              stateOfPlayCode,
              paymentTxnId: null,
              walletPurchaseId: purchase.purchaseId,
            }),
          );

          await tx.ticket.createMany({
            data: tickets,
          });

          let jackpotMinted = null;

          if (draw.drawType === DrawType.DAILY_STANDARD) {
            jackpotMinted =
              await this.jackpotAccumulation.recordDailyPurchase(
                tx,
                {
                  buyerPhone: user.phoneNumber,
                  buyerUserId: userId,
                  ticketCount: dto.quantity,
                },
              );
          }

          await this.wallets.captureHoldInTransaction(tx, {
            holdId: hold.holdId,
            counterAccountId: revenueAccount.accountId,
            idempotencyKey:
              `WALLET-PURCHASE-CAPTURE:${purchase.purchaseId}`,
            kind: LedgerTransactionKind.PURCHASE,
            description:
              `Ticket purchase ${purchase.purchaseId}`,
            metadata: {
              purchaseId: purchase.purchaseId,
              drawId: draw.drawId,
              drawCode: draw.drawCode,
              ticketCount: dto.quantity,
            },
          });

          const completedAt = new Date();

          await tx.walletPurchase.update({
            where: { purchaseId: purchase.purchaseId },
            data: {
              status: WalletPurchaseStatus.COMPLETED,
              holdId: hold.holdId,
              completedAt,
            },
          });

          return {
            purchaseId: purchase.purchaseId,
            walletId: wallet.walletId,
            drawId: draw.drawId,
            drawCode: draw.drawCode,
            drawType: draw.drawType,
            drawScheduledAt: draw.scheduledAt.toISOString(),
            amountNgn,
            ticketCount: dto.quantity,
            ticketRefs: tickets.map((ticket) => ticket.ticketRef),
            jackpotMinted,
            completedAt: completedAt.toISOString(),
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      await this.audit
        .write({
          severity: AuditSeverity.INFO,
          actor: {
            type: AuditActorType.CUSTOMER,
            id: userId,
          },
          action: 'WALLET_TICKET_PURCHASE_COMPLETED',
          resource: {
            type: 'WalletPurchase',
            id: committed.purchaseId,
          },
          metadata: {
            walletId: committed.walletId,
            drawId: committed.drawId,
            drawCode: committed.drawCode,
            ticketCount: committed.ticketCount,
            amountNgn: committed.amountNgn,
          },
        })
        .catch((error) => {
          this.logger.error(
            `Audit failed for wallet purchase ${committed.purchaseId}: ${
              error instanceof Error ? error.message : 'unknown'
            }`,
          );
        });

      await this.notifications.enqueueTicketConfirmationSms({
        txnId: `wallet-${committed.purchaseId}`,
        buyerPhone: user.phoneNumber,
        drawCode: committed.drawCode,
        drawScheduledAt: committed.drawScheduledAt,
        ticketRefs: committed.ticketRefs,
        amountNgn: committed.amountNgn,
      });

      if (committed.jackpotMinted) {
        await this.notifications.enqueueJackpotEntrySms(
          committed.jackpotMinted,
        );
      }

      return {
        ...committed,
        status: WalletPurchaseStatus.COMPLETED,
        wallet: await this.wallets.getCustomerWallet(userId),
      };
    } catch (error) {
      /*
       * Two simultaneous retries using the same
       * idempotency key may race at the UNIQUE constraint.
       *
       * In that case, return the purchase that won.
       */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing =
          await this.prisma.walletPurchase.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: {
              draw: true,
              tickets: {
                select: { ticketRef: true },
                orderBy: { createdAt: 'asc' },
              },
            },
          });

        if (existing) {
          return this.replayResult(userId, dto, existing);
        }
      }

      throw error;
    }
  }

  async getPurchase(userId: string, purchaseId: string) {
    const purchase = await this.prisma.walletPurchase.findFirst({
      where: {
        purchaseId,
        buyerUserId: userId,
      },
      include: {
        draw: true,
        tickets: {
          select: {
            ticketRef: true,
            status: true,
            isWinner: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        hold: {
          select: {
            holdId: true,
            status: true,
            holdLedgerTxnId: true,
            captureLedgerTxnId: true,
          },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException('Wallet purchase not found');
    }

    return {
      purchaseId: purchase.purchaseId,
      reference: purchase.idempotencyKey,
      drawCode: purchase.draw.drawCode,
      amountNgn: purchase.amountNgn,
      ticketCount: purchase.ticketCount,
      stateOfPlayCode: purchase.stateOfPlayCode,
      status: purchase.status,
      ticketRefs: purchase.tickets.map((ticket) => ticket.ticketRef),
      hold: purchase.hold,
      completedAt:
        purchase.completedAt?.toISOString() ?? null,
      createdAt: purchase.createdAt.toISOString(),
    };
  }

  private replayResult(
    userId: string,
    dto: WalletTicketPurchaseDto,
    purchase: {
      purchaseId: string;
      buyerUserId: string;
      ticketCount: number;
      stateOfPlayCode: string;
      amountNgn: number;
      status: WalletPurchaseStatus;
      completedAt: Date | null;
      draw: {
        drawCode: string;
        drawId: string;
        drawType: DrawType;
        scheduledAt: Date;
      };
      tickets: Array<{ ticketRef: string }>;
    },
  ) {
    if (purchase.buyerUserId !== userId) {
      throw new ConflictException(
        'Idempotency key belongs to another purchase',
      );
    }

    if (
      purchase.draw.drawCode !== dto.drawCode ||
      purchase.ticketCount !== dto.quantity ||
      purchase.stateOfPlayCode !== dto.stateOfPlayCode.trim()
    ) {
      throw new ConflictException(
        'Idempotency key was reused with different purchase details',
      );
    }

    return {
      purchaseId: purchase.purchaseId,
      drawId: purchase.draw.drawId,
      drawCode: purchase.draw.drawCode,
      drawType: purchase.draw.drawType,
      drawScheduledAt:
        purchase.draw.scheduledAt.toISOString(),
      amountNgn: purchase.amountNgn,
      ticketCount: purchase.ticketCount,
      ticketRefs: purchase.tickets.map(
        (ticket) => ticket.ticketRef,
      ),
      status: purchase.status,
      completedAt:
        purchase.completedAt?.toISOString() ?? null,
      replayed: true,
    };
  }
}
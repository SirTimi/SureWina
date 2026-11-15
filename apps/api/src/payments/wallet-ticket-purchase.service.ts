import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  AuditActorType,
  AuditSeverity,
  CbaTransfer,
  CbaTransferPurpose,
  CbaTransferStatus,
  Draw,
  DrawStatus,
  DrawType,
  LedgerTransactionKind,
  PaymentStatus,
  Prisma,
  PurchaseChannel,
  PurchasePricingContext,
  TicketType,
  WalletPurchaseFundingSource,
  WalletPurchaseStatus,
  WitmangoWalletPurpose,
} from '@prisma/client';

import type { JackpotOfferUnlockResult } from '@surewina/types';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AccountService } from '../account/account.service';
import { CustomerAdminService } from '../admin-ops/customer-admin.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationQueueService } from '../queue/notification-queue.service';
import { SYSTEM_LEDGER_ACCOUNT_CODES } from '../ledger/ledger.constants';
import { WitmangoWalletLinkService } from '../integrations/witmango/witmango-wallet-link.service';
import { WitmangoTransferService } from '../integrations/witmango/witmango-transfer.service';

import { JackpotAccumulationService } from './jackpot-accumulation.service';
import { JackpotOffersService } from './jackpot-offers.service';
import { generateTicketRef } from './ticket-ref.util';
import { WalletTicketPurchaseDto } from './dto/wallet-ticket-purchase.dto';

type Buyer = {
  userId: string;
  phoneNumber: string;
  email: string | null;
};

type PromotionalOffer = Awaited<
  ReturnType<JackpotOffersService['reserveForPurchaseInTransaction']>
>;

type CommittedPurchase = {
  purchaseId: string;
  walletId: string;
  drawId: string;
  drawCode: string;
  drawType: DrawType;
  drawScheduledAt: string;
  amountNgn: number;
  ticketCount: number;
  pricingContext: PurchasePricingContext;
  jackpotDiscountOfferId: string | null;
  ticketRefs: string[];
  jackpotOfferUnlock: JackpotOfferUnlockResult | null;
  completedAt: string;
};

// Why a CBA-funded purchase did not complete. Stable codes: finance
// filters on them.
const PURCHASE_REASON = {
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_UNCERTAIN: 'PAYMENT_UNCERTAIN',
  SALES_CLOSED: 'SALES_CLOSED',
  TICKETS_NOT_ISSUED: 'TICKETS_NOT_ISSUED',
  REFUND_INCOMPLETE: 'REFUND_INCOMPLETE',
} as const;

// A CBA payment holds a wallet for at most this long. Two purchases planned
// against the same balance at once could each pass the balance check; the
// second would then fail at the CBA, half-paid. One at a time avoids that.
// A purchase older than this was abandoned mid-flight and no longer blocks.
const IN_FLIGHT_WINDOW_MS = 10 * 60 * 1000;

// Raised inside the final transaction when the draw closed while the
// payment was being made. The money is returned.
class SalesClosedDuringPaymentError extends ConflictException {
  constructor() {
    super(
      'Ticket sales for this draw closed before your payment completed. Your money has been returned to your wallet.',
    );
  }
}

function reviewMessage(purchaseId: string): string {
  return (
    'We could not confirm your wallet payment, so no tickets were issued. ' +
    'Support will confirm it and either issue your tickets or return your money. ' +
    `Reference: ${purchaseId}`
  );
}

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
    private readonly jackpotOffers: JackpotOffersService,
    private readonly notifications: NotificationQueueService,
    private readonly cbaLinks: WitmangoWalletLinkService,
    private readonly cbaTransfers: WitmangoTransferService,
  ) {}

  async purchase(userId: string, dto: WalletTicketPurchaseDto) {
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
      const committed = (await this.usesCba(wallet.walletId))
        ? await this.purchaseFromCba(user, dto, wallet.walletId)
        : await this.purchaseFromLedger(user, dto, wallet.walletId);

      if ('replayed' in committed) {
        return committed;
      }

      await this.announce(user, committed.purchase, committed.fundingSource);

      return {
        ...committed.purchase,
        status: WalletPurchaseStatus.COMPLETED,
        fundingSource: committed.fundingSource,
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

  // ─── Ledger-funded: SureWina's own wallet ledger ──────────────

  private async purchaseFromLedger(
    user: Buyer,
    dto: WalletTicketPurchaseDto,
    walletId: string,
  ) {
    const userId = user.userId;
    const stateOfPlayCode = dto.stateOfPlayCode.trim();

    const purchase = await this.prisma.$transaction(
      async (tx) => {
        const { promotionalOffer, draw, amountNgn } =
          await this.acceptInTransaction(tx, user, dto);

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

        const pricingContext = promotionalOffer
          ? PurchasePricingContext.PROMOTIONAL_JACKPOT
          : PurchasePricingContext.NORMAL;

        const created = await tx.walletPurchase.create({
          data: {
            idempotencyKey: dto.idempotencyKey,
            walletId,
            buyerUserId: userId,
            buyerPhone: user.phoneNumber,
            drawId: draw.drawId,
            stateOfPlayCode,
            ticketCount: dto.quantity,
            amountNgn,
            pricingContext,
            jackpotDiscountOfferId:
              promotionalOffer?.offerId ?? null,
            status: WalletPurchaseStatus.PENDING,
          },
        });

        const hold = await this.wallets.createHoldInTransaction(
          tx,
          {
            walletId,
            amountNgn,
            idempotencyKey:
              `WALLET-PURCHASE-HOLD:${created.purchaseId}`,
            referenceType: 'WalletPurchase',
            referenceId: created.purchaseId,
            description:
              `Hold for ticket purchase ${created.purchaseId}`,
            metadata: {
              purchaseId: created.purchaseId,
              drawId: draw.drawId,
              drawCode: draw.drawCode,
              ticketCount: dto.quantity,
              pricingContext,
              jackpotDiscountOfferId:
                promotionalOffer?.offerId ?? null,
            },
          },
        );

        const issued = await this.issueTicketsInTransaction(tx, {
          purchaseId: created.purchaseId,
          user,
          draw,
          quantity: dto.quantity,
          stateOfPlayCode,
          promotionalOffer,
        });

        await this.wallets.captureHoldInTransaction(tx, {
          holdId: hold.holdId,
          counterAccountId: revenueAccount.accountId,
          idempotencyKey:
            `WALLET-PURCHASE-CAPTURE:${created.purchaseId}`,
          kind: LedgerTransactionKind.PURCHASE,
          description:
            `Ticket purchase ${created.purchaseId}`,
          metadata: {
            purchaseId: created.purchaseId,
            drawId: draw.drawId,
            drawCode: draw.drawCode,
            ticketCount: dto.quantity,
            pricingContext,
            jackpotDiscountOfferId:
              promotionalOffer?.offerId ?? null,
          },
        });

        const completedAt = new Date();

        await tx.walletPurchase.update({
          where: { purchaseId: created.purchaseId },
          data: {
            status: WalletPurchaseStatus.COMPLETED,
            holdId: hold.holdId,
            completedAt,
          },
        });

        if (promotionalOffer) {
          await this.jackpotOffers.markClaimedInTransaction(
            tx,
            {
              offerId: promotionalOffer.offerId,
              buyerPhone: user.phoneNumber,
              buyerUserId: userId,
              jackpotDrawId: draw.drawId,
              amountNgn,
              claimedAt: completedAt,
            },
          );
        }

        return this.committedResult({
          purchaseId: created.purchaseId,
          walletId,
          draw,
          amountNgn,
          ticketCount: dto.quantity,
          promotionalOffer,
          ticketRefs: issued.ticketRefs,
          jackpotOfferUnlock: issued.jackpotOfferUnlock,
          completedAt,
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return {
      purchase,
      fundingSource: WalletPurchaseFundingSource.LEDGER,
    };
  }

  // ─── CBA-funded: a transfer between Witmango savings accounts ──
  //
  // The money and the tickets live in two systems with no shared
  // transaction, so this runs in three steps, each one safe to stop at:
  //
  //   1. Accept: every rule is checked and the purchase and its transfers
  //      are written down — in one database transaction, before any money
  //      moves.
  //   2. Pay: each transfer is sent to the CBA, once.
  //   3. Issue: the tickets are created, in a second transaction that
  //      checks the draw is still open.
  //
  // If the payment is refused, nothing was taken (or what was taken is
  // sent back). If the tickets cannot be issued, the money is sent back.
  // If the CBA's answer is unknown, nothing more is done: the purchase goes
  // to review with no tickets, and a person establishes what happened.

  private async usesCba(walletId: string): Promise<boolean> {
    if (!this.cbaTransfers.isSpendingEnabled()) {
      return false;
    }

    return (await this.cbaLinks.getState(walletId)) === 'READY';
  }

  private async purchaseFromCba(
    user: Buyer,
    dto: WalletTicketPurchaseDto,
    walletId: string,
  ) {
    const userId = user.userId;
    const stateOfPlayCode = dto.stateOfPlayCode.trim();

    const [deposit, winnings] = await Promise.all([
      this.cbaLinks.getActiveAccount(walletId, WitmangoWalletPurpose.DEPOSIT),
      this.cbaLinks.getActiveAccount(walletId, WitmangoWalletPurpose.WINNINGS),
    ]);

    const sales = this.cbaTransfers.salesEndpoint();

    // Read live, before anything is written. Used only to decide which
    // account pays; the CBA itself refuses a transfer that would overdraw.
    let depositNgn: number;
    let winningsNgn: number;

    try {
      [depositNgn, winningsNgn] = await Promise.all([
        this.cbaTransfers.availableNgn(deposit),
        this.cbaTransfers.availableNgn(winnings),
      ]);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Wallet payments are temporarily unavailable. Please try again shortly or pay by card.',
      );
    }

    // ── 1. Accept ──
    const accepted = await this.prisma.$transaction(
      async (tx) => {
        const { promotionalOffer, draw, amountNgn } =
          await this.acceptInTransaction(tx, user, dto);

        const inFlight = await tx.walletPurchase.count({
          where: {
            walletId,
            fundingSource: WalletPurchaseFundingSource.CBA,
            status: WalletPurchaseStatus.PENDING,
            createdAt: { gte: new Date(Date.now() - IN_FLIGHT_WINDOW_MS) },
          },
        });

        if (inFlight > 0) {
          throw new ConflictException(
            'Another wallet payment is still in progress. Try again in a moment.',
          );
        }

        // Deposit is spent first. Winnings are the only withdrawable
        // money, so they are kept for last.
        const fromDeposit = Math.min(depositNgn, amountNgn);
        const fromWinnings = amountNgn - fromDeposit;

        if (fromWinnings > winningsNgn) {
          throw new ConflictException('Insufficient wallet balance');
        }

        const created = await tx.walletPurchase.create({
          data: {
            idempotencyKey: dto.idempotencyKey,
            walletId,
            buyerUserId: userId,
            buyerPhone: user.phoneNumber,
            drawId: draw.drawId,
            stateOfPlayCode,
            ticketCount: dto.quantity,
            amountNgn,
            pricingContext: promotionalOffer
              ? PurchasePricingContext.PROMOTIONAL_JACKPOT
              : PurchasePricingContext.NORMAL,
            jackpotDiscountOfferId:
              promotionalOffer?.offerId ?? null,
            status: WalletPurchaseStatus.PENDING,
            fundingSource: WalletPurchaseFundingSource.CBA,
          },
        });

        const legIds: string[] = [];

        for (const [account, legNgn] of [
          [deposit, fromDeposit],
          [winnings, fromWinnings],
        ] as const) {
          if (legNgn <= 0) {
            continue;
          }

          const leg = await this.cbaTransfers.createInTransaction(tx, {
            purpose: CbaTransferPurpose.WALLET_PURCHASE,
            walletId,
            from: this.cbaTransfers.endpoint(account),
            to: sales,
            amountNgn: legNgn,
            walletPurchaseId: created.purchaseId,
          });

          legIds.push(leg.transferId);
        }

        return {
          purchaseId: created.purchaseId,
          drawId: draw.drawId,
          offerId: promotionalOffer?.offerId ?? null,
          amountNgn,
          legIds,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    // ── 2. Pay ──
    const posted: CbaTransfer[] = [];

    for (const legId of accepted.legIds) {
      const leg = await this.cbaTransfers.execute(legId);

      if (leg.status === CbaTransferStatus.POSTED) {
        posted.push(leg);
        continue;
      }

      if (leg.status === CbaTransferStatus.FAILED) {
        // A definite refusal. Anything already taken goes back.
        return this.unwind(
          user,
          accepted.purchaseId,
          posted,
          PURCHASE_REASON.PAYMENT_FAILED,
          new ConflictException(
            'Your wallet payment did not go through. No money was taken from your wallet.',
          ),
        );
      }

      // Unknown. Stop here: nothing further is sent, nothing is returned
      // on a guess, and no ticket is issued.
      await this.markForReview(
        user,
        accepted.purchaseId,
        PURCHASE_REASON.PAYMENT_UNCERTAIN,
      );

      throw new ServiceUnavailableException(
        reviewMessage(accepted.purchaseId),
      );
    }

    // ── 3. Issue ──
    try {
      const purchase = await this.prisma.$transaction(
        async (tx) => {
          const lockedDraw = await tx.$queryRaw<Array<{ draw_id: string }>>`
            SELECT draw_id
            FROM draws
            WHERE draw_id = ${accepted.drawId}
            FOR UPDATE
          `;

          if (lockedDraw.length === 0) {
            throw new NotFoundException('Draw not found');
          }

          const draw = await tx.draw.findUniqueOrThrow({
            where: { drawId: lockedDraw[0].draw_id },
          });

          // The same rule the purchase was accepted under. If the draw
          // closed while the CBA was answering, these tickets would miss it.
          if (
            draw.status !== DrawStatus.ACTIVE ||
            draw.cutoffAt.getTime() <= Date.now()
          ) {
            throw new SalesClosedDuringPaymentError();
          }

          const completedAt = new Date();

          const claimed = await tx.walletPurchase.updateMany({
            where: {
              purchaseId: accepted.purchaseId,
              status: WalletPurchaseStatus.PENDING,
            },
            data: {
              status: WalletPurchaseStatus.COMPLETED,
              completedAt,
            },
          });

          if (claimed.count !== 1) {
            throw new ConflictException(
              'Wallet purchase is no longer pending',
            );
          }

          const offer = accepted.offerId
            ? await tx.jackpotDiscountOffer.findUniqueOrThrow({
                where: { offerId: accepted.offerId },
              })
            : null;

          const promotionalOffer = offer
            ? { offerId: offer.offerId, offerPriceNgn: offer.offerPriceNgn }
            : null;

          const issued = await this.issueTicketsInTransaction(tx, {
            purchaseId: accepted.purchaseId,
            user,
            draw,
            quantity: dto.quantity,
            stateOfPlayCode,
            promotionalOffer,
          });

          if (promotionalOffer) {
            await this.jackpotOffers.markClaimedInTransaction(
              tx,
              {
                offerId: promotionalOffer.offerId,
                buyerPhone: user.phoneNumber,
                buyerUserId: userId,
                jackpotDrawId: draw.drawId,
                amountNgn: accepted.amountNgn,
                claimedAt: completedAt,
              },
            );
          }

          return this.committedResult({
            purchaseId: accepted.purchaseId,
            walletId,
            draw,
            amountNgn: accepted.amountNgn,
            ticketCount: dto.quantity,
            promotionalOffer,
            ticketRefs: issued.ticketRefs,
            jackpotOfferUnlock: issued.jackpotOfferUnlock,
            completedAt,
          });
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      return {
        purchase,
        fundingSource: WalletPurchaseFundingSource.CBA,
      };
    } catch (error) {
      // The commit may have succeeded with only its answer lost. Look
      // before sending any money back.
      const current = await this.prisma.walletPurchase.findUnique({
        where: { purchaseId: accepted.purchaseId },
        include: {
          draw: true,
          tickets: {
            select: { ticketRef: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (current?.status === WalletPurchaseStatus.COMPLETED) {
        return this.replayResult(userId, dto, current);
      }

      this.logger.error(
        `Tickets not issued for paid wallet purchase ${accepted.purchaseId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );

      const closed = error instanceof SalesClosedDuringPaymentError;

      return this.unwind(
        user,
        accepted.purchaseId,
        posted,
        closed
          ? PURCHASE_REASON.SALES_CLOSED
          : PURCHASE_REASON.TICKETS_NOT_ISSUED,
        closed
          ? error
          : new ConflictException(
              'Your tickets could not be issued. Your money has been returned to your wallet.',
            ),
      );
    }
  }

  // Sends back everything already taken for a purchase that will not
  // complete, then closes it. Always throws: there is no purchase to return.
  //
  // FAILED only if every return posted. If any did not, the purchase goes
  // to review — the customer's money is somewhere a person must find.
  private async unwind(
    user: Buyer,
    purchaseId: string,
    posted: CbaTransfer[],
    reason: string,
    toThrow: Error,
  ): Promise<never> {
    let returned = true;

    for (const leg of posted) {
      let reversal: CbaTransfer | null = null;

      try {
        reversal = await this.cbaTransfers.reverse(leg);
      } catch (error) {
        this.logger.error(
          `Could not return transfer ${leg.reference}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }

      if (reversal?.status !== CbaTransferStatus.POSTED) {
        returned = false;
      }
    }

    if (!returned) {
      await this.markForReview(
        user,
        purchaseId,
        PURCHASE_REASON.REFUND_INCOMPLETE,
      );

      throw new ServiceUnavailableException(reviewMessage(purchaseId));
    }

    await this.prisma.walletPurchase.updateMany({
      where: { purchaseId, status: WalletPurchaseStatus.PENDING },
      data: {
        status: WalletPurchaseStatus.FAILED,
        failureReason: reason,
      },
    });

    await this.writeAudit(user.userId, {
      severity: AuditSeverity.WARNING,
      action: 'WALLET_TICKET_PURCHASE_FAILED',
      purchaseId,
      metadata: {
        reason,
        fundingSource: WalletPurchaseFundingSource.CBA,
        transfersReturned: posted.length,
      },
    });

    throw toThrow;
  }

  private async markForReview(
    user: Buyer,
    purchaseId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.walletPurchase.updateMany({
      where: { purchaseId, status: WalletPurchaseStatus.PENDING },
      data: {
        status: WalletPurchaseStatus.REVIEW_REQUIRED,
        failureReason: reason,
      },
    });

    await this.writeAudit(user.userId, {
      severity: AuditSeverity.CRITICAL,
      action: 'WALLET_TICKET_PURCHASE_REVIEW_REQUIRED',
      purchaseId,
      metadata: {
        reason,
        fundingSource: WalletPurchaseFundingSource.CBA,
      },
    });
  }

  // ─── Shared by both paths ──────────────────────────────────

  // Every rule a purchase must pass before money is touched: the offer,
  // the draw (locked), the price, and the customer's spending limits.
  private async acceptInTransaction(
    tx: Prisma.TransactionClient,
    user: Buyer,
    dto: WalletTicketPurchaseDto,
  ): Promise<{
    promotionalOffer: PromotionalOffer | null;
    draw: Draw;
    amountNgn: number;
  }> {
    const userId = user.userId;

    const promotionalOffer =
      dto.jackpotDiscountOfferId
        ? await this.jackpotOffers.reserveForPurchaseInTransaction(
            tx,
            {
              sub: userId,
              phoneNumber: user.phoneNumber,
              type: 'customer',
            },
            dto.jackpotDiscountOfferId,
          )
        : null;

    if (promotionalOffer && dto.quantity !== 1) {
      throw new ConflictException(
        'Promotional jackpot purchases must contain exactly one ticket',
      );
    }

    if (promotionalOffer) {
      const activeProviderPayment =
        await tx.paymentTransaction.findFirst({
          where: {
            jackpotDiscountOfferId:
              promotionalOffer.offerId,
            status: {
              in: [
                PaymentStatus.PENDING,
                PaymentStatus.CONFIRMED,
                PaymentStatus.REVIEW_REQUIRED,
                PaymentStatus.REFUND_PENDING,
              ],
            },
          },
          select: {
            txnId: true,
            status: true,
          },
        });

      if (activeProviderPayment) {
        throw new ConflictException(
          'Jackpot offer already has an active Paystack purchase attempt',
        );
      }
    }

    const lockedDraw = promotionalOffer
      ? await tx.$queryRaw<Array<{ draw_id: string }>>`
          SELECT draw_id
          FROM draws
          WHERE draw_id = ${promotionalOffer.jackpotDrawId}
          FOR UPDATE
        `
      : await tx.$queryRaw<Array<{ draw_id: string }>>`
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

    if (
      promotionalOffer &&
      draw.drawCode !== promotionalOffer.jackpotDraw.drawCode
    ) {
      throw new ConflictException(
        'Promotional jackpot offer draw mismatch',
      );
    }

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

    const amountNgn = promotionalOffer
      ? promotionalOffer.offerPriceNgn
      : draw.ticketPriceNgn * dto.quantity;

    if (!Number.isSafeInteger(amountNgn) || amountNgn <= 0) {
      throw new ConflictException('Invalid purchase amount');
    }

    await this.account.assertWalletPurchaseAllowedInTransaction(
      tx,
      userId,
      amountNgn,
    );

    return { promotionalOffer, draw, amountNgn };
  }

  private async issueTicketsInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      purchaseId: string;
      user: Buyer;
      draw: Draw;
      quantity: number;
      stateOfPlayCode: string;
      promotionalOffer: { offerId: string; offerPriceNgn: number } | null;
    },
  ) {
    const { draw, promotionalOffer, user } = input;

    const ticketType =
      draw.drawType === DrawType.SATURDAY_JACKPOT
        ? TicketType.JACKPOT
        : TicketType.STANDARD;

    const tickets = Array.from(
      { length: input.quantity },
      () => ({
        ticketRef: generateTicketRef(),
        drawId: draw.drawId,
        ticketType,
        faceValueNgn: promotionalOffer
          ? promotionalOffer.offerPriceNgn
          : draw.ticketPriceNgn,
        buyerPhone: user.phoneNumber,
        buyerUserId: user.userId,
        agentId: null,
        purchaseChannel: PurchaseChannel.DIRECT,
        stateOfPlayCode: input.stateOfPlayCode,
        paymentTxnId: null,
        walletPurchaseId: input.purchaseId,
        jackpotDiscountOfferId:
          promotionalOffer?.offerId ?? null,
      }),
    );

    await tx.ticket.createMany({
      data: tickets,
    });

    let jackpotOfferUnlock: JackpotOfferUnlockResult | null = null;

    if (draw.drawType === DrawType.DAILY_STANDARD) {
      jackpotOfferUnlock =
        await this.jackpotAccumulation.recordDailyPurchase(
          tx,
          {
            buyerPhone: user.phoneNumber,
            buyerUserId: user.userId,
            ticketCount: input.quantity,
            sourceWalletPurchaseId: input.purchaseId,
          },
        );
    }

    return {
      ticketRefs: tickets.map((ticket) => ticket.ticketRef),
      jackpotOfferUnlock,
    };
  }

  private committedResult(input: {
    purchaseId: string;
    walletId: string;
    draw: Draw;
    amountNgn: number;
    ticketCount: number;
    promotionalOffer: { offerId: string } | null;
    ticketRefs: string[];
    jackpotOfferUnlock: JackpotOfferUnlockResult | null;
    completedAt: Date;
  }): CommittedPurchase {
    return {
      purchaseId: input.purchaseId,
      walletId: input.walletId,
      drawId: input.draw.drawId,
      drawCode: input.draw.drawCode,
      drawType: input.draw.drawType,
      drawScheduledAt: input.draw.scheduledAt.toISOString(),
      amountNgn: input.amountNgn,
      ticketCount: input.ticketCount,
      pricingContext: input.promotionalOffer
        ? PurchasePricingContext.PROMOTIONAL_JACKPOT
        : PurchasePricingContext.NORMAL,
      jackpotDiscountOfferId:
        input.promotionalOffer?.offerId ?? null,
      ticketRefs: input.ticketRefs,
      jackpotOfferUnlock: input.jackpotOfferUnlock,
      completedAt: input.completedAt.toISOString(),
    };
  }

  // After the commit: the audit record and the confirmation SMS.
  private async announce(
    user: Buyer,
    committed: CommittedPurchase,
    fundingSource: WalletPurchaseFundingSource,
  ) {
    await this.writeAudit(user.userId, {
      severity: AuditSeverity.INFO,
      action: 'WALLET_TICKET_PURCHASE_COMPLETED',
      purchaseId: committed.purchaseId,
      metadata: {
        walletId: committed.walletId,
        drawId: committed.drawId,
        drawCode: committed.drawCode,
        ticketCount: committed.ticketCount,
        amountNgn: committed.amountNgn,
        pricingContext: committed.pricingContext,
        jackpotDiscountOfferId:
          committed.jackpotDiscountOfferId,
        jackpotOffersUnlocked:
          committed.jackpotOfferUnlock?.offersUnlocked ?? 0,
        fundingSource,
      },
    });

    await this.notifications.enqueueTicketConfirmationSms({
      txnId: `wallet-${committed.purchaseId}`,
      buyerPhone: user.phoneNumber,
      drawCode: committed.drawCode,
      drawScheduledAt: committed.drawScheduledAt,
      ticketRefs: committed.ticketRefs,
      amountNgn: committed.amountNgn,
    });
  }

  // Audit failures are logged, never allowed to undo a purchase.
  private async writeAudit(
    userId: string,
    entry: {
      severity: AuditSeverity;
      action: string;
      purchaseId: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await this.audit
      .write({
        severity: entry.severity,
        actor: {
          type: AuditActorType.CUSTOMER,
          id: userId,
        },
        action: entry.action,
        resource: {
          type: 'WalletPurchase',
          id: entry.purchaseId,
        },
        metadata: entry.metadata,
      })
      .catch((error) => {
        this.logger.error(
          `Audit failed for wallet purchase ${entry.purchaseId}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      });
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
      pricingContext: purchase.pricingContext,
      jackpotDiscountOfferId:
        purchase.jackpotDiscountOfferId,
      stateOfPlayCode: purchase.stateOfPlayCode,
      status: purchase.status,
      fundingSource: purchase.fundingSource,
      failureReason: purchase.failureReason,
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
      pricingContext: PurchasePricingContext;
      jackpotDiscountOfferId: string | null;
      status: WalletPurchaseStatus;
      fundingSource?: WalletPurchaseFundingSource;
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
      purchase.stateOfPlayCode !== dto.stateOfPlayCode.trim() ||
      purchase.jackpotDiscountOfferId !==
        (dto.jackpotDiscountOfferId ?? null)
    ) {
      throw new ConflictException(
        'Idempotency key was reused with different purchase details',
      );
    }

    // A CBA-funded purchase can be retried while it is still being paid
    // for, or after it did not complete. Neither has tickets to return.
    if (purchase.fundingSource === WalletPurchaseFundingSource.CBA) {
      if (purchase.status === WalletPurchaseStatus.PENDING) {
        throw new ConflictException(
          'This purchase is still being processed. Check your tickets in a moment.',
        );
      }

      if (purchase.status === WalletPurchaseStatus.FAILED) {
        throw new ConflictException(
          'This wallet payment did not go through. Start a new purchase.',
        );
      }

      if (purchase.status === WalletPurchaseStatus.REVIEW_REQUIRED) {
        throw new ServiceUnavailableException(
          reviewMessage(purchase.purchaseId),
        );
      }
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
      pricingContext: purchase.pricingContext,
      jackpotDiscountOfferId:
        purchase.jackpotDiscountOfferId,
      ticketRefs: purchase.tickets.map(
        (ticket) => ticket.ticketRef,
      ),
      status: purchase.status,
      completedAt:
        purchase.completedAt?.toISOString() ?? null,
      replayed: true as const,
    };
  }
}

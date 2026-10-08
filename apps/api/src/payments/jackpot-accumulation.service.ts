import { Injectable, Logger } from '@nestjs/common';
import {
  DrawStatus,
  DrawType,
  JackpotDiscountOfferStatus,
  Prisma,
} from '@prisma/client';
import type { JackpotOfferUnlockResult } from '@surewina/types';

export const TICKETS_PER_DISCOUNT_OFFER = 10;
const JACKPOT_DISCOUNT_PRICE_NGN = 500;

function ticketsToNextOffer(weeklyTicketCount: number): number {
  const remainder =
    weeklyTicketCount % TICKETS_PER_DISCOUNT_OFFER;

  return remainder === 0
    ? TICKETS_PER_DISCOUNT_OFFER
    : TICKETS_PER_DISCOUNT_OFFER - remainder;
}

// Every 10 DAILY_STANDARD tickets bought by one identified phone number
// inside the active Saturday-jackpot cycle unlock one NGN 500 jackpot offer.
//
// Called inside the caller's purchase transaction so tickets, accumulation
// and promotion entitlements commit or roll back together. Historical
// JackpotEntry rows are intentionally untouched.
@Injectable()
export class JackpotAccumulationService {
  private readonly logger = new Logger(JackpotAccumulationService.name);

  async recordDailyPurchase(
    tx: Prisma.TransactionClient,
    params: {
      buyerPhone: string;
      buyerUserId: string | null;
      ticketCount: number;
      sourcePaymentTxnId?: string;
      sourceWalletPurchaseId?: string;
    },
  ): Promise<JackpotOfferUnlockResult | null> {
    const { buyerPhone, buyerUserId, ticketCount } = params;
    const now = new Date();

    const jackpotDraw = await tx.draw.findFirst({
      where: {
        drawType: DrawType.SATURDAY_JACKPOT,
        status: DrawStatus.ACTIVE,
        cutoffAt: { gt: now },
      },
      orderBy: { scheduledAt: 'asc' },
      select: {
        drawId: true,
        drawCode: true,
        scheduledAt: true,
        cutoffAt: true,
        ticketPriceNgn: true,
      },
    });

    const existing = await tx.jackpotAccumulation.findUnique({
      where: { buyerPhone },
      select: {
        accumId: true,
        cycleDrawId: true,
        cumulativeCount: true,
        jackpotEntriesTotal: true,
      },
    });

    // Without an open jackpot there is no valid promotion cycle. Lifetime
    // ticket reporting still advances, but no weekly progress is banked.
    if (!jackpotDraw) {
      await tx.jackpotAccumulation.upsert({
        where: { buyerPhone },
        create: {
          buyerPhone,
          buyerUserId,
          cumulativeCount: 0,
          jackpotEntriesTotal: 0,
          cycleDrawId: null,
          lifetimeTicketCount: ticketCount,
          lastTicketAt: now,
        },
        update: {
          lifetimeTicketCount: { increment: ticketCount },
          lastTicketAt: now,
          ...(buyerUserId ? { buyerUserId } : {}),
        },
      });

      this.logger.log(
        `${buyerPhone}: ${ticketCount} ticket(s) recorded, no open jackpot promotion cycle`,
      );
      return null;
    }

    const sameCycle = existing?.cycleDrawId === jackpotDraw.drawId;
    const previousCycleCount = sameCycle
      ? existing?.cumulativeCount ?? 0
      : 0;

    const accum = await tx.jackpotAccumulation.upsert({
      where: { buyerPhone },
      create: {
        buyerPhone,
        buyerUserId,
        cumulativeCount: ticketCount,
        jackpotEntriesTotal: 0,
        cycleDrawId: jackpotDraw.drawId,
        lifetimeTicketCount: ticketCount,
        lastTicketAt: now,
      },
      update: sameCycle
        ? {
            cumulativeCount: { increment: ticketCount },
            lifetimeTicketCount: { increment: ticketCount },
            lastTicketAt: now,
            ...(buyerUserId ? { buyerUserId } : {}),
          }
        : {
            cumulativeCount: ticketCount,
            // Historical weekly free-entry counter resets with the cycle but
            // is no longer incremented by new purchases.
            jackpotEntriesTotal: 0,
            cycleDrawId: jackpotDraw.drawId,
            lifetimeTicketCount: { increment: ticketCount },
            lastTicketAt: now,
            ...(buyerUserId ? { buyerUserId } : {}),
          },
    });

    if (!sameCycle && existing && existing.cumulativeCount > 0) {
      this.logger.log(
        `${buyerPhone}: new jackpot cycle — previous weekly progress of ${existing.cumulativeCount} ticket(s) cleared`,
      );
    }

    const previousThreshold = Math.floor(
      previousCycleCount / TICKETS_PER_DISCOUNT_OFFER,
    );
    const currentThreshold = Math.floor(
      accum.cumulativeCount / TICKETS_PER_DISCOUNT_OFFER,
    );

    const thresholdNumbers =
      currentThreshold > previousThreshold
        ? Array.from(
            { length: currentThreshold - previousThreshold },
            (_, index) => previousThreshold + index + 1,
          )
        : [];

    let offersUnlocked = 0;
    let latestOffer: JackpotOfferUnlockResult['latestOffer'] = null;

    if (thresholdNumbers.length > 0) {
      const created = await tx.jackpotDiscountOffer.createMany({
        data: thresholdNumbers.map((thresholdNumber) => ({
          buyerPhone,
          buyerUserId,
          jackpotDrawId: jackpotDraw.drawId,
          unlockedByPaymentTxnId:
            params.sourcePaymentTxnId ?? null,
          unlockedByWalletPurchaseId:
            params.sourceWalletPurchaseId ?? null,
          thresholdNumber,
          regularTicketsAtUnlock:
            thresholdNumber * TICKETS_PER_DISCOUNT_OFFER,
          originalPriceNgn: jackpotDraw.ticketPriceNgn,
          offerPriceNgn: JACKPOT_DISCOUNT_PRICE_NGN,
          status: JackpotDiscountOfferStatus.AVAILABLE,
          issuedAt: now,
          expiresAt: jackpotDraw.cutoffAt,
        })),
        skipDuplicates: true,
      });

      offersUnlocked = created.count;

      if (offersUnlocked > 0) {
        const storedLatestOffer =
          await tx.jackpotDiscountOffer.findFirst({
            where: {
              buyerPhone,
              jackpotDrawId: jackpotDraw.drawId,
              thresholdNumber: { in: thresholdNumbers },
              issuedAt: now,
            },
            orderBy: { thresholdNumber: 'desc' },
            select: {
              offerId: true,
              jackpotDrawId: true,
              thresholdNumber: true,
              regularTicketsAtUnlock: true,
              originalPriceNgn: true,
              offerPriceNgn: true,
              status: true,
              issuedAt: true,
              expiresAt: true,
            },
          });

        if (!storedLatestOffer) {
          throw new Error(
            'Jackpot discount offer was created but could not be reloaded',
          );
        }

        latestOffer = {
          ...storedLatestOffer,
          issuedAt: storedLatestOffer.issuedAt.toISOString(),
          expiresAt: storedLatestOffer.expiresAt.toISOString(),
        };
      }
    }

    const toNext = ticketsToNextOffer(accum.cumulativeCount);

    if (offersUnlocked > 0) {
      this.logger.log(
        `${buyerPhone}: unlocked ${offersUnlocked} discounted jackpot offer${
          offersUnlocked === 1 ? '' : 's'
        } for ${jackpotDraw.drawCode}`,
      );
    } else {
      this.logger.log(
        `${buyerPhone}: ${accum.cumulativeCount} regular ticket(s) this week, ${toNext} more for the next discounted jackpot offer`,
      );
    }

    return {
      accumId: accum.accumId,
      buyerPhone,
      offersUnlocked,
      latestOffer,
      weeklyTicketCount: accum.cumulativeCount,
      ticketsToNextOffer: toNext,
      jackpotDrawId: jackpotDraw.drawId,
      jackpotDrawCode: jackpotDraw.drawCode,
      jackpotScheduledAt: jackpotDraw.scheduledAt.toISOString(),
    };
  }
}

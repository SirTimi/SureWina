import { Injectable, Logger } from '@nestjs/common';
import {
  DrawStatus,
  DrawType,
  JackpotDiscountOfferStatus,
  Prisma,
} from '@prisma/client';

const TICKETS_PER_DISCOUNT_OFFER = 10;
const JACKPOT_DISCOUNT_PRICE_NGN = 500;

export type UnlockedJackpotOffers = {
  accumId: string;
  buyerPhone: string;
  offersUnlocked: number;
  weeklyTicketCount: number;
  jackpotDrawId: string;
  jackpotDrawCode: string;
  jackpotScheduledAt: string;
  originalPriceNgn: number;
  offerPriceNgn: number;
  expiresAt: string;
} | null;

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
    },
  ): Promise<UnlockedJackpotOffers> {
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

    if (currentThreshold <= previousThreshold) {
      const remainder =
        accum.cumulativeCount % TICKETS_PER_DISCOUNT_OFFER;
      const toNext =
        remainder === 0
          ? TICKETS_PER_DISCOUNT_OFFER
          : TICKETS_PER_DISCOUNT_OFFER - remainder;

      this.logger.log(
        `${buyerPhone}: ${accum.cumulativeCount} regular ticket(s) this week, ${toNext} more for the next discounted jackpot offer`,
      );
      return null;
    }

    const thresholdNumbers = Array.from(
      { length: currentThreshold - previousThreshold },
      (_, index) => previousThreshold + index + 1,
    );

    const created = await tx.jackpotDiscountOffer.createMany({
      data: thresholdNumbers.map((thresholdNumber) => ({
        buyerPhone,
        buyerUserId,
        jackpotDrawId: jackpotDraw.drawId,
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

    if (created.count === 0) {
      this.logger.debug(
        `${buyerPhone}: promotion threshold already issued for ${jackpotDraw.drawCode}`,
      );
      return null;
    }

    this.logger.log(
      `${buyerPhone}: unlocked ${created.count} discounted jackpot offer${
        created.count === 1 ? '' : 's'
      } for ${jackpotDraw.drawCode}`,
    );

    return {
      accumId: accum.accumId,
      buyerPhone,
      offersUnlocked: created.count,
      weeklyTicketCount: accum.cumulativeCount,
      jackpotDrawId: jackpotDraw.drawId,
      jackpotDrawCode: jackpotDraw.drawCode,
      jackpotScheduledAt: jackpotDraw.scheduledAt.toISOString(),
      originalPriceNgn: jackpotDraw.ticketPriceNgn,
      offerPriceNgn: JACKPOT_DISCOUNT_PRICE_NGN,
      expiresAt: jackpotDraw.cutoffAt.toISOString(),
    };
  }
}

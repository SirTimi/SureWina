import { Injectable, Logger } from '@nestjs/common';
import {
  DrawStatus,
  DrawType,
  JackpotEntrySource,
  Prisma,
} from '@prisma/client';

const TICKETS_PER_ENTRY = 10;

// What the caller needs in order to notify, once its transaction commits.
// Returned rather than enqueued from inside: a job queued mid-transaction
// cannot be rolled back with it, so a purchase that later failed would still
// have told the customer they had earned an entry.
export type MintedJackpotEntries = {
  accumId: string;
  buyerPhone: string;
  entriesMinted: number;
  entriesThisWeek: number;
  jackpotDrawCode: string;
  jackpotScheduledAt: string;
} | null;

// The 10-for-1 rule: ten DAILY tickets bought by one phone number within a
// single playing week earn one free entry into that week's Saturday jackpot.
//
// The week is bounded by the jackpot's own sales cutoff, so a Saturday
// morning purchase still counts toward that afternoon's draw. Progress does
// not carry over — a customer sitting on nine tickets when the week closes
// starts again from zero.
//
// Called INSIDE the caller's confirmation transaction, so accumulation is
// atomic with ticket creation: a crash can never confirm tickets without
// counting them.
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
  ): Promise<MintedJackpotEntries> {
    const { buyerPhone, buyerUserId, ticketCount } = params;

    // The jackpot this purchase counts toward. Looked up first because it
    // defines the cycle — without an open jackpot there is no week to count
    // into, and the tickets earn nothing.
    const jackpotDraw = await tx.draw.findFirst({
      where: {
        drawType: DrawType.SATURDAY_JACKPOT,
        status: DrawStatus.ACTIVE,
        cutoffAt: { gt: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      select: { drawId: true, drawCode: true, scheduledAt: true },
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

    // No open jackpot: the lifetime tally still moves, but nothing accrues
    // toward a week that does not exist. Deliberately different from the old
    // behaviour, which banked the progress indefinitely — under a weekly
    // rule there is nothing to bank it into.
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
          lastTicketAt: new Date(),
        },
        update: {
          lifetimeTicketCount: { increment: ticketCount },
          lastTicketAt: new Date(),
          ...(buyerUserId ? { buyerUserId } : {}),
        },
      });

      this.logger.log(
        `${buyerPhone}: ${ticketCount} ticket(s) recorded, no open jackpot to accrue toward`,
      );
      return null;
    }

    // A purchase in a different cycle starts the week again. Rows created
    // before cycles existed have a null cycleDrawId and take this path too.
    const sameCycle = existing?.cycleDrawId === jackpotDraw.drawId;

    const accum = await tx.jackpotAccumulation.upsert({
      where: { buyerPhone },
      create: {
        buyerPhone,
        buyerUserId,
        cumulativeCount: ticketCount,
        jackpotEntriesTotal: 0,
        cycleDrawId: jackpotDraw.drawId,
        lifetimeTicketCount: ticketCount,
        lastTicketAt: new Date(),
      },
      update: sameCycle
        ? {
            cumulativeCount: { increment: ticketCount },
            lifetimeTicketCount: { increment: ticketCount },
            lastTicketAt: new Date(),
            ...(buyerUserId ? { buyerUserId } : {}),
          }
        : {
            // New week: counters restart from this purchase alone.
            cumulativeCount: ticketCount,
            jackpotEntriesTotal: 0,
            cycleDrawId: jackpotDraw.drawId,
            lifetimeTicketCount: { increment: ticketCount },
            lastTicketAt: new Date(),
            ...(buyerUserId ? { buyerUserId } : {}),
          },
    });

    if (!sameCycle && existing && existing.cumulativeCount > 0) {
      this.logger.log(
        `${buyerPhone}: new playing week — ${existing.cumulativeCount} ticket(s) of unspent progress cleared`,
      );
    }

    const owed =
      Math.floor(accum.cumulativeCount / TICKETS_PER_ENTRY) -
      accum.jackpotEntriesTotal;

    if (owed <= 0) {
      const toNext =
        TICKETS_PER_ENTRY - (accum.cumulativeCount % TICKETS_PER_ENTRY);
      this.logger.log(
        `${buyerPhone}: ${accum.cumulativeCount} this week, ${toNext} more for a jackpot entry`,
      );
      return null;
    }

    await tx.jackpotEntry.createMany({
      data: Array.from({ length: owed }, () => ({
        drawId: jackpotDraw.drawId,
        source: JackpotEntrySource.ACCUMULATION,
        sourceAccumId: accum.accumId,
        buyerPhone,
        buyerUserId,
      })),
    });

    await tx.jackpotAccumulation.update({
      where: { accumId: accum.accumId },
      data: {
        jackpotEntriesTotal: { increment: owed },
        lifetimeEntriesTotal: { increment: owed },
      },
    });

    this.logger.log(
      `${buyerPhone}: minted ${owed} free jackpot entr${owed === 1 ? 'y' : 'ies'} into ${jackpotDraw.drawCode}`,
    );

    return {
      accumId: accum.accumId,
      buyerPhone,
      entriesMinted: owed,
      // accum was read before the increment above, so the running total for
      // the week is the pre-mint figure plus what we just minted.
      entriesThisWeek: accum.jackpotEntriesTotal + owed,
      jackpotDrawCode: jackpotDraw.drawCode,
      jackpotScheduledAt: jackpotDraw.scheduledAt.toISOString(),
    };
  }
}
import { Injectable, Logger } from '@nestjs/common';
import {
  DrawStatus,
  DrawType,
  JackpotEntrySource,
  Prisma,
} from '@prisma/client';

const TICKETS_PER_ENTRY = 10;

// Handles the 10-for-1 rule: every 10 DAILY tickets a phone number buys
// earns one free entry into the next Saturday jackpot. Called INSIDE the
// webhook confirmation transaction so accumulation is atomic with ticket
// creation — a crash can never confirm tickets without counting them.
@Injectable()
export class JackpotAccumulationService {
  private readonly logger = new Logger(JackpotAccumulationService.name);

  // tx is the Prisma transaction client from the caller's $transaction.
  async recordDailyPurchase(
    tx: Prisma.TransactionClient,
    params: {
      buyerPhone: string;
      buyerUserId: string | null;
      ticketCount: number;
    },
  ): Promise<void> {
    const { buyerPhone, buyerUserId, ticketCount } = params;

    // Upsert the per-phone accumulation row and bump the lifetime tally.
    const accum = await tx.jackpotAccumulation.upsert({
      where: { buyerPhone },
      create: {
        buyerPhone,
        buyerUserId,
        cumulativeCount: ticketCount,
        jackpotEntriesTotal: 0,
        lastTicketAt: new Date(),
      },
      update: {
        cumulativeCount: { increment: ticketCount },
        lastTicketAt: new Date(),
        // Attach the userId if we learn it later (guest → registered).
        ...(buyerUserId ? { buyerUserId } : {}),
      },
    });

    // Entries owed = lifetime tally / 10, minus what we've already minted.
    // This formula makes minting self-healing: if no jackpot draw was open
    // last time (banked), the deficit is still here and mints now.
    const owed =
      Math.floor(accum.cumulativeCount / TICKETS_PER_ENTRY) -
      accum.jackpotEntriesTotal;

    if (owed <= 0) {
      return;
    }

    // Find the next open Saturday jackpot to attach the free entries to.
    const jackpotDraw = await tx.draw.findFirst({
      where: {
        drawType: DrawType.SATURDAY_JACKPOT,
        status: DrawStatus.ACTIVE,
        cutoffAt: { gt: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    if (!jackpotDraw) {
      // BANKED: no open jackpot right now. Counters already advanced, so the
      // deficit persists and the entries mint on the next confirmed purchase
      // once a jackpot draw is open (or via a worker sweep later).
      this.logger.log(
        `${buyerPhone}: ${owed} jackpot entr${owed === 1 ? 'y' : 'ies'} banked (no open jackpot draw)`,
      );
      return;
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
      data: { jackpotEntriesTotal: { increment: owed } },
    });

    this.logger.log(
      `${buyerPhone}: minted ${owed} free jackpot entr${owed === 1 ? 'y' : 'ies'} into ${jackpotDraw.drawCode}`,
    );
  }
}
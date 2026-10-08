import {
  JackpotDiscountOfferStatus,
  Prisma,
} from '@prisma/client';
import { JackpotAccumulationService } from '../src/payments/jackpot-accumulation.service';

type MockDraw = {
  drawId: string;
  drawCode: string;
  scheduledAt: Date;
  cutoffAt: Date;
  ticketPriceNgn: number;
};

type MockAccumulation = {
  accumId: string;
  buyerPhone: string;
  buyerUserId: string | null;
  cycleDrawId: string | null;
  cumulativeCount: number;
  jackpotEntriesTotal: number;
  lifetimeTicketCount: number;
  lifetimeEntriesTotal: number;
  lastTicketAt: Date;
};

type MockOfferCreate = {
  buyerPhone: string;
  buyerUserId: string | null;
  jackpotDrawId: string;
  unlockedByPaymentTxnId?: string | null;
  unlockedByWalletPurchaseId?: string | null;
  thresholdNumber: number;
  regularTicketsAtUnlock: number;
  originalPriceNgn: number;
  offerPriceNgn: number;
  status: JackpotDiscountOfferStatus;
  issuedAt: Date;
  expiresAt: Date;
};

type MockStoredOffer = MockOfferCreate & {
  offerId: string;
};

function buildHarness() {
  let activeDraw: MockDraw = {
    drawId: 'jackpot-a',
    drawCode: 'SW-JACKPOT-A',
    scheduledAt: new Date('2026-10-03T20:00:00.000Z'),
    cutoffAt: new Date('2026-10-03T19:00:00.000Z'),
    ticketPriceNgn: 5000,
  };

  let accumulation: MockAccumulation | null = null;
  const offers: MockStoredOffer[] = [];
  const jackpotEntryCreateMany = jest.fn();

  const tx = {
    draw: {
      findFirst: jest.fn(async () => activeDraw),
    },
    jackpotAccumulation: {
      findUnique: jest.fn(async () => {
        if (!accumulation) return null;

        return {
          accumId: accumulation.accumId,
          cycleDrawId: accumulation.cycleDrawId,
          cumulativeCount: accumulation.cumulativeCount,
          jackpotEntriesTotal: accumulation.jackpotEntriesTotal,
        };
      }),
      upsert: jest.fn(
        async (args: {
          create: {
            buyerPhone: string;
            buyerUserId: string | null;
            cumulativeCount: number;
            jackpotEntriesTotal: number;
            cycleDrawId: string | null;
            lifetimeTicketCount: number;
            lastTicketAt: Date;
          };
          update: {
            cumulativeCount?: number | { increment: number };
            jackpotEntriesTotal?: number;
            cycleDrawId?: string | null;
            lifetimeTicketCount?: { increment: number };
            lastTicketAt?: Date;
            buyerUserId?: string;
          };
        }) => {
          if (!accumulation) {
            accumulation = {
              accumId: 'accum-1',
              buyerPhone: args.create.buyerPhone,
              buyerUserId: args.create.buyerUserId,
              cycleDrawId: args.create.cycleDrawId,
              cumulativeCount: args.create.cumulativeCount,
              jackpotEntriesTotal: args.create.jackpotEntriesTotal,
              lifetimeTicketCount: args.create.lifetimeTicketCount,
              lifetimeEntriesTotal: 0,
              lastTicketAt: args.create.lastTicketAt,
            };
            return { ...accumulation };
          }

          const update = args.update;

          if (update.cumulativeCount !== undefined) {
            if (typeof update.cumulativeCount === 'number') {
              accumulation.cumulativeCount = update.cumulativeCount;
            } else {
              accumulation.cumulativeCount += update.cumulativeCount.increment;
            }
          }

          if (update.jackpotEntriesTotal !== undefined) {
            accumulation.jackpotEntriesTotal = update.jackpotEntriesTotal;
          }

          if (update.cycleDrawId !== undefined) {
            accumulation.cycleDrawId = update.cycleDrawId;
          }

          if (update.lifetimeTicketCount) {
            accumulation.lifetimeTicketCount +=
              update.lifetimeTicketCount.increment;
          }

          if (update.lastTicketAt) {
            accumulation.lastTicketAt = update.lastTicketAt;
          }

          if (update.buyerUserId) {
            accumulation.buyerUserId = update.buyerUserId;
          }

          return { ...accumulation };
        },
      ),
    },
    jackpotDiscountOffer: {
      createMany: jest.fn(async (args: { data: MockOfferCreate[] }) => {
        let count = 0;

        for (const offer of args.data) {
          const duplicate = offers.some(
            (existing) =>
              existing.buyerPhone === offer.buyerPhone &&
              existing.jackpotDrawId === offer.jackpotDrawId &&
              existing.thresholdNumber === offer.thresholdNumber,
          );

          if (duplicate) continue;

          offers.push({
            offerId: `offer-${offers.length + 1}`,
            ...offer,
          });
          count += 1;
        }

        return { count };
      }),
      findFirst: jest.fn(async () => {
        if (offers.length === 0) return null;

        return [...offers].sort(
          (a, b) => b.thresholdNumber - a.thresholdNumber,
        )[0];
      }),
    },
    // Historical free-entry storage is present only so this test can prove
    // the new accumulation path never touches it.
    jackpotEntry: {
      createMany: jackpotEntryCreateMany,
    },
  };

  return {
    tx: tx as unknown as Prisma.TransactionClient,
    offers,
    jackpotEntryCreateMany,
    getAccumulation: () => accumulation,
    setDraw: (draw: MockDraw) => {
      activeDraw = draw;
    },
  };
}

describe('JackpotAccumulationService', () => {
  const service = new JackpotAccumulationService();
  const buyerPhone = '+2348012345678';
  const params = (ticketCount: number) => ({
    buyerPhone,
    buyerUserId: 'user-1',
    ticketCount,
  });

  it('returns authoritative progress before a threshold is crossed', async () => {
    const h = buildHarness();

    const result = await service.recordDailyPurchase(h.tx, params(9));

    expect(result).toMatchObject({
      offersUnlocked: 0,
      latestOffer: null,
      weeklyTicketCount: 9,
      ticketsToNextOffer: 1,
      jackpotDrawId: 'jackpot-a',
      jackpotDrawCode: 'SW-JACKPOT-A',
    });
    expect(h.offers).toHaveLength(0);
  });

  it('links a newly earned discount to the exact confirmed payment', async () => {
    const h = buildHarness();
    await service.recordDailyPurchase(h.tx, {
      ...params(10),
      sourcePaymentTxnId: 'pay-confirmed-1',
    });
    expect(h.offers[0]).toMatchObject({
      unlockedByPaymentTxnId: 'pay-confirmed-1',
      unlockedByWalletPurchaseId: null,
      thresholdNumber: 1,
    });
  });

  it('links wallet-unlocked offers to the completed wallet purchase', async () => {
    const h = buildHarness();
    await service.recordDailyPurchase(h.tx, {
      ...params(20),
      sourceWalletPurchaseId: 'wallet-complete-1',
    });
    expect(h.offers).toHaveLength(2);
    expect(h.offers.map((offer) => offer.unlockedByWalletPurchaseId)).toEqual([
      'wallet-complete-1',
      'wallet-complete-1',
    ]);
  });

  it('unlocks one offer for 9 + 1 tickets', async () => {
    const h = buildHarness();

    await service.recordDailyPurchase(h.tx, params(9));
    const result = await service.recordDailyPurchase(h.tx, params(1));

    expect(result).toMatchObject({
      offersUnlocked: 1,
      weeklyTicketCount: 10,
      ticketsToNextOffer: 10,
      latestOffer: {
        offerId: 'offer-1',
        jackpotDrawId: 'jackpot-a',
        thresholdNumber: 1,
        regularTicketsAtUnlock: 10,
        offerPriceNgn: 500,
        originalPriceNgn: 5000,
        status: JackpotDiscountOfferStatus.AVAILABLE,
      },
    });
    expect(h.offers).toHaveLength(1);
    expect(h.jackpotEntryCreateMany).not.toHaveBeenCalled();
  });

  it('unlocks one offer for 5 + 5 tickets', async () => {
    const h = buildHarness();

    const first = await service.recordDailyPurchase(h.tx, params(5));
    const result = await service.recordDailyPurchase(h.tx, params(5));

    expect(first).toMatchObject({
      offersUnlocked: 0,
      weeklyTicketCount: 5,
      ticketsToNextOffer: 5,
    });
    expect(result?.offersUnlocked).toBe(1);
    expect(result?.latestOffer?.thresholdNumber).toBe(1);
    expect(h.offers).toHaveLength(1);
  });

  it('unlocks one offer for 10 tickets at once', async () => {
    const h = buildHarness();

    const result = await service.recordDailyPurchase(h.tx, params(10));

    expect(result).toMatchObject({
      offersUnlocked: 1,
      weeklyTicketCount: 10,
      ticketsToNextOffer: 10,
    });
    expect(result?.latestOffer?.thresholdNumber).toBe(1);
    expect(h.offers.map((offer) => offer.thresholdNumber)).toEqual([1]);
    expect(h.jackpotEntryCreateMany).not.toHaveBeenCalled();
  });

  it('unlocks two offers for 20 tickets at once and returns the latest one', async () => {
    const h = buildHarness();

    const result = await service.recordDailyPurchase(h.tx, params(20));

    expect(result).toMatchObject({
      offersUnlocked: 2,
      weeklyTicketCount: 20,
      ticketsToNextOffer: 10,
    });
    expect(result?.latestOffer?.thresholdNumber).toBe(2);
    expect(result?.latestOffer?.regularTicketsAtUnlock).toBe(20);
    expect(h.offers.map((offer) => offer.thresholdNumber)).toEqual([1, 2]);
    expect(h.jackpotEntryCreateMany).not.toHaveBeenCalled();
  });

  it('does not carry 9 tickets from the previous week into the new week', async () => {
    const h = buildHarness();

    await service.recordDailyPurchase(h.tx, params(9));

    h.setDraw({
      drawId: 'jackpot-b',
      drawCode: 'SW-JACKPOT-B',
      scheduledAt: new Date('2026-10-10T20:00:00.000Z'),
      cutoffAt: new Date('2026-10-10T19:00:00.000Z'),
      ticketPriceNgn: 5000,
    });

    const result = await service.recordDailyPurchase(h.tx, params(1));

    expect(result).toMatchObject({
      offersUnlocked: 0,
      latestOffer: null,
      weeklyTicketCount: 1,
      ticketsToNextOffer: 9,
      jackpotDrawId: 'jackpot-b',
    });
    expect(h.offers).toHaveLength(0);
    expect(h.getAccumulation()?.cumulativeCount).toBe(1);
    expect(h.getAccumulation()?.cycleDrawId).toBe('jackpot-b');
  });

  it('does not create a second offer before the next threshold', async () => {
    const h = buildHarness();

    await service.recordDailyPurchase(h.tx, params(10));
    const result = await service.recordDailyPurchase(h.tx, params(5));

    expect(result).toMatchObject({
      offersUnlocked: 0,
      latestOffer: null,
      weeklyTicketCount: 15,
      ticketsToNextOffer: 5,
    });
    expect(h.offers).toHaveLength(1);
    expect(h.offers[0].thresholdNumber).toBe(1);
  });
});

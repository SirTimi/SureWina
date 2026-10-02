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

type MockOffer = {
  buyerPhone: string;
  buyerUserId: string | null;
  jackpotDrawId: string;
  thresholdNumber: number;
  regularTicketsAtUnlock: number;
  originalPriceNgn: number;
  offerPriceNgn: number;
  status: JackpotDiscountOfferStatus;
  issuedAt: Date;
  expiresAt: Date;
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
  const offers: MockOffer[] = [];

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
      createMany: jest.fn(async (args: { data: MockOffer[] }) => {
        let count = 0;
        for (const offer of args.data) {
          const duplicate = offers.some(
            (existing) =>
              existing.buyerPhone === offer.buyerPhone &&
              existing.jackpotDrawId === offer.jackpotDrawId &&
              existing.thresholdNumber === offer.thresholdNumber,
          );
          if (duplicate) continue;
          offers.push(offer);
          count += 1;
        }
        return { count };
      }),
    },
  };

  return {
    tx: tx as unknown as Prisma.TransactionClient,
    offers,
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

  it('unlocks one offer for 9 + 1 tickets', async () => {
    const h = buildHarness();
    expect(await service.recordDailyPurchase(h.tx, params(9))).toBeNull();
    const result = await service.recordDailyPurchase(h.tx, params(1));

    expect(result?.offersUnlocked).toBe(1);
    expect(h.offers).toHaveLength(1);
    expect(h.offers[0]).toMatchObject({
      thresholdNumber: 1,
      regularTicketsAtUnlock: 10,
      offerPriceNgn: 500,
      originalPriceNgn: 5000,
      status: JackpotDiscountOfferStatus.AVAILABLE,
    });
  });

  it('unlocks one offer for 5 + 5 tickets', async () => {
    const h = buildHarness();
    await service.recordDailyPurchase(h.tx, params(5));
    const result = await service.recordDailyPurchase(h.tx, params(5));
    expect(result?.offersUnlocked).toBe(1);
    expect(h.offers).toHaveLength(1);
  });

  it('unlocks one offer for 10 tickets at once', async () => {
    const h = buildHarness();
    const result = await service.recordDailyPurchase(h.tx, params(10));
    expect(result?.offersUnlocked).toBe(1);
    expect(h.offers.map((offer) => offer.thresholdNumber)).toEqual([1]);
  });

  it('unlocks two offers for 20 tickets at once', async () => {
    const h = buildHarness();
    const result = await service.recordDailyPurchase(h.tx, params(20));
    expect(result?.offersUnlocked).toBe(2);
    expect(h.offers.map((offer) => offer.thresholdNumber)).toEqual([1, 2]);
    expect(h.offers.map((offer) => offer.regularTicketsAtUnlock)).toEqual([
      10,
      20,
    ]);
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
    expect(result).toBeNull();
    expect(h.offers).toHaveLength(0);
    expect(h.getAccumulation()?.cumulativeCount).toBe(1);
    expect(h.getAccumulation()?.cycleDrawId).toBe('jackpot-b');
  });

  it('does not create the same threshold twice', async () => {
    const h = buildHarness();
    await service.recordDailyPurchase(h.tx, params(10));
    const result = await service.recordDailyPurchase(h.tx, params(5));
    expect(result).toBeNull();
    expect(h.offers).toHaveLength(1);
    expect(h.offers[0].thresholdNumber).toBe(1);
  });
});

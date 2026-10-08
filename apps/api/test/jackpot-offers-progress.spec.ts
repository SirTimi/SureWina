import { DrawStatus, DrawType, JackpotDiscountOfferStatus, Prisma } from '@prisma/client';
import { JackpotOffersService } from '../src/payments/jackpot-offers.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';

const user = {
  sub: 'customer-1',
  phoneNumber: '+2348012345678',
  type: 'customer' as const,
};

type ProgressOptions = {
  openDraw?: boolean;
  accumulation?: { cycleDrawId: string | null; cumulativeCount: number } | null;
  availableOfferCount?: number;
};

function harness(options: ProgressOptions = {}) {
  const now = Date.now();
  const draw = {
    drawId: 'jackpot-current',
    drawCode: 'SW-JACKPOT-CURRENT',
    scheduledAt: new Date(now + 2 * 3600000),
    cutoffAt: new Date(now + 3600000),
  };
  const tx = {
    draw: {
      findFirst: jest.fn(async () => options.openDraw === false ? null : draw),
    },
    jackpotAccumulation: {
      findUnique: jest.fn(async () => options.accumulation === undefined
        ? null : options.accumulation),
    },
    jackpotDiscountOffer: {
      count: jest.fn(async () => options.availableOfferCount ?? 0),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (
      work: (client: typeof tx) => Promise<unknown>,
    ) => work(tx)),
  } as unknown as PrismaService;
  const service = new JackpotOffersService(
    prisma,
    {} as AuditService,
  );
  return { service, tx, prisma, draw };
}

describe('JackpotOffersService.progress', () => {
  it('reports 7 / 10 from persisted current-cycle accumulation and only available offers', async () => {
    const h = harness({
      accumulation: {
        cycleDrawId: 'jackpot-current',
        cumulativeCount: 7,
      },
      availableOfferCount: 0,
    });
    const progress = await h.service.progress(user);

    expect(progress).toEqual({
      promotionActive: true,
      jackpotDrawCode: 'SW-JACKPOT-CURRENT',
      jackpotScheduledAt: h.draw.scheduledAt.toISOString(),
      weeklyTicketCount: 7,
      completedThresholds: 0,
      ticketsToNextOffer: 3,
      availableOfferCount: 0,
    });
    expect(h.tx.jackpotDiscountOffer.count).toHaveBeenCalledWith({
      where: {
        buyerPhone: user.phoneNumber,
        jackpotDrawId: h.draw.drawId,
        status: JackpotDiscountOfferStatus.AVAILABLE,
        expiresAt: { gt: expect.any(Date) },
      },
    });
    expect(h.tx.jackpotAccumulation.findUnique).toHaveBeenCalledWith({
      where: { buyerPhone: user.phoneNumber },
      select: { cycleDrawId: true, cumulativeCount: true },
    });
    expect(h.tx.draw.findFirst).toHaveBeenCalledWith({
      where: {
        drawType: DrawType.SATURDAY_JACKPOT,
        status: DrawStatus.ACTIVE,
        cutoffAt: { gt: expect.any(Date) },
      },
      orderBy: { scheduledAt: 'asc' },
      select: {
        drawId: true,
        drawCode: true,
        scheduledAt: true,
      },
    });
    expect(h.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  });

  it('reports 10 tickets, 1 completed threshold, and 10 toward the next offer', async () => {
    const h = harness({
      accumulation: {
        cycleDrawId: 'jackpot-current',
        cumulativeCount: 10,
      },
      availableOfferCount: 1,
    });
    await expect(h.service.progress(user)).resolves.toMatchObject({
      weeklyTicketCount: 10,
      completedThresholds: 1,
      ticketsToNextOffer: 10,
      availableOfferCount: 1,
    });
  });

  it('reports 28 / 30, 2 completed thresholds, and 2 remaining', async () => {
    const h = harness({
      accumulation: {
        cycleDrawId: 'jackpot-current',
        cumulativeCount: 28,
      },
      availableOfferCount: 1,
    });
    await expect(h.service.progress(user)).resolves.toMatchObject({
      weeklyTicketCount: 28,
      completedThresholds: 2,
      ticketsToNextOffer: 2,
      availableOfferCount: 1,
    });
  });

  it('resets visible progress for a previous Saturday cycle without changing historical data', async () => {
    const h = harness({
      accumulation: {
        cycleDrawId: 'jackpot-last-week',
        cumulativeCount: 19,
      },
      availableOfferCount: 0,
    });
    await expect(h.service.progress(user)).resolves.toMatchObject({
      weeklyTicketCount: 0,
      completedThresholds: 0,
      ticketsToNextOffer: 10,
      availableOfferCount: 0,
    });
    expect(h.tx.jackpotAccumulation.findUnique).toHaveBeenCalledTimes(1);
  });

  it('shows no progress rather than a false weekly count when there is no active jackpot', async () => {
    const h = harness({
      openDraw: false,
      accumulation: {
        cycleDrawId: 'jackpot-last-week',
        cumulativeCount: 29,
      },
      availableOfferCount: 2,
    });
    await expect(h.service.progress(user)).resolves.toEqual({
      promotionActive: false,
      jackpotDrawCode: null,
      jackpotScheduledAt: null,
      weeklyTicketCount: 0,
      completedThresholds: 0,
      ticketsToNextOffer: 10,
      availableOfferCount: 0,
    });
    expect(h.tx.jackpotAccumulation.findUnique).not.toHaveBeenCalled();
    expect(h.tx.jackpotDiscountOffer.count).not.toHaveBeenCalled();
  });

  it('counts only available offers, independent of completed ticket thresholds', async () => {
    const h = harness({
      accumulation: {
        cycleDrawId: 'jackpot-current',
        cumulativeCount: 30,
      },
      availableOfferCount: 1, // One declined, one claimed, one AVAILABLE.
    });
    await expect(h.service.progress(user)).resolves.toMatchObject({
      weeklyTicketCount: 30,
      completedThresholds: 3,
      ticketsToNextOffer: 10,
      availableOfferCount: 1,
    });
  });
});

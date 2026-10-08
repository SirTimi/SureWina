import {
  DrawStatus,
  DrawType,
  JackpotDiscountOfferStatus,
} from '@prisma/client';

import { CustomerAdminService } from '../src/admin-ops/customer-admin.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';

const phone = '+2348012345678';
const now = Date.now();
const current = {
  drawId: 'jackpot-current',
  drawCode: 'SW-JACKPOT-CURRENT',
};
const lastWeek = {
  drawId: 'jackpot-last-week',
  drawCode: 'SW-JACKPOT-LAST',
};

type TestOffer = ReturnType<typeof makeOffer>;

function makeOffer(
  offerId: string,
  status: JackpotDiscountOfferStatus,
  draw = current,
  expiresAt = new Date(now + 60 * 60 * 1000),
) {
  return {
    offerId,
    jackpotDrawId: draw.drawId,
    jackpotDraw: {
      drawCode: draw.drawCode,
      scheduledAt: new Date(now + 2 * 60 * 60 * 1000),
    },
    thresholdNumber: 1,
    regularTicketsAtUnlock: 10,
    originalPriceNgn: 5000,
    offerPriceNgn: 500,
    status,
    issuedAt: new Date(now - 20 * 60 * 1000),
    expiresAt,
    claimedAt: status === JackpotDiscountOfferStatus.CLAIMED
      ? new Date(now - 5 * 60 * 1000)
      : null,
    declinedAt: status === JackpotDiscountOfferStatus.DECLINED
      ? new Date(now - 5 * 60 * 1000)
      : null,
    offerSmsSentAt: null,
  };
}

function harness(args: {
  openCycle?: boolean;
  accumulationCycleId?: string;
  weeklyCount?: number;
  offers?: TestOffer[];
} = {}) {
  const accum = {
    buyerPhone: phone,
    cycleDrawId: args.accumulationCycleId ?? current.drawId,
    cumulativeCount: args.weeklyCount ?? 17,
    lifetimeTicketCount: 117,
    lifetimeEntriesTotal: 2,
    lastTicketAt: new Date(now - 10 * 60 * 1000),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({
        phoneNumber: phone,
        displayName: 'Customer',
        kycStatus: 'OTP_VERIFIED',
      })),
    },
    paymentTransaction: {
      aggregate: jest.fn(async () => ({
        _sum: { amountNgn: 8500, ticketCount: 17 },
        _count: 2,
      })),
    },
    ticket: { count: jest.fn(async () => 17) },
    prizeClaim: { findMany: jest.fn(async () => []) },
    jackpotAccumulation: {
      findUnique: jest.fn(async () => accum),
    },
    blockedPhone: { findUnique: jest.fn(async () => null) },
    draw: {
      findFirst: jest.fn(async () => args.openCycle === false ? null : current),
    },
    jackpotDiscountOffer: {
      findMany: jest.fn(async () => args.offers ?? [
        makeOffer('offer-1', JackpotDiscountOfferStatus.AVAILABLE),
      ]),
    },
  };
  const service = new CustomerAdminService(
    prisma as unknown as PrismaService,
    {} as AuditService,
  );
  return { service, prisma };
}

describe('Customer admin jackpot offer visibility', () => {
  it('shows 17 weekly tickets, 1 unlocked offer, and 3 until the next milestone', async () => {
    const h = harness();
    const result = await h.service.detail(phone);

    expect(result.promotion).toMatchObject({
      activeCycle: true,
      jackpotDrawCode: current.drawCode,
      weeklyRegularTickets: 17,
      offersUnlocked: 1,
      available: 1,
      claimed: 0,
      declined: 0,
      claiming: 0,
      expired: 0,
      ticketsToNextOffer: 3,
    });

    expect(result.promotion.offers[0]).toEqual({
      offerId: 'offer-1',
      jackpotDrawCode: current.drawCode,
      jackpotScheduledAt: expect.any(String),
      thresholdNumber: 1,
      regularTicketsAtUnlock: 10,
      originalPriceNgn: 5000,
      offerPriceNgn: 500,
      status: JackpotDiscountOfferStatus.AVAILABLE,
      issuedAt: expect.any(String),
      expiresAt: expect.any(String),
      claimedAt: null,
      declinedAt: null,
      offerSmsSentAt: null,
    });
    expect(h.prisma.jackpotDiscountOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { buyerPhone: phone },
        orderBy: [{ issuedAt: 'desc' }, { offerId: 'desc' }],
      }),
    );
    expect(h.prisma.draw.findFirst).toHaveBeenCalledWith({
      where: {
        drawType: DrawType.SATURDAY_JACKPOT,
        status: DrawStatus.ACTIVE,
        cutoffAt: { gt: expect.any(Date) },
      },
      orderBy: { scheduledAt: 'asc' },
      select: { drawId: true, drawCode: true },
    });
  });

  it('counts current-cycle claim, decline, reservation and expiry independently', async () => {
    const offers = [
      makeOffer('available', JackpotDiscountOfferStatus.AVAILABLE),
      makeOffer('claimed', JackpotDiscountOfferStatus.CLAIMED),
      makeOffer('declined', JackpotDiscountOfferStatus.DECLINED),
      makeOffer('claiming', JackpotDiscountOfferStatus.CLAIMING),
      makeOffer('expired-not-normalized', JackpotDiscountOfferStatus.AVAILABLE,
        current, new Date(now - 1000)),
      makeOffer('old-week', JackpotDiscountOfferStatus.CLAIMED, lastWeek),
    ];
    const h = harness({ weeklyCount: 55, offers });
    const result = await h.service.detail(phone);

    expect(result.promotion).toMatchObject({
      weeklyRegularTickets: 55,
      offersUnlocked: 5,
      available: 1,
      claimed: 1,
      declined: 1,
      claiming: 1,
      expired: 1,
      ticketsToNextOffer: 5,
    });
    expect(result.promotion.offers).toHaveLength(6);
    expect(result.promotion.offers.find((o) =>
      o.offerId === 'expired-not-normalized')?.status,
    ).toBe(JackpotDiscountOfferStatus.EXPIRED);
    expect(result.promotion.offers.find((o) =>
      o.offerId === 'claimed')?.claimedAt,
    ).toEqual(expect.any(String));
    expect(result.promotion.offers.find((o) =>
      o.offerId === 'old-week')?.jackpotDrawCode,
    ).toBe(lastWeek.drawCode);
  });

  it('resets weekly counts for a new cycle but retains earlier offers in history', async () => {
    const h = harness({
      accumulationCycleId: lastWeek.drawId,
      weeklyCount: 17,
      offers: [makeOffer('old-week', JackpotDiscountOfferStatus.CLAIMED, lastWeek)],
    });
    const result = await h.service.detail(phone);

    expect(result.promotion).toMatchObject({
      activeCycle: true,
      weeklyRegularTickets: 0,
      offersUnlocked: 0,
      available: 0,
      claimed: 0,
      declined: 0,
      ticketsToNextOffer: 10,
    });
    expect(result.promotion.offers).toHaveLength(1);
    expect(result.accumulation?.lifetime.entriesEarned).toBe(2);
  });

  it('does not invent a current offer cycle when no jackpot is open', async () => {
    const h = harness({ openCycle: false });
    const result = await h.service.detail(phone);
    expect(result.promotion).toMatchObject({
      activeCycle: false,
      jackpotDrawCode: null,
      weeklyRegularTickets: 0,
      offersUnlocked: 0,
      available: 0,
      ticketsToNextOffer: null,
    });
    expect(result.promotion.offers).toHaveLength(1);
  });
});

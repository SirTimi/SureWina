import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  DrawStatus,
  DrawType,
  JackpotDiscountOfferStatus,
} from '@prisma/client';

import { JackpotOffersService } from '../src/payments/jackpot-offers.service';

import type { AuditService } from '../src/audit/audit.service';
import type { PrismaService } from '../src/database/prisma.service';

type TestOffer = {
  offerId: string;
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
  claimingAt: Date | null;
  claimedAt: Date | null;
  declinedAt: Date | null;
  jackpotDraw: {
    drawCode: string;
    drawType: DrawType;
    status: DrawStatus;
    scheduledAt: Date;
    cutoffAt: Date;
    ticketPriceNgn: number;
  };
};

const user = {
  sub: 'user-1',
  phoneNumber: '+2348012345678',
  type: 'customer' as const,
};

function buildOffer(
  overrides: Partial<TestOffer> = {},
): TestOffer {
  const now = Date.now();

  return {
    offerId: '11111111-1111-4111-8111-111111111111',
    buyerPhone: user.phoneNumber,
    buyerUserId: user.sub,
    jackpotDrawId: 'jackpot-1',
    thresholdNumber: 1,
    regularTicketsAtUnlock: 10,
    originalPriceNgn: 5000,
    offerPriceNgn: 500,
    status: JackpotDiscountOfferStatus.AVAILABLE,
    issuedAt: new Date(now - 60_000),
    expiresAt: new Date(now + 60 * 60 * 1000),
    claimingAt: null,
    claimedAt: null,
    declinedAt: null,
    jackpotDraw: {
      drawCode: 'SW-JACKPOT-A',
      drawType: DrawType.SATURDAY_JACKPOT,
      status: DrawStatus.ACTIVE,
      scheduledAt: new Date(now + 2 * 60 * 60 * 1000),
      cutoffAt: new Date(now + 60 * 60 * 1000),
      ticketPriceNgn: 5000,
    },
    ...overrides,
  };
}

function matchesStatus(
  actual: JackpotDiscountOfferStatus,
  expected: unknown,
) {
  if (typeof expected === 'string') {
    return actual === expected;
  }

  if (
    expected &&
    typeof expected === 'object' &&
    'in' in expected
  ) {
    return (expected.in as JackpotDiscountOfferStatus[]).includes(actual);
  }

  return true;
}

function matchesDate(
  actual: Date | null,
  expected: unknown,
) {
  if (expected === null) {
    return actual === null;
  }

  if (!expected || typeof expected !== 'object') {
    return true;
  }

  if ('gt' in expected && actual) {
    if (!(actual > (expected.gt as Date))) return false;
  }

  if ('lte' in expected && actual) {
    if (!(actual <= (expected.lte as Date))) return false;
  }

  return true;
}

function buildHarness(initialOffer: TestOffer) {
  let offer = { ...initialOffer };
  const audit = {
    write: jest.fn().mockResolvedValue(undefined),
  };

  function matchesWhere(where: Record<string, unknown>) {
    if (where.offerId && where.offerId !== offer.offerId) return false;
    if (
      where.buyerPhone &&
      where.buyerPhone !== offer.buyerPhone
    ) {
      return false;
    }

    if (
      Object.prototype.hasOwnProperty.call(where, 'buyerUserId') &&
      where.buyerUserId !== offer.buyerUserId
    ) {
      return false;
    }

    if (
      where.status &&
      !matchesStatus(offer.status, where.status)
    ) {
      return false;
    }

    if (
      where.jackpotDrawId &&
      where.jackpotDrawId !== offer.jackpotDrawId
    ) {
      return false;
    }

    if (
      where.offerPriceNgn &&
      where.offerPriceNgn !== offer.offerPriceNgn
    ) {
      return false;
    }

    if (
      where.expiresAt &&
      !matchesDate(offer.expiresAt, where.expiresAt)
    ) {
      return false;
    }

    if (Array.isArray(where.OR)) {
      const orMatches = where.OR.some((condition) => {
        const item = condition as Record<string, unknown>;

        if (
          Object.prototype.hasOwnProperty.call(item, 'claimingAt')
        ) {
          return matchesDate(offer.claimingAt, item.claimingAt);
        }

        return false;
      });

      if (!orMatches) return false;
    }

    return true;
  }

  const tx = {
    $queryRaw: jest.fn(async () => [
      { offer_id: offer.offerId },
    ]),

    paymentTransaction: {
      count: jest.fn(async () => 0),
    },

    walletPurchase: {
      count: jest.fn(async () => 0),
    },

    ticket: {
      findUnique: jest.fn().mockResolvedValue(null),
    },

    jackpotDiscountOffer: {
      updateMany: jest.fn(async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (!matchesWhere(args.where)) {
          return { count: 0 };
        }

        if (
          Object.prototype.hasOwnProperty.call(args.data, 'buyerUserId')
        ) {
          offer.buyerUserId =
            args.data.buyerUserId as string;
        }

        if (
          Object.prototype.hasOwnProperty.call(args.data, 'status')
        ) {
          offer.status =
            args.data.status as JackpotDiscountOfferStatus;
        }

        if (
          Object.prototype.hasOwnProperty.call(args.data, 'claimingAt')
        ) {
          offer.claimingAt =
            (args.data.claimingAt as Date | null) ?? null;
        }

        if (
          Object.prototype.hasOwnProperty.call(args.data, 'declinedAt')
        ) {
          offer.declinedAt =
            (args.data.declinedAt as Date | null) ?? null;
        }

        if (
          Object.prototype.hasOwnProperty.call(args.data, 'claimedAt')
        ) {
          offer.claimedAt =
            (args.data.claimedAt as Date | null) ?? null;
        }

        return { count: 1 };
      }),

      findFirst: jest.fn(async (args: {
        where: Record<string, unknown>;
      }) => {
        return matchesWhere(args.where)
          ? { ...offer }
          : null;
      }),

      findUnique: jest.fn(async (args: {
        where: Record<string, unknown>;
      }) => {
        return matchesWhere(args.where)
          ? { ...offer }
          : null;
      }),

      update: jest.fn(async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (!matchesWhere(args.where)) {
          throw new Error('Offer not found');
        }

        if (
          Object.prototype.hasOwnProperty.call(args.data, 'buyerUserId')
        ) {
          offer.buyerUserId =
            args.data.buyerUserId as string;
        }

        if (
          Object.prototype.hasOwnProperty.call(args.data, 'status')
        ) {
          offer.status =
            args.data.status as JackpotDiscountOfferStatus;
        }

        if (
          Object.prototype.hasOwnProperty.call(args.data, 'claimingAt')
        ) {
          offer.claimingAt =
            (args.data.claimingAt as Date | null) ?? null;
        }

        return { ...offer };
      }),

      findMany: jest.fn(async (args: {
        where: Record<string, unknown>;
      }) => {
        return matchesWhere(args.where)
          ? [{ ...offer }]
          : [];
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (
        callback: (transaction: typeof tx) => Promise<unknown>,
      ) => callback(tx),
    ),
  } as unknown as PrismaService;

  const service = new JackpotOffersService(
    prisma,
    audit as unknown as AuditService,
  );

  return {
    service,
    audit,
    tx,
    getOffer: () => ({ ...offer }),
  };
}

describe('JackpotOffersService', () => {
  it('binds a phone-owned guest offer to the authenticated customer', async () => {
    const h = buildHarness(
      buildOffer({
        buyerUserId: null,
      }),
    );

    const result = await h.service.current(user);

    expect(result.offers).toHaveLength(1);
    expect(h.getOffer().buyerUserId).toBe(user.sub);
  });

  it('reserves an AVAILABLE offer and returns a reservation expiry', async () => {
    const h = buildHarness(buildOffer());

    const result = await h.service.reserve(
      user,
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.status).toBe(
      JackpotDiscountOfferStatus.CLAIMING,
    );
    expect(result.claimingAt).not.toBeNull();
    expect(result.reservationExpiresAt).not.toBeNull();
    expect(h.audit.write).toHaveBeenCalledTimes(1);
  });

  it('treats a repeated claim click as idempotent without extending the reservation', async () => {
    const claimingAt = new Date(Date.now() - 60_000);

    const h = buildHarness(
      buildOffer({
        status: JackpotDiscountOfferStatus.CLAIMING,
        claimingAt,
      }),
    );

    const result = await h.service.reserve(
      user,
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.status).toBe(
      JackpotDiscountOfferStatus.CLAIMING,
    );
    expect(result.claimingAt).toBe(claimingAt.toISOString());
    expect(h.audit.write).not.toHaveBeenCalled();
  });

  it('releases a stale CLAIMING reservation and reserves it again safely', async () => {
    const oldClaimingAt = new Date(Date.now() - 16 * 60 * 1000);

    const h = buildHarness(
      buildOffer({
        status: JackpotDiscountOfferStatus.CLAIMING,
        claimingAt: oldClaimingAt,
      }),
    );

    const result = await h.service.reserve(
      user,
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.status).toBe(
      JackpotDiscountOfferStatus.CLAIMING,
    );
    expect(result.claimingAt).not.toBe(oldClaimingAt.toISOString());
    expect(
      new Date(result.claimingAt ?? 0).getTime(),
    ).toBeGreaterThan(oldClaimingAt.getTime());
  });

  it('declines an AVAILABLE offer', async () => {
    const h = buildHarness(buildOffer());

    const result = await h.service.decline(
      user,
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.status).toBe(
      JackpotDiscountOfferStatus.DECLINED,
    );
    expect(result.declinedAt).not.toBeNull();
    expect(h.audit.write).toHaveBeenCalledTimes(1);
  });

  it('does not allow decline while checkout is actively CLAIMING', async () => {
    const h = buildHarness(
      buildOffer({
        status: JackpotDiscountOfferStatus.CLAIMING,
        claimingAt: new Date(),
      }),
    );

    await expect(
      h.service.decline(
        user,
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('releases a CLAIMING offer back to AVAILABLE', async () => {
    const h = buildHarness(
      buildOffer({
        status: JackpotDiscountOfferStatus.CLAIMING,
        claimingAt: new Date(),
      }),
    );

    const result = await h.service.release(
      user,
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.status).toBe(
      JackpotDiscountOfferStatus.AVAILABLE,
    );
    expect(result.claimingAt).toBeNull();
  });

  it('does not reveal an offer owned by another phone number', async () => {
    const h = buildHarness(
      buildOffer({
        buyerPhone: '+2348099999999',
        buyerUserId: 'other-user',
      }),
    );

    await expect(
      h.service.get(
        user,
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates the persisted NGN 500 offer for one jackpot ticket', async () => {
    const h = buildHarness(
      buildOffer({
        status: JackpotDiscountOfferStatus.CLAIMING,
        claimingAt: new Date(),
      }),
    );

    const validation =
      await h.service.validatePromotionalPaymentInTransaction(
        h.tx as never,
        {
          offerId: '11111111-1111-4111-8111-111111111111',
          buyerPhone: user.phoneNumber,
          buyerUserId: user.sub,
          purchaseDrawId: 'jackpot-1',
          amountNgn: 500,
          ticketCount: 1,
          effectivePaidAt: new Date(),
        },
      );

    expect(validation.issues).toEqual([]);
    expect(validation.offer?.offerPriceNgn).toBe(500);
  });

  it('rejects client-incompatible promotional amount and quantity', async () => {
    const h = buildHarness(
      buildOffer({
        status: JackpotDiscountOfferStatus.CLAIMING,
        claimingAt: new Date(),
      }),
    );

    const validation =
      await h.service.validatePromotionalPaymentInTransaction(
        h.tx as never,
        {
          offerId: '11111111-1111-4111-8111-111111111111',
          buyerPhone: user.phoneNumber,
          buyerUserId: user.sub,
          purchaseDrawId: 'jackpot-1',
          amountNgn: 5000,
          ticketCount: 2,
          effectivePaidAt: new Date(),
        },
      );

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        'PROMOTIONAL_OFFER_AMOUNT_MISMATCH',
        'PROMOTIONAL_OFFER_QUANTITY_MUST_BE_ONE',
      ]),
    );
  });

  it('rejects another provider fulfilment when the offer already has a ticket', async () => {
    const h = buildHarness(
      buildOffer({
        status: JackpotDiscountOfferStatus.CLAIMING,
        claimingAt: new Date(),
      }),
    );

    h.tx.ticket.findUnique.mockResolvedValueOnce({
      ticketId: 'already-issued-ticket',
    });

    const validation =
      await h.service.validatePromotionalPaymentInTransaction(
        h.tx as never,
        {
          offerId: '11111111-1111-4111-8111-111111111111',
          buyerPhone: user.phoneNumber,
          buyerUserId: user.sub,
          purchaseDrawId: 'jackpot-1',
          amountNgn: 500,
          ticketCount: 1,
          effectivePaidAt: new Date(),
        },
      );

    expect(validation.issues).toContain(
      'PROMOTIONAL_OFFER_ALREADY_HAS_TICKET',
    );
  });

  it('cannot mark the same offer CLAIMED twice', async () => {
    const h = buildHarness(
      buildOffer({
        status: JackpotDiscountOfferStatus.CLAIMING,
        claimingAt: new Date(),
      }),
    );

    const input = {
      offerId: '11111111-1111-4111-8111-111111111111',
      buyerPhone: user.phoneNumber,
      buyerUserId: user.sub,
      jackpotDrawId: 'jackpot-1',
      amountNgn: 500,
    };

    await h.service.markClaimedInTransaction(
      h.tx as never,
      input,
    );

    await expect(
      h.service.markClaimedInTransaction(
        h.tx as never,
        input,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(h.getOffer().status).toBe(
      JackpotDiscountOfferStatus.CLAIMED,
    );
  });

  it('marks a validated CLAIMING offer as CLAIMED', async () => {
    const h = buildHarness(
      buildOffer({
        status: JackpotDiscountOfferStatus.CLAIMING,
        claimingAt: new Date(),
      }),
    );

    await h.service.markClaimedInTransaction(
      h.tx as never,
      {
        offerId: '11111111-1111-4111-8111-111111111111',
        buyerPhone: user.phoneNumber,
        buyerUserId: user.sub,
        jackpotDrawId: 'jackpot-1',
        amountNgn: 500,
      },
    );

    expect(h.getOffer().status).toBe(
      JackpotDiscountOfferStatus.CLAIMED,
    );
    expect(h.getOffer().claimingAt).toBeNull();
    expect(h.getOffer().claimedAt).not.toBeNull();
  });

  it('expires an offer whose jackpot cutoff has passed', async () => {
    const h = buildHarness(
      buildOffer({
        expiresAt: new Date(Date.now() - 1000),
      }),
    );

    const current = await h.service.current(user);

    expect(current.offers).toHaveLength(0);
    expect(h.getOffer().status).toBe(
      JackpotDiscountOfferStatus.EXPIRED,
    );
  });
});

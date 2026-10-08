import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  JackpotDiscountOfferStatus,
  PaymentStatus,
  PurchasePricingContext,
} from '@prisma/client';
import { JackpotOffersService } from '../src/payments/jackpot-offers.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';

const offerId = '22222222-2222-4222-8222-222222222222';
const reference = 'SW-PAY-11111111-1111-4111-8111-111111111111';

function harness(
  purchaseStatus: PaymentStatus,
  linked = true,
  initialStatus: JackpotDiscountOfferStatus =
    JackpotDiscountOfferStatus.AVAILABLE,
) {
  let status: JackpotDiscountOfferStatus = initialStatus;
  const tx = {
    paymentTransaction: {
      findUnique: jest.fn().mockResolvedValue({
        txnId: 'payment-1',
        buyerPhone: '+2348012345678',
        status: purchaseStatus,
        pricingContext: PurchasePricingContext.NORMAL,
      }),
    },
    jackpotDiscountOffer: {
      findFirst: jest.fn().mockImplementation(async (args: {
        where: { unlockedByPaymentTxnId: string };
      }) =>
        linked && args.where.unlockedByPaymentTxnId === 'payment-1'
          ? { status, expiresAt: new Date(Date.now() + 3600000) }
          : null,
      ),
      updateMany: jest.fn().mockImplementation(async () => {
        if (status !== JackpotDiscountOfferStatus.AVAILABLE) {
          return { count: 0 };
        }
        status = JackpotDiscountOfferStatus.DECLINED;
        return { count: 1 };
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (arg: typeof tx) => Promise<unknown>) => work(tx)),
  } as unknown as PrismaService;
  const service = new JackpotOffersService(prisma, {} as AuditService);
  return { service, tx, getStatus: () => status };
}

describe('Guest offer decline', () => {
  it('declines an offer unlocked by the verified guest purchase', async () => {
    const h = harness(PaymentStatus.CONFIRMED);
    const result = await h.service.declineFromPurchaseReference(offerId, reference);
    expect(result).toEqual({ status: 'DECLINED' });
    expect(h.getStatus()).toBe(JackpotDiscountOfferStatus.DECLINED);
  });

  it('rejects decline before the regular purchase is confirmed', async () => {
    const h = harness(PaymentStatus.PENDING);
    await expect(
      h.service.declineFromPurchaseReference(offerId, reference),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(h.tx.jackpotDiscountOffer.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a reference that did not unlock this offer', async () => {
    const h = harness(PaymentStatus.CONFIRMED, false);
    await expect(
      h.service.declineFromPurchaseReference(offerId, reference),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not allow declining an already-claiming offer', async () => {
    const h = harness(
      PaymentStatus.CONFIRMED,
      true,
      JackpotDiscountOfferStatus.CLAIMING,
    );
    await expect(
      h.service.declineFromPurchaseReference(offerId, reference),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.tx.jackpotDiscountOffer.updateMany).not.toHaveBeenCalled();
  });
});

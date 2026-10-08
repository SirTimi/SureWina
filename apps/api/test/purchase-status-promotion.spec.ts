import {
  DrawType,
  JackpotDiscountOfferStatus,
  PaymentStatus,
  PaymentGateway,
} from '@prisma/client';
import { PurchaseStatusService } from '../src/payments/purchase-status.service';

import type { PrismaService } from '../src/database/prisma.service';
import type { PurchaseConfirmationService } from '../src/payments/purchase-confirmation.service';
import type { PaymentVerificationService } from '../src/payments/payment-verification.service';
import type { NotificationQueueService } from '../src/queue/notification-queue.service';

function harness(unlocked: boolean) {
  const transaction = {
    txnId: 'payment-1',
    gatewayReference: 'SW-PAY-11111111-1111-4111-8111-111111111111',
    status: PaymentStatus.CONFIRMED,
    gateway: PaymentGateway.PAYSTACK,
    buyerPhone: '+2348012345678',
    amountNgn: 5000,
  };
  const offer = unlocked ? {
    offerId: '22222222-2222-4222-8222-222222222222',
    status: JackpotDiscountOfferStatus.AVAILABLE,
    offerPriceNgn: 500,
    originalPriceNgn: 5000,
    regularTicketsAtUnlock: 10,
    expiresAt: new Date(Date.now() + 3600000),
    jackpotDraw: {
      drawCode: 'SW-JACKPOT-001',
    },
  } : null;
  const prisma = {
    paymentTransaction: {
      findUnique: jest.fn().mockResolvedValue(transaction),
    },
    ticket: {
      findMany: jest.fn().mockResolvedValue([
        { ticketRef: 'SW-TICKET-001', drawId: 'draw-1' },
      ]),
    },
    draw: {
      findUnique: jest.fn().mockResolvedValue({
        drawCode: 'SW-DAILY-001',
        drawType: DrawType.DAILY_STANDARD,
        scheduledAt: new Date(),
        prizeDescription: 'Daily Prize',
      }),
    },
    jackpotAccumulation: {
      findUnique: jest.fn().mockResolvedValue({
        cumulativeCount: 10,
      }),
    },
    jackpotDiscountOffer: {
      findFirst: jest.fn().mockResolvedValue(offer),
    },
  };
  const service = new PurchaseStatusService(
    prisma as unknown as PrismaService,
    {} as PaymentVerificationService,
    {} as PurchaseConfirmationService,
    {} as NotificationQueueService,
  );
  return { service, prisma, transaction };
}

describe('Phase 7 purchase promotion confirmation', () => {
  it('returns the unlocked offer only from the confirmed purchase provenance', async () => {
    const h = harness(true);
    const result = await h.service.getStatus(h.transaction.gatewayReference);

    expect(result.promotion).toEqual({
      offerId: '22222222-2222-4222-8222-222222222222',
      status: 'AVAILABLE',
      priceNgn: 500,
      normalPriceNgn: 5000,
      expiresAt: expect.any(String),
      jackpotDrawCode: 'SW-JACKPOT-001',
      regularTicketsAtUnlock: 10,
    });
    expect(h.prisma.jackpotDiscountOffer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unlockedByPaymentTxnId: h.transaction.txnId,
          expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
      }),
    );
  });

  it('never suggests an offer unlocked by another purchase', async () => {
    const h = harness(false);
    const result = await h.service.getStatus(h.transaction.gatewayReference);
    expect(result.promotion).toBeNull();
  });
});

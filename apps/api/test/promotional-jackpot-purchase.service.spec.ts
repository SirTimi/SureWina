import {
  DrawStatus,
  DrawType,
  JackpotDiscountOfferStatus,
  PaymentGateway,
  PurchasePricingContext,
  WalletPurchaseStatus,
} from '@prisma/client';

import { PaymentsService } from '../src/payments/payments.service';
import { WalletTicketPurchaseService } from '../src/payments/wallet-ticket-purchase.service';

import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { ConfigService } from '@nestjs/config';
import type { MonnifyDriver } from '../src/payments/gateway/monnify.driver';
import type { FlutterwaveDriver } from '../src/payments/gateway/flutterwave.driver';
import type { CustomerAdminService } from '../src/admin-ops/customer-admin.service';
import type { AccountService } from '../src/account/account.service';
import type { PaystackDriver } from '../src/payments/gateway/paystack.driver';
import type { JackpotOffersService } from '../src/payments/jackpot-offers.service';
import type { WalletService } from '../src/wallet/wallet.service';
import type { JackpotAccumulationService } from '../src/payments/jackpot-accumulation.service';
import type { NotificationQueueService } from '../src/queue/notification-queue.service';

const offerId =
  '11111111-1111-4111-8111-111111111111';

const user = {
  sub: 'user-1',
  phoneNumber: '+2348012345678',
  type: 'customer' as const,
};

const now = Date.now();

const offer = {
  offerId,
  buyerPhone: user.phoneNumber,
  buyerUserId: user.sub,
  jackpotDrawId: 'draw-jackpot',
  thresholdNumber: 1,
  regularTicketsAtUnlock: 10,
  originalPriceNgn: 5000,
  offerPriceNgn: 500,
  status: JackpotDiscountOfferStatus.CLAIMING,
  issuedAt: new Date(now - 60_000),
  expiresAt: new Date(now + 60 * 60 * 1000),
  claimingAt: new Date(),
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
};

describe('Promotional jackpot purchase pricing', () => {
  it('initializes Paystack at the stored NGN 500 offer price', async () => {
    const createdTransactions: Array<Record<string, unknown>> = [];

    const tx = {
      paymentTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: { data: Record<string, unknown> }) => {
          createdTransactions.push(args.data);
          return {
            txnId: 'txn-promo-1',
          };
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(
        async (
          callback: (transaction: typeof tx) => Promise<unknown>,
        ) => callback(tx),
      ),
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      paymentTransaction: {
        update: jest.fn(),
      },
    } as unknown as PrismaService;

    const audit = {
      write: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    const config = {
      getOrThrow: jest
        .fn()
        .mockReturnValue('https://customer.surewina.test'),
    } as unknown as ConfigService;

    const customerAdmin = {
      assertNotBlocked: jest.fn().mockResolvedValue(undefined),
    } as unknown as CustomerAdminService;

    const account = {
      assertPurchaseAllowed: jest.fn().mockResolvedValue(undefined),
    } as unknown as AccountService;

    const paystack = {
      initialize: jest.fn(async (input: {
        reference: string;
      }) => ({
        authorizationUrl: 'https://paystack.test/authorize',
        gatewayReference: input.reference,
      })),
    } as unknown as PaystackDriver;

    const jackpotOffers = {
      get: jest.fn().mockResolvedValue({
        offerId,
        offerPriceNgn: 500,
      }),
      reserveForPurchaseInTransaction:
        jest.fn().mockResolvedValue(offer),
      release: jest.fn(),
    } as unknown as JackpotOffersService;

    const service = new PaymentsService(
      prisma,
      audit,
      config,
      {} as MonnifyDriver,
      {} as FlutterwaveDriver,
      customerAdmin,
      account,
      paystack,
      jackpotOffers,
    );

    const result =
      await service.initiatePromotionalJackpotPurchase(
        user,
        offerId,
        {
          stateOfPlayCode: 'FCT',
          buyerEmail: 'buyer@example.com',
        },
      );

    expect(result.amountNgn).toBe(500);
    expect(account.assertPurchaseAllowed).toHaveBeenCalledWith(
      user.phoneNumber,
      500,
    );

    expect(createdTransactions[0]).toMatchObject({
      gateway: PaymentGateway.PAYSTACK,
      amountNgn: 500,
      buyerPhone: user.phoneNumber,
      buyerUserId: user.sub,
      ticketCount: 1,
      pricingContext:
        PurchasePricingContext.PROMOTIONAL_JACKPOT,
      jackpotDiscountOfferId: offerId,
      purchaseDrawId: offer.jackpotDrawId,
    });

    expect(paystack.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        amountKobo: 50_000,
        metadata: expect.objectContaining({
          quantity: 1,
          jackpotDiscountOfferId: offerId,
          pricingContext:
            PurchasePricingContext.PROMOTIONAL_JACKPOT,
        }),
      }),
    );
  });

  it('charges wallet NGN 500, creates one NGN 500 jackpot ticket, and claims the offer', async () => {
    const createdPurchases: Array<Record<string, unknown>> = [];
    const createdTickets: Array<Record<string, unknown>> = [];

    const draw = {
      drawId: offer.jackpotDrawId,
      drawCode: offer.jackpotDraw.drawCode,
      drawType: DrawType.SATURDAY_JACKPOT,
      status: DrawStatus.ACTIVE,
      cutoffAt: offer.jackpotDraw.cutoffAt,
      scheduledAt: offer.jackpotDraw.scheduledAt,
      ticketPriceNgn: 5000,
    };

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        { draw_id: draw.drawId },
      ]),
      draw: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(draw),
      },
      paymentTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      ledgerAccount: {
        findUnique: jest.fn().mockResolvedValue({
          accountId: 'revenue-account',
        }),
      },
      walletPurchase: {
        create: jest.fn(
          async (args: { data: Record<string, unknown> }) => {
            createdPurchases.push(args.data);
            return {
              purchaseId: 'wallet-promo-1',
            };
          },
        ),
        update: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      ticket: {
        createMany: jest.fn(
          async (args: { data: Array<Record<string, unknown>> }) => {
            createdTickets.push(...args.data);
            return { count: args.data.length };
          },
        ),
      },
    };

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userId: user.sub,
          phoneNumber: user.phoneNumber,
          email: 'buyer@example.com',
        }),
      },
      walletPurchase: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(
        async (
          callback: (transaction: typeof tx) => Promise<unknown>,
        ) => callback(tx),
      ),
    } as unknown as PrismaService;

    const audit = {
      write: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    const account = {
      assertWalletPurchaseAllowedInTransaction:
        jest.fn().mockResolvedValue(undefined),
    } as unknown as AccountService;

    const customerAdmin = {
      assertNotBlocked: jest.fn().mockResolvedValue(undefined),
    } as unknown as CustomerAdminService;

    const wallets = {
      getCustomerWallet: jest.fn().mockResolvedValue({
        walletId: 'wallet-1',
      }),
      createHoldInTransaction: jest.fn().mockResolvedValue({
        holdId: 'hold-1',
      }),
      captureHoldInTransaction: jest.fn().mockResolvedValue(undefined),
    } as unknown as WalletService;

    const jackpotOffers = {
      reserveForPurchaseInTransaction:
        jest.fn().mockResolvedValue(offer),
      markClaimedInTransaction:
        jest.fn().mockResolvedValue(undefined),
    } as unknown as JackpotOffersService;

    const notifications = {
      enqueueTicketConfirmationSms:
        jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationQueueService;

    const service = new WalletTicketPurchaseService(
      prisma,
      audit,
      account,
      customerAdmin,
      wallets,
      {} as JackpotAccumulationService,
      jackpotOffers,
      notifications,
    );

    const result = await service.purchase(
      user.sub,
      {
        drawCode: draw.drawCode,
        quantity: 1,
        stateOfPlayCode: 'FCT',
        idempotencyKey:
          'promo-wallet-idempotency-0001',
        jackpotDiscountOfferId: offerId,
      },
    );

    expect(result.amountNgn).toBe(500);
    expect(result.ticketCount).toBe(1);
    expect(result.pricingContext).toBe(
      PurchasePricingContext.PROMOTIONAL_JACKPOT,
    );
    expect(result.jackpotDiscountOfferId).toBe(offerId);

    expect(createdPurchases[0]).toMatchObject({
      amountNgn: 500,
      ticketCount: 1,
      pricingContext:
        PurchasePricingContext.PROMOTIONAL_JACKPOT,
      jackpotDiscountOfferId: offerId,
    });

    expect(createdTickets).toHaveLength(1);
    expect(createdTickets[0]).toMatchObject({
      ticketType: 'JACKPOT',
      faceValueNgn: 500,
      drawId: draw.drawId,
      jackpotDiscountOfferId: offerId,
    });

    expect(wallets.createHoldInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        amountNgn: 500,
      }),
    );

    expect(jackpotOffers.markClaimedInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        offerId,
        amountNgn: 500,
        jackpotDrawId: draw.drawId,
      }),
    );
  });
});

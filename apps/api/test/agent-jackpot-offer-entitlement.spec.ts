import {
  AgentStatus,
  DrawStatus,
  DrawType,
  PaymentGateway,
  PaymentStatus,
} from '@prisma/client';

import { AgentSalesService } from '../src/agent-ops/agent-sales.service';

import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { JackpotAccumulationService } from '../src/payments/jackpot-accumulation.service';
import type { NotificationQueueService } from '../src/queue/notification-queue.service';
import type { CustomerAdminService } from '../src/admin-ops/customer-admin.service';
import type { AccountService } from '../src/account/account.service';
import type { AgentAccountingService } from '../src/agent-ops/agent-accounting.service';
import type { WalletService } from '../src/wallet/wallet.service';

const agentId = 'agent-1';
const customerPhone = '+2348012345678';
const now = Date.now();

const dailyDraw = {
  drawId: 'daily-draw-1',
  drawCode: 'SW-DAILY-TEST',
  drawType: DrawType.DAILY_STANDARD,
  ticketPriceNgn: 500,
  scheduledAt: new Date(now + 2 * 60 * 60 * 1000),
  cutoffAt: new Date(now + 60 * 60 * 1000),
  status: DrawStatus.ACTIVE,
};

const offerUnlock = {
  accumId: 'accum-1',
  buyerPhone: customerPhone,
  offersUnlocked: 1,
  latestOffer: {
    offerId: '11111111-1111-4111-8111-111111111111',
    jackpotDrawId: 'jackpot-draw-1',
    thresholdNumber: 1,
    regularTicketsAtUnlock: 10,
    originalPriceNgn: 5000,
    offerPriceNgn: 500,
    status: 'AVAILABLE' as const,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
  },
  weeklyTicketCount: 10,
  ticketsToNextOffer: 10,
  jackpotDrawId: 'jackpot-draw-1',
  jackpotDrawCode: 'SW-JACKPOT-TEST',
  jackpotScheduledAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
};

function harness(unlock = offerUnlock) {
  const txn = {
    txnId: 'agent-payment-1',
    gatewayReference: 'SW-AGT-test',
    amountNgn: 500,
    gateway: PaymentGateway.AGENT_CASH,
    status: PaymentStatus.CONFIRMED,
    confirmedAt: new Date(),
    createdAt: new Date(),
  };

  const tx = {
    paymentTransaction: {
      create: jest.fn(async () => txn),
    },
    ticket: {
      createMany: jest.fn(async () => ({ count: 1 })),
    },
    jackpotDiscountOffer: {
      findMany: jest.fn(async () => [
        {
          offerId: offerUnlock.latestOffer.offerId,
          buyerPhone: customerPhone,
          offerPriceNgn: 500,
          originalPriceNgn: 5000,
          expiresAt: new Date(offerUnlock.latestOffer.expiresAt),
          jackpotDraw: {
            scheduledAt: new Date(offerUnlock.jackpotScheduledAt),
          },
        },
      ]),
    },
  };

  const prisma = {
    jackpotDiscountOffer: {
      findMany: jest.fn(async () => [
        {
          offerId: offerUnlock.latestOffer.offerId,
          buyerPhone: customerPhone,
          offerPriceNgn: 500,
          originalPriceNgn: 5000,
          expiresAt: new Date(offerUnlock.latestOffer.expiresAt),
          jackpotDraw: {
            scheduledAt: new Date(offerUnlock.jackpotScheduledAt),
          },
        },
      ]),
    },
    agent: {
      findUnique: jest.fn(async () => ({
        agentId,
        agentCode: 'AGT001',
        phoneNumber: '+2348099999999',
        status: AgentStatus.ACTIVE,
        commissionRate: 0.1,
      })),
    },
    draw: {
      findUnique: jest.fn(async () => dailyDraw),
    },
    $transaction: jest.fn(
      async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
    ),
  };

  const audit = {
    write: jest.fn().mockResolvedValue(undefined),
  };
  const accumulation = {
    recordDailyPurchase: jest.fn().mockResolvedValue(unlock),
  };
  const queue = {
    enqueueTicketConfirmationSms: jest.fn().mockResolvedValue(undefined),
    enqueueJackpotOfferSms: jest.fn().mockResolvedValue(undefined),
  };
  const customers = {
    assertNotBlocked: jest.fn().mockResolvedValue(undefined),
  };
  const account = {
    assertPurchaseAllowed: jest.fn().mockResolvedValue(undefined),
  };
  const accounting = {
    recordSaleInTransaction: jest.fn().mockResolvedValue(undefined),
  };
  const wallets = {
    ensureAgentWallet: jest.fn().mockResolvedValue({
      walletId: 'agent-wallet-1',
    }),
  };

  const service = new AgentSalesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    accumulation as unknown as JackpotAccumulationService,
    queue as unknown as NotificationQueueService,
    customers as unknown as CustomerAdminService,
    account as unknown as AccountService,
    accounting as unknown as AgentAccountingService,
    wallets as unknown as WalletService,
  );

  return {
    service,
    tx,
    txn,
    accumulation,
    queue,
    customers,
    account,
  };
}

describe('Agent sales and jackpot offer entitlement parity', () => {
  it('passes an identified customer sale through the shared accumulator in the committed transaction', async () => {
    const h = harness();

    const result = await h.service.sell(agentId, {
      drawCode: dailyDraw.drawCode,
      quantity: 1,
      customerPhone,
      stateOfPlayCode: 'FCT',
    });

    expect(h.accumulation.recordDailyPurchase).toHaveBeenCalledWith(
      h.tx,
      {
        buyerPhone: customerPhone,
        buyerUserId: null,
        ticketCount: 1,
        sourcePaymentTxnId: h.txn.txnId,
      },
    );

    expect(result.jackpotOfferUnlock).toMatchObject({
      offersUnlocked: 1,
      weeklyTicketCount: 10,
      ticketsToNextOffer: 10,
      latestOffer: {
        status: 'AVAILABLE',
        offerPriceNgn: 500,
        thresholdNumber: 1,
      },
    });

    expect(h.queue.enqueueTicketConfirmationSms).toHaveBeenCalledWith(
      expect.objectContaining({
        txnId: h.txn.txnId,
        buyerPhone: customerPhone,
        amountNgn: 500,
      }),
    );
    expect(h.queue.enqueueJackpotOfferSms).toHaveBeenCalledWith({
      offerId: offerUnlock.latestOffer.offerId,
      buyerPhone: customerPhone,
      offerPriceNgn: 500,
      normalPriceNgn: 5000,
      jackpotScheduledAt: offerUnlock.jackpotScheduledAt,
      expiresAt: offerUnlock.latestOffer.expiresAt,
    });
  });

  it('never credits a named customer entitlement to the agent when customer phone is absent', async () => {
    const h = harness();

    const result = await h.service.sell(agentId, {
      drawCode: dailyDraw.drawCode,
      quantity: 1,
      stateOfPlayCode: 'FCT',
    });

    expect(h.accumulation.recordDailyPurchase).not.toHaveBeenCalled();
    expect(result.jackpotOfferUnlock).toBeNull();
    expect(h.queue.enqueueTicketConfirmationSms).not.toHaveBeenCalled();
    expect(h.queue.enqueueJackpotOfferSms).not.toHaveBeenCalled();
  });
});

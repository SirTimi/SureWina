import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CbaTransferPurpose,
  CbaTransferStatus,
  DrawStatus,
  DrawType,
  PurchasePricingContext,
  WalletPurchaseFundingSource,
  WalletPurchaseStatus,
  WitmangoWalletPurpose,
} from '@prisma/client';

import { WalletTicketPurchaseService } from '../src/payments/wallet-ticket-purchase.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { AccountService } from '../src/account/account.service';
import type { CustomerAdminService } from '../src/admin-ops/customer-admin.service';
import type { WalletService } from '../src/wallet/wallet.service';
import type { JackpotAccumulationService } from '../src/payments/jackpot-accumulation.service';
import type { JackpotOffersService } from '../src/payments/jackpot-offers.service';
import type { NotificationQueueService } from '../src/queue/notification-queue.service';
import type { WitmangoWalletLinkService } from '../src/integrations/witmango/witmango-wallet-link.service';
import type { WitmangoTransferService } from '../src/integrations/witmango/witmango-transfer.service';

type Row = Record<string, any>;

const DEPOSIT = { clientId: 4, savingsAccountId: 10 };
const WINNINGS = { clientId: 4, savingsAccountId: 11 };
const SALES = { officeId: 1, clientId: 90, accountId: 900 };

const dto = {
  idempotencyKey: 'idem-0001',
  drawCode: 'D-001',
  quantity: 2,
  stateOfPlayCode: 'LA',
};

function harness(options: {
  depositNgn: number;
  winningsNgn: number;
  // What the CBA answers, in order, for each transfer sent (including
  // reversals). Anything not scripted posts.
  outcomes?: CbaTransferStatus[];
  spendingEnabled?: boolean;
  cbaState?: string;
}) {
  const draw: Row = {
    drawId: 'draw-1',
    drawCode: 'D-001',
    drawType: DrawType.DAILY_STANDARD,
    status: DrawStatus.ACTIVE,
    ticketPriceNgn: 500,
    cutoffAt: new Date(Date.now() + 60 * 60 * 1000),
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  };

  const purchases = new Map<string, Row>();
  const tickets: Row[] = [];
  const transfers: Row[] = [];
  let seq = 0;

  const withRelations = (row: Row | undefined) =>
    row
      ? {
          ...row,
          draw,
          tickets: tickets
            .filter((t) => t.walletPurchaseId === row.purchaseId)
            .map((t) => ({ ticketRef: t.ticketRef })),
        }
      : null;

  const prisma: Row = {
    user: {
      findUnique: jest.fn(async () => ({
        userId: 'user-1',
        phoneNumber: '+2348000000001',
        email: null,
      })),
    },
    walletPurchase: {
      findUnique: jest.fn(async ({ where }: { where: Row }) =>
        withRelations(
          where.idempotencyKey
            ? [...purchases.values()].find(
                (p) => p.idempotencyKey === where.idempotencyKey,
              )
            : purchases.get(where.purchaseId),
        ),
      ),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = {
          purchaseId: `purchase-${++seq}`,
          fundingSource: WalletPurchaseFundingSource.LEDGER,
          failureReason: null,
          completedAt: null,
          ...data,
        };
        purchases.set(row.purchaseId, row);
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = purchases.get(where.purchaseId);
        if (!row || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    draw: {
      findUniqueOrThrow: jest.fn(async () => ({ ...draw })),
    },
    ticket: {
      createMany: jest.fn(async ({ data }: { data: Row[] }) => {
        tickets.push(...data);
        return { count: data.length };
      }),
    },
    $queryRaw: jest.fn(async () => [{ draw_id: draw.drawId }]),
  };
  // A transaction that rolls back what it changed if it throws, as a real
  // one would.
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => {
    const saved = new Map(
      [...purchases].map(([id, row]) => [id, { ...row }]),
    );
    const ticketCount = tickets.length;
    try {
      return await fn(prisma);
    } catch (error) {
      purchases.clear();
      saved.forEach((row, id) => purchases.set(id, row));
      tickets.length = ticketCount;
      throw error;
    }
  });

  const outcomes = [...(options.outcomes ?? [])];

  const settle = (row: Row) => {
    row.status = outcomes.shift() ?? CbaTransferStatus.POSTED;
    return { ...row };
  };

  const cbaTransfers = {
    isSpendingEnabled: () => options.spendingEnabled ?? true,
    salesEndpoint: () => SALES,
    endpoint: (a: { clientId: number; savingsAccountId: number }) => ({
      officeId: 1,
      clientId: a.clientId,
      accountId: a.savingsAccountId,
    }),
    availableNgn: jest.fn(async (a: { savingsAccountId: number }) =>
      a.savingsAccountId === DEPOSIT.savingsAccountId
        ? options.depositNgn
        : options.winningsNgn,
    ),
    createInTransaction: jest.fn(async (_tx: unknown, draft: Row) => {
      const row = {
        transferId: `t-${transfers.length + 1}`,
        status: CbaTransferStatus.PENDING,
        ...draft,
      };
      transfers.push(row);
      return { ...row };
    }),
    execute: jest.fn(async (id: string) =>
      settle(transfers.find((t) => t.transferId === id)!),
    ),
    reverse: jest.fn(async (original: Row) => {
      const row = {
        transferId: `t-${transfers.length + 1}`,
        purpose: CbaTransferPurpose.REVERSAL,
        reversesTransferId: original.transferId,
        from: original.to,
        to: original.from,
        amountNgn: original.amountNgn,
        status: CbaTransferStatus.PENDING,
      };
      transfers.push(row);
      return settle(row);
    }),
  };

  const cbaLinks = {
    getState: jest.fn(async () => options.cbaState ?? 'READY'),
    getActiveAccount: jest.fn(async (_w: string, purpose: WitmangoWalletPurpose) =>
      purpose === WitmangoWalletPurpose.DEPOSIT ? DEPOSIT : WINNINGS,
    ),
  };

  const audit = { write: jest.fn(async () => undefined) };
  const notifications = { enqueueTicketConfirmationSms: jest.fn(async () => undefined) };
  const wallets = {
    getCustomerWallet: jest.fn(async () => ({ walletId: 'wallet-1' })),
    createHoldInTransaction: jest.fn(),
    captureHoldInTransaction: jest.fn(),
  };

  const service = new WalletTicketPurchaseService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    {
      assertWalletPurchaseAllowedInTransaction: jest.fn(async () => undefined),
    } as unknown as AccountService,
    { assertNotBlocked: jest.fn(async () => undefined) } as unknown as CustomerAdminService,
    wallets as unknown as WalletService,
    {
      recordDailyPurchase: jest.fn(async () => ({ offersUnlocked: 0 })),
    } as unknown as JackpotAccumulationService,
    {} as JackpotOffersService,
    notifications as unknown as NotificationQueueService,
    cbaLinks as unknown as WitmangoWalletLinkService,
    cbaTransfers as unknown as WitmangoTransferService,
  );

  return {
    service,
    draw,
    purchases,
    tickets,
    transfers,
    cbaTransfers,
    wallets,
    notifications,
    audit,
    purchase: () => [...purchases.values()][0],
  };
}

describe('Wallet ticket purchase paid from the CBA', () => {
  it('keeps the ledger path when CBA spending is switched off', async () => {
    const h = harness({ depositNgn: 5000, winningsNgn: 0, spendingEnabled: false });
    // The ledger path then needs a revenue account this harness lacks; all
    // that matters is that no CBA money moved.
    await expect(h.service.purchase('user-1', dto)).rejects.toThrow();
    expect(h.cbaTransfers.createInTransaction).not.toHaveBeenCalled();
    expect(h.cbaTransfers.execute).not.toHaveBeenCalled();
  });

  it('keeps the ledger path for a wallet whose CBA pair is not READY', async () => {
    const h = harness({ depositNgn: 5000, winningsNgn: 0, cbaState: 'IN_PROGRESS' });
    await expect(h.service.purchase('user-1', dto)).rejects.toThrow();
    expect(h.cbaTransfers.execute).not.toHaveBeenCalled();
  });

  it('pays from Deposit, then issues tickets', async () => {
    const h = harness({ depositNgn: 5000, winningsNgn: 0 });

    const result = await h.service.purchase('user-1', dto);

    expect(result.status).toBe(WalletPurchaseStatus.COMPLETED);
    expect(result).toMatchObject({
      fundingSource: WalletPurchaseFundingSource.CBA,
      amountNgn: 1000,
      ticketCount: 2,
      pricingContext: PurchasePricingContext.NORMAL,
    });
    expect(result.ticketRefs).toHaveLength(2);
    expect(h.transfers).toHaveLength(1);
    expect(h.transfers[0]).toMatchObject({
      purpose: CbaTransferPurpose.WALLET_PURCHASE,
      from: { officeId: 1, clientId: 4, accountId: 10 },
      to: SALES,
      amountNgn: 1000,
      walletPurchaseId: h.purchase().purchaseId,
    });
    expect(h.tickets).toHaveLength(2);
    expect(h.tickets.every((t) => t.faceValueNgn === 500)).toBe(true);
    expect(h.purchase().status).toBe(WalletPurchaseStatus.COMPLETED);
    expect(h.wallets.createHoldInTransaction).not.toHaveBeenCalled();
    expect(h.notifications.enqueueTicketConfirmationSms).toHaveBeenCalledTimes(1);
  });

  it('spends Deposit before Winnings when Deposit is not enough', async () => {
    const h = harness({ depositNgn: 300, winningsNgn: 5000 });

    await h.service.purchase('user-1', dto);

    expect(h.transfers.map((t) => [t.from.accountId, t.amountNgn])).toEqual([
      [10, 300],
      [11, 700],
    ]);
  });

  it('writes the purchase and its transfers down before any money moves', async () => {
    const h = harness({ depositNgn: 5000, winningsNgn: 0 });
    h.cbaTransfers.execute.mockImplementationOnce(async (id: string) => {
      // At the moment the CBA is called, the record already exists.
      expect(h.purchase().status).toBe(WalletPurchaseStatus.PENDING);
      expect(h.transfers.find((t) => t.transferId === id)).toBeDefined();
      const row = h.transfers.find((t) => t.transferId === id)!;
      row.status = CbaTransferStatus.POSTED;
      return { ...row };
    });

    await h.service.purchase('user-1', dto);
  });

  it('refuses before writing anything when the two accounts together are short', async () => {
    const h = harness({ depositNgn: 300, winningsNgn: 600 });

    await expect(h.service.purchase('user-1', dto)).rejects.toThrow(
      'Insufficient wallet balance',
    );
    expect(h.purchases.size).toBe(0);
    expect(h.transfers).toHaveLength(0);
  });

  it('refuses a second payment while one is still in flight for the wallet', async () => {
    const h = harness({ depositNgn: 5000, winningsNgn: 0 });
    (h.service as any).prisma.walletPurchase.count.mockResolvedValueOnce(1);

    await expect(h.service.purchase('user-1', dto)).rejects.toThrow(
      'Another wallet payment is still in progress',
    );
    expect(h.transfers).toHaveLength(0);
  });

  it('closes the purchase as FAILED with no tickets when the CBA refuses the payment', async () => {
    const h = harness({
      depositNgn: 5000,
      winningsNgn: 0,
      outcomes: [CbaTransferStatus.FAILED],
    });

    await expect(h.service.purchase('user-1', dto)).rejects.toThrow(
      'No money was taken',
    );
    expect(h.purchase()).toMatchObject({
      status: WalletPurchaseStatus.FAILED,
      failureReason: 'PAYMENT_FAILED',
    });
    expect(h.tickets).toHaveLength(0);
    expect(h.cbaTransfers.reverse).not.toHaveBeenCalled();
  });

  it('returns the Deposit part when the Winnings part is refused', async () => {
    const h = harness({
      depositNgn: 300,
      winningsNgn: 5000,
      outcomes: [CbaTransferStatus.POSTED, CbaTransferStatus.FAILED],
    });

    await expect(h.service.purchase('user-1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(h.cbaTransfers.reverse).toHaveBeenCalledTimes(1);
    expect(h.cbaTransfers.reverse.mock.calls[0][0]).toMatchObject({
      amountNgn: 300,
      from: { accountId: 10 },
    });
    expect(h.purchase().status).toBe(WalletPurchaseStatus.FAILED);
    expect(h.tickets).toHaveLength(0);
  });

  it('stops at an uncertain answer: review, no tickets, nothing further sent or returned', async () => {
    const h = harness({
      depositNgn: 300,
      winningsNgn: 5000,
      outcomes: [CbaTransferStatus.UNCERTAIN],
    });

    const error = await h.service.purchase('user-1', dto).catch((e) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).toContain(h.purchase().purchaseId);
    expect(h.purchase()).toMatchObject({
      status: WalletPurchaseStatus.REVIEW_REQUIRED,
      failureReason: 'PAYMENT_UNCERTAIN',
    });
    // The Winnings leg was written down but never sent.
    expect(h.cbaTransfers.execute).toHaveBeenCalledTimes(1);
    expect(h.cbaTransfers.reverse).not.toHaveBeenCalled();
    expect(h.tickets).toHaveLength(0);
  });

  it('returns the money if the draw closed while the CBA was answering', async () => {
    const h = harness({ depositNgn: 5000, winningsNgn: 0 });
    h.cbaTransfers.execute.mockImplementationOnce(async (id: string) => {
      h.draw.cutoffAt = new Date(Date.now() - 1000);
      const row = h.transfers.find((t) => t.transferId === id)!;
      row.status = CbaTransferStatus.POSTED;
      return { ...row };
    });

    await expect(h.service.purchase('user-1', dto)).rejects.toThrow(
      'closed before your payment completed',
    );
    expect(h.cbaTransfers.reverse).toHaveBeenCalledTimes(1);
    expect(h.purchase()).toMatchObject({
      status: WalletPurchaseStatus.FAILED,
      failureReason: 'SALES_CLOSED',
    });
    expect(h.tickets).toHaveLength(0);
  });

  it('sends the purchase to review if returning the money does not post', async () => {
    const h = harness({
      depositNgn: 5000,
      winningsNgn: 0,
      outcomes: [CbaTransferStatus.POSTED, CbaTransferStatus.UNCERTAIN],
    });
    h.draw.status = DrawStatus.ACTIVE;
    (h.service as any).prisma.ticket.createMany.mockRejectedValueOnce(
      new Error('database gone'),
    );

    await expect(h.service.purchase('user-1', dto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(h.purchase()).toMatchObject({
      status: WalletPurchaseStatus.REVIEW_REQUIRED,
      failureReason: 'REFUND_INCOMPLETE',
    });
  });

  it('does not return money for a purchase that actually committed', async () => {
    const h = harness({ depositNgn: 5000, winningsNgn: 0 });
    const prisma = (h.service as any).prisma;
    const realTransaction = prisma.$transaction.getMockImplementation();
    let calls = 0;
    prisma.$transaction.mockImplementation(async (fn: any) => {
      calls += 1;
      const result = await realTransaction(fn);
      // The issuing commit succeeds, but its answer is lost.
      if (calls === 2) throw new Error('connection reset after commit');
      return result;
    });

    const result = await h.service.purchase('user-1', dto);

    expect(result.status).toBe(WalletPurchaseStatus.COMPLETED);
    expect(result.ticketRefs).toHaveLength(2);
    expect(h.cbaTransfers.reverse).not.toHaveBeenCalled();
  });

  describe('retrying with the same idempotency key', () => {
    it.each([
      [WalletPurchaseStatus.PENDING, ConflictException, 'still being processed'],
      [WalletPurchaseStatus.FAILED, ConflictException, 'did not go through'],
      [WalletPurchaseStatus.REVIEW_REQUIRED, ServiceUnavailableException, 'could not confirm'],
    ])('a %s CBA purchase is never re-paid', async (status, type, text) => {
      const h = harness({ depositNgn: 5000, winningsNgn: 0 });
      h.purchases.set('purchase-x', {
        purchaseId: 'purchase-x',
        idempotencyKey: dto.idempotencyKey,
        buyerUserId: 'user-1',
        ticketCount: dto.quantity,
        stateOfPlayCode: dto.stateOfPlayCode,
        amountNgn: 1000,
        pricingContext: PurchasePricingContext.NORMAL,
        jackpotDiscountOfferId: null,
        status,
        fundingSource: WalletPurchaseFundingSource.CBA,
        completedAt: null,
      });

      const error = await h.service.purchase('user-1', dto).catch((e) => e);

      expect(error).toBeInstanceOf(type);
      expect(error.message).toContain(text);
      expect(h.cbaTransfers.execute).not.toHaveBeenCalled();
    });
  });
});

import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AgentStatus,
  CbaTransferPurpose,
  CbaTransferStatus,
  DrawStatus,
  DrawType,
  PaymentGateway,
  PaymentStatus,
  WitmangoWalletPurpose,
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
import type { WitmangoWalletLinkService } from '../src/integrations/witmango/witmango-wallet-link.service';
import type { WitmangoTransferService } from '../src/integrations/witmango/witmango-transfer.service';

type Row = Record<string, any>;

const FLOAT = { clientId: 7, savingsAccountId: 70 };
const EARNINGS = { clientId: 7, savingsAccountId: 71 };
const SALES = { officeId: 1, clientId: 90, accountId: 900 };

const dto = {
  drawCode: 'D-001',
  quantity: 4,
  stateOfPlayCode: 'LA',
};

function harness(options: {
  floatNgn: number;
  // CBA answers in send order: the sale, then commission or reversal.
  outcomes?: CbaTransferStatus[];
  spendingEnabled?: boolean;
}) {
  const draw: Row = {
    drawId: 'draw-1',
    drawCode: 'D-001',
    drawType: DrawType.SATURDAY_JACKPOT,
    status: DrawStatus.ACTIVE,
    ticketPriceNgn: 500,
    cutoffAt: new Date(Date.now() + 60 * 60 * 1000),
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  };

  const payments: Row[] = [];
  const tickets: Row[] = [];
  const transfers: Row[] = [];

  const prisma: Row = {
    agent: {
      findUnique: jest.fn(async () => ({
        agentId: 'agent-1',
        agentCode: 'AG001',
        status: AgentStatus.ACTIVE,
        commissionRate: '0.1',
        phoneNumber: '+2348000000009',
      })),
    },
    draw: {
      findUnique: jest.fn(async () => ({ ...draw })),
      findUniqueOrThrow: jest.fn(async () => ({ ...draw })),
    },
    paymentTransaction: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = { txnId: `txn-${payments.length + 1}`, createdAt: new Date(), ...data };
        payments.push(row);
        return { ...row };
      }),
      findUnique: jest.fn(async ({ where }: { where: Row }) => {
        const row = payments.find((p) => p.gatewayReference === where.gatewayReference);
        return row
          ? {
              ...row,
              tickets: tickets
                .filter((t) => t.paymentTxnId === row.txnId)
                .map((t) => ({ ticketRef: t.ticketRef })),
            }
          : null;
      }),
    },
    cbaTransfer: {
      update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = transfers.find((t) => t.transferId === where.transferId)!;
        Object.assign(row, data);
        return { ...row };
      }),
      findFirst: jest.fn(async () => null),
    },
    ticket: {
      createMany: jest.fn(async ({ data }: { data: Row[] }) => {
        tickets.push(...data);
        return { count: data.length };
      }),
    },
    jackpotDiscountOffer: { findMany: jest.fn(async () => []) },
    $queryRaw: jest.fn(async () => [{ draw_id: draw.drawId }]),
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => {
    const p = payments.length;
    const t = tickets.length;
    try {
      return await fn(prisma);
    } catch (error) {
      payments.length = p;
      tickets.length = t;
      throw error;
    }
  });

  const outcomes = [...(options.outcomes ?? [])];
  const settle = (row: Row) => {
    row.status = outcomes.shift() ?? CbaTransferStatus.POSTED;
    return { ...row };
  };
  const record = (draft: Row) => {
    const row = {
      transferId: `t-${transfers.length + 1}`,
      status: CbaTransferStatus.PENDING,
      ...draft,
    };
    transfers.push(row);
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
    availableNgn: jest.fn(async () => options.floatNgn),
    create: jest.fn(async (draft: Row) => record(draft)),
    createInTransaction: jest.fn(async (_tx: unknown, draft: Row) => record(draft)),
    execute: jest.fn(async (id: string) =>
      settle(transfers.find((t) => t.transferId === id)!),
    ),
    reverse: jest.fn(async (original: Row) =>
      settle(
        record({
          purpose: CbaTransferPurpose.REVERSAL,
          reversesTransferId: original.transferId,
          from: original.to,
          to: original.from,
          amountNgn: original.amountNgn,
        }),
      ),
    ),
  };

  const cbaLinks = {
    getState: jest.fn(async () => 'READY'),
    getActiveAccount: jest.fn(async (_w: string, purpose: WitmangoWalletPurpose) =>
      purpose === WitmangoWalletPurpose.FLOAT ? FLOAT : EARNINGS,
    ),
  };

  const accounting = { recordSaleInTransaction: jest.fn() };
  const audit = { write: jest.fn(async () => undefined) };

  const service = new AgentSalesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    { recordDailyPurchase: jest.fn() } as unknown as JackpotAccumulationService,
    {
      enqueueTicketConfirmationSms: jest.fn(async () => undefined),
      enqueueJackpotOfferSms: jest.fn(async () => undefined),
    } as unknown as NotificationQueueService,
    { assertNotBlocked: jest.fn(async () => undefined) } as unknown as CustomerAdminService,
    { assertPurchaseAllowed: jest.fn(async () => undefined) } as unknown as AccountService,
    accounting as unknown as AgentAccountingService,
    { ensureAgentWallet: jest.fn(async () => ({ walletId: 'agent-wallet-1' })) } as unknown as WalletService,
    cbaLinks as unknown as WitmangoWalletLinkService,
    cbaTransfers as unknown as WitmangoTransferService,
  );

  return { service, draw, payments, tickets, transfers, cbaTransfers, accounting, audit };
}

describe('Agent sale paid from the CBA Float', () => {
  it('keeps the ledger path when CBA spending is switched off', async () => {
    const h = harness({ floatNgn: 100_000, spendingEnabled: false });
    await h.service.sell('agent-1', dto);
    expect(h.accounting.recordSaleInTransaction).toHaveBeenCalledTimes(1);
    expect(h.cbaTransfers.create).not.toHaveBeenCalled();
  });

  it('takes the full ticket value from Float, then pays commission into Earnings', async () => {
    const h = harness({ floatNgn: 100_000 });

    const result = await h.service.sell('agent-1', dto);

    expect(result).toMatchObject({
      amountNgn: 2000,
      commissionNgn: 200,
      walletChargeNgn: 2000,
      fundingSource: 'CBA',
      commissionStatus: CbaTransferStatus.POSTED,
    });
    expect(result.ticketRefs).toHaveLength(4);

    const [sale, commission] = h.transfers;
    expect(sale).toMatchObject({
      purpose: CbaTransferPurpose.AGENT_SALE,
      from: { officeId: 1, clientId: 7, accountId: 70 },
      to: SALES,
      amountNgn: 2000,
      saleReference: result.saleReference,
      paymentTxnId: h.payments[0].txnId,
    });
    expect(commission).toMatchObject({
      purpose: CbaTransferPurpose.AGENT_COMMISSION,
      from: SALES,
      to: { officeId: 1, clientId: 7, accountId: 71 },
      amountNgn: 200,
      paymentTxnId: h.payments[0].txnId,
    });

    expect(h.payments[0]).toMatchObject({
      gateway: PaymentGateway.AGENT_CASH,
      status: PaymentStatus.CONFIRMED,
      amountNgn: 2000,
      gatewayReference: result.saleReference,
    });
    // The CBA does the accounting; nothing is posted to SureWina's ledger.
    expect(h.accounting.recordSaleInTransaction).not.toHaveBeenCalled();
  });

  it('refuses before anything moves when Float is short of the full value', async () => {
    // Enough for the net amount, not the gross: Float pays in full.
    const h = harness({ floatNgn: 1800 });

    await expect(h.service.sell('agent-1', dto)).rejects.toThrow(
      'Insufficient wallet balance',
    );
    expect(h.transfers).toHaveLength(0);
    expect(h.payments).toHaveLength(0);
  });

  it('issues nothing when the CBA refuses the float payment', async () => {
    const h = harness({ floatNgn: 100_000, outcomes: [CbaTransferStatus.FAILED] });

    await expect(h.service.sell('agent-1', dto)).rejects.toBeInstanceOf(ConflictException);
    expect(h.payments).toHaveLength(0);
    expect(h.tickets).toHaveLength(0);
  });

  it('issues nothing, and tells the agent not to hand over tickets, when the answer is uncertain', async () => {
    const h = harness({ floatNgn: 100_000, outcomes: [CbaTransferStatus.UNCERTAIN] });

    const error = await h.service.sell('agent-1', dto).catch((e) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).toContain('Do not hand over tickets');
    expect(h.payments).toHaveLength(0);
    expect(h.tickets).toHaveLength(0);
    expect(h.cbaTransfers.reverse).not.toHaveBeenCalled();
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGENT_SALE_PAYMENT_UNCERTAIN' }),
    );
  });

  it('returns the float if the draw closed while the CBA was answering', async () => {
    const h = harness({ floatNgn: 100_000 });
    h.cbaTransfers.execute.mockImplementationOnce(async (id: string) => {
      h.draw.cutoffAt = new Date(Date.now() - 1000);
      const row = h.transfers.find((t) => t.transferId === id)!;
      row.status = CbaTransferStatus.POSTED;
      return { ...row };
    });

    await expect(h.service.sell('agent-1', dto)).rejects.toThrow(
      'The float has been returned',
    );
    expect(h.cbaTransfers.reverse).toHaveBeenCalledTimes(1);
    expect(h.payments).toHaveLength(0);
    expect(h.tickets).toHaveLength(0);
  });

  it('flags the sale for support if the float cannot be returned', async () => {
    const h = harness({
      floatNgn: 100_000,
      outcomes: [CbaTransferStatus.POSTED, CbaTransferStatus.UNCERTAIN],
    });
    h.cbaTransfers.execute.mockImplementationOnce(async (id: string) => {
      h.draw.status = DrawStatus.SALES_CLOSED;
      const row = h.transfers.find((t) => t.transferId === id)!;
      row.status = CbaTransferStatus.POSTED;
      return { ...row };
    });
    h.cbaTransfers.reverse.mockImplementationOnce(async (original: Row) => ({
      ...original,
      purpose: CbaTransferPurpose.REVERSAL,
      status: CbaTransferStatus.UNCERTAIN,
    }));

    await expect(h.service.sell('agent-1', dto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGENT_SALE_FLOAT_RETURN_FAILED' }),
    );
  });

  it('keeps the sale when commission does not post — commission is owed, not a reason to undo it', async () => {
    const h = harness({
      floatNgn: 100_000,
      outcomes: [CbaTransferStatus.POSTED, CbaTransferStatus.FAILED],
    });

    const result = await h.service.sell('agent-1', dto);

    expect(result.ticketRefs).toHaveLength(4);
    expect(result.commissionStatus).toBe(CbaTransferStatus.FAILED);
    expect(h.cbaTransfers.reverse).not.toHaveBeenCalled();
    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGENT_COMMISSION_NOT_POSTED' }),
    );
  });

  it('does not return the float for a sale that actually committed', async () => {
    const h = harness({ floatNgn: 100_000 });
    const prisma = (h.service as any).prisma;
    const real = prisma.$transaction.getMockImplementation();
    prisma.$transaction.mockImplementation(async (fn: any) => {
      await real(fn);
      throw new Error('connection reset after commit');
    });

    const result = await h.service.sell('agent-1', dto);

    expect(result.ticketRefs).toHaveLength(4);
    expect(h.cbaTransfers.reverse).not.toHaveBeenCalled();
  });
});

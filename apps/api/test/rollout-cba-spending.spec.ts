import type { ConfigService } from '@nestjs/config';
import {
  CbaTransferPurpose,
  CbaTransferStatus,
  PurchasePricingContext,
  WalletPurchaseFundingSource,
  WalletPurchaseStatus,
} from '@prisma/client';

import { RolloutCheckService } from '../src/rollout/rollout-check.service';
import type { PrismaService } from '../src/database/prisma.service';

type Check = { status: string; summary: string; details?: unknown };

function service(prisma: Record<string, unknown>) {
  return new RolloutCheckService(
    prisma as unknown as PrismaService,
    {} as ConfigService,
  ) as unknown as Record<string, () => Promise<Check>>;
}

function cbaPurchase(overrides: Record<string, unknown> = {}) {
  return {
    purchaseId: 'p-1',
    buyerUserId: 'user-1',
    amountNgn: 1000,
    ticketCount: 2,
    completedAt: new Date(),
    holdId: null,
    hold: null,
    status: WalletPurchaseStatus.COMPLETED,
    pricingContext: PurchasePricingContext.NORMAL,
    fundingSource: WalletPurchaseFundingSource.CBA,
    tickets: [{ faceValueNgn: 500 }, { faceValueNgn: 500 }],
    cbaTransfers: [
      { purpose: CbaTransferPurpose.WALLET_PURCHASE, status: CbaTransferStatus.POSTED, amountNgn: 300 },
      { purpose: CbaTransferPurpose.WALLET_PURCHASE, status: CbaTransferStatus.POSTED, amountNgn: 700 },
    ],
    ...overrides,
  };
}

function purchasesPrisma(rows: unknown[], pending = 0) {
  return {
    walletPurchase: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(pending),
    },
    walletHold: { count: jest.fn().mockResolvedValue(0) },
  };
}

describe('Rollout checks for CBA-funded spending', () => {
  it('accepts a CBA purchase whose posted transfers add up to it, with no ledger hold', async () => {
    const result = await service(purchasesPrisma([cbaPurchase()])).checkWalletPurchases();
    expect(result.status).toBe('PASS');
  });

  it.each([
    ['transfers short of the purchase', { cbaTransfers: [
      { purpose: CbaTransferPurpose.WALLET_PURCHASE, status: CbaTransferStatus.POSTED, amountNgn: 300 },
    ] }],
    ['a transfer that never posted', { cbaTransfers: [
      { purpose: CbaTransferPurpose.WALLET_PURCHASE, status: CbaTransferStatus.POSTED, amountNgn: 300 },
      { purpose: CbaTransferPurpose.WALLET_PURCHASE, status: CbaTransferStatus.UNCERTAIN, amountNgn: 700 },
    ] }],
    ['money sent back on a completed purchase', { cbaTransfers: [
      { purpose: CbaTransferPurpose.WALLET_PURCHASE, status: CbaTransferStatus.POSTED, amountNgn: 1000 },
      { purpose: CbaTransferPurpose.REVERSAL, status: CbaTransferStatus.POSTED, amountNgn: 1000 },
    ] }],
    ['a missing ticket', { tickets: [{ faceValueNgn: 500 }] }],
  ])('blocks a CBA purchase with %s', async (_label, overrides) => {
    const result = await service(purchasesPrisma([cbaPurchase(overrides)])).checkWalletPurchases();
    expect(result.status).toBe('BLOCKER');
  });

  it('blocks while any purchase is pending or awaiting review', async () => {
    const prisma = purchasesPrisma([], 1);
    const result = await service(prisma).checkWalletPurchases();
    expect(result.status).toBe('BLOCKER');
    expect(prisma.walletPurchase.count).toHaveBeenCalledWith({
      where: {
        status: {
          in: [WalletPurchaseStatus.PENDING, WalletPurchaseStatus.REVIEW_REQUIRED],
        },
      },
    });
  });

  function salesPrisma(sale: Record<string, unknown>) {
    return {
      paymentTransaction: { findMany: jest.fn().mockResolvedValue([sale]) },
      ledgerTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
  }

  const floatSale = {
    txnId: 'txn-1',
    agentId: 'agent-1',
    amountNgn: 2000,
    collectionLedgerTxn: null,
    cbaTransfers: [{ status: CbaTransferStatus.POSTED, amountNgn: 2000 }],
  };

  it('accepts an agent sale paid in full from Float, with no ledger journal', async () => {
    const result = await service(salesPrisma(floatSale)).checkAgentSales();
    expect(result.status).toBe('PASS');
    expect(result.summary).toContain('1 CBA float-funded sale');
  });

  it('blocks a Float sale that was paid net of commission', async () => {
    const result = await service(
      salesPrisma({ ...floatSale, cbaTransfers: [{ status: CbaTransferStatus.POSTED, amountNgn: 1800 }] }),
    ).checkAgentSales();
    expect(result.status).toBe('BLOCKER');
  });

  it('blocks a confirmed sale whose float transfer is not posted', async () => {
    const result = await service(
      salesPrisma({ ...floatSale, cbaTransfers: [{ status: CbaTransferStatus.UNCERTAIN, amountNgn: 2000 }] }),
    ).checkAgentSales();
    expect(result.status).toBe('BLOCKER');
  });

  function prizePrisma(claim: Record<string, unknown>) {
    return {
      prizeClaim: { findMany: jest.fn().mockResolvedValue([claim]) },
    };
  }

  const agentPaidClaim = {
    claimId: 'claim-9',
    paidByAgentId: 'agent-1',
    netPrizeValueNgn: 20_000,
    agentPayoutLedgerTxn: null,
    cbaTransfers: [{ amountNgn: 20_000, wallet: { agentId: 'agent-1' } }],
  };

  it('accepts an agent prize reimbursed into CBA Earnings, with no ledger journal', async () => {
    const result = await service(prizePrisma(agentPaidClaim)).checkAgentPrizeReimbursements();
    expect(result.status).toBe('PASS');
    expect(result.summary).toContain('1 CBA Earnings reimbursement');
  });

  it.each([
    ['the wrong amount', { cbaTransfers: [{ amountNgn: 19_000, wallet: { agentId: 'agent-1' } }] }],
    ['the wrong agent', { cbaTransfers: [{ amountNgn: 20_000, wallet: { agentId: 'agent-2' } }] }],
  ])('blocks a CBA prize reimbursement to %s', async (_label, overrides) => {
    const result = await service(
      prizePrisma({ ...agentPaidClaim, ...overrides }),
    ).checkAgentPrizeReimbursements();
    expect(result.status).toBe('BLOCKER');
  });

  it('passes when every CBA transfer is settled', async () => {
    const result = await service({
      cbaTransfer: { findMany: jest.fn().mockResolvedValue([]) },
    }).checkCbaTransfers();
    expect(result.status).toBe('PASS');
  });

  it('blocks on uncertain, stuck or owed transfers', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { transferId: 't-1', purpose: CbaTransferPurpose.AGENT_COMMISSION, status: CbaTransferStatus.FAILED },
    ]);
    const result = await service({ cbaTransfer: { findMany } }).checkCbaTransfers();

    expect(result.status).toBe('BLOCKER');
    const where = findMany.mock.calls[0][0].where.OR;
    expect(where).toEqual(
      expect.arrayContaining([
        { status: CbaTransferStatus.UNCERTAIN },
        expect.objectContaining({ status: CbaTransferStatus.SENDING }),
        expect.objectContaining({
          status: CbaTransferStatus.FAILED,
          purpose: { in: [CbaTransferPurpose.AGENT_COMMISSION, CbaTransferPurpose.PRIZE_REIMBURSEMENT, CbaTransferPurpose.REVERSAL] },
        }),
      ]),
    );
  });
});

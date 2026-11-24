import { ConfigService } from '@nestjs/config';
import { ReconciliationIssueStatus, TreasuryProvider } from '@prisma/client';

import type { PrismaService } from '../src/database/prisma.service';
import type { LedgerService } from '../src/ledger/ledger.service';
import { TreasuryReconciliationService } from '../src/treasury/treasury-reconciliation.service';
import { TreasuryRecoveryService } from '../src/treasury/treasury-recovery.service';
import type { TreasurySettlementService } from '../src/treasury/treasury-settlement.service';
import type { TreasuryProviderService } from '../src/treasury/treasury-provider.service';

// Monnify balance variances: no hourly comparison against a sandbox wallet,
// and no new CRITICAL issue for a variance that is already open.

function config(values: Record<string, string>) {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('Treasury recovery: Monnify balance check', () => {
  const monnify = { MONNIFY_API_KEY: 'k', MONNIFY_SECRET_KEY: 's', MONNIFY_SOURCE_ACCOUNT_NUMBER: '6397728296' };

  async function tick(values: Record<string, string>) {
    const reconciliation = {
      snapshotProviderBalance: jest.fn(async () => undefined),
      reconcileTransactions: jest.fn(async () => undefined),
    };
    const prisma = { reconciliationRun: { findFirst: jest.fn(async () => ({ runId: 'done' })) } };
    const svc = new TreasuryRecoveryService(
      prisma as unknown as PrismaService,
      config(values),
      {} as TreasurySettlementService,
      reconciliation as unknown as TreasuryReconciliationService,
    );
    await (svc as unknown as { tick: () => Promise<void> }).tick();
    return reconciliation;
  }

  it('skips the balance comparison while Monnify is on sandbox', async () => {
    const r = await tick({ ...monnify, MONNIFY_BASE_URL: 'https://sandbox.monnify.com' });
    expect(r.snapshotProviderBalance).not.toHaveBeenCalled();
  });

  it('compares the balance once Monnify is live', async () => {
    const r = await tick({ ...monnify, MONNIFY_BASE_URL: 'https://api.monnify.com' });
    expect(r.snapshotProviderBalance).toHaveBeenCalledWith(TreasuryProvider.MONNIFY);
  });
});

describe('Treasury reconciliation: repeated balance variance', () => {
  function setup(openIssue: { issueId: string } | null, bookNgn = 0) {
    const created: unknown[] = [];
    const findFirst = jest.fn(async () => openIssue);
    const tx = {
      reconciliationRun: { create: jest.fn(async ({ data }: any) => ({ runId: 'run-1', ...data, startedAt: new Date(), createdAt: new Date(), updatedAt: new Date() })) },
      treasuryBalanceSnapshot: { create: jest.fn(async () => undefined) },
      reconciliationIssue: {
        findFirst,
        create: jest.fn(async ({ data }: any) => {
          created.push(data);
          return data;
        }),
      },
    };
    const prisma = {
      treasuryAccount: { findUniqueOrThrow: jest.fn(async () => ({ treasuryAccountId: 't1', code: 'TRSY:MONNIFY:PAYOUT', ledgerAccountId: 'l1' })) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const ledger = { getAccountBalance: jest.fn(async () => ({ balanceNgn: bookNgn })) };
    const providers = { monnifyPayoutBalance: jest.fn(async () => ({ availableBalanceMinor: 500000000000n, raw: {} })) };
    const svc = new TreasuryReconciliationService(
      prisma as unknown as PrismaService,
      ledger as unknown as LedgerService,
      providers as unknown as TreasuryProviderService,
    );
    return { svc, created, findFirst, tx };
  }

  it('opens a CRITICAL issue for a new variance', async () => {
    const { svc, created, findFirst, tx } = setup(null);
    const r = await svc.snapshotProviderBalance(TreasuryProvider.MONNIFY);
    expect(r.varianceMinor).toBe('500000000000');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ severity: 'CRITICAL', type: 'BALANCE_VARIANCE', expectedAmountMinor: 0n, actualAmountMinor: 500000000000n });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ReconciliationIssueStatus.OPEN, expectedAmountMinor: 0n, actualAmountMinor: 500000000000n }),
      }),
    );
    expect(tx.treasuryBalanceSnapshot.create).toHaveBeenCalled();
  });

  it('records the snapshot but no new issue when the same variance is already open', async () => {
    const { svc, created, tx } = setup({ issueId: 'existing' });
    await svc.snapshotProviderBalance(TreasuryProvider.MONNIFY);
    expect(created).toHaveLength(0);
    expect(tx.treasuryBalanceSnapshot.create).toHaveBeenCalled();
    expect(tx.reconciliationRun.create).toHaveBeenCalled();
  });

  it('does not look for an open issue when the balance matches', async () => {
    const { svc, created, findFirst } = setup(null, 5_000_000_000);
    await svc.snapshotProviderBalance(TreasuryProvider.MONNIFY);
    expect(findFirst).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });
});

import type { ConfigService } from '@nestjs/config';
import {
  CbaReconciliationStatus,
  CbaTransferPurpose,
  CbaTransferStatus,
  CbaWithdrawalStatus,
  LedgerOwnerType,
  WitmangoWalletPurpose,
} from '@prisma/client';

import { CbaReconciliationService } from '../src/reconciliation/cba-reconciliation.service';
import { CbaRecoveryService } from '../src/reconciliation/cba-recovery.service';
import { WitmangoTransferService } from '../src/integrations/witmango/witmango-transfer.service';
import { RolloutCheckService } from '../src/rollout/rollout-check.service';
import type { WitmangoClientService } from '../src/integrations/witmango/witmango-client.service';
import type { TreasuryProviderService } from '../src/treasury/treasury-provider.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { RedisService } from '../src/redis/redis.service';
import type { CbaWithdrawalService } from '../src/withdrawals/cba-withdrawal.service';

type Row = Record<string, any>;

const SALES_ID = 900;
const PENDING_ID = 950;

// Balances in naira, by CBA savings account ID.
type Scenario = {
  vaultNgn?: number | Error;
  balances?: Record<number, number | Error>;
  inactive?: number[];
  links?: Array<{ savingsAccountId: number; ownerType: LedgerOwnerType; purpose: WitmangoWalletPurpose }>;
  uncreditedNgn?: number;
  uncreditedCount?: number;
  paidUnsettledNgn?: number;
  lockedNgn?: number;
  reviewWithdrawals?: number;
  config?: Record<string, unknown>;
};

const LINKS = [
  { savingsAccountId: 10, ownerType: LedgerOwnerType.CUSTOMER, purpose: WitmangoWalletPurpose.DEPOSIT },
  { savingsAccountId: 11, ownerType: LedgerOwnerType.CUSTOMER, purpose: WitmangoWalletPurpose.WINNINGS },
  { savingsAccountId: 70, ownerType: LedgerOwnerType.AGENT, purpose: WitmangoWalletPurpose.FLOAT },
  { savingsAccountId: 71, ownerType: LedgerOwnerType.AGENT, purpose: WitmangoWalletPurpose.EARNINGS },
];

function harness(s: Scenario = {}) {
  const balances: Record<number, number | Error> = {
    10: 200_000,
    11: 100_000,
    70: 250_000,
    71: 50_000,
    [SALES_ID]: 300_000,
    [PENDING_ID]: 50_000,
    ...s.balances,
  };

  const created: Row[] = [];

  const prisma = {
    witmangoWalletLink: {
      findMany: jest.fn(async () =>
        (s.links ?? LINKS).map((l) => ({
          walletId: `wallet-${l.savingsAccountId}`,
          purpose: l.purpose,
          savingsAccountId: l.savingsAccountId,
          wallet: { ownerType: l.ownerType },
        })),
      ),
    },
    walletFunding: {
      aggregate: jest.fn(async () => ({
        _sum: { amountNgn: s.uncreditedNgn ?? null },
        _count: s.uncreditedCount ?? (s.uncreditedNgn ? 1 : 0),
      })),
    },
    cbaWithdrawal: {
      aggregate: jest.fn(async ({ where }: { where: Row }) =>
        where.status === CbaWithdrawalStatus.PAID
          ? { _sum: { amountNgn: s.paidUnsettledNgn ?? null }, _count: s.paidUnsettledNgn ? 1 : 0 }
          : { _sum: { amountNgn: s.lockedNgn ?? 50_000 } },
      ),
      count: jest.fn(async () => s.reviewWithdrawals ?? 0),
    },
    cbaTransfer: { count: jest.fn(async () => 0) },
    cbaReconciliationRun: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = { runId: `run-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      }),
    },
  };

  const witmango = {
    getSavingsAccount: jest.fn(async (id: number) => {
      const value = balances[id];
      if (value instanceof Error || value === undefined) throw value ?? new Error('no account');
      return {
        status: { id: s.inactive?.includes(id) ? 600 : 300 },
        summary: { accountBalance: value, availableBalance: value },
      };
    }),
  };

  const treasury = {
    monnifyPayoutBalance: jest.fn(async () => {
      if (s.vaultNgn instanceof Error) throw s.vaultNgn;
      return {
        currency: 'NGN',
        ledgerBalanceMinor: BigInt(Math.round((s.vaultNgn ?? 1_000_000) * 100)),
      };
    }),
  };

  const config: Record<string, unknown> = {
    WITMANGO_SALES_ACCOUNT_ID: SALES_ID,
    WITMANGO_PENDING_WITHDRAWALS_ACCOUNT_ID: PENDING_ID,
    CBA_RECONCILIATION_TOLERANCE_NGN: 0,
    ...s.config,
  };

  const service = new CbaReconciliationService(
    prisma as unknown as PrismaService,
    { write: jest.fn(async () => undefined) } as unknown as AuditService,
    { get: (k: string) => config[k] } as unknown as ConfigService,
    witmango as unknown as WitmangoClientService,
    treasury as unknown as TreasuryProviderService,
  );

  return { service, created, prisma, witmango };
}

const codes = (run: { issues: Array<{ code: string }> }) => run.issues.map((i) => i.code);

describe('Phase 11: vault-against-book reconciliation', () => {
  it('passes when the vault covers everything owed and Pending Withdrawals agrees', async () => {
    const h = harness();

    const run = await h.service.run('schedule');

    // owners 600k + pending 50k = 650k owed; vault 1m.
    expect(run).toMatchObject({
      status: CbaReconciliationStatus.PASS,
      vaultNgn: 1_000_000,
      ownersNgn: 600_000,
      salesNgn: 300_000,
      pendingWithdrawalsNgn: 50_000,
      obligationsNgn: 650_000,
      coverageNgn: 350_000,
      // coverage less SureWina's own sales money
      unexplainedNgn: 50_000,
      accountsRead: 4,
      accountsFailed: 0,
    });
    // The remaining difference is reported, not failed.
    expect(codes(run)).toEqual(['VAULT_BOOK_DIFFERENCE']);
  });

  it('raises nothing when the difference is within tolerance', async () => {
    const h = harness({ config: { CBA_RECONCILIATION_TOLERANCE_NGN: 50_000 } });
    const run = await h.service.run('schedule');
    expect(run.status).toBe(CbaReconciliationStatus.PASS);
    expect(run.issues).toHaveLength(0);
  });

  it('flags a shortfall when the vault holds less than is owed', async () => {
    const h = harness({ vaultNgn: 500_000 });

    const run = await h.service.run('schedule');

    expect(run.status).toBe(CbaReconciliationStatus.SHORTFALL);
    expect(run.coverageNgn).toBe(-150_000);
    expect(run.issues.find((i) => i.code === 'COVERAGE_SHORTFALL')?.severity).toBe('CRITICAL');
  });

  it('counts money in transit: uncredited top-ups are owed, paid withdrawals are not', async () => {
    const h = harness({
      uncreditedNgn: 20_000,
      paidUnsettledNgn: 10_000,
      balances: { [PENDING_ID]: 60_000 },
      lockedNgn: 60_000,
    });

    const run = await h.service.run('schedule');

    // 600k + 60k − 10k + 20k
    expect(run.obligationsNgn).toBe(670_000);
    expect(run.coverageNgn).toBe(330_000);
    expect(codes(run)).toEqual(
      expect.arrayContaining(['TOP_UPS_NOT_CREDITED', 'WITHDRAWALS_NOT_SETTLED']),
    );
  });

  it('flags Pending Withdrawals holding more or less than unfinished withdrawals explain', async () => {
    const h = harness({ balances: { [PENDING_ID]: 70_000 }, lockedNgn: 50_000 });

    const run = await h.service.run('schedule');

    expect(run.status).toBe(CbaReconciliationStatus.MISMATCH);
    const issue = run.issues.find((i) => i.code === 'PENDING_WITHDRAWALS_MISMATCH');
    expect(issue?.severity).toBe('CRITICAL');
    expect(issue?.detail).toMatchObject({ differenceNgn: 20_000 });
  });

  it('softens that mismatch to a warning while withdrawals are under review', async () => {
    const h = harness({ balances: { [PENDING_ID]: 70_000 }, lockedNgn: 50_000, reviewWithdrawals: 1 });
    const run = await h.service.run('schedule');
    expect(run.issues.find((i) => i.code === 'PENDING_WITHDRAWALS_MISMATCH')?.severity).toBe('WARNING');
  });

  it('never reads an unreadable account as zero', async () => {
    const h = harness({ balances: { 11: new Error('timeout') } });

    const run = await h.service.run('schedule');

    expect(run.status).toBe(CbaReconciliationStatus.INCOMPLETE);
    expect(run.accountsFailed).toBe(1);
    expect(codes(run)).toContain('ACCOUNTS_UNREADABLE');
    // No coverage verdict is drawn from partial numbers.
    expect(codes(run)).not.toContain('COVERAGE_SHORTFALL');
  });

  it('is incomplete when the vault cannot be read', async () => {
    const h = harness({ vaultNgn: new Error('Monnify down') });
    const run = await h.service.run('schedule');
    expect(run.status).toBe(CbaReconciliationStatus.INCOMPLETE);
    expect(codes(run)).toContain('VAULT_UNREADABLE');
  });

  it('is incomplete when SureWina’s own accounts are not configured', async () => {
    const h = harness({ config: { WITMANGO_SALES_ACCOUNT_ID: undefined } });
    const run = await h.service.run('schedule');
    expect(run.status).toBe(CbaReconciliationStatus.INCOMPLETE);
    expect(codes(run)).toContain('SALES_ACCOUNT_UNREADABLE');
  });

  it('flags an overdrawn account, and one the CBA no longer shows as active', async () => {
    const h = harness({ balances: { 10: -500 }, inactive: [70] });

    const run = await h.service.run('schedule');

    expect(run.status).toBe(CbaReconciliationStatus.MISMATCH);
    expect(codes(run)).toEqual(expect.arrayContaining(['NEGATIVE_BALANCE', 'ACCOUNT_NOT_ACTIVE']));
  });

  it('keeps kobo exact on balances far above what a 32-bit column holds', async () => {
    const h = harness({
      vaultNgn: 750_000_000.55,
      balances: { 10: 400_000_000.25, 11: 0, 70: 0, 71: 0, [SALES_ID]: 0, [PENDING_ID]: 0 },
      lockedNgn: 0,
    });

    await h.service.run('schedule');

    expect(h.created[0].vaultKobo).toBe(75_000_000_055n);
    expect(h.created[0].ownersKobo).toBe(40_000_000_025n);
    expect(h.created[0].coverageKobo).toBe(35_000_000_030n);
  });
});

describe('Phase 11: retry sweep and schedule', () => {
  function sweepHarness(opts: { lock?: string | null; owed?: Row[]; waiting?: Row[]; hasRun?: boolean } = {}) {
    const prisma = {
      cbaWithdrawal: { findMany: jest.fn(async () => opts.waiting ?? []) },
      cbaTransfer: { findMany: jest.fn(async (_args: { where: Row }) => opts.owed ?? []) },
    };
    const redis = {
      getClient: () => ({ set: jest.fn(async () => (opts.lock === undefined ? 'OK' : opts.lock)) }),
    };
    const transfers = { execute: jest.fn(), retryOwed: jest.fn() };
    const withdrawals = { refresh: jest.fn() };
    const reconciliation = {
      hasScheduledRunToday: jest.fn(async () => opts.hasRun ?? false),
      watDate: () => '2026-11-15',
      run: jest.fn(async () => ({})),
    };
    const service = new CbaRecoveryService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      { get: (k: string) => (k === 'CBA_RECONCILIATION_HOUR_WAT' ? 6 : undefined) } as unknown as ConfigService,
      transfers as unknown as WitmangoTransferService,
      withdrawals as unknown as CbaWithdrawalService,
      reconciliation as unknown as CbaReconciliationService,
    );
    return { service, prisma, transfers, withdrawals, reconciliation };
  }

  it('moves on waiting withdrawals and sends owed payments', async () => {
    const h = sweepHarness({
      waiting: [{ withdrawalId: 'w-1' }],
      owed: [
        { transferId: 't-pending', status: CbaTransferStatus.PENDING },
        { transferId: 't-failed', status: CbaTransferStatus.FAILED },
      ],
    });

    const result = await h.service.sweep();

    expect(result).toEqual({ withdrawals: 1, transfers: 2 });
    expect(h.withdrawals.refresh).toHaveBeenCalledWith('w-1');
    expect(h.transfers.execute).toHaveBeenCalledWith('t-pending');
    expect(h.transfers.retryOwed).toHaveBeenCalledWith('t-failed');
  });

  it('only ever retries owed payments, and only refusals where nothing was sent', async () => {
    const h = sweepHarness();
    await h.service.sweep();

    const where = h.prisma.cbaTransfer.findMany.mock.calls[0][0].where;
    expect(where.purpose).toEqual({
      in: [CbaTransferPurpose.AGENT_COMMISSION, CbaTransferPurpose.PRIZE_REIMBURSEMENT],
    });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: CbaTransferStatus.FAILED, failureReason: 'CBA_UNAVAILABLE' }),
      ]),
    );
    expect(JSON.stringify(where)).not.toContain('UNCERTAIN');
  });

  it('does nothing when another instance holds the lock', async () => {
    const h = sweepHarness({ lock: null, waiting: [{ withdrawalId: 'w-1' }] });
    expect(await h.service.sweep()).toEqual({ withdrawals: 0, transfers: 0 });
    expect(h.withdrawals.refresh).not.toHaveBeenCalled();
  });

  it('runs the daily reconciliation once the hour has passed, and only once', async () => {
    const before = Date.parse('2026-11-15T04:30:00Z'); // 05:30 WAT
    const after = Date.parse('2026-11-15T05:30:00Z'); // 06:30 WAT

    const h = sweepHarness();
    expect(await h.service.maybeReconcile(before)).toBe(false);
    expect(await h.service.maybeReconcile(after)).toBe(true);
    expect(h.reconciliation.run).toHaveBeenCalledWith('schedule');

    const done = sweepHarness({ hasRun: true });
    expect(await done.service.maybeReconcile(after)).toBe(false);
    expect(done.reconciliation.run).not.toHaveBeenCalled();
  });
});

describe('Owed transfer retry', () => {
  it('re-sends only a refused commission or prize reimbursement', async () => {
    const updateMany = jest.fn(async (_args: unknown) => ({ count: 0 }));
    const service = new WitmangoTransferService(
      { cbaTransfer: { updateMany } } as unknown as PrismaService,
      {} as WitmangoClientService,
      { get: () => undefined } as unknown as ConfigService,
    );

    await expect(service.retryOwed('t-1')).rejects.toThrow(
      'Only a refused commission or prize reimbursement can be retried',
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        transferId: 't-1',
        status: CbaTransferStatus.FAILED,
        purpose: { in: [CbaTransferPurpose.AGENT_COMMISSION, CbaTransferPurpose.PRIZE_REIMBURSEMENT] },
      },
      data: { status: CbaTransferStatus.PENDING, failureReason: null },
    });
  });
});

describe('Rollout gate: CBA reconciliation', () => {
  function check(config: Record<string, unknown>, latest: Row | null) {
    const service = new RolloutCheckService(
      { cbaReconciliationRun: { findFirst: jest.fn(async () => latest) } } as unknown as PrismaService,
      { get: (k: string) => config[k] } as unknown as ConfigService,
    ) as unknown as { checkCbaReconciliation(): Promise<{ status: string }> };
    return service.checkCbaReconciliation();
  }

  it('passes while CBA money movement is switched off', async () => {
    expect((await check({}, null)).status).toBe('PASS');
  });

  it('blocks once in use without a recent run', async () => {
    expect((await check({ WALLET_WITHDRAWALS_ENABLED: true }, null)).status).toBe('BLOCKER');
  });

  it('blocks on a recent run that did not pass', async () => {
    const latest = { runId: 'r', status: 'SHORTFALL', completedAt: new Date(), coverageKobo: -100n };
    expect((await check({ WITMANGO_WALLET_SPENDING_ENABLED: true }, latest)).status).toBe('BLOCKER');
  });

  it('passes on a recent passing run', async () => {
    const latest = { runId: 'r', status: 'PASS', completedAt: new Date(), coverageKobo: 100n };
    expect((await check({ WITMANGO_WALLET_SPENDING_ENABLED: true }, latest)).status).toBe('PASS');
  });
});

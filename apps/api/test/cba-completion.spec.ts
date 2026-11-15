import type { ConfigService } from '@nestjs/config';
import {
  CbaBalanceMigrationStatus,
  CbaTransferPurpose,
  CbaTransferStatus,
  CbaWithdrawalStatus,
  LedgerOwnerType,
  WalletPurchaseFundingSource,
  WalletPurchaseStatus,
  WitmangoWalletPurpose,
} from '@prisma/client';
import { createHash } from 'crypto';

import { WitmangoBalanceService } from '../src/integrations/witmango/witmango-balance.service';
import { FundingAccountService } from '../src/onboarding/funding-account.service';
import { CbaTransferResolutionService } from '../src/reconciliation/cba-transfer-resolution.service';
import { CbaBalanceMigrationService } from '../src/reconciliation/cba-balance-migration.service';
import {
  WitmangoClientService,
  WitmangoUncertainOutcomeError,
} from '../src/integrations/witmango/witmango-client.service';
import type { WitmangoWalletLinkService } from '../src/integrations/witmango/witmango-wallet-link.service';
import type { WitmangoTransferService } from '../src/integrations/witmango/witmango-transfer.service';
import type { CbaWithdrawalService } from '../src/withdrawals/cba-withdrawal.service';
import type { PrizeWalletCreditService } from '../src/claims/prize-wallet-credit.service';
import type { WalletService } from '../src/wallet/wallet.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';

type Row = Record<string, any>;
const audit = { write: jest.fn(async () => undefined) } as unknown as AuditService;

describe('CBA balances', () => {
  function harness(state: string, ownerType: LedgerOwnerType, read: (id: number) => unknown) {
    const links =
      ownerType === LedgerOwnerType.CUSTOMER
        ? [
            { purpose: WitmangoWalletPurpose.DEPOSIT, savingsAccountId: 10 },
            { purpose: WitmangoWalletPurpose.WINNINGS, savingsAccountId: 11 },
          ]
        : [
            { purpose: WitmangoWalletPurpose.EARNINGS, savingsAccountId: 71 },
            { purpose: WitmangoWalletPurpose.FLOAT, savingsAccountId: 70 },
          ];

    return new WitmangoBalanceService(
      {
        wallet: { findUnique: async () => ({ ownerType }) },
        witmangoWalletLink: { findMany: async () => links },
      } as unknown as PrismaService,
      { getSavingsAccount: jest.fn(async (id: number) => read(id)) } as unknown as WitmangoClientService,
      { getState: async () => state } as unknown as WitmangoWalletLinkService,
    );
  }

  const balance = (n: number) => ({ summary: { availableBalance: n, accountBalance: n } });

  it('reads a customer’s Deposit and Winnings; only Winnings is withdrawable', async () => {
    const view = await harness('READY', LedgerOwnerType.CUSTOMER, (id) => balance(id === 10 ? 3_000 : 7_000)).getBalances('w');

    expect(view).toMatchObject({ state: 'READY', available: true, spendableNgn: 10_000, withdrawableNgn: 7_000 });
  });

  it('counts only Float as spendable for an agent, and only Earnings as withdrawable', async () => {
    const view = await harness('READY', LedgerOwnerType.AGENT, (id) => balance(id === 70 ? 50_000 : 4_000)).getBalances('w');

    expect(view).toMatchObject({ spendableNgn: 50_000, withdrawableNgn: 4_000 });
  });

  it('says "unavailable" rather than showing zero when the CBA cannot be read', async () => {
    const view = await harness('READY', LedgerOwnerType.CUSTOMER, () => {
      throw new Error('timeout');
    }).getBalances('w');

    expect(view).toMatchObject({ available: false, spendableNgn: null, withdrawableNgn: null });
  });

  it('returns no balances before the wallet is ready', async () => {
    const view = await harness('IN_PROGRESS', LedgerOwnerType.CUSTOMER, () => balance(1)).getBalances('w');
    expect(view).toMatchObject({ state: 'IN_PROGRESS', accounts: [] });
  });
});

describe('Agent funding accounts', () => {
  const BVN = '22212345678';

  function harness(config: Record<string, unknown> = { MONNIFY_AGENT_LIMIT_PROFILE_CODE: 'AGT-LIMITS' }) {
    const rows: Row[] = [];
    const monnify = {
      isEnabled: () => true,
      reserve: jest.fn(async () => ({
        outcome: 'RESERVED',
        reservationReference: 'res-1',
        accounts: [{ bankCode: '50515', bankName: 'Moniepoint', accountNumber: '6000000001' }],
      })),
      find: jest.fn(),
    };
    const prisma = {
      agent: {
        findUnique: async () => ({
          agentId: 'agent-1',
          fullName: 'Ada  Okafor',
          email: null,
          phoneNumber: '+2348000000009',
          bvnHash: createHash('sha256').update(BVN).digest('hex'),
        }),
      },
      walletReservedAccount: {
        findUnique: jest.fn(async () => rows[0] ?? null),
        create: jest.fn(async ({ data }: { data: Row }) => {
          rows.push({ ...data });
          return rows[0];
        }),
        update: jest.fn(async ({ data }: { data: Row }) => Object.assign(rows[0], data)),
      },
    };
    const service = new FundingAccountService(
      prisma as never,
      monnify as never,
      {} as never,
      { getState: async () => 'READY' } as never,
      { get: (k: string) => config[k] } as unknown as ConfigService,
      audit,
    );
    return { service, monnify, rows };
  }

  it('reserves a Float funding account with the agent limit profile once the BVN matches', async () => {
    const h = harness();

    const view = await h.service.ensureForAgent({ agentId: 'agent-1', walletId: 'w-1', bvn: BVN });

    expect(view.status).toBe('READY');
    expect(view.accounts[0]).toMatchObject({ accountNumber: '6000000001', accountName: 'Ada Okafor' });
    expect(h.monnify.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        limitProfileCode: 'AGT-LIMITS',
        bvn: BVN,
        customerEmail: '2348000000009@buyers.surewina.ng',
      }),
    );
  });

  it('refuses a BVN that does not match the agent’s onboarding record, before calling Monnify', async () => {
    const h = harness();
    await expect(
      h.service.ensureForAgent({ agentId: 'agent-1', walletId: 'w-1', bvn: '22299999999' }),
    ).rejects.toThrow('does not match');
    expect(h.monnify.reserve).not.toHaveBeenCalled();
  });

  it('issues nothing without an agent limit profile', async () => {
    const h = harness({});
    const view = await h.service.ensureForAgent({ agentId: 'agent-1', walletId: 'w-1', bvn: BVN });
    expect(view.status).toBe('NOT_AVAILABLE');
    expect(h.monnify.reserve).not.toHaveBeenCalled();
  });
});

describe('Resolving unclear CBA transfers', () => {
  function harness(transfers: Row[], extra: Row = {}) {
    const purchase: Row = {
      purchaseId: 'p-1',
      fundingSource: WalletPurchaseFundingSource.CBA,
      status: WalletPurchaseStatus.REVIEW_REQUIRED,
      ...extra.purchase,
    };

    const find = (id: string) => transfers.find((t) => t.transferId === id);

    const prisma = {
      cbaTransfer: {
        findUnique: jest.fn(async ({ where }: { where: Row }) => find(where.transferId) ?? null),
        findUniqueOrThrow: jest.fn(async ({ where }: { where: Row }) => ({ ...find(where.transferId) })),
        updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
          const matches = transfers.filter(
            (t) =>
              (!where.transferId || t.transferId === where.transferId) &&
              (!where.walletPurchaseId || t.walletPurchaseId === where.walletPurchaseId) &&
              (!where.purpose || t.purpose === where.purpose) &&
              (typeof where.status === 'string' ? t.status === where.status : where.status.in.includes(t.status)),
          );
          matches.forEach((t) => Object.assign(t, data));
          return { count: matches.length };
        }),
        findMany: jest.fn(async () => transfers.filter((t) => t.walletPurchaseId === 'p-1')),
      },
      walletPurchase: {
        findUnique: jest.fn(async () => purchase),
        updateMany: jest.fn(async ({ data }: { data: Row }) => {
          Object.assign(purchase, data);
          return { count: 1 };
        }),
      },
      cbaWithdrawal: { findFirst: jest.fn(async () => ({ withdrawalId: 'wd-1' })) },
    };

    const reversals: Row[] = [];
    const cbaTransfers = {
      reverse: jest.fn(async (original: Row) => {
        const row = {
          transferId: `rev-${original.transferId}`,
          purpose: CbaTransferPurpose.REVERSAL,
          reversesTransferId: original.transferId,
          status: extra.reversalOutcome ?? CbaTransferStatus.POSTED,
        };
        reversals.push(row);
        return row;
      }),
      retryReturn: jest.fn(async (id: string) => ({ transferId: id, status: CbaTransferStatus.POSTED })),
      execute: jest.fn(async (id: string) => ({ ...find(id), status: CbaTransferStatus.POSTED })),
    };

    const withdrawals = {
      continueAfterLockResolved: jest.fn(async () => ({ status: CbaWithdrawalStatus.SUCCEEDED })),
      continueAfterRestoreResolved: jest.fn(async () => ({ status: CbaWithdrawalStatus.RESTORED })),
    };
    const prizes = { settleAfterResolution: jest.fn(async () => ({ claimId: 'c-1', status: 'CASH_PAID' })) };

    const service = new CbaTransferResolutionService(
      prisma as unknown as PrismaService,
      audit,
      cbaTransfers as unknown as WitmangoTransferService,
      withdrawals as unknown as CbaWithdrawalService,
      prizes as unknown as PrizeWalletCreditService,
    );

    return { service, purchase, cbaTransfers, withdrawals, prizes, reversals, transfers };
  }

  const note = 'Checked Witmango transaction history for the account';
  const leg = (overrides: Row): Row => ({
    transferId: 'leg-1',
    purpose: CbaTransferPurpose.WALLET_PURCHASE,
    status: CbaTransferStatus.UNCERTAIN,
    walletPurchaseId: 'p-1',
    updatedAt: new Date(),
    ...overrides,
  });

  it('refunds a purchase whose uncertain payment turned out to have posted', async () => {
    const h = harness([leg({}), leg({ transferId: 'leg-2', status: CbaTransferStatus.PENDING })]);

    const out = await h.service.resolve('leg-1', 'admin-1', { outcome: 'POSTED', cbaTransferId: 99, note });

    expect(out.status).toBe(CbaTransferStatus.POSTED);
    expect(h.cbaTransfers.reverse).toHaveBeenCalledTimes(1);
    // The leg that was never sent is closed, never sent now.
    expect(h.transfers[1]).toMatchObject({ status: CbaTransferStatus.FAILED, failureReason: 'NOT_SENT' });
    expect(h.purchase).toMatchObject({ status: WalletPurchaseStatus.FAILED, failureReason: 'REFUNDED_AFTER_REVIEW' });
  });

  it('closes a purchase whose uncertain payment never posted, with nothing to refund', async () => {
    const h = harness([leg({})]);

    await h.service.resolve('leg-1', 'admin-1', { outcome: 'NOT_POSTED', note });

    expect(h.cbaTransfers.reverse).not.toHaveBeenCalled();
    expect(h.purchase.status).toBe(WalletPurchaseStatus.FAILED);
  });

  it('keeps the purchase in review while its refund has not posted', async () => {
    const h = harness([leg({})], { reversalOutcome: CbaTransferStatus.UNCERTAIN });

    await h.service.resolve('leg-1', 'admin-1', { outcome: 'POSTED', cbaTransferId: 99, note });

    expect(h.purchase.status).toBe(WalletPurchaseStatus.REVIEW_REQUIRED);
  });

  it('returns an agent’s float when an uncertain sale payment had posted', async () => {
    const h = harness([
      { transferId: 's-1', purpose: CbaTransferPurpose.AGENT_SALE, status: CbaTransferStatus.UNCERTAIN, paymentTxnId: null, saleReference: 'SW-AGT-1', updatedAt: new Date() },
    ]);

    const out = await h.service.resolve('s-1', 'admin-1', { outcome: 'POSTED', cbaTransferId: 5, note });

    expect(out.next).toMatchObject({ kind: 'AGENT_SALE', floatReturned: true });
  });

  it('hands a resolved withdrawal lock and a resolved prize credit to their owners', async () => {
    const w = harness([{ transferId: 'l-1', purpose: CbaTransferPurpose.WITHDRAWAL_LOCK, status: CbaTransferStatus.UNCERTAIN, updatedAt: new Date() }]);
    await w.service.resolve('l-1', 'admin-1', { outcome: 'POSTED', cbaTransferId: 7, note });
    expect(w.withdrawals.continueAfterLockResolved).toHaveBeenCalledWith('wd-1');

    const p = harness([{ transferId: 'pc-1', purpose: CbaTransferPurpose.PRIZE_CREDIT, status: CbaTransferStatus.UNCERTAIN, prizeClaimId: 'c-1', updatedAt: new Date() }]);
    await p.service.resolve('pc-1', 'admin-1', { outcome: 'NOT_POSTED', note });
    expect(p.prizes.settleAfterResolution).toHaveBeenCalledWith('c-1');
  });

  it('refuses to resolve a transfer whose outcome is already known', async () => {
    const h = harness([leg({ status: CbaTransferStatus.POSTED })]);
    await expect(
      h.service.resolve('leg-1', 'admin-1', { outcome: 'NOT_POSTED', note }),
    ).rejects.toThrow('Only a transfer with an unknown outcome');
  });

  it('refuses a transfer still being sent, until it is stale', async () => {
    const h = harness([leg({ status: CbaTransferStatus.SENDING, updatedAt: new Date() })]);
    await expect(
      h.service.resolve('leg-1', 'admin-1', { outcome: 'NOT_POSTED', note }),
    ).rejects.toThrow('unknown outcome');
  });

  it('requires evidence: a CBA ID for "posted", and a note either way', async () => {
    const h = harness([leg({})]);
    await expect(h.service.resolve('leg-1', 'admin-1', { outcome: 'POSTED', note })).rejects.toThrow('CBA transfer ID');
    await expect(h.service.resolve('leg-1', 'admin-1', { outcome: 'NOT_POSTED', note: 'short' })).rejects.toThrow('10 to 500');
  });
});

describe('Moving a ledger balance onto the CBA', () => {
  function harness(opts: { deposit?: jest.Mock; held?: number; available?: number; existing?: Row; found?: Row | null } = {}) {
    let migration: Row | null = opts.existing ?? null;
    const prisma: Row = {
      cbaBalanceMigration: {
        findUnique: jest.fn(async () => migration),
        findUniqueOrThrow: jest.fn(async () => migration),
        create: jest.fn(async ({ data }: { data: Row }) => {
          migration = { migrationId: 'm-1', status: CbaBalanceMigrationStatus.PENDING, createdAt: new Date(), creditedAt: null, failureReason: null, ...data };
          return migration;
        }),
        update: jest.fn(async ({ data }: { data: Row }) => Object.assign(migration!, data)),
      },
      ledgerAccount: {
        findUnique: jest.fn(async () => ({ accountId: 'bank-cash' })),
        findUniqueOrThrow: jest.fn(async () => ({ accountId: 'bank-cash' })),
      },
    };
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));

    const wallets = {
      getWallet: jest.fn(async () => ({ ownerType: LedgerOwnerType.CUSTOMER, availableNgn: opts.available ?? 4_500, heldNgn: opts.held ?? 0 })),
      debitInTransaction: jest.fn(async () => ({ ledgerTxnId: 'ltx-1' })),
      credit: jest.fn(async () => ({ journal: { ledgerTxnId: 'ltx-2' } })),
    };
    const witmango = {
      deposit: opts.deposit ?? jest.fn(async () => ({ transactionId: 321 })),
      findTransactionByReference: jest.fn(async () => opts.found ?? null),
    };

    const service = new CbaBalanceMigrationService(
      prisma as unknown as PrismaService,
      audit,
      wallets as unknown as WalletService,
      witmango as unknown as WitmangoClientService,
      {
        getState: async () => 'READY',
        getActiveAccount: async () => ({ clientId: 4, savingsAccountId: 10 }),
      } as unknown as WitmangoWalletLinkService,
    );
    return { service, wallets, witmango, get: () => migration };
  }

  it('debits the ledger, then deposits the same amount into the chosen CBA account', async () => {
    const h = harness();

    const view = await h.service.migrate('w-1', WitmangoWalletPurpose.DEPOSIT, 'admin-1');

    expect(view).toMatchObject({ status: CbaBalanceMigrationStatus.CREDITED, amountNgn: 4_500 });
    expect(h.wallets.debitInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ walletId: 'w-1', amountNgn: 4_500, counterAccountId: 'bank-cash' }),
    );
    expect(h.witmango.deposit).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 10, amountNgn: 4_500, reference: 'sw-mig-w-1' }),
    );
  });

  it('refuses an account purpose that does not belong to the owner', async () => {
    const h = harness();
    await expect(h.service.migrate('w-1', WitmangoWalletPurpose.FLOAT, 'admin-1')).rejects.toThrow('cannot go to FLOAT');
  });

  it('refuses while ledger holds are open, or with nothing to move', async () => {
    await expect(harness({ held: 100 }).service.migrate('w-1', WitmangoWalletPurpose.DEPOSIT, 'a')).rejects.toThrow('holds in progress');
    await expect(harness({ available: 0 }).service.migrate('w-1', WitmangoWalletPurpose.DEPOSIT, 'a')).rejects.toThrow('no ledger balance');
  });

  it('puts the ledger balance back when the CBA refuses the deposit', async () => {
    const h = harness({ deposit: jest.fn(async () => { throw new Error('400'); }) });

    const view = await h.service.migrate('w-1', WitmangoWalletPurpose.DEPOSIT, 'admin-1');

    expect(view.status).toBe(CbaBalanceMigrationStatus.FAILED);
    expect(h.wallets.credit).toHaveBeenCalledWith(expect.objectContaining({ walletId: 'w-1', amountNgn: 4_500 }));
  });

  it('never deposits twice: an uncertain deposit is looked up, and a repeat request moves nothing', async () => {
    const h = harness({ deposit: jest.fn(async () => { throw new WitmangoUncertainOutcomeError(); }) });

    const first = await h.service.migrate('w-1', WitmangoWalletPurpose.DEPOSIT, 'admin-1');
    expect(first.status).toBe(CbaBalanceMigrationStatus.REVIEW_REQUIRED);
    expect(h.wallets.credit).not.toHaveBeenCalled();

    await h.service.migrate('w-1', WitmangoWalletPurpose.DEPOSIT, 'admin-1');
    expect(h.witmango.deposit).toHaveBeenCalledTimes(1);
    expect(h.witmango.findTransactionByReference).toHaveBeenCalledTimes(2);
  });
});

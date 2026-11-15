import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  AuditActorType,
  CbaTransferPurpose,
  CbaTransferStatus,
  CbaWithdrawalStatus,
  LedgerOwnerType,
  PrizePayoutStatus,
  WitmangoWalletPurpose,
} from '@prisma/client';

import { CbaWithdrawalService } from '../src/withdrawals/cba-withdrawal.service';
import type {
  WalletOwner,
  WithdrawalAccountService,
} from '../src/withdrawals/withdrawal-account.service';
import {
  WitmangoClientService,
  WitmangoUncertainOutcomeError,
} from '../src/integrations/witmango/witmango-client.service';
import type { WitmangoWalletLinkService } from '../src/integrations/witmango/witmango-wallet-link.service';
import type { WitmangoTransferService } from '../src/integrations/witmango/witmango-transfer.service';
import type { MonnifyPrizePayoutProvider } from '../src/claims/payout/monnify-prize-payout.provider';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';

type Row = Record<string, any>;

const WINNINGS = { clientId: 4, savingsAccountId: 11 };
const EARNINGS = { clientId: 7, savingsAccountId: 71 };
const PENDING = { officeId: 1, clientId: 95, accountId: 950 };
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';

const BASE_CONFIG: Record<string, unknown> = {
  WALLET_WITHDRAWALS_ENABLED: true,
  WITMANGO_OFFICE_ID: 1,
  WITMANGO_PENDING_WITHDRAWALS_CLIENT_ID: 95,
  WITMANGO_PENDING_WITHDRAWALS_ACCOUNT_ID: 950,
  WITHDRAWAL_MIN_NGN: 100,
  WITHDRAWAL_MAX_PER_REQUEST_CUSTOMER_NGN: 50_000,
  WITHDRAWAL_MAX_PER_REQUEST_AGENT_NGN: 200_000,
  WITHDRAWAL_DAILY_MAX_CUSTOMER_NGN: 100_000,
  WITHDRAWAL_DAILY_MAX_AGENT_NGN: 500_000,
  WITHDRAWAL_MAX_PERCENT_OF_BALANCE: 100,
  WITHDRAWAL_APPROVAL_THRESHOLD_NGN: 0,
};

const customer: WalletOwner = {
  walletId: 'wallet-1',
  ownerType: LedgerOwnerType.CUSTOMER,
  ownerId: 'user-1',
  actor: { type: AuditActorType.CUSTOMER, id: 'user-1' },
};

const agent: WalletOwner = {
  walletId: 'wallet-1',
  ownerType: LedgerOwnerType.AGENT,
  ownerId: 'agent-1',
  actor: { type: AuditActorType.AGENT, id: 'agent-1' },
};

const destination = {
  withdrawalAccountId: ACCOUNT_ID,
  bankCode: '058',
  accountNumber: '0123456789',
  accountName: 'ADE OKAFOR',
  accountLast4: '6789',
  accountFingerprint: 'a'.repeat(64),
};

function result(status: PrizePayoutStatus, extra: Row = {}) {
  return { provider: 'MONNIFY', reference: 'x', status, ...extra };
}

function harness(options: {
  config?: Record<string, unknown>;
  availableNgn?: number;
  transferOutcomes?: CbaTransferStatus[];
  payout?: jest.Mock;
  status?: jest.Mock;
} = {}) {
  const config = { ...BASE_CONFIG, ...options.config };
  const withdrawals = new Map<string, Row>();
  const transfers: Row[] = [];
  const outcomes = [...(options.transferOutcomes ?? [])];

  const match = (row: Row, where: Row) =>
    Object.entries(where).every(([key, cond]) => {
      if (cond && typeof cond === 'object' && 'in' in cond) return cond.in.includes(row[key]);
      if (cond && typeof cond === 'object' && 'notIn' in cond) return !cond.notIn.includes(row[key]);
      if (cond && typeof cond === 'object' && 'gte' in cond) return row[key] >= cond.gte;
      return row[key] === cond;
    });

  const prisma: Row = {
    cbaWithdrawal: {
      findUnique: jest.fn(async ({ where, include }: { where: Row; include?: Row }) => {
        let row: Row | undefined;
        if (where.walletId_requestId) {
          row = [...withdrawals.values()].find(
            (w) =>
              w.walletId === where.walletId_requestId.walletId &&
              w.requestId === where.walletId_requestId.requestId,
          );
        } else if (where.payoutReference) {
          row = [...withdrawals.values()].find((w) => w.payoutReference === where.payoutReference);
        } else {
          row = withdrawals.get(where.withdrawalId);
        }
        if (!row) return null;
        return include?.lockTransfer
          ? { ...row, lockTransfer: transfers.find((t) => t.transferId === row!.lockTransferId) }
          : { ...row };
      }),
      count: jest.fn(async ({ where }: { where: Row }) =>
        [...withdrawals.values()].filter((w) => match(w, where)).length,
      ),
      aggregate: jest.fn(async ({ where }: { where: Row }) => ({
        _sum: {
          amountNgn: [...withdrawals.values()]
            .filter((w) => match(w, where))
            .reduce((sum, w) => sum + w.amountNgn, 0) || null,
        },
      })),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row: Row = {
          createdAt: new Date(),
          updatedAt: new Date(),
          failureReason: null,
          restoreTransferId: null,
          payoutSubmittedAt: null,
          payoutCompletedAt: null,
          providerTransactionReference: null,
          ...data,
        };
        withdrawals.set(row.withdrawalId, row);
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = withdrawals.get(where.withdrawalId);
        if (!row || !match(row, { ...where, withdrawalId: row.withdrawalId })) return { count: 0 };
        Object.assign(row, data, { updatedAt: new Date() });
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = withdrawals.get(where.withdrawalId)!;
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => {
    const saved = new Map([...withdrawals].map(([k, v]) => [k, { ...v }]));
    const count = transfers.length;
    try {
      return await fn(prisma);
    } catch (error) {
      withdrawals.clear();
      saved.forEach((v, k) => withdrawals.set(k, v));
      transfers.length = count;
      throw error;
    }
  });

  const cbaTransfers = {
    endpoint: (a: { clientId: number; savingsAccountId: number }) => ({
      officeId: 1,
      clientId: a.clientId,
      accountId: a.savingsAccountId,
    }),
    availableNgn: jest.fn(async () => options.availableNgn ?? 80_000),
    createInTransaction: jest.fn(async (_tx: unknown, draft: Row) => {
      const row = {
        transferId: `t-${transfers.length + 1}`,
        status: CbaTransferStatus.PENDING,
        fromOfficeId: draft.from.officeId,
        fromClientId: draft.from.clientId,
        fromAccountId: draft.from.accountId,
        toOfficeId: draft.to.officeId,
        toClientId: draft.to.clientId,
        toAccountId: draft.to.accountId,
        ...draft,
      };
      transfers.push(row);
      return { ...row };
    }),
    execute: jest.fn(async (id: string) => {
      const row = transfers.find((t) => t.transferId === id)!;
      if (row.status === CbaTransferStatus.PENDING) {
        row.status = outcomes.shift() ?? CbaTransferStatus.POSTED;
      }
      return { ...row };
    }),
  };

  const accounts = {
    requireUsable: jest.fn(async () => ({ ...destination })),
  };

  const witmango = {
    withdraw: jest.fn(async () => ({ transactionId: 555, savingsAccountId: 950 })),
    findTransactionByReference: jest.fn(async () => null),
  };

  const payouts = {
    initiate: options.payout ?? jest.fn(async () => result(PrizePayoutStatus.SUCCEEDED, { amountNgn: 20_000 })),
    getStatus: options.status ?? jest.fn(async () => result(PrizePayoutStatus.PROCESSING)),
  };

  const service = new CbaWithdrawalService(
    prisma as unknown as PrismaService,
    { write: jest.fn(async () => undefined) } as unknown as AuditService,
    { get: (key: string) => config[key] } as unknown as ConfigService,
    accounts as unknown as WithdrawalAccountService,
    {
      getState: async () => 'READY',
      getActiveAccount: async (_w: string, purpose: WitmangoWalletPurpose) =>
        purpose === WitmangoWalletPurpose.WINNINGS ? WINNINGS : EARNINGS,
    } as unknown as WitmangoWalletLinkService,
    cbaTransfers as unknown as WitmangoTransferService,
    witmango as unknown as WitmangoClientService,
    payouts as unknown as MonnifyPrizePayoutProvider,
  );

  return {
    service,
    withdrawals,
    transfers,
    cbaTransfers,
    accounts,
    witmango,
    payouts,
    only: () => [...withdrawals.values()][0],
  };
}

const req = (overrides: Row = {}) => ({
  withdrawalAccountId: ACCOUNT_ID,
  amountNgn: 20_000,
  requestId: 'req-00000001',
  ...overrides,
});

describe('Phase 10: withdrawals from CBA wallets', () => {
  it('is off unless deliberately switched on', async () => {
    const h = harness({ config: { WALLET_WITHDRAWALS_ENABLED: false } });
    await expect(h.service.request(customer, req())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('refuses outright while limits are not configured — no limit is never assumed', async () => {
    const h = harness({ config: { WITHDRAWAL_DAILY_MAX_CUSTOMER_NGN: 0 } });
    await expect(h.service.request(customer, req())).rejects.toThrow(
      'Withdrawals are not available yet',
    );
    expect(h.transfers).toHaveLength(0);
  });

  it('locks from Winnings, pays out by Monnify, then settles the CBA book', async () => {
    const h = harness();

    const view = await h.service.request(customer, req());

    expect(view.status).toBe(CbaWithdrawalStatus.SUCCEEDED);
    expect(h.transfers).toHaveLength(1);
    expect(h.transfers[0]).toMatchObject({
      purpose: CbaTransferPurpose.WITHDRAWAL_LOCK,
      from: { officeId: 1, clientId: 4, accountId: 11 },
      to: PENDING,
      amountNgn: 20_000,
    });

    const w = h.only();
    expect(h.payouts.initiate).toHaveBeenCalledWith({
      idempotencyKey: w.payoutReference,
      accountNumber: '0123456789',
      bankCode: '058',
      accountName: 'ADE OKAFOR',
      amountNgn: 20_000,
      reason: 'SureWina withdrawal',
    });
    expect(h.witmango.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 950,
        amountNgn: 20_000,
        reference: w.settlementReference,
      }),
    );
    expect(w).toMatchObject({ settlementTransactionId: 555 });
  });

  it('takes an agent’s withdrawal from Earnings, never Float', async () => {
    const h = harness();
    await h.service.request(agent, req());
    expect(h.transfers[0].from).toEqual({ officeId: 1, clientId: 7, accountId: 71 });
  });

  it.each([
    ['below the minimum', { amountNgn: 50 }, 'minimum withdrawal'],
    ['above the per-request maximum', { amountNgn: 60_000 }, 'maximum per withdrawal'],
  ])('refuses an amount %s', async (_label, overrides, text) => {
    const h = harness();
    await expect(h.service.request(customer, req(overrides))).rejects.toThrow(text);
    expect(h.transfers).toHaveLength(0);
  });

  it('refuses more than the withdrawable balance, or the configured share of it', async () => {
    const short = harness({ availableNgn: 10_000 });
    await expect(short.service.request(customer, req())).rejects.toThrow('up to ₦10,000');

    const share = harness({ availableNgn: 30_000, config: { WITHDRAWAL_MAX_PERCENT_OF_BALANCE: 50 } });
    await expect(share.service.request(customer, req())).rejects.toThrow('up to ₦15,000');
  });

  it('enforces the daily limit across withdrawals', async () => {
    const h = harness({ config: { WITHDRAWAL_DAILY_MAX_CUSTOMER_NGN: 30_000 } });
    await h.service.request(customer, req());

    await expect(
      h.service.request(customer, req({ requestId: 'req-00000002' })),
    ).rejects.toThrow('₦10,000 more today');
  });

  it('allows only one withdrawal in flight per wallet', async () => {
    const h = harness({ payout: jest.fn(async () => result(PrizePayoutStatus.PROCESSING)) });
    await h.service.request(customer, req());
    expect(h.only().status).toBe(CbaWithdrawalStatus.PAYOUT_PENDING);

    await expect(
      h.service.request(customer, req({ requestId: 'req-00000002' })),
    ).rejects.toThrow('already have a withdrawal in progress');
  });

  it('returns the same withdrawal for a repeated request, and refuses a reused ID', async () => {
    const h = harness();
    const first = await h.service.request(customer, req());
    const again = await h.service.request(customer, req());

    expect(again.withdrawalId).toBe(first.withdrawalId);
    expect(h.transfers).toHaveLength(1);
    expect(h.payouts.initiate).toHaveBeenCalledTimes(1);

    await expect(h.service.request(customer, req({ amountNgn: 1_000 }))).rejects.toThrow(
      'already used for a different withdrawal',
    );
  });

  it('pays nothing when the lock is refused', async () => {
    const h = harness({ transferOutcomes: [CbaTransferStatus.FAILED] });

    await expect(h.service.request(customer, req())).rejects.toThrow('No money moved');
    expect(h.only().status).toBe(CbaWithdrawalStatus.FAILED);
    expect(h.payouts.initiate).not.toHaveBeenCalled();
  });

  it('pays nothing and goes to review when the lock is uncertain', async () => {
    const h = harness({ transferOutcomes: [CbaTransferStatus.UNCERTAIN] });

    await expect(h.service.request(customer, req())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(h.only()).toMatchObject({
      status: CbaWithdrawalStatus.REVIEW_REQUIRED,
      failureReason: 'LOCK_UNCERTAIN',
    });
    expect(h.payouts.initiate).not.toHaveBeenCalled();
  });

  it('returns the locked money when Monnify says the payout failed', async () => {
    const h = harness({ payout: jest.fn(async () => result(PrizePayoutStatus.FAILED)) });

    const view = await h.service.request(customer, req());

    expect(view.status).toBe(CbaWithdrawalStatus.RESTORED);
    expect(h.transfers[1]).toMatchObject({
      purpose: CbaTransferPurpose.WITHDRAWAL_RESTORE,
      from: PENDING,
      to: { officeId: 1, clientId: 4, accountId: 11 },
      amountNgn: 20_000,
    });
    expect(h.witmango.withdraw).not.toHaveBeenCalled();
  });

  it('sends to review when the money cannot be returned', async () => {
    const h = harness({
      payout: jest.fn(async () => result(PrizePayoutStatus.FAILED)),
      transferOutcomes: [CbaTransferStatus.POSTED, CbaTransferStatus.UNCERTAIN],
    });

    await h.service.request(customer, req());

    expect(h.only()).toMatchObject({
      status: CbaWithdrawalStatus.REVIEW_REQUIRED,
      failureReason: 'RESTORE_NOT_POSTED',
    });
  });

  it('never re-sends a payout whose outcome was unknown — it asks Monnify instead', async () => {
    const h = harness({
      payout: jest.fn(async () => { throw new Error('socket hang up'); }),
      status: jest.fn(async () => result(PrizePayoutStatus.SUCCEEDED, { amountNgn: 20_000 })),
    });

    const first = await h.service.request(customer, req());
    expect(first.status).toBe(CbaWithdrawalStatus.PAYOUT_PENDING);

    const later = await h.service.refresh(first.withdrawalId);

    expect(later.status).toBe(CbaWithdrawalStatus.SUCCEEDED);
    expect(h.payouts.initiate).toHaveBeenCalledTimes(1);
    expect(h.payouts.getStatus).toHaveBeenCalledWith(h.only().payoutReference);
  });

  it('does not treat "no such transfer" as failure straight after submission', async () => {
    const h = harness({
      payout: jest.fn(async () => { throw new Error('timeout'); }),
      status: jest.fn(async () => result(PrizePayoutStatus.FAILED, { rawStatus: 'D02' })),
    });

    const first = await h.service.request(customer, req());
    const later = await h.service.refresh(first.withdrawalId);

    expect(later.status).toBe(CbaWithdrawalStatus.PAYOUT_PENDING);
    expect(h.transfers).toHaveLength(1);
  });

  it('sends a payout for the wrong amount to review', async () => {
    const h = harness({
      payout: jest.fn(async () => result(PrizePayoutStatus.SUCCEEDED, { amountNgn: 2_000 })),
    });

    await h.service.request(customer, req());

    expect(h.only()).toMatchObject({
      status: CbaWithdrawalStatus.REVIEW_REQUIRED,
      failureReason: 'PAYOUT_AMOUNT_MISMATCH',
    });
    expect(h.witmango.withdraw).not.toHaveBeenCalled();
  });

  it('returns the money when a pending payout is reversed before it ever succeeded', async () => {
    const h = harness({
      payout: jest.fn(async () => result(PrizePayoutStatus.PROCESSING)),
      status: jest.fn(async () => result(PrizePayoutStatus.REVERSED)),
    });
    const first = await h.service.request(customer, req());

    await h.service.refresh(first.withdrawalId);

    expect(h.only().status).toBe(CbaWithdrawalStatus.RESTORED);
  });

  it.each([
    ['paid but not yet settled', true],
    ['paid and settled', false],
  ])('sends a payout reversed after it was %s to review, never re-paying or restoring', async (_label, settlementFails) => {
    const h = harness({
      status: jest.fn(async () => result(PrizePayoutStatus.REVERSED)),
    });
    if (settlementFails) h.witmango.withdraw.mockRejectedValueOnce(new Error('rejected'));

    await h.service.request(customer, req());
    expect(h.only().status).toBe(
      settlementFails ? CbaWithdrawalStatus.PAID : CbaWithdrawalStatus.SUCCEEDED,
    );

    // A later webhook reports the bank reversed it.
    const synced = await h.service.syncByReference(h.only().payoutReference);

    expect(synced).toEqual({ found: true, changed: true });
    expect(h.only()).toMatchObject({
      status: CbaWithdrawalStatus.REVIEW_REQUIRED,
      failureReason: 'PAYOUT_REVERSED_AFTER_PAYMENT',
    });
    expect(h.transfers).toHaveLength(1);
    expect(h.payouts.initiate).toHaveBeenCalledTimes(1);
  });

  it('holds a large withdrawal, already locked, until finance approves', async () => {
    const h = harness({ config: { WITHDRAWAL_APPROVAL_THRESHOLD_NGN: 10_000 } });

    const view = await h.service.request(customer, req());

    expect(view.status).toBe(CbaWithdrawalStatus.AWAITING_APPROVAL);
    expect(h.transfers[0].status).toBe(CbaTransferStatus.POSTED);
    expect(h.payouts.initiate).not.toHaveBeenCalled();

    const approved = await h.service.approve(view.withdrawalId, 'admin-1');

    expect(approved.status).toBe(CbaWithdrawalStatus.SUCCEEDED);
    expect(h.only()).toMatchObject({ approvedBy: 'admin-1' });
  });

  it('returns the money when finance rejects a held withdrawal', async () => {
    const h = harness({ config: { WITHDRAWAL_APPROVAL_THRESHOLD_NGN: 10_000 } });
    const view = await h.service.request(customer, req());

    const rejected = await h.service.reject(view.withdrawalId, 'admin-1');

    expect(rejected.status).toBe(CbaWithdrawalStatus.RESTORED);
    expect(h.only()).toMatchObject({
      rejectedBy: 'admin-1',
      failureReason: 'REJECTED_BY_FINANCE',
    });
    expect(h.payouts.initiate).not.toHaveBeenCalled();
  });

  it('only approves or rejects a withdrawal that is awaiting approval', async () => {
    const h = harness();
    const view = await h.service.request(customer, req());
    await expect(h.service.approve(view.withdrawalId, 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(h.service.reject(view.withdrawalId, 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns the money if the saved account was removed before paying', async () => {
    const h = harness({ config: { WITHDRAWAL_APPROVAL_THRESHOLD_NGN: 10_000 } });
    const view = await h.service.request(customer, req());
    h.accounts.requireUsable.mockRejectedValueOnce(new Error('Withdrawal account not found'));

    const approved = await h.service.approve(view.withdrawalId, 'admin-1');

    expect(approved.status).toBe(CbaWithdrawalStatus.RESTORED);
    expect(h.only().failureReason).toBe('DESTINATION_UNAVAILABLE');
    expect(h.payouts.initiate).not.toHaveBeenCalled();
  });

  it('retries a refused settlement, since nothing was posted', async () => {
    const h = harness();
    h.witmango.withdraw.mockRejectedValueOnce(new Error('rejected'));

    const first = await h.service.request(customer, req());
    expect(h.only()).toMatchObject({
      status: CbaWithdrawalStatus.PAID,
      failureReason: 'SETTLEMENT_FAILED',
    });

    const later = await h.service.refresh(first.withdrawalId);

    expect(later.status).toBe(CbaWithdrawalStatus.SUCCEEDED);
    expect(h.witmango.withdraw).toHaveBeenCalledTimes(2);
  });

  it('never re-posts an uncertain settlement; it looks it up instead', async () => {
    const h = harness();
    h.witmango.withdraw.mockRejectedValueOnce(new WitmangoUncertainOutcomeError());

    const first = await h.service.request(customer, req());
    expect(h.only()).toMatchObject({
      status: CbaWithdrawalStatus.PAID,
      failureReason: 'SETTLEMENT_UNCERTAIN',
    });

    // Not found: stays for a person.
    await h.service.refresh(first.withdrawalId);
    expect(h.only().status).toBe(CbaWithdrawalStatus.PAID);

    // Found: settled.
    h.witmango.findTransactionByReference.mockResolvedValueOnce({
      transactionId: 777,
      kind: 'WITHDRAWAL',
      amountNgn: 20_000,
      reversed: false,
    } as never);
    const settled = await h.service.refresh(first.withdrawalId);

    expect(settled.status).toBe(CbaWithdrawalStatus.SUCCEEDED);
    expect(h.witmango.withdraw).toHaveBeenCalledTimes(1);
  });

  it('settles from the webhook by reference, and ignores references it does not own', async () => {
    const h = harness({
      payout: jest.fn(async () => result(PrizePayoutStatus.PROCESSING)),
      status: jest.fn(async () => result(PrizePayoutStatus.SUCCEEDED, { amountNgn: 20_000 })),
    });
    await h.service.request(customer, req());

    expect(await h.service.syncByReference('sw-wdr-unknown')).toEqual({
      found: false,
      changed: false,
    });
    expect(await h.service.syncByReference(h.only().payoutReference)).toEqual({
      found: true,
      changed: true,
    });
    expect(h.only().status).toBe(CbaWithdrawalStatus.SUCCEEDED);
  });
});

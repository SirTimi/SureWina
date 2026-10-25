import { WalletHoldStatus, WalletWithdrawalStatus } from '@prisma/client';

import { RolloutCheckService } from '../src/rollout/rollout-check.service';

describe('Phase 6: read-only CBA withdrawal rollout invariant', () => {
  type CbaRow = {
    withdrawalId: string;
    walletId: string;
    amountNgn: number;
    status: WalletWithdrawalStatus;
    cbaTransactionId: string | null;
    cbaSubmissionStartedAt: Date | null;
    paystackTransactionId: string | null;
    paystackSubmissionStartedAt: Date | null;
    hold: {
      walletId: string;
      amountNgn: number;
      status: WalletHoldStatus;
    };
  };

  const walletId = 'wallet-1';
  const row: CbaRow = {
    withdrawalId: 'withdrawal-1',
    walletId,
    amountNgn: 1000,
    status: WalletWithdrawalStatus.RESERVED,
    cbaTransactionId: null,
    cbaSubmissionStartedAt: null,
    paystackTransactionId: null,
    paystackSubmissionStartedAt: null,
    hold: {
      walletId,
      amountNgn: 1000,
      status: WalletHoldStatus.HELD,
    },
  };

  function setup(withdrawals: CbaRow[] = []) {
    const prisma = {
      walletWithdrawal: {
        findMany: jest.fn().mockResolvedValue(withdrawals),
      },
    };
    const config = {
      get: jest.fn((key: string) => key === 'WITMANGO_MONETARY_ENABLED' ? false : undefined),
    };
    const service = new RolloutCheckService(prisma as never, config as never);
    // Bracket notation allows a focused check without mocking all other rollout systems.
    const check = () => service['checkCbaWithdrawalHolds']();
    return { check, prisma, config };
  }

  it('passes for an empty withdrawal queue without making financial writes', async () => {
    const h = setup();
    const result = await h.check();
    expect(result.status).toBe('PASS');
    expect(h.prisma.walletWithdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1001 }),
    );
  });

  it('requires Finance review while a legitimate CBA hold is outstanding', async () => {
    const h = setup([{ ...row }]);
    const result = await h.check();
    expect(result.status).toBe('REVIEW');
  });

  it('blocks mismatched or prematurely released holds', async () => {
    const h = setup([{ ...row, hold: { ...row.hold, status: WalletHoldStatus.RELEASED } }]);
    const result = await h.check();
    expect(result.status).toBe('BLOCKER');
    expect(result.details).toEqual(expect.arrayContaining([
      expect.stringContaining('lacks matching held liability'),
    ]));
  });

  it('blocks a reserved withdrawal with an external submission marker', async () => {
    const h = setup([{ ...row, cbaSubmissionStartedAt: new Date() }]);
    const result = await h.check();
    expect(result.status).toBe('BLOCKER');
  });

  it('blocks concurrent unresolved withdrawals against one wallet', async () => {
    const h = setup([row, { ...row, withdrawalId: 'withdrawal-2' }]);
    const result = await h.check();
    expect(result.status).toBe('BLOCKER');
    expect(result.details).toEqual(expect.arrayContaining([
      expect.stringContaining('duplicate unresolved withdrawal'),
    ]));
  });

  it('does not accept confirmed CBA debit without the provider transaction ID', async () => {
    const h = setup([{ ...row, status: WalletWithdrawalStatus.CBA_DEBIT_CONFIRMED }]);
    const result = await h.check();
    expect(result.status).toBe('BLOCKER');
  });

  it('fails closed rather than silently truncating a large active queue', async () => {
    const h = setup(Array.from({ length: 1001 }, (_, i) => ({
      ...row,
      withdrawalId: 'withdrawal-' + i,
      walletId: 'wallet-' + i,
      hold: { ...row.hold, walletId: 'wallet-' + i },
    })));
    const result = await h.check();
    expect(result.status).toBe('BLOCKER');
  });
});

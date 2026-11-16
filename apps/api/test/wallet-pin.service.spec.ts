import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AuditActorType, LedgerOwnerType, Prisma } from '@prisma/client';

import { WalletPinService } from '../src/withdrawals/wallet-pin.service';
import type { WithdrawalAccountService } from '../src/withdrawals/withdrawal-account.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { ConfigService } from '@nestjs/config';

type Row = {
  walletId: string;
  pinHash: string;
  failedAttempts: number;
  lockedUntil: Date | null;
  setAt: Date;
};

const owner = {
  walletId: 'wallet-1',
  ownerType: LedgerOwnerType.CUSTOMER,
  ownerId: 'user-1',
  actor: { type: AuditActorType.CUSTOMER, id: 'user-1' },
};

function harness(config: Record<string, unknown> = {}) {
  const rows = new Map<string, Row>();
  const audit = { write: jest.fn(async (_entry: { action: string }) => undefined) };

  const prisma = {
    walletPin: {
      findUnique: jest.fn(async ({ where }: { where: { walletId: string } }) => {
        const row = rows.get(where.walletId);
        return row ? { ...row } : null;
      }),
      create: jest.fn(async ({ data }: { data: Omit<Row, 'failedAttempts' | 'lockedUntil'> }) => {
        if (rows.has(data.walletId)) {
          throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
        }
        const row = { ...data, failedAttempts: 0, lockedUntil: null };
        rows.set(data.walletId, row);
        return { ...row };
      }),
      update: jest.fn(
        async ({ where, data }: { where: { walletId: string }; data: Record<string, unknown> }) => {
          const row = rows.get(where.walletId)!;
          for (const [key, value] of Object.entries(data)) {
            if (value && typeof value === 'object' && 'increment' in (value as object)) {
              (row as Record<string, unknown>)[key] =
                (row as unknown as Record<string, number>)[key] + (value as { increment: number }).increment;
            } else {
              (row as Record<string, unknown>)[key] = value;
            }
          }
          return { ...row };
        },
      ),
    },
  };

  const accounts = { isOwnersBvn: jest.fn(async (_o: unknown, bvn: string) => bvn === '22222222222') };
  const configService = { get: jest.fn((key: string) => config[key]) };

  const service = new WalletPinService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    configService as unknown as ConfigService,
    accounts as unknown as WithdrawalAccountService,
  );

  return { service, rows, audit, accounts };
}

const actions = (h: ReturnType<typeof harness>) => h.audit.write.mock.calls.map(([e]) => e.action);

describe('Withdrawal PIN', () => {
  it('stores only a salted hash, never the PIN, and sets it once', async () => {
    const h = harness();

    await expect(h.service.set(owner, '4826')).resolves.toEqual({ set: true, lockedUntil: null });

    const stored = h.rows.get('wallet-1')!;
    expect(stored.pinHash).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(stored.pinHash).not.toContain('4826');

    await expect(h.service.set(owner, '7391')).rejects.toBeInstanceOf(ConflictException);
    await expect(h.service.verify(owner, '4826')).resolves.toBeUndefined();
  });

  it('refuses PINs that are easy to guess or not 4 digits', async () => {
    const h = harness();

    for (const pin of ['0000', '7777', '1234', '6789', '9876', '3210', '123', '12345', 'abcd', '']) {
      await expect(h.service.set(owner, pin)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(h.rows.size).toBe(0);
  });

  it('counts down wrong tries, locks after five, and refuses even the right PIN while locked', async () => {
    const h = harness();
    await h.service.set(owner, '4826');

    for (const left of [4, 3, 2, 1]) {
      await expect(h.service.verify(owner, '1111')).rejects.toThrow(`${left} ${left === 1 ? 'try' : 'tries'} left`);
    }
    await expect(h.service.verify(owner, '1111')).rejects.toThrow('locked for 30 minutes');

    await expect(h.service.verify(owner, '4826')).rejects.toThrow('Try again in 30 minutes');
    expect(actions(h)).toContain('WALLET_PIN_LOCKED');

    const status = await h.service.status(owner);
    expect(status.lockedUntil).not.toBeNull();
  });

  it('clears the count after a right PIN', async () => {
    const h = harness();
    await h.service.set(owner, '4826');

    await expect(h.service.verify(owner, '1111')).rejects.toBeInstanceOf(ForbiddenException);
    await h.service.verify(owner, '4826');

    expect(h.rows.get('wallet-1')!.failedAttempts).toBe(0);
  });

  it('works again once the lock has passed', async () => {
    const h = harness();
    await h.service.set(owner, '4826');
    h.rows.get('wallet-1')!.lockedUntil = new Date(Date.now() - 1000);

    await expect(h.service.verify(owner, '4826')).resolves.toBeUndefined();
  });

  it('needs the current PIN to change it', async () => {
    const h = harness();
    await h.service.set(owner, '4826');

    await expect(h.service.change(owner, '1111', '7391')).rejects.toBeInstanceOf(ForbiddenException);
    await h.service.change(owner, '4826', '7391');

    await expect(h.service.verify(owner, '7391')).resolves.toBeUndefined();
    await expect(h.service.verify(owner, '4826')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resets a forgotten PIN with the owner’s BVN, which also lifts a lock', async () => {
    const h = harness();
    await h.service.set(owner, '4826');

    await expect(h.service.reset(owner, '33333333333', '7391')).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.rows.get('wallet-1')!.failedAttempts).toBe(1);

    h.rows.get('wallet-1')!.lockedUntil = null;
    await h.service.reset(owner, '22222222222', '7391');

    expect(h.rows.get('wallet-1')!.failedAttempts).toBe(0);
    await expect(h.service.verify(owner, '7391')).resolves.toBeUndefined();
    expect(actions(h)).toContain('WALLET_PIN_RESET');
  });

  it('cannot be reset while locked, so a lock cannot be brute-forced through reset', async () => {
    const h = harness();
    await h.service.set(owner, '4826');
    h.rows.get('wallet-1')!.lockedUntil = new Date(Date.now() + 10 * 60 * 1000);

    await expect(h.service.reset(owner, '22222222222', '7391')).rejects.toThrow('Try again in');
    expect(h.accounts.isOwnersBvn).not.toHaveBeenCalled();
  });

  it('requires a PIN to be set before withdrawing, unless PINs are switched off', async () => {
    await expect(harness().service.verifyIfRequired(owner, '4826')).rejects.toThrow('Set a withdrawal PIN first');
    await expect(harness().service.verifyIfRequired(owner, undefined)).rejects.toBeInstanceOf(ConflictException);

    const off = harness({ WALLET_PIN_REQUIRED: false });
    await expect(off.service.verifyIfRequired(owner, undefined)).resolves.toBeUndefined();
  });

  it('treats a missing PIN as a wrong one', async () => {
    const h = harness();
    await h.service.set(owner, '4826');

    await expect(h.service.verifyIfRequired(owner, undefined)).rejects.toThrow('4 tries left');
  });
});

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  AuditActorType,
  LedgerOwnerType,
  WithdrawalAccountStatus,
} from '@prisma/client';
import { createHash, createHmac } from 'crypto';

import {
  WalletOwner,
  WithdrawalAccountService,
} from '../src/withdrawals/withdrawal-account.service';
import { PayoutAccountCipherService } from '../src/payout-accounts/payout-account-cipher.service';
import { MonnifyVerificationService } from '../src/integrations/monnify/monnify-verification.service';
import { MonnifyBanksService } from '../src/integrations/monnify/monnify-banks.service';
import type { MonnifyClientService } from '../src/integrations/monnify/monnify-client.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuditService } from '../src/audit/audit.service';

type Row = Record<string, any>;

const KEY = 'test-fingerprint-key-0123456789abcdef';
const BVN = '22212345678';
const WALLET_ID = '11111111-1111-4111-8111-111111111111';

const CONFIG: Record<string, unknown> = {
  WITHDRAWAL_ACCOUNTS_ENABLED: true,
  WITHDRAWAL_ACCOUNT_COOLING_OFF_HOURS: 24,
  WITHDRAWAL_ACCOUNTS_MAX: 3,
  WITHDRAWAL_ACCOUNT_ADDS_PER_DAY: 3,
  KYC_BANK_FINGERPRINT_KEY: KEY,
  PAYOUT_ACCOUNT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

const customer: WalletOwner = {
  walletId: WALLET_ID,
  ownerType: LedgerOwnerType.CUSTOMER,
  ownerId: 'user-1',
  actor: { type: AuditActorType.CUSTOMER, id: 'user-1' },
};

const agent: WalletOwner = {
  walletId: WALLET_ID,
  ownerType: LedgerOwnerType.AGENT,
  ownerId: 'agent-1',
  actor: { type: AuditActorType.AGENT, id: 'agent-1' },
};

const input = { bankCode: '058', accountNumber: '0123456789', bvn: BVN, bankName: 'GTBank' };

function harness(options: { match?: unknown; config?: Record<string, unknown> } = {}) {
  const rows: Row[] = [];
  const config = { ...CONFIG, ...options.config };
  const configService = { get: (key: string) => config[key] } as unknown as ConfigService;

  const prisma = {
    withdrawalAccount: {
      findMany: jest.fn(async ({ where }: { where: Row }) =>
        rows.filter((r) => r.walletId === where.walletId && r.status === where.status),
      ),
      count: jest.fn(async ({ where }: { where: Row }) =>
        rows.filter(
          (r) =>
            r.walletId === where.walletId &&
            (!where.status || r.status === where.status) &&
            (!where.createdAt || r.createdAt >= where.createdAt.gte),
        ).length,
      ),
      findFirst: jest.fn(async ({ where }: { where: Row }) =>
        rows.find(
          (r) =>
            (!where.withdrawalAccountId || r.withdrawalAccountId === where.withdrawalAccountId) &&
            r.walletId === where.walletId &&
            (!where.accountFingerprint || r.accountFingerprint === where.accountFingerprint) &&
            (!where.status || r.status === where.status),
        ) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = {
          withdrawalAccountId: `22222222-2222-4222-8222-22222222222${rows.length}`,
          createdAt: new Date(),
          verifiedAt: null,
          usableFrom: null,
          accountName: null,
          ...data,
        };
        rows.push(row);
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = rows.find(
          (r) =>
            r.withdrawalAccountId === where.withdrawalAccountId &&
            r.walletId === where.walletId &&
            r.status === where.status,
        );
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    verifiedIdentity: {
      findUnique: jest.fn(async () => ({
        identityFingerprint: createHmac('sha256', KEY)
          .update(`surewina:identity:v1:BVN:${BVN}`)
          .digest('hex'),
      })),
    },
    agent: {
      findUnique: jest.fn(async () => ({
        bvnHash: createHash('sha256').update(BVN).digest('hex'),
      })),
    },
  };

  const verification = {
    matchBvnToAccount: jest.fn(async () =>
      options.match ?? { outcome: 'MATCHED', accountName: 'ADE OKAFOR' },
    ),
  };

  // Monnify's bank list: GTBank is on it; Paystack-only codes are not.
  const banks = {
    findBank: jest.fn(async (code: string) =>
      code === '058' ? { code: '058', name: 'Guaranty Trust Bank' } : null,
    ),
  };

  const service = new WithdrawalAccountService(
    prisma as unknown as PrismaService,
    { write: jest.fn(async () => undefined) } as unknown as AuditService,
    configService,
    verification as unknown as MonnifyVerificationService,
    new PayoutAccountCipherService(configService),
    banks as unknown as MonnifyBanksService,
  );

  return { service, rows, verification, prisma, banks };
}

describe('Phase 9: saved withdrawal accounts', () => {
  it('is off unless deliberately switched on', async () => {
    const h = harness({ config: { WITHDRAWAL_ACCOUNTS_ENABLED: false } });
    await expect(h.service.add(customer, input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("saves a BVN-matched account encrypted, with a cooling-off period", async () => {
    const h = harness();

    const view = await h.service.add(customer, input);

    expect(view).toMatchObject({
      bankCode: '058',
      // Monnify's own name for the bank, not the one the screen sent.
      bankName: 'Guaranty Trust Bank',
      accountLast4: '6789',
      accountName: 'ADE OKAFOR',
      status: WithdrawalAccountStatus.ACTIVE,
      usable: false,
    });
    const hours = (new Date(view.usableFrom!).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);

    const stored = h.rows[0];
    expect(stored.accountCiphertext).not.toContain('0123456789');
    expect(JSON.stringify(stored)).not.toContain(BVN);
    expect(stored.accountFingerprint).toBe(
      createHmac('sha256', KEY).update('surewina:bank:v1:058:0123456789').digest('hex'),
    );
  });

  it('never calls Monnify, or stores anything, when the BVN is not the owner’s', async () => {
    const h = harness();

    await expect(
      h.service.add(customer, { ...input, bvn: '22299999999' }),
    ).rejects.toThrow('does not match the one your wallet was verified with');
    expect(h.verification.matchBvnToAccount).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(0);
  });

  it('checks an agent’s BVN against their onboarding hash', async () => {
    const h = harness();

    await h.service.add(agent, input);
    await expect(
      h.service.add(agent, { ...input, accountNumber: '0123456780', bvn: '22299999999' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.verification.matchBvnToAccount).toHaveBeenCalledTimes(1);
  });

  it('refuses, and records, an account that is not in the owner’s name', async () => {
    const h = harness({ match: { outcome: 'NOT_MATCHED' } });

    await expect(h.service.add(customer, input)).rejects.toThrow('not in your name');
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].status).toBe(WithdrawalAccountStatus.REJECTED);
    expect(await h.service.list(customer)).toHaveLength(0);
  });

  it('refuses the same account twice', async () => {
    const h = harness();
    await h.service.add(customer, input);
    await expect(h.service.add(customer, input)).rejects.toThrow('already saved');
  });

  it('caps saved accounts and daily attempts', async () => {
    const h = harness({ config: { WITHDRAWAL_ACCOUNTS_MAX: 1 } });
    await h.service.add(customer, input);
    await expect(
      h.service.add(customer, { ...input, accountNumber: '0123456780' }),
    ).rejects.toThrow('maximum number');

    const d = harness({ config: { WITHDRAWAL_ACCOUNT_ADDS_PER_DAY: 1 } });
    await d.service.add(customer, input);
    await d.service.remove(customer, d.rows[0].withdrawalAccountId);
    await expect(
      d.service.add(customer, { ...input, accountNumber: '0123456780' }),
    ).rejects.toThrow('Too many accounts added today');
  });

  it('will not hand out an account during its cooling-off period', async () => {
    const h = harness();
    const view = await h.service.add(customer, input);

    await expect(
      h.service.requireUsable(WALLET_ID, view.withdrawalAccountId),
    ).rejects.toThrow('waiting period');
  });

  it('hands out the decrypted account once cooling-off has ended', async () => {
    const h = harness({ config: { WITHDRAWAL_ACCOUNT_COOLING_OFF_HOURS: 0 } });
    const view = await h.service.add(customer, input);

    const destination = await h.service.requireUsable(WALLET_ID, view.withdrawalAccountId);

    expect(destination).toMatchObject({
      bankCode: '058',
      accountNumber: '0123456789',
      accountName: 'ADE OKAFOR',
    });
  });

  it('refuses a tampered account whose ciphertext no longer matches its fingerprint', async () => {
    const h = harness({ config: { WITHDRAWAL_ACCOUNT_COOLING_OFF_HOURS: 0 } });
    const view = await h.service.add(customer, input);
    h.rows[0].accountFingerprint = 'f'.repeat(64);

    await expect(
      h.service.requireUsable(WALLET_ID, view.withdrawalAccountId),
    ).rejects.toThrow('failed verification');
  });

  it('removes an account, after which it cannot be used', async () => {
    const h = harness({ config: { WITHDRAWAL_ACCOUNT_COOLING_OFF_HOURS: 0 } });
    const view = await h.service.add(customer, input);

    await h.service.remove(customer, view.withdrawalAccountId);

    await expect(
      h.service.requireUsable(WALLET_ID, view.withdrawalAccountId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a bank Monnify cannot pay, before any BVN check or stored row', async () => {
    const h = harness();

    // 50211 is Paystack's code for Kuda; Monnify uses a different one.
    await expect(
      h.service.add(customer, { ...input, bankCode: '50211' }),
    ).rejects.toThrow('Withdrawals cannot be paid to this bank');

    expect(h.verification.matchBvnToAccount).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(0);
  });

  it('says so plainly when the bank list cannot be loaded', async () => {
    const h = harness();
    h.banks.findBank.mockRejectedValueOnce(new Error('unreachable'));

    await expect(h.service.add(customer, input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(h.rows).toHaveLength(0);
  });

  it('rejects malformed input before anything else', async () => {
    const h = harness();
    await expect(h.service.add(customer, { ...input, bvn: '123' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      h.service.add(customer, { ...input, accountNumber: '12345' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Monnify BVN and account match', () => {
  function verification(response: { httpStatus: number; payload: unknown }) {
    const client = { request: jest.fn(async () => response) };
    return {
      client,
      service: new MonnifyVerificationService(
        client as unknown as MonnifyClientService,
        { get: (k: string) => k === 'MONNIFY_IDENTITY_VERIFICATION_ENABLED' } as unknown as ConfigService,
      ),
    };
  }

  const req = { bvn: BVN, bankCode: '058', accountNumber: '0123456789' };

  it('accepts only a FULL_MATCH for the same account', async () => {
    const { service, client } = verification({
      httpStatus: 200,
      payload: {
        requestSuccessful: true,
        responseCode: '0',
        responseBody: { accountNumber: '0123456789', accountName: 'ADE OKAFOR', matchStatus: 'FULL_MATCH', matchPercentage: 100 },
      },
    });

    expect(await service.matchBvnToAccount(req)).toEqual({
      outcome: 'MATCHED',
      accountName: 'ADE OKAFOR',
    });
    expect(client.request).toHaveBeenCalledWith(
      '/api/v1/vas/bvn-account-match',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each(['PARTIAL_MATCH', 'NO_MATCH', undefined])(
    'treats %s as no match',
    async (matchStatus) => {
      const { service } = verification({
        httpStatus: 200,
        payload: {
          requestSuccessful: true,
          responseBody: { accountNumber: '0123456789', accountName: 'X', matchStatus },
        },
      });
      expect(await service.matchBvnToAccount(req)).toEqual({ outcome: 'NOT_MATCHED' });
    },
  );

  it('fails loudly, rather than guessing, when Monnify cannot answer', async () => {
    const { service } = verification({ httpStatus: 500, payload: null });
    await expect(service.matchBvnToAccount(req)).rejects.toThrow(
      'Account verification is unavailable',
    );
  });
});

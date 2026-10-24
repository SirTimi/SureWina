
import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  KycIdentityCheckStatus,
  LedgerOwnerType,
  VerifiedPayoutAccountStatus,
  WalletStatus,
  WalletWithdrawalStatus,
  WitmangoWalletLinkStatus,
} from '@prisma/client';

import { WitmangoWithdrawalService } from '../src/integrations/witmango/witmango-withdrawal.service';

describe('WitmangoWithdrawalService', () => {
  const userId =
    '11111111-1111-4111-8111-111111111111';

  const walletId =
    '22222222-2222-4222-8222-222222222222';

  const requestId =
    '33333333-3333-4333-8333-333333333333';

  const withdrawalId =
    '44444444-4444-4444-8444-444444444444';

  const accountNumber = '0123456789';
  const fingerprint = 'a'.repeat(64);

  const withdrawal = {
    withdrawalId,
    userId,
    walletId,
    holdId: 'hold-1',
    amountNgn: 1000,
    status: WalletWithdrawalStatus.RESERVED,
    bankCode: '058',
    bankAccountLast4: '6789',
    cbaTransactionId: null,
    paystackTransactionId: null,
    cbaSubmissionStartedAt: null,
    paystackSubmissionStartedAt: null,
    createdAt: new Date(),
    resolvedAt: null,
  };

  function setup(enabled = true) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      walletWithdrawal: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(withdrawal),
      },
      verifiedPayoutAccount: {
        findFirst: jest.fn().mockResolvedValue({
          payoutAccountId: 'beneficiary-1',
          userId,
          currency: 'NGN',
          bankCode: '058',
          accountLast4: '6789',
          accountFingerprint: fingerprint,
          accountCiphertext: 'encrypted',
          status: VerifiedPayoutAccountStatus.LOCKED,
          verifiedAt: new Date(),
          lockedAt: new Date(),
          revokedAt: null,
          identityCheck: {
            provider: 'PAYSTACK',
            status: KycIdentityCheckStatus.VERIFIED,
            verifiedAt: new Date(),
            paystackCustomerCode: 'CUS_test123',
            bankCode: '058',
            bankAccountLast4: '6789',
            bankAccountFingerprint: fingerprint,
            claim: {
              winnerPhone: '+2348012345678',
              winnerUserId: userId,
            },
          },
        }),
      },
    };

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userId,
          phoneNumber: '+2348012345678',
        }),
      },
      witmangoWalletLink: {
        findUnique: jest.fn().mockResolvedValue({
          walletId,
          tenantId: 'sandbox',
          savingsAccountId: 10,
          status: WitmangoWalletLinkStatus.ACTIVE,
        }),
      },
      walletWithdrawal: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({
          ...withdrawal,
          status: WalletWithdrawalStatus.CANCELLED,
          resolvedAt: new Date(),
        }),
      },
      walletHold: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(
        async (fn: (db: typeof tx) => Promise<unknown>) =>
          fn(tx),
      ),
    };

    const wallets = {
      getCustomerWallet: jest.fn().mockResolvedValue({
        walletId,
        ownerType: LedgerOwnerType.CUSTOMER,
        ownerId: userId,
        status: WalletStatus.ACTIVE,
        currency: 'NGN',
        availableNgn: 5000,
        heldNgn: 0,
        totalNgn: 5000,
      }),
      createHoldInTransaction: jest.fn().mockResolvedValue({
        holdId: 'hold-1',
      }),
      releaseHold: jest.fn().mockResolvedValue({}),
    };

    const witmango = {
      isEnabled: jest.fn().mockReturnValue(true),
      getSavingsAccount: jest.fn().mockResolvedValue({
        id: 10,
        status: { id: 300 },
        currency: { code: 'NGN' },
        summary: {
          accountBalance: 5000,
          availableBalance: 5000,
        },
      }),
    };

    const cipher = {
      decrypt: jest.fn().mockReturnValue(accountNumber),
      encrypt: jest.fn().mockReturnValue('encrypted-snapshot'),
    };

    const evidence = {
      assertDestinationMatches: jest.fn(),
    };

    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          WITMANGO_WITHDRAWAL_RESERVATIONS_ENABLED: enabled,
          WITMANGO_MONETARY_ENABLED: false,
          WITMANGO_TENANT_ID: 'sandbox',
        };

        return values[key];
      }),
    };

    const audit = {
      write: jest.fn().mockResolvedValue({}),
    };

    const service = new WitmangoWithdrawalService(
      prisma as never,
      wallets as never,
      witmango as never,
      cipher as never,
      evidence as never,
      config as never,
      audit as never,
    );

    return {
      service,
      tx,
      prisma,
      wallets,
      witmango,
      cipher,
      evidence,
      config,
    };
  }

  it('rejects reservations when disabled', async () => {
    const h = setup(false);

    await expect(
      h.service.reserve(userId, requestId, 1000),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(h.wallets.createHoldInTransaction)
      .not.toHaveBeenCalled();
  });

  it('creates a hold and withdrawal in one transaction', async () => {
    const h = setup();

    const result = await h.service.reserve(
      userId,
      requestId,
      1000,
    );

    expect(result.status).toBe(WalletWithdrawalStatus.RESERVED);

    expect(h.wallets.createHoldInTransaction)
      .toHaveBeenCalledTimes(1);

    expect(h.tx.walletWithdrawal.create)
      .toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          walletId,
          requestId,
          amountNgn: 1000,
          bankAccountLast4: '6789',
          bankFingerprint: fingerprint,
        }),
      });
  });

  it('returns an existing withdrawal for an exact replay', async () => {
    const h = setup();

    h.prisma.walletWithdrawal.findUnique
      .mockResolvedValue(withdrawal);

    const result = await h.service.reserve(
      userId,
      requestId,
      1000,
    );

    expect(result.withdrawalId).toBe(withdrawalId);

    expect(h.wallets.createHoldInTransaction)
      .not.toHaveBeenCalled();
  });

  it('rejects reused references with different amounts', async () => {
    const h = setup();

    h.prisma.walletWithdrawal.findUnique
      .mockResolvedValue(withdrawal);

    await expect(
      h.service.reserve(userId, requestId, 2000),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects unreconciled balances', async () => {
    const h = setup();

    h.witmango.getSavingsAccount.mockResolvedValue({
      id: 10,
      status: { id: 300 },
      currency: { code: 'NGN' },
      summary: {
        accountBalance: 2000,
        availableBalance: 2000,
      },
    });

    await expect(
      h.service.reserve(userId, requestId, 1000),
    ).rejects.toThrow(ConflictException);

    expect(h.wallets.createHoldInTransaction)
      .not.toHaveBeenCalled();
  });

  it('rejects another active withdrawal', async () => {
    const h = setup();

    h.tx.walletWithdrawal.findFirst
      .mockResolvedValue(withdrawal);

    await expect(
      h.service.reserve(userId, requestId, 1000),
    ).rejects.toThrow(ConflictException);

    expect(h.wallets.createHoldInTransaction)
      .not.toHaveBeenCalled();
  });

  it('rejects a corrupted verified account', async () => {
    const h = setup();

    h.evidence.assertDestinationMatches.mockImplementation(() => {
      throw new ConflictException(
        'Bank beneficiary fingerprint mismatch',
      );
    });

    await expect(
      h.service.reserve(userId, requestId, 1000),
    ).rejects.toThrow(ConflictException);

    expect(h.wallets.createHoldInTransaction)
      .not.toHaveBeenCalled();
  });

  it('never submits a CBA debit or Paystack transfer', async () => {
    const h = setup();

    await h.service.reserve(userId, requestId, 1000);

    expect(h.witmango.getSavingsAccount)
      .toHaveBeenCalledTimes(1);

    // The reservation uses only read-only CBA
    // operations and an internal ledger-backed hold.
    expect(h.wallets.createHoldInTransaction)
      .toHaveBeenCalledTimes(1);
  });

  it('releases an unsubmitted local hold on cancellation', async () => {
    const h = setup();

    h.prisma.walletWithdrawal.findFirst
      .mockResolvedValue(withdrawal);

    const result = await h.service.cancelUnsubmitted(
      userId,
      withdrawalId,
    );

    expect(h.wallets.releaseHold)
      .toHaveBeenCalledWith({
        holdId: 'hold-1',
        idempotencyKey:
          `wallet-withdrawal:release:${withdrawalId}`,
        description: 'Cancel unsubmitted bank withdrawal',
      });

    expect(result.status).toBe(WalletWithdrawalStatus.CANCELLED);
  });
});

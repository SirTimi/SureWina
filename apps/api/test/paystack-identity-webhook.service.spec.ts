
import {
  ConflictException,
} from '@nestjs/common';

import {
  ClaimType,
  KycIdentityCheckStatus,
  PrizeClaimStatus,
  VerifiedPayoutAccountStatus,
} from '@prisma/client';

import { PaystackIdentityWebhookService } from '../src/claims/kyc/paystack-identity-webhook.service';

describe('PaystackIdentityWebhookService', () => {
  const customerCode = 'CUS_mock1234567';

  const userId =
    '11111111-1111-4111-8111-111111111111';

  const phoneNumber = '+2348012345678';

  const accountNumber = '0123456789';

  const fingerprint = 'a'.repeat(64);

  const successEvent = {
    event: 'customeridentification.success',
    data: {
      customer_code: customerCode,
      identification: {
        country: 'NG',
        type: 'bank_account',
        bvn: '200*****677',
        account_number: '012****789',
        bank_code: '007',
      },
    },
  };

  const failureEvent = {
    ...successEvent,
    event: 'customeridentification.failed',
  };

  function setup(
    attemptOverrides: Record<string, unknown> = {},
  ) {
    const attempt = {
      checkId: 'check-1',
      claimId: 'claim-1',
      attemptNumber: 1,

      paystackCustomerCode: customerCode,
      provider: 'PAYSTACK',

      status: KycIdentityCheckStatus.SUBMITTED,

      submittedAt: new Date(),
      verifiedAt: null,
      failedAt: null,

      bankCode: '007',
      bankAccountLast4: '6789',
      bankAccountFingerprint: fingerprint,

      ...attemptOverrides,
    };

    const claim = {
      claimId: 'claim-1',
      winnerPhone: phoneNumber,
      winnerUserId: userId,

      claimType: ClaimType.CASH,
      status: PrizeClaimStatus.KYC_PENDING,

      kycBankCode: '007',
      kycBankAccountLast4: '6789',
      kycBankAccountName: 'TEST ACCOUNT',
    };

    const pendingAccount = {
      payoutAccountId: 'account-1',
      identityCheckId: 'check-1',
      userId,

      currency: 'NGN',
      bankCode: '007',
      bankName: 'TEST BANK',

      accountCiphertext: 'encrypted-account',
      accountLast4: '6789',
      accountFingerprint: fingerprint,
      resolvedAccountName: 'TEST ACCOUNT',

      status: VerifiedPayoutAccountStatus.PENDING,

      verifiedAt: null,
      lockedAt: null,
      revokedAt: null,
    };

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),

      prizeClaim: {
        findUnique: jest.fn().mockResolvedValue(claim),
      },

      user: {
        findUnique: jest.fn().mockResolvedValue({
          userId,
        }),
      },

      kycIdentityCheck: {
        findFirst: jest.fn().mockResolvedValue(attempt),
        update: jest.fn().mockResolvedValue({}),
      },

      verifiedPayoutAccount: {
        findUnique: jest.fn().mockResolvedValue(
          pendingAccount,
        ),

        findFirst: jest.fn().mockResolvedValue(null),

        update: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      kycIdentityCheck: {
        findUnique: jest.fn().mockResolvedValue({
          claimId: 'claim-1',
        }),
      },

      $transaction: jest.fn(
        async (
          fn: (database: typeof tx) => Promise<void>,
        ) => fn(tx),
      ),
    };

    const evidence = {
      assertDestinationMatches: jest.fn(),
    };

    const cipher = {
      decrypt: jest.fn().mockReturnValue(
        accountNumber,
      ),
    };

    const service = new PaystackIdentityWebhookService(
      prisma as never,
      evidence as never,
      cipher as never,
    );

    return {
      service,
      prisma,
      tx,
      evidence,
      cipher,
      claim,
      attempt,
      pendingAccount,
    };
  }

  it('verifies a correlated Paystack identity event', async () => {
    const { service, tx, evidence } = setup();

    await service.handleWebhook(successEvent);

    expect(
      tx.kycIdentityCheck.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          checkId: 'check-1',
        },
        data: expect.objectContaining({
          status: KycIdentityCheckStatus.VERIFIED,
          verifiedAt: expect.any(Date),
        }),
      }),
    );

    expect(
      evidence.assertDestinationMatches,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        checkId: 'check-1',
      }),
      '007',
      accountNumber,
    );
  });

  it('promotes the pending beneficiary to VERIFIED', async () => {
    const { service, tx } = setup();

    await service.handleWebhook(successEvent);

    expect(
      tx.verifiedPayoutAccount.update,
    ).toHaveBeenCalledWith({
      where: {
        payoutAccountId: 'account-1',
      },
      data: {
        status: VerifiedPayoutAccountStatus.VERIFIED,
        verifiedAt: expect.any(Date),
      },
    });
  });

  it('is idempotent for duplicate success webhooks', async () => {
    const { service, tx } = setup({
      status: KycIdentityCheckStatus.VERIFIED,
      verifiedAt: new Date(),
    });

    await service.handleWebhook(successEvent);

    expect(
      tx.kycIdentityCheck.update,
    ).not.toHaveBeenCalled();

    expect(
      tx.verifiedPayoutAccount.update,
    ).not.toHaveBeenCalled();
  });

  it('rejects mismatched bank details', async () => {
    const { service, tx } = setup({
      bankAccountLast4: '1234',
    });

    await expect(
      service.handleWebhook(successEvent),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      tx.kycIdentityCheck.update,
    ).not.toHaveBeenCalled();
  });

  it('rejects an event without a previous submission', async () => {
    const { service, tx } = setup({
      submittedAt: null,
    });

    await expect(
      service.handleWebhook(successEvent),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      tx.kycIdentityCheck.update,
    ).not.toHaveBeenCalled();
  });

  it('revokes a pending beneficiary when Paystack fails verification', async () => {
    const { service, tx } = setup();

    await service.handleWebhook(failureEvent);

    expect(
      tx.kycIdentityCheck.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: KycIdentityCheckStatus.FAILED,
          failedAt: expect.any(Date),
        }),
      }),
    );

    expect(
      tx.verifiedPayoutAccount.update,
    ).toHaveBeenCalledWith({
      where: {
        payoutAccountId: 'account-1',
      },
      data: {
        status: VerifiedPayoutAccountStatus.REVOKED,
        revokedAt: expect.any(Date),
      },
    });
  });

  it('accepts a verified webhook after an UNKNOWN provider outcome', async () => {
    const { service, tx } = setup({
      status: KycIdentityCheckStatus.UNKNOWN,
    });

    await service.handleWebhook(successEvent);

    expect(
      tx.kycIdentityCheck.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: KycIdentityCheckStatus.VERIFIED,
        }),
      }),
    );
  });

  it('rejects conflicting terminal results', async () => {
    const { service, tx } = setup({
      status: KycIdentityCheckStatus.FAILED,
    });

    await expect(
      service.handleWebhook(successEvent),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      tx.verifiedPayoutAccount.update,
    ).not.toHaveBeenCalled();
  });

  it('rejects a different customer owner', async () => {
    const { service, tx } = setup();

    tx.user.findUnique.mockResolvedValue({
      userId:
        '22222222-2222-4222-8222-222222222222',
    });

    await expect(
      service.handleWebhook(successEvent),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      tx.kycIdentityCheck.update,
    ).not.toHaveBeenCalled();
  });

  it('rejects a beneficiary fingerprint mismatch', async () => {
    const { service, tx, pendingAccount } = setup();

    tx.verifiedPayoutAccount.findUnique.mockResolvedValue({
      ...pendingAccount,
      accountFingerprint: 'b'.repeat(64),
    });

    await expect(
      service.handleWebhook(successEvent),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      tx.kycIdentityCheck.update,
    ).not.toHaveBeenCalled();
  });

  it('rejects a missing registered beneficiary', async () => {
    const { service, tx } = setup();

    tx.verifiedPayoutAccount.findUnique.mockResolvedValue(null);

    tx.verifiedPayoutAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.handleWebhook(successEvent),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      tx.kycIdentityCheck.update,
    ).not.toHaveBeenCalled();
  });

  it('rejects corrupted encrypted account data', async () => {
    const { service, tx, cipher } = setup();

    cipher.decrypt.mockImplementation(() => {
      throw new ConflictException(
        'Payout account encryption validation failed',
      );
    });

    await expect(
      service.handleWebhook(successEvent),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      tx.kycIdentityCheck.update,
    ).not.toHaveBeenCalled();
  });

  it('rejects full account ownership fingerprint mismatches', async () => {
    const { service, tx, evidence } = setup();

    evidence.assertDestinationMatches.mockImplementation(() => {
      throw new ConflictException(
        'Payout destination does not match verified account',
      );
    });

    await expect(
      service.handleWebhook(successEvent),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      tx.kycIdentityCheck.update,
    ).not.toHaveBeenCalled();
  });

  it('does not silently replace an existing approved beneficiary', async () => {
    const { service, tx, pendingAccount } = setup();

    tx.verifiedPayoutAccount.findFirst.mockResolvedValue({
      ...pendingAccount,
      payoutAccountId: 'existing-approved-account',
      status: VerifiedPayoutAccountStatus.LOCKED,
    });

    await expect(
      service.handleWebhook(successEvent),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      tx.verifiedPayoutAccount.update,
    ).not.toHaveBeenCalled();
  });
});

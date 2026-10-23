
import { ConflictException } from '@nestjs/common';
import {
  ClaimType,
  KycIdentityCheckStatus,
  VerifiedPayoutAccountStatus,
} from '@prisma/client';

import { LockedPayoutDestinationService } from
  '../src/payout-accounts/locked-payout-destination.service';

describe('LockedPayoutDestinationService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const phone = '+2348012345678';
  const accountNumber = '0123456789';
  const fingerprint = 'a'.repeat(64);

  const claim = {
    claimId: 'claim-1',
    winnerPhone: phone,
    winnerUserId: userId,
    claimType: ClaimType.CASH,
    kycBankCode: '058',
    kycBankAccountLast4: '6789',
    kycBankAccountName: 'TEST CUSTOMER',
  };

  function setup() {
    const check = {
      provider: 'PAYSTACK',
      status: KycIdentityCheckStatus.VERIFIED,
      verifiedAt: new Date(),
      paystackCustomerCode: 'CUS_test123',
      bankCode: '058',
      bankAccountLast4: '6789',
      bankAccountFingerprint: fingerprint,
      claim: {
        winnerPhone: phone,
        winnerUserId: userId,
        kycBankAccountName: 'TEST CUSTOMER',
      },
    };

    const account = {
      payoutAccountId: 'account-1',
      userId,
      currency: 'NGN',
      status: VerifiedPayoutAccountStatus.LOCKED,
      bankCode: '058',
      accountLast4: '6789',
      accountFingerprint: fingerprint,
      resolvedAccountName: 'TEST CUSTOMER',
      accountCiphertext: 'encrypted-value',
      verifiedAt: new Date(),
      lockedAt: new Date(),
      revokedAt: null,
      identityCheck: check,
    };

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: {
        findUnique: jest.fn().mockResolvedValue({ userId }),
      },
      verifiedPayoutAccount: {
        findFirst: jest.fn().mockResolvedValue(account),
      },
    };

    const evidence = {
      requireVerified: jest.fn().mockResolvedValue(check),
      assertDestinationMatches: jest.fn(),
    };

    const cipher = {
      decrypt: jest.fn().mockReturnValue(accountNumber),
      encrypt: jest.fn().mockReturnValue('v1.encrypted-snapshot'),
    };

    const service = new LockedPayoutDestinationService(
      evidence as never,
      cipher as never,
    );

    return { service, tx, evidence, cipher, account };
  }

  it('authorizes a matching locked payout account', async () => {
    const { service, tx, evidence } = setup();

    const result = await service.requireLocked(tx as never, claim);

    expect(result.accountNumber).toBe(accountNumber);
    expect(result.payoutAccountId).toBe('account-1');
    expect(result.snapshotCiphertext).toBe('v1.encrypted-snapshot');
    expect(evidence.assertDestinationMatches).toHaveBeenCalledTimes(2);
  });

  it('rejects a missing locked account', async () => {
    const { service, tx } = setup();

    tx.verifiedPayoutAccount.findFirst.mockResolvedValue(null as never);

    await expect(
      service.requireLocked(tx as never, claim),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a different customer', async () => {
    const { service, tx } = setup();

    await expect(
      service.requireLocked(tx as never, {
        ...claim,
        winnerUserId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects an invalid bank fingerprint', async () => {
    const { service, tx, account } = setup();

    tx.verifiedPayoutAccount.findFirst.mockResolvedValue({
      ...account,
      accountFingerprint: 'b'.repeat(64),
    });

    await expect(
      service.requireLocked(tx as never, claim),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects failed original identity verification', async () => {
    const { service, tx, account } = setup();

    tx.verifiedPayoutAccount.findFirst.mockResolvedValue({
      ...account,
      identityCheck: {
        ...account.identityCheck,
        status: KycIdentityCheckStatus.FAILED,
      },
    });

    await expect(
      service.requireLocked(tx as never, claim),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a different decrypted account', async () => {
    const { service, tx, cipher, evidence } = setup();

    cipher.decrypt.mockReturnValue('9999996789');
    evidence.assertDestinationMatches.mockImplementation(() => {
      throw new ConflictException('Fingerprint mismatch');
    });

    await expect(
      service.requireLocked(tx as never, claim),
    ).rejects.toThrow(ConflictException);
  });
});

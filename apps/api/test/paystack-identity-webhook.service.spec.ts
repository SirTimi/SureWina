/// <reference types="jest" />
import { ConflictException } from '@nestjs/common';
import { KycIdentityCheckStatus, PrizeClaimStatus, ClaimType } from '@prisma/client';
import { PaystackIdentityWebhookService } from '../src/claims/kyc/paystack-identity-webhook.service';

describe('PaystackIdentityWebhookService', () => {
  const customerCode = 'CUS_mock1234567';
  const event = {
    event: 'customeridentification.success',
    data: {
      customer_code: customerCode,
      identification: {
        country: 'NG', type: 'bank_account',
        bvn: '200*****677', account_number: '012****789', bank_code: '007',
      },
    },
  };

  function setup(overrides: Record<string, unknown> = {}) {
    const attempt = {
      checkId: 'check-1', claimId: 'claim-1', attemptNumber: 1,
      paystackCustomerCode: customerCode, provider: 'PAYSTACK',
      status: KycIdentityCheckStatus.SUBMITTED,
      submittedAt: new Date(),
      verifiedAt: null,
      bankCode: '007', bankAccountLast4: '6789',
      bankAccountFingerprint: 'a'.repeat(64),
      ...overrides,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ claim_id: 'claim-1' }]),
      prizeClaim: {
        findUnique: jest.fn().mockResolvedValue({
          claimId: 'claim-1', claimType: ClaimType.CASH,
          status: PrizeClaimStatus.KYC_PENDING,
          kycBankCode: '007', kycBankAccountLast4: '6789',
          kycBankAccountName: 'TEST ACCOUNT',
        }),
      },
      kycIdentityCheck: {
        findFirst: jest.fn().mockResolvedValue(attempt),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      kycIdentityCheck: {
        findUnique: jest.fn().mockResolvedValue({ claimId: 'claim-1' }),
      },
      $transaction: jest.fn(async (fn: (x: typeof tx) => Promise<void>) => fn(tx)),
    };
    const service = new PaystackIdentityWebhookService(prisma as never);
    return { service, prisma, tx };
  }

  it('records successful verified evidence only for a correlated Paystack event', async () => {
    const { service, tx } = setup();
    await service.handleWebhook(event);
    expect(tx.kycIdentityCheck.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { checkId: 'check-1' },
        data: expect.objectContaining({
          status: KycIdentityCheckStatus.VERIFIED,
          verifiedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('is idempotent for duplicate success webhooks', async () => {
    const { service, tx } = setup({ status: KycIdentityCheckStatus.VERIFIED });
    await service.handleWebhook(event);
    expect(tx.kycIdentityCheck.update).not.toHaveBeenCalled();
  });

  it('rejects mismatched bank details', async () => {
    const { service, tx } = setup({ bankAccountLast4: '1234' });
    await expect(service.handleWebhook(event)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.kycIdentityCheck.update).not.toHaveBeenCalled();
  });

  it('rejects a verification result with no preceding submission', async () => {
    const { service, tx } = setup({ submittedAt: null });
    await expect(service.handleWebhook(event)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.kycIdentityCheck.update).not.toHaveBeenCalled();
  });
});

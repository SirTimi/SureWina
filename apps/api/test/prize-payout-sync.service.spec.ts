import { AuditActorType, PrizePayoutStatus } from '@prisma/client';

import { PrizePayoutSyncService } from '../src/claims/payout/prize-payout-sync.service';

describe('Phase 6: independent payout reconciliation', () => {
  const reference = 'sw-prize-11111111-1111-4111-8111-111111111111';
  const attempt = {
    attemptId: 'attempt-1',
    claimId: 'claim-1',
    provider: 'PAYSTACK',
    providerReference: reference,
    idempotencyKey: reference,
    status: PrizePayoutStatus.UNKNOWN,
  };

  function setup() {
    const prisma = {
      prizePayoutAttempt: {
        findFirst: jest.fn().mockResolvedValue({ ...attempt }),
      },
    };
    const provider = {
      getStatus: jest.fn().mockResolvedValue({
        provider: 'PAYSTACK',
        reference,
        status: PrizePayoutStatus.PROCESSING,
      }),
      initiate: jest.fn(),
    };
    const providers = {
      get: jest.fn().mockReturnValue(provider),
    };
    const finalizer = {
      applyForAttempt: jest.fn().mockResolvedValue(false),
    };
    const service = new PrizePayoutSyncService(
      prisma as never,
      providers as never,
      finalizer as never,
    );
    return { service, prisma, provider, providers, finalizer };
  }

  it('ignores an empty reference without any provider or ledger work', async () => {
    const h = setup();
    const result = await h.service.syncReference('PAYSTACK', '  ', 'webhook');
    expect(result).toEqual({ found: false, changed: false });
    expect(h.prisma.prizePayoutAttempt.findFirst).not.toHaveBeenCalled();
    expect(h.provider.getStatus).not.toHaveBeenCalled();
    expect(h.finalizer.applyForAttempt).not.toHaveBeenCalled();
  });

  it('does not create or transfer money for an unknown reference', async () => {
    const h = setup();
    h.prisma.prizePayoutAttempt.findFirst.mockResolvedValue(null);
    const result = await h.service.syncReference('PAYSTACK', reference, 'webhook');
    expect(result).toEqual({ found: false, changed: false });
    expect(h.providers.get).not.toHaveBeenCalled();
    expect(h.provider.initiate).not.toHaveBeenCalled();
    expect(h.finalizer.applyForAttempt).not.toHaveBeenCalled();
  });

  it('queries provider status and passes verified evidence to the finalizer', async () => {
    const h = setup();
    const result = await h.service.syncReference(
      'PAYSTACK', reference, 'paystack-transfer-webhook',
    );
    expect(h.prisma.prizePayoutAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: 'PAYSTACK',
          OR: [{ providerReference: reference }, { idempotencyKey: reference }],
        },
      }),
    );
    expect(h.provider.getStatus).toHaveBeenCalledWith(reference);
    expect(h.finalizer.applyForAttempt).toHaveBeenCalledWith(
      'attempt-1',
      expect.objectContaining({ status: PrizePayoutStatus.PROCESSING }),
      { type: AuditActorType.SYSTEM, id: 'paystack-transfer-webhook' },
    );
    expect(h.provider.initiate).not.toHaveBeenCalled();
    expect(result).toEqual({
      found: true, changed: false, attemptId: 'attempt-1', claimId: 'claim-1',
    });
  });

  it('recovers by stable idempotency key after the initial response is lost', async () => {
    const h = setup();
    h.prisma.prizePayoutAttempt.findFirst.mockResolvedValue({
      ...attempt,
      providerReference: null,
    });
    await h.service.syncReference('PAYSTACK', reference, 'recovery');
    expect(h.provider.getStatus).toHaveBeenCalledWith(reference);
    expect(h.provider.initiate).not.toHaveBeenCalled();
  });

  it('does not retry transfer initiation when provider lookup fails', async () => {
    const h = setup();
    h.provider.getStatus.mockRejectedValue(new Error('network timeout'));
    await expect(h.service.syncReference('PAYSTACK', reference, 'recovery'))
      .rejects.toThrow('network timeout');
    expect(h.provider.initiate).not.toHaveBeenCalled();
    expect(h.finalizer.applyForAttempt).not.toHaveBeenCalled();
  });
});

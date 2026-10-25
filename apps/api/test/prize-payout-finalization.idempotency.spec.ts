import { AuditActorType, PrizeClaimStatus, PrizePayoutStatus } from '@prisma/client';

import { PrizePayoutAttemptFinalizationService } from '../src/claims/payout/prize-payout-attempt-finalization.service';

describe('Phase 6: Paystack prize payout accounting is idempotent', () => {
  const reference = 'sw-prize-11111111-1111-4111-8111-111111111111';
  const fingerprint = 'a'.repeat(64);
  const actor = { type: AuditActorType.SYSTEM, id: 'test-provider-lookup' };
  const verified = {
    provider: 'PAYSTACK' as const,
    reference,
    status: PrizePayoutStatus.SUCCEEDED,
    providerTransactionId: 'tx-1',
    amountNgn: 1000,
    currency: 'NGN',
    destinationBankCode: '058',
    destinationAccountLast4: '6789',
    destinationAccountFingerprint: fingerprint,
  };

  function setup() {
    const attempt = {
      attemptId: 'attempt-1',
      claimId: 'claim-1',
      idempotencyKey: reference,
      provider: 'PAYSTACK' as const,
      providerReference: reference,
      providerTransactionId: null as string | null,
      status: PrizePayoutStatus.REQUESTED,
      amountNgn: 1000,
      currency: 'NGN',
      destinationBankCode: '058',
      destinationAccountLast4: '6789',
      destinationAccountFingerprint: fingerprint,
      payoutLedgerTxnId: null as string | null,
      claim: {
        claimId: 'claim-1',
        status: PrizeClaimStatus.KYC_CLEARED,
        prizeAccrualLedgerTxnId: 'accrual-journal-1' as string | null,
      },
    };
    const view = () => ({ ...attempt, claim: { ...attempt.claim } });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      prizePayoutAttempt: {
        findUnique: jest.fn().mockImplementation(async () => view()),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(async ({ data }) => {
          attempt.status = data.status;
          attempt.payoutLedgerTxnId = data.payoutLedgerTxnId ?? attempt.payoutLedgerTxnId;
          return view();
        }),
      },
      prizeClaim: {
        update: jest.fn().mockImplementation(async ({ data }) => {
          attempt.claim.status = data.status;
          return attempt.claim;
        }),
      },
      ledgerAccount: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => ({
          accountId: where.code,
          code: where.code,
        })),
      },
    };
    const prisma = {
      prizePayoutAttempt: {
        findUnique: jest.fn().mockImplementation(async () => view()),
        findFirst: jest.fn().mockImplementation(async () => view()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      prizeClaim: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(tx)),
    };
    const ledger = {
      postInTransaction: jest.fn().mockResolvedValue({ ledgerTxnId: 'payout-journal-1' }),
      reverseInTransaction: jest.fn().mockResolvedValue({ ledgerTxnId: 'reversal-journal-1' }),
    };
    const audit = { write: jest.fn().mockResolvedValue({}) };
    const wht = { recordForClaim: jest.fn().mockResolvedValue({}) };
    const service = new PrizePayoutAttemptFinalizationService(
      prisma as never, ledger as never, audit as never, wht as never,
    );
    return { service, attempt, prisma, tx, ledger, audit, wht };
  }

  it('records a verified Paystack payout once despite a duplicate provider notification', async () => {
    const h = setup();
    expect(await h.service.applyForAttempt('attempt-1', verified, actor)).toBe(true);
    expect(await h.service.applyForAttempt('attempt-1', verified, actor)).toBe(false);
    expect(h.ledger.postInTransaction).toHaveBeenCalledTimes(1);
    expect(h.tx.prizePayoutAttempt.update).toHaveBeenCalledTimes(1);
    expect(h.tx.prizeClaim.update).toHaveBeenCalledTimes(1);
    expect(h.wht.recordForClaim).toHaveBeenCalledTimes(1);
    expect(h.audit.write).toHaveBeenCalledTimes(1);

    const payload = h.ledger.postInTransaction.mock.calls[0][1];
    expect(payload.idempotencyKey).toBe('ledger:prize-payout:attempt-1');
    expect(payload.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ amountNgn: 1000, memo: 'Settle winner prize payable' }),
      expect.objectContaining({ amountNgn: 1000, memo: 'PAYSTACK payout' }),
    ]));
  });

  it('keeps a tampered bank fingerprint out of payout journals', async () => {
    const h = setup();
    const changed = await h.service.applyForAttempt(
      'attempt-1',
      { ...verified, destinationAccountFingerprint: 'b'.repeat(64) },
      actor,
    );
    expect(changed).toBe(false);
    expect(h.ledger.postInTransaction).not.toHaveBeenCalled();
    expect(h.prisma.prizePayoutAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: PrizePayoutStatus.UNKNOWN }) }),
    );
  });

  it('does not post a bank payout without an already accrued prize liability', async () => {
    const h = setup();
    h.attempt.claim.prizeAccrualLedgerTxnId = null;
    await expect(h.service.applyForAttempt('attempt-1', verified, actor))
      .rejects.toThrow('Prize payout cannot succeed before prize accrual is posted');
    expect(h.ledger.postInTransaction).not.toHaveBeenCalled();
  });

  it('reverses a successful payout journal once without silently paying again', async () => {
    const h = setup();
    expect(await h.service.applyForAttempt('attempt-1', verified, actor)).toBe(true);
    const reversal = {
      ...verified,
      status: PrizePayoutStatus.REVERSED,
    };
    expect(await h.service.applyForAttempt('attempt-1', reversal, actor)).toBe(true);
    expect(await h.service.applyForAttempt('attempt-1', reversal, actor)).toBe(false);
    expect(h.ledger.postInTransaction).toHaveBeenCalledTimes(1);
    expect(h.ledger.reverseInTransaction).toHaveBeenCalledTimes(1);
    expect(h.tx.prizePayoutAttempt.update).toHaveBeenCalledTimes(2);
    expect(h.tx.prizeClaim.update).toHaveBeenCalledTimes(2);
    expect(h.wht.recordForClaim).toHaveBeenCalledTimes(1);
    const payload = h.ledger.reverseInTransaction.mock.calls[0][1];
    expect(payload.idempotencyKey).toBe('ledger:prize-payout-reversal:attempt-1');
    expect(payload.originalLedgerTxnId).toBe('payout-journal-1');
  });
});

import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrizePayoutStatus, WalletWithdrawalStatus } from '@prisma/client';
import { WitmangoWithdrawalVerificationService } from '../src/integrations/witmango/witmango-withdrawal-verification.service';

describe('WitmangoWithdrawalVerificationService', () => {
  const withdrawalId = '11111111-1111-4111-8111-111111111111';
  const fingerprint = 'a'.repeat(64);
  const withdrawal = {
    withdrawalId,
    userId: '22222222-2222-4222-8222-222222222222',
    walletId: '33333333-3333-4333-8333-333333333333',
    holdId: '44444444-4444-4444-8444-444444444444',
    amountNgn: 1000,
    currency: 'NGN',
    tenantId: 'sandbox',
    savingsAccountId: 10,
    bankCode: '058',
    bankAccountLast4: '6789',
    bankFingerprint: fingerprint,
    cbaReference: 'sw-cba-11111111-1111-4111-8111-111111111111',
    cbaTransactionId: '501',
    cbaSubmissionStartedAt: new Date(),
    paystackReference: 'sw-bank-11111111-1111-4111-8111-111111111111',
    paystackTransactionId: null,
    paystackSubmissionStartedAt: new Date(),
    status: WalletWithdrawalStatus.BANK_TRANSFER_UNKNOWN,
  };

  function setup() {
    const prisma = {
      walletWithdrawal: {
        findUnique: jest.fn().mockResolvedValue({ ...withdrawal }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      walletHold: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'HELD',
          amountNgn: 1000,
          walletId: withdrawal.walletId,
        }),
      },
    };
    const witmango = {
      isEnabled: jest.fn().mockReturnValue(true),
      getSavingsAccountWithTransactions: jest.fn().mockResolvedValue({
        id: 10,
        currency: { code: 'NGN' },
        transactions: [{
          id: 501,
          amount: 1000,
          reversed: false,
          transactionType: { withdrawal: true },
        }],
      }),
    };
    const paystack = {
      getStatus: jest.fn().mockResolvedValue({
        provider: 'PAYSTACK',
        reference: withdrawal.paystackReference,
        status: PrizePayoutStatus.SUCCEEDED,
        providerTransactionId: '999',
        amountNgn: 1000,
        currency: 'NGN',
        destinationBankCode: '058',
        destinationAccountLast4: '6789',
        destinationAccountFingerprint: fingerprint,
      }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'WITMANGO_TENANT_ID' ? 'sandbox' : undefined),
    };
    const service = new WitmangoWithdrawalVerificationService(
      prisma as never,
      witmango as never,
      paystack as never,
      config as never,
    );
    return { service, prisma, witmango, paystack, config };
  }

  it('keeps unsubmitted withdrawals read-only', async () => {
    const h = setup();
    h.prisma.walletWithdrawal.findUnique.mockResolvedValue({
      ...withdrawal,
      cbaTransactionId: null,
      cbaSubmissionStartedAt: null,
      paystackTransactionId: null,
      paystackSubmissionStartedAt: null,
      status: WalletWithdrawalStatus.RESERVED,
    });
    const result = await h.service.inspect(withdrawalId);
    expect(result.cba.evidence).toBe('NOT_SUBMITTED');
    expect(result.paystack.evidence).toBe('NOT_SUBMITTED');
    expect(result.autoFinalizePermitted).toBe(false);
    expect(h.witmango.getSavingsAccountWithTransactions).not.toHaveBeenCalled();
    expect(h.paystack.getStatus).not.toHaveBeenCalled();
  });

  it('recognizes exact verified debit and transfer evidence but never settles money', async () => {
    const h = setup();
    const result = await h.service.inspect(withdrawalId);
    expect(result.cba.evidence).toBe('CONFIRMED');
    expect(result.paystack.evidence).toBe('CONFIRMED');
    expect(result.readyForManualSettlementReview).toBe(true);
    expect(result.autoFinalizePermitted).toBe(false);
    expect(h.paystack.getStatus).toHaveBeenCalledWith(withdrawal.paystackReference);
  });

  it('refuses to accept a CBA amount mismatch', async () => {
    const h = setup();
    h.witmango.getSavingsAccountWithTransactions.mockResolvedValue({
      id: 10,
      currency: { code: 'NGN' },
      transactions: [{
        id: 501,
        amount: 500,
        reversed: false,
        transactionType: { withdrawal: true },
      }],
    });
    const result = await h.service.inspect(withdrawalId);
    expect(result.cba.evidence).toBe('MISMATCH');
    expect(result.problems).toContain('CBA_DEBIT_IDENTITY_MISMATCH');
    expect(result.readyForManualSettlementReview).toBe(false);
  });

  it('requires explicit evidence that the CBA debit is not reversed', async () => {
    const h = setup();
    h.witmango.getSavingsAccountWithTransactions.mockResolvedValue({
      id: 10,
      currency: { code: 'NGN' },
      transactions: [{
        id: 501,
        amount: 1000,
        transactionType: { withdrawal: true },
      }],
    });
    const result = await h.service.inspect(withdrawalId);
    expect(result.cba.evidence).toBe('UNKNOWN');
    expect(result.problems).toContain('CBA_REVERSAL_STATUS_UNVERIFIED');
  });

  it('refuses a Paystack destination fingerprint mismatch', async () => {
    const h = setup();
    h.paystack.getStatus.mockResolvedValue({
      provider: 'PAYSTACK',
      reference: withdrawal.paystackReference,
      status: PrizePayoutStatus.SUCCEEDED,
      amountNgn: 1000,
      currency: 'NGN',
      destinationBankCode: '058',
      destinationAccountLast4: '6789',
      destinationAccountFingerprint: 'b'.repeat(64),
    });
    const result = await h.service.inspect(withdrawalId);
    expect(result.paystack.evidence).toBe('MISMATCH');
    expect(result.problems).toContain('PAYSTACK_TRANSFER_IDENTITY_MISMATCH');
  });

  it('surfaces a confirmed bank reversal requiring controlled restoration', async () => {
    const h = setup();
    h.paystack.getStatus.mockResolvedValue({
      provider: 'PAYSTACK',
      reference: withdrawal.paystackReference,
      status: PrizePayoutStatus.REVERSED,
      amountNgn: 1000,
      currency: 'NGN',
      destinationBankCode: '058',
      destinationAccountLast4: '6789',
      destinationAccountFingerprint: fingerprint,
    });
    const result = await h.service.inspect(withdrawalId);
    expect(result.problems).toContain('CBA_DEBIT_NEEDS_CONTROLLED_RESTORATION');
    expect(result.autoFinalizePermitted).toBe(false);
  });

  it('does not treat Paystack lookup failure as a failed bank transfer', async () => {
    const h = setup();
    h.paystack.getStatus.mockRejectedValue(new Error('provider timeout'));
    const result = await h.service.inspect(withdrawalId);
    expect(result.paystack.evidence).toBe('UNKNOWN');
    expect(result.problems).toContain('PAYSTACK_LOOKUP_UNAVAILABLE');
  });

  it('fails closed for another CBA tenant', async () => {
    const h = setup();
    h.config.get.mockReturnValue('other-tenant');
    await expect(h.service.inspect(withdrawalId)).rejects.toThrow(
      ConflictException,
    );
    expect(h.paystack.getStatus).not.toHaveBeenCalled();
  });

  it('does not reveal or invent missing withdrawal records', async () => {
    const h = setup();
    h.prisma.walletWithdrawal.findUnique.mockResolvedValue(null);
    await expect(h.service.inspect(withdrawalId)).rejects.toThrow(
      NotFoundException,
    );
  });
  it('lists unresolved withdrawals without exposing bank ciphertext', async () => {
    const h = setup();
    h.prisma.walletWithdrawal.findMany.mockResolvedValue([{
      withdrawalId,
      walletId: withdrawal.walletId,
      amountNgn: 1000,
      currency: 'NGN',
      bankCode: '058',
      bankAccountLast4: '6789',
      status: WalletWithdrawalStatus.CBA_DEBIT_UNKNOWN,
      cbaReference: withdrawal.cbaReference,
      cbaTransactionId: null,
      paystackReference: withdrawal.paystackReference,
      paystackTransactionId: null,
      cbaSubmissionStartedAt: new Date(),
      paystackSubmissionStartedAt: null,
      createdAt: new Date('2026-10-24T09:00:00Z'),
      updatedAt: new Date('2026-10-24T10:00:00Z'),
    }]);
    const result = await h.service.listUnresolved(250);
    expect(h.prisma.walletWithdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'sandbox' }),
        take: 101,
        skip: 0,
      }),
    );
    expect(result.count).toBe(1);
    expect(result.withdrawals[0].nextReviewStep)
      .toBe('RECONCILE_CBA_TRANSACTION_WITHOUT_RETRY');
    expect(JSON.stringify(result)).not.toContain('bankCiphertext');
    expect(h.witmango.getSavingsAccountWithTransactions).not.toHaveBeenCalled();
    expect(h.paystack.getStatus).not.toHaveBeenCalled();
  });

  it('paginates by update time and immutable id within the configured tenant', async () => {
    const h = setup();
    await h.service.listUnresolved(20, 3);

    expect(h.prisma.walletWithdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'sandbox' }),
        skip: 40,
        take: 21,
        orderBy: [
          { updatedAt: 'asc' },
          { withdrawalId: 'asc' },
        ],
      }),
    );
  });

  it('fails closed for a missing configured tenant in the finance queue', async () => {
    const h = setup();
    h.config.get.mockReturnValue('');
    await expect(h.service.listUnresolved()).rejects.toThrow(
      ConflictException,
    );
    expect(h.prisma.walletWithdrawal.findMany).not.toHaveBeenCalled();
  });

  it('treats a lost CBA debit response as UNKNOWN and does not guess a transaction ID', async () => {
    const h = setup();
    h.prisma.walletWithdrawal.findUnique.mockResolvedValue({
      ...withdrawal,
      status: WalletWithdrawalStatus.CBA_DEBIT_UNKNOWN,
      cbaTransactionId: null,
      paystackSubmissionStartedAt: null,
    });
    const result = await h.service.inspect(withdrawalId);
    expect(result.cba.evidence).toBe('UNKNOWN');
    expect(result.problems).toContain('CBA_TRANSACTION_ID_MISSING');
    expect(result.autoFinalizePermitted).toBe(false);
    expect(h.witmango.getSavingsAccountWithTransactions).not.toHaveBeenCalled();
    expect(h.paystack.getStatus).not.toHaveBeenCalled();
  });

  it('does not turn a provider timeout into permission to resubmit a bank transfer', async () => {
    const h = setup();
    h.paystack.getStatus.mockRejectedValue(new Error('provider timed out'));
    const first = await h.service.inspect(withdrawalId);
    const second = await h.service.inspect(withdrawalId);
    expect(first.paystack.evidence).toBe('UNKNOWN');
    expect(second.paystack.evidence).toBe('UNKNOWN');
    expect(first.autoFinalizePermitted).toBe(false);
    expect(second.autoFinalizePermitted).toBe(false);
    expect(h.paystack.getStatus).toHaveBeenCalledTimes(2);
    expect(h.prisma.walletWithdrawal.findUnique).toHaveBeenCalledTimes(2);
    expect(h.witmango.getSavingsAccountWithTransactions).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate CBA transactions with the same external transaction ID', async () => {
    const h = setup();
    h.witmango.getSavingsAccountWithTransactions.mockResolvedValue({
      id: 10,
      currency: { code: 'NGN' },
      transactions: [
        { id: 501, amount: 1000, reversed: false, transactionType: { withdrawal: true } },
        { id: 501, amount: 1000, reversed: false, transactionType: { withdrawal: true } },
      ],
    });
    const result = await h.service.inspect(withdrawalId);
    expect(result.cba.evidence).toBe('UNKNOWN');
    expect(result.problems).toContain('CBA_TRANSACTION_NOT_UNIQUELY_FOUND');
    expect(result.readyForManualSettlementReview).toBe(false);
  });

  it('requires manual reconciliation for Paystack pending even when CBA debit is proven', async () => {
    const h = setup();
    h.paystack.getStatus.mockResolvedValue({
      provider: 'PAYSTACK',
      reference: withdrawal.paystackReference,
      status: PrizePayoutStatus.PROCESSING,
      amountNgn: 1000,
      currency: 'NGN',
      destinationBankCode: '058',
      destinationAccountLast4: '6789',
      destinationAccountFingerprint: fingerprint,
    });
    const result = await h.service.inspect(withdrawalId);
    expect(result.cba.evidence).toBe('CONFIRMED');
    expect(result.paystack.evidence).toBe('UNKNOWN');
    expect(result.problems).toContain('PAYSTACK_OUTCOME_NOT_TERMINAL');
    expect(result.autoFinalizePermitted).toBe(false);
  });

  it('never calls a Paystack success proof sufficient when CBA debit is uncertain', async () => {
    const h = setup();
    h.prisma.walletWithdrawal.findUnique.mockResolvedValue({
      ...withdrawal,
      cbaTransactionId: null,
      status: WalletWithdrawalStatus.CBA_DEBIT_UNKNOWN,
    });
    const result = await h.service.inspect(withdrawalId);
    expect(result.cba.evidence).toBe('UNKNOWN');
    expect(result.paystack.evidence).toBe('CONFIRMED');
    expect(result.problems).toContain('BANK_PAID_WITHOUT_CONFIRMED_CBA_DEBIT');
    expect(result.readyForManualSettlementReview).toBe(false);
  });

  it('requires controlled restoration after confirmed CBA debit and verified bank failure', async () => {
    const h = setup();
    h.paystack.getStatus.mockResolvedValue({
      provider: 'PAYSTACK',
      reference: withdrawal.paystackReference,
      status: PrizePayoutStatus.FAILED,
      amountNgn: 1000,
      currency: 'NGN',
      destinationBankCode: '058',
      destinationAccountLast4: '6789',
      destinationAccountFingerprint: fingerprint,
    });
    const result = await h.service.inspect(withdrawalId);
    expect(result.cba.evidence).toBe('CONFIRMED');
    expect(result.paystack.evidence).toBe('CONFIRMED');
    expect(result.problems).toContain('CBA_DEBIT_NEEDS_CONTROLLED_RESTORATION');
    expect(result.autoFinalizePermitted).toBe(false);
    expect(result.readyForManualSettlementReview).toBe(false);
  });

  it('never exposes the full bank account or performs financial writes during forensic inspection', async () => {
    const h = setup();
    const result = await h.service.inspect(withdrawalId);
    expect(JSON.stringify(result)).not.toContain('0123456789');
    expect(JSON.stringify(result)).not.toContain('bankCiphertext');
    expect(h.prisma.walletWithdrawal.findUnique).toHaveBeenCalledTimes(1);
    expect(h.prisma.walletHold.findUnique).toHaveBeenCalledTimes(1);
  });

});

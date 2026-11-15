import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AuditSeverity,
  LedgerOwnerType,
  PaymentGateway,
  Prisma,
  ReservedAccountStatus,
  WalletFundingStatus,
  WitmangoWalletPurpose,
} from '@prisma/client';

import { ReservedAccountTopUpService } from '../src/payments/reserved-account-topup.service';
import { WitmangoUncertainOutcomeError } from '../src/integrations/witmango/witmango-client.service';

describe('ReservedAccountTopUpService', () => {
  const walletId = '11111111-1111-4111-8111-111111111111';
  const fundingId = '33333333-3333-4333-8333-333333333333';
  const accountReference = `SW-WAL-${walletId}`;
  const paymentReference = 'MNFY|20261111|000001';
  const cbaReference = `sw-top-${fundingId}`;

  const event = {
    eventType: 'SUCCESSFUL_TRANSACTION',
    eventData: {
      paymentReference,
      transactionReference: paymentReference,
      amountPaid: '5000.00',
      product: { type: 'RESERVED_ACCOUNT', reference: accountReference },
    },
  };

  function verifiedPayment(overrides: Record<string, unknown> = {}) {
    return {
      gateway: PaymentGateway.MONNIFY,
      reference: paymentReference,
      providerTransactionId: paymentReference,
      status: 'SUCCESS',
      amountNgn: 5000,
      currency: 'NGN',
      paidAt: new Date(),
      verifiedAt: new Date(),
      metadata: null,
      raw: {
        responseBody: {
          product: { type: 'RESERVED_ACCOUNT', reference: accountReference },
        },
      },
      ...overrides,
    };
  }

  // A small in-memory funding table, so the service's own status changes are
  // what the assertions read back — not values the test set up by hand.
  function setup(options: {
    ownerType?: LedgerOwnerType;
    config?: Record<string, unknown>;
    existing?: Record<string, unknown> | null;
  } = {}) {
    const ownerType = options.ownerType ?? LedgerOwnerType.CUSTOMER;

    let row: Record<string, unknown> | null =
      options.existing === undefined ? null : options.existing;

    const base = {
      fundingId,
      walletId,
      gatewayReference: paymentReference,
      gateway: PaymentGateway.MONNIFY,
      amountNgn: 0,
      status: WalletFundingStatus.PENDING,
      providerTransactionId: null,
      failureReason: null,
      cbaReference: null,
      cbaTransactionId: null,
      cbaSavingsAccountId: null,
      creditedAt: null,
      lastVerifiedAt: null,
      updatedAt: new Date(),
    };

    if (row) {
      row = { ...base, ...row };
    }

    const reserved = {
      walletId,
      accountReference,
      status: ReservedAccountStatus.ACTIVE,
      wallet: { ownerType },
    };

    const prisma = {
      walletReservedAccount: {
        findFirst: jest.fn().mockResolvedValue(reserved),
      },
      walletFunding: {
        findUnique: jest.fn(async () => (row ? { ...row } : null)),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          row = { ...base, ...data };
          return { ...row };
        }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          row = { ...row, ...data };
          return { ...row };
        }),
        updateMany: jest.fn(
          async ({ where, data }: { where: { status: unknown }; data: Record<string, unknown> }) => {
            if (!row || row.status !== where.status) {
              return { count: 0 };
            }
            row = { ...row, ...data };
            return { count: 1 };
          },
        ),
      },
    };

    const verification = {
      verifyMonnify: jest.fn().mockResolvedValue(verifiedPayment()),
    };
    const links = {
      getActiveAccount: jest
        .fn()
        .mockResolvedValue({ clientId: 4, savingsAccountId: 10 }),
    };
    const witmango = {
      deposit: jest
        .fn()
        .mockResolvedValue({ transactionId: 91, savingsAccountId: 10 }),
      findTransactionByReference: jest.fn().mockResolvedValue(null),
    };
    const config = {
      get: jest.fn((key: string) => (options.config ?? {})[key]),
    };
    const audit = { write: jest.fn().mockResolvedValue({}) };

    const service = new ReservedAccountTopUpService(
      prisma as never,
      verification as never,
      links as never,
      witmango as never,
      config as never,
      audit as never,
    );

    return {
      service,
      prisma,
      verification,
      links,
      witmango,
      audit,
      reserved,
      current: () => row as Record<string, unknown>,
    };
  }

  it('recognises a reserved account notification', () => {
    const h = setup();

    expect(h.service.isReservedAccountEvent(event)).toBe(true);
    expect(
      h.service.isReservedAccountEvent({
        eventData: { product: { type: 'WEB_SDK', reference: 'x' } },
      }),
    ).toBe(false);
    expect(h.service.isReservedAccountEvent({})).toBe(false);
  });

  it('credits a customer deposit to their Deposit wallet', async () => {
    const h = setup();

    await h.service.handle(event);

    expect(h.links.getActiveAccount).toHaveBeenCalledWith(
      walletId,
      WitmangoWalletPurpose.DEPOSIT,
    );
    expect(h.witmango.deposit).toHaveBeenCalledWith({
      accountId: 10,
      amountNgn: 5000,
      transactionDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      reference: cbaReference,
    });
    expect(h.current()).toMatchObject({
      status: WalletFundingStatus.CREDITED,
      amountNgn: 5000,
      cbaReference,
      cbaTransactionId: 91,
      failureReason: null,
    });
  });

  it('credits an agent deposit to their Float, never Earnings', async () => {
    const h = setup({ ownerType: LedgerOwnerType.AGENT });

    await h.service.handle(event);

    expect(h.links.getActiveAccount).toHaveBeenCalledWith(
      walletId,
      WitmangoWalletPurpose.FLOAT,
    );
  });

  it('writes the CBA reference down before posting the deposit', async () => {
    const h = setup();
    const seen: unknown[] = [];
    h.witmango.deposit.mockImplementation(async () => {
      seen.push(h.current().cbaReference);
      return { transactionId: 91, savingsAccountId: 10 };
    });

    await h.service.handle(event);

    expect(seen).toEqual([cbaReference]);
  });

  it('credits the verified amount, not the one in the notification', async () => {
    const h = setup();
    h.verification.verifyMonnify.mockResolvedValue(
      verifiedPayment({ amountNgn: 1200 }),
    );

    await h.service.handle({
      ...event,
      eventData: { ...event.eventData, amountPaid: '999999.00' },
    });

    expect(h.witmango.deposit).toHaveBeenCalledWith(
      expect.objectContaining({ amountNgn: 1200 }),
    );
  });

  it('credits once however many times the notification arrives', async () => {
    const h = setup();

    await h.service.handle(event);
    await h.service.handle(event);
    await h.service.handle(event);

    expect(h.witmango.deposit).toHaveBeenCalledTimes(1);
    expect(h.prisma.walletFunding.create).toHaveBeenCalledTimes(1);
  });

  it('lets only one of two simultaneous deliveries credit', async () => {
    const h = setup();

    await Promise.all([h.service.handle(event), h.service.handle(event)]);

    expect(h.witmango.deposit).toHaveBeenCalledTimes(1);
  });

  it('survives both deliveries trying to record the payment at once', async () => {
    const h = setup();
    const realCreate = h.prisma.walletFunding.create.getMockImplementation()!;
    h.prisma.walletFunding.create.mockImplementationOnce(async (args) => {
      await realCreate(args);
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
    });

    await h.service.handle(event);

    expect(h.current().status).toBe(WalletFundingStatus.CREDITED);
  });

  it('raises a critical alert for money sent to an unknown account', async () => {
    const h = setup();
    h.prisma.walletReservedAccount.findFirst.mockResolvedValue(null);

    await h.service.handle(event);

    expect(h.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: AuditSeverity.CRITICAL,
        action: 'TOPUP_UNMATCHED',
      }),
    );
    expect(h.witmango.deposit).not.toHaveBeenCalled();
  });

  it('keeps the payment on record when Monnify cannot be reached to verify', async () => {
    const h = setup();
    h.verification.verifyMonnify.mockResolvedValue(null);

    await h.service.handle(event);

    expect(h.current()).toMatchObject({
      status: WalletFundingStatus.PENDING,
      failureReason: 'VERIFICATION_UNAVAILABLE',
    });
    expect(h.witmango.deposit).not.toHaveBeenCalled();
  });

  it('credits on a later delivery once verification is back', async () => {
    const h = setup();
    h.verification.verifyMonnify.mockResolvedValueOnce(null);

    await h.service.handle(event);
    await h.service.handle(event);

    expect(h.current().status).toBe(WalletFundingStatus.CREDITED);
    expect(h.witmango.deposit).toHaveBeenCalledTimes(1);
  });

  it('does not credit a payment Monnify says failed', async () => {
    const h = setup();
    h.verification.verifyMonnify.mockResolvedValue(
      verifiedPayment({ status: 'FAILED' }),
    );

    await h.service.handle(event);

    expect(h.current().status).toBe(WalletFundingStatus.FAILED);
    expect(h.witmango.deposit).not.toHaveBeenCalled();
  });

  it.each([
    ['an amount with kobo', { amountNgn: 1500.5 }],
    ['a zero amount', { amountNgn: 0 }],
    ['no amount', { amountNgn: null }],
    ['a foreign currency', { currency: 'USD' }],
  ])('holds %s for review instead of rounding or guessing', async (_label, override) => {
    const h = setup();
    h.verification.verifyMonnify.mockResolvedValue(verifiedPayment(override));

    await h.service.handle(event);

    expect(h.current()).toMatchObject({
      status: WalletFundingStatus.REVIEW_REQUIRED,
      failureReason: 'AMOUNT_UNUSABLE',
    });
    expect(h.witmango.deposit).not.toHaveBeenCalled();
  });

  it.each([
    ['names a different account', { responseBody: { product: { type: 'RESERVED_ACCOUNT', reference: 'SW-WAL-someone-else' } } }],
    ['names no product at all', { responseBody: {} }],
    ['is a different product type', { responseBody: { product: { type: 'WEB_SDK', reference: accountReference } } }],
  ])('credits nothing when the verified payment %s', async (_label, raw) => {
    const h = setup();
    h.verification.verifyMonnify.mockResolvedValue(verifiedPayment({ raw }));

    await h.service.handle(event);

    expect(h.current()).toMatchObject({
      status: WalletFundingStatus.REVIEW_REQUIRED,
      failureReason: 'DESTINATION_UNCONFIRMED',
    });
    expect(h.witmango.deposit).not.toHaveBeenCalled();
  });

  it('holds a deposit above the backstop limit', async () => {
    const h = setup({
      config: { WALLET_TOPUP_BACKSTOP_CUSTOMER_NGN: 4000 },
    });

    await h.service.handle(event);

    expect(h.current()).toMatchObject({
      status: WalletFundingStatus.REVIEW_REQUIRED,
      failureReason: 'OVER_LIMIT',
      amountNgn: 5000,
    });
    expect(h.witmango.deposit).not.toHaveBeenCalled();
  });

  it('applies the agent backstop to agents, not the customer one', async () => {
    const h = setup({
      ownerType: LedgerOwnerType.AGENT,
      config: {
        WALLET_TOPUP_BACKSTOP_CUSTOMER_NGN: 4000,
        WALLET_TOPUP_BACKSTOP_AGENT_NGN: 100000,
      },
    });

    await h.service.handle(event);

    expect(h.current().status).toBe(WalletFundingStatus.CREDITED);
  });

  it('holds the money when the wallet accounts are not ready', async () => {
    const h = setup();
    h.links.getActiveAccount.mockRejectedValue(
      new ConflictException('not ready'),
    );

    await h.service.handle(event);

    expect(h.current().failureReason).toBe('CBA_ACCOUNT_NOT_READY');
    expect(h.witmango.deposit).not.toHaveBeenCalled();
  });

  describe('when the CBA does not give a clean answer', () => {
    it('marks it credited if the deposit is found on the CBA', async () => {
      const h = setup();
      h.witmango.deposit.mockRejectedValue(new WitmangoUncertainOutcomeError());
      h.witmango.findTransactionByReference.mockResolvedValue({
        transactionId: 91,
        kind: 'DEPOSIT',
        amountNgn: 5000,
        reversed: false,
      });

      await h.service.handle(event);

      expect(h.witmango.findTransactionByReference).toHaveBeenCalledWith(
        10,
        cbaReference,
      );
      expect(h.current()).toMatchObject({
        status: WalletFundingStatus.CREDITED,
        cbaTransactionId: 91,
      });
    });

    it('never posts again when the deposit cannot be found', async () => {
      const h = setup();
      h.witmango.deposit.mockRejectedValue(new WitmangoUncertainOutcomeError());

      await h.service.handle(event);
      await h.service.handle(event);

      expect(h.witmango.deposit).toHaveBeenCalledTimes(1);
      expect(h.current()).toMatchObject({
        status: WalletFundingStatus.REVIEW_REQUIRED,
        failureReason: 'CBA_OUTCOME_UNCERTAIN',
      });
    });

    it.each([
      ['a different amount', { amountNgn: 4999 }],
      ['a reversed deposit', { reversed: true }],
      ['a withdrawal', { kind: 'WITHDRAWAL' }],
    ])('does not accept %s as proof', async (_label, override) => {
      const h = setup();
      h.witmango.deposit.mockRejectedValue(new WitmangoUncertainOutcomeError());
      h.witmango.findTransactionByReference.mockResolvedValue({
        transactionId: 91,
        kind: 'DEPOSIT',
        amountNgn: 5000,
        reversed: false,
        ...override,
      });

      await h.service.handle(event);

      expect(h.current().status).toBe(WalletFundingStatus.REVIEW_REQUIRED);
    });

    it('waits, and credits later, when the CBA is switched off', async () => {
      const h = setup();
      h.witmango.deposit.mockRejectedValueOnce(
        new ServiceUnavailableException('Witmango monetary operations are disabled'),
      );

      await h.service.handle(event);
      expect(h.current()).toMatchObject({
        status: WalletFundingStatus.PENDING,
        failureReason: 'CBA_UNAVAILABLE',
      });

      await h.service.handle(event);
      expect(h.current().status).toBe(WalletFundingStatus.CREDITED);
    });

    it.each([
      ['the CBA refuses it', new BadGatewayException('Witmango request failed with HTTP 403')],
      ['our own validation refuses it', new BadRequestException('Invalid date')],
    ])('sends it to finance when %s', async (_label, error) => {
      const h = setup();
      h.witmango.deposit.mockRejectedValue(error);

      await h.service.handle(event);
      await h.service.handle(event);

      expect(h.witmango.deposit).toHaveBeenCalledTimes(1);
      expect(h.current()).toMatchObject({
        status: WalletFundingStatus.REVIEW_REQUIRED,
        failureReason: 'CBA_REJECTED',
      });
    });
  });

  describe('finance reprocessing', () => {
    it('retries a refused top-up, which is safe because nothing was posted', async () => {
      const h = setup({
        existing: {
          status: WalletFundingStatus.REVIEW_REQUIRED,
          failureReason: 'CBA_REJECTED',
        },
      });

      const result = await h.service.reprocess(fundingId, 'finance-admin');

      expect(result.status).toBe(WalletFundingStatus.CREDITED);
      expect(h.witmango.deposit).toHaveBeenCalledTimes(1);
    });

    it('settles an uncertain top-up by lookup, without posting', async () => {
      const h = setup({
        existing: {
          status: WalletFundingStatus.REVIEW_REQUIRED,
          failureReason: 'CBA_OUTCOME_UNCERTAIN',
          amountNgn: 5000,
          cbaReference,
          cbaSavingsAccountId: 10,
        },
      });
      h.witmango.findTransactionByReference.mockResolvedValue({
        transactionId: 91,
        kind: 'DEPOSIT',
        amountNgn: 5000,
        reversed: false,
      });

      const result = await h.service.reprocess(fundingId, 'finance-admin');

      expect(result.status).toBe(WalletFundingStatus.CREDITED);
      expect(h.witmango.deposit).not.toHaveBeenCalled();
    });

    it('leaves an uncertain top-up alone when the lookup finds nothing', async () => {
      const h = setup({
        existing: {
          status: WalletFundingStatus.REVIEW_REQUIRED,
          failureReason: 'CBA_OUTCOME_UNCERTAIN',
          amountNgn: 5000,
          cbaReference,
          cbaSavingsAccountId: 10,
        },
      });

      const result = await h.service.reprocess(fundingId, 'finance-admin');

      expect(result.status).toBe(WalletFundingStatus.REVIEW_REQUIRED);
      expect(h.witmango.deposit).not.toHaveBeenCalled();
    });

    it('recovers a top-up abandoned before it reached the CBA', async () => {
      const h = setup({
        existing: {
          status: WalletFundingStatus.PROCESSING,
          updatedAt: new Date(Date.now() - 30 * 60 * 1000),
        },
      });

      const result = await h.service.reprocess(fundingId, 'finance-admin');

      expect(result.status).toBe(WalletFundingStatus.CREDITED);
      expect(h.witmango.deposit).toHaveBeenCalledTimes(1);
    });

    it('will not touch a top-up that is still in flight', async () => {
      const h = setup({
        existing: { status: WalletFundingStatus.PROCESSING, updatedAt: new Date() },
      });

      await expect(
        h.service.reprocess(fundingId, 'finance-admin'),
      ).rejects.toThrow(ConflictException);
      expect(h.witmango.deposit).not.toHaveBeenCalled();
    });

    it.each(['OVER_LIMIT', 'AMOUNT_UNUSABLE', 'DESTINATION_UNCONFIRMED'])(
      'will not push through a top-up held for %s',
      async (failureReason) => {
        const h = setup({
          existing: {
            status: WalletFundingStatus.REVIEW_REQUIRED,
            failureReason,
          },
        });

        await expect(
          h.service.reprocess(fundingId, 'finance-admin'),
        ).rejects.toThrow(ConflictException);
        expect(h.witmango.deposit).not.toHaveBeenCalled();
      },
    );

    it('will not reprocess one already credited', async () => {
      const h = setup({ existing: { status: WalletFundingStatus.CREDITED } });

      await expect(
        h.service.reprocess(fundingId, 'finance-admin'),
      ).rejects.toThrow(ConflictException);
    });

    it('reports an unknown top-up', async () => {
      const h = setup();

      await expect(
        h.service.reprocess(fundingId, 'finance-admin'),
      ).rejects.toThrow(NotFoundException);
    });

    it('records who reprocessed it', async () => {
      const h = setup({ existing: { status: WalletFundingStatus.PENDING } });

      await h.service.reprocess(fundingId, 'finance-admin');

      expect(h.audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TOPUP_REPROCESSED',
          actor: expect.objectContaining({ id: 'finance-admin' }),
        }),
      );
    });
  });
});
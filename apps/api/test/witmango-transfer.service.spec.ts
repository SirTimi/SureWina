import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  CbaTransferPurpose,
  CbaTransferStatus,
  Prisma,
} from '@prisma/client';

import type { PrismaService } from '../src/database/prisma.service';
import {
  WitmangoClientService,
  WitmangoUncertainOutcomeError,
} from '../src/integrations/witmango/witmango-client.service';
import { WitmangoTransferService } from '../src/integrations/witmango/witmango-transfer.service';

type Row = Record<string, any>;

const CONFIG: Record<string, unknown> = {
  WITMANGO_WALLET_SPENDING_ENABLED: true,
  WITMANGO_OFFICE_ID: 1,
  WITMANGO_SALES_CLIENT_ID: 90,
  WITMANGO_SALES_ACCOUNT_ID: 900,
};

// A tiny in-memory cba_transfers table: enough to prove the claim-once
// rule and what each CBA answer is recorded as.
function harness(config: Record<string, unknown> = CONFIG) {
  const rows = new Map<string, Row>();
  let seq = 0;

  const cbaTransfer = {
    create: jest.fn(async ({ data }: { data: Row }) => {
      if (
        data.reversesTransferId &&
        [...rows.values()].some(
          (r) => r.reversesTransferId === data.reversesTransferId,
        )
      ) {
        throw new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row = { transferId: `t-${++seq}`, ...data };
      rows.set(row.transferId, row);
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows.get(where.transferId);
      if (!row || row.status !== where.status) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
    update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows.get(where.transferId)!;
      Object.assign(row, data);
      return { ...row };
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: { where: Row }) => {
      const row = where.transferId
        ? rows.get(where.transferId)
        : [...rows.values()].find(
            (r) => r.reversesTransferId === where.reversesTransferId,
          );
      if (!row) throw new Error('not found');
      return { ...row };
    }),
  };

  const witmango = {
    transfer: jest.fn(),
    getSavingsAccount: jest.fn(),
  };

  const service = new WitmangoTransferService(
    { cbaTransfer } as unknown as PrismaService,
    witmango as unknown as WitmangoClientService,
    { get: (key: string) => config[key] } as unknown as ConfigService,
  );

  return { service, rows, witmango, cbaTransfer };
}

const draft = {
  purpose: CbaTransferPurpose.WALLET_PURCHASE,
  walletId: 'wallet-1',
  from: { officeId: 1, clientId: 4, accountId: 10 },
  to: { officeId: 1, clientId: 90, accountId: 900 },
  amountNgn: 500,
  walletPurchaseId: 'purchase-1',
};

describe('WitmangoTransferService', () => {
  it('records a transfer as PENDING with a CBA-acceptable reference before anything is sent', async () => {
    const h = harness();
    const row = await h.service.create(draft);

    expect(row.status).toBe(CbaTransferStatus.PENDING);
    expect(row.reference).toMatch(/^[A-Za-z0-9_-]{8,50}$/);
    expect(h.witmango.transfer).not.toHaveBeenCalled();
  });

  it('refuses a transfer that is not a positive whole number of naira', async () => {
    const h = harness();
    await expect(h.service.create({ ...draft, amountNgn: 0 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(h.service.create({ ...draft, amountNgn: 12.5 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('sends a transfer once and records it as POSTED with the CBA id', async () => {
    const h = harness();
    const row = await h.service.create(draft);
    h.witmango.transfer.mockResolvedValue({ transferId: 77, fromSavingsAccountId: 10 });

    const posted = await h.service.execute(row.transferId);

    expect(posted.status).toBe(CbaTransferStatus.POSTED);
    expect(posted.cbaTransferId).toBe(77);
    expect(h.witmango.transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { officeId: 1, clientId: 4, accountId: 10 },
        to: { officeId: 1, clientId: 90, accountId: 900 },
        amountNgn: 500,
        reference: row.reference,
        transactionDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('never sends the same transfer twice, whatever its outcome', async () => {
    const h = harness();
    const row = await h.service.create(draft);
    h.witmango.transfer.mockRejectedValue(new WitmangoUncertainOutcomeError());

    await h.service.execute(row.transferId);
    const second = await h.service.execute(row.transferId);

    expect(h.witmango.transfer).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(CbaTransferStatus.UNCERTAIN);
  });

  it('records an uncertain answer as UNCERTAIN, never FAILED', async () => {
    const h = harness();
    const row = await h.service.create(draft);
    h.witmango.transfer.mockRejectedValue(new WitmangoUncertainOutcomeError());

    const result = await h.service.execute(row.transferId);

    expect(result.status).toBe(CbaTransferStatus.UNCERTAIN);
    expect(result.failureReason).toBe('CBA_OUTCOME_UNCERTAIN');
  });

  it('records a CBA refusal (4xx) as FAILED', async () => {
    const h = harness();
    const row = await h.service.create(draft);
    h.witmango.transfer.mockRejectedValue(
      new BadGatewayException('Witmango request failed with HTTP 403'),
    );

    const result = await h.service.execute(row.transferId);

    expect(result.status).toBe(CbaTransferStatus.FAILED);
    expect(result.failureReason).toBe('CBA_REJECTED');
  });

  it('records our own validation refusal as FAILED', async () => {
    const h = harness();
    const row = await h.service.create(draft);
    h.witmango.transfer.mockRejectedValue(new BadRequestException('bad'));

    expect((await h.service.execute(row.transferId)).status).toBe(
      CbaTransferStatus.FAILED,
    );
  });

  it('records a switched-off CBA as FAILED with nothing sent', async () => {
    const h = harness();
    const row = await h.service.create(draft);
    h.witmango.transfer.mockRejectedValue(
      new ServiceUnavailableException('Witmango monetary operations are disabled'),
    );

    const result = await h.service.execute(row.transferId);

    expect(result.status).toBe(CbaTransferStatus.FAILED);
    expect(result.failureReason).toBe('CBA_UNAVAILABLE');
  });

  it('treats an error of an unknown kind as UNCERTAIN, since nothing proves it did not post', async () => {
    const h = harness();
    const row = await h.service.create(draft);
    h.witmango.transfer.mockRejectedValue(new TypeError('boom'));

    expect((await h.service.execute(row.transferId)).status).toBe(
      CbaTransferStatus.UNCERTAIN,
    );
  });

  it('leaves a transfer SENDING if the CBA posted it but recording that failed', async () => {
    const h = harness();
    const row = await h.service.create(draft);
    h.witmango.transfer.mockResolvedValue({ transferId: 77, fromSavingsAccountId: 10 });
    h.cbaTransfer.update.mockRejectedValueOnce(new Error('database gone'));

    await expect(h.service.execute(row.transferId)).rejects.toThrow('database gone');
    expect(h.rows.get(row.transferId)!.status).toBe(CbaTransferStatus.SENDING);
  });

  it('reverses a posted transfer the opposite way, for the same amount', async () => {
    const h = harness();
    const row = await h.service.create(draft);
    h.witmango.transfer.mockResolvedValue({ transferId: 77, fromSavingsAccountId: 10 });
    const posted = await h.service.execute(row.transferId);

    h.witmango.transfer.mockResolvedValue({ transferId: 78, fromSavingsAccountId: 900 });
    const reversal = await h.service.reverse(posted);

    expect(reversal.status).toBe(CbaTransferStatus.POSTED);
    expect(reversal.purpose).toBe(CbaTransferPurpose.REVERSAL);
    expect(reversal.reversesTransferId).toBe(posted.transferId);
    expect(h.witmango.transfer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: { officeId: 1, clientId: 90, accountId: 900 },
        to: { officeId: 1, clientId: 4, accountId: 10 },
        amountNgn: 500,
      }),
    );
  });

  it('reverses a transfer at most once', async () => {
    const h = harness();
    const row = await h.service.create(draft);
    h.witmango.transfer.mockResolvedValue({ transferId: 77, fromSavingsAccountId: 10 });
    const posted = await h.service.execute(row.transferId);

    await h.service.reverse(posted);
    const again = await h.service.reverse(posted);

    // One original, one reversal — the second call found the first.
    expect(h.witmango.transfer).toHaveBeenCalledTimes(2);
    expect(again.purpose).toBe(CbaTransferPurpose.REVERSAL);
  });

  it('will not reverse a transfer that did not post', async () => {
    const h = harness();
    const row = await h.service.create(draft);
    h.witmango.transfer.mockRejectedValue(new WitmangoUncertainOutcomeError());
    const uncertain = await h.service.execute(row.transferId);

    await expect(h.service.reverse(uncertain)).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires the sales account to be configured', () => {
    const h = harness({ ...CONFIG, WITMANGO_SALES_ACCOUNT_ID: undefined });
    expect(() => h.service.salesEndpoint()).toThrow(ServiceUnavailableException);
  });

  it('is off unless deliberately switched on', () => {
    expect(harness({}).service.isSpendingEnabled()).toBe(false);
    expect(harness().service.isSpendingEnabled()).toBe(true);
  });

  it('reads whole naira available, and refuses an inactive account', async () => {
    const h = harness();
    h.witmango.getSavingsAccount.mockResolvedValueOnce({
      status: { id: 300 },
      summary: { accountBalance: 1200.75, availableBalance: 1200.75 },
    });
    expect(await h.service.availableNgn({ clientId: 4, savingsAccountId: 10 })).toBe(1200);

    h.witmango.getSavingsAccount.mockResolvedValueOnce({
      status: { id: 600 },
      summary: { accountBalance: 0, availableBalance: 0 },
    });
    await expect(
      h.service.availableNgn({ clientId: 4, savingsAccountId: 10 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('Witmango client: server errors on writes', () => {
  const baseConfig: Record<string, unknown> = {
    WITMANGO_ENABLED: true,
    WITMANGO_MONETARY_ENABLED: true,
    WITMANGO_PAYMENT_TYPE_ID: 3,
    WITMANGO_BASE_URL: 'https://cba.example.test/fineract-provider/api',
    WITMANGO_TENANT_ID: 'test-tenant',
    WITMANGO_USERNAME: 'u',
    WITMANGO_PASSWORD: 'p',
    NODE_ENV: 'test',
  };

  function client(status: number) {
    const original = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: false,
      status,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const c = new WitmangoClientService({
      get: (key: string) => baseConfig[key],
    } as unknown as ConfigService);
    return { c, restore: () => { global.fetch = original; } };
  }

  const transfer = {
    from: { officeId: 1, clientId: 4, accountId: 10 },
    to: { officeId: 1, clientId: 90, accountId: 900 },
    amountNgn: 500,
    transactionDate: '2026-11-15',
    reference: 'sw-xfr-0001abcd',
  };

  it.each([500, 502, 503, 504])(
    'treats HTTP %i on a transfer as uncertain — it may have posted',
    async (status) => {
      const { c, restore } = client(status);
      try {
        await expect(c.transfer(transfer)).rejects.toBeInstanceOf(
          WitmangoUncertainOutcomeError,
        );
      } finally {
        restore();
      }
    },
  );

  it('still treats a 4xx on a transfer as a definite refusal', async () => {
    const { c, restore } = client(400);
    try {
      const error = await c.transfer(transfer).catch((e) => e);
      expect(error).toBeInstanceOf(BadGatewayException);
      expect(error).not.toBeInstanceOf(WitmangoUncertainOutcomeError);
    } finally {
      restore();
    }
  });

  it('treats a 5xx on a read as a plain failure', async () => {
    const { c, restore } = client(500);
    try {
      const error = await c.getSavingsAccount(10).catch((e) => e);
      expect(error).toBeInstanceOf(BadGatewayException);
      expect(error).not.toBeInstanceOf(WitmangoUncertainOutcomeError);
    } finally {
      restore();
    }
  });
});

import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  WitmangoClientService,
  WitmangoUncertainOutcomeError,
} from '../src/integrations/witmango/witmango-client.service';

const baseConfig: Record<string, unknown> = {
  WITMANGO_ENABLED: true,
  WITMANGO_MONETARY_ENABLED: true,
  WITMANGO_PAYMENT_TYPE_ID: 3,
  WITMANGO_BASE_URL: 'https://cba.example.test/fineract-provider/api',
  WITMANGO_TENANT_ID: 'test-tenant',
  WITMANGO_USERNAME: 'sandbox-user',
  WITMANGO_PASSWORD: 'sandbox-password',
  WITMANGO_TIMEOUT_MS: 10000,
  NODE_ENV: 'test',
};

const BASE = 'https://cba.example.test/fineract-provider/api';

function harness(overrides: Record<string, unknown> = {}) {
  const config = {
    get: jest.fn((key: string) => ({
      ...baseConfig,
      ...overrides,
    } as Record<string, unknown>)[key]),
  };
  const fetchMock = jest.fn() as jest.Mock;
  const originalFetch = global.fetch;
  global.fetch = fetchMock as unknown as typeof fetch;
  const client = new WitmangoClientService(
    config as unknown as ConfigService,
  );
  return { client, fetchMock, restore: () => { global.fetch = originalFetch; } };
}

function jsonResponse(status: number, data: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => data),
  } as unknown as Response;
}

function sentBody(fetchMock: jest.Mock): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

const movement = {
  accountId: 10,
  amountNgn: 5000,
  transactionDate: '2026-11-08',
  reference: 'sw-dep-0001abcd',
};

describe('Witmango CBA monetary operations', () => {
  afterEach(() => jest.restoreAllMocks());

  it('refuses every write while monetary operations are switched off', async () => {
    const h = harness({ WITMANGO_MONETARY_ENABLED: false });
    try {
      await expect(h.client.deposit(movement)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(h.client.withdraw(movement)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(
        h.client.transfer({
          from: { officeId: 1, clientId: 4, accountId: 10 },
          to: { officeId: 1, clientId: 8, accountId: 17 },
          amountNgn: 500,
          transactionDate: '2026-11-08',
          reference: 'sw-tkt-0001abcd',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(h.fetchMock).not.toHaveBeenCalled();
    } finally {
      h.restore();
    }
  });

  it('still allows reads when monetary operations are off', async () => {
    const h = harness({ WITMANGO_MONETARY_ENABLED: false });
    try {
      h.fetchMock.mockResolvedValue(jsonResponse(200, []));
      await expect(h.client.listSavingsProducts()).resolves.toEqual([]);
    } finally {
      h.restore();
    }
  });

  it('posts a deposit with the reference as receipt number', async () => {
    const h = harness();
    try {
      h.fetchMock.mockResolvedValue(
        jsonResponse(200, { clientId: 4, officeId: 1, resourceId: 91, savingsId: 10 }),
      );

      await expect(h.client.deposit(movement)).resolves.toEqual({
        transactionId: 91,
        savingsAccountId: 10,
      });

      expect(h.fetchMock).toHaveBeenCalledWith(
        `${BASE}/v1/savingsaccounts/10/transactions?command=deposit`,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(sentBody(h.fetchMock)).toEqual({
        transactionDate: '08 November 2026',
        transactionAmount: 5000,
        paymentTypeId: 3,
        receiptNumber: 'sw-dep-0001abcd',
        note: 'sw-dep-0001abcd',
        dateFormat: 'dd MMMM yyyy',
        locale: 'en',
      });
    } finally {
      h.restore();
    }
  });

  it('posts a withdrawal through the withdrawal command', async () => {
    const h = harness();
    try {
      h.fetchMock.mockResolvedValue(
        jsonResponse(200, { resourceId: 92, savingsId: 10 }),
      );
      await h.client.withdraw(movement);
      expect(h.fetchMock).toHaveBeenCalledWith(
        `${BASE}/v1/savingsaccounts/10/transactions?command=withdrawal`,
        expect.anything(),
      );
    } finally {
      h.restore();
    }
  });

  it.each([
    ['zero', 0],
    ['negative', -500],
    ['fractional', 100.5],
  ])('rejects a %s amount before contacting the CBA', async (_label, amount) => {
    const h = harness();
    try {
      await expect(
        h.client.deposit({ ...movement, amountNgn: amount }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(h.fetchMock).not.toHaveBeenCalled();
    } finally {
      h.restore();
    }
  });

  it('rejects a malformed reference before contacting the CBA', async () => {
    const h = harness();
    try {
      await expect(
        h.client.deposit({ ...movement, reference: 'short' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        h.client.deposit({ ...movement, reference: 'has spaces in it' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(h.fetchMock).not.toHaveBeenCalled();
    } finally {
      h.restore();
    }
  });

  it('refuses to post when no payment type is configured', async () => {
    const h = harness({ WITMANGO_PAYMENT_TYPE_ID: undefined });
    try {
      await expect(h.client.deposit(movement)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(h.fetchMock).not.toHaveBeenCalled();
    } finally {
      h.restore();
    }
  });

  it('rejects a response that names a different account', async () => {
    const h = harness();
    try {
      h.fetchMock.mockResolvedValue(
        jsonResponse(200, { resourceId: 91, savingsId: 11 }),
      );
      await expect(h.client.deposit(movement)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    } finally {
      h.restore();
    }
  });

  it('reports a dropped connection as an uncertain outcome, not a failure', async () => {
    const h = harness();
    try {
      h.fetchMock.mockRejectedValue(new Error('socket hang up'));
      await expect(h.client.deposit(movement)).rejects.toBeInstanceOf(
        WitmangoUncertainOutcomeError,
      );
    } finally {
      h.restore();
    }
  });

  it('keeps an uncertain outcome catchable as the broader unavailable type', async () => {
    const h = harness();
    try {
      h.fetchMock.mockRejectedValue(new Error('timeout'));
      await expect(h.client.deposit(movement)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    } finally {
      h.restore();
    }
  });

  it('sends a transfer with both sides and the reference as description', async () => {
    const h = harness();
    try {
      h.fetchMock.mockResolvedValue(
        jsonResponse(200, { resourceId: 7, savingsId: 10 }),
      );

      await expect(
        h.client.transfer({
          from: { officeId: 1, clientId: 4, accountId: 10 },
          to: { officeId: 1, clientId: 8, accountId: 17 },
          amountNgn: 500,
          transactionDate: '2026-11-08',
          reference: 'sw-tkt-0001abcd',
        }),
      ).resolves.toEqual({ transferId: 7, fromSavingsAccountId: 10 });

      expect(h.fetchMock).toHaveBeenCalledWith(
        `${BASE}/v1/accounttransfers`,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(sentBody(h.fetchMock)).toEqual({
        fromOfficeId: 1,
        fromClientId: 4,
        fromAccountType: 2,
        fromAccountId: 10,
        toOfficeId: 1,
        toClientId: 8,
        toAccountType: 2,
        toAccountId: 17,
        transferAmount: 500,
        transferDate: '08 November 2026',
        transferDescription: 'sw-tkt-0001abcd',
        dateFormat: 'dd MMMM yyyy',
        locale: 'en',
      });
    } finally {
      h.restore();
    }
  });

  it('refuses a transfer from an account to itself', async () => {
    const h = harness();
    try {
      await expect(
        h.client.transfer({
          from: { officeId: 1, clientId: 4, accountId: 10 },
          to: { officeId: 1, clientId: 4, accountId: 10 },
          amountNgn: 500,
          transactionDate: '2026-11-08',
          reference: 'sw-tkt-0001abcd',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(h.fetchMock).not.toHaveBeenCalled();
    } finally {
      h.restore();
    }
  });

  describe('finding a transaction by reference', () => {
    function account(transactions: unknown[]) {
      return jsonResponse(200, { id: 10, transactions });
    }

    it('returns the matching transaction', async () => {
      const h = harness();
      try {
        h.fetchMock.mockResolvedValue(
          account([
            {
              id: 91,
              amount: 5000,
              reversed: false,
              transactionType: { deposit: true, withdrawal: false },
              paymentDetailData: { receiptNumber: 'sw-dep-0001abcd' },
            },
            {
              id: 92,
              amount: 200,
              transactionType: { deposit: false, withdrawal: true },
              paymentDetailData: { receiptNumber: 'sw-wdr-9999zzzz' },
            },
          ]),
        );

        await expect(
          h.client.findTransactionByReference(10, 'sw-dep-0001abcd'),
        ).resolves.toEqual({
          transactionId: 91,
          kind: 'DEPOSIT',
          amountNgn: 5000,
          reversed: false,
        });
      } finally {
        h.restore();
      }
    });

    it('returns null when the reference never landed', async () => {
      const h = harness();
      try {
        h.fetchMock.mockResolvedValue(account([]));
        await expect(
          h.client.findTransactionByReference(10, 'sw-dep-0001abcd'),
        ).resolves.toBeNull();
      } finally {
        h.restore();
      }
    });

    it('fails loudly when the reference appears twice', async () => {
      const h = harness();
      try {
        const tx = {
          amount: 5000,
          transactionType: { deposit: true },
          paymentDetailData: { receiptNumber: 'sw-dep-0001abcd' },
        };
        h.fetchMock.mockResolvedValue(
          account([{ ...tx, id: 91 }, { ...tx, id: 93 }]),
        );
        await expect(
          h.client.findTransactionByReference(10, 'sw-dep-0001abcd'),
        ).rejects.toBeInstanceOf(BadGatewayException);
      } finally {
        h.restore();
      }
    });

    it('works while monetary operations are off, so recovery can still read', async () => {
      const h = harness({ WITMANGO_MONETARY_ENABLED: false });
      try {
        h.fetchMock.mockResolvedValue(account([]));
        await expect(
          h.client.findTransactionByReference(10, 'sw-dep-0001abcd'),
        ).resolves.toBeNull();
      } finally {
        h.restore();
      }
    });
  });
});
import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { WitmangoClientService } from '../src/integrations/witmango/witmango-client.service';
import { WitmangoFinanceController } from '../src/admin-ops/witmango-finance.controller';

const baseConfig: Record<string, unknown> = {
  WITMANGO_ENABLED: true,
  WITMANGO_BASE_URL: 'https://cba.example.test/fineract-provider/api',
  WITMANGO_TENANT_ID: 'test-tenant',
  WITMANGO_USERNAME: 'sandbox-user',
  WITMANGO_PASSWORD: 'sandbox-password',
  WITMANGO_TIMEOUT_MS: 10000,
  NODE_ENV: 'test',
};

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

describe('Witmango read-only CBA integration', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fails closed when disabled and never sends credentials', async () => {
    const h = harness({ WITMANGO_ENABLED: false });
    try {
      await expect(h.client.listGlAccounts()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(h.fetchMock).not.toHaveBeenCalled();
    } finally {
      h.restore();
    }
  });

  it('uses the documented Fineract base path, Basic Auth and tenant header', async () => {
    const h = harness();
    try {
      h.fetchMock.mockResolvedValue(jsonResponse(200, []));
      await expect(h.client.listSavingsProducts()).resolves.toEqual([]);
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
      expect(h.fetchMock).toHaveBeenCalledWith(
        'https://cba.example.test/fineract-provider/api/v1/savingsproducts',
        expect.objectContaining({
          method: 'GET',
          redirect: 'error',
          headers: expect.objectContaining({
            Authorization:
              `Basic ${Buffer.from('sandbox-user:sandbox-password').toString('base64')}`,
            'Fineract-Platform-TenantId': 'test-tenant',
            'Cache-Control': 'no-store',
          }),
          signal: expect.any(AbortSignal),
        }),
      );
    } finally {
      h.restore();
    }
  });

  it('reads a documented NGN savings balance without updating SureWina money', async () => {
    const h = harness();
    try {
      h.fetchMock.mockResolvedValue(jsonResponse(200, {
        id: 10,
        accountNo: '6200292001',
        status: { id: 300, code: 'savingsAccountStatusType.active' },
        currency: { code: 'NGN' },
        summary: {
          accountBalance: 2300,
          availableBalance: 2300,
          totalDeposits: 2300,
        },
      }));

      const result = await h.client.getSavingsAccount(10);
      expect(result.id).toBe(10);
      expect(result.summary.availableBalance).toBe(2300);
      expect(h.fetchMock.mock.calls[0][0])
        .toBe('https://cba.example.test/fineract-provider/api/v1/savingsaccounts/10');
    } finally {
      h.restore();
    }
  });

  it('rejects malformed account ids before any network activity', async () => {
    const h = harness();
    try {
      await expect(h.client.getSavingsAccount(-1)).rejects.toBeInstanceOf(BadRequestException);
      await expect(h.client.getSavingsAccount(1.5)).rejects.toBeInstanceOf(BadRequestException);
      expect(h.fetchMock).not.toHaveBeenCalled();
    } finally {
      h.restore();
    }
  });

  it('refuses HTTP in production even if it is localhost', async () => {
    const h = harness({
      NODE_ENV: 'production',
      WITMANGO_BASE_URL: 'http://localhost:8443/fineract-provider/api',
    });
    try {
      await expect(h.client.listGlAccounts()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(h.fetchMock).not.toHaveBeenCalled();
    } finally {
      h.restore();
    }
  });

  it('does not expose sensitive upstream response bodies to callers', async () => {
    const h = harness();
    try {
      h.fetchMock.mockResolvedValue(jsonResponse(401, {
        message: 'sandbox-password must not leave the server',
      }));
      await expect(h.client.listGlAccounts()).rejects.toThrow(
        'Witmango request failed with HTTP 401',
      );
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      h.restore();
    }
  });

  it('rejects invalid or wrong-currency account responses', async () => {
    const h = harness();
    try {
      h.fetchMock.mockResolvedValue(jsonResponse(200, {
        id: 10,
        accountNo: '123',
        status: { id: 300 },
        currency: { code: 'USD' },
        summary: { accountBalance: 300, availableBalance: 300 },
      }));
      await expect(h.client.getSavingsAccount(10)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    } finally {
      h.restore();
    }
  });

  it('Finance probe exposes only connectivity, not GL data', async () => {
    const h = harness();
    try {
      h.fetchMock.mockResolvedValue(jsonResponse(200, [{ id: 7, name: 'CBA GL' }]));
      const controller = new WitmangoFinanceController(h.client);
      await expect(controller.probe()).resolves.toEqual({
        enabled: true,
        connected: true,
        glAccountsReceived: true,
        savingsProductsReceived: true,
      });
    } finally {
      h.restore();
    }
  });

  it('Finance probe when disabled does not call the CBA', async () => {
    const h = harness({ WITMANGO_ENABLED: false });
    try {
      const controller = new WitmangoFinanceController(h.client);
      await expect(controller.probe()).resolves.toEqual({
        enabled: false,
        connected: false,
      });
      expect(h.fetchMock).not.toHaveBeenCalled();
    } finally {
      h.restore();
    }
  });
});

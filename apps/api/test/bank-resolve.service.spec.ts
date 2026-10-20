/// <reference types="jest" />

import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { BankResolveService } from '../src/claims/kyc/bank-resolve.service';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function harness(secret = 'sk_test_example') {
  const config = {
    get: jest.fn((key: string) => ({
      PAYSTACK_SECRET_KEY: secret,
      PAYSTACK_BASE_URL: 'https://api.paystack.co',
    } as Record<string, string>)[key]),
  };

  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  global.fetch = fetchMock as typeof fetch;

  const service = new BankResolveService(
    config as unknown as ConfigService,
  );

  return {
    service,
    fetchMock,
    restore: () => { global.fetch = originalFetch; },
  };
}

const banksResponse = {
  status: true,
  data: [
    {
      code: '058',
      name: 'Guaranty Trust Bank',
      active: true,
      currency: 'NGN',
      type: 'nuban',
    },
    {
      code: '044',
      name: 'Access Bank',
      active: true,
      currency: 'NGN',
      type: 'nuban',
    },
    {
      code: '999',
      name: 'Inactive Bank',
      active: false,
      currency: 'NGN',
    },
  ],
  meta: { next: null },
};

describe('Paystack BankResolveService', () => {
  it('lists active Nigerian banks and caches results', async () => {
    const h = harness();
    try {
      h.fetchMock.mockResolvedValue(
        jsonResponse(200, banksResponse),
      );

      const first = await h.service.listBanks();
      const second = await h.service.listBanks();

      expect(first.banks).toEqual([
        { code: '044', name: 'Access Bank' },
        { code: '058', name: 'Guaranty Trust Bank' },
      ]);
      expect(second).toEqual(first);
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      h.restore();
    }
  });

  it('resolves a valid bank account using Paystack', async () => {
    const h = harness();
    try {
      h.fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, banksResponse),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, {
            status: true,
            data: {
              account_number: '0123456789',
              account_name: 'TEST CUSTOMER',
            },
          }),
        );

      await expect(
        h.service.resolve('0123456789', '058'),
      ).resolves.toEqual({
        accountNumber: '0123456789',
        bankCode: '058',
        accountName: 'TEST CUSTOMER',
      });

      expect(h.fetchMock.mock.calls[1][0]).toContain(
        '/bank/resolve?account_number=0123456789&bank_code=058',
      );
    } finally {
      h.restore();
    }
  });

  it('rejects invalid NUBAN numbers before calling Paystack', async () => {
    const h = harness();
    try {
      await expect(
        h.service.resolve('12345', '058'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(h.fetchMock).not.toHaveBeenCalled();
    } finally {
      h.restore();
    }
  });

  it('rejects unsupported bank codes', async () => {
    const h = harness();
    try {
      h.fetchMock.mockResolvedValue(
        jsonResponse(200, banksResponse),
      );

      await expect(
        h.service.resolve('0123456789', '999'),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      h.restore();
    }
  });

  it('rejects an unsuccessful account lookup', async () => {
    const h = harness();
    try {
      h.fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, banksResponse),
        )
        .mockResolvedValueOnce(
          jsonResponse(422, {
            status: false,
            message: 'Could not resolve',
          }),
        );

      await expect(
        h.service.resolve('0123456789', '058'),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      h.restore();
    }
  });

  it('rejects a mismatched account number in the response', async () => {
    const h = harness();
    try {
      h.fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, banksResponse),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, {
            status: true,
            data: {
              account_number: '9999999999',
              account_name: 'OTHER PERSON',
            },
          }),
        );

      await expect(
        h.service.resolve('0123456789', '058'),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      h.restore();
    }
  });

  it('fails closed when credentials are missing', async () => {
    const h = harness('');
    try {
      await expect(
        h.service.listBanks(),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(h.fetchMock).not.toHaveBeenCalled();
    } finally {
      h.restore();
    }
  });

  it('handles network failures without exposing details', async () => {
    const h = harness();
    try {
      h.fetchMock.mockRejectedValue(
        new Error('Internal provider connection details'),
      );

      await expect(
        h.service.listBanks(),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      h.restore();
    }
  });
});

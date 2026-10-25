
import { ServiceUnavailableException } from '@nestjs/common';
import { PrizePayoutStatus } from '@prisma/client';
import { createHmac } from 'node:crypto';

import { PaystackPrizePayoutProvider } from '../src/claims/payout/paystack-prize-payout.provider';

describe('PaystackPrizePayoutProvider', () => {
  const reference =
    'sw-prize-11111111-1111-4111-8111-111111111111';

  const fingerprintKey = 'surewina-test-fingerprint-key-123456789';

  const input = {
    idempotencyKey: reference,
    bankCode: '058',
    accountNumber: '0123456789',
    accountName: 'TEST CUSTOMER',
    amountNgn: 5000,
    reason: 'SureWina test prize',
  };

  const recipient = {
    recipient_code: 'RCP_test123456789',
    currency: 'NGN',
    type: 'nuban',
    details: {
      bank_code: input.bankCode,
      account_number: input.accountNumber,
    },
  };

  const transfer = {
    id: 1001,
    reference,
    status: 'pending',
    amount: 500000,
    currency: 'NGN',
    recipient,
  };

  function setup(enabled = true, overrides: Record<string, unknown> = {}) {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          PAYSTACK_TRANSFERS_ENABLED: enabled,
          PAYSTACK_SECRET_KEY: 'sk_test_mock',
          PAYSTACK_BASE_URL: 'https://api.paystack.co',
          PAYSTACK_TRANSFER_FEE_BUFFER_KOBO: 100000,
          KYC_BANK_FINGERPRINT_KEY: fingerprintKey,
          ...overrides,
        };

        return values[key];
      }),
    };

    const fetchMock = jest.spyOn(global, 'fetch');

    const provider = new PaystackPrizePayoutProvider(
      config as never,
    );

    return { provider, fetchMock };
  }

  function respond(data: unknown, status = 200) {
    return new Response(
      JSON.stringify({
        status: status === 200,
        data,
      }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  function mockTransferFlow(
    fetchMock: jest.SpyInstance,
    options: {
      balance?: number;
      recipient?: typeof recipient;
      transfer?: typeof transfer;
    } = {},
  ) {
    fetchMock.mockImplementation(
      async (url: string) => {
        const path = new URL(url).pathname;

        if (path === '/balance') {
          return respond([
            {
              currency: 'NGN',
              balance: options.balance ?? 2000000,
            },
          ]);
        }

        if (path === '/transferrecipient') {
          return respond(options.recipient ?? recipient);
        }

        if (path.startsWith('/transferrecipient/')) {
          return respond(options.recipient ?? recipient);
        }

        if (path === '/transfer') {
          return respond(options.transfer ?? transfer);
        }

        if (path.startsWith('/transfer/verify/')) {
          return respond(options.transfer ?? transfer);
        }

        throw new Error(`Unexpected test endpoint: ${path}`);
      },
    );
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks transfers when disabled', async () => {
    const { provider, fetchMock } = setup(false);

    await expect(provider.initiate(input)).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never initiates directly against production Paystack before acceptance', async () => {
    const { provider, fetchMock } = setup(true, {
      NODE_ENV: 'production',
      PAYSTACK_SECRET_KEY: 'sk_live_mock_not_real',
    });
    await expect(provider.initiate(input)).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send real transfers using a live key from staging', async () => {
    const { provider, fetchMock } = setup(true, {
      NODE_ENV: 'staging',
      PAYSTACK_SECRET_KEY: 'sk_live_mock_not_real',
    });
    await expect(provider.initiate(input)).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks transfers with insufficient balance', async () => {
    const { provider, fetchMock } = setup();

    mockTransferFlow(fetchMock, {
      balance: 100000,
    });

    await expect(provider.initiate(input)).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(
      fetchMock.mock.calls.some(
        ([url]) => new URL(String(url)).pathname === '/transfer',
      ),
    ).toBe(false);
  });

  it('rejects a mismatched transfer recipient', async () => {
    const { provider, fetchMock } = setup();

    mockTransferFlow(fetchMock, {
      recipient: {
        ...recipient,
        details: {
          ...recipient.details,
          account_number: '9999999999',
        },
      },
    });

    await expect(provider.initiate(input)).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(
      fetchMock.mock.calls.some(
        ([url]) => new URL(String(url)).pathname === '/transfer',
      ),
    ).toBe(false);
  });

  it('initiates with the stable reference and amount in kobo', async () => {
    const { provider, fetchMock } = setup();

    mockTransferFlow(fetchMock);

    const result = await provider.initiate(input);

    expect(result.provider).toBe('PAYSTACK');
    expect(result.reference).toBe(reference);
    expect(result.status).toBe(PrizePayoutStatus.PROCESSING);

    const call = fetchMock.mock.calls.find(
      ([url]) => new URL(String(url)).pathname === '/transfer',
    );

    expect(call).toBeDefined();

    const body = JSON.parse(
      String(call![1]?.body),
    );

    expect(body).toEqual(
      expect.objectContaining({
        source: 'balance',
        amount: 500000,
        currency: 'NGN',
        recipient: recipient.recipient_code,
        reference,
      }),
    );
  });

  it('does not mark initiation as successful settlement', async () => {
    const { provider, fetchMock } = setup();

    mockTransferFlow(fetchMock, {
      transfer: {
        ...transfer,
        status: 'success',
      },
    });

    const result = await provider.initiate(input);

    expect(result.status).toBe(PrizePayoutStatus.PROCESSING);
  });

  it('verifies a completed transfer with full destination evidence', async () => {
    const { provider, fetchMock } = setup();

    mockTransferFlow(fetchMock, {
      transfer: {
        ...transfer,
        status: 'success',
      },
    });

    const result = await provider.getStatus(reference);

    const expectedFingerprint = createHmac(
      'sha256',
      fingerprintKey,
    )
      .update(
        `surewina:bank:v1:${input.bankCode}:${input.accountNumber}`,
      )
      .digest('hex');

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'PAYSTACK',
        reference,
        status: PrizePayoutStatus.SUCCEEDED,
        amountNgn: 5000,
        currency: 'NGN',
        destinationBankCode: '058',
        destinationAccountLast4: '6789',
        destinationAccountFingerprint: expectedFingerprint,
      }),
    );
  });

  it.each([
    ['pending', PrizePayoutStatus.PROCESSING],
    ['queued', PrizePayoutStatus.SUBMITTED],
    ['failed', PrizePayoutStatus.FAILED],
    ['reversed', PrizePayoutStatus.REVERSED],
    ['otp', PrizePayoutStatus.UNKNOWN],
  ])('maps Paystack %s to %s', async (rawStatus, expected) => {
    const { provider, fetchMock } = setup();

    mockTransferFlow(fetchMock, {
      transfer: {
        ...transfer,
        status: rawStatus,
      },
    });

    const result = await provider.getStatus(reference);

    expect(result.status).toBe(expected);
  });

  it('rejects a transfer lookup with another reference', async () => {
    const { provider, fetchMock } = setup();

    mockTransferFlow(fetchMock, {
      transfer: {
        ...transfer,
        reference: 'different-reference-12345',
        status: 'success',
      },
    });

    const result = await provider.getStatus(reference);

    expect(result.status).toBe(PrizePayoutStatus.UNKNOWN);
  });

  it('does not approve success without recipient evidence', async () => {
    const { provider, fetchMock } = setup();

    mockTransferFlow(fetchMock, {
      transfer: {
        ...transfer,
        status: 'success',
        recipient: 12345 as never,
      },
    });

    const result = await provider.getStatus(reference);

    expect(result.status).toBe(PrizePayoutStatus.UNKNOWN);
  });

  it('does not approve success with inconsistent amount', async () => {
    const { provider, fetchMock } = setup();

    mockTransferFlow(fetchMock, {
      transfer: {
        ...transfer,
        status: 'success',
        amount: 500001,
      },
    });

    const result = await provider.getStatus(reference);

    expect(result.status).toBe(PrizePayoutStatus.UNKNOWN);
  });

  it('does not treat a provider timeout as confirmed failure', async () => {
    const { provider, fetchMock } = setup();

    fetchMock.mockRejectedValue(new Error('Network timeout'));

    await expect(provider.getStatus(reference)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

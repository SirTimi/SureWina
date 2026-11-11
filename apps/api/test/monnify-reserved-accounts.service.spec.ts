import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { MonnifyReservedAccountsService } from '../src/integrations/monnify/monnify-reserved-accounts.service';

describe('MonnifyReservedAccountsService', () => {
  const reference = 'SW-WAL-11111111-1111-4111-8111-111111111111';

  const input = {
    accountReference: reference,
    accountName: 'Olatunde Ogunboyejo',
    customerName: 'Olatunde Ogunboyejo',
    customerEmail: 'Tunde@Example.com',
    bvn: '22222222226',
    limitProfileCode: 'CUSTLIMIT01',
  };

  function setup(overrides: Record<string, unknown> = {}) {
    const client = { request: jest.fn() };
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          MONNIFY_RESERVED_ACCOUNTS_ENABLED: true,
          MONNIFY_CONTRACT_CODE: '8389328412',
          ...overrides,
        };
        return values[key];
      }),
    };
    const service = new MonnifyReservedAccountsService(
      client as never,
      config as never,
    );
    return { service, client };
  }

  function ok(body: unknown) {
    return {
      httpStatus: 200,
      payload: {
        requestSuccessful: true,
        responseMessage: 'success',
        responseCode: '0',
        responseBody: body,
      },
    };
  }

  const reservation = {
    accountReference: reference,
    reservationReference: 'NWA7DMJ0W2UDK1KN5SLF',
    status: 'ACTIVE',
    accounts: [
      { bankCode: '50515', bankName: 'Moniepoint Microfinance Bank', accountNumber: '6254727989', accountName: 'Tes' },
      { bankCode: '035', bankName: 'Wema bank', accountNumber: '7206930470', accountName: 'Tes' },
    ],
  };

  it('does nothing while funding accounts are switched off', async () => {
    const h = setup({ MONNIFY_RESERVED_ACCOUNTS_ENABLED: false });

    await expect(h.service.reserve(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(h.service.find(reference)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(h.client.request).not.toHaveBeenCalled();
  });

  it('reserves with the limit profile attached at creation', async () => {
    const h = setup();
    h.client.request.mockResolvedValue(ok(reservation));

    await expect(h.service.reserve(input)).resolves.toEqual({
      outcome: 'RESERVED',
      reservationReference: 'NWA7DMJ0W2UDK1KN5SLF',
      accounts: [
        { bankCode: '50515', bankName: 'Moniepoint Microfinance Bank', accountNumber: '6254727989' },
        { bankCode: '035', bankName: 'Wema bank', accountNumber: '7206930470' },
      ],
    });

    const [path, init] = h.client.request.mock.calls[0];
    expect(path).toBe('/api/v2/bank-transfer/reserved-accounts/limit');
    expect(JSON.parse(init.body)).toEqual({
      accountReference: reference,
      accountName: 'Olatunde Ogunboyejo',
      currencyCode: 'NGN',
      contractCode: '8389328412',
      customerEmail: 'tunde@example.com',
      customerName: 'Olatunde Ogunboyejo',
      bvn: '22222222226',
      limitProfileCode: 'CUSTLIMIT01',
      getAllAvailableBanks: true,
    });
  });

  it('accepts a response describing a single account inline', async () => {
    const h = setup();
    h.client.request.mockResolvedValue(
      ok({
        accountReference: reference,
        reservationReference: 'QSD79W83J766XMFYM58L',
        status: 'ACTIVE',
        accountNumber: '9907335053',
        bankName: 'Moniepoint Microfinance Bank',
        bankCode: '50515',
      }),
    );

    const result = await h.service.reserve(input);

    expect(result).toMatchObject({
      outcome: 'RESERVED',
      accounts: [{ accountNumber: '9907335053' }],
    });
  });

  it('reports an existing reservation as a duplicate, not a failure', async () => {
    const h = setup();
    h.client.request.mockResolvedValue({
      httpStatus: 400,
      payload: {
        requestSuccessful: false,
        responseMessage: 'You can not reserve two accounts with the same reference.',
        responseCode: '99',
      },
    });

    await expect(h.service.reserve(input)).resolves.toEqual({
      outcome: 'DUPLICATE_REFERENCE',
    });
  });

  it.each([
    ['a different reference', { accountReference: 'SW-WAL-someone-else-entirely' }],
    ['an inactive status', { status: 'INACTIVE' }],
    ['no reservation reference', { reservationReference: '' }],
    ['no accounts', { accounts: [] }],
    ['a malformed account number', { accounts: [{ bankCode: '035', bankName: 'Wema bank', accountNumber: '12345' }] }],
  ])('refuses a reservation with %s', async (_label, override) => {
    const h = setup();
    h.client.request.mockResolvedValue(ok({ ...reservation, ...override }));

    await expect(h.service.reserve(input)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('refuses a partly valid list rather than showing some of it', async () => {
    const h = setup();
    h.client.request.mockResolvedValue(
      ok({
        ...reservation,
        accounts: [reservation.accounts[0], { bankCode: '035', bankName: 'Wema bank', accountNumber: 'oops' }],
      }),
    );

    await expect(h.service.reserve(input)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('reports any other failure as unavailable', async () => {
    const h = setup();
    h.client.request.mockResolvedValue({
      httpStatus: 500,
      payload: { requestSuccessful: false, responseMessage: 'Service unavailable' },
    });

    await expect(h.service.reserve(input)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it.each([
    ['a malformed BVN', { bvn: '123' }],
    ['a missing limit profile', { limitProfileCode: ' ' }],
    ['a malformed email', { customerEmail: 'nope' }],
    ['a malformed reference', { accountReference: 'has spaces' }],
  ])('rejects %s before contacting Monnify', async (_label, override) => {
    const h = setup();

    await expect(
      h.service.reserve({ ...input, ...override }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.client.request).not.toHaveBeenCalled();
  });

  it('refuses to reserve without a contract code', async () => {
    const h = setup({ MONNIFY_CONTRACT_CODE: '' });

    await expect(h.service.reserve(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(h.client.request).not.toHaveBeenCalled();
  });

  describe('looking a reservation up', () => {
    it('returns it by reference', async () => {
      const h = setup();
      h.client.request.mockResolvedValue(ok(reservation));

      const found = await h.service.find(reference);

      expect(found?.reservationReference).toBe('NWA7DMJ0W2UDK1KN5SLF');
      expect(h.client.request.mock.calls[0][0]).toBe(
        `/api/v2/bank-transfer/reserved-accounts/${reference}`,
      );
    });

    it('returns null when Monnify has none', async () => {
      const h = setup();
      h.client.request.mockResolvedValue({
        httpStatus: 404,
        payload: { requestSuccessful: false, responseMessage: 'Cannot find reserved account' },
      });

      await expect(h.service.find(reference)).resolves.toBeNull();
    });

    it('does not mistake an outage for "no reservation"', async () => {
      const h = setup();
      h.client.request.mockResolvedValue({
        httpStatus: 503,
        payload: { requestSuccessful: false, responseMessage: 'Service unavailable' },
      });

      await expect(h.service.find(reference)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });
});
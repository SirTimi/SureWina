import { ServiceUnavailableException } from '@nestjs/common';

import {
  MonnifyVerificationService,
  SANDBOX_TEST_BVNS,
} from '../src/integrations/monnify/monnify-verification.service';

function setup(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    MONNIFY_IDENTITY_VERIFICATION_ENABLED: true,
    MONNIFY_SANDBOX_VERIFICATION_MOCK: true,
    MONNIFY_BASE_URL: 'https://sandbox.monnify.com',
    MONNIFY_API_KEY: 'MK_TEST_ABC123',
    ...overrides,
  };
  const client = { request: jest.fn() };
  const config = { get: jest.fn((key: string) => values[key]) };
  const service = new MonnifyVerificationService(client as never, config as never);
  return { service, client };
}

const details = (bvn: string) => ({
  bvn,
  name: 'Ade Okafor',
  dateOfBirth: '1990-01-31',
  mobileNo: '08030000000',
});

const account = (bvn: string, accountNumber = '0123456789') => ({
  bvn,
  bankCode: '058',
  accountNumber,
});

describe('Sandbox stand-in for Monnify BVN checks (live-only on Monnify)', () => {
  it('answers from the test BVNs without calling Monnify', async () => {
    const h = setup();

    await expect(h.service.matchBvnDetails(details(SANDBOX_TEST_BVNS.MATCH))).resolves.toEqual({
      outcome: 'CHECKED',
      name: 'FULL_MATCH',
      dateOfBirth: 'FULL_MATCH',
      mobileNo: 'FULL_MATCH',
    });
    await expect(h.service.matchBvnDetails(details(SANDBOX_TEST_BVNS.MISMATCH))).resolves.toMatchObject({
      outcome: 'CHECKED',
      name: 'NO_MATCH',
    });
    await expect(h.service.matchBvnDetails(details(SANDBOX_TEST_BVNS.INVALID))).resolves.toEqual({
      outcome: 'INVALID_BVN',
    });
    await expect(h.service.matchBvnDetails(details('12345678901'))).resolves.toEqual({
      outcome: 'INVALID_BVN',
    });

    await expect(h.service.matchBvnToAccount(account(SANDBOX_TEST_BVNS.MATCH))).resolves.toEqual({
      outcome: 'MATCHED',
      accountName: 'SANDBOX TEST ACCOUNT',
    });
    await expect(
      h.service.matchBvnToAccount(account(SANDBOX_TEST_BVNS.MATCH, '0123450000')),
    ).resolves.toEqual({ outcome: 'NOT_MATCHED' });
    await expect(h.service.matchBvnToAccount(account(SANDBOX_TEST_BVNS.MISMATCH))).resolves.toEqual({
      outcome: 'NOT_MATCHED',
    });

    expect(h.client.request).not.toHaveBeenCalled();
  });

  it('refuses every check if switched on against live Monnify settings', async () => {
    for (const overrides of [
      { MONNIFY_BASE_URL: 'https://api.monnify.com' },
      { MONNIFY_API_KEY: 'MK_PROD_ABC123' },
      { MONNIFY_BASE_URL: 'not a url' },
      { MONNIFY_BASE_URL: 'https://sandbox.monnify.com.evil.example' },
    ]) {
      const h = setup(overrides);

      await expect(
        h.service.matchBvnDetails(details(SANDBOX_TEST_BVNS.MATCH)),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(
        h.service.matchBvnToAccount(account(SANDBOX_TEST_BVNS.MATCH)),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(h.client.request).not.toHaveBeenCalled();
    }
  });

  it('calls Monnify as normal when the stand-in is off', async () => {
    const h = setup({ MONNIFY_SANDBOX_VERIFICATION_MOCK: false });
    h.client.request.mockResolvedValue({
      httpStatus: 200,
      payload: {
        requestSuccessful: true,
        responseCode: '0',
        responseBody: { accountNumber: '0123456789', accountName: 'ADE OKAFOR', matchStatus: 'FULL_MATCH' },
      },
    });

    await expect(h.service.matchBvnToAccount(account(SANDBOX_TEST_BVNS.MATCH))).resolves.toEqual({
      outcome: 'MATCHED',
      accountName: 'ADE OKAFOR',
    });
    expect(h.client.request).toHaveBeenCalledTimes(1);
  });

  it('still needs identity verification itself switched on', async () => {
    const h = setup({ MONNIFY_IDENTITY_VERIFICATION_ENABLED: false });

    await expect(
      h.service.matchBvnDetails(details(SANDBOX_TEST_BVNS.MATCH)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

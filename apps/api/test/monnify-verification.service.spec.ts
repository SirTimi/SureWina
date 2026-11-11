import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { MonnifyVerificationService } from '../src/integrations/monnify/monnify-verification.service';

describe('MonnifyVerificationService', () => {
  const input = {
    bvn: '22222222226',
    name: 'Olatunde Ogunboyejo',
    dateOfBirth: '1993-04-27',
    mobileNo: '08142223149',
  };

  function setup(enabled = true) {
    const client = { request: jest.fn() };
    const config = {
      get: jest.fn((key: string) =>
        key === 'MONNIFY_IDENTITY_VERIFICATION_ENABLED' ? enabled : undefined,
      ),
    };
    const service = new MonnifyVerificationService(
      client as never,
      config as never,
    );
    return { service, client };
  }

  function success(body: unknown) {
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

  it('does nothing while verification is switched off', async () => {
    const h = setup(false);

    await expect(h.service.matchBvnDetails(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(h.client.request).not.toHaveBeenCalled();
  });

  it('sends the documented request with the date in Monnify format', async () => {
    const h = setup();
    h.client.request.mockResolvedValue(
      success({
        bvn: input.bvn,
        name: { matchStatus: 'FULL_MATCH', matchPercentage: 100 },
        dateOfBirth: 'FULL_MATCH',
        mobileNo: 'NO_MATCH',
      }),
    );

    await expect(h.service.matchBvnDetails(input)).resolves.toEqual({
      outcome: 'CHECKED',
      name: 'FULL_MATCH',
      dateOfBirth: 'FULL_MATCH',
      mobileNo: 'NO_MATCH',
    });

    const [path, init] = h.client.request.mock.calls[0];
    expect(path).toBe('/api/v1/vas/bvn-details-match');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      bvn: '22222222226',
      name: 'Olatunde Ogunboyejo',
      dateOfBirth: '27-Apr-1993',
      mobileNo: '08142223149',
    });
  });

  it('reports a BVN Monnify does not recognise, distinct from a mismatch', async () => {
    const h = setup();
    h.client.request.mockResolvedValue({
      httpStatus: 200,
      payload: {
        requestSuccessful: false,
        responseMessage: 'Unable to process request. Invalid BVN provided',
        responseCode: '99',
      },
    });

    await expect(h.service.matchBvnDetails(input)).resolves.toEqual({
      outcome: 'INVALID_BVN',
    });
  });

  it('never treats an incomplete result as a pass', async () => {
    const h = setup();
    h.client.request.mockResolvedValue(
      success({
        name: { matchStatus: 'FULL_MATCH' },
        dateOfBirth: 'FULL_MATCH',
      }),
    );

    await expect(h.service.matchBvnDetails(input)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('never treats an unknown status as a pass', async () => {
    const h = setup();
    h.client.request.mockResolvedValue(
      success({
        name: { matchStatus: 'PROBABLY' },
        dateOfBirth: 'FULL_MATCH',
        mobileNo: 'FULL_MATCH',
      }),
    );

    await expect(h.service.matchBvnDetails(input)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('reports any other upstream failure as unavailable', async () => {
    const h = setup();
    h.client.request.mockResolvedValue({
      httpStatus: 500,
      payload: { requestSuccessful: false, responseMessage: 'Service unavailable' },
    });

    await expect(h.service.matchBvnDetails(input)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it.each([
    ['a short BVN', { bvn: '12345' }],
    ['a short mobile number', { mobileNo: '0801' }],
    ['a malformed date', { dateOfBirth: '27/04/1993' }],
  ])('rejects %s before contacting Monnify', async (_label, override) => {
    const h = setup();

    await expect(
      h.service.matchBvnDetails({ ...input, ...override }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.client.request).not.toHaveBeenCalled();
  });
});
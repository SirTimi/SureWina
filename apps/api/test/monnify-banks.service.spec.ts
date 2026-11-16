import { ServiceUnavailableException } from '@nestjs/common';

import { MonnifyBanksService } from '../src/integrations/monnify/monnify-banks.service';
import type { MonnifyClientService } from '../src/integrations/monnify/monnify-client.service';

function harness(responses: Array<{ httpStatus: number; payload: unknown }>) {
  const request = jest.fn(async (_path: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next;
  });

  const service = new MonnifyBanksService({ request } as unknown as MonnifyClientService);

  return { service, request };
}

const ok = (banks: unknown[]) => ({
  httpStatus: 200,
  payload: { requestSuccessful: true, responseCode: '0', responseBody: banks },
});

describe("Monnify's bank list for withdrawals", () => {
  it('returns Monnify codes, sorted by name, dropping blanks, duplicates and non-digit codes', async () => {
    const h = harness([
      ok([
        { code: '058', name: 'Guaranty Trust Bank' },
        { code: '044', name: 'Access Bank' },
        { code: '044', name: 'Access Bank (duplicate)' },
        { code: '035A', name: 'ALAT' },
        { code: '', name: 'Nameless code' },
        { code: '090267', name: '' },
        { code: ' 090405 ', name: ' Moniepoint MFB ' },
      ]),
    ]);

    const { banks } = await h.service.listBanks();

    expect(banks).toEqual([
      { code: '044', name: 'Access Bank' },
      { code: '058', name: 'Guaranty Trust Bank' },
      { code: '090405', name: 'Moniepoint MFB' },
    ]);
    expect(h.request).toHaveBeenCalledWith('/api/v1/banks', { method: 'GET' });
  });

  it('asks Monnify once and then serves from memory', async () => {
    const h = harness([ok([{ code: '058', name: 'Guaranty Trust Bank' }])]);

    await h.service.listBanks();
    expect(await h.service.findBank('058')).toEqual({ code: '058', name: 'Guaranty Trust Bank' });
    expect(await h.service.findBank('50211')).toBeNull();
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it('refuses rather than offering an empty or failed list', async () => {
    await expect(
      harness([{ httpStatus: 503, payload: null }]).service.listBanks(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    await expect(
      harness([
        { httpStatus: 200, payload: { requestSuccessful: false, responseMessage: 'nope' } },
      ]).service.listBanks(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    await expect(harness([ok([])]).service.listBanks()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('keeps using the last good list if a refresh fails', async () => {
    const h = harness([ok([{ code: '058', name: 'Guaranty Trust Bank' }]), { httpStatus: 500, payload: null }]);

    await h.service.listBanks();

    const realNow = Date.now;
    Date.now = () => realNow() + 7 * 60 * 60 * 1000;
    try {
      const { banks } = await h.service.listBanks();
      expect(banks).toEqual([{ code: '058', name: 'Guaranty Trust Bank' }]);
      expect(h.request).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = realNow;
    }
  });
});

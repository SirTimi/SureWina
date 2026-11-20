import { BadRequestException } from '@nestjs/common';

import { UncollectedPrizesService } from '../src/admin-ops/uncollected-prizes.service';

type AnyRecord = Record<string, any>;

function harness() {
  const calls: AnyRecord = {};
  const draw = { drawId: 'd1', drawCode: 'RD-DRAW-20261201-DAILY', scheduledAt: new Date('2026-12-01T19:00:00Z'), prizeTiers: [{ tierNo: 3, name: 'Bronze' }] };
  const prisma = {
    retainedPrize: {
      findMany: jest.fn(async (args: AnyRecord) => {
        calls.findMany = args;
        return [
          { retainedId: 'r1', recordedAt: new Date('2026-12-01T19:00:05Z'), kind: 'UNAWARDED', amountNgn: 200000, tierNo: 3, claimId: null, note: null, draw },
          { retainedId: 'r2', recordedAt: new Date('2026-12-31T19:01:00Z'), kind: 'UNCLAIMED', amountNgn: 25000, tierNo: null, claimId: 'c1', note: null, draw },
        ];
      }),
      count: jest.fn(async () => 2),
      groupBy: jest.fn(async () => [
        { kind: 'UNAWARDED', _sum: { amountNgn: 200000 }, _count: { _all: 1 } },
        { kind: 'UNCLAIMED', _sum: { amountNgn: 25000 }, _count: { _all: 1 } },
      ]),
    },
    prizeClaim: {
      findMany: jest.fn(async () => [{
        claimId: 'c1', winnerTicketRef: 'SW-000007', winnerPhone: '+2348031234567',
        claimDeadlineAt: new Date('2026-12-31T19:00:00Z'), drawWinner: { tierName: 'Gold', prizeDescription: '₦25,000 (Gold)' },
      }]),
    },
  };
  return { service: new UncollectedPrizesService(prisma as never), calls };
}

describe('Uncollected prizes ledger', () => {
  it('lists each entry with its date, draw, prize and (for unclaimed prizes) the claim', async () => {
    const h = harness();
    const out = await h.service.list({});
    expect(out.rows[0]).toMatchObject({ kind: 'UNAWARDED', tierName: 'Bronze', amountNgn: 200000, claim: null, recordedAt: '2026-12-01T19:00:05.000Z' });
    expect(out.rows[1]).toMatchObject({
      kind: 'UNCLAIMED', tierName: 'Gold',
      claim: { winnerTicketRef: 'SW-000007', winnerPhone: '+23480****567', prizeDescription: '₦25,000 (Gold)' },
    });
    expect(out.totals).toMatchObject({
      ROUNDING: { count: 0, amountNgn: 0 },
      UNAWARDED: { count: 1, amountNgn: 200000 },
      UNCLAIMED: { count: 1, amountNgn: 25000 },
      all: { count: 2, amountNgn: 225000 },
    });
  });

  it('filters by date (a bare end date covers that whole day) and kind', async () => {
    const h = harness();
    await h.service.list({ fromDate: '2026-12-01', toDate: '2026-12-31', kind: 'UNCLAIMED' as never });
    expect(h.calls.findMany.where.kind).toBe('UNCLAIMED');
    expect(h.calls.findMany.where.recordedAt.lte.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  it('refuses a date it cannot read', async () => {
    await expect(harness().service.list({ fromDate: 'soon' })).rejects.toThrow(BadRequestException);
  });
});

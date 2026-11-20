import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { DrawsService } from '../src/draws/draws.service';
import { CreateDrawDto } from '../src/draws/dto/create-draw.dto';

type AnyRecord = Record<string, any>;

const poolTiers = [
  { tierNo: 1, name: 'Gold', active: true, allocationBp: 2500, prizePerWinnerNgn: 25000 },
  { tierNo: 2, name: 'Silver', active: true, allocationBp: 2000, prizePerWinnerNgn: 10000 },
  { tierNo: 3, name: 'Bronze', active: true, allocationBp: 5500, prizePerWinnerNgn: 5000 },
];

function harness(existing: AnyRecord | null = null, existingTiers: AnyRecord[] = []) {
  const created: AnyRecord[] = [];
  const updates: AnyRecord[] = [];
  const tierWrites: AnyRecord[] = [];
  const audits: AnyRecord[] = [];
  let lockedOut = false;

  const tx = {
    draw: {
      updateMany: jest.fn(async (args: AnyRecord) => { updates.push(args); return { count: lockedOut ? 0 : 1 }; }),
      findUniqueOrThrow: jest.fn(async () => ({ ...existing, drawCode: 'RD-DRAW-X' })),
    },
    drawPrizeTier: {
      deleteMany: jest.fn(async () => { tierWrites.push({ op: 'delete' }); return { count: 0 }; }),
      createMany: jest.fn(async ({ data }: AnyRecord) => { tierWrites.push({ op: 'create', data }); return { count: data.length }; }),
    },
  };
  const prisma = {
    draw: {
      create: jest.fn(async ({ data }: AnyRecord) => { created.push(data); return { drawId: 'd1', ...data }; }),
      findUnique: jest.fn(async () => existing),
    },
    drawPrizeTier: { findMany: jest.fn(async () => existingTiers) },
    ticket: { aggregate: jest.fn(async () => ({ _sum: { faceValueNgn: 1_800_000 }, _count: { _all: 3600 } })) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { write: jest.fn(async (e: AnyRecord) => { audits.push(e); }) };
  const service = new DrawsService(prisma as never, audit as never);
  return { service, created, updates, tierWrites, audits, lockOut: () => { lockedOut = true; } };
}

const base = {
  drawType: 'DAILY_STANDARD',
  prizeDescription: 'Daily prize pool',
  ticketPriceNgn: 500,
  scheduledAt: '2026-12-01T19:00:00.000Z',
  cutoffAt: '2026-12-01T18:30:00.000Z',
};

describe('Draw setup: prize pools and jackpot stages', () => {
  it('creates a pool draw with its tiers; the headline prize is the guaranteed minimum', async () => {
    const h = harness();
    await h.service.create({ ...base, prizeModel: 'POOL', poolPayoutBp: 5000, poolMinimumNgn: 500000, tiers: poolTiers } as never, 'admin-1');

    expect(h.created[0]).toMatchObject({
      prizeModel: 'POOL', poolPayoutBp: 5000, poolMinimumNgn: 500000, poolRevenueBasis: 'GROSS', prizeValueNgn: 500000,
    });
    expect(h.created[0].prizeTiers.create).toHaveLength(3);
    expect(h.audits[0].metadata).toMatchObject({ prizeModel: 'POOL', poolPayoutBp: 5000 });
  });

  it('refuses shares that do not add up to 100%, listing the reason', async () => {
    const h = harness();
    const bad = poolTiers.map((t) => (t.tierNo === 3 ? { ...t, allocationBp: 5000 } : t));
    await expect(
      h.service.create({ ...base, prizeModel: 'POOL', poolPayoutBp: 5000, poolMinimumNgn: 500000, tiers: bad } as never, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
    try {
      await h.service.create({ ...base, prizeModel: 'POOL', poolPayoutBp: 5000, poolMinimumNgn: 500000, tiers: bad } as never, 'admin-1');
    } catch (e) {
      expect(JSON.stringify((e as BadRequestException).getResponse())).toContain('add up to 95%');
    }
    expect(h.created).toHaveLength(0);
  });

  it('creates jackpot stages; the headline is the stages total', async () => {
    const h = harness();
    await h.service.create({
      ...base, drawType: 'SATURDAY_JACKPOT', prizeModel: 'STAGES',
      tiers: [
        { tierNo: 1, name: 'Jackpot', active: true, winnerCount: 1, prizePerWinnerNgn: 5_000_000 },
        { tierNo: 2, name: 'Consolation', active: true, winnerCount: 10, prizePerWinnerNgn: 50_000 },
        { tierNo: 3, name: 'Second consolation', active: false, winnerCount: 20, prizePerWinnerNgn: 10_000 },
      ],
    } as never, 'admin-1');
    expect(h.created[0]).toMatchObject({ prizeModel: 'STAGES', prizeValueNgn: 5_500_000, poolPayoutBp: null });
  });

  it('refuses jackpot stages with stage 1 switched off', async () => {
    const h = harness();
    await expect(h.service.create({
      ...base, prizeModel: 'STAGES',
      tiers: [{ tierNo: 1, name: 'Jackpot', active: false, winnerCount: 1, prizePerWinnerNgn: 5_000_000 }],
    } as never, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('still creates single-prize draws as before', async () => {
    const h = harness();
    await h.service.create({ ...base, prizeValueNgn: 100000 } as never, 'admin-1');
    expect(h.created[0]).toMatchObject({ prizeModel: 'SINGLE', prizeValueNgn: 100000, poolPayoutBp: null });
    expect(h.created[0].prizeTiers.create).toEqual([]);
  });

  it('accepts a pool draw request body without a prize value, but not a single one', async () => {
    const pool = plainToInstance(CreateDrawDto, { ...base, prizeModel: 'POOL', poolPayoutBp: 5000, poolMinimumNgn: 1, tiers: poolTiers });
    expect(await validate(pool)).toEqual([]);
    const single = plainToInstance(CreateDrawDto, { ...base });
    expect((await validate(single)).map((e) => e.property)).toContain('prizeValueNgn');
  });

  it('changing the payout ratio replaces the tiers and is flagged in the audit', async () => {
    const existing = {
      drawId: 'd1', status: 'SCHEDULED', prizeModel: 'POOL', prizeValueNgn: 500000,
      poolPayoutBp: 5000, poolMinimumNgn: 500000, poolRevenueBasis: 'GROSS',
      scheduledAt: new Date(base.scheduledAt), cutoffAt: new Date(base.cutoffAt),
    };
    const h = harness(existing, poolTiers.map((t) => ({ ...t, winnerCount: null, prizeDescription: null })));
    await h.service.update('d1', { poolPayoutBp: 4000 } as never, 'admin-1');

    expect(h.updates[0].where).toMatchObject({ status: 'SCHEDULED', prizeConfigLockedAt: null });
    expect(h.updates[0].data).toMatchObject({ poolPayoutBp: 4000, poolMinimumNgn: 500000 });
    expect(h.tierWrites.map((w) => w.op)).toEqual(['delete', 'create']);
    expect(h.audits[0]).toMatchObject({ severity: 'WARNING', metadata: { poolTermsChanged: true } });
  });

  it('refuses to edit once sales have opened, even in a race', async () => {
    const existing = {
      drawId: 'd1', status: 'SCHEDULED', prizeModel: 'SINGLE', prizeValueNgn: 1000,
      scheduledAt: new Date(base.scheduledAt), cutoffAt: new Date(base.cutoffAt),
    };
    const h = harness(existing);
    h.lockOut();
    await expect(h.service.update('d1', { prizeValueNgn: 2000 } as never, 'admin-1')).rejects.toThrow(ConflictException);
    expect(h.audits).toHaveLength(0);
  });

  it('previews the plan at chosen revenues and at the draw\'s sales so far', async () => {
    const h = harness();
    const out = await h.service.prizePreview({
      prizeModel: 'POOL', poolPayoutBp: 5000, poolMinimumNgn: 500000, tiers: poolTiers,
      revenuesNgn: [600_000, 1_800_000], drawId: 'd1',
    } as never);

    expect(out.valid).toBe(true);
    expect(out.breakEvenRevenueNgn).toBe(1_000_000);
    expect(out.scenarios.map((p) => [p.poolNgn, p.fundingShortfallNgn, p.totalWinners])).toEqual([
      [500_000, 200_000, 70],
      [900_000, 0, 126],
    ]);
    expect(out.current).toMatchObject({ eligibleRevenueNgn: 1_800_000, ticketsSold: 3600, plan: { totalWinners: 126 } });
  });

  it('returns the reasons, not an error, when the preview setup is incomplete', async () => {
    const h = harness();
    const out = await h.service.prizePreview({ prizeModel: 'POOL', poolPayoutBp: 5000, poolMinimumNgn: 0, tiers: [] } as never);
    expect(out.valid).toBe(false);
    expect(out.errors.length).toBeGreaterThan(0);
  });
});

import { BadRequestException, ConflictException } from '@nestjs/common';

import { DrawSchedulerService } from '../../worker/src/draw-scheduler.service';
import { LifecycleService } from '../../engine/src/lifecycle.service';
import { ProductsService } from '../src/products/products.service';
import { DrawTemplateController } from '../src/admin-ops/draw-template.controller';

type AnyRecord = Record<string, any>;

const dailyTiers = [
  { tierNo: 1, name: 'First', active: true, allocationBp: 1000, winnerCount: null, prizePerWinnerNgn: 50000, prizeDescription: null, itemPrize: false },
  { tierNo: 2, name: 'Second', active: true, allocationBp: 2000, winnerCount: null, prizePerWinnerNgn: 10000, prizeDescription: null, itemPrize: false },
  { tierNo: 3, name: 'Third', active: true, allocationBp: 3000, winnerCount: null, prizePerWinnerNgn: 2000, prizeDescription: null, itemPrize: false },
  { tierNo: 4, name: 'Fourth', active: true, allocationBp: 4000, winnerCount: null, prizePerWinnerNgn: 500, prizeDescription: null, itemPrize: false },
];

const product = {
  productId: 'p-100', code: 'SW100', name: 'Sure 100', ticketLabel: 'SURE 100', kind: 'DAILY_STANDARD', active: true,
  ticketPriceNgn: 100, prizeDescription: 'Win up to ₦50,000', prizeModel: 'POOL', poolPayoutBp: 5000,
  poolMinimumNgn: 200000, poolRevenueBasis: 'GROSS', prizeTiers: dailyTiers, version: 3, approvedAt: new Date('2026-11-01'),
};

const template = (slotCode: string, open: number, previousDay: boolean, cutoff: number, draw: number, p: AnyRecord | null = product) => ({
  templateId: `t-${slotCode}`, templateType: 'DAILY_STANDARD', productId: p ? p.productId : null, product: p, slotCode,
  label: slotCode, prizeDescription: 'x', prizeValueNgn: 1, ticketPriceNgn: 1, ticketQuota: null,
  salesOpenMinutesWat: open, salesOpenPreviousDay: previousDay, cutoffMinutesWat: cutoff, scheduledMinutesWat: draw,
  weekdays: [0, 1, 2, 3, 4, 5, 6], version: 1, status: 'ACTIVE',
});

const NOON = () => template('NOON', 19 * 60, true, 11 * 60, 12 * 60);
const EVENING = () => template('EVENING', 13 * 60, false, 17 * 60, 18 * 60);

function schedulerHarness(templates: AnyRecord[]) {
  const created: AnyRecord[] = [];
  const prisma = {
    drawTemplate: { findMany: jest.fn(async () => templates) },
    draw: { create: jest.fn(async ({ data }: AnyRecord) => { created.push(data); return { drawId: `d-${created.length}`, ...data }; }) },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const scheduler = new DrawSchedulerService(prisma as never);
  const tick = () => (scheduler as unknown as { tick(): Promise<void> }).tick();
  return { tick, created };
}

describe('Scheduler: twice-daily product draws', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-12-01T09:00:00Z')); }); // 10:00 WAT
  afterEach(() => jest.useRealTimers());

  it('creates a noon and an evening draw per product per day, with the sales windows', async () => {
    const h = schedulerHarness([NOON(), EVENING()]);
    await h.tick();

    const today = h.created.filter((d) => d.drawCode.includes('20261201'));
    expect(today.map((d) => d.drawCode).sort()).toEqual(['RD-SW100-20261201-EVENING', 'RD-SW100-20261201-NOON']);

    const noon = today.find((d) => d.slotCode === 'NOON')!;
    // Sales 7pm the evening before until 11am; draw at 12 noon (WAT = UTC+1).
    expect(noon.salesOpenAt.toISOString()).toBe('2026-11-30T18:00:00.000Z');
    expect(noon.cutoffAt.toISOString()).toBe('2026-12-01T10:00:00.000Z');
    expect(noon.scheduledAt.toISOString()).toBe('2026-12-01T11:00:00.000Z');

    const evening = today.find((d) => d.slotCode === 'EVENING')!;
    expect(evening.salesOpenAt.toISOString()).toBe('2026-12-01T12:00:00.000Z');
    expect(evening.cutoffAt.toISOString()).toBe('2026-12-01T16:00:00.000Z');
    expect(evening.scheduledAt.toISOString()).toBe('2026-12-01T17:00:00.000Z');

    // A week of both slots.
    expect(h.created).toHaveLength(14);
  });

  it('copies the product: price, prize pool and all 4 categories', async () => {
    const h = schedulerHarness([NOON()]);
    await h.tick();
    expect(h.created[0]).toMatchObject({
      drawType: 'DAILY_STANDARD', productId: 'p-100', ticketPriceNgn: 100, prizeModel: 'POOL',
      poolPayoutBp: 5000, poolMinimumNgn: 200000, prizeValueNgn: 200000, status: 'SCHEDULED',
    });
    expect(h.created[0].prizeTiers.create).toHaveLength(4);
  });

  it('skips a day whose cutoff has passed, and products that are off or unapproved', async () => {
    jest.setSystemTime(new Date('2026-12-01T10:30:00Z')); // 11:30 WAT: noon sales closed
    const off = { ...product, productId: 'p-off', code: 'OFF', active: false };
    const unapproved = { ...product, productId: 'p-new', code: 'NEW', approvedAt: null };
    const h = schedulerHarness([NOON(), template('NOON', 1140, true, 660, 720, off), template('NOON', 1140, true, 660, 720, unapproved)]);
    await h.tick();
    expect(h.created.map((d) => d.drawCode)).not.toContain('RD-SW100-20261201-NOON');
    expect(h.created.every((d) => d.productId === 'p-100')).toBe(true);
  });

  it('jackpot products get stage draws on their days only', async () => {
    const jackpot = {
      ...product, productId: 'p-jp', code: 'JP500', kind: 'SATURDAY_JACKPOT', prizeModel: 'STAGES', poolPayoutBp: null, poolMinimumNgn: null,
      prizeTiers: [
        { tierNo: 1, name: 'Jackpot', active: true, winnerCount: 1, prizePerWinnerNgn: 3_000_000, prizeDescription: 'Car', itemPrize: true },
        { tierNo: 2, name: 'Consolation', active: true, winnerCount: 10, prizePerWinnerNgn: 50_000 },
        { tierNo: 3, name: 'Second consolation', active: false, winnerCount: 20, prizePerWinnerNgn: 10_000 },
      ],
    };
    const t = { ...template('SAT', 13 * 60, false, 19 * 60, 20 * 60, jackpot), templateType: 'SATURDAY_JACKPOT', weekdays: [3, 6] };
    const h = schedulerHarness([t]);
    await h.tick();
    expect(h.created.map((d) => d.drawCode)).toEqual(['RD-JP500-20261202-SAT', 'RD-JP500-20261205-SAT']); // Wed, Sat
    expect(h.created[0]).toMatchObject({ drawType: 'SATURDAY_JACKPOT', prizeModel: 'STAGES', prizeValueNgn: 3_500_000 });
    expect(h.created[0].prizeTiers.create[0]).toMatchObject({ itemPrize: true, prizeDescription: 'Car' });
  });

  it('still schedules old single-prize templates the old way', async () => {
    const legacy = { ...template('X', 0, false, 18 * 60, 19 * 60, null), productId: null, product: null, salesOpenMinutesWat: null };
    const h = schedulerHarness([legacy]);
    await h.tick();
    expect(h.created[0].drawCode).toBe('RD-DRAW-20261201-DAILY');
    expect(h.created[0].productId).toBeUndefined();
  });
});

describe('Engine: sales open at their time, not before', () => {
  it('only opens draws whose sales-open time has come (or have none)', async () => {
    const findMany = jest.fn(async (_args: AnyRecord) => []);
    const prisma = { draw: { findMany, updateMany: jest.fn() }, auditLog: { create: jest.fn() } };
    const lifecycle = new LifecycleService(prisma as never);
    await (lifecycle as unknown as { activateCommittedDraws(): Promise<void> }).activateCommittedDraws();
    const where = (findMany.mock.calls[0] as unknown as [AnyRecord])[0].where;
    expect(where).toMatchObject({ status: 'SCHEDULED', seedCommit: { isNot: null } });
    expect(where.OR).toEqual([{ salesOpenAt: null }, { salesOpenAt: { lte: expect.any(Date) } }]);
  });
});

describe('Products: maker-checker', () => {
  function productsHarness(row: AnyRecord | null, unopened: string[] = []) {
    const audits: AnyRecord[] = [];
    const drawUpdates: AnyRecord[] = [];
    let current = row;
    const tx = {
      product: { updateMany: jest.fn(async ({ data }: AnyRecord) => { current = { ...current, ...data, pendingChange: null }; return { count: 1 }; }) },
      draw: {
        findMany: jest.fn(async () => unopened.map((drawId) => ({ drawId }))),
        updateMany: jest.fn(async (args: AnyRecord) => { drawUpdates.push(args); return { count: 1 }; }),
      },
      drawPrizeTier: { deleteMany: jest.fn(async () => ({})), createMany: jest.fn(async () => ({})) },
    };
    const prisma = {
      product: {
        findUnique: jest.fn(async () => current),
        create: jest.fn(async ({ data }: AnyRecord) => { current = { productId: 'p-new', version: 1, createdAt: new Date(), approvedAt: null, ...data }; return current; }),
        updateMany: jest.fn(async ({ data }: AnyRecord) => { current = { ...current, ...data }; return { count: 1 }; }),
        update: jest.fn(async ({ data }: AnyRecord) => { current = { ...current, ...data }; return current; }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { write: jest.fn(async (e: AnyRecord) => { audits.push(e); }) };
    return { service: new ProductsService(prisma as never, audit as never), audits, drawUpdates, current: () => current };
  }

  const terms = {
    name: 'Sure 100', ticketLabel: 'SURE 100', ticketPriceNgn: 100, prizeDescription: 'Win up to ₦50,000',
    poolPayoutBp: 5000, poolMinimumNgn: 200000, poolRevenueBasis: 'GROSS' as const, tiers: dailyTiers,
  };

  it('a new product is off and waits for approval by a different admin', async () => {
    const h = productsHarness(null);
    const created = await h.service.create({ ...terms, code: 'sw100', kind: 'DAILY_STANDARD' as never }, 'maker');
    expect(created).toMatchObject({ code: 'SW100', active: false, approved: false, pending: { isNewProduct: true } });

    await expect(h.service.approve('p-new', 'maker')).rejects.toThrow(ConflictException);
    const approved = await h.service.approve('p-new', 'checker');
    expect(approved).toMatchObject({ active: true, approved: true, pending: null });
    expect(h.audits.map((a) => a.action)).toEqual(['PRODUCT_PROPOSED', 'PRODUCT_APPROVED']);
  });

  it('a price change applies only once approved, and only to draws not yet selling', async () => {
    const h = productsHarness({ ...product, pendingChange: null, createdAt: new Date() }, ['d-unopened-1', 'd-unopened-2']);
    await h.service.proposeChange('p-100', { ...terms, ticketPriceNgn: 150 }, 'maker');
    expect(h.current()!.ticketPriceNgn).toBe(100);

    const out = await h.service.approve('p-100', 'checker');
    expect(out.updatedDraws).toBe(2);
    expect(h.drawUpdates[0]).toMatchObject({
      where: { status: 'SCHEDULED', prizeConfigLockedAt: null },
      data: { ticketPriceNgn: 150 },
    });
    expect(h.audits.at(-1)).toMatchObject({ action: 'PRODUCT_CHANGE_APPROVED', severity: 'CRITICAL' });
  });

  it('refuses a daily product with an item prize, or shares that do not add up', async () => {
    const h = productsHarness(null);
    const item = dailyTiers.map((t, i) => (i === 0 ? { ...t, itemPrize: true, prizeDescription: 'Phone' } : t));
    await expect(h.service.create({ ...terms, tiers: item, code: 'X1', kind: 'DAILY_STANDARD' as never }, 'm')).rejects.toThrow(BadRequestException);
    const short = dailyTiers.map((t, i) => (i === 3 ? { ...t, allocationBp: 3000 } : t));
    await expect(h.service.create({ ...terms, tiers: short, code: 'X2', kind: 'DAILY_STANDARD' as never }, 'm')).rejects.toThrow(BadRequestException);
  });

  it('a jackpot product takes 3 stages with item prizes', async () => {
    const h = productsHarness(null);
    const created = await h.service.create({
      ...terms, code: 'JP500', kind: 'SATURDAY_JACKPOT' as never, poolPayoutBp: null, poolMinimumNgn: null,
      tiers: [
        { tierNo: 1, name: 'Jackpot', active: true, winnerCount: 1, prizePerWinnerNgn: 3_000_000, prizeDescription: 'Car', itemPrize: true },
        { tierNo: 2, name: 'Consolation', active: true, winnerCount: 10, prizePerWinnerNgn: 50_000 },
        { tierNo: 3, name: 'Second consolation', active: false, winnerCount: 20, prizePerWinnerNgn: 10_000 },
      ] as never,
    }, 'maker');
    expect(created).toMatchObject({ prizeModel: 'STAGES', poolPayoutBp: null });
    expect(created.tiers[0]).toMatchObject({ itemPrize: true });
  });
});

describe('Schedules: approving one product slot leaves the others alone', () => {
  it('retires only the same product and slot', async () => {
    const pending = { ...NOON(), templateId: 't-new', status: 'PENDING_APPROVAL', createdByAdminId: 'maker', effectiveFrom: new Date('2026-11-01'), version: 2 };
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const prisma = {
      drawTemplate: {
        findUnique: jest.fn(async () => pending),
        updateMany,
        update: jest.fn(async ({ data }: AnyRecord) => ({ ...pending, ...data, effectiveTo: null, approvedByAdminId: 'checker', approvedAt: new Date(), rejectionNote: null, supersedesId: null, createdAt: new Date() })),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const controller = new DrawTemplateController(prisma as never, { write: jest.fn(async () => undefined) } as never);
    await controller.approve('t-new', { sub: 'checker' } as never);
    expect(updateMany).toHaveBeenCalledWith({ where: { productId: 'p-100', slotCode: 'NOON', status: 'ACTIVE' }, data: expect.any(Object) });
  });
});

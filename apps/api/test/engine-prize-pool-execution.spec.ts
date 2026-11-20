import { execFileSync } from 'child_process';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { ExecutionService } from '../../engine/src/execution.service';
import { pickWinnerIndexes } from '../../engine/src/draw-math.utils';

type AnyRecord = Record<string, unknown>;

function harness(opts: {
  prizeModel: 'SINGLE' | 'POOL' | 'STAGES';
  tickets: number;
  faceValueNgn?: number;
  agentId?: string | null;
  poolRevenueBasis?: 'GROSS' | 'NET_OF_COMMISSION';
  tiers?: AnyRecord[];
  payoutBp?: number;
  minimumNgn?: number;
  signPayload?: (p: string) => string;
}) {
  const seed = randomBytes(32);
  const seedHash = createHash('sha256').update(seed).digest('hex');
  const draw = {
    drawId: 'draw-1',
    drawCode: 'RD-DRAW-TEST',
    drawType: 'DAILY_STANDARD',
    status: 'EXECUTING',
    prizeModel: opts.prizeModel,
    prizeDescription: 'Single prize',
    prizeValueNgn: 100000,
    poolPayoutBp: opts.payoutBp ?? 5000,
    poolMinimumNgn: opts.minimumNgn ?? 500000,
    poolRevenueBasis: opts.poolRevenueBasis ?? 'GROSS',
    scheduledAt: new Date('2026-11-21T19:00:00Z'),
    seedCommit: { seedHash, sealedSeed: 'sealed', committedAt: new Date('2026-11-21T08:00:00Z') },
    prizeTiers: opts.tiers ?? [],
  };
  const tickets = Array.from({ length: opts.tickets }, (_, i) => ({
    ticketId: `t-${i}`,
    ticketRef: `SW-${String(i).padStart(6, '0')}`,
    stateOfPlayCode: 'LA',
    buyerPhone: `+23480000${String(i).padStart(5, '0')}`,
    faceValueNgn: opts.faceValueNgn ?? 500,
    agentId: opts.agentId ?? null,
  }));

  const writes: Record<string, AnyRecord[]> = {
    drawResult: [], drawWinner: [], retainedPrize: [], ticketUpdates: [], audit: [],
  };

  const tx = {
    drawResult: { create: jest.fn(async ({ data }: { data: AnyRecord }) => { writes.drawResult.push(data); return { resultId: 'result-1', ...data }; }) },
    drawWinner: { createMany: jest.fn(async ({ data }: { data: AnyRecord[] }) => { writes.drawWinner.push(...data); return { count: data.length }; }) },
    ticket: { updateMany: jest.fn(async (args: AnyRecord) => { writes.ticketUpdates.push(args); return { count: 1 }; }) },
    jackpotEntry: { updateMany: jest.fn(async () => ({ count: 0 })) },
    retainedPrize: { createMany: jest.fn(async ({ data }: { data: AnyRecord[] }) => { writes.retainedPrize.push(...data); return { count: data.length }; }) },
    draw: { update: jest.fn(async () => ({})) },
  };

  const prisma = {
    draw: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => draw),
      update: jest.fn(async () => ({})),
    },
    ticket: { findMany: jest.fn(async () => tickets) },
    jackpotEntry: { findMany: jest.fn(async () => []) },
    agent: { findMany: jest.fn(async () => [{ agentId: 'agent-1', commissionRate: { toString: () => '0.1000' }, overrideCommissionRate: null }]) },
    auditLog: { create: jest.fn(async ({ data }: { data: AnyRecord }) => { writes.audit.push(data); return data; }) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const keys = { unseal: jest.fn(() => seed), signPayload: jest.fn(opts.signPayload ?? ((p: string) => `sig:${createHash('sha256').update(p).digest('hex')}`)) };
  const queue = { enqueueWinnerSms: jest.fn(async (_job: AnyRecord) => undefined) };

  const service = new ExecutionService(prisma as never, keys as never, queue as never);
  const run = () => (service as unknown as { execute(id: string): Promise<void> }).execute('draw-1');

  return { run, writes, queue, tickets, seed, draw, prisma };
}

const poolTiers = [
  { tierNo: 1, name: 'Gold', active: true, allocationBp: 2500, winnerCount: null, prizePerWinnerNgn: 25000, prizeDescription: null },
  { tierNo: 2, name: 'Silver', active: true, allocationBp: 2000, winnerCount: null, prizePerWinnerNgn: 10000, prizeDescription: null },
  { tierNo: 3, name: 'Bronze', active: true, allocationBp: 5500, winnerCount: null, prizePerWinnerNgn: 5000, prizeDescription: null },
];

describe('Engine: prize pool draw', () => {
  it('works out the pool from revenue, picks every winner by tier, and records it all', async () => {
    // 3,600 tickets at ₦500 = ₦1.8m; 50% = ₦900k: 9 Gold, 18 Silver, 99 Bronze.
    const h = harness({ prizeModel: 'POOL', tickets: 3600, tiers: poolTiers });
    await h.run();

    const result = h.writes.drawResult[0];
    expect(result).toMatchObject({
      prizeModel: 'POOL',
      eligibleRevenueNgn: 1_800_000,
      prizePoolNgn: 900_000,
      fundingShortfallNgn: 0,
      totalWinners: 126,
      prizeValueNgn: 900_000,
      retainedNgn: 0,
      zeroInterventionConfirmed: true,
    });

    const winners = h.writes.drawWinner;
    expect(winners).toHaveLength(126);
    expect(winners.filter((w) => w.tierNo === 1)).toHaveLength(9);
    expect(winners.filter((w) => w.tierNo === 2)).toHaveLength(18);
    expect(winners.filter((w) => w.tierNo === 3)).toHaveLength(99);
    expect(new Set(winners.map((w) => w.unitId)).size).toBe(126);

    // Exactly the published method, reproducible from the revealed seed.
    const expected = pickWinnerIndexes(h.seed, 'RD-DRAW-TEST', 3600, 126).map((i) => h.tickets[i].ticketRef);
    expect(winners.map((w) => w.unitId)).toEqual(expected);
    expect(result.winnerTicketRef).toBe(expected[0]);

    // One SMS (and claim) job per winner, carrying the winner's own prize.
    expect(h.queue.enqueueWinnerSms).toHaveBeenCalledTimes(126);
    const firstJob = h.queue.enqueueWinnerSms.mock.calls[0][0];
    expect(firstJob).toMatchObject({ drawWinnerId: winners[0].winnerId, winnerRef: expected[0], prizeValueNgn: 25000 });

    // Certificate carries the figures and the randomness evidence.
    const cert = result.certificate as AnyRecord;
    expect(cert).toMatchObject({
      prizeModel: 'POOL',
      pool: { eligibleRevenueNgn: 1_800_000, payoutRatio: '50%', prizePoolNgn: 900_000, fundingShortfallNgn: 0 },
      totals: { winners: 126, awardedNgn: 900_000, retainedNgn: 0 },
    });
    expect((cert.randomness as AnyRecord).seed).toBe(h.seed.toString('hex'));
    expect(String(result.engineSignature)).toBe(`sig:${createHash('sha256').update(JSON.stringify(cert)).digest('hex')}`);
  });

  it('tops the pool up to the minimum, records the shortfall and warns', async () => {
    const h = harness({ prizeModel: 'POOL', tickets: 1200, tiers: poolTiers }); // ₦600k, 50% = ₦300k
    await h.run();

    expect(h.writes.drawResult[0]).toMatchObject({ prizePoolNgn: 500_000, fundingShortfallNgn: 200_000 });
    expect(h.writes.audit.map((a) => a.action)).toContain('DRAW_POOL_FUNDING_SHORTFALL');
  });

  it('puts rounding and unawarded prizes in the uncollected prizes ledger', async () => {
    // 30 tickets, minimum ₦500k: 5 Gold, 10 Silver, 55 Bronze planned; only 30 awarded.
    const h = harness({ prizeModel: 'POOL', tickets: 30, tiers: poolTiers });
    await h.run();

    const result = h.writes.drawResult[0];
    expect(result.totalWinners).toBe(30);
    expect(h.writes.drawWinner.map((w) => w.tierNo)).toEqual([...Array(5).fill(1), ...Array(10).fill(2), ...Array(15).fill(3)]);

    const unawarded = h.writes.retainedPrize.filter((r) => r.kind === 'UNAWARDED');
    expect(unawarded).toEqual([expect.objectContaining({ tierNo: 3, amountNgn: 40 * 5000 })]);
    expect(result.retainedNgn).toBe(200_000);
    expect((result.prizeValueNgn as number) + (result.retainedNgn as number)).toBe(500_000);
  });

  it('nets out agent commission when the draw is set to', async () => {
    const h = harness({ prizeModel: 'POOL', tickets: 3600, agentId: 'agent-1', poolRevenueBasis: 'NET_OF_COMMISSION', tiers: poolTiers, minimumNgn: 0 });
    await h.run();

    // ₦1.8m less 10% commission = ₦1.62m; 50% = ₦810k.
    expect(h.writes.drawResult[0]).toMatchObject({ eligibleRevenueNgn: 1_620_000, prizePoolNgn: 810_000 });
  });
});

describe('Engine: jackpot stages', () => {
  it('picks the set number of winners per active stage', async () => {
    const h = harness({
      prizeModel: 'STAGES',
      tickets: 100,
      tiers: [
        { tierNo: 1, name: 'Jackpot', active: true, allocationBp: null, winnerCount: 2, prizePerWinnerNgn: 2_000_000, prizeDescription: null },
        { tierNo: 2, name: 'Consolation', active: true, allocationBp: null, winnerCount: 5, prizePerWinnerNgn: 50_000, prizeDescription: 'Phone' },
        { tierNo: 3, name: 'Off', active: false, allocationBp: null, winnerCount: 10, prizePerWinnerNgn: 10_000, prizeDescription: null },
      ],
    });
    await h.run();

    const result = h.writes.drawResult[0];
    expect(result).toMatchObject({ prizeModel: 'STAGES', totalWinners: 7, prizeValueNgn: 4_250_000, prizePoolNgn: null });
    expect(h.writes.drawWinner.map((w) => [w.tierNo, w.prizeDescription])).toEqual([
      [1, '₦2,000,000 (Jackpot)'], [1, '₦2,000,000 (Jackpot)'],
      ...Array(5).fill([2, 'Phone']),
    ]);
  });
});

describe('Engine: which draws read ticket prices', () => {
  const selectOf = (h: ReturnType<typeof harness>) =>
    ((h.prisma.ticket.findMany.mock.calls as unknown as [{ select: AnyRecord }][])[0][0]).select;

  it('a prize pool reads prices and sellers, because its pool depends on revenue', async () => {
    const h = harness({ prizeModel: 'POOL', tickets: 10, tiers: poolTiers });
    await h.run();
    expect(selectOf(h)).toMatchObject({ faceValueNgn: true, agentId: true });
  });

  it('jackpot stages and single prizes never see what a ticket cost', async () => {
    for (const prizeModel of ['STAGES', 'SINGLE'] as const) {
      const h = harness({
        prizeModel,
        tickets: 10,
        tiers: [{ tierNo: 1, name: 'Jackpot', active: true, allocationBp: null, winnerCount: 1, prizePerWinnerNgn: 1000, prizeDescription: null }],
      });
      await h.run();
      expect(Object.keys(selectOf(h)).sort()).toEqual(['buyerPhone', 'stateOfPlayCode', 'ticketId', 'ticketRef']);
    }
  });
});

describe('Engine: single-prize draw (unchanged)', () => {
  it('still picks one winner the original way, now also recorded as a winner row', async () => {
    const h = harness({ prizeModel: 'SINGLE', tickets: 50 });
    await h.run();

    const result = h.writes.drawResult[0];
    expect(result).toMatchObject({ prizeModel: 'SINGLE', totalWinners: 1, prizeValueNgn: 100000, retainedNgn: 0 });
    expect(h.writes.drawWinner).toEqual([expect.objectContaining({ tierNo: 1, pickIndex: 0, prizeNgn: 100000, unitId: result.winnerTicketRef })]);
    expect(h.writes.retainedPrize).toEqual([]);
    expect(h.queue.enqueueWinnerSms).toHaveBeenCalledTimes(1);
  });
});

describe('Independent verifier (packages/verify/verify.cjs)', () => {
  const script = join(__dirname, '../../../packages/verify/verify.cjs');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const signPayload = (p: string) => sign(null, Buffer.from(p, 'utf8'), privateKey).toString('base64');

  async function bundleFor(prizeModel: 'POOL' | 'STAGES', tiers: AnyRecord[], tickets: number) {
    const h = harness({ prizeModel, tickets, tiers, signPayload });
    await h.run();
    const result = h.writes.drawResult[0];
    // What the public verification endpoint serves, after a round trip
    // through JSON (as the database's plain JSON column returns it).
    return JSON.parse(JSON.stringify({
      drawId: h.draw.drawId,
      drawCode: h.draw.drawCode,
      winnerTicketRef: result.winnerTicketRef,
      totalEligibleParticipants: result.totalEligibleParticipants,
      rngSeedHash: result.rngSeedHash,
      rngSeed: result.rngSeed,
      merkleRoot: result.merkleRoot,
      engineSignature: result.engineSignature,
      pool: h.tickets.map((t) => t.ticketRef),
      prizeModel,
      certificate: result.certificate,
    }));
  }

  function runVerifier(bundle: AnyRecord): { code: number; out: string } {
    const dir = mkdtempSync(join(tmpdir(), 'verify-'));
    const file = join(dir, 'bundle.json');
    writeFileSync(file, JSON.stringify(bundle));
    try {
      return { code: 0, out: execFileSync('node', [script, file, publicKeyB64], { encoding: 'utf8' }) };
    } catch (e) {
      const err = e as { status: number; stdout: string };
      return { code: err.status, out: err.stdout };
    }
  }

  it('verifies every winner, the tiers, the pool sums and the signature of a pool draw', async () => {
    const bundle = await bundleFor('POOL', poolTiers, 3600);
    const { code, out } = runVerifier(bundle);
    expect(out).toContain('recomputed all 126 winners in pick order');
    expect(out).not.toContain('FAIL');
    expect(code).toBe(0);
  });

  it('verifies a jackpot stage draw', async () => {
    const bundle = await bundleFor('STAGES', [
      { tierNo: 1, name: 'Jackpot', active: true, allocationBp: null, winnerCount: 1, prizePerWinnerNgn: 2_000_000, prizeDescription: null },
      { tierNo: 2, name: 'Consolation', active: true, allocationBp: null, winnerCount: 5, prizePerWinnerNgn: 50_000, prizeDescription: null },
    ], 40);
    const { code, out } = runVerifier(bundle);
    expect(out).not.toContain('FAIL');
    expect(code).toBe(0);
  });

  it('fails when a winner is swapped for another ticket', async () => {
    const bundle = await bundleFor('POOL', poolTiers, 3600);
    const taken = new Set(bundle.certificate.winners.map((w: AnyRecord) => w.entry));
    bundle.certificate.winners[5].entry = bundle.pool.find((ref: string) => !taken.has(ref));
    const { code, out } = runVerifier(bundle);
    expect(out).toContain('FAIL  recomputed all 126 winners');
    expect(out).toContain('FAIL  Ed25519 signature over the certificate');
    expect(code).toBe(1);
  });

  it('fails when a winner is moved to a bigger prize', async () => {
    const bundle = await bundleFor('POOL', poolTiers, 3600);
    bundle.certificate.winners[125].tierNo = 1;
    bundle.certificate.winners[125].prizeNgn = 25000;
    const { code, out } = runVerifier(bundle);
    expect(out).toContain('FAIL  each winner has the prize for their place in the order');
    expect(code).toBe(1);
  });
});

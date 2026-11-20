import { NotificationsWorker } from '../../worker/src/notifications.worker';
import { ClaimsSweepService } from '../../worker/src/claims-sweep.service';

type AnyRecord = Record<string, any>;

const winnerRow = {
  winnerId: 'w-7', drawId: 'draw-1', unitId: 'SW-000007', buyerPhone: '+2348000000007', prizeNgn: 25000,
};
const job = {
  drawId: 'draw-1',
  drawCode: 'RD-DRAW-20261201-DAILY',
  drawWinnerId: 'w-7',
  winnerPhone: '+2348000000007',
  winnerRef: 'SW-000007',
  drawScheduledAt: '2026-12-01T19:00:00.000Z',
  prizeDescription: '₦25,000 (Gold)',
  prizeValueNgn: 25000,
};

function workerHarness(opts: { existingClaim?: boolean; raceOnCreate?: boolean; winner?: AnyRecord | null } = {}) {
  const created: AnyRecord[] = [];
  let lookups = 0;
  const prisma = {
    drawResult: { findUnique: jest.fn(async () => ({ resultId: 'result-1' })) },
    drawWinner: { findUnique: jest.fn(async () => (opts.winner === undefined ? winnerRow : opts.winner)) },
    prizeClaim: {
      findUnique: jest.fn(async () => (opts.existingClaim ? { claimId: 'claim-old' } : null)),
      findFirst: jest.fn(async () => null),
      findUniqueOrThrow: jest.fn(async () => { lookups += 1; return { claimId: 'claim-raced' }; }),
      create: jest.fn(async ({ data }: AnyRecord) => {
        if (opts.raceOnCreate) throw Object.assign(new Error('unique'), { code: 'P2002' });
        created.push(data);
        return { claimId: 'claim-new', ...data };
      }),
    },
  };
  const sms = { sendSms: jest.fn(async () => ({})) };
  const config = { get: jest.fn(() => undefined) };
  const worker = new NotificationsWorker(config as never, prisma as never, sms as never);
  const run = (data: AnyRecord) => (worker as unknown as { handleWinnerSms(d: AnyRecord): Promise<void> }).handleWinnerSms(data);
  return { run, created, sms, prisma, raced: () => lookups };
}

describe('Worker: one claim per prize pool winner', () => {
  it('opens a claim for the winner, tied to their winner row, for their own prize', async () => {
    const h = workerHarness();
    await h.run(job);
    expect(h.created).toEqual([expect.objectContaining({
      drawResultId: 'result-1', drawWinnerId: 'w-7', winnerTicketRef: 'SW-000007', grossPrizeValueNgn: 25000,
    })]);
    expect(h.sms.sendSms).toHaveBeenCalledWith('+2348000000007', expect.stringContaining('SW-000007'), 'win-claim-new');
  });

  it('does not open a claim when the job does not match the recorded winner', async () => {
    for (const bad of [{ prizeValueNgn: 2_000_000 }, { winnerPhone: '+2348099999999' }, { winnerRef: 'SW-000008' }, { drawId: 'draw-2' }]) {
      const h = workerHarness();
      await expect(h.run({ ...job, ...bad })).rejects.toThrow('does not match its job');
      expect(h.created).toHaveLength(0);
      expect(h.sms.sendSms).not.toHaveBeenCalled();
    }
  });

  it('does not open a claim for a winner that was never recorded', async () => {
    const h = workerHarness({ winner: null });
    await expect(h.run(job)).rejects.toThrow('does not match its job');
    expect(h.created).toHaveLength(0);
  });

  it('reuses the claim on a retry instead of opening a second one', async () => {
    const h = workerHarness({ existingClaim: true });
    await h.run(job);
    expect(h.created).toHaveLength(0);
    expect(h.sms.sendSms).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'win-claim-old');
  });

  it('uses the claim another worker created a moment earlier', async () => {
    const h = workerHarness({ raceOnCreate: true });
    await h.run(job);
    expect(h.raced()).toBe(1);
    expect(h.sms.sendSms).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'win-claim-raced');
  });

  it('still handles a single-prize job queued before prize pools', async () => {
    const { drawWinnerId: _omit, ...legacy } = job;
    const h = workerHarness();
    await h.run(legacy);
    expect(h.prisma.drawWinner.findUnique).not.toHaveBeenCalled();
    expect(h.created[0]).toMatchObject({ drawWinnerId: null, winnerTicketRef: 'SW-000007' });
  });
});

describe('Claims sweep: unclaimed prizes go to the uncollected prizes ledger', () => {
  function sweepHarness(flipped: number) {
    const ledger: AnyRecord[] = [];
    const tx = {
      prizeClaim: {
        updateMany: jest.fn(async () => ({ count: flipped })),
        findUnique: jest.fn(async () => ({
          grossPrizeValueNgn: 25000, winnerTicketRef: 'SW-000007', drawResult: { drawId: 'draw-1' }, drawWinner: { tierNo: 1 },
        })),
      },
      retainedPrize: { create: jest.fn(async ({ data }: AnyRecord) => { ledger.push(data); return data; }) },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      auditLog: { create: jest.fn(async () => ({})) },
    };
    const sms = { sendSms: jest.fn(async () => ({})) };
    const sweep = new ClaimsSweepService(prisma as never, sms as never, { get: () => undefined } as never);
    const forfeit = () => (sweep as unknown as { forfeit(id: string, s: string, p: string, r: string): Promise<void> })
      .forfeit('claim-1', 'NOTIFIED', '+2348000000007', 'SW-000007');
    return { forfeit, ledger, tx, prisma, sms };
  }

  it('records the forfeited prize, with the claim, in the same transaction as the forfeit', async () => {
    const h = sweepHarness(1);
    await h.forfeit();
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(h.ledger).toEqual([expect.objectContaining({
      drawId: 'draw-1', kind: 'UNCLAIMED', amountNgn: 25000, claimId: 'claim-1', tierNo: null,
    })]);
    expect(h.sms.sendSms).toHaveBeenCalledTimes(1);
  });

  it('records nothing when the claim moved on before the sweep got to it', async () => {
    const h = sweepHarness(0);
    await h.forfeit();
    expect(h.ledger).toHaveLength(0);
    expect(h.sms.sendSms).not.toHaveBeenCalled();
  });

  it('does not forfeit at all if the ledger entry cannot be written', async () => {
    const h = sweepHarness(1);
    h.tx.retainedPrize.create.mockRejectedValueOnce(new Error('database down'));
    await expect(h.forfeit()).rejects.toThrow('database down');
    expect(h.sms.sendSms).not.toHaveBeenCalled();
  });
});

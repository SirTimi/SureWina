import { createHash, createHmac, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  awardPlan,
  commissionNgn,
  formatBp,
  planPrizes,
  validatePrizeConfig,
  type PrizeConfig,
} from '../src/draws/prize-pool.math';
import {
  deterministicIndex,
  deterministicWinnerIndex,
  pickWinnerIndexes,
} from '../../engine/src/draw-math.utils';

const pool = (over: Partial<PrizeConfig> = {}): PrizeConfig => ({
  model: 'POOL',
  payoutBp: 5000,
  minimumNgn: 500000,
  tiers: [
    { tierNo: 1, name: 'Gold', active: true, allocationBp: 2500, prizePerWinnerNgn: 25000 },
    { tierNo: 2, name: 'Silver', active: true, allocationBp: 2000, prizePerWinnerNgn: 10000 },
    { tierNo: 3, name: 'Bronze', active: true, allocationBp: 5500, prizePerWinnerNgn: 5000 },
  ],
  ...over,
});

describe('Prize pool arithmetic', () => {
  it('is the same file in the engine (runs the draw) and the API (previews it)', () => {
    const engine = readFileSync(join(__dirname, '../../engine/src/prize-pool.math.ts'), 'utf8');
    const api = readFileSync(join(__dirname, '../src/draws/prize-pool.math.ts'), 'utf8');
    expect(api).toBe(engine);
  });

  it("works Mr Alex's example: ₦1.8m revenue, 50%, ₦500k minimum", () => {
    const plan = planPrizes(pool(), 1_800_000);

    expect(plan).toMatchObject({
      eligibleRevenueNgn: 1_800_000,
      revenueShareNgn: 900_000,
      poolNgn: 900_000,
      fundingShortfallNgn: 0,
      totalWinners: 126,
      totalPrizeNgn: 900_000,
      roundingNgn: 0,
    });
    expect(plan.tiers.map((t) => [t.name, t.allocationNgn, t.winners])).toEqual([
      ['Gold', 225_000, 9],
      ['Silver', 180_000, 18],
      ['Bronze', 495_000, 99],
    ]);
  });

  it('applies the minimum and records the shortfall the company funds', () => {
    const plan = planPrizes(pool(), 600_000);

    expect(plan.revenueShareNgn).toBe(300_000);
    expect(plan.poolNgn).toBe(500_000);
    expect(plan.fundingShortfallNgn).toBe(200_000);
  });

  it('works the ₦300k example: 55% at ₦5k, 20% at ₦10k, 25% at ₦25k gives 33, 6 and 3 winners', () => {
    const plan = planPrizes(
      pool({
        minimumNgn: 300_000,
        tiers: [
          { tierNo: 1, name: 'Tier 1', active: true, allocationBp: 5500, prizePerWinnerNgn: 5000 },
          { tierNo: 2, name: 'Tier 2', active: true, allocationBp: 2000, prizePerWinnerNgn: 10000 },
          { tierNo: 3, name: 'Tier 3', active: true, allocationBp: 2500, prizePerWinnerNgn: 25000 },
        ],
      }),
      0,
    );

    expect(plan.poolNgn).toBe(300_000);
    expect(plan.tiers.map((t) => t.winners)).toEqual([33, 6, 3]);
    expect(plan.totalWinners).toBe(42);
    expect(plan.roundingNgn).toBe(0);
  });

  it('keeps every naira accounted for: paid out plus rounding equals the pool', () => {
    const plan = planPrizes(pool({ payoutBp: 4333 }), 1_234_567);

    expect(plan.tiers.every((t) => t.winners * t.prizePerWinnerNgn <= (t.allocationNgn as number))).toBe(true);
    expect(plan.totalPrizeNgn + plan.roundingNgn).toBe(plan.poolNgn);
    expect(plan.roundingNgn).toBeGreaterThan(0);
  });

  it('holds the same for thousands of random configurations', () => {
    for (let i = 0; i < 3000; i++) {
      const a = 1 + Math.floor(Math.random() * 9998);
      const b = 1 + Math.floor(Math.random() * (9999 - a));
      const c = 10000 - a - b;
      const config = pool({
        payoutBp: 1 + Math.floor(Math.random() * 10000),
        minimumNgn: Math.floor(Math.random() * 1_000_000),
        tiers: [
          { tierNo: 1, name: 'A', active: true, allocationBp: a, prizePerWinnerNgn: 1 + Math.floor(Math.random() * 100_000) },
          { tierNo: 2, name: 'B', active: true, allocationBp: b, prizePerWinnerNgn: 1 + Math.floor(Math.random() * 100_000) },
          { tierNo: 3, name: 'C', active: true, allocationBp: c, prizePerWinnerNgn: 1 + Math.floor(Math.random() * 100_000) },
        ],
      });
      const plan = planPrizes(config, Math.floor(Math.random() * 50_000_000));

      expect(plan.poolNgn).toBe(Math.max(config.minimumNgn as number, plan.revenueShareNgn as number));
      expect(plan.totalPrizeNgn + plan.roundingNgn).toBe(plan.poolNgn);
      expect(plan.roundingNgn).toBeGreaterThanOrEqual(0);
      for (const t of plan.tiers) {
        expect(t.allocationNgn! - t.winners * t.prizePerWinnerNgn).toBe(t.roundingNgn);
        expect(t.roundingNgn).toBeLessThan(t.prizePerWinnerNgn);
      }
    }
  });

  it('gives a tier no winners when its share cannot fund one prize', () => {
    const plan = planPrizes(pool({ minimumNgn: 0 }), 10_000);

    expect(plan.poolNgn).toBe(5_000);
    expect(plan.tiers.map((t) => t.winners)).toEqual([0, 0, 0]);
    expect(plan.roundingNgn).toBe(5_000);
  });

  it('stays exact on very large revenue', () => {
    const plan = planPrizes(pool({ payoutBp: 3333 }), 9_000_000_000_000);
    expect(plan.revenueShareNgn).toBe(2_999_700_000_000);
  });
});

describe('Prize configuration rules', () => {
  it('refuses tiers that do not add up to 100%, naming the total', () => {
    const errors = validatePrizeConfig(
      pool({
        tiers: [
          { tierNo: 1, name: 'A', active: true, allocationBp: 6200, prizePerWinnerNgn: 5000 },
          { tierNo: 2, name: 'B', active: true, allocationBp: 3800, prizePerWinnerNgn: 5000 },
          { tierNo: 3, name: 'C', active: true, allocationBp: 1000, prizePerWinnerNgn: 5000 },
        ],
      }),
    );
    expect(errors).toContain("The active tiers' shares must add up to exactly 100% (they add up to 110%)");
  });

  it('refuses bad payout ratios, minimums, prizes, names and tier numbers', () => {
    expect(validatePrizeConfig(pool({ payoutBp: 0 }))).toContain('Payout ratio must be between 0.01% and 100%');
    expect(validatePrizeConfig(pool({ payoutBp: 10001 }))).toContain('Payout ratio must be between 0.01% and 100%');
    expect(validatePrizeConfig(pool({ minimumNgn: -1 }))).toContain('Minimum prize pool must be a whole naira amount of ₦0 or more');

    const broken = pool();
    broken.tiers[0] = { ...broken.tiers[0], prizePerWinnerNgn: 0, name: ' ' };
    broken.tiers[1] = { ...broken.tiers[1], tierNo: 1 };
    const errors = validatePrizeConfig(broken);
    expect(errors).toEqual(expect.arrayContaining([
      'Tiers must be numbered 1 to 4, each once',
      'Tier 1: a name of 1 to 60 characters is required',
      'Tier 1: prize per winner must be a whole naira amount of at least ₦1',
    ]));
  });

  it('counts only active tiers towards 100%', () => {
    const config = pool({
      tiers: [
        { tierNo: 1, name: 'A', active: true, allocationBp: 7000, prizePerWinnerNgn: 5000 },
        { tierNo: 2, name: 'B', active: true, allocationBp: 3000, prizePerWinnerNgn: 5000 },
        { tierNo: 3, name: 'C', active: false, allocationBp: 5000, prizePerWinnerNgn: 5000 },
      ],
    });
    expect(validatePrizeConfig(config)).toEqual([]);
    expect(planPrizes(config, 1_000_000).tiers.map((t) => t.tierNo)).toEqual([1, 2]);
  });

  it('never plans an invalid configuration', () => {
    expect(() => planPrizes(pool({ payoutBp: 0 }), 100)).toThrow('Invalid prize configuration');
  });
});

describe('Jackpot stages', () => {
  const stages = (over: Partial<PrizeConfig> = {}): PrizeConfig => ({
    model: 'STAGES',
    tiers: [
      { tierNo: 1, name: 'Jackpot', active: true, winnerCount: 1, prizePerWinnerNgn: 5_000_000 },
      { tierNo: 2, name: 'Consolation 1', active: true, winnerCount: 5, prizePerWinnerNgn: 50_000 },
      { tierNo: 3, name: 'Consolation 2', active: false, winnerCount: 10, prizePerWinnerNgn: 10_000 },
    ],
    ...over,
  });

  it('picks the set number of winners for each active stage, ignoring revenue', () => {
    const plan = planPrizes(stages(), 123);

    expect(plan.poolNgn).toBeNull();
    expect(plan.tiers.map((t) => [t.name, t.winners])).toEqual([['Jackpot', 1], ['Consolation 1', 5]]);
    expect(plan.totalWinners).toBe(6);
    expect(plan.totalPrizeNgn).toBe(5_250_000);
  });

  it('requires stage 1 and a winner count on every active stage', () => {
    const noMain = stages();
    noMain.tiers[0] = { ...noMain.tiers[0], active: false };
    expect(validatePrizeConfig(noMain)).toContain('Stage 1 (the main draw) must be active');

    const noCount = stages();
    noCount.tiers[1] = { ...noCount.tiers[1], winnerCount: 0 };
    expect(validatePrizeConfig(noCount)).toContain('Stage 2: number of winners must be between 1 and 10,000');
  });
});

describe('Awarding with fewer entries than prizes', () => {
  it('fills tier 1 first and records what could not be awarded', () => {
    const plan = planPrizes(pool(), 1_800_000); // 9 + 18 + 99 winners
    const award = awardPlan(plan, 20);

    expect(award.tiers.map((t) => [t.awarded, t.unawarded])).toEqual([[9, 0], [11, 7], [0, 99]]);
    expect(award.totalAwarded).toBe(20);
    expect(award.awardedNgn).toBe(9 * 25000 + 11 * 10000);
    expect(award.unawardedNgn).toBe(7 * 10000 + 99 * 5000);
    expect(award.awardedNgn + award.unawardedNgn).toBe(plan.totalPrizeNgn);
  });

  it('awards everything when there are enough entries', () => {
    const plan = planPrizes(pool(), 1_800_000);
    expect(awardPlan(plan, 10_000).unawardedNgn).toBe(0);
  });
});

describe('Commission and display helpers', () => {
  it('rounds commission down to whole naira', () => {
    expect(commissionNgn(500, 1000)).toBe(50);
    expect(commissionNgn(333, 1250)).toBe(41);
  });

  it('formats basis points as percentages', () => {
    expect(formatBp(5000)).toBe('50%');
    expect(formatBp(1250)).toBe('12.50%');
    expect(formatBp(1)).toBe('0.01%');
  });
});

describe('Winner selection from the sealed seed', () => {
  // The single-prize method exactly as first released, for comparison.
  function originalWinnerIndex(seed: Buffer, drawCode: string, n: number): number {
    if (n === 1) return 0;
    const key = createHash('sha256').update(Buffer.concat([seed, Buffer.from(`${drawCode}:WINNER_INDEX`)])).digest();
    const nBig = BigInt(n);
    const limit = ((1n << 64n) / nBig) * nBig;
    for (let counter = 0; ; counter++) {
      const x = createHmac('sha256', key).update(Buffer.from(String(counter))).digest().readBigUInt64BE(0);
      if (x < limit) return Number(x % nBig);
    }
  }

  it('picks single-prize winners exactly as before, so past draws still verify', () => {
    for (let i = 0; i < 500; i++) {
      const seed = randomBytes(32);
      const n = 1 + Math.floor(Math.random() * 100_000);
      expect(deterministicWinnerIndex(seed, `RD-${i}`, n)).toBe(originalWinnerIndex(seed, `RD-${i}`, n));
    }
  });

  it('picks distinct winners, always the same ones for the same seed', () => {
    const seed = randomBytes(32);
    const picks = pickWinnerIndexes(seed, 'RD-POOL-1', 1000, 126);

    expect(picks).toHaveLength(126);
    expect(new Set(picks).size).toBe(126);
    expect(picks.every((i) => i >= 0 && i < 1000)).toBe(true);
    expect(pickWinnerIndexes(seed, 'RD-POOL-1', 1000, 126)).toEqual(picks);
    expect(pickWinnerIndexes(randomBytes(32), 'RD-POOL-1', 1000, 126)).not.toEqual(picks);
    expect(pickWinnerIndexes(seed, 'RD-POOL-2', 1000, 126)).not.toEqual(picks);
  });

  it('can pick every entry, and refuses to pick more than exist', () => {
    const seed = randomBytes(32);
    expect(pickWinnerIndexes(seed, 'D', 5, 5).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(pickWinnerIndexes(seed, 'D', 0, 0)).toEqual([]);
    expect(() => pickWinnerIndexes(seed, 'D', 5, 6)).toThrow('Cannot pick more winners than there are entries');
  });

  it('follows the published method: pick k uses label <drawCode>:PICK:<k> over the entries left', () => {
    const seed = randomBytes(32);
    const remaining = Array.from({ length: 50 }, (_, i) => i);
    const expected: number[] = [];
    for (let k = 0; k < 10; k++) {
      const at = deterministicIndex(seed, `RD-X:PICK:${k}`, remaining.length);
      expected.push(remaining.splice(at, 1)[0]);
    }
    expect(pickWinnerIndexes(seed, 'RD-X', 50, 10)).toEqual(expected);
  });

  it('gives every entry the same chance of winning', () => {
    // 20 entries, 5 winners per draw, 8,000 draws: each entry should win
    // about 2,000 times. A biased method would drift far outside ±10%.
    const n = 20;
    const wins = new Array<number>(n).fill(0);
    for (let d = 0; d < 8000; d++) {
      for (const i of pickWinnerIndexes(randomBytes(32), `SIM-${d}`, n, 5)) wins[i]++;
    }
    const expected = (8000 * 5) / n;
    for (const w of wins) {
      expect(Math.abs(w - expected) / expected).toBeLessThan(0.1);
    }
  });
});

describe('Products: 4 daily categories, 3 jackpot stages, jackpot item prizes', () => {
  const four = [
    { tierNo: 1, name: 'First', active: true, allocationBp: 1000, prizePerWinnerNgn: 50000 },
    { tierNo: 2, name: 'Second', active: true, allocationBp: 2000, prizePerWinnerNgn: 10000 },
    { tierNo: 3, name: 'Third', active: true, allocationBp: 3000, prizePerWinnerNgn: 2000 },
    { tierNo: 4, name: 'Fourth', active: true, allocationBp: 4000, prizePerWinnerNgn: 500 },
  ];

  it('a daily pool takes 4 categories and works them all out', () => {
    expect(validatePrizeConfig({ model: 'POOL', payoutBp: 5000, minimumNgn: 100000, tiers: four })).toEqual([]);
    const plan = planPrizes({ model: 'POOL', payoutBp: 5000, minimumNgn: 100000, tiers: four }, 1_000_000);
    // ₦500k pool: 1 × ₦50k, 10 × ₦10k, 75 × ₦2k, 400 × ₦500.
    expect(plan.tiers.map((t) => t.winners)).toEqual([1, 10, 75, 400]);
    expect(plan.totalPrizeNgn + plan.roundingNgn).toBe(500000);
  });

  it('but not a fifth, and jackpot stages stop at 3', () => {
    const five = [...four, { tierNo: 5, name: 'Fifth', active: true, allocationBp: 1, prizePerWinnerNgn: 1 }];
    expect(validatePrizeConfig({ model: 'POOL', payoutBp: 5000, minimumNgn: 0, tiers: five })).toEqual(['Between 1 and 4 prize tiers are required']);
    const stages = four.map((t) => ({ ...t, allocationBp: null, winnerCount: 1 }));
    expect(validatePrizeConfig({ model: 'STAGES', tiers: stages })).toEqual(['Between 1 and 3 prize tiers are required']);
  });

  it('a jackpot stage can be an item, with the prize amount as its cash value', () => {
    const tiers = [{ tierNo: 1, name: 'Jackpot', active: true, winnerCount: 1, prizePerWinnerNgn: 3_500_000, prizeDescription: 'Toyota Corolla', itemPrize: true }];
    expect(validatePrizeConfig({ model: 'STAGES', tiers })).toEqual([]);
    const plan = planPrizes({ model: 'STAGES', tiers }, 0);
    expect(plan.tiers[0]).toMatchObject({ itemPrize: true, prizeDescription: 'Toyota Corolla or ₦3,500,000 cash', prizePerWinnerNgn: 3_500_000 });
  });

  it('an item stage must name the item, and daily categories are cash only', () => {
    expect(validatePrizeConfig({ model: 'STAGES', tiers: [{ tierNo: 1, name: 'Jackpot', active: true, winnerCount: 1, prizePerWinnerNgn: 1000, itemPrize: true }] }))
      .toEqual(['Tier 1: name the item (the prize amount is its cash value)']);
    const itemDaily = four.map((t, i) => (i === 0 ? { ...t, itemPrize: true, prizeDescription: 'Phone' } : t));
    expect(validatePrizeConfig({ model: 'POOL', payoutBp: 5000, minimumNgn: 0, tiers: itemDaily })).toEqual(['Tier 1: daily prize categories are cash only']);
  });
});

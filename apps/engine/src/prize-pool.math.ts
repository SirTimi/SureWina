// Prize pool and draw stage arithmetic. Pure: no I/O, no clock, no dates.
//
// KEEP IDENTICAL: apps/engine/src/prize-pool.math.ts and
// apps/api/src/draws/prize-pool.math.ts are the same file. The engine runs
// the draw with it; the admin API previews a draw with it. A test fails if
// the two copies ever differ.
//
// Money is whole naira. Percentages are basis points (5000 = 50%), so every
// figure is an exact integer and the same inputs always give the same result.

export type PrizeModel = 'POOL' | 'STAGES';

export type TierInput = {
  tierNo: number;
  name: string;
  active: boolean;
  // POOL: share of the pool in basis points.
  allocationBp?: number | null;
  // STAGES: winners to pick.
  winnerCount?: number | null;
  prizePerWinnerNgn: number;
  prizeDescription?: string | null;
  // STAGES only: the prize is the item in prizeDescription, and
  // prizePerWinnerNgn is its cash value.
  itemPrize?: boolean | null;
};

export type PrizeConfig = {
  model: PrizeModel;
  // POOL only.
  payoutBp?: number | null;
  minimumNgn?: number | null;
  tiers: TierInput[];
};

export type PlannedTier = {
  tierNo: number;
  name: string;
  prizePerWinnerNgn: number;
  prizeDescription: string;
  itemPrize: boolean;
  // POOL: the tier's share of the pool. STAGES: null.
  allocationNgn: number | null;
  // Winners the pool (or the stage setting) allows.
  winners: number;
  // POOL: allocation left after whole winners. STAGES: 0.
  roundingNgn: number;
};

export type PrizePlan = {
  model: PrizeModel;
  // POOL only.
  eligibleRevenueNgn: number | null;
  revenueShareNgn: number | null;
  poolNgn: number | null;
  // The part of the pool the minimum adds on top of the revenue share.
  fundingShortfallNgn: number;
  tiers: PlannedTier[];
  totalWinners: number;
  // Paid if every winner is awarded.
  totalPrizeNgn: number;
  // POOL: pool not paid out because of rounding (percentage and whole
  // winners). STAGES: 0.
  roundingNgn: number;
};

export type AwardedTier = PlannedTier & {
  awarded: number;
  // Prizes the plan allowed but there were not enough entries for.
  unawarded: number;
  unawardedNgn: number;
};

export type Award = {
  tiers: AwardedTier[];
  totalAwarded: number;
  awardedNgn: number;
  unawardedNgn: number;
};

// Daily prize pools have up to 4 categories; jackpot stages up to 3.
export const MAX_TIERS: Record<PrizeModel, number> = { POOL: 4, STAGES: 3 };
const FULL_BP = 10000;

// Every reason a prize configuration cannot be saved. Empty means valid.
export function validatePrizeConfig(config: PrizeConfig): string[] {
  const errors: string[] = [];
  const { tiers } = config;

  if (config.model !== 'POOL' && config.model !== 'STAGES') {
    return ['Prize model must be POOL or STAGES'];
  }

  const max = MAX_TIERS[config.model];
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > max) {
    return [`Between 1 and ${max} prize tiers are required`];
  }

  const numbers = tiers.map((t) => t.tierNo);
  if (new Set(numbers).size !== numbers.length || numbers.some((n) => !Number.isInteger(n) || n < 1 || n > max)) {
    errors.push(`Tiers must be numbered 1 to ${max}, each once`);
  }

  for (const tier of tiers) {
    const label = `Tier ${tier.tierNo}`;
    if (!tier.name || !tier.name.trim() || tier.name.trim().length > 60) {
      errors.push(`${label}: a name of 1 to 60 characters is required`);
    }
    if (!Number.isSafeInteger(tier.prizePerWinnerNgn) || tier.prizePerWinnerNgn < 1) {
      errors.push(`${label}: prize per winner must be a whole naira amount of at least ₦1`);
    }
    if (tier.itemPrize) {
      if (config.model !== 'STAGES') {
        errors.push(`${label}: daily prize categories are cash only`);
      } else if (!tier.prizeDescription || !tier.prizeDescription.trim()) {
        errors.push(`${label}: name the item (the prize amount is its cash value)`);
      }
    }
  }

  const active = tiers.filter((t) => t.active);

  if (config.model === 'POOL') {
    if (!Number.isInteger(config.payoutBp) || (config.payoutBp as number) < 1 || (config.payoutBp as number) > FULL_BP) {
      errors.push('Payout ratio must be between 0.01% and 100%');
    }
    if (!Number.isSafeInteger(config.minimumNgn) || (config.minimumNgn as number) < 0) {
      errors.push('Minimum prize pool must be a whole naira amount of ₦0 or more');
    }
    if (active.length === 0) {
      errors.push('At least one tier must be active');
    }
    for (const tier of active) {
      if (!Number.isInteger(tier.allocationBp) || (tier.allocationBp as number) < 1 || (tier.allocationBp as number) > FULL_BP) {
        errors.push(`Tier ${tier.tierNo}: share of the pool must be between 0.01% and 100%`);
      }
    }
    const total = active.reduce((sum, t) => sum + (Number.isInteger(t.allocationBp) ? (t.allocationBp as number) : 0), 0);
    if (total !== FULL_BP) {
      errors.push(`The active tiers' shares must add up to exactly 100% (they add up to ${formatBp(total)})`);
    }
  } else {
    const first = tiers.find((t) => t.tierNo === 1);
    if (!first || !first.active) {
      errors.push('Stage 1 (the main draw) must be active');
    }
    for (const tier of active) {
      if (!Number.isInteger(tier.winnerCount) || (tier.winnerCount as number) < 1 || (tier.winnerCount as number) > 10000) {
        errors.push(`Stage ${tier.tierNo}: number of winners must be between 1 and 10,000`);
      }
    }
  }

  return errors;
}

// The prize plan for a draw: the pool, and how many winners each active tier
// gets. For STAGES, eligible revenue is ignored.
export function planPrizes(config: PrizeConfig, eligibleRevenueNgn: number): PrizePlan {
  const errors = validatePrizeConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid prize configuration: ${errors.join('; ')}`);
  }
  if (!Number.isSafeInteger(eligibleRevenueNgn) || eligibleRevenueNgn < 0) {
    throw new Error('Eligible revenue must be a whole naira amount of ₦0 or more');
  }

  const active = [...config.tiers].filter((t) => t.active).sort((a, b) => a.tierNo - b.tierNo);

  if (config.model === 'STAGES') {
    const tiers = active.map((t) => ({
      tierNo: t.tierNo,
      name: t.name.trim(),
      prizePerWinnerNgn: t.prizePerWinnerNgn,
      prizeDescription: describe(t),
      itemPrize: !!t.itemPrize,
      allocationNgn: null,
      winners: t.winnerCount as number,
      roundingNgn: 0,
    }));
    return {
      model: 'STAGES',
      eligibleRevenueNgn: null,
      revenueShareNgn: null,
      poolNgn: null,
      fundingShortfallNgn: 0,
      tiers,
      totalWinners: tiers.reduce((s, t) => s + t.winners, 0),
      totalPrizeNgn: tiers.reduce((s, t) => s + t.winners * t.prizePerWinnerNgn, 0),
      roundingNgn: 0,
    };
  }

  const revenueShareNgn = mulBp(eligibleRevenueNgn, config.payoutBp as number);
  const poolNgn = Math.max(config.minimumNgn as number, revenueShareNgn);
  const fundingShortfallNgn = poolNgn - revenueShareNgn > 0 ? poolNgn - revenueShareNgn : 0;

  const tiers = active.map((t) => {
    const allocationNgn = mulBp(poolNgn, t.allocationBp as number);
    const winners = Math.floor(allocationNgn / t.prizePerWinnerNgn);
    return {
      tierNo: t.tierNo,
      name: t.name.trim(),
      prizePerWinnerNgn: t.prizePerWinnerNgn,
      prizeDescription: describe(t),
      itemPrize: false,
      allocationNgn,
      winners,
      roundingNgn: allocationNgn - winners * t.prizePerWinnerNgn,
    };
  });

  const totalPrizeNgn = tiers.reduce((s, t) => s + t.winners * t.prizePerWinnerNgn, 0);

  return {
    model: 'POOL',
    eligibleRevenueNgn,
    revenueShareNgn,
    poolNgn,
    fundingShortfallNgn,
    tiers,
    totalWinners: tiers.reduce((s, t) => s + t.winners, 0),
    totalPrizeNgn,
    // Percentage rounding plus every tier's whole-winner remainder.
    roundingNgn: poolNgn - totalPrizeNgn,
  };
}

// Award the plan to the entries actually available, filling tier 1 first.
// A ticket wins at most once, so there can be fewer awards than planned.
export function awardPlan(plan: PrizePlan, eligibleEntries: number): Award {
  if (!Number.isSafeInteger(eligibleEntries) || eligibleEntries < 0) {
    throw new Error('Eligible entries must be a whole number of 0 or more');
  }

  let remaining = eligibleEntries;
  const tiers = plan.tiers.map((tier) => {
    const awarded = Math.min(tier.winners, remaining);
    remaining -= awarded;
    const unawarded = tier.winners - awarded;
    return { ...tier, awarded, unawarded, unawardedNgn: unawarded * tier.prizePerWinnerNgn };
  });

  return {
    tiers,
    totalAwarded: tiers.reduce((s, t) => s + t.awarded, 0),
    awardedNgn: tiers.reduce((s, t) => s + t.awarded * t.prizePerWinnerNgn, 0),
    unawardedNgn: tiers.reduce((s, t) => s + t.unawardedNgn, 0),
  };
}

// Agent commission on a ticket, rounded down to whole naira. rateBp is the
// agent's commission rate in basis points.
export function commissionNgn(faceValueNgn: number, rateBp: number): number {
  return mulBp(faceValueNgn, rateBp);
}

export function formatBp(bp: number): string {
  const whole = Math.floor(bp / 100);
  const frac = bp % 100;
  return frac === 0 ? `${whole}%` : `${whole}.${String(frac).padStart(2, '0')}%`;
}

function mulBp(amountNgn: number, bp: number): number {
  // BigInt keeps large revenues exact.
  return Number((BigInt(amountNgn) * BigInt(bp)) / BigInt(FULL_BP));
}

function describe(tier: TierInput): string {
  const custom = tier.prizeDescription?.trim();
  if (custom && tier.itemPrize) {
    return `${custom} or ₦${tier.prizePerWinnerNgn.toLocaleString('en-NG')} cash`;
  }
  if (custom) return custom;
  return `₦${tier.prizePerWinnerNgn.toLocaleString('en-NG')} (${tier.name.trim()})`;
}

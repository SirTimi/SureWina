// The fingerprint of a closed draw: exactly which entries are in it and
// exactly what it pays. Pure: no I/O.
//
// KEEP IDENTICAL: apps/engine/src/draw-snapshot.ts and
// apps/api/src/draws/draw-snapshot.ts are the same file. The API computes it
// when the owner approves a draw; the engine computes it again just before
// running the draw and refuses to run if it differs. A test fails if the two
// copies ever differ.

import { createHash } from 'crypto';

export type SnapshotTier = {
  tierNo: number;
  name: string;
  active: boolean;
  allocationBp: number | null;
  winnerCount: number | null;
  prizePerWinnerNgn: number;
  itemPrize: boolean;
};

export type SnapshotInput = {
  drawId: string;
  drawCode: string;
  ticketPriceNgn: number;
  prizeModel: string;
  poolPayoutBp: number | null;
  poolMinimumNgn: number | null;
  poolRevenueBasis: string | null;
  prizeValueNgn: number;
  tiers: SnapshotTier[];
  // ACTIVE tickets' refs and ACTIVE free jackpot entries' ids.
  ticketRefs: string[];
  entryIds: string[];
};

export function drawSnapshotHash(input: SnapshotInput): string {
  const canonical = {
    v: 1,
    drawId: input.drawId,
    drawCode: input.drawCode,
    ticketPriceNgn: input.ticketPriceNgn,
    prizeModel: input.prizeModel,
    poolPayoutBp: input.poolPayoutBp ?? null,
    poolMinimumNgn: input.poolMinimumNgn ?? null,
    poolRevenueBasis: input.poolRevenueBasis ?? null,
    prizeValueNgn: input.prizeValueNgn,
    tiers: [...input.tiers]
      .sort((a, b) => a.tierNo - b.tierNo)
      .map((t) => [t.tierNo, t.name, t.active, t.allocationBp ?? null, t.winnerCount ?? null, t.prizePerWinnerNgn, !!t.itemPrize]),
    tickets: [...input.ticketRefs].sort(),
    entries: [...input.entryIds].sort(),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

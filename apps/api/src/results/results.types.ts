import type { Draw, DrawPrizeModel, DrawResult, DrawType, DrawWinner } from '@prisma/client';

// Mirrors @surewina/types DrawResultPublic. Deliberately omits rngSeed and
// merkleRoot — the full seed reveal lives on the Phase 7 verification endpoint.
// Only the pre-committed hash is exposed here.
export type DrawResultPublicDto = {
  drawCode: string;
  drawType: DrawType;
  prizeDescription: string;
  prizeValueNgn: number;
  totalTicketsSold: number;
  winnerTicketRef: string;
  rngSeedHash: string;
  stateBreakdown: Record<string, number>;
  executedAt: string;
  // SINGLE draws have one winner (winnerTicketRef). Pool and stage draws
  // have many; winnerTicketRef is then the first one picked.
  prizeModel: DrawPrizeModel;
  totalWinners: number;
  prizePoolNgn: number | null;
};

export type DrawWinnerPublicDto = {
  pickIndex: number;
  tierNo: number;
  tierName: string;
  winnerRef: string;
  prizeNgn: number;
  prizeDescription: string;
};

export type ListPastResultsResponseDto = {
  results: DrawResultPublicDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type GetResultDetailResponseDto = {
  result: DrawResultPublicDto;
  drawDescription: string;
  prizeImageUrl: string | null;
  winners: DrawWinnerPublicDto[];
  tiers: { tierNo: number; name: string; winners: number; prizePerWinnerNgn: number; prizeDescription: string }[];
};

export function toDrawWinnerPublic(w: DrawWinner): DrawWinnerPublicDto {
  return {
    pickIndex: w.pickIndex,
    tierNo: w.tierNo,
    tierName: w.tierName,
    winnerRef: w.unitId,
    prizeNgn: w.prizeNgn,
    prizeDescription: w.prizeDescription,
  };
}

// A DrawResult with its parent Draw joined in.
type DrawResultWithDraw = DrawResult & { draw: Draw };

export function toDrawResultPublic(
  row: DrawResultWithDraw,
): DrawResultPublicDto {
  return {
    drawCode: row.draw.drawCode,
    drawType: row.draw.drawType,
    prizeDescription: row.draw.prizeDescription,
    prizeValueNgn: row.prizeValueNgn,
    totalTicketsSold: row.totalTicketsSold,
    winnerTicketRef: row.winnerTicketRef,
    rngSeedHash: row.rngSeedHash,
    stateBreakdown: (row.stateBreakdown ?? {}) as Record<string, number>,
    executedAt: row.executedAt.toISOString(),
    prizeModel: row.prizeModel,
    totalWinners: row.totalWinners,
    prizePoolNgn: row.prizePoolNgn,
  };
}
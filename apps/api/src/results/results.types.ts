import type { Draw, DrawResult, DrawType, Prisma } from '@prisma/client';

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
};

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
  };
}
import type { Draw, DrawStatus, DrawType } from '@prisma/client';

// Mirrors @surewina/types DrawPublic — keep in sync with packages/types/src/draws.ts
export type DrawPublicDto = {
  drawCode: string;
  drawType: DrawType;
  status: DrawStatus;
  prizeDescription: string;
  prizeValueNgn: number;
  prizeImageUrl: string | null;
  ticketPriceNgn: number;
  scheduledAt: string;
  cutoffAt: string;
};

export type ListActiveDrawsResponseDto = {
  draws: DrawPublicDto[];
};

export type GetDrawResponseDto = {
  draw: DrawPublicDto;
  ticketsSold: number;
  prizePoolNgn: number;
  jackpotEligible: boolean;
};

export function toDrawPublic(draw: Draw): DrawPublicDto {
  return {
    drawCode: draw.drawCode,
    drawType: draw.drawType,
    status: draw.status,
    prizeDescription: draw.prizeDescription,
    prizeValueNgn: draw.prizeValueNgn,
    prizeImageUrl: draw.prizeImageUrl,
    ticketPriceNgn: draw.ticketPriceNgn,
    scheduledAt: draw.scheduledAt.toISOString(),
    cutoffAt: draw.cutoffAt.toISOString(),
  };
}
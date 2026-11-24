import type { Draw, DrawStatus, DrawType, Product } from '@prisma/client';

import { productDrawName, productDrawShortCode } from '../common/draw-naming.util';

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
  // Product draws (null on draws from before products).
  productCode: string | null;
  productName: string | null;
  ticketLabel: string | null;
  slotCode: string | null;
  salesOpenAt: string | null;
  // e.g. "SURE 100 · 12:00", or the old day name.
  drawName: string;
  drawShortCode: string;
};

export type ListActiveDrawsResponseDto = {
  draws: DrawPublicDto[];
};

export type GetDrawResponseDto = {
  draw: DrawPublicDto;
  ticketsSold: number;
  prizePoolNgn: number;
  jackpotEligible: boolean;
  seedCommittedHash: string | null;
  prizes: DrawPrizesPublicDto | null;
};

export type DrawPrizesPublicDto = {
  model: 'POOL' | 'STAGES' | 'SINGLE';
  guaranteedPoolNgn: number | null;
  payoutRatio: string | null;
  categories: {
    name: string;
    prizePerWinnerNgn: number;
    prizeDescription: string | null;
    itemPrize: boolean;
    shareOfPool: string | null;
    winners: number | null;
  }[];
};

export function toDrawPublic(draw: Draw & { product?: Product | null }): DrawPublicDto {
  const product = draw.product ?? null;
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
    productCode: product?.code ?? null,
    productName: product?.name ?? null,
    ticketLabel: product?.ticketLabel ?? null,
    slotCode: draw.slotCode ?? null,
    salesOpenAt: draw.salesOpenAt?.toISOString() ?? null,
    drawName: productDrawName(draw.drawType, draw.scheduledAt, product),
    drawShortCode: productDrawShortCode(draw.drawType, draw.scheduledAt, product),
  };
}
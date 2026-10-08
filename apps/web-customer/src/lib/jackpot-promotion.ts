import type { JackpotPromotionPrompt } from '@surewina/types';

// Query values are presentation hints only. The offer, buyer and NGN price
// are independently revalidated by the server before any redemption.
export function appendPromotionParams(
  params: URLSearchParams,
  promotion: JackpotPromotionPrompt | null | undefined,
): void {
  if (!promotion || promotion.status !== 'AVAILABLE') return;
  params.set('offerId', promotion.offerId);
  params.set('offerPrice', String(promotion.priceNgn));
  params.set('offerNormalPrice', String(promotion.normalPriceNgn));
  params.set('offerExpires', promotion.expiresAt);
  params.set('offerDraw', promotion.jackpotDrawCode);
  params.set('offerThreshold', String(promotion.regularTicketsAtUnlock));
}

export type PromotionQueryParams = {
  offerId?: string;
  offerPrice?: string;
  offerNormalPrice?: string;
  offerExpires?: string;
  offerDraw?: string;
  offerThreshold?: string;
};

export function promotionFromParams(
  params: PromotionQueryParams,
): JackpotPromotionPrompt | null {
  if (!params.offerId || !/^[0-9a-f-]{36}$/i.test(params.offerId)) return null;
  const priceNgn = Number(params.offerPrice);
  const normalPriceNgn = Number(params.offerNormalPrice);
  const regularTicketsAtUnlock = Number(params.offerThreshold);
  const expiresAt = params.offerExpires ?? '';
  if (
    !Number.isSafeInteger(priceNgn) ||
    priceNgn <= 0 ||
    !Number.isSafeInteger(normalPriceNgn) ||
    normalPriceNgn <= 0 ||
    !Number.isSafeInteger(regularTicketsAtUnlock) ||
    regularTicketsAtUnlock < 10 ||
    !params.offerDraw ||
    !Number.isFinite(Date.parse(expiresAt))
  ) return null;

  return {
    offerId: params.offerId,
    status: 'AVAILABLE',
    priceNgn,
    normalPriceNgn,
    expiresAt,
    jackpotDrawCode: params.offerDraw,
    regularTicketsAtUnlock,
  };
}

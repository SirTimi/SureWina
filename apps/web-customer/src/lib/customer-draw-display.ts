import type { DrawPublic } from '@surewina/types';

// Weekday-named daily draws; Saturday is the jackpot.
const DAY_NAMES = [
  'Sure Sunday',
  'Sure Monday',
  'Sure Tuesday',
  'Sure Wednesday',
  'Sure Thursday',
  'Sure Friday',
  'Sure Jackpot', // Saturday
] as const;

const WAT_OFFSET_MS = 60 * 60 * 1000;

export function getCustomerDrawName(draw: DrawPublic): string {
  if (draw.drawType === 'SATURDAY_JACKPOT') {
    return 'Sure Jackpot';
  }

  // Name derives from the draw's WAT calendar day.
  const wat = new Date(new Date(draw.scheduledAt).getTime() + WAT_OFFSET_MS);
  return DAY_NAMES[wat.getUTCDay()];
}

export function getCustomerDrawSubtitle(draw: DrawPublic): string {
  if (draw.drawType === 'SATURDAY_JACKPOT') {
    return 'Direct entry into the coming Saturday jackpot draw.';
  }

  return 'Regular entry into today’s named Surewina draw.';
}

export function getTicketTypeLabel(draw: DrawPublic): string {
  return draw.drawType === 'SATURDAY_JACKPOT'
    ? 'Sure Jackpot ticket'
    : 'Regular daily ticket';
}
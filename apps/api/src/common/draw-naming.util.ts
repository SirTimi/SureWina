import { DrawType } from '@prisma/client';

const WAT_OFFSET_MS = 60 * 60 * 1000;

const DAYS = [
  { name: 'Sure Sunday', code: 'SSUN' },
  { name: 'Sure Monday', code: 'SMON' },
  { name: 'Sure Tuesday', code: 'STUE' },
  { name: 'Sure Wednesday', code: 'SWED' },
  { name: 'Sure Thursday', code: 'STHU' },
  { name: 'Sure Friday', code: 'SFRI' },
  { name: 'Sure Saturday', code: 'SSAT' }, // unreachable: Saturday is jackpot-only
] as const;

function watDay(scheduledAt: Date): number {
  return new Date(scheduledAt.getTime() + WAT_OFFSET_MS).getUTCDay();
}

export function drawDisplayName(type: DrawType, scheduledAt: Date): string {
  if (type === DrawType.SATURDAY_JACKPOT) return 'Jackpot Day';
  return DAYS[watDay(scheduledAt)].name;
}

export function drawShortCode(type: DrawType, scheduledAt: Date): string {
  if (type === DrawType.SATURDAY_JACKPOT) return 'JACK-D';
  return DAYS[watDay(scheduledAt)].code;
}

// Product draws: the name printed on the ticket and the draw time, e.g.
// "SURE 100 · 12:00", code "SW100-1200". Draws from before products keep
// their day names.
export type DrawProductInfo = { code: string; name: string; ticketLabel: string } | null | undefined;

export function productDrawName(type: DrawType, scheduledAt: Date, product: DrawProductInfo): string {
  if (!product) return drawDisplayName(type, scheduledAt);
  return `${product.ticketLabel} · ${watClock(scheduledAt)}`;
}

export function productDrawShortCode(type: DrawType, scheduledAt: Date, product: DrawProductInfo): string {
  if (!product) return drawShortCode(type, scheduledAt);
  return `${product.code}-${watClock(scheduledAt).replace(':', '')}`;
}

function watClock(at: Date): string {
  const w = new Date(at.getTime() + WAT_OFFSET_MS);
  return `${String(w.getUTCHours()).padStart(2, '0')}:${String(w.getUTCMinutes()).padStart(2, '0')}`;
}

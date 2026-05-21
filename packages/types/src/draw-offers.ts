export type SurewinaTicketOfferKind = 'DAILY' | 'JACKPOT';

export interface SurewinaTicketOffer {
  kind: SurewinaTicketOfferKind;
  drawCode: string;
  drawName: string;
  ticketPriceNgn: number;
  scheduledAt: string;
  cutoffAt: string;
  description: string;
}

export const DAILY_DRAW_NAMES = [
  'Sure Special',
  'Sure Bonanza',
  'Sure Geluu',
  'Sure Bambam',
  'Sure Jumbo',
  'Sure Boom',
  'Sure Jackpot',
] as const;

export type DailyDrawName = (typeof DAILY_DRAW_NAMES)[number];

export function getDailyDrawNameForDate(date = new Date()): DailyDrawName {
  // Temporary frontend/mock rotation.
  // Backend should eventually return the actual active draw name.
  const dayIndex = date.getDay(); // Sunday = 0
  return DAILY_DRAW_NAMES[dayIndex];
}

export function getNextSaturday(date = new Date()): Date {
  const next = new Date(date);
  const day = next.getDay();
  const daysUntilSaturday = (6 - day + 7) % 7 || 7;

  next.setDate(next.getDate() + daysUntilSaturday);
  next.setHours(20, 0, 0, 0);

  return next;
}

export function getEndOfToday(date = new Date()): Date {
  const cutoff = new Date(date);
  cutoff.setHours(20, 0, 0, 0);
  return cutoff;
}

export function buildMockTicketOffers(date = new Date()): SurewinaTicketOffer[] {
  const todayKey = date.toISOString().slice(0, 10).replace(/-/g, '');
  const saturday = getNextSaturday(date);
  const saturdayKey = saturday.toISOString().slice(0, 10).replace(/-/g, '');

  const dailyDrawName = getDailyDrawNameForDate(date);

  return [
    {
      kind: 'DAILY',
      drawCode: `SW-DAILY-${todayKey}`,
      drawName: dailyDrawName,
      ticketPriceNgn: 500,
      scheduledAt: getEndOfToday(date).toISOString(),
      cutoffAt: getEndOfToday(date).toISOString(),
      description: `Buy ticket for today’s ${dailyDrawName} draw.`,
    },
    {
      kind: 'JACKPOT',
      drawCode: `SW-JACKPOT-${saturdayKey}`,
      drawName: 'Sure Jackpot',
      ticketPriceNgn: 5000,
      scheduledAt: saturday.toISOString(),
      cutoffAt: saturday.toISOString(),
      description: 'Buy direct jackpot ticket for the coming Saturday draw.',
    },
  ];
}

export function getFreeJackpotEntriesFromRegularTickets(quantity: number): number {
  return Math.floor(Math.max(0, quantity) / 10);
}

export function getTicketsToNextFreeJackpotEntry(quantity: number): number {
  const remainder = Math.max(0, quantity) % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}
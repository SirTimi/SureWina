import type { DrawPublic } from '@surewina/types';

const DAILY_DRAW_NAMES = [
  'Sure Special',
  'Sure Bonanza',
  'Sure Geluu',
  'Sure Bambam',
  'Sure Jumbo',
  'Sure Boom',
] as const;

const PRODUCT_NAME_PATTERNS = [
  'samsung',
  'galaxy',
  'hisense',
  'iphone',
  'oled',
  'tv',
  'motorbike',
  'bajaj',
  'boxer',
];

export function getCustomerDrawName(draw: DrawPublic): string {
  if (draw.drawType === 'SATURDAY_JACKPOT') {
    return 'Sure Jackpot';
  }

  const rawName = draw.prizeDescription.trim();
  const lower = rawName.toLowerCase();

  const looksLikeOldProductName = PRODUCT_NAME_PATTERNS.some((pattern) =>
    lower.includes(pattern),
  );

  if (!rawName || looksLikeOldProductName) {
    return getDailyFallbackName(draw);
  }

  return rawName;
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

function getDailyFallbackName(draw: DrawPublic): string {
  const digits = draw.drawCode.replace(/\D/g, '');
  const numericSeed = digits ? Number(digits.slice(-8)) : new Date().getDay();

  return DAILY_DRAW_NAMES[numericSeed % DAILY_DRAW_NAMES.length];
}
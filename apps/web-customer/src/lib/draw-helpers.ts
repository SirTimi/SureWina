import type { DrawPublic, DrawResultPublic } from '@surewina/types';

type DrawType = DrawPublic['drawType'];

export const drawTypeLabel: Record<DrawType, string> = {
  DAILY_STANDARD: 'Daily',
  SATURDAY_JACKPOT: 'Saturday Jackpot',
  PRODUCT_PRIZE: 'Product',
};

export const drawTypeShortLabel: Record<DrawType, string> = {
  DAILY_STANDARD: 'Daily draw',
  SATURDAY_JACKPOT: 'Saturday jackpot',
  PRODUCT_PRIZE: 'Product draw',
};

export function formatCountdown(cutoffAt: string): string {
  const ms = new Date(cutoffAt).getTime() - Date.now();
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDrawDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDrawDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
  });
}

export function formatDrawTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} WAT`;
}

export function isFromJackpotDraw(r: DrawResultPublic): boolean {
  return r.drawType === 'SATURDAY_JACKPOT';
}
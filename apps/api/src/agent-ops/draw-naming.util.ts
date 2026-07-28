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
/**
 * Phone number utilities for Nigerian E.164 format.
 */

const NIGERIAN_E164_REGEX = /^\+234[789][01]\d{8}$/;
const NIGERIAN_LOCAL_REGEX = /^0[789][01]\d{8}$/;

export function normalizePhone(input: string): string | null {
  if (!input) return null;
  const cleaned = input.replace(/[\s\-().]/g, '');
  if (NIGERIAN_E164_REGEX.test(cleaned)) return cleaned;
  if (/^234[789][01]\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (NIGERIAN_LOCAL_REGEX.test(cleaned)) return `+234${cleaned.slice(1)}`;
  if (/^[789][01]\d{8}$/.test(cleaned)) return `+234${cleaned}`;
  return null;
}

export function isValidNigerianPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

export function formatPhoneForDisplay(e164: string): string {
  if (!NIGERIAN_E164_REGEX.test(e164)) return e164;
  return `+234 ${e164.slice(4, 7)} ${e164.slice(7, 10)} ${e164.slice(10)}`;
}

export function maskPhone(e164: string): string {
  if (!NIGERIAN_E164_REGEX.test(e164)) return '***';
  return `+234 ${e164.slice(4, 7)} *** **${e164.slice(-2)}`;
}
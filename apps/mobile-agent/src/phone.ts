/** Keep agent phone handling consistent with the server's E.164 input. */
export function normalizeNigerianPhone(input: string): string | null {
  const cleaned = input.replace(/[\s()-]/g, '');
  if (/^\+234\d{10}$/.test(cleaned)) return cleaned;
  if (/^234\d{10}$/.test(cleaned)) return '+' + cleaned;
  if (/^0\d{10}$/.test(cleaned)) return '+234' + cleaned.slice(1);
  return null;
}

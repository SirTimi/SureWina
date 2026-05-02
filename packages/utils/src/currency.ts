const NAIRA_SYMBOL = '₦';

export function formatNaira(
  amount: number,
  options: { decimals?: number; showSymbol?: boolean } = {},
): string {
  const { decimals, showSymbol = true } = options;
  const effectiveDecimals = decimals ?? (Number.isInteger(amount) ? 0 : 2);
  const formatted = amount.toLocaleString('en-NG', {
    minimumFractionDigits: effectiveDecimals,
    maximumFractionDigits: effectiveDecimals,
  });
  return showSymbol ? `${NAIRA_SYMBOL}${formatted}` : formatted;
}

export function parseNaira(input: string): number {
  if (!input) return NaN;
  const cleaned = input.replace(/[₦,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export const VALID_TICKET_PRICES = [500, 5000] as const;
export type TicketPrice = (typeof VALID_TICKET_PRICES)[number];

export function isValidTicketPrice(amount: number): amount is TicketPrice {
  return (VALID_TICKET_PRICES as readonly number[]).includes(amount);
}
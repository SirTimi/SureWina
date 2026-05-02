import { describe, it, expect } from 'vitest';
import { formatNaira, parseNaira, isValidTicketPrice, VALID_TICKET_PRICES } from './currency.js';

describe('formatNaira', () => {
  it('formats whole numbers', () => {
    expect(formatNaira(500)).toBe('₦500');
    expect(formatNaira(4000000)).toBe('₦4,000,000');
  });
  it('formats decimals', () => {
    expect(formatNaira(1234.56)).toBe('₦1,234.56');
  });
  it('omits symbol when requested', () => {
    expect(formatNaira(500, { showSymbol: false })).toBe('500');
  });
});

describe('parseNaira', () => {
  it('parses formatted strings', () => {
    expect(parseNaira('₦1,234.56')).toBe(1234.56);
  });
  it('returns NaN for invalid', () => {
    expect(parseNaira('not a number')).toBeNaN();
  });
});

describe('isValidTicketPrice', () => {
  it('accepts valid', () => {
    expect(isValidTicketPrice(500)).toBe(true);
    expect(isValidTicketPrice(5000)).toBe(true);
  });
  it('rejects invalid', () => {
    expect(isValidTicketPrice(100)).toBe(false);
  });
});
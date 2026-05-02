import { describe, it, expect } from 'vitest';
import { parseTicketRef, isValidTicketRef, formatTicketRef } from './ticket-ref.js';

describe('parseTicketRef', () => {
  it('parses valid', () => {
    const result = parseTicketRef('RD-20260427-000001');
    expect(result?.sequence).toBe(1);
  });
  it('rejects invalid prefix', () => {
    expect(parseTicketRef('XX-20260427-000001')).toBeNull();
  });
  it('rejects invalid date', () => {
    expect(parseTicketRef('RD-20261327-000001')).toBeNull();
  });
});

describe('isValidTicketRef', () => {
  it('returns true for valid', () => {
    expect(isValidTicketRef('RD-20260427-000001')).toBe(true);
  });
});

describe('formatTicketRef', () => {
  it('formats components', () => {
    const date = new Date(Date.UTC(2026, 3, 27));
    expect(formatTicketRef(date, 1)).toBe('RD-20260427-000001');
  });
  it('throws on out-of-range', () => {
    const date = new Date(Date.UTC(2026, 3, 27));
    expect(() => formatTicketRef(date, 0)).toThrow(RangeError);
  });
});
import { describe, it, expect } from 'vitest';
import {
  NIGERIAN_STATES,
  getStateByCode,
  isValidStateCode,
  getAllStatesSorted,
  getStatesByZone,
} from './states.js';

describe('NIGERIAN_STATES', () => {
  it('has 37 entries', () => {
    expect(NIGERIAN_STATES).toHaveLength(37);
  });
  it('includes FCT', () => {
    expect(NIGERIAN_STATES.some((s) => s.code === 'FCT')).toBe(true);
  });
  it('all codes are unique', () => {
    const codes = NIGERIAN_STATES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('getStateByCode', () => {
  it('finds states', () => {
    expect(getStateByCode('LAG')?.name).toBe('Lagos');
  });
  it('is case-insensitive', () => {
    expect(getStateByCode('lag')?.name).toBe('Lagos');
  });
  it('returns undefined for unknown', () => {
    expect(getStateByCode('XXX')).toBeUndefined();
  });
});

describe('isValidStateCode', () => {
  it('accepts valid', () => {
    expect(isValidStateCode('LAG')).toBe(true);
  });
  it('rejects invalid', () => {
    expect(isValidStateCode('XXX')).toBe(false);
  });
});

describe('getAllStatesSorted', () => {
  it('returns sorted', () => {
    const sorted = getAllStatesSorted();
    expect(sorted[0].name).toBe('Abia');
  });
});

describe('getStatesByZone', () => {
  it('groups correctly', () => {
    const grouped = getStatesByZone();
    expect(grouped['North Central']).toHaveLength(7);
    expect(grouped['South East']).toHaveLength(5);
  });
});
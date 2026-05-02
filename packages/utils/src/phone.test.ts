import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidNigerianPhone, formatPhoneForDisplay, maskPhone } from './phone.js';

describe('normalizePhone', () => {
  it('accepts E.164', () => {
    expect(normalizePhone('+2348012345678')).toBe('+2348012345678');
  });
  it('accepts local with leading 0', () => {
    expect(normalizePhone('08012345678')).toBe('+2348012345678');
  });
  it('strips formatting', () => {
    expect(normalizePhone('0801 234 5678')).toBe('+2348012345678');
  });
  it('rejects invalid prefix', () => {
    expect(normalizePhone('06012345678')).toBeNull();
  });
  it('rejects empty', () => {
    expect(normalizePhone('')).toBeNull();
  });
});

describe('isValidNigerianPhone', () => {
  it('returns true for valid', () => {
    expect(isValidNigerianPhone('08012345678')).toBe(true);
  });
  it('returns false for invalid', () => {
    expect(isValidNigerianPhone('06012345678')).toBe(false);
  });
});

describe('formatPhoneForDisplay', () => {
  it('formats E.164', () => {
    expect(formatPhoneForDisplay('+2348012345678')).toBe('+234 801 234 5678');
  });
});

describe('maskPhone', () => {
  it('masks middle', () => {
    expect(maskPhone('+2348012345678')).toBe('+234 801 *** **78');
  });
});
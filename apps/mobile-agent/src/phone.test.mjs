import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNigerianPhone } from './phone.ts';

test('accepts supported Nigerian agent phone formats', () => {
  assert.equal(normalizeNigerianPhone('08012345678'), '+2348012345678');
  assert.equal(normalizeNigerianPhone('+2348012345678'), '+2348012345678');
  assert.equal(normalizeNigerianPhone('234 801 234 5678'), '+2348012345678');
});
test('rejects invalid agent phones', () => {
  for (const candidate of ['12345', '08012345', '+15551234567', '', 'abc']) {
    assert.equal(normalizeNigerianPhone(candidate), null);
  }
});

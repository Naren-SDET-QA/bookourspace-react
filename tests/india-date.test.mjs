import test from 'node:test';
import assert from 'node:assert/strict';
import { indiaTodayIso } from '../src/lib/indiaDate.ts';

test('customer stay actions use the India calendar date across browser timezones', () => {
  assert.equal(indiaTodayIso(new Date('2026-11-05T19:30:00Z')), '2026-11-06');
  assert.equal(indiaTodayIso(new Date('2026-11-06T00:00:00Z')), '2026-11-06');
});

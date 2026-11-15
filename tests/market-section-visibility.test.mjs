import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_MARKET_SECTION_VISIBILITY,
  isMarketSectionId,
  normalizeMarketSectionVisibility,
} from '../src/shared/marketSectionVisibility.ts';

test('section visibility defaults to the six existing sections being enabled', () => {
  assert.deepEqual(normalizeMarketSectionVisibility(undefined), DEFAULT_MARKET_SECTION_VISIBILITY);
});

test('section visibility accepts boolean overrides and ignores malformed values', () => {
  assert.deepEqual(
    normalizeMarketSectionVisibility({ hotel_stay: false, pg_hostels: 'off', movies: true }),
    { ...DEFAULT_MARKET_SECTION_VISIBILITY, hotel_stay: false, movies: true }
  );
});

test('section identifiers are allowlisted', () => {
  assert.equal(isMarketSectionId('hotel_stay'), true);
  assert.equal(isMarketSectionId('unknown'), false);
});

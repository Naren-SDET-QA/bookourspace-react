import assert from 'node:assert/strict';
import test from 'node:test';
import { filterListingsByCity } from '../src/lib/locationCityFilter.ts';

const listings = [
  { id: 'pg', module: 'PGs', location: { city: 'Hyderabad' } },
  { id: 'class', module: 'Classes', location: { city: 'Hyderabad' } },
  { id: 'hall', module: 'Halls', location: { city: 'Hyderabad' } },
  { id: 'service', module: 'Services', location: { city: 'Hyderabad' } },
  { id: 'stay', module: 'Stays', location: { city: 'Hyderabad' } },
  { id: 'movie', module: 'Movies', location: { city: 'Hyderabad' } },
  { id: 'other-city', module: 'PGs', location: { city: 'Bengaluru' } },
];

test('common city filter preserves all six modules and excludes other-city listings', () => {
  const visible = filterListingsByCity(listings, 'Hyderabad');
  assert.deepEqual(new Set(visible.map((item) => item.module)), new Set(['PGs', 'Classes', 'Halls', 'Services', 'Stays', 'Movies']));
  assert.equal(visible.some((item) => item.id === 'other-city'), false);
});

test('All Cities and legacy All Locations values do not apply a city filter', () => {
  assert.equal(filterListingsByCity(listings, 'All Cities').length, listings.length);
  assert.equal(filterListingsByCity(listings, 'All Locations').length, listings.length);
});

test('a selected city with no matching rows stays empty', () => {
  assert.deepEqual(filterListingsByCity(listings, 'Visakhapatnam'), []);
});

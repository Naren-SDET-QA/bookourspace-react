import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { debounceMsForQuery, searchIndiaLocations, LOCATION_SEARCH_DEBOUNCE_MS, LOCATION_SEARCH_LIMIT } from '../src/lib/indiaLocationSearch.ts';
import { clearLocationSearchCacheForTests } from '../src/lib/locationSearch.ts';
import { filterListingsByLocation, matchesSelectedLocation } from '../src/lib/locationCityFilter.ts';
import { locationTsQuery } from '../src/server/locationSearchApi.ts';

test('location autocomplete is debounced consistently, including PIN queries', () => {
  assert.equal(debounceMsForQuery('Hyd'), LOCATION_SEARCH_DEBOUNCE_MS);
  assert.equal(debounceMsForQuery('500081'), LOCATION_SEARCH_DEBOUNCE_MS);
  assert.equal(LOCATION_SEARCH_DEBOUNCE_MS, 280);
});

test('client autocomplete uses bounded server results and never falls back to a bundled India dataset', async () => {
  clearLocationSearchCacheForTests();
  const source = await readFile(new URL('../src/lib/indiaLocationSearch.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /data\/indiaLocations|sessionStorage|localLocationSuggestions/);
  const originalFetch = globalThis.fetch;
  let requested = '';
  globalThis.fetch = async (url) => {
    requested = String(url);
    return new Response(JSON.stringify({ ok: true, locations: [{
      id: 7, name: 'Madhapur', state: 'Telangana', district: 'Hyderabad', stateCode: 'TG',
      type: 'town', lat: 17.4483, lng: 78.3915, label: 'Madhapur, Hyderabad, Telangana', aliases: [], source: 'directory',
    }], nextOffset: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const rows = await searchIndiaLocations('Madhapur');
    assert.ok(requested.startsWith('/api/locations/search?'));
    assert.equal(new URL(requested, 'http://local').searchParams.get('q'), 'Madhapur');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Madhapur');
    assert.ok(rows.length <= LOCATION_SEARCH_LIMIT);
  } finally {
    globalThis.fetch = originalFetch;
    clearLocationSearchCacheForTests();
  }
});

test('listing location filters remain shared across all six modules', () => {
  const listings = [
    { id: 'pg', location: { city: 'Hyderabad', area: 'Madhapur', pincode: '500081' } },
    { id: 'class', location: { city: 'Hyderabad', area: 'Madhapur' } },
    { id: 'hall', location: { city: 'Mumbai', area: 'Andheri' } },
    { id: 'service', location: { city: 'Bengaluru', area: 'Koramangala' } },
    { id: 'stay', location: { city: 'Hyderabad', area: 'Gachibowli' } },
    { id: 'movie', location: { city: 'Hyderabad' } },
  ];
  assert.deepEqual(filterListingsByLocation(listings, { city: 'Hyderabad' }).map((row) => row.id), ['pg', 'class', 'stay', 'movie']);
  assert.equal(filterListingsByLocation(listings, { area: 'Madhapur' }).map((row) => row.id).join(','), 'pg,class');
  assert.equal(filterListingsByLocation(listings, { pincode: '500081' }).map((row) => row.id).join(','), 'pg');
  assert.equal(matchesSelectedLocation(listings[3].location, { city: 'All Cities' }), true);
});

test('FTS query builder keeps safe prefix tokens for names and PINs', () => {
  assert.equal(locationTsQuery('Hitech City'), 'hitech:* & city:*');
  assert.equal(locationTsQuery('500081'), '500081:*');
  assert.equal(locationTsQuery('a'), '');
});

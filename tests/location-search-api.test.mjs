import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import express from 'express';
import pg from 'pg';
import { registerLocationSearchApi, locationTsQuery } from '../src/server/locationSearchApi.ts';
import {
  clearLocationSearchCacheForTests,
  fetchExternalLocationSuggestions,
  fetchPopularLocations,
  locationSearchCacheSizeForTests,
  searchLocationPage,
} from '../src/lib/locationSearch.ts';

const { Pool } = pg;
let server;
let pool;
let origin;

async function startServer(app) {
  const instance = createServer(app);
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  const address = instance.address();
  return { server: instance, origin: `http://127.0.0.1:${address.port}` };
}

test('PostgreSQL-backed location API is paged, cacheable, private at table level, and fast on cache hits', { skip: !process.env.BOS_LOCATION_TEST_DATABASE_URL }, async () => {
  const connectionString = process.env.BOS_LOCATION_TEST_DATABASE_URL;
  assert.ok(connectionString, 'isolated PostgreSQL test URL must be provided by the validation runner');
  pool = new Pool({ connectionString, max: 4 });
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  registerLocationSearchApi(app, { pool, env: { NODE_ENV: 'test' } });
  ({ server, origin } = await startServer(app));

  const popularFirst = await fetch(`${origin}/api/locations/popular`);
  const popularPayload = await popularFirst.json();
  assert.equal(popularFirst.status, 200, `popular API response: ${JSON.stringify(popularPayload)}`);
  assert.equal(popularFirst.headers.get('x-location-cache'), 'MISS');
  assert.ok(popularPayload.locations.length <= 8);
  assert.ok(Buffer.byteLength(JSON.stringify(popularPayload)) < 100_000, 'first location payload must be under 100 KB');
  assert.ok(gzipSync(Buffer.from(JSON.stringify(popularPayload))).byteLength < 100_000, 'compressed first location payload must be under 100 KB');

  const statesResponse = await fetch(`${origin}/api/locations/states`);
  const statesPayload = await statesResponse.json();
  assert.equal(statesResponse.status, 200);
  assert.ok(Buffer.byteLength(JSON.stringify(popularPayload)) + Buffer.byteLength(JSON.stringify(statesPayload)) < 100_000,
    'initial popular + state payloads remain under 100 KB');

  const search = await fetch(`${origin}/api/locations/search?q=hyder`);
  const searchPayload = await search.json();
  assert.equal(search.status, 200);
  assert.ok(searchPayload.locations.some((location) => location.name === 'Hyderabad'));
  assert.ok(searchPayload.locations.length <= 20);
  assert.equal(searchPayload.nextOffset, null);

  const firstPageResponse = await fetch(`${origin}/api/locations/search?state=Telangana`);
  const firstPage = await firstPageResponse.json();
  assert.equal(firstPageResponse.status, 200);
  assert.ok(firstPage.locations.length <= 20);
  if (firstPage.nextOffset !== null) {
    assert.equal(firstPage.nextOffset, 20);
    const secondPageResponse = await fetch(`${origin}/api/locations/search?state=Telangana&offset=20`);
    const secondPage = await secondPageResponse.json();
    assert.equal(secondPageResponse.status, 200);
    assert.notEqual(firstPage.locations[0]?.id, secondPage.locations[0]?.id);
  }

  const latencies = [];
  for (let i = 0; i < 60; i += 1) {
    const started = performance.now();
    const response = await fetch(`${origin}/api/locations/search?q=hyder`);
    const payload = await response.json();
    latencies.push(performance.now() - started);
    assert.equal(response.headers.get('x-location-cache'), 'HIT');
    assert.equal(payload.locations[0].name, 'Hyderabad');
  }
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
  assert.ok(p95 < 300, `cached local API p95 should be <300ms; observed ${p95.toFixed(2)}ms`);

  const nearestResponse = await fetch(`${origin}/api/locations/nearest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: 17.385, longitude: 78.4867 }),
  });
  const nearestPayload = await nearestResponse.json();
  assert.equal(nearestResponse.status, 200);
  assert.equal(nearestResponse.headers.get('cache-control'), 'no-store');
  assert.equal(nearestPayload.location.name, 'Hyderabad');
  assert.ok(!nearestResponse.url.includes('17.385') && !nearestResponse.url.includes('78.4867'));
  assert.equal(locationTsQuery('Vizag, Andhra Pradesh'), 'vizag:* & andhra:* & pradesh:*');
  assert.equal(locationTsQuery('a'), '');

  const { rows: [stats] } = await pool.query(`
    select pg_total_relation_size('public.india_locations')::bigint as bytes,
           count(*)::integer as rows
      from public.india_locations`);
  console.log(`LOCATION_BENCHMARK rows=${stats.rows} relation_bytes=${stats.bytes} payload_raw_bytes=${Buffer.byteLength(JSON.stringify(popularPayload)) + Buffer.byteLength(JSON.stringify(statesPayload))} payload_gzip_bytes=${gzipSync(Buffer.from(JSON.stringify(popularPayload) + JSON.stringify(statesPayload))).byteLength} cached_api_p95_ms=${p95.toFixed(2)} cached_samples=${latencies.length}`);
});

test('client keeps catalog cache bounded and does not cache external provider results', async () => {
  clearLocationSearchCacheForTests();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init = {}) => {
    calls += 1;
    const value = String(url);
    if (value.includes('/popular')) return new Response(JSON.stringify({ ok: true, locations: [] }), { status: 200 });
    if (value.includes('/external/autocomplete')) return new Response(JSON.stringify({ ok: true, places: [] }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, locations: [], nextOffset: null }), { status: 200 });
  };
  try {
    await fetchPopularLocations();
    await fetchPopularLocations();
    assert.equal(calls, 1, 'catalog response should be served from bounded client memory cache');
    assert.equal(locationSearchCacheSizeForTests(), 1);
    await searchLocationPage({ query: 'mumbai', offset: 20 });
    assert.equal(calls, 2, 'later pages are requested independently');
    const token = '11111111-1111-4111-8111-111111111111';
    await fetchExternalLocationSuggestions('uncommon place', token);
    await fetchExternalLocationSuggestions('uncommon place', token);
    assert.equal(calls, 4, 'external content bypasses the catalog cache');
  } finally {
    globalThis.fetch = originalFetch;
    clearLocationSearchCacheForTests();
  }
});

test('Google Places fallback is server-only, attribution-ready, and never cached', async () => {
  let providerCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    providerCalls += 1;
    assert.equal(new Headers(init.headers).get('x-goog-api-key'), 'server-only-test-key');
    if (String(url).includes('places:autocomplete')) {
      return new Response(JSON.stringify({ suggestions: [{ placePrediction: {
        placeId: 'ChIJTestPlace_01', text: { text: 'Test Area, India' },
        structuredFormat: { mainText: { text: 'Test Area' }, secondaryText: { text: 'India' } },
      } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      id: 'ChIJTestPlace_01', displayName: { text: 'Test Area' }, formattedAddress: 'Test Area, Hyderabad, India',
      location: { latitude: 17.4, longitude: 78.4 },
      addressComponents: [
        { longText: 'Hyderabad', types: ['locality'] },
        { longText: 'Telangana', types: ['administrative_area_level_1'] },
      ],
    }), { status: 200 });
  };
  const app = express();
  app.use(express.json());
  registerLocationSearchApi(app, { env: { GOOGLE_MAPS_PLACES_API_KEY: 'server-only-test-key', BOS_GOOGLE_MAPS_TERMS_READY: 'true' }, fetchImpl });
  const started = await startServer(app);
  try {
    const sessionToken = '22222222-2222-4222-8222-222222222222';
    const autocomplete = await fetch(`${started.origin}/api/locations/external/autocomplete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Test Area, India', sessionToken }),
    });
    const suggestions = await autocomplete.json();
    assert.equal(autocomplete.status, 200);
    assert.equal(autocomplete.headers.get('cache-control'), 'no-store');
    assert.equal(suggestions.provider, 'google_maps');
    assert.equal(suggestions.places[0].mainText, 'Test Area');
    assert.ok(!JSON.stringify(suggestions).includes('server-only-test-key'));
    const resolvedResponse = await fetch(`${started.origin}/api/locations/external/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId: suggestions.places[0].placeId, sessionToken }),
    });
    const resolved = await resolvedResponse.json();
    assert.equal(resolvedResponse.status, 200);
    assert.equal(resolvedResponse.headers.get('cache-control'), 'no-store');
    assert.equal(resolved.location.city, 'Hyderabad');
    assert.equal(resolved.location.source, 'external');
    assert.equal(providerCalls, 2);
  } finally {
    await new Promise((resolve) => started.server.close(resolve));
  }
});


test('Google Places stays disabled until server key and Terms/Privacy readiness are both configured', async () => {
  let providerCalls = 0;
  const app = express();
  app.use(express.json());
  registerLocationSearchApi(app, { env: { GOOGLE_MAPS_PLACES_API_KEY: 'server-only-test-key', BOS_GOOGLE_MAPS_TERMS_READY: 'false' }, fetchImpl: async () => { providerCalls += 1; return new Response('{}'); } });
  const started = await startServer(app);
  try {
    const response = await fetch(`${started.origin}/api/locations/external/autocomplete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Unlisted area', sessionToken: '33333333-3333-4333-8333-333333333333' }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'EXTERNAL_LOCATION_PROVIDER_NOT_CONFIGURED');
    assert.equal(providerCalls, 0);
  } finally {
    await new Promise((resolve) => started.server.close(resolve));
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
});

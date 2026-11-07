import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { registerLocationSearchApi } from '../src/server/locationSearchApi.ts';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('Nominatim is last fallback, India-only, identified, cached, and capped at 1 request per second', async () => {
  const calls = [];
  const app = express();
  app.use(express.json());
  registerLocationSearchApi(app, {
    env: { NODE_ENV: 'test' },
    pool: {
      connect: async () => ({
        query: async (sql) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql === 'SET LOCAL ROLE service_role') return { rows: [] };
          return { rows: [] };
        },
        release: () => undefined,
      }),
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), userAgent: init?.headers?.['User-Agent'] || init?.headers?.['user-agent'] });
      return new Response(JSON.stringify([{
        display_name: 'Connaught Place, New Delhi, Delhi, India',
        lat: '28.6315',
        lon: '77.2167',
        address: { country_code: 'in', state: 'Delhi', county: 'New Delhi' },
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    now: (() => {
      let t = 1_000;
      return () => t;
    })(),
  });
  const server = await listen(app);
  const port = server.address().port;
  try {
    const first = await fetch(`http://127.0.0.1:${port}/api/locations/search?q=ConnaughtPlaceX9`);
    const firstBody = await first.json();
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-location-cache'), 'MISS');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /nominatim\.openstreetmap\.org/);
    assert.match(calls[0].url, /countrycodes=in/);
    assert.match(calls[0].userAgent, /BookOurSpace/);
    assert.equal(firstBody.locations[0].source, 'geocode');
    assert.equal(firstBody.locations[0].name, 'Connaught Place');

    const second = await fetch(`http://127.0.0.1:${port}/api/locations/search?q=ConnaughtPlaceX9`);
    assert.equal(second.headers.get('x-location-cache'), 'HIT');
    assert.equal(calls.length, 1);

    await fetch(`http://127.0.0.1:${port}/api/locations/search?q=AnotherMissingPlaceY8`);
    assert.equal(calls.length, 1, 'second distinct miss inside 1s must not call Nominatim');

    const external = await fetch(`http://127.0.0.1:${port}/api/locations/external/autocomplete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Connaught Place', sessionToken: '44444444-4444-4444-8444-444444444444' }),
    });
    assert.equal(external.status, 503);
    assert.equal((await external.json()).error, 'EXTERNAL_LOCATION_PROVIDER_NOT_CONFIGURED');
    assert.equal(calls.length, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

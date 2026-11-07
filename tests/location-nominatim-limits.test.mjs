import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { registerLocationSearchApi } from '../src/server/locationSearchApi.ts';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('unmatched catalog search does not call an unapproved external geocoder', async () => {
  let providerCalls = 0;
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
    fetchImpl: async () => { providerCalls += 1; return new Response('{}', { status: 200 }); },
  });
  const server = await listen(app);
  const port = server.address().port;
  try {
    const first = await fetch(`http://127.0.0.1:${port}/api/locations/search?q=ConnaughtPlaceX9`);
    const firstBody = await first.json();
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-location-cache'), 'MISS');
    assert.deepEqual(firstBody.locations, []);
    assert.equal(providerCalls, 0);

    const second = await fetch(`http://127.0.0.1:${port}/api/locations/search?q=ConnaughtPlaceX9`);
    assert.equal(second.headers.get('x-location-cache'), 'HIT');
    assert.equal(providerCalls, 0);

    await fetch(`http://127.0.0.1:${port}/api/locations/search?q=AnotherMissingPlaceY8`);
    assert.equal(providerCalls, 0);

    const external = await fetch(`http://127.0.0.1:${port}/api/locations/external/autocomplete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Connaught Place', sessionToken: '44444444-4444-4444-8444-444444444444' }),
    });
    assert.equal(external.status, 503);
    assert.equal((await external.json()).error, 'EXTERNAL_LOCATION_PROVIDER_NOT_CONFIGURED');
    assert.equal(providerCalls, 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import express from 'express';
import { apiRouteNotFound } from '../src/server/apiRouteNotFound.ts';

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.get('/api/known', (_req, res) => res.json({ ok: true }));
  // Mirrors server.ts: the guard sits after every API registration and before
  // the static/SPA fallback.
  app.use('/api', apiRouteNotFound);
  app.get('*', (_req, res) => res.type('html').send('<!doctype html><title>app</title>'));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('an unmatched API path answers 404 JSON instead of the SPA document', async () => {
  const response = await fetch(`${baseUrl}/api/marketplace/listings-typo`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'API_ROUTE_NOT_FOUND');
});

test('the guard applies to every method and never shadows a registered route', async () => {
  const mutation = await fetch(`${baseUrl}/api/bookings/missing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(mutation.status, 404);
  assert.equal((await mutation.json()).error, 'API_ROUTE_NOT_FOUND');

  const known = await fetch(`${baseUrl}/api/known`);
  assert.equal(known.status, 200);
  assert.deepEqual(await known.json(), { ok: true });
});

test('non-API client routes still receive the SPA document', async () => {
  const response = await fetch(`${baseUrl}/classes`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(await response.text(), /<title>app<\/title>/);
});

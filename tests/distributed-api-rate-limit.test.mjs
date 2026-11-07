import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createDistributedApiRateLimitMiddleware } from '../src/server/distributedApiRateLimit.ts';

async function withServer(middleware, run) {
  const app = express();
  app.use(middleware);
  app.post('/api/bookings/:id', (_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('distributed limiter sends normalized route, method and HMAC bucket to PostgreSQL', async () => {
  const calls = [];
  const pool = { async query(_sql, params) { calls.push(params); return { rows: [{ allowed: true, retry_after_seconds: 60, remaining: 29 }] }; } };
  await withServer(createDistributedApiRateLimitMiddleware({ pool, hmacSecret: 'a'.repeat(32), enabled: true }), async (origin) => {
    const response = await fetch(`${origin}/api/bookings/123456`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('ratelimit-remaining'), '29');
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /^[a-f0-9]{64}$/);
  assert.equal(calls[0][1], 30);
  assert.equal(calls[0][2], 60);
  assert.equal(JSON.stringify(calls).includes('127.0.0.1'), false);
});

test('distributed limiter returns 429 and Retry-After when PostgreSQL denies a request', async () => {
  const pool = { async query() { return { rows: [{ allowed: false, retry_after_seconds: 7, remaining: 0 }] }; } };
  await withServer(createDistributedApiRateLimitMiddleware({ pool, hmacSecret: 'b'.repeat(32), enabled: true }), async (origin) => {
    const response = await fetch(`${origin}/api/bookings/123456`, { method: 'POST' });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '7');
    assert.deepEqual(await response.json(), { ok: false, error: 'RATE_LIMITED', retryAfterSeconds: 7 });
  });
});

test('enabled limiter fails closed on database failure and does not log database errors', async () => {
  const pool = { async query() { throw new Error('private connection details'); } };
  await withServer(createDistributedApiRateLimitMiddleware({ pool, hmacSecret: 'c'.repeat(32), enabled: true }), async (origin) => {
    const response = await fetch(`${origin}/api/bookings/123456`, { method: 'POST' });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: 'RATE_LIMIT_SERVICE_UNAVAILABLE' });
  });
});

test('disabled limiter continues without rate-limit database calls', async () => {
  let calls = 0;
  const pool = { async query() { calls += 1; return { rows: [] }; } };
  const middleware = createDistributedApiRateLimitMiddleware({ pool, hmacSecret: 'd'.repeat(32), enabled: false });
  await withServer(middleware, async (origin) => {
    assert.equal((await fetch(`${origin}/api/bookings/123456`)).status, 404);
  });
  assert.equal(calls, 0);
});

test('enabled limiter also limits API reads', async () => {
  let calls = 0;
  const pool = { async query() { calls += 1; return { rows: [{ allowed: true, retry_after_seconds: 60, remaining: 119 }] }; } };
  const app = express();
  app.use(createDistributedApiRateLimitMiddleware({ pool, hmacSecret: 'e'.repeat(32), enabled: true }));
  app.get('/api/catalog', (_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/catalog`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('ratelimit-limit'), '120');
    assert.equal(calls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

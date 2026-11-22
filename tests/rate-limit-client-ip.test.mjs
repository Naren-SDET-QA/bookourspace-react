import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createDistributedApiRateLimitMiddleware } from '../src/server/distributedApiRateLimit.ts';
import {
  configureTrustProxy,
  normalizeClientAddress,
  resolveTrustProxy,
} from '../src/server/trustProxy.ts';

/**
 * SEC-01 regression coverage.
 *
 * These tests exercise the real Express application, the real trusted-proxy
 * configuration and the real rate-limit middleware over a real HTTP socket. The
 * PostgreSQL call is an in-process stub that counts the bucket hashes the
 * middleware actually produced, so the assertions are about the client-IP and
 * bucket derivation — the SQL limiter itself is covered by
 * `supabase/tests/distributed_api_rate_limit_test.sql`.
 */

const CLOUD_RUN_ENV = { K_SERVICE: 'bookourspace-api', NODE_ENV: 'production' };

function countingPool() {
  const windows = new Map();
  const hashes = [];
  const limits = [];
  return {
    hashes,
    limits,
    async query(_sql, params) {
      const bucketHash = String(params[0]);
      const bucketLimit = Number(params[1]);
      hashes.push(bucketHash);
      limits.push(bucketLimit);
      const used = (windows.get(bucketHash) || 0) + 1;
      windows.set(bucketHash, used);
      return {
        rows: [{
          allowed: used <= bucketLimit,
          retry_after_seconds: 30,
          remaining: Math.max(0, bucketLimit - used),
        }],
      };
    },
  };
}

async function withApp({ env, pool }, run) {
  const app = express();
  configureTrustProxy(app, env);
  app.use(createDistributedApiRateLimitMiddleware({
    pool,
    hmacSecret: 's'.repeat(32),
    enabled: true,
  }));
  app.get('/api/catalog', (_req, res) => res.json({ ok: true }));
  app.post('/api/bookings/:id', (_req, res) => res.json({ ok: true }));
  app.post('/api/auth/login', (_req, res) => res.json({ ok: true }));

  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/** Raw node:http request so X-Forwarded-For is sent exactly as given. */
function request(origin, { method = 'GET', path = '/api/catalog', forwarded } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(origin);
    const headers = {};
    if (forwarded !== undefined) headers['x-forwarded-for'] = forwarded;
    const req = httpRequest(
      { host: url.hostname, port: url.port, method, path, headers },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('trusted-proxy topology is exactly one hop on Cloud Run and refuses to guess elsewhere', () => {
  assert.deepEqual(
    resolveTrustProxy({ K_SERVICE: 'bookourspace-api', NODE_ENV: 'production' }),
    { hops: 1, source: 'cloud-run', expressValue: 1 },
  );
  assert.deepEqual(
    resolveTrustProxy({ NODE_ENV: 'development' }),
    { hops: 0, source: 'disabled', expressValue: false },
  );
  assert.deepEqual(
    resolveTrustProxy({ NODE_ENV: 'production', BOS_TRUST_PROXY_HOPS: '2' }),
    { hops: 2, source: 'explicit', expressValue: 2 },
  );
  assert.deepEqual(
    resolveTrustProxy({ NODE_ENV: 'production', BOS_TRUST_PROXY_HOPS: '0' }),
    { hops: 0, source: 'disabled', expressValue: false },
  );

  // A production process with no declared topology must not start.
  assert.throws(
    () => resolveTrustProxy({ NODE_ENV: 'production' }),
    /BOS_TRUST_PROXY_HOPS_REQUIRED/,
  );

  // Expressions that would trust more than the declared hops are refused.
  for (const value of ['true', '*', 'loopback', '1,2', '9', '1 hop']) {
    assert.throws(
      () => resolveTrustProxy({ NODE_ENV: 'production', BOS_TRUST_PROXY_HOPS: value }),
      /BOS_TRUST_PROXY_HOPS_INVALID/,
      `BOS_TRUST_PROXY_HOPS=${value} must be refused`,
    );
  }
});

test('client address normalization collapses IPv4-mapped IPv6 to one bucket key', () => {
  assert.equal(normalizeClientAddress('::ffff:203.0.113.10'), '203.0.113.10');
  assert.equal(normalizeClientAddress('203.0.113.10'), '203.0.113.10');
  assert.equal(normalizeClientAddress('  203.0.113.10  '), '203.0.113.10');
  assert.equal(normalizeClientAddress(''), '');
  assert.equal(normalizeClientAddress(undefined), '');
});

test('two distinct client IPs receive independent buckets over HTTP', async () => {
  const pool = countingPool();
  await withApp({ env: CLOUD_RUN_ENV, pool }, async (origin) => {
    const first = await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '203.0.113.10' });
    const second = await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '203.0.113.11' });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
  });

  assert.equal(pool.hashes.length, 2);
  assert.notEqual(pool.hashes[0], pool.hashes[1], 'distinct client addresses must not share a bucket');
  // The bucket is an HMAC of the address; the raw address must never reach the database.
  assert.equal(JSON.stringify(pool.hashes).includes('203.0.113'), false);
});

test('repeated requests from one client IP share one bucket over HTTP', async () => {
  const pool = countingPool();
  await withApp({ env: CLOUD_RUN_ENV, pool }, async (origin) => {
    for (let index = 0; index < 3; index += 1) {
      const response = await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '203.0.113.10' });
      assert.equal(response.status, 200);
    }
  });

  assert.equal(pool.hashes.length, 3);
  assert.equal(new Set(pool.hashes).size, 1, 'one client address must stay in one bucket');
});

test('forged forwarding prefixes cannot bypass or move the bucket over HTTP', async () => {
  const pool = countingPool();
  await withApp({ env: CLOUD_RUN_ENV, pool }, async (origin) => {
    // Honest request: only the address appended by the trusted front end.
    await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '203.0.113.10' });
    // The client prepends two different fake entries; the front end still
    // appended 203.0.113.10, so the bucket must not change.
    await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '198.51.100.99, 203.0.113.10' });
    await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '198.51.100.77, 203.0.113.10' });
    // A genuinely different client keeps its own bucket.
    await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '203.0.113.11' });
  });

  const [honest, forgedA, forgedB, otherClient] = pool.hashes;
  assert.equal(forgedA, honest, 'a forged prefix must not create a new bucket');
  assert.equal(forgedB, honest, 'a second forged prefix must not create a new bucket');
  assert.notEqual(otherClient, honest, 'a different real client must still get its own bucket');
});

test('with proxy trust disabled, forwarded headers are ignored entirely over HTTP', async () => {
  const pool = countingPool();
  await withApp({ env: { NODE_ENV: 'development' }, pool }, async (origin) => {
    // A direct process must key on the socket address, so two different
    // X-Forwarded-For values cannot split one caller into two buckets.
    assert.equal((await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '203.0.113.10' })).status, 200);
    assert.equal((await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '203.0.113.11' })).status, 200);
  });

  assert.equal(pool.hashes.length, 2);
  assert.equal(new Set(pool.hashes).size, 1, 'untrusted forwarded headers must not select the bucket');
});

test('authentication limit stays 12/minute per client and the API limit stays enforced', async () => {
  const pool = countingPool();
  await withApp({ env: CLOUD_RUN_ENV, pool }, async (origin) => {
    for (let index = 0; index < 12; index += 1) {
      const response = await request(origin, { method: 'POST', path: '/api/auth/login', forwarded: '203.0.113.10' });
      assert.equal(response.status, 200, `auth request ${index + 1} must be allowed`);
      assert.equal(response.headers['ratelimit-limit'], '12');
    }

    const limited = await request(origin, { method: 'POST', path: '/api/auth/login', forwarded: '203.0.113.10' });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers['retry-after'], '30');
    assert.deepEqual(JSON.parse(limited.body), { ok: false, error: 'RATE_LIMITED', retryAfterSeconds: 30 });

    // A different client is unaffected by the first client's exhaustion.
    const otherClient = await request(origin, { method: 'POST', path: '/api/auth/login', forwarded: '203.0.113.11' });
    assert.equal(otherClient.status, 200);

    // Generic API reads keep their own, wider budget.
    const catalog = await request(origin, { path: '/api/catalog', forwarded: '203.0.113.10' });
    assert.equal(catalog.status, 200);
    assert.equal(catalog.headers['ratelimit-limit'], '120');
  });

  // 12 allowed for the first client + 1 limited for the same client + 1 for
  // the second client, all charged to the 12/minute authentication budget.
  assert.equal(pool.limits.filter((limit) => limit === 12).length, 14);
  assert.equal(pool.limits.filter((limit) => limit === 120).length, 1);
});

test('booking and payment routes keep their 30/minute per-client limit', async () => {
  const pool = countingPool();
  await withApp({ env: CLOUD_RUN_ENV, pool }, async (origin) => {
    const response = await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '203.0.113.10' });
    assert.equal(response.status, 200);
    assert.equal(response.headers['ratelimit-limit'], '30');

    for (let index = 0; index < 29; index += 1) {
      await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '203.0.113.10' });
    }
    const limited = await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '203.0.113.10' });
    assert.equal(limited.status, 429);

    // Another client still has its full budget.
    const otherClient = await request(origin, { method: 'POST', path: '/api/bookings/abc', forwarded: '203.0.113.11' });
    assert.equal(otherClient.status, 200);
  });
});

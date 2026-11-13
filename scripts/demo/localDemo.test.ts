import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import { localDemoMiddleware } from '../../src/server/localDemo';
import { localDatabaseEnv } from './database';

test('local demo blocks external-action routes and leaves movie authorization with the real router', async () => {
  const app = express();
  let handlerReached = false;
  app.use(localDemoMiddleware('http://localhost:55421'));
  app.use((_req, res) => { handlerReached = true; res.status(401).json({ ok: false }); });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    for (const endpoint of ['/api/payments/razorpay/order', '/api/payments/webhook-settle', '/api/bookings/atomic', '/api/auth/google/authenticate', '/api/notifications', '/api/billing/run-cycle']) {
      const response = await fetch(`${base}${endpoint}`, { method: 'POST' });
      assert.equal(response.status, 503, endpoint);
      assert.equal((await response.json()).error, 'LOCAL_DEMO_FLOW_UNAVAILABLE');
      assert.equal(handlerReached, false);
    }
    const status = await fetch(`${base}/api/local-demo/status`);
    assert.equal((await status.json()).paymentsEnabled, false);
    assert.match(status.headers.get('content-security-policy') || '', /frame-src 'none'/);
    assert.equal((await fetch(`${base}/api/admin/movies/access`)).status, 401);
    assert.equal(handlerReached, true);
    assert.equal((await fetch(`${base}/auth/callback`)).status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('demo database tools refuse the existing local stack and all hosted databases', () => {
  assert.throws(() => localDatabaseEnv('postgresql://postgres:postgres@localhost:54322/postgres'));
  assert.throws(() => localDatabaseEnv('postgresql://postgres:postgres@localhost:55422/another_app'));
  assert.throws(() => localDatabaseEnv('postgresql://postgres:postgres@example.com:55422/postgres'));
  assert.equal(localDatabaseEnv('postgresql://postgres:postgres@localhost:55422/postgres').PGPORT, '55422');
});

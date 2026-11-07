import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { apiNoStoreByDefault } from '../src/server/apiCachePrivacy.ts';

test('API responses default to no-store while explicitly public catalog routes can opt in', async () => {
  const app = express();
  app.use(apiNoStoreByDefault);
  app.get('/api/private', (_req, res) => res.json({ ok: true }));
  app.get('/api/public', (_req, res) => { res.setHeader('Cache-Control', 'public, max-age=30'); res.json({ ok: true }); });
  app.get('/page', (_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${origin}/api/private`)).headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(`${origin}/api/public`)).headers.get('cache-control'), 'public, max-age=30');
    assert.equal((await fetch(`${origin}/page`)).headers.get('cache-control'), null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

/**
 * The API boundary must never fall through to the single-page shell.
 *
 * Before this contract existed, any unmatched `/api/*` request (a typo, a
 * removed endpoint, or a wrong method on a real path) was answered by the Vite
 * dev middleware or the production `*` route with `200 text/html`, so a JSON
 * caller failed later in parsing and monitoring saw a healthy response. These
 * checks boot the real server, so they cover both the router order and the
 * fallbacks rather than matching source text.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

let server;
let baseUrl;
let tempDir;
let output = '';

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-api-boundary-'));
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: 'isolated-api-boundary-secret',
      BOS_TEST_AUTHORITATIVE_STORE_PATH: path.join(tempDir, 'isolated-store.json'),
      VITE_SUPABASE_URL: 'http://127.0.0.1:1',
      VITE_SUPABASE_PROJECT_ID: 'local',
      VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: 'local',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'your-supabase-publishable-or-anon-key',
      VITE_SUPABASE_ANON_KEY: 'your-supabase-publishable-or-anon-key',
      DISABLE_HMR: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Local test server did not start. ${output}`)), 30_000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes('Full-Stack Server running')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Local test server exited (${code}). ${output}`));
    });
  });
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('an unknown API path answers a JSON 404 instead of the page shell', async () => {
  const response = await fetch(`${baseUrl}/api/definitely-not-a-route`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'API_ROUTE_NOT_FOUND');
  assert.equal(JSON.stringify(body).includes('<html'), false);
});

test('a write to an unknown API path is also refused as JSON', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await fetch(`${baseUrl}/api/definitely-not-a-route`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'DELETE' ? undefined : '{}',
    });
    assert.equal(response.status, 404, `${method} must be a JSON 404`);
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    assert.equal((await response.json()).error, 'API_ROUTE_NOT_FOUND');
  }
});

test('a wrong method on a real API path is a JSON boundary error, not HTML', async () => {
  // /api/auth/logout only accepts POST.
  const response = await fetch(`${baseUrl}/api/auth/logout`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal((await response.json()).error, 'API_ROUTE_NOT_FOUND');
});

test('real API routes and the page shell are unaffected', async () => {
  const api = await fetch(`${baseUrl}/api/auth/config`);
  assert.equal(api.status, 200);
  assert.match(api.headers.get('content-type') || '', /application\/json/);
  assert.equal((await api.json()).ok, true);

  // The coupon route is mounted only when the server has a database; without
  // one the same path must still answer as a JSON boundary error. Either way
  // an unauthenticated write is refused by the API, never by the page shell.
  const guarded = await fetch(`${baseUrl}/api/coupons/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'HELPER10', durationId: '2', helpers: 1 }),
  });
  assert.match(guarded.headers.get('content-type') || '', /application\/json/);
  const guardedBody = await guarded.json();
  if (process.env.BOS_TEST_DATABASE_URL || process.env.BOS_LISTINGS_DATABASE_URL) {
    assert.equal(guarded.status, 401);
    assert.equal(guardedBody.error, 'UNAUTHORIZED_SESSION');
  } else {
    assert.equal(guarded.status, 404);
    assert.equal(guardedBody.error, 'API_ROUTE_NOT_FOUND');
  }

  // A deep link still renders the application.
  const page = await fetch(`${baseUrl}/venues`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') || '', /text\/html/);
  assert.match(await page.text(), /<!doctype html>/i);
});

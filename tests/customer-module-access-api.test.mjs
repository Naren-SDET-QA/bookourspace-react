/**
 * Server contract for customer module access endpoints.
 *
 * Runs against a database-free test server: the customer surface answers from
 * the local compatibility path and the admin surface fails closed (no
 * PostgreSQL admin authority). A hosted test would exercise the repository;
 * these assertions pin the HTTP contract and the fail-closed behaviour.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import { after, before, test } from 'node:test';

const SECRET = 'customer-module-access-contract-secret';
const CUSTOMER_UUID = '7a1f122e-2da8-4f87-949f-dbc461b9a101';
const ADMIN_UUID = '8b2f122e-2da8-4f87-949f-dbc461b9a202';

let server;
let baseUrl;

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

function signSession(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', `${SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

const customerToken = signSession({
  userId: CUSTOMER_UUID,
  supabaseUserId: CUSTOMER_UUID,
  email: 'customer@example.test',
  role: 'customer',
  authProvider: 'email',
  issuedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
});

const adminToken = signSession({
  userId: ADMIN_UUID,
  supabaseUserId: ADMIN_UUID,
  email: 'admin@example.test',
  role: 'admin',
  authProvider: 'google',
  issuedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
});

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 200) }; }
  return { status: response.status, body: parsed };
}

before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: SECRET,
      BOS_TEST_AUTHORITATIVE_STORE_PATH: `${process.cwd()}/.tmp-customer-module-access-store.json`,
      // Database-free contract: never let an ambient Postgres URL switch the
      // module-access store to the database compatibility reader.
      BOS_LISTINGS_DATABASE_URL: '',
      BOS_PG_URL: '',
      VITE_SUPABASE_URL: 'http://127.0.0.1:1',
      VITE_SUPABASE_PROJECT_ID: 'local',
      VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: 'local',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'your-supabase-publishable-or-anon-key',
      VITE_SUPABASE_ANON_KEY: 'your-supabase-publishable-or-anon-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. ${output}`)), 20_000);
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
      reject(new Error(`Server exited (${code}). ${output}`));
    });
  });
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
});

test('an unauthenticated customer modules request is refused', async () => {
  const response = await call('GET', '/api/customer/modules');
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'UNAUTHORIZED_SESSION');
});

test('a signed-in customer reads their module list from the compatibility path', async () => {
  const response = await call('GET', '/api/customer/modules', { token: customerToken });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.role, 'customer');
  assert.equal(response.body.source, 'compatibility');
  assert.ok(Array.isArray(response.body.modules));
});

test('a signed-in customer can verify a module without a database', async () => {
  const response = await call('POST', '/api/customer/modules/verify', {
    token: customerToken,
    body: { moduleKey: 'pg' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.allowed, true);
  assert.equal(response.body.source, 'compatibility');
});

test('an unknown module is refused before any grant check', async () => {
  const response = await call('POST', '/api/customer/modules/verify', {
    token: customerToken,
    body: { moduleKey: 'nonsense' },
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'UNKNOWN_MODULE');
});

test('a customer session cannot reach the admin customer access endpoints', async () => {
  const list = await call('GET', '/api/admin/customer-module-access', { token: customerToken });
  assert.equal(list.status, 403);
  assert.equal(list.body.error, 'FORBIDDEN_ADMIN_ONLY');

  const put = await call('PUT', '/api/admin/customer-module-access/some-uuid', {
    token: customerToken,
    body: { modules: [{ moduleKey: 'pg' }] },
  });
  assert.equal(put.status, 403);
});

test('an admin session without a database fails closed for grant management', async () => {
  const response = await call('GET', '/api/admin/customer-module-access', { token: adminToken });
  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'FORBIDDEN_ADMIN_ONLY');
});

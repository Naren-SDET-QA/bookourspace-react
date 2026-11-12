/**
 * Authorization contracts for endpoints that previously accepted anonymous
 * callers: billing records/cycles and the legacy cinema support desk.
 *
 * The suite boots a database-free server (the same isolated harness other
 * endpoint tests use) so the assertions pin the HTTP gate itself rather than a
 * hosted database role.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const SECRET = 'privileged-endpoint-contract-secret';
const CUSTOMER_UUID = '7a1f122e-2da8-4f87-949f-dbc461b9a301';
const CUSTOMER_EMAIL = 'cinema.customer@example.test';

let server;
let baseUrl;
let tempDir;

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
  email: CUSTOMER_EMAIL,
  name: 'Cinema Customer',
  role: 'customer',
  authProvider: 'email',
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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-privileged-endpoint-'));
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: SECRET,
      BOS_TEST_AUTHORITATIVE_STORE_PATH: path.join(tempDir, 'store.json'),
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

test('billing records are closed to anonymous and customer callers', async () => {
  const anonymous = await call('GET', '/api/billing/records');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'UNAUTHORIZED_SESSION');

  const customer = await call('GET', '/api/billing/records', { token: customerToken });
  assert.equal(customer.status, 403);
  assert.equal(customer.body.error, 'FORBIDDEN_ADMIN_ONLY');
});

test('running a billing cycle is closed to anonymous and customer callers', async () => {
  const anonymous = await call('POST', '/api/billing/run-cycle', {
    body: { cycleName: 'Unauthorized cycle', newRecords: [{ id: 'forged' }] },
  });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'UNAUTHORIZED_SESSION');

  const customer = await call('POST', '/api/billing/run-cycle', {
    token: customerToken,
    body: { cycleName: 'Customer cycle', newRecords: [{ id: 'forged' }] },
  });
  assert.equal(customer.status, 403);
  assert.equal(customer.body.error, 'FORBIDDEN_ADMIN_ONLY');
});

test('cinema support tickets require the ticket owner session and never trust body identity', async () => {
  const anonymous = await call('POST', '/api/movies/support', {
    body: { message: 'Anonymous ticket', customerName: 'Spoofed Name', customerPhone: '+91 99999 00000' },
  });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'UNAUTHORIZED_SESSION');

  const created = await call('POST', '/api/movies/support', {
    token: customerToken,
    body: { message: 'Cannot see my showtime', customerName: 'Spoofed Name', customerPhone: '+91 99999 00000' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.ticket.customerUserId, CUSTOMER_UUID);
  assert.equal(created.body.ticket.customerName, 'Cinema Customer');
  assert.equal(created.body.ticket.customerPhone, '');
});

test('resolving a support ticket is closed to anonymous and customer callers', async () => {
  const anonymous = await call('PATCH', '/api/movies/support/SUP-MOV-000001', {
    body: { status: 'resolved', resolutionNote: 'Anonymous resolution' },
  });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'UNAUTHORIZED_SESSION');

  const customer = await call('PATCH', '/api/movies/support/SUP-MOV-000001', {
    token: customerToken,
    body: { status: 'resolved', resolutionNote: 'Customer resolution' },
  });
  assert.equal(customer.status, 403);
  assert.equal(customer.body.error, 'FORBIDDEN_PROVIDER_OR_ADMIN_ONLY');
});

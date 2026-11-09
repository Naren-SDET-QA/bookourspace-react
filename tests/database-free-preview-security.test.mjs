import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

let child;
let baseUrl;
let tempDir;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-preview-security-'));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      BOS_LISTINGS_DATABASE_URL: '',
      BOS_PG_URL: '',
      BOS_ENABLE_LOCAL_JSON_COMPATIBILITY: '',
      BOS_SERVER_HMAC_SECRET: 'local-preview-security-test-secret',
      BOS_TEST_AUTHORITATIVE_STORE_PATH: path.join(tempDir, 'store.json'),
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PROJECT_ID: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_SUPABASE_ANON_KEY: '',
      DISABLE_HMR: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`preview server did not start: ${output}`)), 20_000);
    const onData = (chunk) => {
      output += String(chunk);
      if (output.includes('Full-Stack Server running')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`preview server exited (${code}): ${output}`));
    });
  });
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('database-free preview exposes liveness but not private or mutable JSON routes', async () => {
  const live = await fetch(`${baseUrl}/api/live`);
  assert.equal(live.status, 200);

  const readiness = await fetch(`${baseUrl}/api/health`);
  assert.equal(readiness.status, 503);
  assert.equal((await readiness.json()).error, 'DATABASE_UNAVAILABLE');

  const providerListings = await fetch(`${baseUrl}/api/provider/listings`);
  assert.equal(providerListings.status, 503);
  assert.equal((await providerListings.json()).error, 'DATABASE_REQUIRED_FOR_SERVER_ROUTE');

  const booking = await fetch(`${baseUrl}/api/bookings/atomic`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      listingId: 'forged-listing',
      scheduledDate: '2030-01-01',
      timeSlot: '10:00',
      idempotencyKey: 'forged-idempotency-key',
      totalAmount: 1,
    }),
  });
  assert.equal(booking.status, 503);
  assert.equal((await booking.json()).error, 'DATABASE_REQUIRED_FOR_SERVER_ROUTE');

  const payment = await fetch(`${baseUrl}/api/payments/create-intent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ listingId: 'forged-listing', amount: 1 }),
  });
  assert.equal(payment.status, 503);
  assert.equal((await payment.json()).error, 'DATABASE_REQUIRED_FOR_SERVER_ROUTE');
});

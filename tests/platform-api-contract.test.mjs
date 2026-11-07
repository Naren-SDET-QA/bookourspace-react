import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const TEST_SECRET = 'isolated-platform-test-secret';
let server;
let baseUrl;
let storeDir;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/auth/me`);
      if (response.status === 401) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('server did not become ready');
}

const seedStore = {
  seatLocks: {},
  bookings: [],
  enquiries: [],
  paymentIntents: {},
  usedUtrs: {},
  checkedInPasses: {},
  users: [],
  notifications: [],
  notificationCampaigns: [],
  providerListings: {
    'listing-active': {
      id: 'listing-active',
      title: 'Active Test Listing',
      categoryId: 'pg_hostels',
      subcategory: 'Co-living',
      price: 6500,
      providerId: 'prov-1',
      ownerUserId: 'USR-1001',
      providerName: 'Test Provider',
      providerPhone: '+91 99999 00000',
      status: 'active',
      updatedAt: '2026-11-01T00:00:00.000Z',
      payload: { phone: '+91 99999 00000', whatsapp: '+91 99999 00000', area: 'Madhapur' },
    },
    'listing-pending': {
      id: 'listing-pending',
      title: 'Pending Test Listing',
      categoryId: 'classes',
      subcategory: 'Coaching',
      price: 3500,
      providerId: 'prov-2',
      ownerUserId: 'USR-1002',
      providerName: 'Pending Provider',
      providerPhone: '+91 88888 00000',
      status: 'pending_approval',
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
  },
  adminModules: {},
  revokedTokens: {},
};

before(async () => {
  storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bos-platform-api-'));
  const storePath = path.join(storeDir, 'store.json');
  await fs.writeFile(storePath, JSON.stringify(seedStore), 'utf8');
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn('npx', ['tsx', 'server.ts'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      BOS_SERVER_HMAC_SECRET: TEST_SECRET,
      PORT: String(port),
      BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
      // Do not let a developer .env database URL replace this disposable JSON
      // fixture or make this unit contract test read a hosted project.
      BOS_LISTINGS_DATABASE_URL: '',
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
      BOS_ADMIN_PASSCODE: '',
    },
    stdio: 'ignore',
  });
  await waitForServer(baseUrl);
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
  if (storeDir) await fs.rm(storeDir, { recursive: true, force: true });
});

test('marketplace listings are public, active-only and contact-free', async () => {
  const response = await fetch(`${baseUrl}/api/marketplace/listings`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.listings));
  assert.equal(data.listings.length, 1);
  assert.equal(data.listings[0].id, 'listing-active');
  assert.equal(data.listings[0].status, 'active');

  const serialized = JSON.stringify(data);
  assert.ok(!/providerPhone|whatsapp|ownerUserId/i.test(serialized), 'contact fields must not be exposed');
  assert.ok(!serialized.includes('99999'), 'phone numbers must not leak through payload');
});

test('marketplace categories summarise active listings only', async () => {
  const response = await fetch(`${baseUrl}/api/marketplace/categories`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.deepEqual(data.categories.map((entry) => entry.id), ['pg_hostels']);
  assert.equal(data.categories[0].count, 1);
});

test('cancellation quote requires a verified session', async () => {
  const response = await fetch(`${baseUrl}/api/bookings/cancellation-quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'bk-1' }),
  });
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.ok, false);
});

test('manual refund reconciliation requires admin authorization', async () => {
  const response = await fetch(`${baseUrl}/api/refunds/rf-1/reconcile-manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'bank statement verified' }),
  });
  assert.equal(response.status, 401);
});

test('super admin overview is not readable without a session', async () => {
  const response = await fetch(`${baseUrl}/api/super-admin/overview`);
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.ok, false);
});

test('the removed hardcoded super admin passcode cannot mint a session', async () => {
  const response = await fetch(`${baseUrl}/api/auth/super-admin/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      adminPasscode: 'bos-admin-2026-verified',
      email: 'monapatisravya28@gmail.com',
      name: 'BookOurSpace Super Admin',
    }),
  });
  assert.equal(response.status, 403);
  const data = await response.json();
  assert.equal(data.sessionToken, undefined);
});

function signedSession(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', `${TEST_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

test('an Admin cannot promote a user by supplying isSuperAdmin in the request body', async () => {
  const token = signedSession({ userId: 'admin-actor', role: 'admin', issuedAt: Date.now(), expiresAt: Date.now() + 60_000 });
  const response = await fetch(`${baseUrl}/api/super-admin/users/action`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'target-user', action: 'promote', role: 'admin', isSuperAdmin: true, reason: 'approved by owner' }),
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'SUPER_ADMIN_SCOPE_REQUIRED');
});

test('a signed Super Admin scope still fails closed when authoritative Supabase management is unavailable', async () => {
  const token = signedSession({ userId: 'admin-actor', role: 'admin', scope: 'super_admin', issuedAt: Date.now(), expiresAt: Date.now() + 60_000 });
  const response = await fetch(`${baseUrl}/api/super-admin/users/action`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'USR-1004', action: 'promote', role: 'admin', reason: 'approved by owner' }),
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'SUPER_ADMIN_DATABASE_AUTHORITY_REQUIRED');
});

test('SMS is refused while no provider is configured', async () => {
  const response = await fetch(`${baseUrl}/api/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: '+919999900000', message: 'test' }),
  });
  assert.equal(response.status, 401);
});

test('razorpay order creation fails closed without credentials', async () => {
  const response = await fetch(`${baseUrl}/api/payments/razorpay/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 100 }),
  });
  assert.equal(response.status, 401);
});

test('payment webhooks are refused when unconfigured or unsigned', async () => {
  const generic = await fetch(`${baseUrl}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'payment.captured' }),
  });
  assert.equal(generic.status, 503);
  const genericData = await generic.json();
  assert.equal(genericData.ok, false);
  assert.equal(genericData.error, 'PAYMENT_WEBHOOK_NOT_CONFIGURED');

  const razorpay = await fetch(`${baseUrl}/api/payments/razorpay/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'payment.captured' }),
  });
  assert.equal(razorpay.status, 503);
  const razorpayData = await razorpay.json();
  assert.equal(razorpayData.error, 'RAZORPAY_WEBHOOK_NOT_CONFIGURED');
});

test('super admin database rollback is never silently executed', async () => {
  const response = await fetch(`${baseUrl}/api/super-admin/database/rollback-snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'disaster recovery drill' }),
  });
  assert.equal(response.status, 401);
});

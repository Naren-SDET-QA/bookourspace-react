import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

/**
 * Movies V1 privacy regression suite.
 *
 * Proves that the public inventory response never carries booking records or
 * customer data, that a customer can only read their own tickets, and that
 * booking records require a server-verified Admin session. Every role,
 * forged header and invalid session is exercised against a real server with a
 * disposable authoritative store.
 */

const SECRET = 'movies-privacy-test-secret';
const ADMIN = 'admin-user';
const CUSTOMER_A = 'customer-a';
const CUSTOMER_B = 'customer-b';
const PROVIDER = 'provider-user';
const EXPIRED_TOKEN_EMAIL = 'customer-a@test.local';

let server;
let baseUrl;
let tempDir;
let storePath;

function iso() {
  return new Date('2026-11-04T00:00:00.000Z').toISOString();
}

function user(id, email, role) {
  return {
    id,
    supabaseUserId: id,
    name: `${role} ${id}`,
    email,
    phone: '9000000000',
    role,
    ...(role === 'provider' ? { providerId: `provider-${id}` } : {}),
    googleSub: `google-${id}`,
    authProvider: 'google',
    verified: true,
    kycDocument: '',
    accountStatus: 'active',
    city: 'Hyderabad',
    joinedAt: iso(),
    lastLoginAt: iso(),
    listingsCount: 0,
    bookingsCount: 0,
    totalSpentOrEarned: 0,
    permissions: [],
    publishState: 'published',
  };
}

function movieBooking(id, customerUserId, passCode, phone) {
  return {
    id,
    idempotencyKey: `idem-${id}`,
    listingId: 'movie-hyd-1',
    listingTitle: 'Privacy Test Movie',
    providerId: 'cinema-1',
    customerUserId,
    customerName: `Name of ${customerUserId}`,
    customerPhone: phone,
    customerAddress: `Address of ${customerUserId}`,
    scheduledDate: '2026-12-01',
    timeSlot: '07:55 PM',
    showtime: '07:55 PM',
    seats: ['D5', 'D6'],
    screenId: 'scr-1',
    screenName: 'Screen 1',
    foodAddons: [],
    baseAmount: 400,
    taxAmount: 40,
    totalAmount: 440,
    paymentMode: 'pay_qr',
    paymentStatus: 'verified',
    status: 'confirmed',
    passCode,
    qrSignature: `SIG-${passCode}`,
    qrPassToken: `${passCode}.SIG-${passCode}`,
    createdAt: iso(),
  };
}

function writeStore() {
  const store = {
    seatLocks: {},
    bookings: [
      movieBooking('movie-a', CUSTOMER_A, 'PASS-A', 'SECRET-PHONE-A'),
      movieBooking('movie-b', CUSTOMER_B, 'PASS-B', 'SECRET-PHONE-B'),
      {
        id: 'pg-booking',
        idempotencyKey: 'pg-idem',
        listingId: 'pg-listing-1',
        listingTitle: 'Not a movie',
        providerId: 'provider-user',
        customerUserId: CUSTOMER_A,
        customerName: 'Customer A',
        customerPhone: 'SECRET-PHONE-A',
        customerAddress: 'Hyderabad',
        scheduledDate: '2026-12-02',
        timeSlot: '10:00 AM',
        totalAmount: 8000,
        status: 'confirmed',
        passCode: 'PG-PASS',
        qrSignature: 'x',
        qrPassToken: 'x',
        createdAt: iso(),
      },
    ],
    enquiries: [],
    paymentIntents: {},
    usedUtrs: {},
    usedRazorpayPaymentIds: {},
    razorpayWebhookEvents: {},
    checkedInPasses: {},
    users: [
      user(ADMIN, 'admin@test.local', 'admin'),
      user(CUSTOMER_A, EXPIRED_TOKEN_EMAIL, 'customer'),
      user(CUSTOMER_B, 'customer-b@test.local', 'customer'),
      user(PROVIDER, 'provider@test.local', 'provider'),
    ],
    notifications: [],
    notificationCampaigns: [],
    providerListings: {},
    adminModules: {
      movies_cinema_engine: {
        screens: [],
        promos: [],
        refunds: [{ id: 'ref-1', note: 'SECRET-REFUND', amount: 100 }],
        supportTickets: [
          { ticketId: 'sup-1', description: 'SECRET-SUPPORT', customerPhone: 'SECRET-PHONE-A' },
        ],
        auditLogs: [{ id: 'aud-1', details: 'SECRET-AUDIT' }],
      },
    },
    revokedTokens: {},
  };
  fs.writeFileSync(storePath, JSON.stringify(store));
}

function signToken(claims, secret = SECRET) {
  const payload = Buffer.from(
    JSON.stringify({ authProvider: 'google', issuedAt: Date.now(), expiresAt: Date.now() + 60_000, ...claims })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', `${secret}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

const tokens = {
  admin: () => signToken({ userId: ADMIN, email: 'admin@test.local', role: 'admin' }),
  customerA: () => signToken({ userId: CUSTOMER_A, email: EXPIRED_TOKEN_EMAIL, role: 'customer' }),
  customerB: () => signToken({ userId: CUSTOMER_B, email: 'customer-b@test.local', role: 'customer' }),
  provider: () => signToken({ userId: PROVIDER, email: 'provider@test.local', role: 'provider' }),
  forgedAdmin: () => signToken({ userId: CUSTOMER_A, email: EXPIRED_TOKEN_EMAIL, role: 'admin' }),
  expired: () => signToken({ userId: CUSTOMER_A, email: EXPIRED_TOKEN_EMAIL, role: 'customer', expiresAt: Date.now() - 60_000 }),
  wrongSignature: () => signToken({ userId: ADMIN, email: 'admin@test.local', role: 'admin' }, 'attacker-secret'),
};

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function get(pathname, { token, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { connection: 'close', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-movies-privacy-'));
  storePath = path.join(tempDir, 'store.json');
  writeStore();
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: SECRET,
      BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
      // Database-free contract: the public inventory must come from the seeded
      // local store, not from an ambient Postgres cinema schema.
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
    const timeout = setTimeout(() => reject(new Error(`Local test server did not start. ${output}`)), 20_000);
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

test('anonymous inventory exposes discovery data but no booking records or customer data', async () => {
  const { status, body } = await get('/api/movies/inventory');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.screens) && body.screens.length > 0, 'public screens still present');
  assert.ok(Array.isArray(body.offers), 'public offers still present');
  for (const key of ['bookings', 'refunds', 'supportTickets', 'auditLogs']) {
    assert.equal(body[key], undefined, `${key} must not be in the public inventory response`);
  }
  const raw = JSON.stringify(body);
  for (const secret of ['SECRET-PHONE-A', 'SECRET-PHONE-B', 'SECRET-REFUND', 'SECRET-SUPPORT', 'SECRET-AUDIT', 'PASS-A', 'PASS-B', 'PG-PASS']) {
    assert.equal(raw.includes(secret), false, `public inventory leaked ${secret}`);
  }
});

test('authenticated inventory carries no bookings for any role', async () => {
  for (const role of ['admin', 'customerA', 'provider']) {
    const { status, body } = await get('/api/movies/inventory', { token: tokens[role]() });
    assert.equal(status, 200);
    assert.equal(body.bookings, undefined, `${role} inventory must not embed bookings`);
  }
});

test('query parameters and forged role headers cannot add booking records', async () => {
  const forged = await get('/api/movies/inventory?includeBookings=1&role=admin&userId=customer-b', {
    headers: { 'x-user-role': 'admin', 'x-bos-role': 'admin', 'x-user-id': CUSTOMER_B },
  });
  assert.equal(forged.status, 200);
  assert.equal(forged.body.bookings, undefined);
  assert.equal(JSON.stringify(forged.body).includes('PASS-B'), false);

  const customerForged = await get('/api/movies/my-bookings?customerUserId=customer-b&role=admin', {
    token: tokens.customerA(),
    headers: { 'x-user-role': 'admin' },
  });
  assert.equal(customerForged.status, 200);
  assert.deepEqual(customerForged.body.bookings.map((b) => b.passCode), ['PASS-A']);
});

test('customer reads only their own tickets, without contact data', async () => {
  const a = await get('/api/movies/my-bookings', { token: tokens.customerA() });
  assert.equal(a.status, 200);
  assert.deepEqual(a.body.bookings.map((b) => b.passCode), ['PASS-A']);
  assert.equal(JSON.stringify(a.body).includes('PASS-B'), false);
  assert.equal(JSON.stringify(a.body).includes('SECRET-PHONE-A'), false);
  assert.equal(a.body.bookings[0].customerPhone, undefined);

  const b = await get('/api/movies/my-bookings', { token: tokens.customerB() });
  assert.deepEqual(b.body.bookings.map((ticket) => ticket.passCode), ['PASS-B']);
  assert.equal(JSON.stringify(b.body).includes('PASS-A'), false);
});

test('anonymous, provider and invalid sessions cannot read customer booking history', async () => {
  assert.equal((await get('/api/movies/my-bookings')).status, 401);
  assert.equal((await get('/api/movies/my-bookings', { token: tokens.provider() })).status, 403);
  assert.equal((await get('/api/movies/my-bookings', { token: tokens.expired() })).status, 401);
  assert.equal((await get('/api/movies/my-bookings', { token: tokens.wrongSignature() })).status, 401);
  const tampered = tokens.customerA().replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
  assert.equal((await get('/api/movies/my-bookings', { token: tampered })).status, 401);
});

test('admin records require a server-verified admin session', async () => {
  const admin = await get('/api/admin/movies/records', { token: tokens.admin() });
  assert.equal(admin.status, 200);
  assert.deepEqual(admin.body.bookings.map((b) => b.passCode).sort(), ['PASS-A', 'PASS-B']);
  assert.ok(admin.body.refunds.length >= 1);
  assert.equal(JSON.stringify(admin.body).includes('SECRET-SUPPORT'), true, 'authorized admin sees support records');

  assert.equal((await get('/api/admin/movies/records')).status, 401);
  assert.equal((await get('/api/admin/movies/records', { token: tokens.customerA() })).status, 403);
  assert.equal((await get('/api/admin/movies/records', { token: tokens.provider() })).status, 403);
  assert.equal((await get('/api/admin/movies/records', { token: tokens.forgedAdmin() })).status, 403);
  assert.equal((await get('/api/admin/movies/records', { token: tokens.wrongSignature() })).status, 401);
});

test('Movies V1 booking, seat, ticket and cancellation endpoints stay disabled', async () => {
  const cases = [
    ['POST', '/api/movies/bookings/movie-a/cancel'],
    ['POST', '/api/movies/bookings/movie-a/resend'],
    ['GET', '/api/movies/bookings/movie-a/ticket.pdf'],
    ['POST', '/api/seats/lock'],
  ];
  for (const [method, pathname] of cases) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: { 'content-type': 'application/json', connection: 'close', authorization: `Bearer ${tokens.admin()}` },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    const body = await response.json().catch(() => null);
    assert.equal(response.status, 410, `${method} ${pathname} must stay display-only`);
    assert.equal(body.error, 'MOVIES_V1_DISPLAY_ONLY');
  }
});

test('revoked sessions and users suspended or demoted in authoritative state lose access', async () => {
  let store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const revoked = tokens.customerA();
  store.revokedTokens[revoked.split('.')[1]] = { revokedAt: new Date().toISOString() };
  fs.writeFileSync(storePath, JSON.stringify(store));
  assert.equal((await get('/api/auth/me', { token: revoked })).status, 401);

  store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  store.users.find((entry) => entry.id === CUSTOMER_A).accountStatus = 'suspended';
  fs.writeFileSync(storePath, JSON.stringify(store));
  assert.equal((await get('/api/auth/me', { token: tokens.customerA() })).status, 403);

  store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  store.users.find((entry) => entry.id === ADMIN).role = 'customer';
  fs.writeFileSync(storePath, JSON.stringify(store));
  assert.equal((await get('/api/admin/movies/records', { token: tokens.admin() })).status, 403);
});

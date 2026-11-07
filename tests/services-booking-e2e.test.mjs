import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import net from 'node:net';
import { after, before, test } from 'node:test';
import pg from 'pg';

/**
 * Services booking lifecycle E2E against a live server + disposable PostgreSQL.
 *
 * Covers: create (idempotent), ownership isolation, provider accept → start →
 * complete, customer cancel, provider reject, reschedule, UPI payment claim
 * with trusted evidence, and admin payment-claim review.
 */

const { Pool } = pg;
const connectionString = process.env.BOS_LISTINGS_DATABASE_URL;
const TEST_HMAC_SECRET = 'bos-local-postgres-services-test-secret';
const provider = 'a1b2c3d4-1111-4222-8333-444455556666';
const customer = 'a1b2c3d4-2222-4333-8444-555566667777';
const otherCustomer = 'a1b2c3d4-3333-4444-8555-666677778888';
const admin = 'a1b2c3d4-4444-4555-8666-777788889999';
const listingId = 'svc-e2e-listing-1';

let pool;
let child;
let serverUrl;
let databaseAvailable;

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

function sessionToken({ authId, role, userId, email }) {
  const payload = Buffer.from(JSON.stringify({
    userId, supabaseUserId: authId, email, name: `${role} services test`, phone: '+91 90000 00000',
    role, authProvider: 'google', issuedAt: Date.now(), expiresAt: Date.now() + 10 * 60_000,
  })).toString('base64url');
  const signature = createHmac('sha256', `${TEST_HMAC_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

const customerToken = sessionToken({ authId: customer, role: 'customer', userId: 'USR-SVC-C', email: 'svc-customer@example.test' });
const otherToken = sessionToken({ authId: otherCustomer, role: 'customer', userId: 'USR-SVC-C2', email: 'svc-other@example.test' });
const providerToken = sessionToken({ authId: provider, role: 'provider', userId: 'USR-SVC-P', email: 'svc-provider@example.test' });
const adminToken = sessionToken({ authId: admin, role: 'admin', userId: 'USR-SVC-A', email: 'svc-admin@example.test' });

function stripHelperFields(body) {
  if (!body || typeof body !== 'object') return body;
  const { _slotSeq, ...rest } = body;
  return rest;
}

async function request(method, url, token, body) {
  const response = await fetch(`${serverUrl}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(stripHelperFields(body)) } : {}),
  });
  return { status: response.status, data: await response.json() };
}

async function startServer() {
  const port = await freePort();
  serverUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: TEST_HMAC_SECRET,
      BOS_LISTINGS_DATABASE_URL: connectionString,
      BOS_SERVICES_UPI_VPA: 'bookourspace@okhdfcbank',
      RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', RAZORPAY_WEBHOOK_SECRET: '',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`test server exited (${child.exitCode})`);
    try {
      const response = await fetch(`${serverUrl}/api/auth/me`);
      if (response.status === 401) return;
    } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('test server did not become ready');
}

async function seed() {
  for (const [id, email, name, role] of [
    [provider, 'svc-provider@example.test', 'Svc Provider', 'provider'],
    [customer, 'svc-customer@example.test', 'Svc Customer', 'customer'],
    [otherCustomer, 'svc-other@example.test', 'Svc Other', 'customer'],
    [admin, 'svc-admin@example.test', 'Svc Admin', 'admin'],
  ]) {
    await pool.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, $2, jsonb_build_object('full_name', $3::text))
       on conflict (id) do nothing`, [id, email, name],
    );
    await pool.query(
      `insert into public.profiles (id, role, account_status, full_name, email)
       values ($1, $2, 'active', $3, $4)
       on conflict (id) do update set role = excluded.role, account_status = 'active'`,
      [id, role, name, email],
    );
  }
  await pool.query('delete from public.service_bookings where provider_id = $1', [provider]);
  await pool.query(
    `insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
     values ($1, $2, 'E2E AC Repair Service', 'services', 'AC Repair', 'service', 1500, 'per visit', 'active', '{}'::jsonb)
     on conflict (id) do update set status = 'active'`,
    [listingId, provider],
  );
}

function futureDate(days = 7) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

let slotCounter = 0;

function bookingPayload(overrides = {}) {
  slotCounter += 1;
  return {
    idempotencyKey: randomUUID(),
    listingId,
    scheduledDate: futureDate(7 + slotCounter),
    timeSlot: `${String(8 + (slotCounter % 12)).padStart(2, '0')}:${String(slotCounter % 60).padStart(2, '0')}`,
    _slotSeq: slotCounter,
    serviceAddress: 'Flat 402, Madhapur, Hyderabad',
    customerPhone: '+91 90000 00000',
    paymentMode: 'pay_after_service',
    notes: 'AC not cooling',
    ...overrides,
  };
}

before(async () => {
  databaseAvailable = Boolean(connectionString);
  if (!databaseAvailable) return;
  pool = new Pool({ connectionString });
  await seed();
  await startServer();
});

after(async () => {
  if (!databaseAvailable) return;
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  await pool?.end();
});

const dbTest = (name, fn) => test(name, { skip: !databaseAvailable }, fn);

dbTest('public payment config exposes pay-after-service and UPI capability without secrets', async () => {
  const config = await request('GET', '/api/services/payment-config', null);
  assert.equal(config.status, 200);
  assert.equal(config.data.payAfterService, true);
  assert.equal(config.data.upi.enabled, true);
  assert.equal(config.data.upi.vpa, 'bookourspace@okhdfcbank');
  assert.equal(JSON.stringify(config.data).includes('secret'), false);
});

dbTest('customer creates a pay-after-service booking idempotently', async () => {
  const payload = bookingPayload();
  const created = await request('POST', '/api/services/bookings', customerToken, payload);
  assert.equal(created.status, 201);
  assert.equal(created.data.booking.status, 'requested');
  assert.equal(created.data.booking.paymentStatus, 'due');
  assert.equal(created.data.booking.paymentMode, 'pay_after_service');
  assert.ok(created.data.booking.id);

  const replay = await request('POST', '/api/services/bookings', customerToken, payload);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.booking.id, created.data.booking.id);
  assert.equal(replay.data.idempotent, true);

  const conflict = await request('POST', '/api/services/bookings', customerToken, { ...payload, timeSlot: '02:00 PM' });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.error, 'IDEMPOTENCY_KEY_CONFLICT');
});

dbTest('unauthenticated and non-owner access is rejected', async () => {
  const anonymous = await request('POST', '/api/services/bookings', null, bookingPayload());
  assert.equal(anonymous.status, 401);

  const created = await request('POST', '/api/services/bookings', customerToken, bookingPayload());
  assert.equal(created.status, 201);
  const bookingId = created.data.booking.id;

  const foreignList = await request('GET', '/api/services/bookings', otherToken);
  assert.equal(foreignList.status, 200);
  assert.ok(!foreignList.data.bookings.some((booking) => booking.id === bookingId));

  const foreignAction = await request('POST', `/api/services/bookings/${bookingId}/actions`, otherToken, { action: 'accept' });
  // RLS hides the foreign row, so the API answers 404 (no existence disclosure);
  // a 403 is equally acceptable when the row is visible to the caller.
  assert.ok([403, 404].includes(foreignAction.status), `unexpected ${foreignAction.status}`);
  assert.ok(['BOOKING_FORBIDDEN', 'BOOKING_NOT_FOUND'].includes(foreignAction.data.error));
});

dbTest('provider accept → start → complete, then customer cannot cancel, payment claim recorded', async () => {
  const created = await request('POST', '/api/services/bookings', customerToken, bookingPayload());
  assert.equal(created.status, 201);
  const bookingId = created.data.booking.id;

  const accept = await request('POST', `/api/services/bookings/${bookingId}/actions`, providerToken, { action: 'accept' });
  assert.equal(accept.status, 200);
  assert.equal(accept.data.booking.status, 'accepted');

  const start = await request('POST', `/api/services/bookings/${bookingId}/actions`, providerToken, { action: 'start' });
  assert.equal(start.status, 200);
  assert.equal(start.data.booking.status, 'in_progress');

  const complete = await request('POST', `/api/services/bookings/${bookingId}/actions`, providerToken, { action: 'complete' });
  assert.equal(complete.status, 200);
  assert.equal(complete.data.booking.status, 'completed');

  const cancelAfterComplete = await request('POST', `/api/services/bookings/${bookingId}/actions`, customerToken, { action: 'cancel', reason: 'changed my mind' });
  assert.equal(cancelAfterComplete.status, 409);

  const claim = await request('POST', `/api/services/bookings/${bookingId}/payment-claim`, providerToken, {
    method: 'upi', reference: 'UTR1234567890', evidenceNote: 'UPI transfer received in provider account',
  });
  assert.equal(claim.status, 201);
  assert.equal(claim.data.claim.method, 'upi');
  assert.equal(claim.data.claim.status, 'pending');

  const claims = await request('GET', '/api/services/payment-claims', adminToken);
  assert.equal(claims.status, 200);
  assert.ok(claims.data.claims.some((entry) => entry.bookingId === bookingId));
});

dbTest('customer cancels a requested booking and provider rejects another', async () => {
  const cancelled = await request('POST', '/api/services/bookings', customerToken, bookingPayload());
  const cancel = await request('POST', `/api/services/bookings/${cancelled.data.booking.id}/actions`, customerToken, { action: 'cancel', reason: 'no longer needed' });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.data.booking.status, 'cancelled');
  assert.equal(cancel.data.booking.cancellationReason, 'no longer needed');

  const rejected = await request('POST', '/api/services/bookings', customerToken, bookingPayload());
  const reject = await request('POST', `/api/services/bookings/${rejected.data.booking.id}/actions`, providerToken, { action: 'reject', reason: 'fully booked that day' });
  assert.equal(reject.status, 200);
  assert.equal(reject.data.booking.status, 'rejected');

  const fresh = await request('POST', '/api/services/bookings', customerToken, bookingPayload());
  assert.equal(fresh.status, 201);
  const reasonRequired = await request('POST', `/api/services/bookings/${fresh.data.booking.id}/actions`, providerToken, { action: 'reject' });
  assert.equal(reasonRequired.status, 400);
  assert.equal(reasonRequired.data.error, 'CANCELLATION_REASON_REQUIRED');
});

dbTest('provider reschedules a live booking', async () => {
  const created = await request('POST', '/api/services/bookings', customerToken, bookingPayload());
  const bookingId = created.data.booking.id;
  await request('POST', `/api/services/bookings/${bookingId}/actions`, providerToken, { action: 'accept' });
  const reschedule = await request('POST', `/api/services/bookings/${bookingId}/actions`, providerToken, {
    action: 'reschedule', scheduledDate: futureDate(9), timeSlot: '04:00 PM',
  });
  assert.equal(reschedule.status, 200);
  assert.equal(reschedule.data.booking.timeSlot, '04:00 PM');
  assert.equal(String(reschedule.data.booking.scheduledDate).slice(0, 10), futureDate(9));
});

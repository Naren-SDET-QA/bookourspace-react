import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const TEST_SECRET = 'isolated-payment-test-secret-only';
let server;
let baseUrl;
let tempDir;
let storePath;

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

function signSession(userId = 'customer-1', role = 'customer', providerId) {
  const claims = {
    userId,
    role,
    ...(providerId ? { providerId } : {}),
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', `${TEST_SECRET}:SESSION_TOKEN_V2`)
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
}

function verificationToken(intentId, utr, amount) {
  const payload = `${intentId}|${utr}|VERIFIED|${Number(amount).toFixed(2)}`;
  return crypto.createHmac('sha256', `${TEST_SECRET}:PAYMENT_VERIFIED_TOKEN`).update(payload).digest('hex');
}

function intentRecord({
  intentId = 'intent-1',
  ownerUserId = 'customer-1',
  listingId = 'listing-1',
  amount = 100,
  purpose = 'booking',
  status = 'verified',
  consumedByBookingId,
  utrNumber = '123456789012',
} = {}) {
  return {
    intentId,
    ownerUserId,
    amount,
    currency: 'INR',
    purpose,
    listingId,
    merchantVpa: 'merchant@example',
    planOrListing: 'Test listing',
    status,
    utrNumber,
    settlementSource: 'trusted_provider_webhook',
    providerPaymentId: 'provider-payment-fixture',
    settledAt: '2026-01-01T00:00:00.000Z',
    paymentVerificationToken: verificationToken(intentId, utrNumber, amount),
    consumedByBookingId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function writeStore({ paymentIntents = {}, usedUtrs = {}, bookings = [], seatLocks = {} } = {}) {
  fs.writeFileSync(storePath, JSON.stringify({ paymentIntents, usedUtrs, bookings, seatLocks }), 'utf8');
}

function readStore() {
  return JSON.parse(fs.readFileSync(storePath, 'utf8'));
}

async function post(route, body, { token = signSession(), headers = {} } = {}) {
  return fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function bookingPayload(overrides = {}) {
  return {
    idempotencyKey: `test-${crypto.randomUUID()}`,
    listingId: 'listing-1',
    listingTitle: 'Test listing',
    providerId: 'provider-1',
    customerUserId: 'attacker-controlled-user-id',
    customerName: 'Test Customer',
    customerPhone: '9000000000',
    customerAddress: 'Hyderabad',
    scheduledDate: '2099-01-10',
    timeSlot: '10:00 AM',
    totalAmount: 100,
    ...overrides,
  };
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-payment-safety-'));
  storePath = path.join(tempDir, 'isolated-store.json');
  writeStore();

  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: TEST_SECRET,
      BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
      BOS_UPI_MERCHANT_VPA: '',
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
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

test('provider-unavailable endpoints fail closed and reject unauthenticated intent creation', async () => {
  writeStore();
  const noAuth = await post('/api/payments/create-intent', { amount: 100 }, { token: '' });
  assert.equal(noAuth.status, 401);

  const response = await post('/api/payments/create-intent', {
    amount: 100,
    currency: 'INR',
    purpose: 'booking',
    listingId: 'listing-1',
    userId: 'forged-user',
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
  assert.match(body.message, /Do not send payment/i);
  assert.deepEqual(readStore().paymentIntents, {});
});

test('a submitted UTR and client signature remain pending when the provider is unavailable', async () => {
  writeStore({ paymentIntents: { 'intent-pending': intentRecord({ status: 'created' }) } });
  const response = await post('/api/payments/verify-upi', {
    intentId: 'intent-pending',
    utrNumber: '555555555555',
    gatewaySignature: 'client-forged-signature',
    amount: 100,
    merchantVpa: 'attacker@example',
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.verified, false);
  assert.equal(body.status, 'pending_provider_reconciliation');
  assert.equal(body.error, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
  const stored = readStore();
  assert.equal(stored.paymentIntents['intent-pending'].status, 'pending_provider_reconciliation');
  assert.equal(stored.usedUtrs['555555555555'].status, 'pending_provider_reconciliation');
});

test('invalid UTRs and another customer cannot update a payment intent', async () => {
  const intent = intentRecord({ status: 'created' });
  writeStore({ paymentIntents: { [intent.intentId]: intent } });

  const invalid = await post('/api/payments/verify-upi', {
    intentId: intent.intentId,
    utrNumber: 'bad',
  });
  assert.equal(invalid.status, 400);

  const wrongOwner = await post('/api/payments/verify-upi', {
    intentId: intent.intentId,
    utrNumber: '555555555555',
  }, { token: signSession('different-customer') });
  assert.equal(wrongOwner.status, 403);
  assert.equal(readStore().paymentIntents[intent.intentId].status, 'created');
});

test('concurrent same-intent UTR retries remain pending and never settle', async () => {
  const intent = intentRecord({ status: 'created' });
  writeStore({ paymentIntents: { [intent.intentId]: intent } });
  const payload = { intentId: intent.intentId, utrNumber: '666666666666' };
  const responses = await Promise.all([post('/api/payments/verify-upi', payload), post('/api/payments/verify-upi', payload)]);
  assert.deepEqual(responses.map((response) => response.status), [503, 503]);
  const stored = readStore();
  assert.equal(stored.paymentIntents[intent.intentId].status, 'pending_provider_reconciliation');
  assert.equal(stored.usedUtrs[payload.utrNumber].status, 'pending_provider_reconciliation');
});

test('verified UTR retries are immutable and another intent cannot claim the same UTR', async () => {
  const verified = intentRecord();
  writeStore({
    paymentIntents: { [verified.intentId]: verified },
    usedUtrs: { [verified.utrNumber]: { intentId: verified.intentId, status: 'verified', recordedAt: verified.settledAt } },
  });

  const retry = await post('/api/payments/verify-upi', {
    intentId: verified.intentId,
    utrNumber: verified.utrNumber,
  });
  assert.equal(retry.status, 503);
  assert.equal((await retry.json()).verified, false);
  assert.equal(readStore().paymentIntents[verified.intentId].status, 'verified');

  const changedUtr = await post('/api/payments/verify-upi', {
    intentId: verified.intentId,
    utrNumber: '222222222222',
  });
  assert.equal(changedUtr.status, 409);
  assert.equal(readStore().paymentIntents[verified.intentId].utrNumber, verified.utrNumber);

  const second = intentRecord({ intentId: 'another-intent', status: 'created' });
  writeStore({
    paymentIntents: { [verified.intentId]: verified, [second.intentId]: second },
    usedUtrs: { [verified.utrNumber]: { intentId: verified.intentId, status: 'verified', recordedAt: verified.settledAt } },
  });
  const duplicate = await post('/api/payments/verify-upi', {
    intentId: second.intentId,
    utrNumber: verified.utrNumber,
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, 'DUPLICATE_UTR_REPLAY');
  assert.equal(readStore().paymentIntents[verified.intentId].status, 'verified');
});

test('missing or falsified client payment flags cannot bypass server payment policy', async () => {
  for (const flag of [undefined, false, true]) {
    writeStore();
    const response = await post('/api/bookings/atomic', bookingPayload({
      paymentMode: 'pay_qr',
      paymentIntentId: 'not-verified',
      paymentUtr: '123456789012',
      ...(flag === undefined ? {} : { requireVerifiedPayment: flag }),
    }));
    assert.equal(response.status, 402);
    const body = await response.json();
    assert.equal(body.error, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
    assert.equal(readStore().bookings.length, 0);
  }
});

test('verified intents are bound to listing, amount, purpose, owner, and single use', async () => {
  const cases = [
    { name: 'listing', intent: intentRecord(), booking: { listingId: 'other-listing' }, user: 'customer-1' },
    { name: 'amount', intent: intentRecord(), booking: { totalAmount: 101 }, user: 'customer-1' },
    { name: 'purpose', intent: intentRecord({ purpose: 'subscription' }), booking: {}, user: 'customer-1' },
    { name: 'owner', intent: intentRecord(), booking: {}, user: 'different-customer' },
    { name: 'single use', intent: intentRecord({ consumedByBookingId: 'prior-booking' }), booking: {}, user: 'customer-1', expectedStatus: 409, expectedError: 'PAYMENT_INTENT_ALREADY_CONSUMED' },
  ];

  for (const entry of cases) {
    const intent = entry.intent;
    writeStore({
      paymentIntents: { [intent.intentId]: intent },
      usedUtrs: { [intent.utrNumber]: { intentId: intent.intentId, status: 'verified', recordedAt: intent.settledAt } },
    });
    const response = await post('/api/bookings/atomic', bookingPayload({
      ...entry.booking,
      paymentMode: 'pay_qr',
      paymentIntentId: intent.intentId,
      paymentUtr: intent.utrNumber,
      paymentVerificationToken: intent.paymentVerificationToken,
      requireVerifiedPayment: false,
    }), { token: signSession(entry.user) });
    assert.equal(response.status, entry.expectedStatus || 402, `${entry.name} mismatch should be rejected`);
    assert.equal((await response.json()).error, entry.expectedError || 'PAYMENT_INTENT_BINDING_MISMATCH');
    assert.equal(readStore().bookings.length, 0);
  }
});

test('Movies V1 rejects both paid and pay-later movie checkout attempts', async () => {
  writeStore();
  const offlineAttempt = await post('/api/bookings/atomic', bookingPayload({
    listingId: 'movie-hyd-1',
    paymentMode: 'pay_later',
    seats: ['D5'],
    showtime: '07:55 PM',
  }));
  assert.equal(offlineAttempt.status, 410);
  assert.equal((await offlineAttempt.json()).error, 'MOVIES_V1_DISPLAY_ONLY');
  assert.equal(readStore().bookings.length, 0);

  const unpaidAttempt = await post('/api/bookings/atomic', bookingPayload({
    listingId: 'movie-hyd-1',
    paymentMode: 'pay_qr',
    seats: ['D5'],
    showtime: '07:55 PM',
    requireVerifiedPayment: false,
  }));
  assert.equal(unpaidAttempt.status, 410);
  assert.equal((await unpaidAttempt.json()).error, 'MOVIES_V1_DISPLAY_ONLY');
  assert.equal(readStore().bookings.length, 0);
});

test('legitimate offline booking remains available for non-cinema listings', async () => {
  writeStore();
  const response = await post('/api/bookings/atomic', bookingPayload({ paymentMode: 'pay_later' }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.booking.paymentStatus, 'pay_later');
  assert.equal(body.booking.status, 'confirmed');
  assert.equal(readStore().bookings.length, 1);
});

test('booking creation requires a signed customer identity and ignores client ownership', async () => {
  writeStore();
  const noAuth = await post('/api/bookings/atomic', bookingPayload(), { token: '' });
  assert.equal(noAuth.status, 401);
  assert.equal((await noAuth.json()).error, 'UNAUTHORIZED_SESSION');

  const provider = await post('/api/bookings/atomic', bookingPayload(), {
    token: signSession('provider-1', 'provider', 'provider-1'),
  });
  assert.equal(provider.status, 403);
  assert.deepEqual(readStore().bookings, []);

  const customer = await post('/api/bookings/atomic', bookingPayload({
    idempotencyKey: 'owned-booking',
    customerUserId: 'forged-other-user',
  }));
  assert.equal(customer.status, 201);
  const persisted = readStore().bookings[0];
  assert.equal(persisted.customerUserId, 'customer-1');
});

test('idempotency keys cannot disclose another customer booking', async () => {
  writeStore({ bookings: [{ ...bookingPayload({ idempotencyKey: 'shared-key', scheduledDate: '2099-01-09', timeSlot: '08:00 PM' }), id: 'secret-booking', customerUserId: 'customer-2', passCode: 'SECRET', status: 'confirmed' }] });
  const response = await post('/api/bookings/atomic', bookingPayload({ idempotencyKey: 'shared-key' }));
  assert.equal(response.status, 201);
  assert.notEqual((await response.json()).booking.id, 'secret-booking');
});

test('Movies V1 refuses legacy ticket cancellation without mutating the saved booking', async () => {
  const booking = {
    id: 'movie-booking', idempotencyKey: 'movie-idem', listingId: 'movie-hyd-1',
    listingTitle: 'Movie', providerId: 'cinema-1', customerUserId: 'customer-1',
    customerName: 'Customer', customerPhone: '9000000000', customerAddress: '',
    scheduledDate: '2099-01-10', timeSlot: '07:55 PM', showtime: '07:55 PM', seats: ['D5'],
    totalAmount: 500, paymentMode: 'pay_later', paymentStatus: 'pay_later', status: 'confirmed',
    passCode: 'MOVIE-PASS', qrSignature: 'signature', qrPassToken: 'token', createdAt: new Date().toISOString(),
  };
  const lock = { key: 'movie-hyd-1::2099-01-10::07:55 PM::D5', listingId: 'movie-hyd-1', dateIso: '2099-01-10', showtime: '07:55 PM', seatId: 'D5', sessionId: 'customer-1', userId: 'customer-1', status: 'booked', bookingId: 'movie-booking', expiresAt: Date.now() + 60_000, createdAt: new Date().toISOString() };
  writeStore({ bookings: [booking], seatLocks: { [lock.key]: lock } });

  const anonymous = await post('/api/movies/bookings/movie-booking/cancel', {
    customerPhone: '9000000000', sessionId: 'customer-1',
  }, { token: '' });
  assert.equal(anonymous.status, 410);
  assert.equal((await anonymous.json()).error, 'MOVIES_V1_DISPLAY_ONLY');
  assert.equal(readStore().bookings[0].status, 'confirmed');

  const cancelled = await post('/api/movies/bookings/movie-booking/cancel', {}, { token: signSession('customer-1') });
  assert.equal(cancelled.status, 410);
  assert.equal((await cancelled.json()).error, 'MOVIES_V1_DISPLAY_ONLY');
  const stored = readStore();
  assert.equal(stored.bookings[0].status, 'confirmed');
  assert.equal(stored.bookings[0].paymentStatus, 'pay_later');
  assert.deepEqual(Object.keys(stored.seatLocks), [lock.key]);
});

test('Movies V1 refuses atomic movie ticket booking before inventory mutation', async () => {
  writeStore({ bookings: [], seatLocks: {} });
  const response = await post('/api/bookings/atomic', bookingPayload({
    listingId: 'movie-hyd-1', module: 'movies', entityType: 'movie', seats: ['D5'],
  }));
  assert.equal(response.status, 410);
  assert.equal((await response.json()).error, 'MOVIES_V1_DISPLAY_ONLY');
  assert.equal(readStore().bookings.length, 0);
  assert.deepEqual(readStore().seatLocks, {});

  const locks = await fetch(`${baseUrl}/api/seats/locks?listingId=movie-hyd-1&dateIso=2099-01-10&showtime=07%3A55%20PM`);
  assert.equal(locks.status, 410);
  assert.equal((await locks.json()).error, 'MOVIES_V1_DISPLAY_ONLY');
  const hold = await fetch(`${baseUrl}/api/seats/hold`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ listingId: 'movie-hyd-1', dateIso: '2099-01-10', showtime: '07:55 PM', seats: ['D5'] }),
  });
  assert.equal(hold.status, 410);
  assert.equal((await hold.json()).error, 'MOVIES_V1_DISPLAY_ONLY');
  assert.equal(readStore().bookings.length, 0);
  assert.deepEqual(readStore().seatLocks, {});
});

test('Movies V1 refuses paid ticket cancellation before state or seat mutation', async () => {
  const booking = {
    id: 'paid-movie', idempotencyKey: 'paid-idem', listingId: 'movie-hyd-1', listingTitle: 'Movie',
    providerId: 'cinema-1', customerUserId: 'customer-1', customerName: 'Customer', customerPhone: '9000000000', customerAddress: '',
    scheduledDate: '2099-01-10', timeSlot: '07:55 PM', showtime: '07:55 PM', seats: ['D5'],
    totalAmount: 500, paymentMode: 'pay_qr', paymentStatus: 'verified', status: 'confirmed',
    passCode: 'PAID-PASS', qrSignature: 'signature', qrPassToken: 'token', createdAt: new Date().toISOString(),
  };
  const lock = { key: 'movie-hyd-1::2099-01-10::07:55 PM::D5', listingId: 'movie-hyd-1', dateIso: '2099-01-10', showtime: '07:55 PM', seatId: 'D5', sessionId: 'customer-1', userId: 'customer-1', status: 'booked', bookingId: 'paid-movie', expiresAt: Date.now() + 60_000, createdAt: new Date().toISOString() };
  writeStore({ bookings: [booking], seatLocks: { [lock.key]: lock } });
  const response = await post('/api/movies/bookings/paid-movie/cancel', {}, { token: signSession('customer-1') });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).error, 'MOVIES_V1_DISPLAY_ONLY');
  const stored = readStore();
  assert.equal(stored.bookings[0].status, 'confirmed');
  assert.equal(stored.bookings[0].paymentStatus, 'verified');
  assert.deepEqual(Object.keys(stored.seatLocks), [lock.key]);
});

test('provider listing approval still requires an administrator', { skip: 'Admin listing review is PostgreSQL-only and is covered by disposable PostgreSQL RBAC/ownership tests; this test server has no configured PostgreSQL database.' }, async () => {
  writeStore();
  const created = await post('/api/provider/listings', {
    id: 'approval-regression-listing',
    title: 'Pending provider listing',
    categoryId: 'pg-boys',
    price: 100,
  }, { token: signSession('USR-1001', 'provider', 'prov-1') });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).listing.status, 'pending_approval');

  const ownerApprovalAttempt = await fetch(`${baseUrl}/api/provider/listings/approval-regression-listing`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${signSession('USR-1001', 'provider', 'prov-1')}`,
    },
    body: JSON.stringify({ status: 'active' }),
  });
  assert.equal(ownerApprovalAttempt.status, 403);
  assert.equal((await ownerApprovalAttempt.json()).error, 'FORBIDDEN_ADMIN_APPROVAL_REQUIRED');

  // This server is intentionally running against the isolated JSON compatibility
  // store. Admin review is a PostgreSQL-only route and is exercised by the
  // disposable PostgreSQL ownership/RBAC suite, not by this JSON-mode test.
});

test('movie UI returns on failed verification before requesting ticket creation', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/DistrictMoviesSection.tsx'), 'utf8');
  const verifyAt = source.indexOf('if (!verifyRes.ok || !verifyRes.verified || !verifyRes.paymentVerificationToken)');
  const atomicAt = source.indexOf('createAuthoritativeBookingAtomic({', verifyAt);
  assert.notEqual(verifyAt, -1);
  assert.notEqual(atomicAt, -1);
  assert.ok(verifyAt < atomicAt);
  assert.match(source.slice(verifyAt, atomicAt), /return;/);
  assert.match(source, /Movie checkout is unavailable until provider settlement verification is configured/);
});

test('the public settlement endpoint cannot mint proof and the UI exposes provider unavailability', async () => {
  const response = await post('/api/payments/webhook-settle', {
    intentId: 'INT-test',
    utrNumber: '123456789012',
    amount: 100,
  });
  assert.equal(response.status, 410);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
  assert.equal('gatewaySignature' in body, false);

  const paymentModal = fs.readFileSync(path.join(process.cwd(), 'src/components/PaymentModal.tsx'), 'utf8');
  const bookingModal = fs.readFileSync(path.join(process.cwd(), 'src/components/BookingEnquiryModal.tsx'), 'utf8');
  assert.match(paymentModal, /Online payment unavailable/);
  assert.match(paymentModal, /Do not send funds/);
  assert.match(bookingModal, /Payment verification is unavailable\. Do not send UPI funds/);
});

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { after, before, test } from 'node:test';

const TEST_HMAC_SECRET = 'bookourspace-test-session-secret-only';
let server;
let baseUrl;
let adminToken;
let customerToken;

function signedSession(role) {
  const payload = Buffer.from(JSON.stringify({
    userId: role === 'admin' ? 'test-admin' : 'test-customer',
    email: `${role}@example.invalid`,
    role,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', `${TEST_HMAC_SECRET}:SESSION_TOKEN`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  adminToken = signedSession('admin');
  customerToken = signedSession('customer');
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: TEST_HMAC_SECRET,
      BOS_UPI_MERCHANT_VPA: 'bookourspace-test@upi',
      RAZORPAY_WEBHOOK_SECRET: 'test-webhook-secret-only',
      SUPABASE_SERVICE_ROLE_KEY: '',
      SUPABASE_PROJECT_ID: '',
      SUPABASE_ALLOWED_PROJECT_REFS: '',
      SUPABASE_URL: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      APP_URL: '',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PROJECT_ID: '',
      VITE_SUPABASE_ALLOWED_PROJECT_REFS: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not become ready. Output: ${output}`)), 20_000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes('Full-Stack Server running')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', (chunk) => { output += chunk.toString(); });
    server.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}). Output: ${output}`));
    });
  });
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('exit', resolve));
});

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.token ? { authorization: `Bearer ${options.token}` } : {}), ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

test('legacy public settlement cannot mark a payment successful', async () => {
  const response = await request('/api/payments/webhook-settle', { method: 'POST', body: { verified: true } });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).ok, false);
});

test('client-supplied Google identity cannot authenticate or gain admin access', async () => {
  const response = await request('/api/auth/google/authenticate', {
    method: 'POST',
    body: {
      authProvider: 'google',
      email: 'admin@bookourspace.in',
      name: 'Forged Administrator',
      googleSub: 'forged-admin-subject',
      requestedRole: 'admin',
    },
  });
  assert.equal(response.status, 401);
  const result = await response.json();
  assert.equal(result.ok, false);
  assert.equal(result.error, 'GOOGLE_OAUTH_PROOF_REQUIRED');
  assert.equal(Object.hasOwn(result, 'sessionToken'), false);
});

test('Google callback rejects identity fields in callback query parameters', async () => {
  const response = await request('/auth/callback?google_email=admin%40bookourspace.in&google_sub=forged');
  assert.equal(response.status, 400);
  assert.match(await response.text(), /could not be verified/i);
});

test('Google OAuth and Supabase endpoints fail closed without explicit project config', async () => {
  const response = await request('/api/auth/google/url?role=admin');
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.match(body, /GOOGLE_OAUTH_NOT_CONFIGURED/);
  assert.doesNotMatch(body, /\.supabase\.co|ezrxykyocgbolpaebnqx/i);
});

test('market section visibility is public read-only and defaults preserve current sections', async () => {
  const response = await request('/api/market-sections');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  for (const section of ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies']) {
    assert.equal(typeof result.sections[section], 'boolean');
  }
});

test('market section visibility writes reject missing and non-admin sessions', async () => {
  const missingSession = await request('/api/admin/market-sections/hotel_stay', {
    method: 'PUT', body: { enabled: false },
  });
  assert.equal(missingSession.status, 401);
  const customerSession = await request('/api/admin/market-sections/hotel_stay', {
    method: 'PUT', token: customerToken, body: { enabled: false },
  });
  assert.equal(customerSession.status, 403);
});

test('UPI UTR submission stays pending when the database is not configured', async () => {
  const response = await request('/api/payments/verify-upi', {
    method: 'POST', token: customerToken,
    body: { intentId: 'INT-test', utrNumber: '123456789012' },
  });
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.equal(result.ok, false);
  assert.notEqual(result.verified, true);
});

test('booking, seat hold and admin reconciliation fail closed without server database credentials', async () => {
  const booking = await request('/api/bookings/atomic', {
    method: 'POST', token: customerToken,
    headers: { 'x-idempotency-key': 'test-booking-1' },
    body: { listingId: 'listing-test', scheduledDate: '2026-11-01', timeSlot: '10:00', totalAmount: 100, paymentMode: 'pay_later' },
  });
  assert.equal(booking.status, 503);
  assert.equal((await booking.json()).error, 'BOOKING_DATABASE_UNAVAILABLE');

  const hold = await request('/api/seats/hold', {
    method: 'POST', token: customerToken,
    body: { listingId: 'movie-test', dateIso: '2026-11-01', showtime: '18:00', seats: ['A1'] },
  });
  assert.equal(hold.status, 503);

  const queue = await request('/api/admin/payment-reconciliation', { token: adminToken });
  assert.equal(queue.status, 503);
});

test('payment intent cannot be created from a browser-supplied session without database authority', async () => {
  const response = await request('/api/payments/create-intent', {
    method: 'POST', token: customerToken,
    headers: { 'x-idempotency-key': 'test-intent-1' },
    body: { amount: 10, merchantVpa: 'attacker@upi', userId: 'admin', purpose: 'booking' },
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'BOOKING_DATABASE_UNAVAILABLE');
});


test('Razorpay webhook rejects a bad signature before database processing', async () => {
  const payload = { event: 'payment.captured', payload: { payment: { entity: { order_id: 'order-test', id: 'pay-test', amount: 100 } } } };
  const response = await request('/api/payments/razorpay/webhook', {
    method: 'POST', headers: { 'x-razorpay-signature': '0'.repeat(64), 'x-razorpay-event-id': 'evt-test-bad' }, body: payload,
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'INVALID_WEBHOOK_SIGNATURE');
});

test('valid Razorpay webhook is not acknowledged as processed while server database is unavailable', async () => {
  const payload = { event: 'payment.captured', payload: { payment: { entity: { order_id: 'order-test', id: 'pay-test', amount: 100 } } } };
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', 'test-webhook-secret-only').update(raw).digest('hex');
  const response = await request('/api/payments/razorpay/webhook', {
    method: 'POST', headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'evt-test-valid' }, body: payload,
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, false);
});

test('customer session cannot inspect the bank reconciliation queue', async () => {
  const response = await request('/api/admin/payment-reconciliation', { token: customerToken });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'FORBIDDEN_ADMIN_ONLY');
});

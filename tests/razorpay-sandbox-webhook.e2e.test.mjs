import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

/**
 * Razorpay booking-boundary tests.
 *
 * This suite never contacts Razorpay. Against the real Express server and a
 * disposable store it proves:
 *  - order creation refuses an unbound or unowned booking, and refuses a
 *    client-supplied amount that differs from the server-priced booking total
 *  - order creation fails closed (503) with no credentials
 *  - the webhook fails closed (503) with no signing secret
 *  - missing / forged signatures are rejected (401)
 *  - the signature is verified over the **raw** request body, not a
 *    re-serialised copy
 *  - duplicate callbacks are idempotent by provider event id
 *  - a capture settles only the booking bound to its intent, at the booking's
 *    own amount
 *  - one provider payment cannot settle two intents/bookings
 *  - a booking already settled by another payment rejects a second settlement
 *  - refunds are bounded by the paid amount and are recorded on the bound booking
 *  - the endpoint never returns a payment signature to the caller
 *
 * Live/sandbox provider settlement is BLOCKED on real Razorpay credentials;
 * every payment here is a locally signed synthetic event.
 */

const WEBHOOK_SECRET = 'rzp-sandbox-webhook-secret-local-only';
const KEY_SECRET = 'rzp_test_secret_local';
const CUSTOMER = 'e5c1a2b3-1111-4222-8333-444455556666';
const SESSION_SECRET = 'razorpay-sandbox-e2e-session-secret';

let child;
let serverUrl;
let tempDir;
let storePath;

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

function intent(id, orderId, rupees, bookingId) {
  return {
    id,
    userId: 'USR-RZP-C',
    bookingId,
    purpose: 'booking',
    amount: rupees,
    amountInPaise: Math.round(rupees * 100),
    currency: 'INR',
    razorpayOrderId: orderId,
    status: 'created',
    provider: 'razorpay',
    createdAt: new Date().toISOString(),
  };
}

function booking(id, totalAmount, customerUserId = 'USR-RZP-C') {
  return {
    id,
    customerUserId,
    providerId: 'PROV-1',
    listingId: `listing-${id}`,
    vertical: 'services',
    totalAmount,
    status: 'confirmed',
    paymentMode: 'pay_later',
    paymentStatus: 'pay_later',
  };
}

async function writeStore() {
  await fs.writeFile(
    storePath,
    JSON.stringify({
      seatLocks: {},
      bookingLocks: {},
      bookings: [
        booking('bk-1', 1500),
        booking('bk-2', 500),
        booking('bk-3', 1500, 'USR-OTHER'),
      ],
      enquiries: [],
      paymentIntents: {
        'INT-RZP-1': intent('INT-RZP-1', 'order_test_1', 1500, 'bk-1'),
        'INT-RZP-2': intent('INT-RZP-2', 'order_test_2', 500, 'bk-2'),
        // A second intent bound to the same booking: settles nothing once bk-1 is paid.
        'INT-RZP-3': intent('INT-RZP-3', 'order_test_3', 1500, 'bk-1'),
      },
      usedUtrs: {},
      usedRazorpayPaymentIds: {},
      usedRefundUtrs: {},
      refundsLedger: {},
      paymentRefundAuditLogs: [],
      checkedInPasses: {},
      users: {
        'USR-RZP-C': {
          id: 'USR-RZP-C',
          name: 'Razorpay Customer',
          email: 'rzp-customer@example.test',
          phone: '+91 90000 00000',
          role: 'customer',
          status: 'active',
          supabaseUserId: CUSTOMER,
        },
      },
      notifications: [],
      notificationCampaigns: [],
      providerListings: [],
      adminModules: [],
      revokedTokens: [],
    }),
    'utf8',
  );
}

async function startServer(extraEnv = {}) {
  const port = await freePort();
  serverUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: SESSION_SECRET,
      BOS_LISTINGS_DATABASE_URL: '',
      BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
      // Explicitly empty: this suite must never reach a real gateway.
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode})`);
    try {
      const response = await fetch(`${serverUrl}/api/auth/me`);
      if (response.status === 401) return;
    } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('server did not become ready');
}

async function stopServer() {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  child = undefined;
}

function sessionToken() {
  const payload = Buffer.from(JSON.stringify({
    userId: 'USR-RZP-C', supabaseUserId: CUSTOMER, email: 'rzp-customer@example.test',
    name: 'customer', phone: '+91 90000 00000', role: 'customer', authProvider: 'google',
    issuedAt: Date.now(), expiresAt: Date.now() + 10 * 60_000,
  })).toString('base64url');
  const signature = createHmac('sha256', `${SESSION_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

async function postRaw(pathname, rawBody, headers = {}) {
  const response = await fetch(`${serverUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: rawBody,
  });
  return { status: response.status, data: await response.json() };
}

async function post(pathname, body, headers = {}) {
  return postRaw(pathname, JSON.stringify(body), headers);
}

function auth() {
  return { Authorization: `Bearer ${sessionToken()}` };
}

function signed(bodyRaw, eventId) {
  return {
    'x-razorpay-signature': createHmac('sha256', WEBHOOK_SECRET).update(bodyRaw).digest('hex'),
    'x-razorpay-event-id': eventId,
  };
}

function capturePayload(orderId, paymentId, paise) {
  return { event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: paise } } } };
}

async function readStore() {
  return JSON.parse(await fs.readFile(storePath, 'utf8'));
}

before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bos-razorpay-webhook-'));
  storePath = path.join(tempDir, 'isolated-store.json');
  await writeStore();
  await startServer();
});

after(async () => {
  await stopServer();
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

test('order creation refuses an order with no booking binding, before any network call', async () => {
  const result = await post('/api/payments/razorpay/create-order', { amount: 1500 }, auth());
  assert.equal(result.status, 400);
  assert.equal(result.data.error, 'BOOKING_ID_REQUIRED');
});

test('order creation fails closed without credentials, for a valid bound booking', async () => {
  const result = await post('/api/payments/razorpay/create-order', { bookingId: 'bk-1', amount: 1500 }, auth());
  assert.equal(result.status, 503);
  assert.equal(result.data.error, 'RAZORPAY_NOT_CONFIGURED');
});

test('webhook fails closed when no signing secret is configured', async () => {
  const result = await post('/api/payments/razorpay/webhook', { event: 'payment.captured' });
  assert.equal(result.status, 503);
  assert.equal(result.data.error, 'RAZORPAY_WEBHOOK_NOT_CONFIGURED');
});

test('a correctly configured secret still rejects missing and forged signatures', async () => {
  await stopServer();
  await startServer({
    RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    RAZORPAY_KEY_ID: 'rzp_test_local',
    RAZORPAY_KEY_SECRET: KEY_SECRET,
  });

  const noSignature = await post('/api/payments/razorpay/webhook', { event: 'payment.captured' });
  assert.equal(noSignature.status, 401);
  assert.equal(noSignature.data.error, 'MISSING_WEBHOOK_SIGNATURE');

  const forged = await post('/api/payments/razorpay/webhook', { event: 'payment.captured' }, {
    'x-razorpay-signature': 'deadbeef',
    'x-razorpay-event-id': 'evt_forged',
  });
  assert.equal(forged.status, 401);
  assert.equal(forged.data.error, 'INVALID_WEBHOOK_SIGNATURE');
});

test('order creation rejects an unknown booking, a foreign booking and a forged amount', async () => {
  const unknown = await post('/api/payments/razorpay/create-order', { bookingId: 'bk-missing', amount: 1500 }, auth());
  assert.equal(unknown.status, 404);
  assert.equal(unknown.data.error, 'BOOKING_NOT_FOUND');

  const foreign = await post('/api/payments/razorpay/create-order', { bookingId: 'bk-3', amount: 1500 }, auth());
  assert.equal(foreign.status, 403);
  assert.equal(foreign.data.error, 'BOOKING_NOT_OWNED_BY_SESSION');

  const forged = await post('/api/payments/razorpay/create-order', { bookingId: 'bk-1', amount: 1 }, auth());
  assert.equal(forged.status, 400);
  assert.equal(forged.data.error, 'PAYMENT_AMOUNT_MISMATCH');
  assert.equal(forged.data.serverAmount, 1500);
});

test('an event id is required so duplicate callbacks can be de-duplicated', async () => {
  const raw = JSON.stringify(capturePayload('order_test_1', 'pay_x', 150000));
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  const result = await postRaw('/api/payments/razorpay/webhook', raw, { 'x-razorpay-signature': signature });
  assert.equal(result.status, 400);
  assert.equal(result.data.error, 'PROVIDER_EVENT_ID_REQUIRED');
});

test('the signature is verified over the raw body and the bound booking is settled', async () => {
  const raw = `{\n  "payload": {"payment": {"entity": {"order_id": "order_test_1", "id": "pay_raw_body", "amount": 150000}}},\n  "event": "payment.captured"\n}`;

  // Signing the compact re-serialised body must FAIL: this is the historical bug.
  const compact = JSON.stringify(JSON.parse(raw));
  const compactSignature = createHmac('sha256', WEBHOOK_SECRET).update(compact).digest('hex');
  const wrong = await postRaw('/api/payments/razorpay/webhook', raw, {
    'x-razorpay-signature': compactSignature,
    'x-razorpay-event-id': 'evt_compact',
  });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.error, 'INVALID_WEBHOOK_SIGNATURE');

  const result = await postRaw('/api/payments/razorpay/webhook', raw, signed(raw, 'evt_raw_body'));
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.intentId, 'INT-RZP-1');
  assert.equal(result.data.status, 'verified');
  assert.equal(result.data.bookingId, 'bk-1');
  assert.equal(result.data.bookingSettlement, true);
  assert.equal(result.data.razorpaySignature, undefined);
  assert.equal(result.data.paymentVerificationToken, undefined);

  const store = await readStore();
  const paid = store.bookings.find((entry) => entry.id === 'bk-1');
  assert.equal(paid.paymentStatus, 'verified', 'only the bound booking is marked paid');
  assert.equal(paid.paymentGateway, 'razorpay');
  assert.equal(paid.paymentReference, 'pay_raw_body');
  assert.equal(store.bookings.find((entry) => entry.id === 'bk-2').paymentStatus, 'pay_later');
  assert.equal(store.bookings.find((entry) => entry.id === 'bk-3').paymentStatus, 'pay_later');
});

test('a duplicate callback is idempotent and changes nothing', async () => {
  const raw = JSON.stringify(capturePayload('order_test_1', 'pay_raw_body', 150000));
  const first = await postRaw('/api/payments/razorpay/webhook', raw, signed(raw, 'evt_raw_body'));
  assert.equal(first.status, 200);
  assert.equal(first.data.replayed, true);

  const store = await readStore();
  assert.equal(Object.keys(store.razorpayWebhookEvents).length, 1, 'one recorded provider event');
  assert.equal(store.paymentIntents['INT-RZP-1'].status, 'verified');
  assert.equal(store.paymentIntents['INT-RZP-1'].razorpayPaymentId, 'pay_raw_body');
});

test('a wrong amount is refused and the bound booking stays unpaid', async () => {
  const raw = JSON.stringify(capturePayload('order_test_2', 'pay_wrong_amount', 100));
  const result = await postRaw('/api/payments/razorpay/webhook', raw, signed(raw, 'evt_wrong_amount'));
  assert.equal(result.status, 400);
  assert.equal(result.data.error, 'PAYMENT_AMOUNT_MISMATCH');

  const store = await readStore();
  assert.equal(store.paymentIntents['INT-RZP-2'].status, 'created');
  assert.equal(store.bookings.find((entry) => entry.id === 'bk-2').paymentStatus, 'pay_later');
});

test('an unknown order is refused without creating a payment', async () => {
  const raw = JSON.stringify(capturePayload('order_does_not_exist', 'pay_unknown', 150000));
  const result = await postRaw('/api/payments/razorpay/webhook', raw, signed(raw, 'evt_unknown_order'));
  assert.equal(result.status, 404);
  assert.equal(result.data.error, 'RAZORPAY_ORDER_NOT_FOUND');

  const store = await readStore();
  assert.equal(Object.keys(store.razorpayWebhookEvents).length, 1);
});

test('a signed capture for another intent settles only that intent and its booking', async () => {
  const raw = JSON.stringify(capturePayload('order_test_2', 'pay_test_2', 50000));
  const result = await postRaw('/api/payments/razorpay/webhook', raw, signed(raw, 'evt_capture_2'));
  assert.equal(result.status, 200);
  assert.equal(result.data.intentId, 'INT-RZP-2');
  assert.equal(result.data.status, 'verified');
  assert.equal(result.data.bookingId, 'bk-2');

  const store = await readStore();
  assert.equal(store.bookings.length, 3, 'no booking row is created by a webhook');
  assert.equal(store.bookings.find((entry) => entry.id === 'bk-2').paymentStatus, 'verified');
});

test('one provider payment cannot settle a second intent', async () => {
  // pay_test_2 already settled INT-RZP-2; INT-RZP-3 is bound to a different booking.
  const raw = JSON.stringify(capturePayload('order_test_3', 'pay_test_2', 150000));
  const result = await postRaw('/api/payments/razorpay/webhook', raw, signed(raw, 'evt_replay_payment'));
  assert.equal(result.status, 409);
  assert.equal(result.data.error, 'DUPLICATE_RAZORPAY_PAYMENT_REPLAY');

  const store = await readStore();
  assert.equal(store.paymentIntents['INT-RZP-3'].status, 'created');
  assert.equal(store.bookings.find((entry) => entry.id === 'bk-1').paymentReference, 'pay_raw_body');
});

test('a booking already paid by another payment refuses a second settlement', async () => {
  const raw = JSON.stringify(capturePayload('order_test_3', 'pay_second_for_bk1', 150000));
  const result = await postRaw('/api/payments/razorpay/webhook', raw, signed(raw, 'evt_second_settlement'));
  assert.equal(result.status, 409);
  assert.equal(result.data.error, 'CROSS_BOOKING_SETTLEMENT');

  const store = await readStore();
  assert.equal(store.paymentIntents['INT-RZP-3'].status, 'created');
});

test('the verify endpoint rejects a second settlement of the same booking', async () => {
  const orderId = 'order_test_3';
  const paymentId = 'pay_verify_new';
  const signature = createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const result = await post('/api/payments/razorpay/verify', {
    intentId: 'INT-RZP-3',
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  }, auth());
  assert.equal(result.status, 409);
  assert.equal(result.data.error, 'BOOKING_ALREADY_SETTLED');
});

test('a verify replay returns the stored settlement for the bound booking', async () => {
  const orderId = 'order_test_2';
  const paymentId = 'pay_test_2';
  const signature = createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const result = await post('/api/payments/razorpay/verify', {
    intentId: 'INT-RZP-2',
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  }, auth());
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.replayed, true);
  assert.equal(result.data.bookingSettlement, true);
  assert.equal(result.data.bookingId, 'bk-2');
  assert.equal(typeof result.data.paymentVerificationToken, 'string');

  const store = await readStore();
  assert.equal(store.bookings.find((entry) => entry.id === 'bk-2').paymentReference, 'pay_test_2');
});

test('an oversized refund is refused and a valid refund is recorded on the bound booking', async () => {
  const tooMuch = JSON.stringify({
    event: 'refund.processed',
    payload: { refund: { entity: { id: 'rfnd_big', payment_id: 'pay_test_2', amount: 999999 } } },
  });
  const refused = await postRaw('/api/payments/razorpay/webhook', tooMuch, signed(tooMuch, 'evt_refund_big'));
  assert.equal(refused.status, 400);
  assert.equal(refused.data.error, 'REFUND_EXCEEDS_PAYMENT');

  const good = JSON.stringify({
    event: 'refund.processed',
    payload: { refund: { entity: { id: 'rfnd_ok', payment_id: 'pay_test_2', amount: 50000 } } },
  });
  const refunded = await postRaw('/api/payments/razorpay/webhook', good, signed(good, 'evt_refund_ok'));
  assert.equal(refunded.status, 200);
  assert.equal(refunded.data.status, 'refunded');

  const replay = await postRaw('/api/payments/razorpay/webhook', good, signed(good, 'evt_refund_ok'));
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true);

  const store = await readStore();
  assert.equal(store.paymentIntents['INT-RZP-2'].status, 'refunded');
  assert.equal(store.paymentIntents['INT-RZP-2'].refundPaise, 50000);
  const refundedBooking = store.bookings.find((entry) => entry.id === 'bk-2');
  assert.equal(refundedBooking.paymentStatus, 'refunded');
  assert.equal(refundedBooking.refundPaise, 50000);
  assert.equal(refundedBooking.status, 'confirmed', 'a refund does not silently cancel the booking');
});

test('a settled booking cannot start a new order', async () => {
  const result = await post('/api/payments/razorpay/create-order', { bookingId: 'bk-2' }, auth());
  assert.equal(result.status, 409);
  assert.equal(result.data.error, 'BOOKING_ALREADY_SETTLED');
});

test('an unsupported but signed event type is acknowledged without moving money', async () => {
  const raw = JSON.stringify({ event: 'payment.dispute.created', payload: {} });
  const result = await postRaw('/api/payments/razorpay/webhook', raw, signed(raw, 'evt_unsupported'));
  assert.equal(result.status, 202);
  assert.equal(result.data.ignored, true);
});

test('the browser cannot mint a payment signature through the order-status endpoint', async () => {
  const response = await fetch(`${serverUrl}/api/payments/razorpay/order-status/order_test_1`, {
    headers: auth(),
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.order.status, 'verified');
  assert.equal(data.order.paymentVerificationToken, undefined);
  assert.equal(data.order.razorpaySignature, undefined);
});

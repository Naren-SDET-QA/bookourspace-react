import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';
import { STAY, USERS, sessionToken, startStaysHarness, type StaysHarness } from './stays-e2e-harness';

/**
 * Signed sandbox payment lifecycle against the real Express + PostgreSQL.
 * No real money, no client-side success state: every transition comes from a
 * provider event or an authorized admin action.
 */

let harness: StaysHarness;
const SANDBOX_SECRET = 'e2e-sandbox-secret-0123456789';
const RAZORPAY_KEY_SECRET = 'rzp_test_stay_e2e_secret';
const RAZORPAY_WEBHOOK_SECRET = 'rzp_test_stay_e2e_webhook';

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  harness = await startStaysHarness({
    merchantVpa: 'bookourspace@upi',
    paymentSandboxSecret: SANDBOX_SECRET,
    razorpayKeyId: 'rzp_test_stay_e2e',
    razorpayKeySecret: RAZORPAY_KEY_SECRET,
    razorpayWebhookSecret: RAZORPAY_WEBHOOK_SECRET,
  });
});
test.afterAll(async () => { await harness?.stop(); });

function isoPlus(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function api(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${harness.apiUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function createUpiBooking(days: number, key: string) {
  const rooms = await api(`/api/stays/${STAY.listingId}/room-types`, sessionToken(USERS.customerA));
  return api('/api/stays/checkout', sessionToken(USERS.customerA), {
    method: 'POST',
    body: JSON.stringify({
      listingId: STAY.listingId,
      roomTypeId: rooms.body.roomTypes[0].id,
      checkIn: isoPlus(days),
      checkOut: isoPlus(days + 2),
      units: 1,
      paymentMode: 'upi',
      idempotencyKey: key,
      guestName: 'Payment Guest',
      guestPhone: '+919000000020',
    }),
  });
}

function signature(eventId: string, intentId: string, eventType: string, amountPaise: number, providerPaymentId: string) {
  return crypto.createHmac('sha256', SANDBOX_SECRET)
    .update(`${eventId}|${intentId}|${eventType}|${amountPaise}|${providerPaymentId}`)
    .digest('hex');
}

async function webhook(body: Record<string, unknown>, sig?: string) {
  return fetch(`${harness.apiUrl}/api/payments/sandbox/psp-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bos-signature': sig || '' },
    body: JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => ({})) }));
}

function safeSqlStates(output: string): string[] {
  return [...new Set([...output.matchAll(/\bcode=[A-Z0-9]{5}(?: constraint=[A-Za-z0-9_]+)?(?: routine=[A-Za-z0-9_]+)?(?: detail=invalid input syntax(?: for type [a-z ]+)?)?(?: context=[a-zA-Z0-9_.]+:\d+)?/g)].map((match) => match[0]))];
}

test('signed provider capture verifies the payment and confirms inventory', async () => {
  const booking = await createUpiBooking(10, `pay-capture-${Date.now()}`);
  expect(booking.status).toBe(201);
  expect(booking.body.upiUri).toContain('upi://pay');
  const intentId = booking.body.intentId as string;
  const amount = Number(booking.body.amountPaise);

  const eventId = `evt-${crypto.randomUUID()}`;
  const providerId = `pay-${crypto.randomUUID()}`;
  const sig = signature(eventId, intentId, 'payment.captured', amount, providerId);
  const first = await webhook({ eventId, intentId, eventType: 'payment.captured', amountPaise: amount, providerPaymentId: providerId }, sig);
  expect(first.status, JSON.stringify({ status: first.status, error: first.body.error, sqlStates: safeSqlStates(harness.apiOutput()) })).toBe(200);
  expect(first.body.status).toBe('verified');

  const replay = await webhook({ eventId, intentId, eventType: 'payment.captured', amountPaise: amount, providerPaymentId: providerId }, sig);
  expect(replay.status).toBe(200);
  expect(replay.body.replayed).toBe(true);

  const state = await harness.query(
    `select i.status as intent, b.payment_status, b.status as booking, a.status as allocation
       from public.payment_intents i
       join public.bookings b on b.id = i.booking_id
       join public.stay_allocations a on a.booking_id = b.id
      where i.id = $1`,
    [intentId],
  );
  expect(state[0].intent).toBe('verified');

  const receipt = await api(`/api/stays/bookings/${booking.body.bookingId}/receipt`, sessionToken(USERS.customerA));
  expect(receipt.status).toBe(200);
  expect(receipt.body.receipt.paid).toBe(true);
  expect(receipt.body.receipt.duePaise).toBe(0);
  expect(receipt.body.receipt.paymentReference).toBe(providerId);
  expect(receipt.body.qrToken).toMatch(/^bos1\./);
  expect(state[0].payment_status).toBe('verified');
  expect(state[0].booking).toBe('confirmed');
  expect(state[0].allocation).toBe('confirmed');
});

test('unsigned, tampered and failed provider events never confirm a booking', async () => {
  const booking = await createUpiBooking(20, `pay-fail-${Date.now()}`);
  const intentId = booking.body.intentId as string;
  const amount = Number(booking.body.amountPaise);
  const eventId = `evt-${crypto.randomUUID()}`;
  const providerId = `pay-${crypto.randomUUID()}`;

  const unsigned = await webhook({ eventId, intentId, eventType: 'payment.captured', amountPaise: amount, providerPaymentId: providerId });
  expect(unsigned.status).toBe(401);

  const tampered = await webhook({ eventId, intentId, eventType: 'payment.captured', amountPaise: amount + 100, providerPaymentId: providerId }, signature(eventId, intentId, 'payment.captured', amount, providerId));
  expect(tampered.status).toBe(401);

  const failEvent = `evt-${crypto.randomUUID()}`;
  const failed = await webhook({ eventId: failEvent, intentId, eventType: 'payment.failed', amountPaise: amount, providerPaymentId: providerId }, signature(failEvent, intentId, 'payment.failed', amount, providerId));
  expect(failed.status).toBe(200);
  expect(failed.body.settled).toBe(false);

  const state = await harness.query(
    `select i.status as intent, b.payment_status, b.status as booking, a.status as allocation
       from public.payment_intents i
       join public.bookings b on b.id = i.booking_id
       join public.stay_allocations a on a.booking_id = b.id
      where i.id = $1`,
    [intentId],
  );
  expect(state[0].intent).toBe('failed');
  expect(state[0].payment_status).toBe('failed');
  expect(state[0].booking).toBe('cancelled');
  expect(state[0].allocation).toBe('released');
});

test('admin refund is provider-confirmed and idempotent, never a client claim', async () => {
  const booking = await createUpiBooking(40, `pay-refund-${Date.now()}`);
  const intentId = booking.body.intentId as string;
  const amount = Number(booking.body.amountPaise);
  const eventId = `evt-${crypto.randomUUID()}`;
  const providerId = `pay-${crypto.randomUUID()}`;
  const captured = await webhook(
    { eventId, intentId, eventType: 'payment.captured', amountPaise: amount, providerPaymentId: providerId },
    signature(eventId, intentId, 'payment.captured', amount, providerId),
  );
  expect(captured.body.status).toBe('verified');

  const nonAdmin = await api(`/api/payments/intents/${intentId}/refund`, sessionToken(USERS.customerA), { method: 'POST', body: '{}' });
  expect(nonAdmin.status).toBe(403);

  const refund = await api(`/api/payments/intents/${intentId}/refund`, sessionToken(USERS.admin), { method: 'POST', body: '{}' });
  expect(refund.status).toBe(200);
  expect(refund.body.ok).toBe(true);
  expect(Number(refund.body.refundPaise)).toBe(amount);
  const again = await api(`/api/payments/intents/${intentId}/refund`, sessionToken(USERS.admin), { method: 'POST', body: '{}' });
  expect(again.status).toBe(409);

  const state = await harness.query(
    `select i.status as intent, i.refund_paise, b.payment_status, b.status as booking
       from public.payment_intents i join public.bookings b on b.id = i.booking_id where i.id = $1`,
    [intentId],
  );
  expect(state[0].intent).toBe('refunded');
  expect(Number(state[0].refund_paise)).toBe(amount);
  expect(state[0].payment_status).toBe('refunded');
  expect(state[0].booking).toBe('cancelled');

  const receipt = await api(`/api/stays/bookings/${booking.body.bookingId}/receipt`, sessionToken(USERS.customerA));
  expect(receipt.status).toBe(200);
  expect(receipt.body.receipt.refunded).toBe(true);
  expect(receipt.body.receipt.paid).toBe(false);
  expect(receipt.body.receipt.duePaise).toBe(0);
});

test('Razorpay Checkout settles only after a signed webhook on the stay order', async () => {
  const rooms = await api(`/api/stays/${STAY.listingId}/room-types`, sessionToken(USERS.customerA));
  const created = await api('/api/stays/checkout', sessionToken(USERS.customerA), {
    method: 'POST',
    body: JSON.stringify({
      listingId: STAY.listingId,
      roomTypeId: rooms.body.roomTypes[0].id,
      checkIn: isoPlus(50),
      checkOut: isoPlus(52),
      units: 1,
      paymentMode: 'razorpay',
      idempotencyKey: `rzp-${Date.now()}`,
      guestName: 'Razorpay Guest',
      guestPhone: '+919000000021',
    }),
  });
  expect(created.status).toBe(201);
  expect(String(created.body.razorpayOrderId || '')).toMatch(/^order_sandbox_/);
  expect(created.body.status).toBe('pending_verification');

  const paymentId = `pay_sandbox_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const payload = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: created.body.razorpayOrderId,
          amount: Number(created.body.amountPaise),
          status: 'captured',
        },
      },
    },
  });
  const unsigned = await fetch(`${harness.apiUrl}/api/stays/payments/razorpay/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  });
  expect(unsigned.status).toBe(401);

  const signatureHex = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');
  const captured = await fetch(`${harness.apiUrl}/api/stays/payments/razorpay/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': signatureHex },
    body: payload,
  });
  const body = await captured.json();
  expect(captured.status).toBe(200);
  expect(body.status).toBe('verified');

  const state = await harness.query(
    `select i.status as intent, i.provider, b.payment_status, a.status as allocation
       from public.payment_intents i
       join public.bookings b on b.id = i.booking_id
       join public.stay_allocations a on a.booking_id = b.id
      where i.id = $1`,
    [created.body.intentId],
  );
  expect(state[0].intent).toBe('verified');
  expect(state[0].provider).toBe('razorpay');
  expect(state[0].payment_status).toBe('verified');
  expect(state[0].allocation).toBe('confirmed');
});

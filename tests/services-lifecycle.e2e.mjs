import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import net from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import pg from 'pg';

/**
 * Home & Local Services: schedule, availability, canonical slots, server-priced
 * UPI settlement, refunds, restart persistence and ownership isolation.
 *
 * Runs against a live server and a disposable PostgreSQL database supplied by
 * supabase/tests/run_services_e2e.sh.
 */

const { Pool } = pg;
const connectionString = process.env.BOS_LISTINGS_DATABASE_URL;
const SECRET = 'services-lifecycle-e2e-secret';
const SANDBOX_SECRET = 'services-lifecycle-sandbox-secret';
const provider = 'b1c2d3e4-1111-4222-8333-444455556666';
const customer = 'b1c2d3e4-2222-4333-8444-555566667777';
const otherCustomer = 'b1c2d3e4-3333-4444-8555-666677778888';
const admin = 'b1c2d3e4-4444-4555-8666-777788889999';
const listingId = 'svc-lifecycle-listing-1';
const serviceBusinessRef = 'BIZ-E2E-SVC-LIFECYCLE';
const PRICE = 1500;

let pool;
let child;
let serverUrl;
let serverStderr = '';
const available = Boolean(connectionString);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function token({ id, role, email }) {
  const payload = Buffer.from(JSON.stringify({
    userId: `USR-${role}-${id.slice(0, 4)}`,
    supabaseUserId: id,
    email,
    name: `${role} lifecycle`,
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 10 * 60_000,
  })).toString('base64url');
  const signature = createHmac('sha256', `${SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

const customerToken = token({ id: customer, role: 'customer', email: 'lifecycle-customer@example.test' });
const otherToken = token({ id: otherCustomer, role: 'customer', email: 'lifecycle-other@example.test' });
const providerToken = token({ id: provider, role: 'provider', email: 'lifecycle-provider@example.test' });
const adminToken = token({ id: admin, role: 'admin', email: 'lifecycle-admin@example.test' });

async function request(method, path, authToken, body) {
  const response = await fetch(`${serverUrl}${path}`, {
    method,
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function signedEvent({ eventId, intentId, eventType, amountPaise, providerPaymentId }) {
  const signature = createHmac('sha256', SANDBOX_SECRET)
    .update(`${eventId}|${intentId}|${eventType}|${amountPaise}|${providerPaymentId}`)
    .digest('hex');
  return fetch(`${serverUrl}/api/services/payments/sandbox/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bos-signature': signature },
    body: JSON.stringify({ eventId, intentId, eventType, amountPaise, providerPaymentId }),
  }).then(async (response) => ({ status: response.status, data: await response.json().catch(() => ({})) }));
}

async function startServer(port) {
  serverUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      VITE_ENABLE_DEMO_DATA: 'false',
      DISABLE_HMR: 'true',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: SECRET,
      BOS_LISTINGS_DATABASE_URL: connectionString,
      BOS_SERVICES_UPI_VPA: 'bookourspace@okhdfcbank',
      BOS_SERVICES_UPI_NAME: 'BookOurSpace Services',
      BOS_PAYMENT_SANDBOX: '1',
      BOS_PAYMENT_SANDBOX_SECRET: SANDBOX_SECRET,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', (chunk) => {
    serverStderr = `${serverStderr}${chunk.toString()}`.slice(-4000);
  });
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode})`);
    try {
      const response = await fetch(`${serverUrl}/api/auth/me`);
      if (response.status === 401) return;
    } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`server did not become ready: ${serverStderr}`);
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

function targetDate(daysAhead = 3) {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

before(async () => {
  if (!available) return;
  pool = new Pool({ connectionString });
  for (const [id, email, name, role] of [
    [provider, 'lifecycle-provider@example.test', 'Lifecycle Provider', 'provider'],
    [customer, 'lifecycle-customer@example.test', 'Lifecycle Customer', 'customer'],
    [otherCustomer, 'lifecycle-other@example.test', 'Other Customer', 'customer'],
    [admin, 'lifecycle-admin@example.test', 'Lifecycle Admin', 'admin'],
  ]) {
    await pool.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, $2, jsonb_build_object('full_name', $3::text)) on conflict (id) do nothing`,
      [id, email, name],
    );
    await pool.query(
      `insert into public.profiles (id, role, account_status, full_name, email)
       values ($1, $2, 'active', $3, $4)
       on conflict (id) do update set role = excluded.role, account_status = 'active'`,
      [id, role, name, email],
    );
  }
  // Customer module access is an allow-list: no rows means no modules.
  await pool.query(
    `insert into public.customer_module_access (user_id, module_key)
     select id, 'services' from public.profiles where id = any($1::uuid[])
     on conflict (user_id, module_key) do nothing`,
    [[customer, otherCustomer]],
  );
  await pool.query('delete from public.service_bookings where provider_id = $1', [provider]);
  await pool.query('delete from public.service_provider_schedules where provider_id = $1', [provider]);
  // Provider routes now require an approved services business context.
  const serviceBusiness = await pool.query(
    `insert into public.businesses
       (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source,created_by,approved_at)
     values ($1, 'Lifecycle Services Business', 'services', $2, 'approved', true, 'e2e_fixture', $2, now())
     on conflict (business_ref) do update
       set module_type = 'services', approval_status = 'approved', is_enabled = true
     returning id`,
    [serviceBusinessRef, provider],
  );
  await pool.query(
    `insert into public.listings (id, owner_id, business_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
     values ($1, $2, $3, 'Lifecycle AC Repair', 'cat-4', 'AC Repair', 'service', $4, 'per visit', 'active', '{"sectionType":"services"}'::jsonb)
     on conflict (id) do update set status = 'active', price = excluded.price, business_id = excluded.business_id,
       category_id = excluded.category_id, subcategory = excluded.subcategory, payload = excluded.payload`,
    [listingId, provider, serviceBusiness.rows[0].id, PRICE],
  );
  await startServer(await freePort());
});

after(async () => {
  if (!available) return;
  await stopServer();
  await pool?.end();
});

const dbTest = (name, fn) => test(name, { skip: !available }, fn);

dbTest('provider profile and default availability are real', async () => {
  const profile = await request('GET', `/api/services/listings/${listingId}/profile`);
  assert.equal(profile.status, 200);
  assert.equal(profile.data.profile.scheduleConfigured, false);
  assert.equal(profile.data.profile.price, PRICE);

  const availability = await request('GET', `/api/services/listings/${listingId}/availability?from=${targetDate()}&to=${targetDate()}`);
  assert.equal(availability.status, 200);
  assert.ok(availability.data.slots.length >= 10, `slots=${availability.data.slots.length}`);
  assert.equal(availability.data.slots[0].start, '06:00');
  assert.equal(availability.data.slots.every((slot) => slot.isBooked === false), true);
});

dbTest('provider publishes working hours and service area', async () => {
  const schedule = await request('PUT', '/api/services/provider/schedule', providerToken, {
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    dayStart: '09:00',
    dayEnd: '18:00',
    slotMinutes: 60,
    serviceAreas: ['Madhapur', 'Gachibowli'],
    travelRadiusKm: 12,
  });
  assert.equal(schedule.status, 200);

  const profile = await request('GET', `/api/services/listings/${listingId}/profile`);
  assert.equal(profile.data.profile.scheduleConfigured, true);
  assert.deepEqual(profile.data.profile.serviceAreas, ['Madhapur', 'Gachibowli']);
  assert.equal(profile.data.profile.dayStart, '09:00');

  const availability = await request('GET', `/api/services/listings/${listingId}/availability?from=${targetDate()}&to=${targetDate()}`);
  assert.equal(availability.data.slots[0].start, '09:00');
  assert.equal(availability.data.slots.at(-1).start, '17:00');

  const customerForbidden = await request('PUT', '/api/services/provider/schedule', customerToken, {
    workingDays: [1], dayStart: '09:00', dayEnd: '10:00', slotMinutes: 60, serviceAreas: [],
  });
  assert.equal(customerForbidden.status, 403);
});

dbTest('a booking outside working hours is refused', async () => {
  const outside = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId,
    scheduledDate: targetDate(),
    timeSlot: '03:00',
    serviceAddress: 'Flat 402, Madhapur, Hyderabad',
    customerPhone: '+91 90000 00000',
    paymentMode: 'pay_after_service',
  });
  assert.equal(outside.status, 409);
  assert.equal(outside.data.error, 'SERVICE_SLOT_UNAVAILABLE');
});

dbTest('canonical slot prevents wording-based double booking', async () => {
  const first = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId,
    scheduledDate: targetDate(),
    timeSlot: '10:00',
    serviceAddress: 'Flat 402, Madhapur, Hyderabad',
    customerPhone: '+91 90000 00000',
    paymentMode: 'pay_after_service',
  });
  assert.equal(first.status, 201, JSON.stringify(first.data));

  const identical = await request('POST', '/api/services/bookings', otherToken, {
    idempotencyKey: randomUUID(),
    listingId,
    scheduledDate: targetDate(),
    timeSlot: '10:00 AM',
    serviceAddress: 'Plot 9, Gachibowli, Hyderabad',
    customerPhone: '+91 90000 00001',
    paymentMode: 'pay_after_service',
  });
  assert.equal(identical.status, 409);
  assert.equal(identical.data.error, 'SERVICE_SLOT_ALREADY_BOOKED');

  const availability = await request('GET', `/api/services/listings/${listingId}/availability?from=${targetDate()}&to=${targetDate()}`);
  const ten = availability.data.slots.find((slot) => slot.slotKey === '10:00');
  assert.equal(ten.isBooked, true);
});

dbTest('concurrent customers cannot reserve the same service slot', async () => {
  const date = targetDate(8);
  const requests = await Promise.all([
    request('POST', '/api/services/bookings', customerToken, {
      idempotencyKey: randomUUID(), listingId, scheduledDate: date, timeSlot: '11:00',
      serviceAddress: 'Flat 402, Madhapur, Hyderabad', customerPhone: '+91 90000 00000',
      paymentMode: 'pay_after_service',
    }),
    request('POST', '/api/services/bookings', otherToken, {
      idempotencyKey: randomUUID(), listingId, scheduledDate: date, timeSlot: '11:00 AM',
      serviceAddress: 'Plot 9, Gachibowli, Hyderabad', customerPhone: '+91 90000 00001',
      paymentMode: 'pay_after_service',
    }),
  ]);
  assert.equal(requests.filter((result) => result.status === 201).length, 1, JSON.stringify(requests));
  assert.equal(requests.filter((result) => result.status === 409 && result.data.error === 'SERVICE_SLOT_ALREADY_BOOKED').length, 1, JSON.stringify(requests));
});

dbTest('provider day off and blackout dates remove availability', async () => {
  const dayOff = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const dow = new Date(`${dayOff}T00:00:00Z`).getUTCDay();
  const workingDays = [0, 1, 2, 3, 4, 5, 6].filter((day) => day !== dow);
  const schedule = await request('PUT', '/api/services/provider/schedule', providerToken, {
    workingDays, dayStart: '09:00', dayEnd: '18:00', slotMinutes: 60, serviceAreas: ['Madhapur'],
  });
  assert.equal(schedule.status, 200);

  const empty = await request('GET', `/api/services/listings/${listingId}/availability?from=${dayOff}&to=${dayOff}`);
  assert.equal(empty.status, 200);
  assert.equal(empty.data.slots.length, 0);

  const blocked = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId,
    scheduledDate: dayOff,
    timeSlot: '10:00',
    serviceAddress: 'Flat 402, Madhapur, Hyderabad',
    customerPhone: '+91 90000 00000',
    paymentMode: 'pay_after_service',
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.error, 'SERVICE_DATE_UNAVAILABLE');

  const blackout = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
  const block = await request('POST', '/api/services/provider/blackouts', providerToken, { date: blackout, reason: 'Travel' });
  assert.equal(block.status, 201);

  await request('PUT', '/api/services/provider/schedule', providerToken, {
    workingDays: [0, 1, 2, 3, 4, 5, 6], dayStart: '09:00', dayEnd: '18:00', slotMinutes: 60, serviceAreas: ['Madhapur'],
  });
  const blackedAvailability = await request('GET', `/api/services/listings/${listingId}/availability?from=${blackout}&to=${blackout}`);
  assert.equal(blackedAvailability.data.slots.length, 0);
});

dbTest('customer pays by UPI only after a signed provider settlement', async () => {
  const created = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId,
    scheduledDate: new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10),
    timeSlot: '11:00',
    serviceAddress: 'Flat 402, Madhapur, Hyderabad',
    customerPhone: '+91 90000 00000',
    paymentMode: 'upi_intent',
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const bookingId = created.data.booking.id;
  assert.equal(created.data.booking.paymentStatus, 'due');

  const intent = await request('POST', `/api/services/bookings/${bookingId}/payment-intent`, customerToken, {
    idempotencyKey: `pay-${randomUUID()}`,
  });
  assert.equal(intent.status, 201, JSON.stringify(intent.data));
  assert.equal(Number(intent.data.amount), PRICE);
  assert.match(intent.data.upiUri, /^upi:\/\/pay\?/);
  assert.match(intent.data.upiUri, /am=1500\.00/);
  const intentId = intent.data.intentId;

  const unsigned = await fetch(`${serverUrl}/api/services/payments/sandbox/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: `evt-${randomUUID()}`, intentId, eventType: 'payment.captured', amountPaise: PRICE * 100, providerPaymentId: 'pay_unsigned' }),
  });
  assert.equal(unsigned.status, 401);

  const wrongAmount = await signedEvent({
    eventId: `evt-wrong-${randomUUID()}`, intentId, eventType: 'payment.captured', amountPaise: 1, providerPaymentId: 'pay_wrong',
  });
  assert.equal(wrongAmount.status, 400);

  const pending = await request('GET', `/api/services/payment-intents/${intentId}`, customerToken);
  assert.equal(pending.data.status, 'pending');

  const foreignRead = await request('GET', `/api/services/payment-intents/${intentId}`, otherToken);
  assert.equal(foreignRead.status, 404);

  const eventId = `evt-ok-${randomUUID()}`;
  const settled = await signedEvent({
    eventId, intentId, eventType: 'payment.captured', amountPaise: PRICE * 100, providerPaymentId: 'pay_lifecycle_ok',
  });
  assert.equal(settled.status, 200, JSON.stringify(settled.data));
  assert.equal(settled.data.verified, true);
  assert.equal(settled.data.bookingPaymentStatus, 'settled');

  const replay = await signedEvent({
    eventId, intentId, eventType: 'payment.captured', amountPaise: PRICE * 100, providerPaymentId: 'pay_lifecycle_ok',
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.replayed, true);

  const verified = await request('GET', `/api/services/payment-intents/${intentId}`, customerToken);
  assert.equal(verified.data.status, 'verified');
  assert.equal(verified.data.paid, true);

  const bookings = await request('GET', '/api/services/bookings', customerToken);
  const row = bookings.data.bookings.find((entry) => entry.id === bookingId);
  assert.equal(row.paymentStatus, 'settled');
});

dbTest('provider completes a paid job and earnings reflect settlement', async () => {
  const created = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId,
    scheduledDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    timeSlot: '12:00',
    serviceAddress: 'Flat 402, Madhapur, Hyderabad',
    customerPhone: '+91 90000 00000',
    paymentMode: 'upi_intent',
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const bookingId = created.data.booking.id;

  const intent = await request('POST', `/api/services/bookings/${bookingId}/payment-intent`, customerToken, { idempotencyKey: `pay-${randomUUID()}` });
  assert.equal(intent.status, 201);
  const settled = await signedEvent({
    eventId: `evt-${randomUUID()}`, intentId: intent.data.intentId, eventType: 'payment.captured',
    amountPaise: PRICE * 100, providerPaymentId: `pay_${randomUUID()}`,
  });
  assert.equal(settled.status, 200);

  for (const action of ['accept', 'start', 'complete']) {
    const step = await request('POST', `/api/services/bookings/${bookingId}/actions`, providerToken, { action });
    assert.equal(step.status, 200, `${action}: ${JSON.stringify(step.data)}`);
  }

  const earnings = await request('GET', '/api/services/earnings', providerToken);
  assert.equal(earnings.status, 200);
  assert.ok(earnings.data.earnings.settledAmount >= PRICE, JSON.stringify(earnings.data.earnings));

  const refundCompleted = await request('POST', `/api/services/bookings/${bookingId}/refund`, adminToken);
  assert.equal(refundCompleted.status, 409);
});

dbTest('admin refunds a verified payment and releases the slot', async () => {
  const date = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
  const created = await request('POST', '/api/services/bookings', customerToken, {
    idempotencyKey: randomUUID(),
    listingId,
    scheduledDate: date,
    timeSlot: '13:00',
    serviceAddress: 'Flat 402, Madhapur, Hyderabad',
    customerPhone: '+91 90000 00000',
    paymentMode: 'upi_intent',
  });
  assert.equal(created.status, 201);
  const bookingId = created.data.booking.id;
  const intent = await request('POST', `/api/services/bookings/${bookingId}/payment-intent`, customerToken, { idempotencyKey: `pay-${randomUUID()}` });
  assert.equal(intent.status, 201);
  await signedEvent({
    eventId: `evt-${randomUUID()}`, intentId: intent.data.intentId, eventType: 'payment.captured',
    amountPaise: PRICE * 100, providerPaymentId: `pay_${randomUUID()}`,
  });

  const customerRefund = await request('POST', `/api/services/bookings/${bookingId}/refund`, customerToken);
  assert.equal(customerRefund.status, 403);

  const refund = await request('POST', `/api/services/bookings/${bookingId}/refund`, adminToken);
  assert.equal(refund.status, 200, JSON.stringify(refund.data));
  assert.equal(refund.data.status, 'refunded');
  assert.equal(Number(refund.data.refundAmount), PRICE);

  const second = await request('POST', `/api/services/bookings/${bookingId}/refund`, adminToken);
  assert.equal(second.status, 409);

  const availability = await request('GET', `/api/services/listings/${listingId}/availability?from=${date}&to=${date}`);
  const slot = availability.data.slots.find((entry) => entry.slotKey === '13:00');
  assert.equal(slot.isBooked, false);
});

dbTest('bookings and settled state survive a server restart', async () => {
  const before = await request('GET', '/api/services/bookings', customerToken);
  const count = before.data.bookings.length;
  assert.ok(count > 0);

  await stopServer();
  await startServer(await freePort());

  const afterRestart = await request('GET', '/api/services/bookings', customerToken);
  assert.equal(afterRestart.status, 200);
  assert.equal(afterRestart.data.bookings.length, count);
  assert.ok(afterRestart.data.bookings.some((row) => row.paymentStatus === 'settled'));
  assert.ok(afterRestart.data.bookings.some((row) => row.paymentStatus === 'refunded'));

  const otherView = await request('GET', '/api/services/bookings', otherToken);
  assert.equal(otherView.status, 200);
  assert.ok(!otherView.data.bookings.some((row) => row.id === before.data.bookings[0].id));
});

dbTest('customer reviews a completed booking exactly once', async () => {
  const bookings = await request('GET', '/api/services/bookings', customerToken);
  const completed = bookings.data.bookings.find((row) => row.status === 'completed');
  assert.ok(completed, 'expected the completed booking from the previous test');

  const review = await request('POST', `/api/services/bookings/${completed.id}/review`, customerToken, {
    rating: 5, comment: 'Fixed the AC quickly and left the place clean.',
  });
  assert.equal(review.status, 201, JSON.stringify(review.data));
  assert.equal(review.data.review.rating, 5);

  const duplicate = await request('POST', `/api/services/bookings/${completed.id}/review`, customerToken, {
    rating: 4, comment: 'Second review attempt',
  });
  assert.equal(duplicate.status, 409);

  const foreign = await request('POST', `/api/services/bookings/${completed.id}/review`, otherToken, {
    rating: 5, comment: 'Not my booking',
  });
  assert.ok([403, 404].includes(foreign.status), `unexpected ${foreign.status}`);

  const publicReviews = await request('GET', `/api/services/listings/${listingId}/reviews`);
  assert.equal(publicReviews.status, 200, JSON.stringify(publicReviews.data));
  assert.ok(publicReviews.data.reviews.some((entry) => entry.rating === 5));
});

dbTest('browser: customer books, provider completes and records collection, Admin reconciles, customer cancels another job', async () => {
  const publicFeed = await request('GET', '/api/marketplace/listings');
  assert.equal(publicFeed.status, 200);
  assert.equal(publicFeed.data.source, 'postgresql');
  assert.ok(publicFeed.data.listings.some((row) => row.id === listingId && row.categoryId === 'cat-4'),
    'the browser fixture must be present in the real public PostgreSQL feed under a customer-supported service category');
  const providerSession = await request('GET', '/api/auth/me', providerToken);
  assert.equal(providerSession.status, 200, JSON.stringify(providerSession.data));
  assert.equal(providerSession.data.user?.role, 'provider', 'provider browser session should resolve from the database profile');

  const browser = await chromium.launch({ headless: true });
  const browserErrors = [];
  const openAs = async (authToken) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block',
    });
    await context.addInitScript((value) => {
      try {
        localStorage.setItem('bos_session_token_v1', value);
        localStorage.setItem('bos_entry_choice_v1', 'signed-in');
        localStorage.setItem('bos_privacy_consent_v1', JSON.stringify({ choice: 'essential', at: '2026-01-01T00:00:00.000Z' }));
        localStorage.setItem('bos_section_styles_v2', JSON.stringify({ pg: 'style3', stay: 'airbnb', services: 'old' }));
      } catch { /* storage unavailable */ }
    }, authToken);
    await context.route('**/*', async (route) => {
      try {
        if (new URL(route.request().url()).origin === serverUrl) await route.continue();
        else await route.abort('blockedbyclient');
      } catch { /* page closed during an in-flight request */ }
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      // The harness blocks external Supabase traffic; Vite's hosted Realtime
      // client reports the expected rejected socket as a page error. Keep
      // application/runtime errors visible while ignoring that transport-only
      // noise from this isolated, network-denied browser.
      if (error.message !== 'WebSocket closed without opened.') browserErrors.push(error.message);
    });
    await page.goto(`${serverUrl}/#services/old`, { waitUntil: 'domcontentloaded' });
    return { context, page };
  };
  const createBookingFromUi = async (page, daysAhead) => {
    const bookingDialog = page.locator('[aria-labelledby="service-booking-title"]');
    await bookingDialog.getByLabel('Service date').fill(targetDate(daysAhead));
    await bookingDialog.getByLabel('Service address').fill('Flat 402, Madhapur, Hyderabad');
    await bookingDialog.getByLabel('Contact phone').fill('+91 90000 00000');
    const slot = bookingDialog.getByLabel('Available time');
    await expect.poll(async () => slot.locator('option').count(), { timeout: 15_000 }).toBeGreaterThan(1);
    await expect(bookingDialog.getByRole('button', { name: 'Request booking' })).toBeEnabled();
    await bookingDialog.getByRole('button', { name: 'Request booking' }).click();
    await expect(bookingDialog).toContainText('Booking requested', { timeout: 15_000 });
    const reference = (await bookingDialog.innerText()).match(/Reference\s+([A-Z0-9-]+)/i)?.[1];
    assert.ok(reference, 'booking UI should display its server-issued reference');
    await bookingDialog.getByRole('button', { name: 'Done' }).click();
    return reference;
  };

  let customerContext;
  let providerContext;
  let adminContext;
  try {
    const customerBrowser = await openAs(customerToken);
    customerContext = customerBrowser.context;
    const customerPage = customerBrowser.page;
    // The Services experience renders inline under the shared marketplace
    // shell; its accessible landmark is the visible page heading, not a
    // standalone region/dialog wrapper.
    await expect(customerPage.getByRole('heading', { name: /Hire a professional for the job at hand/i })).toBeVisible();
    // Ask the real marketplace feed listener to refresh once the client tree is
    // mounted; this remains a real Express/PostgreSQL request, not a stub.
    await customerPage.evaluate(() => window.dispatchEvent(new Event('bos-marketplace-listings-updated')));
    await expect(customerPage.getByRole('button', { name: `View details for Lifecycle AC Repair` })).toBeVisible({ timeout: 30_000 });
    await customerPage.getByRole('button', { name: 'View details for Lifecycle AC Repair' }).click();
    const detail = customerPage.getByRole('dialog').filter({ has: customerPage.getByRole('heading', { name: 'Lifecycle AC Repair' }) });
    await expect(detail.getByRole('button', { name: 'Book this service' })).toBeVisible();
    await detail.getByRole('button', { name: 'Book this service' }).click();
    const completedRef = await createBookingFromUi(customerPage, 24);
    await detail.getByRole('button', { name: 'Book this service' }).click();
    const cancelledRef = await createBookingFromUi(customerPage, 25);

    const providerBrowser = await openAs(providerToken);
    providerContext = providerBrowser.context;
    const providerPage = providerBrowser.page;
    await expect(providerPage.getByRole('button', { name: 'My service jobs' })).toBeVisible({ timeout: 30_000 });
    await providerPage.getByRole('button', { name: 'My service jobs' }).click();
    const providerJob = providerPage.locator('article').filter({ hasText: completedRef });
    await expect(providerJob).toContainText('requested');
    await providerJob.getByRole('button', { name: 'Accept job' }).click();
    await providerJob.getByRole('button', { name: 'Start service' }).click();
    await providerJob.getByRole('button', { name: 'Mark completed' }).click();
    await expect(providerJob).toContainText('completed');
    await providerJob.getByPlaceholder('What was collected / proof note').fill('Local E2E collection record; no live money moved.');
    await providerJob.getByRole('button', { name: 'Submit for verification' }).click();
    await expect(providerJob).toContainText(/submitted|pending/i);

    const adminBrowser = await openAs(adminToken);
    adminContext = adminBrowser.context;
    const adminPage = adminBrowser.page;
    await expect(adminPage.getByRole('button', { name: 'Service oversight' })).toBeVisible({ timeout: 30_000 });
    await adminPage.getByRole('button', { name: 'Service oversight' }).click();
    const adminJob = adminPage.locator('section[aria-labelledby="jobs-title"] article').filter({ hasText: completedRef });
    await expect(adminJob).toContainText('completed');
    await expect(adminJob).toContainText(/payment pending review/i);
    const adminClaim = adminPage.locator('section[aria-labelledby="claims-title"] article').filter({ hasText: completedRef });
    await adminClaim.getByPlaceholder(/Verified against provider bank\/UPI statement/).fill('Local E2E manual reconciliation fixture; no live payment evidence.');
    await adminClaim.getByRole('button', { name: 'Approve settlement' }).click();
    await expect(adminJob).toContainText('settled');

    const allServices = detail.getByRole('button', { name: /^All services$/i });
    if (await allServices.isVisible().catch(() => false)) {
      await allServices.click();
    }
    await expect(detail).toBeHidden({ timeout: 15_000 });
    await expect(customerPage.getByRole('button', { name: 'My service bookings' })).toBeVisible({ timeout: 15_000 });
    await customerPage.getByRole('button', { name: 'My service bookings' }).click();
    const customerCompletedJob = customerPage.locator('article').filter({ hasText: completedRef });
    await expect(customerCompletedJob).toContainText('completed');
    await expect(customerCompletedJob).toContainText('settled');
    const customerCancelledJob = customerPage.locator('article').filter({ hasText: cancelledRef });
    await expect(customerCancelledJob.getByRole('button', { name: 'Cancel booking' })).toBeVisible();
    await customerCancelledJob.getByRole('button', { name: 'Cancel booking' }).click();
    await expect(customerCancelledJob).toContainText('cancelled');

    const persisted = await pool.query(
      `select b.status, b.payment_status from public.service_bookings b
        where b.booking_ref = any($1::text[]) order by b.booking_ref`,
      [[completedRef, cancelledRef]],
    );
    assert.equal(persisted.rows.length, 2);
    assert.ok(persisted.rows.some((row) => row.status === 'completed' && row.payment_status === 'settled'));
    assert.ok(persisted.rows.some((row) => row.status === 'cancelled'));
    assert.deepEqual(browserErrors, [], 'browser journey should not raise uncaught page errors');
  } finally {
    await customerContext?.close();
    await providerContext?.close();
    await adminContext?.close();
    await browser.close();
  }
});

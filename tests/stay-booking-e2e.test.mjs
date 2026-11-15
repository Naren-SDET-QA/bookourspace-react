import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import net from 'node:net';
import { after, before, test } from 'node:test';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.BOS_LISTINGS_DATABASE_URL;
const TEST_HMAC_SECRET = 'bos-local-postgres-stay-test-secret';
const owner = 'b2fbd2a1-2c1e-4d4e-9c0b-1a2b3c4d5e6f';
const customer = 'c3fee3b2-3d2f-4e5f-8d1c-2b3c4d5e6f70';
const otherCustomer = 'd4aab4c3-4e3f-5f6a-9e2d-3c4d5e6f7081';
const inactiveCustomer = 'e5bbc5d4-5f60-4a7b-8f3e-4d5e6f708192';
const admin = 'f6ccd6e5-6071-4b8c-9a4f-5e6f708192a3';

let pool;
let child;
let serverUrl;
let propertyId;
let roomTypeId;
let pendingListingId;
let pendingRoomTypeId;

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
    userId,
    supabaseUserId: authId,
    email,
    name: `${role} stay test`,
    phone: '+91 90000 00000',
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 10 * 60_000,
  })).toString('base64url');
  const signature = createHmac('sha256', `${TEST_HMAC_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

const customerToken = sessionToken({ authId: customer, role: 'customer', userId: 'USR-STAY-C', email: 'stay-customer@example.test' });
const otherToken = sessionToken({ authId: otherCustomer, role: 'customer', userId: 'USR-STAY-C2', email: 'stay-other@example.test' });
const ownerToken = sessionToken({ authId: owner, role: 'provider', userId: 'USR-STAY-O', email: 'stay-owner@example.test' });
const inactiveToken = sessionToken({ authId: inactiveCustomer, role: 'customer', userId: 'USR-STAY-INACTIVE', email: 'stay-inactive@example.test' });

async function request(method, url, token, body) {
  const response = await fetch(`${serverUrl}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
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
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const deadline = Date.now() + 25_000;
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
  for (const [id, email, name, role, status] of [
    [owner, 'stay-owner@example.test', 'Stay Owner', 'provider', 'active'],
    [customer, 'stay-customer@example.test', 'Stay Customer', 'customer', 'active'],
    [otherCustomer, 'stay-other@example.test', 'Other Customer', 'customer', 'active'],
    [inactiveCustomer, 'stay-inactive@example.test', 'Inactive Customer', 'customer', 'suspended'],
    [admin, 'stay-admin@example.test', 'Stay Admin', 'admin', 'active'],
  ]) {
    await pool.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, $2, jsonb_build_object('full_name', $3::text))
       on conflict (id) do nothing`,
      [id, email, name],
    );
    await pool.query(
      `insert into public.profiles (id, role, account_status, full_name, email, verified, is_super_admin)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set role = excluded.role, account_status = excluded.account_status,
         verified = excluded.verified, is_super_admin = excluded.is_super_admin`,
      [id, role, status, name, email, role === 'provider', id === admin],
    );
  }
  const listingId = `stay-listing-${randomUUID().slice(0, 8)}`;
  const pendingId = `stay-pending-${randomUUID().slice(0, 8)}`;
  await pool.query("update public.platform_module_flags set is_enabled = true, allow_online_booking = true where module_key = 'hotels'");
  const client = await pool.connect();
  let propertyIdLocal;
  let pendingPropertyId;
  try {
    await client.query('begin');
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [admin]);
    await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: admin, role: 'authenticated' })]);
    await client.query(
      `insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload, is_verified, verified_by, verified_at)
       values ($1, $2, 'E2E Stay Property', 'hotel_stay', 'Hotel', 'stay', 4500, '/night', 'active', '{"stayLifecycle":"approved","demo":false}'::jsonb, true, $3, now())
       on conflict (id) do nothing`,
      [listingId, owner, admin],
    );
    await client.query(
      `insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload, is_verified)
       values ($1, $2, 'Unapproved E2E Stay', 'hotel_stay', 'Hotel', 'stay', 4500, '/night', 'pending_approval', '{"stayLifecycle":"draft","demo":false}'::jsonb, false)
       on conflict (id) do nothing`,
      [pendingId, owner],
    );
    const property = await client.query(
    `insert into public.stay_properties (listing_id, owner_user_id, name, property_type, city, area, base_price_paise)
     values ($1, $2, 'E2E Stay Property', 'hotel', 'Hyderabad', 'Madhapur', 450000)
     returning id`,
      [listingId, owner],
    );
    propertyIdLocal = property.rows[0].id;
    const pendingProperty = await client.query(
      `insert into public.stay_properties (listing_id, owner_user_id, name, property_type, city, area, base_price_paise)
       values ($1, $2, 'Unapproved E2E Stay', 'hotel', 'Hyderabad', 'Madhapur', 450000)
       returning id`,
      [pendingId, owner],
    );
    pendingPropertyId = pendingProperty.rows[0].id;
    const roomType = await client.query(
    `insert into public.stay_room_types (property_id, name, max_adults, base_price_paise)
     values ($1, 'Deluxe Room', 2, 450000)
     returning id`,
      [propertyIdLocal],
    );
    roomTypeId = roomType.rows[0].id;
    const pendingRoom = await client.query(
      `insert into public.stay_room_types (property_id, name, max_adults, base_price_paise)
       values ($1, 'Pending Room', 2, 450000)
       returning id`,
      [pendingPropertyId],
    );
    await client.query('insert into public.stay_units (room_type_id, label) values ($1, $2)', [roomTypeId, 'A-101']);
    await client.query('insert into public.stay_units (room_type_id, label) values ($1, $2)', [pendingRoom.rows[0].id, 'P-101']);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  propertyId = propertyIdLocal;
  pendingListingId = pendingId;
  pendingRoomTypeId = (await pool.query(
    `select rt.id from public.stay_room_types rt join public.stay_properties p on p.id=rt.property_id where p.listing_id=$1`,
    [pendingId],
  )).rows[0].id;
  return listingId;
}

let listingId;

const databaseAvailable = Boolean(connectionString);
const dbTest = databaseAvailable ? test : test.skip;

before(async () => {
  if (!databaseAvailable) return;
  pool = new Pool({ connectionString });
  listingId = await seed();
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

dbTest('unauthenticated availability is reachable but holds require a session', async () => {
  const availability = await request('GET', `/api/stays/${listingId}/availability?checkIn=2026-12-01&checkOut=2026-12-03`);
  assert.equal(availability.status, 200);
  assert.equal(availability.data.ok, true);
  const hold = await request('POST', `/api/stays/${listingId}/holds`, null, { roomTypeId, checkIn: '2026-12-01', checkOut: '2026-12-03' });
  assert.equal(hold.status, 401);
});

dbTest('holds reject tampered identity, inactive accounts, providers and unapproved listings', async () => {
  const range = { checkIn: '2027-04-10', checkOut: '2027-04-12' };
  const [payload] = customerToken.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({
    ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    supabaseUserId: otherCustomer,
  })).toString('base64url');
  const tamperedToken = `${tamperedPayload}.${customerToken.split('.')[1]}`;

  const forged = await request('POST', `/api/stays/${listingId}/holds`, tamperedToken, { roomTypeId, ...range });
  assert.equal(forged.status, 401);

  const inactive = await request('POST', `/api/stays/${listingId}/holds`, inactiveToken, { roomTypeId, ...range });
  assert.equal(inactive.status, 403);
  assert.equal(inactive.data.error, 'ACTIVE_CUSTOMER_REQUIRED');

  const provider = await request('POST', `/api/stays/${listingId}/holds`, ownerToken, { roomTypeId, ...range });
  assert.equal(provider.status, 403);
  assert.equal(provider.data.error, 'ACTIVE_CUSTOMER_REQUIRED');

  const unapproved = await request('POST', `/api/stays/${pendingListingId}/holds`, customerToken, {
    roomTypeId: pendingRoomTypeId, ...range,
  });
  assert.equal(unapproved.status, 404);
  assert.equal(unapproved.data.error, 'ROOM_TYPE_NOT_FOUND');
});

dbTest('invalid dates and unknown room types fail closed', async () => {
  const badDates = await request('GET', `/api/stays/${listingId}/availability?checkIn=2026-12-05&checkOut=2026-12-01`);
  assert.equal(badDates.status, 400);
  const unknownRoom = await request('POST', `/api/stays/${listingId}/holds`, customerToken, { roomTypeId: randomUUID(), checkIn: '2026-12-01', checkOut: '2026-12-03' });
  assert.equal(unknownRoom.status, 404);
});

dbTest('hold → confirm → my bookings → cancel refund quote', async () => {
  const availability = await request('GET', `/api/stays/${listingId}/availability?checkIn=2027-01-10&checkOut=2027-01-12`);
  assert.equal(availability.status, 200);
  assert.equal(availability.data.roomTypes[0].availableUnits, 1);

  const hold = await request('POST', `/api/stays/${listingId}/holds`, customerToken, { roomTypeId, checkIn: '2027-01-10', checkOut: '2027-01-12' });
  assert.equal(hold.status, 201);
  const token = hold.data.holds[0].holdToken;
  assert.ok(token);

  const afterHold = await request('GET', `/api/stays/${listingId}/availability?checkIn=2027-01-10&checkOut=2027-01-12`);
  assert.equal(afterHold.status, 200, JSON.stringify(afterHold.data));
  assert.equal(afterHold.data.roomTypes[0].availableUnits, 0);

  // An unpaid booking must never consume inventory.
  const unpaidBookingId = `unpaid-${randomUUID().slice(0, 8)}`;    await pool.query(
      `insert into public.bookings
         (id, user_id, listing_id, listing_title, provider_id, customer_name,
          customer_phone, scheduled_date, scheduled_time, amount, status,
          payment_status, payment_mode)
       values ($1, $2, $3, 'E2E Stay Property', $4, 'Stay Customer',
               '+919000000000', '2027-01-10', 'nightly', 9000, 'pending',
               'pay_later', 'pay_after_service')`,
      [unpaidBookingId, customer, listingId, owner],
    );
  const unpaid = await request('POST', `/api/stays/holds/${token}/confirm`, customerToken, { bookingId: unpaidBookingId });
  assert.equal(unpaid.status, 409);
  assert.equal(unpaid.data.error, 'PAYMENT_NOT_VERIFIED');

  // The server-verified payment is represented by a booking row the payment
  // webhook has already marked verified.
  const paidBookingId = `paid-${randomUUID().slice(0, 8)}`;    await pool.query(
      `insert into public.bookings
         (id, user_id, listing_id, listing_title, provider_id, customer_name,
          customer_phone, scheduled_date, scheduled_time, amount, status,
          payment_status, payment_mode, total_paise)
       values ($1, $2, $3, 'E2E Stay Property', $4, 'Stay Customer',
               '+919000000000', '2027-01-10', 'nightly', 9000, 'confirmed',
               'verified', 'upi', 900000)`,
      [paidBookingId, customer, listingId, owner],
    );
  const confirm = await request('POST', `/api/stays/holds/${token}/confirm`, customerToken, { bookingId: paidBookingId });
  assert.equal(confirm.status, 201);
  assert.equal(confirm.data.bookingId, paidBookingId);
  const bookingId = confirm.data.bookingId;

  const replay = await request('POST', `/api/stays/holds/${token}/confirm`, customerToken, { bookingId: paidBookingId });
  assert.ok([200, 409].includes(replay.status), `unexpected replay status ${replay.status}`);

  const mine = await request('GET', '/api/stays/bookings', customerToken);
  assert.equal(mine.status, 200);
  assert.ok(mine.data.bookings.some((b) => b.bookingId === bookingId && b.status === 'confirmed'));

  const otherCancel = await request('POST', `/api/stays/bookings/${bookingId}/cancel`, otherToken, {});
  assert.equal(otherCancel.status, 403);

  const cancel = await request('POST', `/api/stays/bookings/${bookingId}/cancel`, customerToken, {});
  assert.equal(cancel.status, 200);
  assert.equal(cancel.data.released, true);
  assert.equal(cancel.data.refundPolicy, 'FULL_REFUND_MODERATE');
  assert.equal(typeof cancel.data.refundPaise, 'number');

  const afterCancel = await request('GET', `/api/stays/${listingId}/availability?checkIn=2027-01-10&checkOut=2027-01-12`);
  assert.equal(afterCancel.data.roomTypes[0].availableUnits, 1);
});

dbTest('concurrent holds never double-book the last unit', async () => {
  const range = { checkIn: '2027-02-10', checkOut: '2027-02-12' };
  const [a, b] = await Promise.all([
    request('POST', `/api/stays/${listingId}/holds`, customerToken, { roomTypeId, ...range }),
    request('POST', `/api/stays/${listingId}/holds`, otherToken, { roomTypeId, ...range }),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 409], `expected one hold and one conflict, got ${statuses.join(',')}`);
  const winner = a.status === 201 ? a : b;
  const token = winner.data.holds[0].holdToken;
  await request('POST', `/api/stays/holds/${token}/release`, a.status === 201 ? customerToken : otherToken, {});
});

dbTest('a released hold frees the unit for the next guest', async () => {
  const range = { checkIn: '2027-03-10', checkOut: '2027-03-12' };
  const hold = await request('POST', `/api/stays/${listingId}/holds`, customerToken, { roomTypeId, ...range });
  assert.equal(hold.status, 201);
  const token = hold.data.holds[0].holdToken;
  const release = await request('POST', `/api/stays/holds/${token}/release`, customerToken, {});
  assert.equal(release.status, 200);
  const next = await request('POST', `/api/stays/${listingId}/holds`, otherToken, { roomTypeId, ...range });
  assert.equal(next.status, 201);
  await request('POST', `/api/stays/holds/${next.data.holds[0].holdToken}/release`, otherToken, {});
});

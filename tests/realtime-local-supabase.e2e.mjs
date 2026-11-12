import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import net from 'node:net';
import { after, before, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

/**
 * Real local Supabase Realtime audit.
 *
 * Requires a running local Supabase stack with this repository's migrations:
 *   BOS_SUPABASE_URL, BOS_SUPABASE_ANON_KEY, BOS_SUPABASE_SERVICE_ROLE_KEY,
 *   BOS_SUPABASE_DB_URL
 *
 * It creates real Supabase Auth users, real RLS-scoped bookings, real WebSocket
 * subscriptions and real GPS rows. No hosted project is touched.
 */

const { Pool } = pg;
const SUPABASE_URL = String(process.env.BOS_SUPABASE_URL || '').trim();
const ANON_KEY = String(process.env.BOS_SUPABASE_ANON_KEY || '').trim();
const SERVICE_KEY = String(process.env.BOS_SUPABASE_SERVICE_ROLE_KEY || '').trim();
const DB_URL = String(process.env.BOS_SUPABASE_DB_URL || '').trim();
const SECRET = 'bos-local-realtime-e2e-secret';
const available = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY && DB_URL);
const dbTest = (name, fn) => test(name, { skip: !available }, fn);

const runId = Date.now().toString(36);
const ids = {
  customerA: randomUUID(),
  customerB: randomUUID(),
  providerA: randomUUID(),
  providerB: randomUUID(),
  superAdmin: randomUUID(),
  admin: randomUUID(),
};
const emails = Object.fromEntries(
  Object.keys(ids).map((key) => [key, `rt-${key}-${runId}@example.test`]),
);
const passwords = Object.fromEntries(Object.keys(ids).map((key) => [key, `Rt-${runId}-${key}-Pass!`]));
const tokens = {};
const customCategoryId = `audit_custom_${runId}`;

let pool;
let child;
let serverUrl;
let adminSupabase;
let authUsers = {};
const bookings = {};

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

function token(userId, role, email) {
  const payload = Buffer.from(JSON.stringify({
    userId: `USR-RT-${role}-${userId.slice(0, 4)}`,
    supabaseUserId: userId,
    email,
    name: `${role} realtime audit`,
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 30 * 60_000,
  })).toString('base64url');
  const signature = createHmac('sha256', `${SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

async function request(method, path, authToken, body) {
  const response = await fetch(`${serverUrl}${path}`, {
    method,
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function futureDate(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
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
      DISABLE_HMR: 'true',
      BOS_SERVER_HMAC_SECRET: SECRET,
      BOS_LISTINGS_DATABASE_URL: DB_URL,
      BOS_SERVICE_TENANT_ID: 'default',
      BOS_LOCAL_DEV_AUTH: '1',
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_PROJECT_ID: 'local',
      VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: 'local',
      VITE_SUPABASE_PUBLISHABLE_KEY: ANON_KEY,
      SUPABASE_SECRET_KEY: SERVICE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk.toString()}`.slice(-5000); });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}): ${stderr}`);
    try {
      const response = await fetch(`${serverUrl}/api/auth/me`);
      if (response.status === 401) return;
    } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`server did not become ready: ${stderr}`);
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

async function ensureAuthUser(key) {
  const email = emails[key];
  const password = passwords[key];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `RT ${key}` },
    });
    if (!error && data?.user) return data.user;
    if (error && !/already|registered|exists/i.test(error.message)) throw error;
    const listed = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = listed.data?.users?.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (existing) return existing;
  }
  throw new Error(`could not create or find auth user ${email}`);
}

async function signIn(key) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email: emails[key], password: passwords[key] });
  if (error || !data.session) throw error || new Error(`sign-in failed for ${key}`);
  return client;
}

function waitForSubscribed(channel, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('REALTIME_SUBSCRIBE_TIMEOUT')), timeoutMs);
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve(status);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(error || new Error(`REALTIME_${status}`));
      }
    });
  });
}

function subscribeToLocations(client, bookingId, label) {
  const events = [];
  const channel = client.channel(`rt-audit-${label}-${randomUUID()}`);
  channel.on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'service_tracking_locations',
    filter: `booking_id=eq.${bookingId}`,
  }, (payload) => events.push(payload.new));
  return { channel, events };
}

async function waitForEvent(events, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (events.length) return events[0];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('REALTIME_EVENT_TIMEOUT');
}

async function warmRealtime() {
  const client = await signIn('customerA');
  const channel = client.channel(`rt-warmup-${randomUUID()}`);
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_tracking_locations' }, () => {});
  await waitForSubscribed(channel, 20_000);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  await client.removeChannel(channel);
  await client.removeAllChannels();
}

async function publishGps(providerClient, providerId, bookingId, lat, lng, capturedAt = new Date().toISOString()) {
  const { data, error } = await providerClient.from('service_tracking_locations').insert({
    booking_id: bookingId,
    actor_id: providerId,
    actor_role: 'helper',
    latitude: lat,
    longitude: lng,
    accuracy_meters: 6,
    captured_at: capturedAt,
    source: 'device_gps',
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data;
}

before(async () => {
  if (!available) return;
  pool = new Pool({ connectionString: DB_URL });
  adminSupabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  for (const key of Object.keys(ids)) {
    const user = await ensureAuthUser(key);
    authUsers[key] = user;
    ids[key] = user.id;
  }
  for (const key of ['customerA', 'customerB', 'providerA', 'providerB', 'superAdmin', 'admin']) {
    const role = key.startsWith('customer') ? 'customer' : key.startsWith('provider') ? 'provider' : 'admin';
    await pool.query(
      `insert into public.profiles (id, role, account_status, full_name, email, is_super_admin)
       values ($1, $2, 'active', $3, $4, $5)
       on conflict (id) do update
         set role = excluded.role, account_status = 'active', full_name = excluded.full_name,
             email = excluded.email, is_super_admin = excluded.is_super_admin`,
      [ids[key], role, `RT ${key}`, emails[key], key === 'superAdmin'],
    );
    tokens[key] = token(ids[key], role, emails[key]);
  }

  await pool.query('delete from public.service_bookings where customer_id = any($1::uuid[])', [[ids.customerA, ids.customerB]]);
  await pool.query('delete from public.listings where id like $1', [`rt-audit-${runId}-%`]);
  await pool.query('delete from public.service_category_configs where id = $1', [customCategoryId]);

  const listings = [
    ['groceries_delivery', 'RT Groceries'],
    ['human_help', 'RT Human Help'],
    ['medicine_delivery', 'RT Medicine'],
    ['water_delivery', 'RT Water'],
    [customCategoryId, 'RT Custom Service'],
  ];
  for (const [categoryId, title] of listings) {
    const listingId = `rt-audit-${runId}-${categoryId}`;
    await pool.query(
      `insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
       values ($1, $2, $3, $4, $5, 'service', 100, 'per order', 'active', '{"sectionType":"services"}'::jsonb)`,
      [listingId, ids.providerA, title, categoryId, title],
    );
  }
  await pool.query(
    `insert into public.service_provider_credentials
      (tenant_id, provider_id, category_id, credential_type, license_number, issuing_authority,
       expires_on, status, reviewed_by, reviewed_at, review_note)
     values ('default', $1, 'medicine_delivery', 'pharmacy_license', $2, 'Local audit authority',
             current_date + 365, 'verified', $3, now(), 'Local realtime audit fixture')`,
    [ids.providerA, `RT-LIC-${runId}`, ids.superAdmin],
  );

  await startServer();
  await warmRealtime();

  // Create the custom category through the real Super Admin API.
  const customConfig = {
    schemaVersion: 1,
    name: 'Audit Custom Service',
    description: 'Local realtime audit custom category',
    icon: 'sparkles',
    imageUrl: '',
    accentColor: '#7C3AED',
    deliveryKind: 'human_help',
    bookingType: 'scheduled',
    providerAssignment: 'customer_selects',
    deliveryModes: ['on_site'],
    pricing: { mode: 'fixed', amount: 75, currency: 'INR', unit: 'per task', quantityEnabled: true, minQuantity: 1, maxQuantity: 3 },
    recurring: { enabled: false, frequencies: ['weekly'], defaultFrequency: 'weekly', maxOccurrences: 4 },
    toggles: { gpsTracking: true, liveMap: true, customerOtp: true, prescriptionVerification: false, documentVerification: false, payment: true, deliveryConfirmation: true },
    fields: [{ key: 'task', label: 'Task', type: 'text', required: true, maxLength: 120 }],
    documents: [],
    approvalWorkflow: { requiresProviderAcceptance: true, requiresDocumentVerification: false, requiresAdminApproval: false },
    validation: { minLeadTimeMinutes: 0, maxAdvanceDays: 30, requiresServiceAddress: true, requiresPhone: true, notesRequired: false },
    legacyCategoryIds: [],
    requiresLicensedPharmacy: false,
  };
  const draft = await request('POST', `/api/admin/service-catalog/${customCategoryId}/draft`, tokens.superAdmin, {
    config: customConfig, summary: 'Realtime audit custom category', expectedVersion: null,
  });
  assert.equal(draft.status, 200, JSON.stringify(draft.data));
  const publish = await request('POST', `/api/admin/service-catalog/${customCategoryId}/publish`, tokens.superAdmin, {
    versionId: draft.data.version.versionId,
  });
  assert.equal(publish.status, 200, JSON.stringify(publish.data));

  const plans = [
    ['groceries_delivery', 3, '09:00', { quantity: 2, recurrence: { frequency: 'weekly', occurrences: 3 }, deliveryMode: 'home_delivery', fieldValues: { basketSize: 'Small (up to 10 items)', substitutions: 'Allow similar substitutions' } }],
    ['human_help', 4, '10:00', { quantity: 1, fieldValues: { taskType: 'Errand', taskDetails: 'Realtime audit' } }],
    ['medicine_delivery', 5, '11:00', { quantity: 1, fieldValues: { deliveryPreference: 'Home delivery' }, documents: [{ key: 'prescription', reference: `storage://bos-private-documents/${ids.customerA}/audit/prescription.pdf`, mimeType: 'application/pdf' }] }],
    ['water_delivery', 6, '12:00', { quantity: 3, recurrence: { frequency: 'weekly', occurrences: 4 }, fieldValues: { bottleSize: '20L can' } }],
    [customCategoryId, 7, '13:00', { quantity: 1, fieldValues: { task: 'Realtime custom task' } }],
  ];
  for (const [categoryId, days, slot, extra] of plans) {
    const created = await request('POST', '/api/services/bookings', tokens.customerA, {
      idempotencyKey: randomUUID(),
      listingId: `rt-audit-${runId}-${categoryId}`,
      categoryConfigId: categoryId,
      scheduledDate: futureDate(days),
      timeSlot: slot,
      serviceAddress: 'Flat 1, Local Supabase Audit, Hyderabad',
      customerPhone: '+91 90000 00123',
      paymentMode: 'pay_after_service',
      ...extra,
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const bookingId = created.data.booking.id;
    assert.equal((await request('POST', `/api/services/bookings/${bookingId}/actions`, tokens.providerA, { action: 'accept' })).status, 200);
    assert.equal((await request('POST', `/api/services/bookings/${bookingId}/actions`, tokens.providerA, { action: 'start' })).status, 200);
    bookings[categoryId] = created.data.booking;
  }
});

after(async () => {
  if (!available) return;
  await stopServer();
  await pool?.end();
});

dbTest('real WebSocket subscriptions receive GPS for Groceries, Human Help, Medicine, Water and custom services', async () => {
  const customer = await signIn('customerA');
  const provider = await signIn('providerA');
  try {
    const cases = [
      ['groceries_delivery', 17.4485, 78.3748],
      ['human_help', 17.4486, 78.3749],
      ['medicine_delivery', 17.4487, 78.3750],
      ['water_delivery', 17.4488, 78.3751],
      [customCategoryId, 17.4489, 78.3752],
    ];
    for (const [categoryId, lat, lng] of cases) {
      const booking = bookings[categoryId];
      assert.ok(booking, `missing booking for ${categoryId}`);
      const { channel, events } = subscribeToLocations(customer, booking.id, categoryId);
      await waitForSubscribed(channel, 15_000);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await publishGps(provider, ids.providerA, booking.id, lat, lng);
      const event = await waitForEvent(events, 15_000);
      assert.equal(String(event.booking_id), booking.id);
      assert.equal(Number(event.latitude).toFixed(4), lat.toFixed(4));
      assert.equal(Number(event.longitude).toFixed(4), lng.toFixed(4));
      assert.equal(event.source, 'device_gps');
      await customer.removeChannel(channel);
    }
  } finally {
    await customer.removeAllChannels();
    await provider.removeAllChannels();
  }
});

dbTest('booking-specific authorization blocks other customers from reading and publishing', async () => {
  const provider = await signIn('providerA');
  const otherProvider = await signIn('providerB');
  const otherCustomer = await signIn('customerB');
  const booking = bookings.groceries_delivery;
  try {
    const otherProviderRead = await otherProvider.from('service_tracking_locations').select('id').eq('booking_id', booking.id);
    assert.equal(otherProviderRead.error, null, otherProviderRead.error?.message);
    assert.equal(otherProviderRead.data.length, 0);
    const otherProviderInsert = await otherProvider.from('service_tracking_locations').insert({
      booking_id: booking.id,
      actor_id: ids.providerB,
      actor_role: 'helper',
      latitude: 17.43,
      longitude: 78.36,
      accuracy_meters: 5,
      captured_at: new Date().toISOString(),
      source: 'device_gps',
    }).select('id');
    assert.ok(otherProviderInsert.error, 'an unassigned provider must not publish GPS');

    const otherRead = await otherCustomer.from('service_tracking_locations').select('id').eq('booking_id', booking.id);
    assert.equal(otherRead.error, null, otherRead.error?.message);
    assert.equal(otherRead.data.length, 0);

    const otherInsert = await otherCustomer.from('service_tracking_locations').insert({
      booking_id: booking.id,
      actor_id: ids.customerB,
      actor_role: 'helper',
      latitude: 17.44,
      longitude: 78.37,
      accuracy_meters: 5,
      captured_at: new Date().toISOString(),
      source: 'device_gps',
    }).select('id');
    assert.ok(otherInsert.error, 'an unrelated customer must not publish GPS');

    const events = [];
    const channel = otherCustomer.channel(`rt-unauthorized-${randomUUID()}`);
    channel.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'service_tracking_locations', filter: `booking_id=eq.${booking.id}`,
    }, (payload) => events.push(payload.new));
    await waitForSubscribed(channel);
    await publishGps(provider, ids.providerA, booking.id, 17.4490, 78.3753, new Date(Date.now() + 6_000).toISOString());
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    assert.equal(events.length, 0, 'Realtime must not leak another booking party’s GPS');
    await otherCustomer.removeChannel(channel);
  } finally {
    await provider.removeAllChannels();
    await otherProvider.removeAllChannels();
    await otherCustomer.removeAllChannels();
  }
});

dbTest('Realtime reconnects and resumes the booking-scoped subscription', async () => {
  const customer = await signIn('customerA');
  const provider = await signIn('providerA');
  const booking = bookings.human_help;
  try {
    const first = subscribeToLocations(customer, booking.id, 'reconnect-first');
    await waitForSubscribed(first.channel);
    await publishGps(provider, ids.providerA, booking.id, 17.4491, 78.3754, new Date(Date.now() + 6_000).toISOString());
    await waitForEvent(first.events, 10_000);
    await customer.removeChannel(first.channel);

    customer.realtime.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    customer.realtime.connect();
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const second = subscribeToLocations(customer, booking.id, 'reconnect-second');
    await waitForSubscribed(second.channel);
    await publishGps(provider, ids.providerA, booking.id, 17.4492, 78.3755, new Date(Date.now() + 12_000).toISOString());
    const event = await waitForEvent(second.events, 15_000);
    assert.equal(Number(event.latitude).toFixed(4), '17.4492');
    await customer.removeChannel(second.channel);
  } finally {
    await customer.removeAllChannels();
    await provider.removeAllChannels();
  }
});

dbTest('OTP is prescription-gated, single-use and never stored in plaintext', async () => {
  const booking = bookings.medicine_delivery;
  const beforeVerify = await request('POST', `/api/services/bookings/${booking.id}/otp`, tokens.customerA, {});
  assert.equal(beforeVerify.status, 409);
  assert.equal(beforeVerify.data.error, 'PRESCRIPTION_NOT_VERIFIED');

  const queue = await request('GET', '/api/admin/service-catalog/verifications', tokens.admin);
  const document = queue.data.documents.find((entry) => entry.bookingId === booking.id);
  assert.ok(document, JSON.stringify(queue.data.documents));
  const verified = await request('POST', `/api/admin/service-catalog/documents/${document.id}/decision`, tokens.admin, {
    status: 'verified', note: 'Local realtime audit prescription review.',
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.data));

  const otp = await request('POST', `/api/services/bookings/${booking.id}/otp`, tokens.customerA, {});
  assert.equal(otp.status, 201, JSON.stringify(otp.data));
  assert.match(otp.data.code, /^\d{6}$/);
  const stored = await pool.query('select code_hash from public.service_delivery_otps where booking_id = $1', [booking.id]);
  assert.equal(stored.rows[0].code_hash.length, 64);
  assert.notEqual(stored.rows[0].code_hash, otp.data.code);

  const wrong = await request('POST', `/api/services/bookings/${booking.id}/verify-otp`, tokens.providerA, { code: '000000' });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.data.verified, false);
  const correct = await request('POST', `/api/services/bookings/${booking.id}/verify-otp`, tokens.providerA, { code: otp.data.code });
  assert.equal(correct.status, 200);
  assert.equal(correct.data.verified, true);
  const reuse = await request('POST', `/api/services/bookings/${booking.id}/verify-otp`, tokens.providerA, { code: otp.data.code });
  assert.equal(reuse.status, 409);
  assert.equal(reuse.data.error, 'OTP_ALREADY_USED');
});

dbTest('OTP wrong attempts are capped and cannot be bypassed by the correct code', async () => {
  const booking = bookings.human_help;
  const otp = await request('POST', `/api/services/bookings/${booking.id}/otp`, tokens.customerA, {});
  assert.equal(otp.status, 201, JSON.stringify(otp.data));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const wrong = await request('POST', `/api/services/bookings/${booking.id}/verify-otp`, tokens.providerA, {
      code: String(100000 + attempt),
    });
    assert.equal(wrong.status, 200);
    assert.equal(wrong.data.verified, false);
  }
  const correctAfterCap = await request('POST', `/api/services/bookings/${booking.id}/verify-otp`, tokens.providerA, {
    code: otp.data.code,
  });
  assert.equal(correctAfterCap.status, 409);
  assert.equal(correctAfterCap.data.error, 'OTP_ATTEMPTS_EXCEEDED');
  const stored = await pool.query('select attempts, max_attempts from public.service_delivery_otps where booking_id = $1', [booking.id]);
  assert.equal(Number(stored.rows[0].attempts), Number(stored.rows[0].max_attempts));
});

dbTest('recurring booking persists through the tracking profile and booking API', async () => {
  const booking = bookings.groceries_delivery;
  const stored = await pool.query(
    `select b.recurrence_frequency, b.recurrence_occurrences, p.recurrence_rule
       from public.service_bookings b
       join public.service_delivery_profiles p on p.booking_id = b.id
      where b.id = $1`,
    [booking.id],
  );
  assert.equal(stored.rows[0].recurrence_frequency, 'weekly');
  assert.equal(Number(stored.rows[0].recurrence_occurrences), 3);
  assert.equal(stored.rows[0].recurrence_rule, 'weekly');
});

dbTest('document upload is private to its owner and denied to other customers and anonymous readers', async () => {
  const customerA = await signIn('customerA');
  const customerB = await signIn('customerB');
  const superAdmin = await signIn('superAdmin');
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const path = `${ids.customerA}/audit/${runId}-prescription.pdf`;
  const bucket = 'bos-private-documents';
  try {
    const upload = await customerA.storage.from(bucket).upload(path, Buffer.from('%PDF-1.4 local audit'), {
      contentType: 'application/pdf', upsert: false,
    });
    assert.equal(upload.error, null, upload.error?.message);

    const ownerRead = await customerA.storage.from(bucket).download(path);
    assert.equal(ownerRead.error, null, ownerRead.error?.message);

    const otherRead = await customerB.storage.from(bucket).download(path);
    assert.ok(otherRead.error, 'another customer must not read the private document');

    const anonRead = await anon.storage.from(bucket).download(path);
    assert.ok(anonRead.error, 'anonymous readers must not read the private document');

    const adminRead = await superAdmin.storage.from(bucket).download(path);
    assert.equal(adminRead.error, null, adminRead.error?.message);

    const metadata = await customerA.from('media_assets').insert({
      id: randomUUID(),
      owner_id: ids.customerA,
      module_key: 'services',
      parent_type: 'booking_document',
      bucket_id: bucket,
      object_path: path,
      media_kind: 'image',
      media_format: 'jpeg',
      privacy: 'private',
      file_size_bytes: 19,
      processing_status: 'quarantined',
      display_order: 0,
    }).select('id').single();
    assert.equal(metadata.error, null, metadata.error?.message);

    const foreignMetadata = await customerB.from('media_assets').insert({
      id: randomUUID(),
      owner_id: ids.customerB,
      module_key: 'services',
      parent_type: 'booking_document',
      bucket_id: bucket,
      object_path: `${ids.customerA}/audit/foreign.pdf`,
      media_kind: 'image',
      media_format: 'jpeg',
      privacy: 'private',
      file_size_bytes: 19,
      processing_status: 'quarantined',
      display_order: 0,
    }).select('id').single();
    assert.ok(foreignMetadata.error, 'a customer must not register metadata under another customer path');
  } finally {
    await customerA.removeAllChannels();
    await customerB.removeAllChannels();
    await superAdmin.removeAllChannels();
  }
});

#!/usr/bin/env node
/**
 * Isolated Express GPS API load harness.
 *
 * Hits the real registerServiceBookingApi GPS write/read routes through a
 * loopback-only slim Express process and a cloned local Postgres database.
 * Never talks to supabase.co, :3010, or Mumbai.
 *
 *   BOS_GPS_API_LOAD_TEST=1 npx tsx scripts/gps-api-load-test.mjs --self-test
 *   BOS_GPS_API_LOAD_TEST=1 npx tsx scripts/gps-api-load-test.mjs --devices=100
 *   BOS_GPS_API_LOAD_TEST=1 npx tsx scripts/gps-api-load-test.mjs --suite
 */
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Pool } from 'pg';
import {
  estimateGpsInfrastructureCost,
  estimateGpsLoad,
  GPS_UPDATE_INTERVAL_SECONDS,
} from '../src/lib/gpsCapacity.ts';
import { TRACKING_UPDATE_INTERVAL_MS } from '../src/lib/deliveryTracking.ts';
import { getSharedPostgresPoolStats, resolvePostgresPoolMax } from '../src/server/postgresPool.ts';
import { ServiceBookingRepository } from '../src/server/serviceBookingRepository.ts';
import { registerServiceBookingApi } from '../src/server/serviceBookingApi.ts';
import { registerTrackingShareApi } from '../src/server/trackingShareApi.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PORT = String(process.env.BOS_GPS_API_LOAD_SOURCE_PORT || '55440');
const SOURCE_DB = process.env.BOS_GPS_API_LOAD_SOURCE_DB || 'bookourspace_dev';
const CLONE_DB = process.env.BOS_GPS_API_LOAD_CLONE_DB || 'bos_gps_api_load';
const HMAC_SECRET = 'gps-api-load-test-hmac-secret-32b!!';
const TICKS = Number(process.env.BOS_GPS_API_LOAD_TICKS || 3);
const INTERVAL_MS = 10_000;
const LISTING_PREFIX = 'gps-api-load-';

const args = new Map();
for (const part of process.argv.slice(2)) {
  const [key, value = 'true'] = part.replace(/^--/, '').split('=');
  args.set(key, value);
}

const whatsappGraphCalls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes('graph.facebook.com')) {
    whatsappGraphCalls.push({
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      at: Date.now(),
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: `wamid.mock.${whatsappGraphCalls.length}` }] }),
      text: async () => '{}',
    };
  }
  return originalFetch(input, init);
};

function percentile(samples, p) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(3));
}

function refuseHosted(url) {
  if (/supabase\.co|pooler\.supabase/i.test(url)) {
    throw new Error('Refusing a Supabase-hosted origin');
  }
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error('GPS API load test must use loopback Postgres');
  }
}

function sh(bin, argv, opts = {}) {
  const result = spawnSync(bin, argv, { encoding: 'utf8', ...opts });
  if (result.status !== 0) {
    throw new Error(`${bin} ${argv.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function portOpen(port) {
  const result = spawnSync('nc', ['-z', '127.0.0.1', String(port)], { encoding: 'utf8' });
  return result.status === 0;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function signToken({ id, role, email, name }) {
  const payload = Buffer.from(JSON.stringify({
    userId: `USR-${role}-${id.slice(0, 8)}`,
    supabaseUserId: id,
    email,
    name,
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60 * 60_000,
  })).toString('base64url');
  const signature = createHmac('sha256', `${HMAC_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifySession(request) {
  const raw = (
    String(request.headers['x-bos-session-token'] || '')
    || String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  ).trim();
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = createHmac('sha256', `${HMAC_SECRET}:SESSION_TOKEN_V2`).update(payloadB64).digest('hex');
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!parsed?.supabaseUserId || !['customer', 'provider', 'admin'].includes(parsed.role)) return null;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) return null;
    return {
      userId: parsed.userId,
      supabaseUserId: parsed.supabaseUserId,
      email: parsed.email,
      name: parsed.name,
      role: parsed.role,
      authProvider: parsed.authProvider,
    };
  } catch {
    return null;
  }
}

function samplePostgresCpu(pids) {
  if (!pids.length) return { maxPct: 0, samples: [] };
  const result = spawnSync('ps', ['-o', 'pid=,pcpu=', '-p', pids.join(',')], { encoding: 'utf8' });
  const samples = String(result.stdout || '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [pid, cpu] = line.trim().split(/\s+/);
      return { pid: Number(pid), cpuPct: Number(cpu) };
    });
  return {
    maxPct: samples.reduce((max, row) => Math.max(max, row.cpuPct || 0), 0),
    samples,
  };
}

async function jsonRequest(baseUrl, method, route, token, body) {
  const started = performance.now();
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, ms: performance.now() - started };
}

function syntheticPoint(index, tick) {
  return {
    consentGranted: true,
    latitude: 17.4401 + (index * 0.00002) + (tick * 0.000001),
    longitude: 78.3489 + (index * 0.00002),
    accuracyMeters: 8,
    speedMps: 6.1,
    capturedAt: new Date().toISOString(),
  };
}

function ensureCloneDatabase() {
  const sourceUrl = `postgres://postgres@127.0.0.1:${SOURCE_PORT}/${SOURCE_DB}?sslmode=disable`;
  const cloneUrl = `postgres://postgres@127.0.0.1:${SOURCE_PORT}/${CLONE_DB}?sslmode=disable`;
  refuseHosted(sourceUrl);
  refuseHosted(cloneUrl);
  const sourceOk = sh('psql', ['-h', '127.0.0.1', '-p', SOURCE_PORT, '-U', 'postgres', '-d', SOURCE_DB, '-tAc', 'select current_database()']).trim();
  if (sourceOk !== SOURCE_DB) throw new Error(`Source database ${SOURCE_DB} is not reachable on loopback:${SOURCE_PORT}`);
  const exists = sh('psql', ['-h', '127.0.0.1', '-p', SOURCE_PORT, '-U', 'postgres', '-d', 'postgres', '-tAc', `select 1 from pg_database where datname='${CLONE_DB}'`]).trim();
  if (exists !== '1') {
    const dumpPath = `/tmp/${CLONE_DB}.dump`;
    console.error(`[gps-api-load] dumping schema+data from ${SOURCE_DB} to isolated ${CLONE_DB}`);
    sh('pg_dump', ['-h', '127.0.0.1', '-p', SOURCE_PORT, '-U', 'postgres', '-d', SOURCE_DB, '-Fc', '-f', dumpPath]);
    sh('createdb', ['-h', '127.0.0.1', '-p', SOURCE_PORT, '-U', 'postgres', CLONE_DB]);
    const restore = spawnSync('pg_restore', [
      '-h', '127.0.0.1', '-p', SOURCE_PORT, '-U', 'postgres', '-d', CLONE_DB, '--no-owner', dumpPath,
    ], { encoding: 'utf8' });
    const locations = sh('psql', ['-h', '127.0.0.1', '-p', SOURCE_PORT, '-U', 'postgres', '-d', CLONE_DB, '-tAc', "select to_regclass('public.service_tracking_locations')"]).trim();
    if (locations !== 'service_tracking_locations') {
      throw new Error(`Clone restore failed: ${restore.stderr || restore.stdout}`);
    }
  }
  sh('psql', [
    '-h', '127.0.0.1', '-p', SOURCE_PORT, '-U', 'postgres', '-d', CLONE_DB,
    '-v', 'ON_ERROR_STOP=1',
    '-f', path.join(ROOT, 'supabase/migrations/20261118200000_service_tracking_share_links.sql'),
  ]);
  return cloneUrl;
}

async function seed(admin, devices) {
  await admin.query(`
    delete from public.service_tracking_locations
     where booking_id in (select id from public.service_bookings where listing_id like $1)
  `, [`${LISTING_PREFIX}%`]);
  await admin.query(`delete from public.service_bookings where listing_id like $1`, [`${LISTING_PREFIX}%`]);
  await admin.query(`delete from public.listings where id like $1`, [`${LISTING_PREFIX}%`]);
  await admin.query(`delete from public.businesses where business_ref like 'BIZ-GPS-API-%'`);
  const staleUsers = await admin.query(`select id from public.profiles where email like 'gps-api-load-%'`);
  const staleIds = staleUsers.rows.map((row) => row.id);
  if (staleIds.length) {
    await admin.query('delete from public.profiles where id = any($1::uuid[])', [staleIds]);
    await admin.query('delete from auth.users where id = any($1::uuid[])', [staleIds]);
  }

  const bookings = [];
  const userRows = [];
  const businessRows = [];
  const listingRows = [];
  const bookingRows = [];
  for (let i = 0; i < devices; i += 1) {
    const providerId = randomUUID();
    const customerId = randomUUID();
    const bookingId = randomUUID();
    const businessId = randomUUID();
    const listingId = `${LISTING_PREFIX}${i}`;
    const timeSlot = '10:00';
    bookings.push({
      id: bookingId,
      providerId,
      customerId,
      listingId,
      index: i,
      providerToken: signToken({ id: providerId, role: 'provider', email: `gps-api-load-p${i}@example.test`, name: `Load Provider ${i}` }),
      customerToken: signToken({ id: customerId, role: 'customer', email: `gps-api-load-c${i}@example.test`, name: `Load Customer ${i}` }),
    });
    userRows.push(`('${providerId}','gps-api-load-p${i}@example.test','{"full_name":"Load Provider ${i}"}'::jsonb)`);
    userRows.push(`('${customerId}','gps-api-load-c${i}@example.test','{"full_name":"Load Customer ${i}"}'::jsonb)`);
    businessRows.push(`('${businessId}','BIZ-GPS-API-${String(i).padStart(4, '0')}','GPS API Load ${i}','services','${providerId}','approved',true,'${providerId}',now())`);
    listingRows.push(`('${listingId}','${providerId}','${businessId}','GPS API Load ${i}','water_delivery','20L can','service',90,'per can','active','{"sectionType":"services"}'::jsonb,true)`);
    bookingRows.push(`('${bookingId}','${randomUUID()}','${listingId}','${customerId}','${providerId}','water_delivery','20L can',current_date + 1,'${timeSlot}','${timeSlot}','Plot ${i}, Madhapur, Hyderabad','90000${String(i).padStart(5, '0')}','accepted','pay_after_service','due',90,'per can',1,'customer_selects','home_delivery','${businessId}',now(),now(),now())`);
  }

  const chunk = 200;
  const insertChunks = async (sql, rows) => {
    for (let offset = 0; offset < rows.length; offset += chunk) {
      await admin.query(`${sql} ${rows.slice(offset, offset + chunk).join(',')}`);
    }
  };
  await insertChunks('insert into auth.users (id, email, raw_user_meta_data) values', userRows);
  await admin.query(`
    update public.profiles p
       set role = case when p.email like 'gps-api-load-p%' then 'provider' else 'customer' end,
           account_status = 'active',
           full_name = coalesce(p.full_name, p.email),
           updated_at = now()
     where p.email like 'gps-api-load-%'
  `);
  await insertChunks('insert into public.businesses (id, business_ref, name, module_type, owner_user_id, approval_status, is_enabled, created_by, approved_at) values', businessRows);
  await insertChunks('insert into public.listings (id, owner_id, business_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload, is_verified) values', listingRows);
  await insertChunks(
    `insert into public.service_bookings
      (id, idempotency_key, listing_id, customer_id, provider_id, category_id, subcategory,
       scheduled_date, time_slot, slot_key, service_address, customer_phone, status, payment_mode,
       payment_status, amount, amount_basis, quantity, assignment_mode, delivery_mode, business_id,
       helper_assigned_at, accepted_at, tracking_started_at) values`,
    bookingRows,
  );
  await admin.query(`
    update public.service_delivery_profiles p
       set tracking_enabled = true,
           live_map_enabled = true,
           otp_enabled = true,
           destination_latitude = 17.4483,
           destination_longitude = 78.3915,
           assignee_kind = 'provider',
           assignee_id = b.provider_id,
           journey_status = 'en_route',
           updated_at = now()
      from public.service_bookings b
     where p.booking_id = b.id
       and b.listing_id like $1
  `, [`${LISTING_PREFIX}%`]);
  await admin.query(`
    update public.service_gps_policy
       set global_enabled = true,
           category_overrides = coalesce(category_overrides, '{}'::jsonb) || '{"water_delivery":{"gpsTracking":true,"liveMap":true}}'::jsonb
     where id = 'global'
  `);
  return bookings;
}

async function seedWhatsAppBooking(admin, index) {
  const providerId = randomUUID();
  const customerId = randomUUID();
  const bookingId = randomUUID();
  const businessId = randomUUID();
  const listingId = `${LISTING_PREFIX}wa-${index}`;
  await admin.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1,$3, jsonb_build_object('full_name',$5::text,'role','provider')),
       ($2,$4, jsonb_build_object('full_name',$6::text,'role','customer'))`,
    [providerId, customerId, `gps-api-load-wa-p${index}@example.test`, `gps-api-load-wa-c${index}@example.test`,
      `WA Provider ${index}`, `WA Customer ${index}`],
  );
  await admin.query(
    `update public.profiles
        set role = case when id = $1 then 'provider' else 'customer' end,
            account_status = 'active',
            full_name = case when id = $1 then $3::text else $4::text end
      where id in ($1,$2)`,
    [providerId, customerId, `WA Provider ${index}`, `WA Customer ${index}`],
  );
  await admin.query(
    `insert into public.businesses (id, business_ref, name, module_type, owner_user_id, approval_status, is_enabled, created_by, approved_at)
     values ($1,$2,$3,'services',$4,'approved',true,$4,now())`,
    [businessId, `BIZ-GPS-API-WA-${index}`, `GPS WA ${index}`, providerId],
  );
  await admin.query(
    `insert into public.listings (id, owner_id, business_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload, is_verified)
     values ($1,$2,$3,'WA GPS','water_delivery','20L can','service',90,'per can','active','{"sectionType":"services"}'::jsonb,true)`,
    [listingId, providerId, businessId],
  );
  await admin.query(
    `insert into public.service_bookings
       (id, idempotency_key, listing_id, customer_id, provider_id, category_id, subcategory,
        scheduled_date, time_slot, slot_key, service_address, customer_phone, status, payment_mode,
        payment_status, amount, amount_basis, quantity, assignment_mode, delivery_mode, business_id)
     values ($1,$2,$3,$4,$5,'water_delivery','20L can', current_date + 1, $6, $6,
             'WA Plot, Madhapur','9000012345','requested','pay_after_service','due',90,'per can',1,
             'customer_selects','home_delivery',$7)`,
    [bookingId, randomUUID(), listingId, customerId, providerId, index === 0 ? '11:00' : '12:00', businessId],
  );
  await admin.query(
    `update public.service_delivery_profiles
        set whatsapp_opt_in = true, tracking_enabled = true, live_map_enabled = true
      where booking_id = $1`,
    [bookingId],
  );
  return {
    id: bookingId,
    providerId,
    customerId,
    listingId,
    providerToken: signToken({ id: providerId, role: 'provider', email: `gps-api-load-wa-p${index}@example.test`, name: `WA Provider ${index}` }),
    customerToken: signToken({ id: customerId, role: 'customer', email: `gps-api-load-wa-c${index}@example.test`, name: `WA Customer ${index}` }),
  };
}

async function startSlimServer(cloneUrl, env) {
  process.env.NODE_ENV = 'test';
  process.env.BOS_LISTINGS_DATABASE_URL = cloneUrl;
  process.env.BOS_SERVER_HMAC_SECRET = HMAC_SECRET;
  process.env.BOS_PG_POOL_MAX = env.BOS_PG_POOL_MAX;
  process.env.APP_URL = 'http://127.0.0.1:34567';
  process.env.WHATSAPP_SEND_ENABLED = '1';
  process.env.WHATSAPP_ACCESS_TOKEN = 'gps-api-load-mock-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
  process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMED = 'booking_confirmed';
  process.env.WHATSAPP_TEMPLATE_PROVIDER_ON_THE_WAY = 'provider_on_the_way';
  delete process.env.BOS_PG_URL;

  const repository = ServiceBookingRepository.fromEnvironment(process.env);
  if (!repository) throw new Error('ServiceBookingRepository did not start');
  await repository.verifyConnection();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  registerServiceBookingApi(app, { repository, verifySession, env: process.env });
  registerTrackingShareApi(app, { repository, verifySession, env: process.env });
  app.get('/api/gps-load/pool-stats', (_request, response) => {
    response.json({ ok: true, stats: getSharedPostgresPoolStats() });
  });
  app.get('/api/live', (_request, response) => {
    response.json({ ok: true, probe: 'gps-api-load' });
  });

  const port = await freePort();
  const server = await new Promise((resolve) => {
    const httpServer = app.listen(port, '127.0.0.1', () => resolve(httpServer));
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    repository,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await repository.close();
    },
  };
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function poolStats() {
  return getSharedPostgresPoolStats() || { totalCount: 0, idleCount: 0, waitingCount: 0, max: 0 };
}

async function probeIsolation(baseUrl, bookings) {
  const victim = bookings[0];
  const attacker = bookings[1];
  const crossWrite = await jsonRequest(
    baseUrl,
    'POST',
    `/api/services/bookings/${victim.id}/tracking/location`,
    attacker.providerToken,
    syntheticPoint(99, 0),
  );
  const crossRead = await jsonRequest(
    baseUrl,
    'GET',
    `/api/services/bookings/${victim.id}/tracking`,
    attacker.customerToken,
  );
  const ownRead = await jsonRequest(
    baseUrl,
    'GET',
    `/api/services/bookings/${victim.id}/tracking`,
    victim.customerToken,
  );
  return {
    unauthorizedInsertStatus: crossWrite.status,
    unauthorizedInsertError: crossWrite.data.error || null,
    crossCustomerReadStatus: crossRead.status,
    crossCustomerReadError: crossRead.data.error || null,
    ownCustomerReadStatus: ownRead.status,
    leaks: Number(crossWrite.status === 201) + Number(crossRead.status === 200 && crossRead.data?.snapshot?.latestLocation),
  };
}

async function probeRateGuard(baseUrl, booking) {
  const first = await jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/tracking/location`, booking.providerToken, syntheticPoint(0, 0));
  const duplicateCapturedAt = {
    ...syntheticPoint(0, 1),
    capturedAt: first.data?.point?.capturedAt || new Date().toISOString(),
  };
  const duplicate = await jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/tracking/location`, booking.providerToken, duplicateCapturedAt);
  const tooSoon = await jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/tracking/location`, booking.providerToken, syntheticPoint(0, 2));
  await wait(5_200);
  const afterGuard = await jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/tracking/location`, booking.providerToken, syntheticPoint(0, 3));
  return {
    firstStatus: first.status,
    duplicateStatus: duplicate.status,
    duplicateError: duplicate.data.error || null,
    tooSoonStatus: tooSoon.status,
    tooSoonError: tooSoon.data.error || null,
    afterFiveSecondsStatus: afterGuard.status,
    sqlGuardSeconds: 5,
    publisherIntervalSeconds: 10,
    clientIntervalMs: TRACKING_UPDATE_INTERVAL_MS,
    planningIntervalSeconds: GPS_UPDATE_INTERVAL_SECONDS,
    consistentWithTenSecondPublisher: GPS_UPDATE_INTERVAL_SECONDS > 5 && TRACKING_UPDATE_INTERVAL_MS >= 10_000,
  };
}

async function probeReconnect(baseUrl, booking) {
  const first = await jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/tracking/location`, booking.providerToken, syntheticPoint(1, 10));
  await wait(5_200);
  const second = await jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/tracking/location`, booking.providerToken, syntheticPoint(1, 11));
  return {
    firstStatus: first.status,
    secondStatus: second.status,
    sessionReuseAfterPauseAccepted: second.status === 201,
    newTcpAccepted: second.status === 201,
  };
}

async function probeWhatsApp(baseUrl, booking) {
  const before = whatsappGraphCalls.length;
  const accept = await jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/actions`, booking.providerToken, { action: 'accept' });
  await wait(400);
  const start = await jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/tracking/session/start`, booking.providerToken, {
    destinationLatitude: 17.4483,
    destinationLongitude: 78.3915,
    vehicleLabel: 'Load van',
    assigneeLabel: 'WA provider',
  });
  await wait(200);
  const gps1 = await jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/tracking/location`, booking.providerToken, syntheticPoint(0, 20));
  await wait(400);
  const gps2 = await jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/tracking/location`, booking.providerToken, syntheticPoint(0, 21));
  await wait(5_200);
  const gps3 = await jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/tracking/location`, booking.providerToken, syntheticPoint(0, 22));
  await wait(400);
  const calls = whatsappGraphCalls.slice(before);
  const templates = calls.map((call) => call.body?.template?.name || null);
  return {
    acceptStatus: accept.status,
    startStatus: start.status,
    gpsStatuses: [gps1.status, gps2.status, gps3.status],
    graphCalls: calls.length,
    templates,
    messageAOnce: templates.filter((name) => name === 'booking_confirmed').length === 1,
    messageBOnce: templates.filter((name) => name === 'provider_on_the_way').length === 1,
    noExtraSends: calls.length === 2,
  };
}

async function runHttpLoad(baseUrl, admin, bookings, devices) {
  const slice = bookings.slice(0, devices);
  await admin.query('truncate public.service_tracking_locations');
  const writeSamples = [];
  const readSamples = [];
  const errors = {};
  let accepted = 0;
  let rejected = 0;
  let peakTotal = 0;
  let peakWaiting = 0;
  let peakCpu = 0;
  const backendPids = (await admin.query("select pid from pg_stat_activity where datname = current_database()")).rows.map((row) => row.pid);
  const dbBefore = await admin.query('select xact_commit, tup_inserted, blks_read, blks_hit, deadlocks from pg_stat_database where datname = current_database()');

  const burstSize = Math.min(100, slice.length);
  const burstResults = await Promise.all(slice.slice(0, burstSize).map((booking, index) => (
    jsonRequest(baseUrl, 'POST', `/api/services/bookings/${booking.id}/tracking/location`, booking.providerToken, syntheticPoint(index, -1))
  )));
  const burstStats = poolStats();
  peakCpu = Math.max(peakCpu, samplePostgresCpu(backendPids).maxPct);
  await wait(6_000);
  await admin.query('truncate public.service_tracking_locations');

  const readEvery = Math.max(1, Math.floor(devices / 20));
  const jobs = [];
  for (let tick = 0; tick < TICKS; tick += 1) {
    for (let i = 0; i < slice.length; i += 1) {
      jobs.push({
        booking: slice[i],
        tick,
        delay: tick * INTERVAL_MS + Math.floor((i * INTERVAL_MS) / slice.length),
        read: i % readEvery === 0,
      });
    }
  }

  const watchers = slice.slice(0, Math.min(25, slice.length));
  const watcherSamples = [];
  const watcherAbort = { stop: false };
  const watcherTask = Promise.all(watchers.map(async (booking) => {
    while (!watcherAbort.stop) {
      const read = await jsonRequest(baseUrl, 'GET', `/api/services/bookings/${booking.id}/tracking`, booking.customerToken);
      watcherSamples.push(read.ms);
      await wait(500);
    }
  }));

  await Promise.all(jobs.map(async (job) => {
    await wait(job.delay);
    const write = await jsonRequest(
      baseUrl,
      'POST',
      `/api/services/bookings/${job.booking.id}/tracking/location`,
      job.booking.providerToken,
      syntheticPoint(job.booking.index, job.tick),
    );
    writeSamples.push(write.ms);
    if (write.status === 201) accepted += 1;
    else {
      rejected += 1;
      const code = write.data.error || `HTTP_${write.status}`;
      errors[code] = (errors[code] || 0) + 1;
    }
    const stats = poolStats();
    peakTotal = Math.max(peakTotal, stats.totalCount || 0);
    peakWaiting = Math.max(peakWaiting, stats.waitingCount || 0);
    if ((accepted + rejected) % 50 === 1) {
      peakCpu = Math.max(peakCpu, samplePostgresCpu(backendPids).maxPct);
    }
    if (write.status === 201 && job.read) {
      const read = await jsonRequest(baseUrl, 'GET', `/api/services/bookings/${job.booking.id}/tracking`, job.booking.customerToken);
      readSamples.push(read.ms);
    }
  }));

  watcherAbort.stop = true;
  await watcherTask;
  const dbAfter = await admin.query('select xact_commit, tup_inserted, blks_read, blks_hit, deadlocks from pg_stat_database where datname = current_database()');
  const total = accepted + rejected;
  const acceptRate = total ? accepted / total : 0;
  const p95Write = percentile(writeSamples, 0.95);
  const p95Read = percentile(readSamples, 0.95);
  const p95Watcher = percentile(watcherSamples, 0.95);
  const httpPass = acceptRate >= 0.999
    && p95Write != null && p95Write < 500
    && p95Read != null && p95Read < 2000
    && Object.keys(errors).length === 0;
  return {
    mode: 'isolated-express-api',
    devices,
    ticks: TICKS,
    intervalSeconds: INTERVAL_MS / 1000,
    poolMax: resolvePostgresPoolMax(process.env),
    accepted,
    rejected,
    acceptRate: Number(acceptRate.toFixed(6)),
    write: { p50Ms: percentile(writeSamples, 0.5), p95Ms: p95Write, p99Ms: percentile(writeSamples, 0.99) },
    customerRead: { samples: readSamples.length, p50Ms: percentile(readSamples, 0.5), p95Ms: p95Read, p99Ms: percentile(readSamples, 0.99) },
    concurrentWatchers: {
      watchers: watchers.length,
      samples: watcherSamples.length,
      p50Ms: percentile(watcherSamples, 0.5),
      p95Ms: p95Watcher,
      p99Ms: percentile(watcherSamples, 0.99),
    },
    pool: { peakTotal, peakWaiting },
    db: {
      cpuPeakPct: peakCpu,
      xactCommitDelta: Number(dbAfter.rows[0].xact_commit) - Number(dbBefore.rows[0].xact_commit),
      tupInsertedDelta: Number(dbAfter.rows[0].tup_inserted) - Number(dbBefore.rows[0].tup_inserted),
      blksReadDelta: Number(dbAfter.rows[0].blks_read) - Number(dbBefore.rows[0].blks_read),
      blksHitDelta: Number(dbAfter.rows[0].blks_hit) - Number(dbBefore.rows[0].blks_hit),
      deadlocksDelta: Number(dbAfter.rows[0].deadlocks) - Number(dbBefore.rows[0].deadlocks),
    },
    errors,
    concurrentBurst100: {
      attempted: burstSize,
      accepted: burstResults.filter((row) => row.status === 201).length,
      p50Ms: percentile(burstResults.map((row) => row.ms), 0.5),
      p95Ms: percentile(burstResults.map((row) => row.ms), 0.95),
      p99Ms: percentile(burstResults.map((row) => row.ms), 0.99),
      peakTotal: burstStats.totalCount,
      peakWaiting: burstStats.waitingCount,
      errors: burstResults.filter((row) => row.status !== 201).map((row) => row.data.error || row.status),
    },
    httpPassedAcceptanceTargets: httpPass,
    cost: estimateGpsInfrastructureCost(estimateGpsLoad(devices, 10)),
  };
}

function realtimeProbe() {
  const localRealtime = portOpen(54321);
  const localRealtimeDb = portOpen(54322);
  return {
    status: localRealtime ? 'available-untested-client' : 'BLOCKED',
    localSupabaseRealtimePort54321: localRealtime,
    localSupabaseDbPort54322: localRealtimeDb,
    hostedMumbai: 'not contacted',
    clientHasRealtimeTransport: 'Vite PROD-only; this Node harness has no Supabase Realtime websocket',
    note: localRealtime
      ? 'Local Realtime port is open; this harness did not subscribe 1,000 watchers to supabase-js channels.'
      : 'Local supabase (54321/54322) is not running. Customer Realtime delivery was not measured.',
  };
}

async function selfTest() {
  const samples = [];
  for (let i = 0; i < 20; i += 1) {
    const started = performance.now();
    const token = signToken({ id: randomUUID(), role: 'provider', email: 'a@b.test', name: 'n' });
    assert.match(token, /\./);
    samples.push(performance.now() - started);
  }
  console.log(JSON.stringify({
    mode: 'self-test',
    hmacSamples: samples.length,
    p95Ms: percentile(samples, 0.95),
    rateGuard: {
      sqlSeconds: 5,
      publisherSeconds: 10,
      clientIntervalMs: TRACKING_UPDATE_INTERVAL_MS,
      intentional: true,
    },
    realtime: realtimeProbe(),
    note: 'HMAC/self-test only. Not an Express API 100/250/500/1000 result.',
  }, null, 2));
}

async function main() {
  if (args.get('self-test')) {
    await selfTest();
    return;
  }
  if (process.env.BOS_GPS_API_LOAD_TEST !== '1') {
    throw new Error('BOS_GPS_API_LOAD_TEST=1 is required for a live Express GPS API run');
  }
  const sizes = args.get('suite')
    ? [100, 250, 500, 1000]
    : [Number(args.get('devices') || 100)];
  const cloneUrl = ensureCloneDatabase();
  const env = { NODE_ENV: 'test', BOS_LISTINGS_DATABASE_URL: cloneUrl, BOS_PG_POOL_MAX: process.env.BOS_PG_POOL_MAX || '40' };
  const admin = new Pool({ connectionString: cloneUrl, max: 4 });
  const server = await startSlimServer(cloneUrl, env);
  const ready = await jsonRequest(server.baseUrl, 'GET', '/api/live');
  if (ready.status !== 200) throw new Error('Slim GPS API server did not become ready');
  try {
    const maxDevices = Math.max(...sizes);
    const bookings = await seed(admin, maxDevices);
    const isolation = await probeIsolation(server.baseUrl, bookings);
    await admin.query('truncate public.service_tracking_locations');
    const rateGuard = await probeRateGuard(server.baseUrl, bookings[0]);
    await admin.query('truncate public.service_tracking_locations');
    const reconnect = await probeReconnect(server.baseUrl, bookings[1] || bookings[0]);
    await admin.query('truncate public.service_tracking_locations');
    const waBooking = await seedWhatsAppBooking(admin, 0);
    const whatsapp = await probeWhatsApp(server.baseUrl, waBooking);
    const realtime = realtimeProbe();
    const runs = [];
    for (const devices of sizes) {
      const result = await runHttpLoad(server.baseUrl, admin, bookings, devices);
      result.authorization = isolation;
      result.rateGuard = rateGuard;
      result.reconnect = reconnect;
      result.whatsapp = whatsapp;
      result.realtime = realtime;
      result.productionReady1000 = false;
      result.passedAcceptanceTargets = Boolean(
        result.httpPassedAcceptanceTargets
        && isolation.leaks === 0
        && rateGuard.firstStatus === 201
        && rateGuard.tooSoonStatus === 429
        && rateGuard.afterFiveSecondsStatus === 201
        && reconnect.newTcpAccepted
        && whatsapp.messageAOnce
        && whatsapp.messageBOnce
        && realtime.status !== 'BLOCKED',
      );
      if (devices < 1000 || realtime.status === 'BLOCKED' || !result.httpPassedAcceptanceTargets) {
        result.productionReady1000 = false;
      }
      console.log(JSON.stringify(result, null, 2));
      writeFileSync(`/tmp/bos-gps-api-load-${devices}.json`, JSON.stringify(result, null, 2));
      runs.push(result);
    }
    const summary = {
      mode: 'isolated-express-api-suite',
      source: `${SOURCE_DB} cloned to ${CLONE_DB} on 127.0.0.1:${SOURCE_PORT}`,
      server: server.baseUrl,
      avoided: [':3010', 'supabase.co', 'Mumbai production'],
      runs: runs.map((run) => ({
        devices: run.devices,
        acceptRate: run.acceptRate,
        writeP95Ms: run.write.p95Ms,
        customerP95Ms: run.customerRead.p95Ms,
        watcherP95Ms: run.concurrentWatchers.p95Ms,
        poolWaiting: run.pool.peakWaiting,
        dbCpuPeakPct: run.db.cpuPeakPct,
        httpPassed: run.httpPassedAcceptanceTargets,
      })),
      isolation,
      rateGuard,
      reconnect,
      whatsapp,
      realtime,
      productionReady1000: false,
      bottlenecks: [
        realtime.status === 'BLOCKED' ? 'Supabase Realtime was not running locally and was not tested.' : null,
        'Node pg pool default 40 is the write-side limiter; waitingCount>0 means raise BOS_PG_POOL_MAX toward 80.',
        'SQL 5s captured_at guard is the product rate limit; HTTP API limiter is skipped in NODE_ENV=test.',
        'Hosted Mumbai API/Realtime/storage remain uncertified.',
      ].filter(Boolean),
      recommendations: [
        'Keep the 5-second SQL guard. The publisher sends every 10s (hook) / 12s (TRACKING_UPDATE_INTERVAL_MS).',
        'Do not claim 1,000-device production readiness until hosted Realtime fan-out is measured with concurrent watchers.',
        'Size compute from measured HTTP p95 and pool waits on staging that includes Realtime, not from this loopback clone alone.',
      ],
    };
    console.log(JSON.stringify(summary, null, 2));
    writeFileSync('/tmp/bos-gps-api-load-summary.json', JSON.stringify(summary, null, 2));
  } finally {
    await server.close();
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

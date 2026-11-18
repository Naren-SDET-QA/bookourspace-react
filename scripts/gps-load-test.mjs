#!/usr/bin/env node
/**
 * Isolated GPS capacity harness.
 *
 * --plan         planning math only
 * --self-test    in-process point generation
 * --benchmark-pool / --devices=N
 *   Requires BOS_GPS_LOAD_TEST=1 and a loopback Postgres cluster.
 *   Refuses supabase.co. Never claims a 1,000-device pass by itself.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import {
  estimateGpsLoad,
  estimateGpsInfrastructureCost,
  gpsCapacityVerdict,
} from '../src/lib/gpsCapacity.ts';
import {
  canAccessTrackingLink,
  isTrackingTokenFormat,
  publicTrackingUrl,
  trackingUrlContainsSecrets,
} from '../src/lib/trackingShare.ts';
import { generateTrackingToken, hashTrackingToken } from '../src/server/trackingToken.ts';
import { postgresPoolOptions, resolvePostgresPoolMax } from '../src/server/postgresPool.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = path.join(ROOT, 'scripts/gps-isolated-schema.sql');
const DATA_DIR = process.env.BOS_GPS_LOAD_DB_DIR || '/tmp/bos-gps-load-db';
const DB_PORT = String(process.env.BOS_GPS_LOAD_DB_PORT || '55499');
const DB_NAME = 'bos_gps_load';
const TICKS = Number(process.env.BOS_GPS_LOAD_TICKS || 3);
const INTERVAL_MS = 10_000;

const args = new Map();
for (const part of process.argv.slice(2)) {
  const [key, value = 'true'] = part.replace(/^--/, '').split('=');
  args.set(key, value);
}

function syntheticPoint(deviceIndex, tick) {
  return {
    latitude: 17.4401 + (deviceIndex * 0.00002) + (tick * 0.000001),
    longitude: 78.3489 + (deviceIndex * 0.00002),
  };
}

function percentile(samples, p) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(3));
}

function printPlan() {
  for (const devices of [100, 250, 500, 1000]) {
    const load = estimateGpsLoad(devices, 10);
    console.log(JSON.stringify({ scenario: `${devices}-device`, ...load, verdict: gpsCapacityVerdict(null) }, null, 2));
  }
  console.log(JSON.stringify({
    ...estimateGpsInfrastructureCost(),
    poolMaxDefault: resolvePostgresPoolMax({}),
  }, null, 2));
}

async function selfTest() {
  const samples = [];
  for (let i = 0; i < 50; i += 1) {
    const started = performance.now();
    const point = syntheticPoint(i, 0);
    assert.ok(point.latitude > 17 && point.latitude < 18);
    samples.push(performance.now() - started);
  }
  console.log(JSON.stringify({
    mode: 'self-test',
    accepted: samples.length,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    verdict: gpsCapacityVerdict(null),
    note: 'In-process synthetic points only. Not a 100/250/500/1000-device staging result.',
  }, null, 2));
}

function refuseHosted(url) {
  if (/supabase\.co|pooler\.supabase/i.test(url)) {
    throw new Error('Refusing a Supabase-hosted origin');
  }
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error('BOS_GPS_LOAD_TEST must use loopback Postgres');
  }
}

function sh(bin, argv, opts = {}) {
  const result = spawnSync(bin, argv, { encoding: 'utf8', ...opts });
  if (result.status !== 0) {
    throw new Error(`${bin} ${argv.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function ensureIsolatedPostgres() {
  for (const bin of ['initdb', 'pg_ctl', 'psql', 'createdb']) {
    try {
      execFileSync('which', [bin], { stdio: 'ignore' });
    } catch {
      throw new Error(`BLOCKED: ${bin} is required for isolated GPS load tests`);
    }
  }
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    sh('initdb', ['-D', DATA_DIR, '-U', 'postgres', '--auth=trust']);
  }
  const status = spawnSync('pg_ctl', ['-D', DATA_DIR, 'status'], { encoding: 'utf8' });
  if (status.status !== 0) {
    sh('pg_ctl', [
      '-D', DATA_DIR,
      '-o', `-p ${DB_PORT} -k /tmp -c listen_addresses=127.0.0.1 -c max_connections=120`,
      '-l', path.join('/tmp', 'bos-gps-load-db.log'),
      '-w', 'start',
    ]);
  }
  const url = `postgres://postgres@127.0.0.1:${DB_PORT}/${DB_NAME}?sslmode=disable`;
  refuseHosted(url);
  const exists = sh('psql', ['-h', '127.0.0.1', '-p', DB_PORT, '-U', 'postgres', '-d', 'postgres', '-tAc', `select 1 from pg_database where datname='${DB_NAME}'`]).trim();
  if (exists !== '1') {
    sh('createdb', ['-h', '127.0.0.1', '-p', DB_PORT, '-U', 'postgres', DB_NAME]);
  }
  sh('psql', ['-h', '127.0.0.1', '-p', DB_PORT, '-U', 'postgres', '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1', '-f', SCHEMA]);
  return url;
}

async function withRole(client, userId, work) {
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE authenticated');
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
  try {
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* keep original */ }
    throw error;
  }
}

async function insertPoint(pool, booking, tick) {
  const point = syntheticPoint(booking.index, tick);
  const capturedAt = new Date().toISOString();
  const client = await pool.connect();
  const started = performance.now();
  try {
    await withRole(client, booking.providerId, async () => {
      await client.query(
        `insert into public.service_tracking_locations
           (booking_id, actor_id, actor_role, latitude, longitude, accuracy_meters, speed_mps, captured_at, source)
         values ($1, auth.uid(), 'helper', $2, $3, 8, 6.1, $4, 'device_gps')`,
        [booking.id, point.latitude, point.longitude, capturedAt],
      );
    });
    return { ok: true, ms: performance.now() - started, bookingId: booking.id, capturedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, ms: performance.now() - started, error: message.includes('TRACKING_UPDATE_TOO_FREQUENT') ? 'TRACKING_UPDATE_TOO_FREQUENT' : 'WRITE_FAILED' };
  } finally {
    client.release();
  }
}

async function customerRead(pool, booking) {
  const client = await pool.connect();
  const started = performance.now();
  try {
    const rows = await withRole(client, booking.customerId, async () => {
      const result = await client.query(
        `select latitude, longitude, captured_at
           from public.service_tracking_locations
          where booking_id = $1
          order by captured_at desc
          limit 1`,
        [booking.id],
      );
      return result.rows;
    });
    return { ok: Boolean(rows[0]), ms: performance.now() - started, leak: false };
  } catch {
    return { ok: false, ms: performance.now() - started, leak: false };
  } finally {
    client.release();
  }
}

async function seedBookings(admin, devices) {
  await admin.query('truncate public.service_tracking_locations, public.service_tracking_links, public.gps_load_bookings cascade');
  const bookings = [];
  const rows = [];
  for (let i = 0; i < devices; i += 1) {
    const id = randomUUID();
    const customerId = randomUUID();
    const providerId = randomUUID();
    bookings.push({ id, customerId, providerId, index: i });
    rows.push(`('${id}','${customerId}','${providerId}','accepted','BOS-LOAD-${i}')`);
  }
  const chunk = 250;
  for (let offset = 0; offset < rows.length; offset += chunk) {
    await admin.query(
      `insert into public.gps_load_bookings (id, customer_id, provider_id, status, booking_ref) values ${rows.slice(offset, offset + chunk).join(',')}`,
    );
  }
  return bookings;
}

async function authorizationProbe(pool, bookings) {
  const victim = bookings[0];
  const attacker = bookings[1] || bookings[0];
  const client = await pool.connect();
  let unauthorizedInserts = 0;
  let crossReads = 0;
  try {
    const write = await insertPoint(pool, { ...victim, providerId: attacker.providerId }, 99);
    if (write.ok) unauthorizedInserts += 1;
    await withRole(client, attacker.customerId, async () => {
      const { rows } = await client.query(
        'select count(*)::int as count from public.service_tracking_locations where booking_id = $1',
        [victim.id],
      );
      crossReads += Number(rows[0]?.count || 0);
    }).catch(() => {});
  } finally {
    client.release();
  }
  return { unauthorizedInserts, crossReads };
}

async function trackingLinkProbe(admin) {
  const token = generateTrackingToken();
  assert.equal(isTrackingTokenFormat(token), true);
  const url = publicTrackingUrl('https://bookourspace.com', token);
  assert.equal(trackingUrlContainsSecrets(url), false);
  const hash = hashTrackingToken(token);
  const bookingId = randomUUID();
  await admin.query(
    `insert into public.gps_load_bookings (id, customer_id, provider_id, status, booking_ref)
     values ($1, $2, $3, 'accepted', 'BOS-LINK')`,
    [bookingId, randomUUID(), randomUUID()],
  );
  await admin.query(
    `insert into public.service_tracking_links (booking_id, token_hash, expires_at)
     values ($1, $2, now() + interval '7 days')`,
    [bookingId, hash],
  );
  const live = await admin.query('select status, expires_at, revoked_at from public.service_tracking_links l join public.gps_load_bookings b on b.id = l.booking_id where token_hash = $1', [hash]);
  const open = canAccessTrackingLink({
    status: live.rows[0].status,
    expiresAt: live.rows[0].expires_at.toISOString(),
    revokedAt: live.rows[0].revoked_at,
  });
  await admin.query('update public.service_tracking_links set revoked_at = now() where token_hash = $1', [hash]);
  const closed = canAccessTrackingLink({
    status: 'accepted',
    revokedAt: new Date().toISOString(),
  });
  await admin.query("update public.gps_load_bookings set status = 'completed' where id = $1", [bookingId]);
  const terminal = canAccessTrackingLink({ status: 'completed' });
  return { open, revokedClosed: closed === false, terminalClosed: terminal === false, sha256: createHash('sha256').update(token).digest('hex') === hash };
}

async function purgeProbe(admin) {
  const bookingId = randomUUID();
  await admin.query(
    `insert into public.gps_load_bookings (id, customer_id, provider_id, status, booking_ref)
     values ($1, $2, $3, 'accepted', 'BOS-PURGE')`,
    [bookingId, randomUUID(), randomUUID()],
  );
  await admin.query(
    `insert into public.service_tracking_locations
       (booking_id, actor_id, latitude, longitude, captured_at, received_at)
     values ($1, $2, 17.44, 78.34, now() - interval '2 days', now() - interval '2 days'),
            ($1, $2, 17.45, 78.35, now(), now())`,
    [bookingId, randomUUID()],
  );
  const deleted = await admin.query("select public.purge_old_service_tracking_locations(interval '24 hours') as deleted");
  const remaining = await admin.query('select count(*)::int as count from public.service_tracking_locations where booking_id = $1', [bookingId]);
  return { deleted: Number(deleted.rows[0].deleted), remaining: Number(remaining.rows[0].count) };
}

async function runDevices(devices) {
  if (process.env.BOS_GPS_LOAD_TEST !== '1') {
    throw new Error('BOS_GPS_LOAD_TEST=1 is required for a live run');
  }
  const url = ensureIsolatedPostgres();
  const env = { NODE_ENV: 'test', BOS_LISTINGS_DATABASE_URL: url, BOS_PG_POOL_MAX: process.env.BOS_PG_POOL_MAX || '40' };
  const pool = new Pool(postgresPoolOptions(url, env));
  const admin = new Pool({ connectionString: url, max: 4 });
  const writeSamples = [];
  const readSamples = [];
  let accepted = 0;
  let rejected = 0;
  let peakTotal = 0;
  let peakWaiting = 0;
  try {
    const bookings = await seedBookings(admin, devices);
    const auth = await authorizationProbe(pool, bookings);
    await admin.query('truncate public.service_tracking_locations');
    const links = await trackingLinkProbe(admin);
    const purge = await purgeProbe(admin);

    const burstSize = Math.min(100, bookings.length);
    const burstResults = await Promise.all(
      bookings.slice(0, burstSize).map((booking) => insertPoint(pool, booking, -1)),
    );
    const burstMs = burstResults.map((row) => row.ms);
    const burstAccepted = burstResults.filter((row) => row.ok).length;
    const burstPeakTotal = pool.totalCount;
    const burstPeakWaiting = pool.waitingCount;
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    await admin.query('truncate public.service_tracking_locations');

    const readEvery = Math.max(1, Math.floor(devices / 20));
    const jobs = [];
    for (let tick = 0; tick < TICKS; tick += 1) {
      for (let i = 0; i < bookings.length; i += 1) {
        const delay = tick * INTERVAL_MS + Math.floor((i * INTERVAL_MS) / bookings.length);
        jobs.push({ booking: bookings[i], tick, delay, read: i % readEvery === 0 });
      }
    }
    await Promise.all(jobs.map(async (job) => {
      await new Promise((resolve) => setTimeout(resolve, job.delay));
      const write = await insertPoint(pool, job.booking, job.tick);
      writeSamples.push(write.ms);
      if (write.ok) accepted += 1;
      else rejected += 1;
      peakTotal = Math.max(peakTotal, pool.totalCount);
      peakWaiting = Math.max(peakWaiting, pool.waitingCount);
      if (write.ok && job.read) {
        const read = await customerRead(pool, job.booking);
        readSamples.push(read.ms);
      }
    }));

    const size = await admin.query("select pg_total_relation_size('public.service_tracking_locations')::bigint as bytes");
    const indexes = await admin.query(`
      select indexname from pg_indexes
       where tablename = 'service_tracking_locations'
       order by indexname
    `);
    const total = accepted + rejected;
    const acceptRate = total ? accepted / total : 0;
    const p95Write = percentile(writeSamples, 0.95);
    const p95Read = percentile(readSamples, 0.95);
    const pass = acceptRate >= 0.999
      && p95Write != null && p95Write < 500
      && p95Read != null && p95Read < 2000
      && auth.unauthorizedInserts === 0
      && auth.crossReads === 0
      && links.open && links.revokedClosed && links.terminalClosed
      && purge.remaining === 1;
    const result = {
      mode: 'isolated-staging',
      devices,
      ticks: TICKS,
      intervalSeconds: INTERVAL_MS / 1000,
      poolMax: resolvePostgresPoolMax(env),
      accepted,
      rejected,
      acceptRate: Number(acceptRate.toFixed(6)),
      write: { p50Ms: percentile(writeSamples, 0.5), p95Ms: p95Write, p99Ms: percentile(writeSamples, 0.99) },
      customerRead: { samples: readSamples.length, p50Ms: percentile(readSamples, 0.5), p95Ms: p95Read, p99Ms: percentile(readSamples, 0.99) },
      pool: { peakTotal, peakWaiting },
      concurrentBurst100: {
        attempted: burstSize,
        accepted: burstAccepted,
        p50Ms: percentile(burstMs, 0.5),
        p95Ms: percentile(burstMs, 0.95),
        p99Ms: percentile(burstMs, 0.99),
        peakTotal: burstPeakTotal,
        peakWaiting: burstPeakWaiting,
      },
      storageBytes: Number(size.rows[0].bytes),
      indexes: indexes.rows.map((row) => row.indexname),
      authorization: auth,
      trackingLinks: links,
      purge,
      realtime: 'not measured — isolated Postgres has no Supabase Realtime',
      verdict: pass ? gpsCapacityVerdict(devices) : gpsCapacityVerdict(null),
      passedAcceptanceTargets: pass,
      cost: estimateGpsInfrastructureCost(estimateGpsLoad(devices, 10)),
    };
    console.log(JSON.stringify(result, null, 2));
    writeFileSync(`/tmp/bos-gps-load-${devices}.json`, JSON.stringify(result, null, 2));
    return result;
  } finally {
    await pool.end();
    await admin.end();
  }
}

const mode = args.has('self-test')
  ? 'self-test'
  : args.has('benchmark-pool')
    ? 'benchmark'
    : args.has('devices')
      ? 'live'
      : args.has('suite')
        ? 'suite'
        : 'plan';

if (mode === 'self-test') await selfTest();
else if (mode === 'plan') printPlan();
else if (mode === 'live') await runDevices(Number(args.get('devices')));
else if (mode === 'benchmark' || mode === 'suite') {
  const results = [];
  for (const devices of mode === 'benchmark' ? [100] : [100, 250, 500, 1000]) {
    results.push(await runDevices(devices));
  }
  const proven = results.filter((row) => row.passedAcceptanceTargets).map((row) => row.devices);
  console.log(JSON.stringify({
    mode,
    provenAtDevices: proven.length ? Math.max(...proven) : null,
    verdict: gpsCapacityVerdict(proven.length ? Math.max(...proven) : null),
    note: proven.includes(1000)
      ? 'Isolated loopback replica met targets. Hosted Supabase Realtime and Mumbai compute remain unproven.'
      : 'Do not claim 1,000-device readiness.',
  }, null, 2));
}

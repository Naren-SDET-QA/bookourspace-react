import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import pg from 'pg';

/**
 * Provider business-context and business RLS integration against a disposable
 * local PostgreSQL database and the real Express server.
 *
 * Covered:
 *   * single-business derivation and explicit business selection;
 *   * member module grants and cross-business rejection;
 *   * module-specific provider routes under /api/provider, including the new
 *     pg/venues/classes mappings;
 *   * services provider and worker routes now requiring an approved services
 *     business and a matching member grant;
 *   * listing category/entity must match the selected business module on create
 *     and on update;
 *   * Super Admin vs ordinary admin RLS on business and module writes;
 *   * member access scopes are server-mediated: managers cannot change their
 *     own or another manager's restrictions through direct PostgREST;
 *   * legitimate owner/admin/shared workflows.
 *
 * Skipped unless BOS_LISTINGS_DATABASE_URL points at a migrated database; the
 * throwaway cluster is created by
 * supabase/tests/run_provider_business_context_pg.sh.
 */

const { Pool } = pg;
const connectionString = process.env.BOS_LISTINGS_DATABASE_URL;
const databaseAvailable = Boolean(connectionString);
const dbTest = databaseAvailable ? test : test.skip;
const TEST_HMAC_SECRET = 'bos-provider-context-test-secret';

const ownerId = '8c1f5b10-1111-4111-8111-000000000001';
const memberId = '8c1f5b10-1111-4111-8111-000000000002';
const multiId = '8c1f5b10-1111-4111-8111-000000000003';
const adminId = '8c1f5b10-1111-4111-8111-000000000004';
const servicesOwnerId = '8c1f5b10-1111-4111-8111-000000000005';
const servicesStaffId = '8c1f5b10-1111-4111-8111-000000000006';
const venuesOwnerId = '8c1f5b10-1111-4111-8111-000000000007';
const superAdminId = '8c1f5b10-1111-4111-8111-000000000008';
const managerId = '8c1f5b10-1111-4111-8111-000000000009';
const managerTwoId = '8c1f5b10-1111-4111-8111-00000000000a';
const customerId = '8c1f5b10-1111-4111-8111-00000000000b';
const legacyServicesId = '8c1f5b10-1111-4111-8111-00000000000c';
const revokedServicesId = '8c1f5b10-1111-4111-8111-00000000000d';
const suspendedServicesId = '8c1f5b10-1111-4111-8111-00000000000e';

const seededUserIds = [
  ownerId, memberId, multiId, adminId, servicesOwnerId, servicesStaffId,
  venuesOwnerId, superAdminId, managerId, managerTwoId, customerId, legacyServicesId,
  revokedServicesId, suspendedServicesId,
];

const businessRefs = {
  classes: 'BIZ-CTX-PG-CLASSES',
  pg: 'BIZ-CTX-PG-HOSTELS',
  services: 'BIZ-CTX-PG-SERVICES',
  venues: 'BIZ-CTX-PG-VENUES',
  history: 'BIZ-CTX-SVC-HISTORY',
};

const listingIds = [
  'lst-ctx-class-ok', 'lst-ctx-legacy-pg', 'lst-ctx-admin-shared', 'lst-ctx-pg-mismatch',
  'lst-ctx-legacy-svc', 'lst-ctx-svc-existing-booking', 'lst-ctx-svc-transferred-booking',
  'lst-ctx-svc-unassigned-booking',
];

let pool;
let child;
let tempDir;
let storePath;
let serverUrl;
let serverStderr = '';
let classesBusinessId;
let pgBusinessId;
let servicesBusinessId;
let venuesBusinessId;

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
    name: `${role} context test`,
    googleSub: `google-${authId}`,
    phone: '+91 90000 00000',
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 10 * 60_000,
  })).toString('base64url');
  const signature = createHmac('sha256', `${TEST_HMAC_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

const tokens = {
  owner: sessionToken({ authId: ownerId, role: 'provider', userId: 'USR-CTX-OWNER', email: 'ctx-owner@example.test' }),
  member: sessionToken({ authId: memberId, role: 'provider', userId: 'USR-CTX-MEMBER', email: 'ctx-member@example.test' }),
  multi: sessionToken({ authId: multiId, role: 'provider', userId: 'USR-CTX-MULTI', email: 'ctx-multi@example.test' }),
  admin: sessionToken({ authId: adminId, role: 'admin', userId: 'USR-CTX-ADMIN', email: 'ctx-admin@example.test' }),
  servicesOwner: sessionToken({ authId: servicesOwnerId, role: 'provider', userId: 'USR-CTX-SVC-OWNER', email: 'ctx-svc-owner@example.test' }),
  servicesStaff: sessionToken({ authId: servicesStaffId, role: 'provider', userId: 'USR-CTX-SVC-STAFF', email: 'ctx-svc-staff@example.test' }),
  venuesOwner: sessionToken({ authId: venuesOwnerId, role: 'provider', userId: 'USR-CTX-VENUE-OWNER', email: 'ctx-venue-owner@example.test' }),
  superAdmin: sessionToken({ authId: superAdminId, role: 'admin', userId: 'USR-CTX-SUPER', email: 'ctx-super@example.test' }),
  manager: sessionToken({ authId: managerId, role: 'provider', userId: 'USR-CTX-MANAGER', email: 'ctx-manager@example.test' }),
  customer: sessionToken({ authId: customerId, role: 'customer', userId: 'USR-CTX-CUSTOMER', email: 'ctx-customer@example.test' }),
  legacyServices: sessionToken({ authId: legacyServicesId, role: 'provider', userId: 'USR-CTX-LEGACY-SVC', email: 'ctx-legacy-services@example.test' }),
};

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
      BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
      BOS_LISTINGS_DATABASE_URL: connectionString,
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
      BOS_PAYMENT_SANDBOX: '',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { serverStderr += chunk; });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`test server exited before listening (${child.exitCode}): ${serverStderr.slice(-1500)}`);
    }
    try {
      const response = await fetch(`${serverUrl}/api/auth/me`);
      if (response.status === 401) return;
    } catch {
      // The disposable app is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`test server did not become ready: ${serverStderr.slice(-1500)}`);
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const processToStop = child;
  child = undefined;
  processToStop.kill('SIGTERM');
  await new Promise((resolve) => processToStop.once('exit', resolve));
}

async function request(method, url, token, businessId, body) {
  const response = await fetch(`${serverUrl}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(businessId ? { 'x-business-id': businessId } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

/** Run a statement as an authenticated PostgREST-equivalent role. */
async function asAuthenticated(userId, run) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
    await client.query("select set_config('request.jwt.claim.role','authenticated',true)");
    const result = await run(client);
    await client.query('rollback');
    return result;
  } catch (error) {
    try { await client.query('rollback'); } catch { /* preserve the original error */ }
    throw error;
  } finally {
    client.release();
  }
}

const permissionDenied = (error) => String(error?.code || '') === '42501';

async function seedDatabase() {
  if (!pool) pool = new Pool({ connectionString, max: 4 });
  await pool.query('delete from public.service_bookings where provider_id = any($1::uuid[])', [seededUserIds]);
  await pool.query('delete from public.service_provider_schedules where provider_id = any($1::uuid[])', [seededUserIds]);
  await pool.query('delete from public.listings where id = any($1::text[])', [listingIds]);
  await pool.query('delete from public.businesses where business_ref = any($1::text[])', [Object.values(businessRefs)]);
  await pool.query("delete from public.businesses where backfill_source = 'services_provider_backfill_v1'");
  // The listing trigger auto-creates BIZ-AUTO-* businesses for seeded owners;
  // they must go before profiles or the owner foreign key blocks the delete.
  await pool.query('delete from public.businesses where owner_user_id = any($1::uuid[])', [seededUserIds]);
  await pool.query('delete from public.profiles where id = any($1::uuid[])', [seededUserIds]);
  await pool.query('delete from auth.users where id = any($1::uuid[])', [seededUserIds]);

  await pool.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'ctx-owner@example.test', '{}'::jsonb),
       ($2, 'ctx-member@example.test', '{}'::jsonb),
       ($3, 'ctx-multi@example.test', '{}'::jsonb),
       ($4, 'ctx-admin@example.test', '{}'::jsonb),
       ($5, 'ctx-svc-owner@example.test', '{}'::jsonb),
       ($6, 'ctx-svc-staff@example.test', '{}'::jsonb),
       ($7, 'ctx-venue-owner@example.test', '{}'::jsonb),
       ($8, 'ctx-super@example.test', '{}'::jsonb),
       ($9, 'ctx-manager@example.test', '{}'::jsonb),
       ($10, 'ctx-manager-two@example.test', '{}'::jsonb),
       ($11, 'ctx-customer@example.test', '{}'::jsonb),
       ($12, 'ctx-legacy-services@example.test', '{}'::jsonb),
       ($13, 'ctx-revoked-services@example.test', '{}'::jsonb),
       ($14, 'ctx-suspended-services@example.test', '{}'::jsonb)
     on conflict (id) do nothing`,

    seededUserIds,
  );
  await pool.query(
    `insert into public.profiles (id, email, full_name, role, account_status) values
       ($1, 'ctx-owner@example.test', 'Context Owner', 'provider', 'active'),
       ($2, 'ctx-member@example.test', 'Context Member', 'provider', 'active'),
       ($3, 'ctx-multi@example.test', 'Context Multi', 'provider', 'active'),
       ($4, 'ctx-admin@example.test', 'Context Admin', 'admin', 'active'),
       ($5, 'ctx-svc-owner@example.test', 'Context Services Owner', 'provider', 'active'),
       ($6, 'ctx-svc-staff@example.test', 'Context Services Staff', 'provider', 'active'),
       ($7, 'ctx-venue-owner@example.test', 'Context Venue Owner', 'provider', 'active'),
       ($8, 'ctx-super@example.test', 'Context Super Admin', 'admin', 'active'),
       ($9, 'ctx-manager@example.test', 'Context Manager', 'provider', 'active'),
       ($10, 'ctx-manager-two@example.test', 'Context Manager Two', 'provider', 'active'),
       ($11, 'ctx-customer@example.test', 'Context Customer', 'customer', 'active'),
       ($12, 'ctx-legacy-services@example.test', 'Legacy Services Provider', 'provider', 'active'),
       ($13, 'ctx-revoked-services@example.test', 'Revoked Services Provider', 'provider', 'active'),
       ($14, 'ctx-suspended-services@example.test', 'Suspended Services Provider', 'provider', 'active')
     on conflict (id) do update set role = excluded.role, email = excluded.email, account_status = 'active'`,
    seededUserIds,
  );
  await pool.query(
    `update public.profiles set is_super_admin = (id = $1) where id = any($2::uuid[])`,
    [superAdminId, [adminId, superAdminId]],
  );

  const classes = await pool.query(
    `insert into public.businesses
       (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source,created_by,approved_at)
     values ($1,'Context Classes Business','classes',$2,'approved',true,'integration_test',$2,now())
     on conflict (business_ref) do update set is_enabled=true, approval_status='approved', module_type='classes'
     returning id`,
    [businessRefs.classes, ownerId],
  );
  const pgHostel = await pool.query(
    `insert into public.businesses
       (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source,created_by,approved_at)
     values ($1,'Context PG Business','pg_hostels',$2,'approved',true,'integration_test',$2,now())
     on conflict (business_ref) do update set is_enabled=true, approval_status='approved', module_type='pg_hostels'
     returning id`,
    [businessRefs.pg, multiId],
  );
  const services = await pool.query(
    `insert into public.businesses
       (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source,created_by,approved_at)
     values ($1,'Context Services Business','services',$2,'approved',true,'integration_test',$2,now())
     on conflict (business_ref) do update set is_enabled=true, approval_status='approved', module_type='services'
     returning id`,
    [businessRefs.services, servicesOwnerId],
  );
  const venues = await pool.query(
    `insert into public.businesses
       (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source,created_by,approved_at)
     values ($1,'Context Venues Business','venues',$2,'approved',true,'integration_test',$2,now())
     on conflict (business_ref) do update set is_enabled=true, approval_status='approved', module_type='venues'
     returning id`,
    [businessRefs.venues, venuesOwnerId],
  );
  const history = await pool.query(
    `insert into public.businesses
       (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source,created_by,approved_at)
     values ($1,'Historical Services Business','services',$2,'approved',true,'integration_test',$2,now())
     on conflict (business_ref) do update set is_enabled=true, approval_status='approved', module_type='services'
     returning id`,
    [businessRefs.history, venuesOwnerId],
  );
  classesBusinessId = classes.rows[0].id;
  pgBusinessId = pgHostel.rows[0].id;
  servicesBusinessId = services.rows[0].id;
  venuesBusinessId = venues.rows[0].id;
  const historyBusinessId = history.rows[0].id;

  await pool.query(
    `insert into public.business_module_access (business_id, module_type, enabled, approval_status, approved_at)
     values ($1,'classes',true,'approved',now()), ($2,'pg_hostels',true,'approved',now()),
            ($3,'services',true,'approved',now()), ($4,'venues',true,'approved',now()),
            ($5,'services',true,'approved',now())
     on conflict (business_id, module_type) do update set enabled=true, approval_status='approved'`,
    [classesBusinessId, pgBusinessId, servicesBusinessId, venuesBusinessId, historyBusinessId],
  );
  await pool.query(
    `insert into public.business_members (business_id, user_id, role, status, accepted_at) values
       ($1,$2,'owner','active',now()),
       ($1,$3,'staff','active',now()),
       ($1,$4,'owner','active',now()),
       ($5,$4,'owner','active',now()),
       ($6,$7,'owner','active',now()),
       ($6,$8,'staff','active',now()),
       ($9,$10,'owner','active',now()),
       ($1,$11,'manager','active',now()),
       ($1,$12,'manager','active',now()),
       ($13,$14,'owner','active',now()),
       ($13,$15,'owner','revoked',now()),
       ($13,$16,'owner','suspended',now())
     on conflict (business_id, user_id) do update set role=excluded.role, status=excluded.status, accepted_at=now()`,
    [classesBusinessId, ownerId, memberId, multiId, pgBusinessId, servicesBusinessId, servicesOwnerId, servicesStaffId, venuesBusinessId, venuesOwnerId, managerId, managerTwoId, historyBusinessId, venuesOwnerId, revokedServicesId, suspendedServicesId],
  );
  await pool.query(
    `insert into public.business_member_access (business_id,user_id,allowed_modules,allowed_sections) values
       ($1,$2,array['pg_hostels']::text[],'{}'::jsonb),
       ($1,$3,array['classes']::text[],'{}'::jsonb),
       ($1,$4,array['classes']::text[],'{}'::jsonb),
       ($5,$6,array['classes']::text[],'{}'::jsonb)
     on conflict (business_id,user_id) do update set allowed_modules=excluded.allowed_modules`,
    [classesBusinessId, memberId, managerId, managerTwoId, servicesBusinessId, servicesStaffId],
  );
  await pool.query(
    `insert into public.listings
       (id, owner_id, business_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
     values
       ($1, $2, $3, 'Legacy cross-module PG listing', 'pg-boys', 'Single Sharing', 'pg', 9000, 'per month', 'pending_approval', '{}'::jsonb)`,
    [listingIds[1], ownerId, classesBusinessId],
  );
  await pool.query(
    `insert into public.service_provider_schedules (provider_id, working_days, day_start, day_end)
     values ($1, '{1,2,3,4,5,6}', '09:00', '19:00'),
            ($2, '{1,2,3,4,5,6}', '09:00', '19:00'),
            ($3, '{1,2,3,4,5,6}', '09:00', '19:00')
     on conflict (provider_id) do update set working_days = excluded.working_days, business_id = null`,
    [legacyServicesId, revokedServicesId, suspendedServicesId],
  );
}

after(async () => {
  await stopServer();
  if (pool) {
    await pool.query('delete from public.service_bookings where provider_id = any($1::uuid[])', [seededUserIds]).catch(() => {});
    await pool.query('delete from public.service_provider_schedules where provider_id = any($1::uuid[])', [seededUserIds]).catch(() => {});
    await pool.query('delete from public.listings where id = any($1::text[])', [listingIds]).catch(() => {});
    await pool.query('delete from public.businesses where business_ref = any($1::text[])', [Object.values(businessRefs)]).catch(() => {});
    await pool.query("delete from public.businesses where backfill_source = 'services_provider_backfill_v1'").catch(() => {});
    await pool.query('delete from public.businesses where owner_user_id = any($1::uuid[])', [seededUserIds]).catch(() => {});
    await pool.query('delete from public.profiles where id = any($1::uuid[])', [seededUserIds]).catch(() => {});
    await pool.query('delete from auth.users where id = any($1::uuid[])', [seededUserIds]).catch(() => {});
    await pool.end().catch(() => {});
  }
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

dbTest('legacy services backfill is fail-closed, audited and idempotent', async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bos-provider-context-'));
  storePath = path.join(tempDir, 'authoritative-store.json');
  await seedDatabase();

  const backfillSql = await fs.readFile(
    path.join(process.cwd(), 'supabase/migrations/20261113040000_legacy_services_provider_backfill.sql'),
    'utf8',
  );

  // Seed the historical rows before the first run. The listing trigger would
  // otherwise auto-create a business and hide the no-business backfill case.
  const setup = await pool.connect();
  try {
    await setup.query('set session_replication_role = replica');
    await setup.query(
      `insert into public.listings
         (id, owner_id, business_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
       values
         ($1, $4, $5, 'Existing booking listing', 'cat-4', 'AC Repair', 'service', 1500, 'per visit', 'active', '{}'::jsonb),
         ($2, $4, $5, 'Transferred booking listing', 'cat-4', 'AC Repair', 'service', 1500, 'per visit', 'active', '{}'::jsonb),
         ($3, $4, $5, 'Unassigned booking listing', 'cat-4', 'AC Repair', 'service', 1500, 'per visit', 'active', '{}'::jsonb)`,
      [listingIds[5], listingIds[6], listingIds[7], legacyServicesId, classesBusinessId],
    );
    // Simulate a listing transferred away from the tenant that owns the
    // historical booking.
    await setup.query(
      'update public.listings set business_id = $1 where id = $2',
      [pgBusinessId, listingIds[6]],
    );
    await setup.query(
      `insert into public.service_bookings
         (booking_ref, idempotency_key, listing_id, customer_id, provider_id, category_id, subcategory,
          scheduled_date, time_slot, service_address, customer_phone, status, payment_mode, amount, business_id)
       values
         ('BOS-CTX-EXISTING', '00000000-0000-4000-8000-000000000001', $1, $4, $5, 'cat-4', 'AC Repair',
          '2030-01-10', '10:00', 'Flat 1, Test Road', '+91 90000 00000', 'cancelled', 'pay_after_service', 1500, $6),
         ('BOS-CTX-TRANSFERRED', '00000000-0000-4000-8000-000000000002', $2, $4, $5, 'cat-4', 'AC Repair',
          '2030-01-11', '10:00', 'Flat 2, Test Road', '+91 90000 00000', 'cancelled', 'pay_after_service', 1500, $6),
         ('BOS-CTX-UNASSIGNED', '00000000-0000-4000-8000-000000000003', $3, $4, $5, 'cat-4', 'AC Repair',
          '2030-01-12', '10:00', 'Flat 3, Test Road', '+91 90000 00000', 'cancelled', 'pay_after_service', 1500, null)`,
      [listingIds[5], listingIds[6], listingIds[7], customerId, legacyServicesId, classesBusinessId],
    );
  } finally {
    await setup.query('set session_replication_role = origin').catch(() => {});
    setup.release();
  }

  await pool.query(backfillSql);

  const excluded = await pool.query(
    `select id from public.businesses where owner_user_id = any($1::uuid[]) and module_type = 'services'`,
    [[revokedServicesId, suspendedServicesId]],
  );
  assert.equal(excluded.rowCount, 0, 'revoked and suspended providers must not be re-approved');

  const legacyBusiness = await pool.query(
    `select id from public.businesses where owner_user_id = $1 and module_type = 'services'`,
    [legacyServicesId],
  );
  assert.equal(legacyBusiness.rowCount, 1, 'the eligible legacy provider must receive one business');
  const legacyBusinessId = legacyBusiness.rows[0].id;

  const linked = await pool.query(
    `select booking_ref, id, listing_id, business_id from public.service_bookings
      where booking_ref = any($1::text[]) order by booking_ref`,
    [['BOS-CTX-EXISTING', 'BOS-CTX-TRANSFERRED', 'BOS-CTX-UNASSIGNED']],
  );
  assert.equal(linked.rows.length, 3);
  assert.equal(String(linked.rows.find((row) => row.booking_ref === 'BOS-CTX-EXISTING')?.business_id), String(classesBusinessId));
  assert.equal(String(linked.rows.find((row) => row.booking_ref === 'BOS-CTX-TRANSFERRED')?.business_id), String(classesBusinessId));
  assert.equal(linked.rows.find((row) => row.booking_ref === 'BOS-CTX-UNASSIGNED')?.business_id, null);
  const transferredListing = await pool.query(
    'select business_id from public.listings where id = $1',
    [listingIds[6]],
  );
  assert.equal(String(transferredListing.rows[0]?.business_id), String(pgBusinessId));

  const auditBefore = await pool.query(
    `select event_type, count(*)::int as count from public.business_audit_events
      where business_id = $1 group by event_type order by event_type`,
    [legacyBusinessId],
  );
  assert.ok(auditBefore.rows.some((row) => row.event_type === 'business.backfilled'));
  assert.ok(auditBefore.rows.some((row) => row.event_type === 'services.backfill.schedule_linked'));
  assert.ok(!auditBefore.rows.some((row) => row.event_type === 'services.backfill.booking_linked'));

  // A rerun must not create a duplicate, reactivate an excluded provider, move a
  // booking, or duplicate audit rows.
  await pool.query(backfillSql);
  const counts = await pool.query(
    `select
       (select count(*)::int from public.businesses where owner_user_id = $1 and module_type = 'services') as businesses,
       (select count(*)::int from public.business_audit_events where business_id = $2 and event_type = 'services.backfill.schedule_linked') as schedule_audits,
       (select business_id from public.service_bookings where booking_ref = 'BOS-CTX-UNASSIGNED') as unassigned_booking_business`,
    [legacyServicesId, legacyBusinessId],
  );
  assert.equal(counts.rows[0].businesses, 1);
  assert.equal(counts.rows[0].schedule_audits, 1, 'idempotent rerun must not duplicate row audits');
  assert.equal(counts.rows[0].unassigned_booking_business, null, 'a non-candidate listing must not relink bookings');
  const excludedAfter = await pool.query(
    `select id from public.businesses where owner_user_id = any($1::uuid[]) and module_type = 'services'`,
    [[revokedServicesId, suspendedServicesId]],
  );
  assert.equal(excludedAfter.rowCount, 0);
});

dbTest('provider module authorization, services gate and business RLS', async () => {

  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bos-provider-context-'));
  storePath = path.join(tempDir, 'authoritative-store.json');
  await seedDatabase();

  // The legacy services provider has no business yet; the backfill migration
  // must create an approved provisional services workspace and attach rows.
  const backfillSql = await fs.readFile(
    path.join(process.cwd(), 'supabase/migrations/20261113040000_legacy_services_provider_backfill.sql'),
    'utf8',
  );
  await pool.query(backfillSql);
  const legacyBusiness = await pool.query(
    `select b.id, b.approval_status, b.module_type, b.backfill_source, m.role, a.approval_status as module_status
       from public.businesses b
       join public.business_members m on m.business_id = b.id and m.user_id = $1 and m.status = 'active'
       join public.business_module_access a on a.business_id = b.id and a.module_type = 'services'
      where b.owner_user_id = $1 and b.module_type = 'services'
      limit 1`,
    [legacyServicesId],
  );
  assert.equal(legacyBusiness.rowCount, 1, 'legacy services provider must receive a business');
  assert.equal(legacyBusiness.rows[0].approval_status, 'approved');
  assert.equal(legacyBusiness.rows[0].module_status, 'approved');
  assert.equal(legacyBusiness.rows[0].backfill_source, 'services_provider_backfill_v1');
  assert.equal(legacyBusiness.rows[0].role, 'owner');
  const legacyRows = await pool.query(
    `select business_id from public.service_provider_schedules where provider_id = $1`,
    [legacyServicesId],
  );
  assert.equal(String(legacyRows.rows[0].business_id), String(legacyBusiness.rows[0].id));
  await pool.query(backfillSql);
  const legacyBusinessCount = await pool.query(
    `select count(*)::int as count from public.businesses where owner_user_id = $1 and module_type = 'services'`,
    [legacyServicesId],
  );
  assert.equal(legacyBusinessCount.rows[0].count, 1, 'backfill must be idempotent');

  await startServer();

  // 1. Single-business derivation and shared listing surface.
  const derived = await request('GET', '/api/provider/listings', tokens.owner);
  assert.equal(derived.status, 200, JSON.stringify(derived.data));
  assert.equal(derived.data.ok, true);
  assert.ok(Array.isArray(derived.data.listings), 'owner inventory must be served from PostgreSQL');

  // 2. Restricted member grant and cross-business rejection.
  const forbidden = await request('GET', '/api/provider/listings', tokens.member, classesBusinessId);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.data.error, 'BUSINESS_MODULE_FORBIDDEN');

  await pool.query(
    `update public.business_member_access set allowed_modules=array['classes']::text[]
      where business_id=$1 and user_id=$2`,
    [classesBusinessId, memberId],
  );
  const granted = await request('GET', '/api/provider/listings', tokens.member, classesBusinessId);
  assert.equal(granted.status, 200, JSON.stringify(granted.data));

  const foreignBusiness = await request('GET', '/api/provider/listings', tokens.member, pgBusinessId);
  assert.equal(foreignBusiness.status, 403);
  assert.equal(foreignBusiness.data.error, 'BUSINESS_ACCESS_DENIED');

  // 3. Multi-business selection.
  const ambiguous = await request('GET', '/api/provider/listings', tokens.multi);
  assert.equal(ambiguous.status, 403);
  assert.equal(ambiguous.data.error, 'BUSINESS_CONTEXT_REQUIRED');
  for (const businessId of [classesBusinessId, pgBusinessId]) {
    const selected = await request('GET', '/api/provider/listings', tokens.multi, businessId);
    assert.equal(selected.status, 200, `${businessId}: ${JSON.stringify(selected.data)}`);
  }

  // 4. Newly mapped module-specific provider routes.
  const classesPgBlocks = await request('GET', `/api/provider/pg/listings/${listingIds[1]}/blocks`, tokens.owner, classesBusinessId);
  assert.equal(classesPgBlocks.status, 403);
  assert.equal(classesPgBlocks.data.error, 'BUSINESS_MODULE_MISMATCH');

  const classesVenueBlocks = await request('GET', '/api/provider/venues/venue-not-owned/blocks', tokens.owner, classesBusinessId);
  assert.equal(classesVenueBlocks.status, 403);
  assert.equal(classesVenueBlocks.data.error, 'BUSINESS_MODULE_MISMATCH');

  const classesVenueReschedule = await request('PATCH', '/api/provider/venue-bookings/00000000-0000-4000-8000-000000000001/reschedule', tokens.owner, classesBusinessId, { startsAt: '2026-12-01T10:00:00.000Z', endsAt: '2026-12-01T12:00:00.000Z', slotType: 'full_day' });
  assert.equal(classesVenueReschedule.status, 403);
  assert.equal(classesVenueReschedule.data.error, 'BUSINESS_MODULE_MISMATCH');

  const classesOwnModule = await request('GET', '/api/provider/classes/enrollments', tokens.owner, classesBusinessId);
  assert.equal(classesOwnModule.status, 200, JSON.stringify(classesOwnModule.data));

  const pgOwnModule = await request('GET', `/api/provider/pg/listings/${listingIds[1]}/blocks`, tokens.multi, pgBusinessId);
  assert.equal(pgOwnModule.status, 200, JSON.stringify(pgOwnModule.data));

  const venuesOwnModule = await request('GET', '/api/provider/venues/venue-not-owned/blocks', tokens.venuesOwner, venuesBusinessId);
  assert.notEqual(venuesOwnModule.data?.error, 'BUSINESS_MODULE_MISMATCH', JSON.stringify(venuesOwnModule.data));

  const venuesReschedule = await request('PATCH', '/api/provider/venue-bookings/00000000-0000-4000-8000-000000000001/reschedule', tokens.venuesOwner, venuesBusinessId, { startsAt: '2026-12-01T10:00:00.000Z', endsAt: '2026-12-01T12:00:00.000Z', slotType: 'full_day' });
  assert.notEqual(venuesReschedule.data?.error, 'BUSINESS_MODULE_MISMATCH', JSON.stringify(venuesReschedule.data));

  // 5. Listing create/update must match the selected business module.
  const mismatchCreate = await request('POST', '/api/provider/listings', tokens.owner, classesBusinessId, {
    id: 'lst-ctx-pg-mismatch',
    title: 'Cross-module PG listing',
    categoryId: 'pg-boys',
    subcategory: 'Single Sharing',
    entityType: 'pg',
    price: 9000,
    priceUnit: 'per month',
    payload: { city: 'Test City' },
  });
  assert.equal(mismatchCreate.status, 403, JSON.stringify(mismatchCreate.data));
  assert.equal(mismatchCreate.data.error, 'BUSINESS_MODULE_MISMATCH');

  const validCreate = await request('POST', '/api/provider/listings', tokens.owner, classesBusinessId, {
    id: listingIds[0],
    title: 'Context algebra course',
    categoryId: 'class-academic',
    subcategory: 'Academic',
    entityType: 'course',
    price: 5000,
    priceUnit: 'per course',
    payload: { city: 'Test City' },
  });
  assert.equal(validCreate.status, 201, JSON.stringify(validCreate.data));

  const legacyUpdate = await request('PATCH', `/api/provider/listings/${listingIds[1]}`, tokens.owner, classesBusinessId, {
    title: 'Legacy cross-module PG listing renamed',
  });
  assert.equal(legacyUpdate.status, 403, JSON.stringify(legacyUpdate.data));
  assert.equal(legacyUpdate.data.error, 'BUSINESS_MODULE_MISMATCH');

  // Admin keeps the shared surface.
  const adminListings = await request('GET', '/api/provider/listings', tokens.admin);
  assert.equal(adminListings.status, 200, JSON.stringify(adminListings.data));
  const adminCreate = await request('POST', '/api/provider/listings', tokens.superAdmin, null, {
    id: listingIds[2],
    ownerId,
    title: 'Admin shared listing',
    categoryId: 'pg-boys',
    subcategory: 'Single Sharing',
    entityType: 'pg',
    price: 8000,
    priceUnit: 'per month',
    payload: { city: 'Test City' },
  });
  assert.equal(adminCreate.status, 201, JSON.stringify(adminCreate.data));

  // 6. Services provider/worker routes require the services module.
  const servicesSchedule = await request('GET', '/api/services/provider/schedule', tokens.servicesOwner);
  assert.equal(servicesSchedule.status, 200, JSON.stringify(servicesSchedule.data));
  const legacySchedule = await request('GET', '/api/services/provider/schedule', tokens.legacyServices);
  assert.equal(legacySchedule.status, 200, JSON.stringify(legacySchedule.data));
  const servicesCredentials = await request('GET', '/api/services/provider/credentials', tokens.servicesOwner);
  assert.equal(servicesCredentials.status, 200, JSON.stringify(servicesCredentials.data));
  const servicesWorkers = await request('GET', '/api/services/workers', tokens.servicesOwner);
  assert.equal(servicesWorkers.status, 200, JSON.stringify(servicesWorkers.data));

  for (const url of ['/api/services/provider/schedule', '/api/services/provider/credentials', '/api/services/workers']) {
    const denied = await request('GET', url, tokens.owner, classesBusinessId);
    assert.equal(denied.status, 403, `${url}: ${JSON.stringify(denied.data)}`);
    assert.equal(denied.data.error, 'BUSINESS_MODULE_MISMATCH');
  }
  const deniedWorkerCreate = await request('POST', '/api/services/workers', tokens.owner, classesBusinessId, {
    fullName: 'Cross module worker',
    phone: '+91 90000 00001',
  });
  assert.equal(deniedWorkerCreate.status, 403);
  assert.equal(deniedWorkerCreate.data.error, 'BUSINESS_MODULE_MISMATCH');

  // Customers bypass the business gate, but worker creation stays provider-only.
  const customerWorker = await request('POST', '/api/services/workers', tokens.customer, null, {
    fullName: 'Customer worker attempt',
    phone: '+91 90000 00002',
  });
  assert.equal(customerWorker.status, 403, JSON.stringify(customerWorker.data));
  assert.equal(customerWorker.data.error, 'ACTIVE_PROVIDER_REQUIRED');

  // A services member whose grant omits services is refused; granting it works.
  const staffDenied = await request('GET', '/api/services/provider/schedule', tokens.servicesStaff, servicesBusinessId);
  assert.equal(staffDenied.status, 403);
  assert.equal(staffDenied.data.error, 'BUSINESS_MODULE_FORBIDDEN');
  await pool.query(
    `update public.business_member_access set allowed_modules=array['services']::text[]
      where business_id=$1 and user_id=$2`,
    [servicesBusinessId, servicesStaffId],
  );
  const staffAllowed = await request('GET', '/api/services/provider/schedule', tokens.servicesStaff, servicesBusinessId);
  assert.equal(staffAllowed.status, 200, JSON.stringify(staffAllowed.data));

  // Services module approval is required.
  await pool.query(
    `update public.business_module_access set approval_status='pending' where business_id=$1 and module_type='services'`,
    [servicesBusinessId],
  );
  const servicesUnapproved = await request('GET', '/api/services/provider/schedule', tokens.servicesOwner, servicesBusinessId);
  assert.equal(servicesUnapproved.status, 403);
  assert.equal(servicesUnapproved.data.error, 'BUSINESS_ACCESS_DENIED');
  await pool.query(
    `update public.business_module_access set approval_status='approved' where business_id=$1 and module_type='services'`,
    [servicesBusinessId],
  );

  // 7. Ordinary admin reads work but privileged writes are Super Admin only.
  const adminRead = await asAuthenticated(adminId, (client) => client.query(
    'select id from public.businesses where id = $1',
    [classesBusinessId],
  ));
  assert.equal(adminRead.rowCount, 1, 'ordinary admin keeps business read access');

  const adminUpdate = await asAuthenticated(adminId, (client) => client.query(
    `update public.businesses set approval_status = 'suspended' where id = $1 returning id`,
    [classesBusinessId],
  ));
  assert.equal(adminUpdate.rowCount, 0, 'ordinary admin cannot update business approval through RLS');

  await assert.rejects(
    asAuthenticated(adminId, (client) => client.query(
      `insert into public.business_module_access (business_id, module_type, enabled, approval_status)
       values ($1, 'movies', true, 'approved')`,
      [classesBusinessId],
    )),
    permissionDenied,
    'ordinary admin cannot write module access',
  );

  const superAdminUpdate = await asAuthenticated(superAdminId, (client) => client.query(
    `update public.businesses set approval_status = 'suspended' where id = $1 returning id`,
    [classesBusinessId],
  ));
  assert.equal(superAdminUpdate.rowCount, 1, 'Super Admin can update business approval');

  const superAdminModule = await asAuthenticated(superAdminId, (client) => client.query(
    `update public.business_module_access set enabled = false
      where business_id = $1 and module_type = 'classes' returning id`,
    [classesBusinessId],
  ));
  assert.equal(superAdminModule.rowCount, 1, 'Super Admin can update module access');

  // 7b. Business creation is the authorization boundary: the owner-membership
  // trigger is SECURITY DEFINER and would otherwise create access for any
  // business row that passed INSERT RLS.
  await assert.rejects(
    asAuthenticated(adminId, (client) => client.query(
      `insert into public.businesses
         (business_ref,name,module_type,owner_user_id,approval_status,is_enabled)
       values ('BIZ-TEST-ADMIN-APPROVED','Admin approved attempt','services',$1,'approved',true)`,
      [adminId],
    )),
    permissionDenied,
    'ordinary admin cannot create an approved business',
  );
  await assert.rejects(
    asAuthenticated(adminId, (client) => client.query(
      `insert into public.businesses
         (business_ref,name,module_type,owner_user_id,approval_status,is_enabled)
       values ('BIZ-TEST-ADMIN-PENDING','Admin pending attempt','services',$1,'pending',true)`,
      [adminId],
    )),
    permissionDenied,
    'ordinary admin cannot use the provider owner creation path',
  );
  await assert.rejects(
    asAuthenticated(ownerId, (client) => client.query(
      `insert into public.businesses
         (business_ref,name,module_type,owner_user_id,approval_status,is_enabled)
       values ('BIZ-TEST-OWNER-APPROVED','Owner approved attempt','services',$1,'approved',true)`,
      [ownerId],
    )),
    permissionDenied,
    'a provider cannot self-create an approved business',
  );

  const ownerPending = await asAuthenticated(ownerId, async (client) => {
    const business = await client.query(
      `insert into public.businesses
         (business_ref,name,module_type,owner_user_id,approval_status,is_enabled)
       values ('BIZ-TEST-OWNER-PENDING','Owner pending business','services',$1,'pending',true)
       returning id`,
      [ownerId],
    );
    const member = await client.query(
      'select role, status from public.business_members where business_id = $1 and user_id = $2',
      [business.rows[0].id, ownerId],
    );
    const module = await client.query(
      "select enabled, approval_status from public.business_module_access where business_id = $1 and module_type = 'services'",
      [business.rows[0].id],
    );
    return { member: member.rows[0], module: module.rows[0] };
  });
  assert.equal(ownerPending.member?.role, 'owner');
  assert.equal(ownerPending.member?.status, 'active');
  assert.equal(ownerPending.module?.enabled, false);
  assert.equal(ownerPending.module?.approval_status, 'pending');

  const superCreated = await asAuthenticated(superAdminId, async (client) => {
    const business = await client.query(
      `insert into public.businesses
         (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,approved_by,approved_at)
       values ('BIZ-TEST-SUPER-APPROVED','Super approved business','services',$1,'approved',true,$1,now())
       returning id`,
      [superAdminId],
    );
    const member = await client.query(
      'select role, status from public.business_members where business_id = $1 and user_id = $2',
      [business.rows[0].id, superAdminId],
    );
    const module = await client.query(
      "select enabled, approval_status from public.business_module_access where business_id = $1 and module_type = 'services'",
      [business.rows[0].id],
    );
    return { member: member.rows[0], module: module.rows[0] };
  });
  assert.equal(superCreated.member?.role, 'owner');
  assert.equal(superCreated.member?.status, 'active');
  assert.equal(superCreated.module?.enabled, true);
  assert.equal(superCreated.module?.approval_status, 'approved');

  await assert.rejects(
    asAuthenticated(adminId, (client) => client.query(
      `insert into public.business_members (business_id,user_id,role,status)
       values ($1,$2,'owner','active')`,
      [venuesBusinessId, adminId],
    )),
    permissionDenied,
    'ordinary admin cannot assign an owner membership',
  );
  const superOwnerMembership = await asAuthenticated(superAdminId, (client) => client.query(
    `insert into public.business_members (business_id,user_id,role,status)
     values ($1,$2,'owner','active') returning id`,
    [venuesBusinessId, customerId],
  ));
  assert.equal(superOwnerMembership.rowCount, 1, 'Super Admin can assign an owner membership');

  // 8. Member scopes are server-mediated: direct PostgREST writes are denied.
  await assert.rejects(
    asAuthenticated(managerId, (client) => client.query(
      `update public.business_member_access set allowed_modules = array['pg_hostels']::text[]
        where business_id = $1 and user_id = $2`,
      [classesBusinessId, managerId],
    )),
    permissionDenied,
    'manager cannot widen their own scope',
  );
  await assert.rejects(
    asAuthenticated(managerId, (client) => client.query(
      `update public.business_member_access set allowed_modules = array['pg_hostels']::text[]
        where business_id = $1 and user_id = $2`,
      [classesBusinessId, managerTwoId],
    )),
    permissionDenied,
    'manager cannot change another manager scope',
  );
  await assert.rejects(
    asAuthenticated(managerId, (client) => client.query(
      `delete from public.business_member_access where business_id = $1 and user_id = $2`,
      [classesBusinessId, managerId],
    )),
    permissionDenied,
    'manager cannot delete their own restriction',
  );
  await assert.rejects(
    asAuthenticated(ownerId, (client) => client.query(
      `update public.business_member_access set allowed_modules = array['classes']::text[]
        where business_id = $1 and user_id = $2`,
      [classesBusinessId, memberId],
    )),
    permissionDenied,
    'direct authenticated writes are closed for owners too; the API is the write path',
  );

  const ownScope = await asAuthenticated(managerId, (client) => client.query(
    'select allowed_modules from public.business_member_access where business_id = $1 and user_id = $2',
    [classesBusinessId, managerId],
  ));
  assert.equal(ownScope.rowCount, 1, 'a member can still read their own scope');

  // 9. The server-mediated owner workflow still changes a member scope.
  const ownerScopeUpdate = await request('PUT', `/api/businesses/${classesBusinessId}/members/${memberId}/access`, tokens.owner, null, {
    allowedModules: ['classes'],
  });
  assert.equal(ownerScopeUpdate.status, 200, JSON.stringify(ownerScopeUpdate.data));
  const managerRead = await request('GET', '/api/provider/listings', tokens.manager, classesBusinessId);
  assert.equal(managerRead.status, 200, JSON.stringify(managerRead.data));
});

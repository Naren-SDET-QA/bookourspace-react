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

const seededUserIds = [
  ownerId, memberId, multiId, adminId, servicesOwnerId, servicesStaffId,
  venuesOwnerId, superAdminId, managerId, managerTwoId, customerId, legacyServicesId,
];

const businessRefs = {
  classes: 'BIZ-CTX-PG-CLASSES',
  pg: 'BIZ-CTX-PG-HOSTELS',
  services: 'BIZ-CTX-PG-SERVICES',
  venues: 'BIZ-CTX-PG-VENUES',
};

const listingIds = ['lst-ctx-class-ok', 'lst-ctx-legacy-pg', 'lst-ctx-admin-shared', 'lst-ctx-pg-mismatch', 'lst-ctx-legacy-svc'];

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
  pool = new Pool({ connectionString, max: 4 });
  await pool.query('delete from public.listings where id = any($1::text[])', [listingIds]);
  await pool.query('delete from public.businesses where business_ref = any($1::text[])', [Object.values(businessRefs)]);
  await pool.query("delete from public.businesses where backfill_source = 'services_provider_backfill_v1'");
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
       ($12, 'ctx-legacy-services@example.test', '{}'::jsonb)
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
       ($12, 'ctx-legacy-services@example.test', 'Legacy Services Provider', 'provider', 'active')
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
  classesBusinessId = classes.rows[0].id;
  pgBusinessId = pgHostel.rows[0].id;
  servicesBusinessId = services.rows[0].id;
  venuesBusinessId = venues.rows[0].id;

  await pool.query(
    `insert into public.business_module_access (business_id, module_type, enabled, approval_status, approved_at)
     values ($1,'classes',true,'approved',now()), ($2,'pg_hostels',true,'approved',now()),
            ($3,'services',true,'approved',now()), ($4,'venues',true,'approved',now())
     on conflict (business_id, module_type) do update set enabled=true, approval_status='approved'`,
    [classesBusinessId, pgBusinessId, servicesBusinessId, venuesBusinessId],
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
       ($1,$12,'manager','active',now())
     on conflict (business_id, user_id) do update set role=excluded.role, status='active', accepted_at=now()`,
    [classesBusinessId, ownerId, memberId, multiId, pgBusinessId, servicesBusinessId, servicesOwnerId, servicesStaffId, venuesBusinessId, venuesOwnerId, managerId, managerTwoId],
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
     values ($1, '{1,2,3,4,5,6}', '09:00', '19:00')
     on conflict (provider_id) do update set working_days = excluded.working_days`,
    [legacyServicesId],
  );
}

after(async () => {
  await stopServer();
  if (pool) {
    await pool.query('delete from public.listings where id = any($1::text[])', [listingIds]).catch(() => {});
    await pool.query('delete from public.businesses where business_ref = any($1::text[])', [Object.values(businessRefs)]).catch(() => {});
    await pool.query("delete from public.businesses where backfill_source = 'services_provider_backfill_v1'").catch(() => {});
    await pool.query('delete from public.profiles where id = any($1::uuid[])', [seededUserIds]).catch(() => {});
    await pool.query('delete from auth.users where id = any($1::uuid[])', [seededUserIds]).catch(() => {});
    await pool.end().catch(() => {});
  }
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import pg from 'pg';
import {
  evaluateProviderBusinessContext,
  permissionForProviderRoute,
  strictPermissionDefaults,
} from '../src/lib/businessAccess.ts';
import {
  evaluateCustomerPermission,
  permissionForCustomerRoute,
  strictCustomerDefaults,
} from '../src/server/customerPermissions.ts';

/**
 * Permission gates against real grant rows.
 *
 * The unit suites prove the decision rules and the SQL suites prove the stored
 * shape; this one joins them: it reads grants from the actual schema with the
 * same projections the middleware uses, enables the strict flags through the
 * environment, and asserts the decisions both gates return.
 *
 * It deliberately does not boot Express — the middleware is a thin
 * "query -> evaluate -> 403" wrapper, and the source guards below keep this
 * test's SQL honest against `server.ts`.
 *
 * Runs only when BOS_LISTINGS_DATABASE_URL points at a migrated database;
 * `supabase/tests/run_local_validation.sh` supplies a disposable one.
 */

const { Pool } = pg;
const connectionString = process.env.BOS_LISTINGS_DATABASE_URL;
const dbAvailable = Boolean(connectionString);
const dbTest = dbAvailable ? test : test.skip;

process.env.BOS_STRICT_PERMISSION_DEFAULTS = '1';
process.env.BOS_STRICT_CUSTOMER_DEFAULTS = '1';

/**
 * Fixtures are removed in dependency order: businesses first, then accounts.
 * Deleting an account cascades into `customer_module_access`, which is exactly
 * the path 20261114120000_customer_audit_profile_cascade.sql repaired, so this
 * cleanup also exercises account deletion against real grant rows.
 */
const FIXTURE_USERS = [
  'd1d1d1d1-1111-4111-8111-ddddddddddd1',
  'd1d1d1d1-1111-4111-8111-ddddddddddd2',
  'd1d1d1d1-1111-4111-8111-ddddddddddd3',
  'd1d1d1d1-1111-4111-8111-ddddddddddd4',
  'd1d1d1d1-1111-4111-8111-ddddddddddd5',
  'd1d1d1d1-1111-4111-8111-ddddddddddd6',
  'd1d1d1d1-1111-4111-8111-ddddddddddd7',
];

async function cleanupFixtures() {
  await pool.query('delete from public.businesses where id = any($1::uuid[])', [
    [PG_BUSINESS, STAYS_BUSINESS],
  ]);
  await pool.query('delete from auth.users where id = any($1::uuid[])', [FIXTURE_USERS]);
}

const owner = 'd1d1d1d1-1111-4111-8111-ddddddddddd1';
const staffWithoutRow = 'd1d1d1d1-1111-4111-8111-ddddddddddd2';
const staffRestricted = 'd1d1d1d1-1111-4111-8111-ddddddddddd3';
const staffFull = 'd1d1d1d1-1111-4111-8111-ddddddddddd4';
const staysStaff = 'd1d1d1d1-1111-4111-8111-ddddddddddd5';
const customerGranted = 'd1d1d1d1-1111-4111-8111-ddddddddddd6';
const customerWithoutGrants = 'd1d1d1d1-1111-4111-8111-ddddddddddd7';

const PG_BUSINESS = 'e1e1e1e1-1111-4111-8111-eeeeeeeeeee1';
const STAYS_BUSINESS = 'e1e1e1e1-1111-4111-8111-eeeeeeeeeee2';

let pool;

/** The exact projection the provider middleware runs. */
const PROVIDER_CONTEXT_SQL = `
  select b.id,b.module_type,b.approval_status,b.is_enabled,m.role,
         a.enabled as module_enabled,a.approval_status as module_approval_status,
         ma.allowed_modules as member_modules,
         to_jsonb(ma) -> 'allowed_sections' as member_sections,
         to_jsonb(ma) -> 'allowed_actions' as member_actions
    from public.businesses b
    join public.business_members m on m.business_id=b.id and m.user_id=$2 and m.status='active'
    join public.business_module_access a on a.business_id=b.id and a.module_type=b.module_type
    left join public.business_member_access ma on ma.business_id=b.id and ma.user_id=m.user_id
   where b.id=$1 limit 1`;

/** The exact projection the customer gate runs. */
const CUSTOMER_GRANTS_SQL = `
  select module_key,
         to_jsonb(cma) -> 'allowed_sections' as allowed_sections,
         to_jsonb(cma) -> 'allowed_actions' as allowed_actions
    from public.customer_module_access cma
   where user_id = $1
     and (expires_at is null or expires_at > now())`;

async function providerDecision(businessId, userId, method, url) {
  const { rows } = await pool.query(PROVIDER_CONTEXT_SQL, [businessId, userId]);
  return evaluateProviderBusinessContext({
    role: 'provider',
    path: url,
    business: rows[0],
    permission: permissionForProviderRoute(method, url),
    strictDefaults: strictPermissionDefaults(process.env),
  });
}

async function customerDecision(userId, method, url) {
  const { rows } = await pool.query(CUSTOMER_GRANTS_SQL, [userId]);
  return evaluateCustomerPermission({
    role: 'customer',
    grants: rows,
    permission: permissionForCustomerRoute(method, url),
    strictDefaults: strictCustomerDefaults(process.env),
  });
}

before(async () => {
  if (!dbAvailable) return;
  pool = new Pool({ connectionString, max: 2 });
  await cleanupFixtures();
  await pool.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1,'gate-owner@example.test','{}'::jsonb),
       ($2,'gate-staff-none@example.test','{}'::jsonb),
       ($3,'gate-staff-restricted@example.test','{}'::jsonb),
       ($4,'gate-staff-full@example.test','{}'::jsonb),
       ($5,'gate-staff-stays@example.test','{}'::jsonb),
       ($6,'gate-customer-granted@example.test','{}'::jsonb),
       ($7,'gate-customer-none@example.test','{}'::jsonb)`,
    [owner, staffWithoutRow, staffRestricted, staffFull, staysStaff, customerGranted, customerWithoutGrants],
  );
  await pool.query(
    `update public.profiles set role='provider', account_status='active'
      where id = any($1::uuid[])`,
    [[owner, staffWithoutRow, staffRestricted, staffFull, staysStaff]],
  );
  await pool.query(
    `update public.profiles set role='customer', account_status='active'
      where id = any($1::uuid[])`,
    [[customerGranted, customerWithoutGrants]],
  );
  await pool.query(
    `insert into public.platform_module_flags (module_key, is_enabled) values ('pg', true), ('hotels', true)
     on conflict (module_key) do update set is_enabled = true`,
  );
  // The business insert trigger creates the owner membership and the approved
  // module-access row, so the fixtures below only add the non-owner members.
  await pool.query(
    `insert into public.businesses (id, business_ref, name, module_type, owner_user_id, approval_status)
     values ($1,'GATE-SQL-0001','Gate SQL PG','pg_hostels',$3,'approved'),
            ($2,'GATE-SQL-0002','Gate SQL Stays','hotel_stay',$3,'approved')`,
    [PG_BUSINESS, STAYS_BUSINESS, owner],
  );
  await pool.query(
    `insert into public.business_members (business_id, user_id, role, status, accepted_at) values
       ($1,$2,'staff','active', now()),
       ($1,$3,'staff','active', now()),
       ($1,$4,'staff','active', now()),
       ($5,$4,'staff','active', now()),
       ($5,$6,'staff','active', now())`,
    [PG_BUSINESS, staffWithoutRow, staffRestricted, staffFull, STAYS_BUSINESS, staysStaff],
  );
  // Restricted: only the bookings section, only view.
  await pool.query(
    `insert into public.business_member_access
       (business_id, user_id, allowed_modules, allowed_sections, allowed_actions)
     values ($1,$2,array['pg_hostels'],'{"pg_hostels":["bookings"]}'::jsonb,'{"pg_hostels":["view"]}'::jsonb)`,
    [PG_BUSINESS, staffRestricted],
  );
  // Explicit full grant, the shape the backfill writes.
  await pool.query(
    `insert into public.business_member_access
       (business_id, user_id, allowed_modules, allowed_sections, allowed_actions)
     values ($1,$2,array['pg_hostels'],'{}'::jsonb,'{}'::jsonb)`,
    [PG_BUSINESS, staffFull],
  );
  // Section-limited stays member: properties only.
  await pool.query(
    `insert into public.business_member_access
       (business_id, user_id, allowed_modules, allowed_sections, allowed_actions)
     values ($1,$2,array['hotel_stay'],'{"hotel_stay":["properties"]}'::jsonb,'{}'::jsonb)`,
    [STAYS_BUSINESS, staysStaff],
  );
  // Customer: pg with view only, plus an already expired hotels grant.
  await pool.query(
    `insert into public.customer_module_access (user_id, module_key, expires_at, allowed_actions)
     values ($1,'pg', null, '["view"]'::jsonb),
            ($1,'hotels', now() - interval '1 hour', '[]'::jsonb)`,
    [customerGranted],
  );
});

after(async () => {
  if (!pool) return;
  await cleanupFixtures();
  await pool.end();
});

dbTest('the strict flags are read from the environment, not hard-coded', () => {
  assert.equal(strictPermissionDefaults({ BOS_STRICT_PERMISSION_DEFAULTS: '1' }), true);
  assert.equal(strictPermissionDefaults({ BOS_STRICT_PERMISSION_DEFAULTS: '0' }), false);
  assert.equal(strictCustomerDefaults({ BOS_STRICT_CUSTOMER_DEFAULTS: '1' }), true);
  assert.equal(strictCustomerDefaults({}), false);
  assert.equal(strictPermissionDefaults(process.env), true);
  assert.equal(strictCustomerDefaults(process.env), true);
});

dbTest('strict mode refuses a member who has no grant row', async () => {
  assert.deepEqual(
    await providerDecision(PG_BUSINESS, staffWithoutRow, 'GET', '/api/pg/bookings'),
    { ok: false, status: 403, error: 'BUSINESS_PERMISSIONS_REQUIRED' },
  );
  // The same member was unrestricted before the flag existed.
  const { rows } = await pool.query(PROVIDER_CONTEXT_SQL, [PG_BUSINESS, staffWithoutRow]);
  assert.deepEqual(
    evaluateProviderBusinessContext({
      role: 'provider',
      path: '/api/pg/bookings',
      business: rows[0],
      permission: permissionForProviderRoute('GET', '/api/pg/bookings'),
      strictDefaults: false,
    }),
    { ok: true },
  );
});

dbTest('strict mode allows the explicit full grant the backfill writes', async () => {
  for (const [method, url] of [
    ['GET', '/api/pg/bookings'],
    ['POST', '/api/pg/bookings'],
    ['DELETE', '/api/pg/bookings/b-1'],
  ]) {
    assert.deepEqual(await providerDecision(PG_BUSINESS, staffFull, method, url), { ok: true });
  }
});

dbTest('a restricted member is limited by the stored section and action', async () => {
  assert.deepEqual(
    await providerDecision(PG_BUSINESS, staffRestricted, 'GET', '/api/pg/bookings'),
    { ok: true },
  );
  assert.deepEqual(
    await providerDecision(PG_BUSINESS, staffRestricted, 'POST', '/api/pg/bookings'),
    { ok: false, status: 403, error: 'BUSINESS_ACTION_FORBIDDEN' },
  );
});

dbTest('a stays member is limited to the sections it was granted', async () => {
  assert.deepEqual(
    await providerDecision(STAYS_BUSINESS, staysStaff, 'GET', '/api/stays/host/properties'),
    { ok: true },
  );
  assert.deepEqual(
    await providerDecision(STAYS_BUSINESS, staysStaff, 'GET', '/api/stays/host/units'),
    { ok: false, status: 403, error: 'BUSINESS_SECTION_FORBIDDEN' },
  );
});

dbTest('the owner is never restricted by a stored grant row', async () => {
  assert.deepEqual(
    await providerDecision(PG_BUSINESS, owner, 'DELETE', '/api/pg/bookings/b-1'),
    { ok: true },
  );
});

dbTest('strict mode refuses a customer who has no grant rows', async () => {
  assert.deepEqual(
    await customerDecision(customerWithoutGrants, 'GET', '/api/pg/bookings'),
    { ok: false, status: 403, error: 'CUSTOMER_PERMISSIONS_REQUIRED' },
  );
  // Without the flag the same customer keeps the legacy behaviour.
  const { rows } = await pool.query(CUSTOMER_GRANTS_SQL, [customerWithoutGrants]);
  assert.deepEqual(
    evaluateCustomerPermission({
      role: 'customer',
      grants: rows,
      permission: permissionForCustomerRoute('GET', '/api/pg/bookings'),
      strictDefaults: false,
    }),
    { ok: true },
  );
});

dbTest('a customer grant with a view-only action limits writes and ungranted modules', async () => {
  assert.deepEqual(await customerDecision(customerGranted, 'GET', '/api/pg/bookings'), { ok: true });
  assert.deepEqual(
    await customerDecision(customerGranted, 'POST', '/api/pg/bookings'),
    { ok: false, status: 403, error: 'CUSTOMER_ACTION_FORBIDDEN' },
  );
  // The hotels grant is expired, so the module is simply absent.
  assert.deepEqual(
    await customerDecision(customerGranted, 'GET', '/api/stays/bookings'),
    { ok: false, status: 403, error: 'CUSTOMER_MODULE_FORBIDDEN' },
  );
});

dbTest('the middleware reads the same projections this test reads', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
  const squash = (text) => text.replace(/\s+/g, ' ');
  const server = squash(source);
  assert.ok(
    server.includes(squash("to_jsonb(ma) -> 'allowed_sections' as member_sections")),
    'provider middleware no longer reads allowed_sections through to_jsonb',
  );
  assert.ok(
    server.includes(squash("to_jsonb(cma) -> 'allowed_sections' as allowed_sections")),
    'customer gate no longer reads customer grant sections through to_jsonb',
  );
  assert.ok(server.includes('strictPermissionDefaults(process.env)'));
  assert.ok(server.includes('strictCustomerDefaults(process.env)'));
});

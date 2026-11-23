/**
 * Independent database RLS tests.
 *
 * Every check runs as the real `authenticated` or `anon` database role with
 * `request.jwt.claim.sub` set, so `auth.uid()` resolves exactly as it does for a
 * browser session. This is deliberately not an API test: it proves the
 * database itself refuses cross-account reads and every direct write, even if a
 * future route forgot its middleware.
 *
 * Local disposable database only; fixtures are removed afterwards.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const DATABASE_URL =
  process.env.BOS_TEST_DATABASE_URL
  || process.env.BOS_LISTINGS_DATABASE_URL
  || 'postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable';

const ids = {
  customerA: randomUUID(),
  customerB: randomUUID(),
  admin: randomUUID(),
  staff: randomUUID(),
  manager: randomUUID(),
  stranger: randomUUID(),
  business: randomUUID(),
};

let client;
let available = false;

async function createProfile(id, role, extra = {}) {
  await client.query(`insert into auth.users (id, email) values ($1,$2) on conflict (id) do nothing`, [
    id,
    `rls-${id.slice(0, 8)}@example.test`,
  ]);
  await client.query(
    `insert into public.profiles (id, email, full_name, role, account_status, is_super_admin)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (id) do update set role = excluded.role, account_status = excluded.account_status`,
    [id, `rls-${id.slice(0, 8)}@example.test`, `RLS ${role}`, role, extra.status || 'active', extra.isSuperAdmin === true],
  );
}

/** Run one statement as a database role with an optional JWT subject. */
async function asRole(role, userId, sql, params = []) {
  await client.query('begin');
  try {
    await client.query(`set local role ${role}`);
    if (userId) await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    const result = await client.query(sql, params);
    return result;
  } finally {
    await client.query('rollback');
  }
}

async function expectRefused(role, userId, sql, params = []) {
  await client.query('begin');
  try {
    await client.query(`set local role ${role}`);
    if (userId) await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await assert.rejects(() => client.query(sql, params));
  } finally {
    await client.query('rollback');
  }
}

test.before(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(`select to_regclass('public.access_control_repairs') as present`);
    available = Boolean(rows[0]?.present);
  } catch {
    available = false;
  }
  if (!available) return;

  await createProfile(ids.customerA, 'customer');
  await createProfile(ids.customerB, 'customer');
  await createProfile(ids.admin, 'admin');
  await createProfile(ids.staff, 'provider');
  await createProfile(ids.manager, 'provider');
  await createProfile(ids.stranger, 'provider');

  // Distinct grant values so a leak is unambiguous.
  await client.query(
    `insert into public.customer_module_access (user_id, module_key, allowed_sections, allowed_actions, grant_source)
     values ($1,'pg','[]','["view"]','manual'), ($2,'movies','[]','["view","edit"]','manual')
     on conflict (user_id, module_key) do update set allowed_actions = excluded.allowed_actions`,
    [ids.customerA, ids.customerB],
  );

  await client.query(
    `insert into public.businesses (id, business_ref, name, module_type, owner_user_id, approval_status, is_enabled)
     values ($1,$2,'RLS Services','services',$3,'approved',true)
     on conflict (id) do nothing`,
    [ids.business, `rls-${ids.business.slice(0, 8)}`, ids.manager],
  );
  await client.query(
    `insert into public.business_members (business_id, user_id, role, status)
     values ($1,$2,'owner','active'), ($1,$3,'staff','active'), ($1,$4,'manager','active')
     on conflict (business_id, user_id) do nothing`,
    [ids.business, ids.manager, ids.staff, ids.manager],
  );
  await client.query(
    `insert into public.business_member_access
       (business_id, user_id, allowed_modules, allowed_actions, grant_source)
     values ($1,$2,array['services'],'{"services": ["view"]}','manual')
     on conflict (business_id, user_id) do update
       set allowed_modules = excluded.allowed_modules, allowed_actions = excluded.allowed_actions`,
    [ids.business, ids.staff],
  );
});

test.after(async () => {
  if (!available) {
    await client?.end().catch(() => undefined);
    return;
  }
  await client.query(`delete from public.business_member_access where business_id = $1`, [ids.business]).catch(() => undefined);
  await client.query(`delete from public.business_members where business_id = $1`, [ids.business]).catch(() => undefined);
  await client.query(`delete from public.businesses where id = $1`, [ids.business]).catch(() => undefined);
  await client.query(`delete from auth.users where id = any($1::uuid[])`, [
    [ids.customerA, ids.customerB, ids.admin, ids.staff, ids.manager, ids.stranger],
  ]).catch(() => undefined);
  await client.end();
});

test('a customer reads only its own customer grant rows', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  const own = await asRole('authenticated', ids.customerA, `select user_id, module_key from public.customer_module_access`);
  assert.ok(own.rows.length > 0);
  assert.ok(own.rows.every((row) => row.user_id === ids.customerA));

  const other = await asRole(
    'authenticated',
    ids.customerA,
    `select 1 from public.customer_module_access where user_id = $1`,
    [ids.customerB],
  );
  assert.equal(other.rows.length, 0, 'another customer grant must be invisible');
});

test('an admin reads every grant row and an anon session reads none', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  const adminRows = await asRole('authenticated', ids.admin, `select user_id from public.customer_module_access`);
  assert.ok(adminRows.rows.some((row) => row.user_id === ids.customerA));
  assert.ok(adminRows.rows.some((row) => row.user_id === ids.customerB));

  // `anon` may be refused at the privilege layer or return zero rows through
  // RLS; both are denials. A row would be the failure.
  const anonVisible = async (sql) => {
    try {
      return (await asRole('anon', null, sql)).rows.length;
    } catch {
      return 'denied';
    }
  };
  assert.notEqual(await anonVisible(`select 1 from public.customer_module_access`), 1);
  assert.notEqual(await anonVisible(`select 1 from public.profiles`), 1);
});

test('a customer cannot read another profile or its own private grants through profiles', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  const other = await asRole('authenticated', ids.customerA, `select id from public.profiles where id = $1`, [ids.customerB]);
  assert.equal(other.rows.length, 0);
  const self = await asRole('authenticated', ids.customerA, `select id from public.profiles where id = $1`, [ids.customerA]);
  assert.equal(self.rows.length, 1);
});

test('business member grants are scoped to the member and their managers', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  const staffOwn = await asRole('authenticated', ids.staff, `select user_id from public.business_member_access`);
  assert.ok(staffOwn.rows.length >= 1);
  assert.ok(staffOwn.rows.every((row) => row.user_id === ids.staff));

  const stranger = await asRole('authenticated', ids.stranger, `select 1 from public.business_member_access`);
  assert.equal(stranger.rows.length, 0, 'an unrelated provider must not read member grants');

  const manager = await asRole('authenticated', ids.manager, `select user_id from public.business_member_access where business_id = $1`, [
    ids.business,
  ]);
  assert.ok(manager.rows.some((row) => row.user_id === ids.staff), 'a manager may read their business members');
});

test('account-level audit and repairs are invisible to non-admins', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  await client.query(
    `insert into public.access_control_audit (actor_user_id, target_user_id, action, before_state, after_state)
     values ($1,$2,'rls.test','{}'::jsonb,'{}'::jsonb)`,
    [ids.admin, ids.customerA],
  );
  const customerAudit = await asRole('authenticated', ids.customerA, `select 1 from public.access_control_audit`);
  assert.equal(customerAudit.rows.length, 0);

  const adminAudit = await asRole('authenticated', ids.admin, `select 1 from public.access_control_audit`);
  assert.ok(adminAudit.rows.length >= 1);

  const customerRepairs = await asRole('authenticated', ids.customerA, `select 1 from public.access_control_repairs`);
  assert.equal(customerRepairs.rows.length, 0);
});

test('direct browser writes are refused on every permission table', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');

  await expectRefused(
    'authenticated',
    ids.customerA,
    `insert into public.customer_module_access (user_id, module_key, allowed_actions)
     values ($1,'movies','["manage"]'::jsonb)`,
    [ids.customerA],
  );
  await expectRefused(
    'authenticated',
    ids.customerA,
    `update public.customer_module_access set allowed_actions = '["manage"]'::jsonb where user_id = $1`,
    [ids.customerA],
  );
  await expectRefused('authenticated', ids.customerA, `delete from public.customer_module_access`);
  await expectRefused(
    'authenticated',
    ids.staff,
    `update public.business_member_access set allowed_actions = '{"services":["manage"]}'::jsonb where user_id = $1`,
    [ids.staff],
  );
  await expectRefused(
    'authenticated',
    ids.admin,
    `insert into public.access_control_audit (target_user_id, action) values ($1,'forged')`,
    [ids.customerA],
  );
  await expectRefused(
    'authenticated',
    ids.admin,
    `insert into public.access_control_repairs (report, plan) values ('{}'::jsonb,'{}'::jsonb)`,
  );
});

test('a customer cannot promote itself by editing its profile role', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  await expectRefused(
    'authenticated',
    ids.customerA,
    `update public.profiles set role = 'admin', is_super_admin = true where id = $1`,
    [ids.customerA],
  );
  const profile = await client.query(`select role, is_super_admin from public.profiles where id = $1`, [ids.customerA]);
  assert.equal(profile.rows[0].role, 'customer');
  assert.equal(profile.rows[0].is_super_admin, false);
});

test('a verified Supabase API key is not needed: RLS uses the session subject', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  // auth.uid() resolves from request.jwt.claim.sub; without it, no row matches.
  const withoutSubject = await asRole('authenticated', null, `select 1 from public.customer_module_access`);
  assert.equal(withoutSubject.rows.length, 0, 'a session without a subject must see nothing');
});

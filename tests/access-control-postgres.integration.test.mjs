/**
 * PostgreSQL integration and RLS tests for the centralized access engine.
 *
 * Runs against a disposable local database. It creates uniquely named temporary
 * accounts and removes them afterwards. It never touches a hosted project.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { provisionStagedDatabase } from './lib/disposable-postgres.mjs';

import { AccessControlRepository, AccessControlError } from '../src/permissions/repository.ts';
import { authorize } from '../src/permissions/engine.ts';
import { checkPermissionHealth } from '../src/permissions/health.ts';

const DATABASE_URL =
  process.env.BOS_TEST_DATABASE_URL
  || process.env.BOS_LISTINGS_DATABASE_URL
  || 'postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable';

const ids = {
  admin: randomUUID(),
  customer: randomUUID(),
  provider: randomUUID(),
  owner: randomUUID(),
  missing: randomUUID(),
  business: randomUUID(),
};
const emails = {
  admin: `access-admin-${ids.admin.slice(0, 8)}@example.test`,
  customer: `access-customer-${ids.customer.slice(0, 8)}@example.test`,
  provider: `access-provider-${ids.provider.slice(0, 8)}@example.test`,
  owner: `access-owner-${ids.owner.slice(0, 8)}@example.test`,
};

const adminActor = () => ({
  userId: ids.admin,
  role: 'admin',
  accountStatus: 'active',
  isSuperAdmin: false,
});

let client;
let available = false;
let repository;

async function createProfile(id, email, role, extra = {}) {
  await client.query(`insert into auth.users (id, email) values ($1,$2) on conflict (id) do nothing`, [id, email]);
  await client.query(
    `insert into public.profiles (id, email, full_name, role, account_status, is_super_admin)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (id) do update set role = excluded.role, account_status = excluded.account_status`,
    [id, email, extra.fullName || email, role, extra.accountStatus || 'active', extra.isSuperAdmin === true],
  );
}

test.before(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(`select to_regclass('public.access_control_repairs') as table_name`);
    available = Boolean(rows[0]?.table_name);
  } catch {
    available = false;
  }
  if (!available) {
    console.warn('[access-control] local PostgreSQL unavailable or migration not applied; integration tests skipped');
    return;
  }
  repository = new AccessControlRepository(DATABASE_URL, { ...process.env, NODE_ENV: 'test' });
  await createProfile(ids.admin, emails.admin, 'admin');
  await createProfile(ids.customer, emails.customer, 'customer');
  await createProfile(ids.provider, emails.provider, 'provider');
  await createProfile(ids.owner, emails.owner, 'provider');
});

test.after(async () => {
  if (!available) {
    await client?.end().catch(() => undefined);
    return;
  }
  await client.query(`delete from public.access_control_repairs where created_by = $1 or applied_by = $1`, [ids.admin]).catch(() => undefined);
  await client.query(`delete from public.access_control_audit where actor_user_id = any($1::uuid[]) or target_user_id = any($1::uuid[])`, [
    [ids.admin, ids.customer, ids.provider, ids.owner],
  ]).catch(() => undefined);
  await client.query(`delete from public.business_member_access where business_id = $1`, [ids.business]).catch(() => undefined);
  await client.query(`delete from public.business_members where business_id = $1`, [ids.business]).catch(() => undefined);
  await client.query(`delete from public.businesses where id = $1`, [ids.business]).catch(() => undefined);
  await client.query(`delete from auth.users where id = any($1::uuid[])`, [
    [ids.admin, ids.customer, ids.provider, ids.owner],
  ]).catch(() => undefined);
  await client.end();
});

test('new customer signups receive VIEW only on every enabled category', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  const { rows } = await client.query(
    `select module_key, allowed_sections, allowed_actions, grant_source
       from public.customer_module_access where user_id = $1 order by module_key`,
    [ids.customer],
  );
  assert.ok(rows.length >= 5, 'signup trigger must seed every enabled category');
  for (const row of rows) {
    assert.deepEqual(row.allowed_actions, ['view'], `${row.module_key} must be view-only`);
    assert.deepEqual(row.allowed_sections, []);
    assert.equal(row.grant_source, 'signup_default');
  }
  // Ecommerce is disabled locally and must not be seeded.
  assert.equal(rows.some((row) => row.module_key === 'ecommerce'), false);
});

test('a new business member starts VIEW-only and an owner is skipped', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  await client.query(
    `insert into public.businesses (id, business_ref, name, module_type, owner_user_id, approval_status, is_enabled)
     values ($1,$2,$3,'services',$4,'approved',true)
     on conflict (id) do nothing`,
    [ids.business, `acc-${ids.business.slice(0, 8)}`, 'Access Test Services', ids.owner],
  );
  await client.query(
    `insert into public.business_members (business_id, user_id, role, status)
     values ($1,$2,'owner','active')
     on conflict (business_id, user_id) do update set role = 'owner', status = 'active'`,
    [ids.business, ids.owner],
  );
  await client.query(
    `delete from public.business_member_access where business_id = $1 and user_id = $2`,
    [ids.business, ids.provider],
  );
  await client.query(
    `insert into public.business_members (business_id, user_id, role, status)
     values ($1,$2,'manager','active')
     on conflict (business_id, user_id) do update set role = 'manager', status = 'active'`,
    [ids.business, ids.provider],
  );

  const member = await client.query(
    `select allowed_modules, allowed_actions, grant_source from public.business_member_access
      where business_id = $1 and user_id = $2`,
    [ids.business, ids.provider],
  );
  assert.equal(member.rows.length, 1);
  assert.deepEqual(member.rows[0].allowed_modules, ['services']);
  assert.deepEqual(member.rows[0].allowed_actions, { services: ['view'] });
  assert.equal(member.rows[0].grant_source, 'signup_default');

  const owner = await client.query(
    `select 1 from public.business_member_access where business_id = $1 and user_id = $2`,
    [ids.business, ids.owner],
  );
  assert.equal(owner.rows.length, 0, 'owners bypass the member grant and must not receive one');
});

test('category grants, complete access and view-only restore are persisted and enforced', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  await repository.setCategoryPermissions(adminActor(), ids.customer, [
    { category: 'pg', actions: ['view', 'create'] },
  ]);

  const detail = await repository.getAccount(ids.customer);
  const pg = detail.customerGrants.find((grant) => grant.category === 'pg');
  assert.deepEqual(pg.actions.sort(), ['create', 'view']);

  const stored = await client.query(
    `select allowed_actions from public.customer_module_access where user_id = $1 and module_key = 'pg'`,
    [ids.customer],
  );
  assert.deepEqual(stored.rows[0].allowed_actions.sort(), ['create', 'view']);

  const actor = { userId: ids.customer, role: 'customer', accountStatus: 'active', customerGrants: detail.customerGrants.map((grant) => ({
    module_key: grant.category,
    allowed_sections: grant.sections,
    allowed_actions: grant.actions,
  })) };
  assert.equal(authorize(actor, 'pg', 'create').ok, true);
  assert.equal(authorize(actor, 'pg', 'delete').error, 'CUSTOMER_ACTION_FORBIDDEN');
  // Category isolation: a 'pg' grant must not open 'hotels' writes.
  assert.equal(authorize(actor, 'hotels', 'create').error, 'CUSTOMER_ACTION_FORBIDDEN');

  await repository.grantCompleteAccess(adminActor(), ids.customer, ['pg']);
  const complete = await repository.getAccount(ids.customer);
  const completePg = complete.customerGrants.find((grant) => grant.category === 'pg');
  assert.equal(completePg.actions.length, 6);

  await repository.restoreViewOnly(adminActor(), ids.customer, ['pg']);
  const viewOnly = await repository.getAccount(ids.customer);
  assert.deepEqual(viewOnly.customerGrants.find((grant) => grant.category === 'pg').actions, ['view']);

  // An empty action list revokes the category by deleting its row.
  await repository.setCategoryPermissions(adminActor(), ids.customer, [{ category: 'pg', actions: [] }]);
  const revoked = await repository.getAccount(ids.customer);
  assert.equal(revoked.customerGrants.some((grant) => grant.category === 'pg'), false);

  // Restore the signup baseline for the remaining tests.
  await repository.restoreViewOnly(adminActor(), ids.customer, null);
});

test('unknown categories and actions are refused before any write', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  await assert.rejects(
    () => repository.setCategoryPermissions(adminActor(), ids.customer, [{ category: 'wormhole', actions: ['view'] }]),
    (error) => error instanceof AccessControlError && error.code === 'UNKNOWN_CATEGORY',
  );
  await assert.rejects(
    () => repository.setCategoryPermissions(adminActor(), ids.customer, [{ category: 'pg', actions: ['root'] }]),
    (error) => error instanceof AccessControlError && error.code === 'INVALID_ACTIONS',
  );
  await assert.rejects(
    () => repository.setCategoryPermissions(adminActor(), ids.customer, [{ category: 'pg', actions: ['view'], sections: ['nope'] }]),
    (error) => error instanceof AccessControlError && error.code === 'INVALID_SECTIONS',
  );
});

test('an administrator cannot edit their own permissions or a Super Admin', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  await assert.rejects(
    () => repository.setCategoryPermissions(adminActor(), ids.admin, [{ category: 'pg', actions: ['view'] }]),
    (error) => error instanceof AccessControlError && error.code === 'SELF_PERMISSION_EDIT',
  );

  const superUser = randomUUID();
  await createProfile(superUser, `access-super-${superUser.slice(0, 8)}@example.test`, 'admin', { isSuperAdmin: true });
  try {
    await client.query(`update public.profiles set is_super_admin = true where id = $1`, [superUser]);
    const probe = await client.query(`select is_super_admin from public.profiles where id = $1`, [superUser]);
    assert.equal(probe.rows[0]?.is_super_admin, true, 'the fixture must be a Super Admin');
    await assert.rejects(
      () => repository.setCategoryPermissions(adminActor(), superUser, [{ category: 'pg', actions: ['view'] }]),
      (error) => error instanceof AccessControlError && error.code === 'SUPER_ADMIN_PROTECTED',
    );
  } finally {
    await client.query(`delete from auth.users where id = $1`, [superUser]);
  }
});

test('existing accounts keep their pre-migration access', async () => {
  if (!available) {
    throw new Error('this suite requires PostgreSQL; run it through `npm test`');
  }
  const adminUrl = process.env.BOS_TEST_PG_ADMIN_URL;
  assert.ok(
    adminUrl,
    'run via npm test: the disposable cluster exposes BOS_TEST_PG_ADMIN_URL so a pre-migration database can be built',
  );

  // Build a database that stops immediately BEFORE the access-control engine,
  // insert the real legacy state (an active customer that predates the grant
  // tables having any row), then let the migration chain run forward over it.
  const staged = await provisionStagedDatabase({
    adminUrl,
    database: `bos_legacy_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    stopBefore: '20261119100000_user_access_control_engine.sql',
    log: (line) => console.log(line),
  });
  const legacyId = randomUUID();
  const legacyEmail = `legacy-${legacyId.slice(0, 8)}@example.test`;
  const legacyClient = new Client({ connectionString: staged.url });
  try {
    await legacyClient.connect();
    await legacyClient.query(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,'{}'::jsonb)`,
      [legacyId, legacyEmail],
    );
    await legacyClient.query(
      `insert into public.profiles (id, email, full_name, role, account_status)
       values ($1,$2,'Legacy Customer','customer','active')
       on conflict (id) do update set
         role = 'customer', account_status = 'active', email = excluded.email`,
      [legacyId, legacyEmail],
    );
    await legacyClient.query(
      `insert into public.platform_module_flags (module_key, is_enabled) values ('pg', true)
       on conflict (module_key) do update set is_enabled = true`,
    );
    const beforeRows = await legacyClient.query(
      'select count(*)::int as count from public.customer_module_access where user_id = $1',
      [legacyId],
    );
    assert.equal(beforeRows.rows[0].count, 0, 'the legacy customer must start with no grant rows');

    // Replay the access-control engine (and everything after it) for real.
    staged.applyRemaining();

    const { rows } = await legacyClient.query(
      `select module_key, allowed_actions, grant_source
         from public.customer_module_access
        where user_id = $1
        order by module_key`,
      [legacyId],
    );
    assert.ok(rows.length > 0, 'the backfill must materialise the implicit access');
    const pgRow = rows.find((row) => row.module_key === 'pg');
    assert.ok(pgRow, 'the enabled pg module must be backfilled');
    assert.equal(pgRow.grant_source, 'legacy_backfill');
    const actions = pgRow.allowed_actions;
    // The backfill preserves the old implicit "everything" contract explicitly,
    // so no existing customer lost a write action when defaults became explicit.
    for (const action of ['view', 'create', 'edit', 'delete']) {
      assert.ok(actions.includes(action), `legacy grant lost the ${action} action`);
    }
  } finally {
    await legacyClient.end().catch(() => undefined);
    staged.drop();
  }
});

test('a provider save never writes an owner row and preserves section scope', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');

  // A restricted manager: section scope and a view-only action list.
  await client.query(
    `update public.business_member_access
        set allowed_sections = '{"services": ["bookings"]}'::jsonb,
            allowed_actions = '{"services": ["view"]}'::jsonb
      where business_id = $1 and user_id = $2`,
    [ids.business, ids.provider],
  );

  // Omitting sections must preserve them; only actions change.
  await repository.setCategoryPermissions(adminActor(), ids.provider, [
    { category: 'services', actions: ['view', 'edit'] },
  ]);
  const saved = await client.query(
    `select allowed_sections, allowed_actions from public.business_member_access
      where business_id = $1 and user_id = $2`,
    [ids.business, ids.provider],
  );
  assert.deepEqual(saved.rows[0].allowed_sections, { services: ['bookings'] });
  assert.deepEqual(saved.rows[0].allowed_actions, { services: ['view', 'edit'] });

  // An owner bypasses member grants; a save must not attempt to write a row
  // (the database guard would refuse it) and must still succeed.
  await repository.setCategoryPermissions(adminActor(), ids.owner, [
    { category: 'services', actions: ['view', 'edit'] },
  ]);
  const ownerRows = await client.query(
    `select 1 from public.business_member_access where business_id = $1 and user_id = $2`,
    [ids.business, ids.owner],
  );
  assert.equal(ownerRows.rows.length, 0);

  // Revoking a category the provider workspace does not have is a no-op.
  await repository.setCategoryPermissions(adminActor(), ids.provider, [
    { category: 'ecommerce', actions: [] },
  ]);
});

test('suspension applies immediately and removes the grant rows', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  await repository.setAccountStatus(adminActor(), ids.customer, 'suspended', 'integration test');
  const status = await client.query(`select account_status from public.profiles where id = $1`, [ids.customer]);
  assert.equal(status.rows[0].account_status, 'suspended');
  const grants = await client.query(`select 1 from public.customer_module_access where user_id = $1`, [ids.customer]);
  assert.equal(grants.rows.length, 0);

  const blocked = authorize(
    { userId: ids.customer, role: 'customer', accountStatus: 'suspended', customerGrants: [] },
    'pg',
    'view',
  );
  assert.equal(blocked.error, 'ACCOUNT_NOT_ACTIVE');

  await repository.setAccountStatus(adminActor(), ids.customer, 'active', 'integration test restore');
  await repository.restoreViewOnly(adminActor(), ids.customer, null);
});

test('health check preview, apply and rollback restore only VIEW defaults', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  await client.query(`delete from public.customer_module_access where user_id = $1`, [ids.customer]);

  const snapshot = await repository.loadHealthSnapshot();
  const report = checkPermissionHealth(snapshot);
  const finding = report.findings.find(
    (entry) => entry.code === 'MISSING_CUSTOMER_PERMISSIONS' && entry.userId === ids.customer,
  );
  assert.ok(finding, 'health check must detect the missing permissions');

  const preview = await repository.createRepair(adminActor(), report);
  assert.equal(preview.status, 'preview');

  const applied = await repository.applyRepair(adminActor(), preview.id);
  assert.equal(applied.status, 'applied');
  assert.ok(applied.applied > 0);

  const restored = await client.query(
    `select module_key, allowed_actions, grant_source from public.customer_module_access where user_id = $1`,
    [ids.customer],
  );
  assert.ok(restored.rows.length > 0);
  for (const row of restored.rows) {
    assert.deepEqual(row.allowed_actions, ['view'], 'repair may only restore VIEW');
  }
  assert.ok(restored.rows.every((row) => row.grant_source === 'repair'));

  const rolledBack = await repository.rollbackRepair(adminActor(), preview.id);
  assert.equal(rolledBack.status, 'rolled_back');
  const afterRollback = await client.query(
    `select 1 from public.customer_module_access where user_id = $1`,
    [ids.customer],
  );
  assert.equal(afterRollback.rows.length, 0, 'rollback must remove what the repair inserted');

  const repair = await client.query(
    `select status, rolled_back_at from public.access_control_repairs where id = $1`,
    [preview.id],
  );
  assert.equal(repair.rows[0].status, 'rolled_back');
  assert.ok(repair.rows[0].rolled_back_at);

  await repository.restoreViewOnly(adminActor(), ids.customer, null);
});

test('RLS and privileges block browser writes to grants, audit and repairs', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');

  // Each check runs in its own transaction: the first refusal aborts the
  // transaction, so reusing one would mask the following assertions.
  const refusedAsAuthenticated = async (sql, params = [], message) => {
    await client.query('begin');
    try {
      await client.query('set local role authenticated');
      await assert.rejects(() => client.query(sql, params), /permission denied/i, message);
    } finally {
      await client.query('rollback');
    }
  };

  await refusedAsAuthenticated(
    `insert into public.customer_module_access (user_id, module_key, allowed_actions)
     values ($1, 'pg', '["manage"]'::jsonb)`,
    [ids.customer],
    'authenticated must not be able to grant itself a category',
  );
  await refusedAsAuthenticated(
    `update public.customer_module_access set allowed_actions = '["manage"]'::jsonb`,
    [],
    'authenticated must not be able to widen an existing grant',
  );
  await refusedAsAuthenticated(
    `delete from public.customer_module_access`,
    [],
    'authenticated must not be able to delete a grant',
  );
  await refusedAsAuthenticated(
    `insert into public.access_control_repairs (report, plan) values ('{}'::jsonb, '{}'::jsonb)`,
    [],
    'a browser session must not be able to create a repair',
  );
  await refusedAsAuthenticated(
    `insert into public.access_control_audit (target_user_id, action) values ($1, 'forged')`,
    [ids.customer],
    'a browser session must not be able to forge audit history',
  );
});

test('reactivating a customer restores VIEW-only, never the legacy unrestricted contract', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  await repository.setAccountStatus(adminActor(), ids.customer, 'suspended', 'integration test');
  const cleared = await client.query(
    `select 1 from public.customer_module_access where user_id = $1`,
    [ids.customer],
  );
  assert.equal(cleared.rows.length, 0, 'suspension still removes the grant rows');

  await repository.setAccountStatus(adminActor(), ids.customer, 'active', 'integration test reactivate');
  const restored = await client.query(
    `select module_key, allowed_actions, grant_source from public.customer_module_access where user_id = $1`,
    [ids.customer],
  );
  assert.ok(restored.rows.length >= 5, 'reactivation must not leave a customer with zero grant rows');
  for (const row of restored.rows) {
    assert.deepEqual(row.allowed_actions, ['view'], 'reactivation may only restore VIEW');
    assert.equal(row.grant_source, 'signup_default');
  }
});

test('suspending a provider member keeps a denying row instead of deleting it', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  await repository.setAccountStatus(adminActor(), ids.provider, 'suspended', 'integration test');
  const member = await client.query(
    `select allowed_modules, allowed_actions from public.business_member_access
      where business_id = $1 and user_id = $2`,
    [ids.business, ids.provider],
  );
  assert.equal(member.rows.length, 1, 'deleting the row would restore legacy unrestricted access on reactivation');
  assert.deepEqual(member.rows[0].allowed_modules, []);
  await repository.setAccountStatus(adminActor(), ids.provider, 'active', 'integration test restore');
});

test('role changes require a Super Admin and never mint a Super Admin', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  const superActor = { userId: ids.admin, role: 'admin', accountStatus: 'active', isSuperAdmin: true };

  await assert.rejects(
    () => repository.setAccountRole(adminActor(), ids.provider, 'admin', 'integration test'),
    (error) => error instanceof AccessControlError && error.code === 'SUPER_ADMIN_REQUIRED',
    'an ordinary administrator must not promote to admin',
  );
  await assert.rejects(
    () => repository.setAccountRole(superActor, ids.admin, 'customer', 'integration test'),
    (error) => error instanceof AccessControlError && error.code === 'SELF_PERMISSION_EDIT',
    'nobody may change their own role',
  );

  const promoted = await repository.setAccountRole(superActor, ids.provider, 'admin', 'integration test');
  assert.equal(promoted.role, 'admin');
  assert.equal(promoted.isSuperAdmin, false, 'promotion to admin must never grant Super Admin');

  await assert.rejects(
    () => repository.setAccountRole(adminActor(), ids.provider, 'customer', 'integration test'),
    (error) => error instanceof AccessControlError && error.code === 'SUPER_ADMIN_REQUIRED',
    'an ordinary administrator must not demote an admin',
  );

  await client.query(`update public.profiles set is_super_admin = true where id = $1`, [ids.owner]);
  await assert.rejects(
    () => repository.setAccountRole(adminActor(), ids.owner, 'customer', 'integration test'),
    (error) => error instanceof AccessControlError && error.code === 'SUPER_ADMIN_PROTECTED',
    'a Super Admin is protected from an ordinary administrator',
  );
  await client.query(`update public.profiles set is_super_admin = false where id = $1`, [ids.owner]);

  const restored = await repository.setAccountRole(superActor, ids.provider, 'provider', 'integration test');
  assert.equal(restored.role, 'provider');

  const audit = await client.query(
    `select action from public.access_control_audit where target_user_id = $1 and action = 'account.role'`,
    [ids.provider],
  );
  assert.ok(audit.rows.length >= 2, 'every role change must be audited');
});

test('the engine denies an unverified account instead of guessing', async (t) => {
  if (!available) return t.skip('local PostgreSQL unavailable');
  await client.query(`delete from public.customer_module_access where user_id = $1`, [ids.customer]);
  const account = await repository.getAccount(ids.customer);
  assert.equal(account.customerGrants.length, 0);
  const decision = authorize(
    { userId: ids.customer, role: 'customer', accountStatus: 'active', customerGrants: [] },
    'pg',
    'view',
  );
  assert.equal(decision.ok, false);
  assert.equal(decision.error, 'PERMISSIONS_NOT_CONFIGURED');
  await repository.restoreViewOnly(adminActor(), ids.customer, null);
});

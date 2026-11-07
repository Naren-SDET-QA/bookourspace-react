import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.BOS_LISTINGS_DATABASE_URL;
const dbTest = connectionString ? test : test.skip;
const HMAC_SECRET = 'bos-live-edit-security-test-secret';

const A = '11111111-1111-4111-8111-111111111111'; // provider A
const B = '22222222-2222-4222-8222-222222222222'; // provider B
const ADMIN_ASSIGNED = '33333333-3333-4333-8333-333333333333';
const ADMIN_UNASSIGNED = '44444444-4444-4444-8444-444444444444';
const SUPER_ADMIN = '55555555-5555-4555-8555-555555555555';
const SUSPENDED_PROVIDER = '66666666-6666-4666-8666-666666666666';
const CUSTOMER = '77777777-7777-4777-8777-777777777777';
const LISTING_A = 'live-pg-a';
const LISTING_B = 'live-pg-b';
const LISTING_VENUE = 'live-venue-a';
const LISTING_SUSPENDED = 'live-pg-suspended';
const LISTING_AUDIT_FAIL = 'live-pg-audit-fail';

const SCREEN_A = 'scr-amb-1';
const SCREEN_B = 'scr-prasads-pcx';
const SCREEN_UNOWNED = 'scr-aaa-epiq';

let pool;
let child;
let serverUrl;
let tempDir;
let storePath;

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

function token(authId, role, label) {
  const payload = Buffer.from(
    JSON.stringify({
      userId: `USR-${label}`,
      supabaseUserId: authId,
      email: `${label.toLowerCase()}@example.test`,
      name: `${label} Live Edit test`,
      googleSub: `google-${label}`,
      phone: '+91 90000 00000',
      role,
      authProvider: 'google',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 10 * 60_000,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', `${HMAC_SECRET}:SESSION_TOKEN_V2`)
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
}

const tokens = {
  providerA: token(A, 'provider', 'PROVIDER_A'),
  providerB: token(B, 'provider', 'PROVIDER_B'),
  assignedAdmin: token(ADMIN_ASSIGNED, 'admin', 'ADMIN_ASSIGNED'),
  unassignedAdmin: token(ADMIN_UNASSIGNED, 'admin', 'ADMIN_UNASSIGNED'),
  superAdmin: token(SUPER_ADMIN, 'admin', 'SUPER_ADMIN'),
  suspendedProvider: token(SUSPENDED_PROVIDER, 'provider', 'SUSPENDED_PROVIDER'),
  customer: token(CUSTOMER, 'customer', 'CUSTOMER'),
  forgedProvider: token(CUSTOMER, 'provider', 'FORGED_PROVIDER'),
  forgedAdmin: token(A, 'admin', 'FORGED_ADMIN'),
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
      DISABLE_HMR: 'true',
      VITE_ENABLE_DEMO_DATA: 'false',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PROJECT_ID: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      BOS_SERVER_HMAC_SECRET: HMAC_SECRET,
      BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
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
    } catch {
      // wait for boot
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('test server did not become ready');
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const processToStop = child;
  child = undefined;
  processToStop.kill('SIGTERM');
  await new Promise((resolve) => processToStop.once('exit', resolve));
}

async function request(method, url, sessionToken, body) {
  const response = await fetch(`${serverUrl}${url}`, {
    method,
    headers: {
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return { status: response.status, data };
}

function patchListing(sessionToken, id, body) {
  return request('PATCH', `/api/provider/listings/${encodeURIComponent(id)}`, sessionToken, body);
}

function reviewListing(sessionToken, id, decision) {
  return request(
    'PATCH',
    `/api/admin/provider/listings/${encodeURIComponent(id)}/review`,
    sessionToken,
    { decision },
  );
}

async function sql(text, params = []) {
  return pool.query(text, params);
}

async function asActor(authId, callback) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [authId]);
    await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: authId, role: 'authenticated', aal: 'aal1' }),
    ]);
    return await callback(client);
  } finally {
    try {
      await client.query('rollback');
    } catch {
      // The transaction may already be aborted by the expected denial.
    }
    client.release();
  }
}

async function asActorCommit(authId, callback) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [authId]);
    await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: authId, role: 'authenticated', aal: 'aal1' }),
    ]);
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    client.release();
  }
}

async function expectSqlFailure(authId, statement, params, pattern) {
  try {
    await asActor(authId, (client) => client.query(statement, params));
  } catch (error) {
    assert.match(String(error.message), pattern);
    return;
  }
  assert.fail(`Expected SQL failure matching ${pattern}`);
}

async function listingRow(id) {
  const { rows } = await sql('select * from public.listings where id = $1', [id]);
  return rows[0];
}

async function seed() {
  const actors = [
    [A, 'provider-a@example.test', 'Provider A', 'provider', 'active', false],
    [B, 'provider-b@example.test', 'Provider B', 'provider', 'active', false],
    [ADMIN_ASSIGNED, 'admin-assigned@example.test', 'Assigned Admin', 'admin', 'active', false],
    [ADMIN_UNASSIGNED, 'admin-unassigned@example.test', 'Unassigned Admin', 'admin', 'active', false],
    [SUPER_ADMIN, 'super-admin@example.test', 'Super Admin', 'admin', 'active', true],
    [SUSPENDED_PROVIDER, 'provider-suspended@example.test', 'Suspended Provider', 'provider', 'suspended', false],
    [CUSTOMER, 'customer@example.test', 'Customer', 'customer', 'active', false],
  ];
  for (const [id, email, name, role, status, superAdmin] of actors) {
    await sql(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, $2, jsonb_build_object('full_name', $3::text))
       on conflict (id) do nothing`,
      [id, email, name],
    );
    await sql(
      `insert into public.profiles (id, email, full_name, phone, role, account_status, is_super_admin)
       values ($1, $2, $3, '+91 90000 00000', $4, $5, $6)
       on conflict (id) do update set
         email = excluded.email, full_name = excluded.full_name, phone = excluded.phone,
         role = excluded.role, account_status = excluded.account_status,
         is_super_admin = excluded.is_super_admin`,
      [id, email, name, role, status, superAdmin],
    );
  }

  const payloadA = {
    description: 'A verified PG in Madhapur with food and Wi-Fi.',
    images: ['https://images.example.com/pg-a.jpg'],
    facilities: ['Wi-Fi', 'Food included'],
    location: { city: 'Hyderabad', area: 'Madhapur' },
    availability: {
      status: 'limited',
      note: '2 beds free',
      nextAvailableFrom: '2026-12-01',
      unitsAvailable: 2,
    },
    customFieldValues: { genderPolicy: 'Men Only', bedsAvailable: 2, totalCapacity: 45 },
  };
  const rows = [
    [LISTING_A, A, 'Live Edit PG A', 'pg-luxury', 'Luxury PG', 'property', 8500, '/month', 'pending_approval', payloadA],
    [LISTING_B, B, 'Live Edit PG B', 'pg-luxury', 'Luxury PG', 'property', 9100, '/month', 'pending_approval', payloadA],
    [LISTING_VENUE, A, 'Live Edit Venue A', 'venue-marriage', 'Marriage hall', 'venue', 85000, '/day', 'pending_approval', payloadA],
    [LISTING_SUSPENDED, SUSPENDED_PROVIDER, 'Suspended listing', 'pg-budget', 'Budget PG', 'property', 5000, '/month', 'pending_approval', payloadA],
    [LISTING_AUDIT_FAIL, A, 'Audit failure listing', 'pg-luxury', 'Luxury PG', 'property', 8600, '/month', 'pending_approval', payloadA],
  ];
  for (const row of rows) {
    await sql(
      `insert into public.listings
         (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit,
          status, payload, provider_availability_status, is_verified)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'not_reported', false)
       on conflict (id) do update set
         owner_id = excluded.owner_id, title = excluded.title,
         category_id = excluded.category_id, subcategory = excluded.subcategory,
         entity_type = excluded.entity_type, price = excluded.price,
         price_unit = excluded.price_unit, status = excluded.status,
         payload = excluded.payload, provider_availability_status = 'not_reported',
         is_verified = false`,
      row,
    );
  }

  await sql('delete from public.live_edit_admin_assignments');
  await sql(
    `insert into public.live_edit_admin_assignments
       (admin_user_id, module_id, category_id, listing_id, assigned_by)
     values ($1, 'pg_hostels', 'pg-luxury', null, $2),
            ($1, 'movies', null, $3, $2)`,
    [ADMIN_ASSIGNED, SUPER_ADMIN, SCREEN_A],
  );

  await sql('delete from public.live_edit_cinema_screen_owners');
  await sql(
    `insert into public.live_edit_cinema_screen_owners (screen_id, listing_id, owner_user_id)
     values ($1, 'movie-hyd-1', $3), ($2, 'movie-hyd-2', $4)`,
    [SCREEN_A, SCREEN_B, A, B],
  );
}

async function latestAudit(listingId) {
  const { rows } = await sql(
    `select * from public.live_edit_audit_events
      where listing_id = $1
      order by occurred_at desc
      limit 1`,
    [listingId],
  );
  return rows[0];
}

async function auditCount(listingId) {
  const { rows } = await sql(
    'select count(*)::int as count from public.live_edit_audit_events where listing_id = $1',
    [listingId],
  );
  return rows[0].count;
}

after(async () => {
  try {
    await stopServer();
  } catch {
    // best effort
  }
  try {
    await pool?.end();
  } catch {
    // best effort
  }
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

dbTest('Live Edit backend security', { skip: !connectionString }, async (t) => {
  pool = new Pool({ connectionString });
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bos-live-edit-security-'));
  storePath = path.join(tempDir, 'authoritative-store.json');
  await fs.writeFile(
    storePath,
    JSON.stringify({
      seatLocks: {},
      bookings: [],
      enquiries: [],
      paymentIntents: {},
      usedUtrs: {},
      checkedInPasses: {},
      users: [],
      notifications: [],
      notificationCampaigns: [],
      providerListings: {},
      adminModules: {},
      revokedTokens: {},
    }),
  );
  await seed();
  await startServer();

  await t.test('forged roles are rejected by the database profile check', async () => {
    const forgedProvider = await patchListing(tokens.forgedProvider, LISTING_A, { title: 'Forged provider edit' });
    assert.equal(forgedProvider.status, 403);
    assert.equal(forgedProvider.data.error, 'SESSION_ROLE_MISMATCH');

    const forgedAdmin = await patchListing(tokens.forgedAdmin, LISTING_A, { title: 'Forged admin edit' });
    assert.equal(forgedAdmin.status, 403);
    assert.equal(forgedAdmin.data.error, 'SESSION_ROLE_MISMATCH');

    assert.equal((await listingRow(LISTING_A)).title, 'Live Edit PG A');
  });

  await t.test('cross-provider editing is denied and RLS hides the row', async () => {
    const response = await patchListing(tokens.providerB, LISTING_A, { title: 'Cross-provider edit' });
    // RLS hides another provider's row, so the repository reports not found
    // rather than confirming that the id exists.
    assert.equal(response.status, 404);
    assert.equal(response.data.error, 'LISTING_NOT_FOUND');

    const own = await request('GET', '/api/provider/listings', tokens.providerB);
    assert.equal(own.status, 200);
    assert.ok(!own.data.listings.some((listing) => listing.id === LISTING_A));

    const rowCount = await asActor(B, async (client) => {
      const result = await client.query('update public.listings set title = $2 where id = $1', [
        LISTING_A,
        'RLS cross-provider edit',
      ]);
      return result.rowCount;
    });
    assert.equal(rowCount, 0);
    assert.equal((await listingRow(LISTING_A)).title, 'Live Edit PG A');
  });

  await t.test('unassigned admins are denied on HTTP and direct SQL paths', async () => {
    const patch = await patchListing(tokens.unassignedAdmin, LISTING_A, { title: 'Unassigned edit' });
    assert.equal(patch.status, 403);
    assert.equal(patch.data.error, 'LISTING_ASSIGNMENT_REQUIRED');

    const feed = await request('GET', '/api/admin/provider/listings', tokens.unassignedAdmin);
    assert.equal(feed.status, 200);
    assert.ok(!feed.data.listings.some((listing) => listing.id === LISTING_A));

    const review = await reviewListing(tokens.unassignedAdmin, LISTING_A, 'active');
    assert.equal(review.status, 403);
    assert.equal(review.data.error, 'LISTING_ASSIGNMENT_REQUIRED');

    const deactivate = await request(
      'DELETE',
      `/api/provider/listings/${encodeURIComponent(LISTING_A)}`,
      tokens.unassignedAdmin,
    );
    assert.equal(deactivate.status, 403);
    assert.equal(deactivate.data.error, 'LISTING_ASSIGNMENT_REQUIRED');

    await expectSqlFailure(
      ADMIN_UNASSIGNED,
      'update public.listings set title = $2 where id = $1',
      [LISTING_A, 'SQL unassigned edit'],
      /LISTING_ASSIGNMENT_REQUIRED/,
    );
    assert.equal((await listingRow(LISTING_A)).title, 'Live Edit PG A');
  });

  await t.test('assigned admins may edit their scope, review it, and no more', async () => {
    const response = await patchListing(tokens.assignedAdmin, LISTING_A, {
      title: 'Assigned admin edit',
      price: 9000,
      payload: {
        description: 'Admin-edited description',
        facilities: ['Wi-Fi', 'Food included', 'Power backup'],
        availability: {
          status: 'available',
          note: '3 beds free',
          nextAvailableFrom: '2026-12-05',
          unitsAvailable: 3,
        },
        customFieldValues: { bedsAvailable: 3 },
      },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.ok(response.data.auditEventId, 'server returns the audit event id');

    const row = await listingRow(LISTING_A);
    assert.equal(row.title, 'Assigned admin edit');
    assert.equal(Number(row.price), 9000);
    assert.equal(row.payload.description, 'Admin-edited description');
    assert.equal(row.payload.availability.unitsAvailable, 3);
    assert.equal(row.payload.customFieldValues.bedsAvailable, 3);

    const outsideCategory = await patchListing(tokens.assignedAdmin, LISTING_B, { title: 'Not assigned B' });
    assert.equal(outsideCategory.status, 200, 'category assignment covers both listings in pg-luxury');
    const outsideModule = await patchListing(tokens.assignedAdmin, LISTING_VENUE, { title: 'Not assigned venue' });
    assert.equal(outsideModule.status, 403);
    assert.equal(outsideModule.data.error, 'LISTING_ASSIGNMENT_REQUIRED');

    const review = await reviewListing(tokens.assignedAdmin, LISTING_A, 'active');
    assert.equal(review.status, 200, JSON.stringify(review.data));
    assert.equal((await listingRow(LISTING_A)).status, 'active');
  });

  await t.test('suspended accounts are denied even with a signed token', async () => {
    const response = await patchListing(tokens.suspendedProvider, LISTING_SUSPENDED, {
      title: 'Suspended edit',
    });
    assert.equal(response.status, 403);
    assert.equal(response.data.error, 'ACTIVE_PROFILE_REQUIRED');

    const rowCount = await asActor(SUSPENDED_PROVIDER, async (client) => {
      const result = await client.query('update public.listings set title = $2 where id = $1', [
        LISTING_SUSPENDED,
        'Suspended SQL edit',
      ]);
      return result.rowCount;
    });
    assert.equal(rowCount, 0);

    const movie = await request('PUT', '/api/movies/screens', tokens.suspendedProvider, {
      screenId: SCREEN_A,
      refundPercent: 60,
    });
    assert.equal(movie.status, 403, JSON.stringify(movie.data));
    assert.equal(movie.data.error, 'ACTIVE_PROFILE_REQUIRED');
    assert.equal((await listingRow(LISTING_SUSPENDED)).title, 'Suspended listing');

    await sql("update public.profiles set account_status = 'suspended' where id = $1", [ADMIN_ASSIGNED]);
    const suspendedAdmin = await patchListing(tokens.assignedAdmin, LISTING_A, { title: 'Suspended admin edit' });
    assert.equal(suspendedAdmin.status, 403);
    assert.equal(suspendedAdmin.data.error, 'ACTIVE_PROFILE_REQUIRED');
    await sql("update public.profiles set account_status = 'active' where id = $1", [ADMIN_ASSIGNED]);
  });

  await t.test('admins cannot grant themselves assignments', async () => {
    await expectSqlFailure(
      ADMIN_ASSIGNED,
      `insert into public.live_edit_admin_assignments
         (admin_user_id, module_id, category_id, assigned_by)
       values ($1, 'venues', null, $1)`,
      [ADMIN_ASSIGNED],
      /row-level security|violates row-level/i,
    );
    const check = await sql(
      `select count(*)::int as count from public.live_edit_admin_assignments
        where admin_user_id = $1 and module_id = 'venues'`,
      [ADMIN_ASSIGNED],
    );
    assert.equal(check.rows[0].count, 0);

    const granted = await asActorCommit(SUPER_ADMIN, async (client) => {
      const result = await client.query(
        `insert into public.live_edit_admin_assignments
           (admin_user_id, module_id, category_id, assigned_by)
         values ($1, 'venues', 'venue-marriage', $2)
         returning id`,
        [ADMIN_UNASSIGNED, SUPER_ADMIN],
      );
      return result.rowCount;
    });
    assert.equal(granted, 1);
    const venueAsGranted = await patchListing(tokens.unassignedAdmin, LISTING_VENUE, { title: 'Granted venue edit' });
    assert.equal(venueAsGranted.status, 200, JSON.stringify(venueAsGranted.data));
    await sql(
      `delete from public.live_edit_admin_assignments
        where admin_user_id = $1 and module_id = 'venues'`,
      [ADMIN_UNASSIGNED],
    );
  });

  await t.test('stale assignments and Super Admin grants are re-read on every request', async () => {
    const before = await patchListing(tokens.assignedAdmin, LISTING_A, { price: 9100 });
    assert.equal(before.status, 200);

    await sql(
      "delete from public.live_edit_admin_assignments where admin_user_id = $1 and module_id = 'pg_hostels'",
      [ADMIN_ASSIGNED],
    );
    const withoutAssignment = await patchListing(tokens.assignedAdmin, LISTING_A, { price: 9200 });
    assert.equal(withoutAssignment.status, 403);
    assert.equal(withoutAssignment.data.error, 'LISTING_ASSIGNMENT_REQUIRED');

    await sql(
      `insert into public.live_edit_admin_assignments (admin_user_id, module_id, category_id, listing_id, assigned_by)
       values ($1, 'pg_hostels', 'pg-luxury', null, $2)`,
      [ADMIN_ASSIGNED, SUPER_ADMIN],
    );
    await sql('update public.profiles set is_super_admin = true where id = $1', [ADMIN_ASSIGNED]);
    const promoted = await patchListing(tokens.assignedAdmin, LISTING_A, {
      providerAvailabilityStatus: 'unavailable',
    });
    assert.equal(promoted.status, 200, JSON.stringify(promoted.data));

    await sql('update public.profiles set is_super_admin = false where id = $1', [ADMIN_ASSIGNED]);
    const demoted = await patchListing(tokens.assignedAdmin, LISTING_A, {
      providerAvailabilityStatus: 'available',
    });
    assert.equal(demoted.status, 403);
    assert.equal(demoted.data.error, 'SUPER_ADMIN_REQUIRED');

    await sql("update public.profiles set role = 'provider' where id = $1", [ADMIN_ASSIGNED]);
    const roleChanged = await patchListing(tokens.assignedAdmin, LISTING_A, { title: 'Stale admin role' });
    assert.equal(roleChanged.status, 403);
    assert.equal(roleChanged.data.error, 'SESSION_ROLE_MISMATCH');
    await sql("update public.profiles set role = 'admin', is_super_admin = false where id = $1", [
      ADMIN_ASSIGNED,
    ]);
  });

  await t.test('providers cannot modify verification, featured, moderation or publication fields', async () => {
    for (const [field, value, expected] of [
      ['isVerified', true, 'FORBIDDEN_VERIFICATION_FIELD'],
      ['providerAvailabilityStatus', 'available', 'FORBIDDEN_VERIFICATION_FIELD'],
      ['status', 'active', 'FORBIDDEN_ADMIN_APPROVAL_REQUIRED'],
    ]) {
      const response = await patchListing(tokens.providerA, LISTING_A, { [field]: value });
      assert.equal(response.status, 403, `${field}: ${JSON.stringify(response.data)}`);
      assert.equal(response.data.error, expected, field);
    }

    const featured = await patchListing(tokens.providerA, LISTING_A, { isFeatured: true });
    assert.equal(featured.status, 200, JSON.stringify(featured.data));
    assert.equal((await listingRow(LISTING_A)).payload.isFeatured === true, false, 'providers cannot self-feature');

    await expectSqlFailure(
      A,
      "update public.listings set payload = jsonb_set(payload, '{isFeatured}', 'true'::jsonb) where id = $1",
      [LISTING_A],
      /LISTING_FEATURED_SUPER_ADMIN_ONLY/,
    );
    await expectSqlFailure(
      A,
      'update public.listings set is_verified = true where id = $1',
      [LISTING_A],
      /LISTING_VERIFICATION_ADMIN_ONLY/,
    );
  });

  await t.test('non-super admins cannot modify protected fields or publish directly', async () => {
    for (const [field, value] of [
      ['isVerified', true],
      ['providerAvailabilityStatus', 'available'],
      ['isFeatured', true],
    ]) {
      const response = await patchListing(tokens.assignedAdmin, LISTING_A, { [field]: value });
      assert.equal(response.status, 403, `${field}: ${JSON.stringify(response.data)}`);
      assert.equal(response.data.error, 'SUPER_ADMIN_REQUIRED', field);
    }

    const publish = await patchListing(tokens.assignedAdmin, LISTING_B, { status: 'active' });
    assert.equal(publish.status, 409);
    assert.equal(publish.data.error, 'LISTING_REVIEW_ENDPOINT_REQUIRED');

    await expectSqlFailure(
      ADMIN_ASSIGNED,
      'update public.listings set status = $2 where id = $1',
      [LISTING_B, 'active'],
      /LISTING_REVIEW_ENDPOINT_REQUIRED/,
    );
    await expectSqlFailure(
      ADMIN_ASSIGNED,
      'update public.listings set is_verified = true where id = $1',
      [LISTING_A],
      /LISTING_VERIFICATION_ADMIN_ONLY/,
    );
    await expectSqlFailure(
      ADMIN_ASSIGNED,
      "update public.listings set provider_availability_status = 'available' where id = $1",
      [LISTING_A],
      /LISTING_MODERATION_SUPER_ADMIN_ONLY/,
    );
  });

  await t.test('Super Admin moderation writes succeed with a fresh database check', async () => {
    const response = await patchListing(tokens.superAdmin, LISTING_A, {
      isVerified: true,
      isFeatured: true,
      providerAvailabilityStatus: 'available',
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.ok(response.data.auditEventId);
    const row = await listingRow(LISTING_A);
    assert.equal(row.is_verified, true);
    assert.equal(row.provider_availability_status, 'available');
    assert.equal(row.payload.isFeatured, true);
    assert.ok(row.verified_by);
    assert.ok(row.verified_at);

    const audit = await latestAudit(LISTING_A);
    assert.equal(audit.actor_user_id, SUPER_ADMIN);
    assert.equal(audit.actor_role, 'super_admin');
  });

  await t.test('server-side validation rejects invalid prices, media, availability and details', async () => {
    const cases = [
      [{ price: -1 }, 'INVALID_LISTING_PRICE'],
      [{ price: 1_000_000_001 }, 'INVALID_LISTING_PRICE'],
      [{ price: 10.999 }, 'INVALID_LISTING_PRICE'],
      [{ title: '' }, 'INVALID_LISTING_FIELDS'],
      [{ payload: { images: ['http://insecure.example.com/a.jpg'] } }, 'INVALID_LISTING_IMAGES'],
      [{ payload: { facilities: ['x'.repeat(61)] } }, 'INVALID_LISTING_FACILITIES'],
      [
        { payload: { availability: { status: 'maybe', note: '', nextAvailableFrom: '', unitsAvailable: null } } },
        'INVALID_LISTING_AVAILABILITY',
      ],
      [
        { payload: { availability: { status: 'available', note: '', nextAvailableFrom: '2026-02-31', unitsAvailable: null } } },
        'INVALID_LISTING_AVAILABILITY',
      ],
      [
        { payload: { availability: { status: 'available', note: '', nextAvailableFrom: '', unitsAvailable: 2.5 } } },
        'INVALID_LISTING_AVAILABILITY',
      ],
      [{ payload: { customFieldValues: { bedsAvailable: 'many' } } }, 'INVALID_LISTING_DETAILS'],
    ];
    for (const [body, code] of cases) {
      const response = await patchListing(tokens.providerA, LISTING_A, body);
      assert.equal(response.status, 400, `${JSON.stringify(body)}: ${JSON.stringify(response.data)}`);
      assert.equal(response.data.error, code, JSON.stringify(body));
    }

    const moduleHop = await patchListing(tokens.providerA, LISTING_A, { categoryId: 'hotel-hourly' });
    assert.equal(moduleHop.status, 403, JSON.stringify(moduleHop.data));
    assert.equal(moduleHop.data.error, 'LISTING_MODULE_CHANGE_FORBIDDEN');

    const valid = await patchListing(tokens.providerA, LISTING_A, {
      payload: {
        images: ['https://images.example.com/pg-a.jpg', 'https://images.example.com/pg-a-2.jpg'],
        facilities: ['Wi-Fi', 'Food included', 'Parking'],
        availability: {
          status: 'available',
          note: 'Plenty of beds',
          nextAvailableFrom: '2026-12-10',
          unitsAvailable: 5,
        },
        customFieldValues: { bedsAvailable: 5, genderPolicy: 'Men Only' },
      },
    });
    assert.equal(valid.status, 200, JSON.stringify(valid.data));
    const row = await listingRow(LISTING_A);
    assert.equal(row.payload.images.length, 2);
    assert.equal(row.payload.facilities.length, 3);
    assert.equal(row.payload.availability.unitsAvailable, 5);
    assert.equal(row.payload.customFieldValues.bedsAvailable, 5);

    const venueInvalid = await patchListing(tokens.providerA, LISTING_VENUE, {
      payload: { customFieldValues: { capacity: 'many' } },
    });
    assert.equal(venueInvalid.status, 400, JSON.stringify(venueInvalid.data));
    assert.equal(venueInvalid.data.error, 'INVALID_LISTING_DETAILS');

    const venueValid = await patchListing(tokens.providerA, LISTING_VENUE, {
      payload: { customFieldValues: { capacity: 900 } },
    });
    assert.equal(venueValid.status, 200, JSON.stringify(venueValid.data));
    assert.equal((await listingRow(LISTING_VENUE)).payload.customFieldValues.capacity, 900);
  });

  await t.test('audit events are server-attributed, append-only and RLS-scoped', async () => {
    const response = await patchListing(tokens.providerA, LISTING_A, { title: 'Audited provider edit' });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.ok(response.data.auditEventId);

    const event = await latestAudit(LISTING_A);
    assert.equal(event.id, response.data.auditEventId);
    assert.equal(event.actor_user_id, A);
    assert.equal(event.actor_role, 'provider');
    assert.equal(event.module, 'pg_hostels');
    assert.equal(event.action, 'listing.update');
    assert.ok(event.changed_fields.includes('title'));
    assert.equal(event.before_state.title, 'Assigned admin edit');
    assert.equal(event.after_state.title, 'Audited provider edit');
    assert.ok(event.occurred_at);
    assert.equal(event.source, 'server_listing_trigger');

    await expectSqlFailure(
      A,
      `insert into public.live_edit_audit_events
         (actor_user_id, actor_role, module, listing_id, listing_title, action, changed_fields, summary)
       values ($1, 'super_admin', 'pg_hostels', $2, 'forged', 'listing.update', array['title'], 'forged')`,
      [A, LISTING_A],
      /permission denied/i,
    );
    await expectSqlFailure(
      A,
      'update public.live_edit_audit_events set summary = $2 where id = $1',
      [event.id, 'tampered'],
      /denied|permission/i,
    );
    await expectSqlFailure(
      A,
      'delete from public.live_edit_audit_events where id = $1',
      [event.id],
      /denied|permission/i,
    );
    await assert.rejects(
      sql('update public.live_edit_audit_events set summary = $2 where id = $1', [event.id, 'tampered']),
      /LIVE_EDIT_AUDIT_APPEND_ONLY/,
    );
    await assert.rejects(sql('delete from public.live_edit_audit_events where id = $1', [event.id]), /LIVE_EDIT_AUDIT_APPEND_ONLY/);
    await assert.rejects(sql('truncate public.live_edit_audit_events'), /LIVE_EDIT_AUDIT_APPEND_ONLY/);

    await expectSqlFailure(
      A,
      `select public.record_live_edit_cinema_audit(
         $1, 'movie-hyd-1', 'Forged cinema audit',
         array['details.refundPercent'], '{}'::jsonb, '{}'::jsonb
       )`,
      [SCREEN_A],
      /permission denied for function record_live_edit_cinema_audit|LIVE_EDIT_SERVER_CONTEXT_REQUIRED/,
    );

    const providerARead = await asActor(A, async (client) => {
      const result = await client.query('select count(*)::int as count from public.live_edit_audit_events where listing_id = $1', [
        LISTING_A,
      ]);
      return result.rows[0].count;
    });
    assert.ok(providerARead > 0);
    const providerBRead = await asActor(B, async (client) => {
      const result = await client.query('select count(*)::int as count from public.live_edit_audit_events where listing_id = $1', [
        LISTING_A,
      ]);
      return result.rows[0].count;
    });
    assert.equal(providerBRead, 0);
    const assignedRead = await asActor(ADMIN_ASSIGNED, async (client) => {
      const result = await client.query('select count(*)::int as count from public.live_edit_audit_events where listing_id = $1', [
        LISTING_A,
      ]);
      return result.rows[0].count;
    });
    assert.ok(assignedRead > 0);
    const unassignedRead = await asActor(ADMIN_UNASSIGNED, async (client) => {
      const result = await client.query('select count(*)::int as count from public.live_edit_audit_events where listing_id = $1', [
        LISTING_A,
      ]);
      return result.rows[0].count;
    });
    assert.equal(unassignedRead, 0);
  });

  await t.test('failed audit persistence rolls the listing write back', async () => {
    await sql(`drop trigger if exists test_reject_live_edit_audit on public.live_edit_audit_events`);
    await sql(`drop function if exists public.test_reject_live_edit_audit()`);
    await sql(`
      create function public.test_reject_live_edit_audit() returns trigger
      language plpgsql as $$
      begin
        raise exception 'LIVE_EDIT_AUDIT_PERSISTENCE_FAILED' using errcode = '42501';
      end $$;
    `);
    await sql(`
      create trigger test_reject_live_edit_audit
      before insert on public.live_edit_audit_events
      for each row when (new.listing_id = '${LISTING_AUDIT_FAIL}')
      execute function public.test_reject_live_edit_audit();
    `);

    const beforeTitle = (await listingRow(LISTING_AUDIT_FAIL)).title;
    const beforeAuditCount = await auditCount(LISTING_AUDIT_FAIL);
    const response = await patchListing(tokens.providerA, LISTING_AUDIT_FAIL, { title: 'Must not persist' });
    assert.equal(response.status, 503, JSON.stringify(response.data));
    assert.equal(response.data.error, 'AUDIT_PERSISTENCE_FAILED');
    assert.equal((await listingRow(LISTING_AUDIT_FAIL)).title, beforeTitle);
    assert.equal(await auditCount(LISTING_AUDIT_FAIL), beforeAuditCount);

    await sql('drop trigger test_reject_live_edit_audit on public.live_edit_audit_events');
    await sql('drop function public.test_reject_live_edit_audit()');
  });

  await t.test('concurrent edits, stale versions and read-after-write are deterministic', async () => {
    const current = await listingRow(LISTING_A);
    const first = await patchListing(tokens.providerA, LISTING_A, {
      title: 'Concurrency winner',
      expectedUpdatedAt: current.updated_at.toISOString(),
    });
    assert.equal(first.status, 200, JSON.stringify(first.data));

    const stale = await patchListing(tokens.providerA, LISTING_A, {
      title: 'Stale overwrite',
      expectedUpdatedAt: current.updated_at.toISOString(),
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.data.error, 'CONCURRENT_MODIFICATION');
    assert.equal((await listingRow(LISTING_A)).title, 'Concurrency winner');

    const now = await listingRow(LISTING_A);
    const [left, right] = await Promise.all([
      patchListing(tokens.providerA, LISTING_A, {
        title: 'Concurrent left',
        expectedUpdatedAt: now.updated_at.toISOString(),
      }),
      patchListing(tokens.providerA, LISTING_A, {
        title: 'Concurrent right',
        expectedUpdatedAt: now.updated_at.toISOString(),
      }),
    ]);
    const statuses = [left.status, right.status].sort();
    assert.deepEqual(statuses, [200, 409]);

    const feed = await request('GET', '/api/provider/listings', tokens.providerA);
    const visible = feed.data.listings.find((listing) => listing.id === LISTING_A);
    assert.ok(visible);
    const dbRow = await listingRow(LISTING_A);
    assert.equal(visible.title, dbRow.title);
    assert.equal(Number(visible.price), Number(dbRow.price));
  });

  await t.test('cinema screen ownership and assignment are enforced server-side', async () => {
    const own = await request('PUT', '/api/movies/screens', tokens.providerA, {
      screenId: SCREEN_A,
      refundPercent: 65,
    });
    assert.equal(own.status, 200, JSON.stringify(own.data));
    assert.ok(own.data.auditEventId);
    const screenAudit = await latestAudit(SCREEN_A);
    assert.equal(screenAudit.actor_user_id, A);
    assert.equal(screenAudit.actor_role, 'provider');
    assert.equal(screenAudit.module, 'movies');
    assert.equal(screenAudit.action, 'cinema_screen.update');
    assert.ok(screenAudit.changed_fields.includes('details.refundPercent'));

    const inventory = await request('GET', '/api/movies/inventory');
    assert.equal(inventory.status, 200);
    const inventoryScreen = inventory.data.screens.find((screen) => screen.id === SCREEN_A);
    assert.ok(inventoryScreen, 'PostgreSQL-backed inventory returns the screen');
    assert.equal(Number(inventoryScreen.refundPercent), 65);

    const otherProvider = await request('PUT', '/api/movies/screens', tokens.providerB, {
      screenId: SCREEN_A,
      refundPercent: 90,
    });
    assert.equal(otherProvider.status, 403, JSON.stringify(otherProvider.data));
    assert.equal(otherProvider.data.error, 'FORBIDDEN_CINEMA_SCREEN');

    const otherScreen = await request('PUT', '/api/movies/screens', tokens.providerA, {
      screenId: SCREEN_B,
      refundPercent: 90,
    });
    assert.equal(otherScreen.status, 403, JSON.stringify(otherScreen.data));

    const unassignedAdmin = await request('PUT', '/api/movies/screens', tokens.unassignedAdmin, {
      screenId: SCREEN_A,
      refundPercent: 90,
    });
    assert.equal(unassignedAdmin.status, 403, JSON.stringify(unassignedAdmin.data));

    const assignedAdmin = await request('PUT', '/api/movies/screens', tokens.assignedAdmin, {
      screenId: SCREEN_A,
      refundPercent: 70,
    });
    assert.equal(assignedAdmin.status, 200, JSON.stringify(assignedAdmin.data));

    const superAdmin = await request('PUT', '/api/movies/screens', tokens.superAdmin, {
      screenId: SCREEN_UNOWNED,
      refundPercent: 75,
    });
    assert.equal(superAdmin.status, 200, JSON.stringify(superAdmin.data));

    const mismatch = await request('PUT', '/api/movies/screens', tokens.providerA, {
      screenId: SCREEN_A,
      listingId: 'movie-hyd-2',
      refundPercent: 80,
    });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.data.error, 'SCREEN_TARGET_MISMATCH');

    const invalid = await request('PUT', '/api/movies/screens', tokens.providerA, {
      screenId: SCREEN_A,
      refundPercent: 150,
      showtimes: ['not-a-time'],
    });
    assert.equal(invalid.status, 400, JSON.stringify(invalid.data));
    assert.equal(invalid.data.error, 'INVALID_CINEMA_FIELDS');
  });

  await t.test('cinema edits are optimistic-concurrency and RLS safe', async () => {
    const before = await sql('select * from public.cinema_screens where id = $1', [SCREEN_A]);
    const expected = before.rows[0].updated_at.toISOString();
    const [left, right] = await Promise.all([
      request('PUT', '/api/movies/screens', tokens.providerA, {
        screenId: SCREEN_A,
        refundPercent: 61,
        expectedUpdatedAt: expected,
      }),
      request('PUT', '/api/movies/screens', tokens.providerA, {
        screenId: SCREEN_A,
        refundPercent: 62,
        expectedUpdatedAt: expected,
      }),
    ]);
    assert.deepEqual([left.status, right.status].sort(), [200, 409]);
    const after = await sql('select * from public.cinema_screens where id = $1', [SCREEN_A]);
    assert.ok(Number(after.rows[0].row_version) > Number(before.rows[0].row_version));

    const crossProvider = await asActor(B, async (client) => {
      const result = await client.query(
        'update public.cinema_screens set refund_percent = 99 where id = $1',
        [SCREEN_A],
      );
      return result.rowCount;
    });
    assert.equal(crossProvider, 0);
    const unassigned = await asActor(ADMIN_UNASSIGNED, async (client) => {
      const result = await client.query(
        'update public.cinema_screens set refund_percent = 99 where id = $1',
        [SCREEN_A],
      );
      return result.rowCount;
    });
    assert.equal(unassigned, 0);
  });

  await t.test('cinema ownership assignment is verified and Super Admin only', async () => {
    const nonSuper = await request('POST', `/api/movies/screens/${SCREEN_A}/owner`, tokens.assignedAdmin, {
      ownerUserId: B,
    });
    assert.equal(nonSuper.status, 403);
    assert.equal(nonSuper.data.error, 'SUPER_ADMIN_REQUIRED');

    const providerAttempt = await request('POST', `/api/movies/screens/${SCREEN_A}/owner`, tokens.providerA, {
      ownerUserId: B,
    });
    assert.equal(providerAttempt.status, 403);

    const customerOwner = await request('POST', `/api/movies/screens/${SCREEN_A}/owner`, tokens.superAdmin, {
      ownerUserId: CUSTOMER,
    });
    assert.equal(customerOwner.status, 400, JSON.stringify(customerOwner.data));
    assert.equal(customerOwner.data.error, 'ACTIVE_PROVIDER_REQUIRED');

    const suspendedOwner = await request('POST', `/api/movies/screens/${SCREEN_A}/owner`, tokens.superAdmin, {
      ownerUserId: SUSPENDED_PROVIDER,
    });
    assert.equal(suspendedOwner.status, 400, JSON.stringify(suspendedOwner.data));
    assert.equal(suspendedOwner.data.error, 'ACTIVE_PROVIDER_REQUIRED');

    const assigned = await request('POST', `/api/movies/screens/${SCREEN_A}/owner`, tokens.superAdmin, {
      ownerUserId: B,
    });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.data));
    assert.equal(assigned.data.ownerUserId, B);
    const ownerAudit = await latestAudit(SCREEN_A);
    assert.equal(ownerAudit.action, 'cinema_screen.owner_assigned');
    assert.equal(ownerAudit.actor_user_id, SUPER_ADMIN);

    const bEdit = await request('PUT', '/api/movies/screens', tokens.providerA, {
      screenId: SCREEN_A,
      refundPercent: 63,
    });
    assert.equal(bEdit.status, 403, 'previous owner loses access immediately');
    const bOwnerEdit = await request('PUT', '/api/movies/screens', tokens.providerB, {
      screenId: SCREEN_A,
      refundPercent: 63,
    });
    assert.equal(bOwnerEdit.status, 200, JSON.stringify(bOwnerEdit.data));

    const revoked = await request('POST', `/api/movies/screens/${SCREEN_A}/owner`, tokens.superAdmin, {
      ownerUserId: null,
    });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.data));
    const afterRevoke = await request('PUT', '/api/movies/screens', tokens.providerB, {
      screenId: SCREEN_A,
      refundPercent: 64,
    });
    assert.equal(afterRevoke.status, 403);
    const revokeAudit = await latestAudit(SCREEN_A);
    assert.equal(revokeAudit.action, 'cinema_screen.owner_revoked');

    const restored = await request('POST', `/api/movies/screens/${SCREEN_A}/owner`, tokens.superAdmin, {
      ownerUserId: A,
    });
    assert.equal(restored.status, 200, JSON.stringify(restored.data));
  });

  await t.test('cinema audit failure rolls the database and audit back', async () => {
    const beforeStore = await fs.readFile(storePath, 'utf8');
    const beforeScreen = await sql('select * from public.cinema_screens where id = $1', [SCREEN_A]);
    await sql(`drop trigger if exists test_reject_cinema_audit on public.live_edit_audit_events`);
    await sql(`drop function if exists public.test_reject_cinema_audit()`);
    await sql(`
      create function public.test_reject_cinema_audit() returns trigger
      language plpgsql as $$
      begin
        raise exception 'LIVE_EDIT_AUDIT_PERSISTENCE_FAILED' using errcode = '42501';
      end $$;
    `);
    await sql(`
      create trigger test_reject_cinema_audit
      before insert on public.live_edit_audit_events
      for each row when (new.listing_id = '${SCREEN_A}')
      execute function public.test_reject_cinema_audit();
    `);

    const beforeAudit = await auditCount(SCREEN_A);
    const response = await request('PUT', '/api/movies/screens', tokens.providerA, {
      screenId: SCREEN_A,
      refundPercent: 55,
    });
    assert.equal(response.status, 503, JSON.stringify(response.data));
    assert.equal(response.data.error, 'AUDIT_PERSISTENCE_FAILED');
    assert.equal(await fs.readFile(storePath, 'utf8'), beforeStore);
    const afterScreen = await sql('select * from public.cinema_screens where id = $1', [SCREEN_A]);
    assert.equal(Number(afterScreen.rows[0].refund_percent), Number(beforeScreen.rows[0].refund_percent));
    assert.equal(Number(afterScreen.rows[0].row_version), Number(beforeScreen.rows[0].row_version));
    assert.equal(await auditCount(SCREEN_A), beforeAudit);

    await sql('drop trigger test_reject_cinema_audit on public.live_edit_audit_events');
    await sql('drop function public.test_reject_cinema_audit()');
  });
});

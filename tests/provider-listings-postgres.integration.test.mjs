import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import pg from 'pg';
import { filterServiceListings, parseServiceListing } from '../src/lib/sectionExperiences.ts';
import { inferLiveEditModule } from '../src/lib/liveEdit/moduleInference.ts';

const { Pool } = pg;
const databaseAvailable = Boolean(process.env.BOS_LISTINGS_DATABASE_URL);
const dbTest = databaseAvailable ? test : test.skip;
const connectionString = process.env.BOS_LISTINGS_DATABASE_URL;
const TEST_HMAC_SECRET = 'bos-local-postgres-listing-test-secret';
const providerA = '8a99cba9-278a-48b6-a0ca-d654bcbd05a2';
const providerB = '84d1db08-0508-4daf-947d-84959a1b7230';
const customer = 'f2e2c181-588e-4cb4-80ae-5992b9e758e9';
const admin = 'c98705a1-a8e8-48a9-96a4-48ea5a710aa4';
const applicant = 'd445f2a9-a595-4e15-940c-ae3565a8ae81';
let pool;
let child;
let tempDir;
let storePath;
let serverUrl;
let authTestServer;
let serverAuthConfig = {};
/** `${ownerUserId}:${module}` -> seeded business id; one business per module. */
const businessIds = new Map();
const FIXTURE_MODULES = ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay'];
const DEFAULT_FIXTURE_MODULE = 'pg_hostels';

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

function sessionToken({ authId, role, userId, email, googleSub }) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    supabaseUserId: authId,
    email,
    name: `${role} integration test`,
    googleSub,
    phone: '+91 90000 00000',
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 10 * 60_000,
  })).toString('base64url');
  const signature = createHmac('sha256', `${TEST_HMAC_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

const providerAToken = sessionToken({ authId: providerA, role: 'provider', userId: 'USR-IT-A', email: 'provider-a@example.test' });
const providerBToken = sessionToken({ authId: providerB, role: 'provider', userId: 'USR-IT-B', email: 'provider-b@example.test' });
const customerToken = sessionToken({ authId: customer, role: 'customer', userId: 'USR-IT-C', email: 'customer@example.test' });
const forgedCustomerProviderToken = sessionToken({ authId: customer, role: 'provider', userId: 'USR-IT-C', email: 'customer@example.test' });
const adminToken = sessionToken({ authId: admin, role: 'admin', userId: 'USR-IT-ADMIN', email: 'admin@example.test' });

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
      ...serverAuthConfig,
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`test server exited before listening (${child.exitCode})`);
    try {
      const response = await fetch(`${serverUrl}/api/auth/me`);
      if (response.status === 401) return;
    } catch {
      // Wait for local app boot only.
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

/**
 * The shared listing surface is scoped by the caller's selected business, and a
 * business is approved for exactly one module. Pick the fixture business whose
 * module owns the listing being addressed (or the one being written), so each
 * request carries the same `x-business-id` the portal would send.
 */
async function businessIdFor(token, url, body) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  } catch {
    return '';
  }
  if (payload.role !== 'provider' || !payload.supabaseUserId) return '';
  const owner = payload.supabaseUserId;
  let module = null;
  const addressedListing = String(url).match(/\/listings\/([^/?#]+)/)?.[1];
  if (addressedListing) {
    const { rows } = await pool.query('select category_id, entity_type, subcategory, title from public.listings where id = $1', [addressedListing]);
    if (rows[0]) {
      module = inferLiveEditModule({
        categoryId: rows[0].category_id,
        entityType: rows[0].entity_type,
        subcategory: rows[0].subcategory,
        title: rows[0].title,
      });
    }
  } else if (body?.categoryId) {
    module = inferLiveEditModule({
      categoryId: body.categoryId,
      entityType: body.entityType,
      subcategory: body.subcategory,
      title: body.title,
    });
  }
  const seeded = businessIds.get(`${owner}:${module}`)
    || businessIds.get(`${owner}:${DEFAULT_FIXTURE_MODULE}`);
  if (seeded) return seeded;
  const business = await pool.query(
    `select b.id from public.businesses b join public.business_members m on m.business_id=b.id
      where b.owner_user_id=$1 and m.user_id=$1 and m.status='active' and b.approval_status='approved'
      order by b.created_at limit 1`,
    [owner],
  );
  return business.rows[0]?.id || '';
}

async function request(method, url, token, body) {
  const businessId = token ? await businessIdFor(token, url, body) : '';
  const response = await fetch(`${serverUrl}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(businessId ? { 'x-business-id': businessId } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return { response, data };
}

async function createListing(token, id, overrides = {}) {
  return request('POST', '/api/provider/listings', token, {
    id,
    title: 'Verified local integration listing',
    categoryId: 'pg_hostels',
    subcategory: 'Co-living',
    entityType: 'pg',
    price: 7200,
    priceUnit: 'per month',
    isFeatured: true,
    providerPhone: '+91 98888 11111',
    userId: providerB,
    ownerUserId: providerB,
    providerId: `prov-${providerB}`,
    payload: { area: 'Test Area', isVerified: true, verifiedBy: 'forged-client' },
    ...overrides,
  });
}

async function seedProfiles() {
  const actors = [
    [providerA, 'provider-a@example.test', 'Provider A', 'provider'],
    [providerB, 'provider-b@example.test', 'Provider B', 'provider'],
    [customer, 'customer@example.test', 'Customer', 'customer'],
    [admin, 'admin@example.test', 'Admin', 'admin'],
  ];
  for (const [id, email, name, role] of actors) {
    await pool.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, $2, jsonb_build_object('role', $3::text, 'full_name', $4::text))
       on conflict (id) do nothing`,
      [id, email, role, name],
    );
    await pool.query(
      `insert into public.profiles (id, email, full_name, phone, role, account_status)
       values ($1, $2, $3, '+91 97777 00000', $4, 'active')
       on conflict (id) do update set email = excluded.email, full_name = excluded.full_name,
         phone = excluded.phone, role = excluded.role, account_status = 'active'`,
      [id, email, name, role],
    );
  }
  for (const [owner, label] of [[providerA, 'Provider A'], [providerB, 'Provider B']]) {
    const ref = `BIZ-IT-${owner.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
    for (const module of FIXTURE_MODULES) {
      const moduleRef = module === DEFAULT_FIXTURE_MODULE ? ref : `${ref}-${module.toUpperCase()}`;
      const seeded = await pool.query(
        `insert into public.businesses (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source,created_by,approved_at)
         values ($1,$2,$3,$4,'approved',true,'integration_test',$4,now())
         on conflict (business_ref) do update set module_type=excluded.module_type, is_enabled=true, approval_status='approved'
         returning id`,
        [moduleRef, `${label} ${module} Business`, module, owner],
      );
      businessIds.set(`${owner}:${module}`, seeded.rows[0].id);
    }
  }
  // The existing integration admin is the platform Super Admin: verification,
  // featured and moderation fields now require a fresh Super Admin check.
  await pool.query(
    `update public.profiles set is_super_admin = (role = 'admin')
      where id = any($1::uuid[])`,
    [actors.map(([id]) => id)],
  );
}

dbTest('provider listing API uses local PostgreSQL transactions and RLS', { skip: !connectionString }, async (t) => {
  pool = new Pool({ connectionString });
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bos-pg-listing-api-'));
  storePath = path.join(tempDir, 'isolated-store.json');
  await fs.writeFile(storePath, JSON.stringify({
    seatLocks: {}, bookings: [], enquiries: [], paymentIntents: {}, usedUtrs: {},
    checkedInPasses: {}, users: [{
      id: 'USR-IT-NEW', supabaseUserId: applicant, name: 'New Provider', email: 'new-provider@example.test',
      phone: '', role: 'customer', googleSub: 'google-new-provider', authProvider: 'google', verified: true,
      kycDocument: 'Google OAuth 2.0 Verified', accountStatus: 'active', city: 'Test City', joinedAt: '2026-11-03',
      lastLoginAt: new Date().toISOString(), listingsCount: 0, bookingsCount: 0, totalSpentOrEarned: 0,
      permissions: ['book_services'], publishState: 'published',
    }, {
      // Test-only explicit owner bootstrap fixture. Profile metadata below is
      // deliberately untrusted; the database role is seeded separately.
      id: 'USR-IT-ADMIN', supabaseUserId: admin, name: 'Admin', email: 'admin@example.test',
      phone: '', role: 'admin', googleSub: 'google-integration-admin', authProvider: 'google', verified: true,
      kycDocument: 'Google OAuth 2.0 Verified', accountStatus: 'active', city: 'Test City', joinedAt: '2026-11-03',
      lastLoginAt: new Date().toISOString(), listingsCount: 0, bookingsCount: 0, totalSpentOrEarned: 0,
      permissions: ['admin_access'], publishState: 'published',
    }], notifications: [], notificationCampaigns: [],
    providerListings: {}, adminModules: {}, revokedTokens: {},
  }));
  await seedProfiles();
  await pool.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'new-provider@example.test', '{"full_name":"New Provider"}'::jsonb) on conflict (id) do nothing`,
    [applicant],
  );
  // Simulate a missing Auth trigger profile. The verified app session must
  // provision it transactionally on the onboarding request.
  // Registration on an earlier run can leave a business owned by the applicant;
  // clear it first so the profile reset is not blocked by the owner foreign key.
  await pool.query('delete from public.listings where owner_id = $1', [applicant]);
  await pool.query('delete from public.businesses where owner_user_id = $1', [applicant]);
  await pool.query('delete from public.profiles where id = $1', [applicant]);
  const authPort = await freePort();
  authTestServer = http.createServer((req, res) => {
    if (req.url !== '/auth/v1/user' || req.headers.authorization !== 'Bearer local-google-access-token-for-integration') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: applicant,
      email: 'new-provider@example.test',
      email_confirmed_at: '2026-01-01T00:00:00.000Z',
      app_metadata: { provider: 'google' },
      user_metadata: { role: 'admin', email: 'admin@bookourspace.in' },
      identities: [{ provider: 'google', identity_data: { sub: 'google-new-provider', full_name: 'Verified New Provider' } }],
    }));
  });
  await new Promise((resolve, reject) => {
    authTestServer.once('error', reject);
    authTestServer.listen(authPort, '127.0.0.1', resolve);
  });
  const anonJwtPayload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url');
  serverAuthConfig = {
    VITE_SUPABASE_URL: `http://127.0.0.1:${authPort}`,
    VITE_SUPABASE_PROJECT_ID: 'local',
    VITE_SUPABASE_PUBLISHABLE_KEY: `local.${anonJwtPayload}.integration-only`,
  };
  await startServer();

  const listingId = `pg-it-${randomUUID()}`;
  const duplicateId = `pg-it-duplicate-${randomUUID()}`;
  let listing;

  await t.test('unauthorized and customer requests cannot create provider listings', async () => {
    const unauthenticated = await request('POST', '/api/provider/listings', undefined, { title: 'No auth' });
    assert.equal(unauthenticated.response.status, 401);
    const customerWrite = await request('POST', '/api/provider/listings', customerToken, { title: 'No provider role' });
    assert.equal(customerWrite.response.status, 403);
    assert.equal(customerWrite.data.error, 'FORBIDDEN_PROVIDER_ROLE_REQUIRED');
    const forgedRole = await request('GET', '/api/provider/listings', forgedCustomerProviderToken);
    assert.equal(forgedRole.response.status, 403);
    assert.ok(['SESSION_ROLE_MISMATCH','BUSINESS_CONTEXT_REQUIRED'].includes(forgedRole.data.error));
  });

  await t.test('Google customer registration provisions profile and submits an idempotent provider application', async () => {
    const login = await request('POST', '/api/auth/google/authenticate', undefined, {});
    assert.equal(login.response.status, 401, 'login still requires a Supabase access token');
    const oauthResponse = await fetch(`${serverUrl}/api/auth/google/authenticate`, {
      method: 'POST',
      headers: { authorization: 'Bearer local-google-access-token-for-integration', 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin', email: 'admin@bookourspace.in', userId: admin }),
    });
    const oauth = await oauthResponse.json();
    assert.equal(oauthResponse.status, 200, JSON.stringify(oauth));
    assert.equal(oauth.user.role, 'customer', 'verified Google login provisions a least-privilege profile');
    assert.ok(oauth.sessionToken);
    const applicantSession = oauth.sessionToken;
    const requestId = randomUUID();
    const application = {
      requestId,
      providerType: 'services',
      businessName: 'Verified Local Repair',
      contactPhone: '+91 90000 22222',
      city: 'Test City',
      area: 'North District',
      serviceArea: 'Telangana / Ranga Reddy / Shankarpally / Mokila',
      role: 'admin',
      userId: admin,
      status: 'approved',
    };
    const rollbackIdentity = 'e6a699bb-347f-45aa-9a71-03436237bcfa';
    await pool.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'rollback-provider@example.test','{}'::jsonb) on conflict (id) do nothing`, [rollbackIdentity]);
    await pool.query('delete from public.listings where owner_id = $1', [rollbackIdentity]);
    await pool.query('delete from public.businesses where owner_user_id = $1', [rollbackIdentity]);
    await pool.query('delete from public.profiles where id=$1', [rollbackIdentity]);
    await pool.query(`create or replace function public.bos_test_fail_provider_registration()
      returns trigger language plpgsql as $$ begin
        if new.business_name = 'Rollback Business' then raise exception 'intentional test rollback'; end if;
        return new;
      end $$`);
    await pool.query('drop trigger if exists bos_test_fail_provider_registration on public.provider_registration_requests');
    await pool.query(`create trigger bos_test_fail_provider_registration before insert on public.provider_registration_requests
      for each row execute function public.bos_test_fail_provider_registration()`);
    try {
      const rollback = await request('POST', '/api/provider/registrations', sessionToken({ authId: rollbackIdentity, role: 'customer', userId: 'USR-ROLLBACK', email: 'rollback-provider@example.test' }), {
        requestId: randomUUID(), providerType: 'classes', businessName: 'Rollback Business',
        contactPhone: '+91 90000 33333', city: 'Test City', area: 'West District',
      });
      assert.equal(rollback.response.status, 500, 'trigger failure is not reported as success');
      const rolledBackProfile = await pool.query('select id from public.profiles where id=$1', [rollbackIdentity]);
      assert.equal(rolledBackProfile.rowCount, 0, 'profile provisioning rolls back with registration write');
    } finally {
      await pool.query('drop trigger if exists bos_test_fail_provider_registration on public.provider_registration_requests');
      await pool.query('drop function if exists public.bos_test_fail_provider_registration()');
    }

    const submitted = await request('POST', '/api/provider/registrations', applicantSession, application);
    assert.equal(submitted.response.status, 201, JSON.stringify(submitted.data));
    assert.equal(submitted.data.registration.status, 'pending');
    assert.equal(submitted.data.registration.providerType, 'services');
    assert.equal(submitted.data.registration.userId, applicant);
    assert.equal(submitted.data.registration.serviceArea, application.serviceArea,
      'the name-selected service hierarchy is saved with the customer-owned application');
    const storedCoverage = await pool.query(
      'select service_area from public.provider_registration_requests where id = $1 and user_id = $2',
      [submitted.data.registration.id, applicant],
    );
    assert.equal(storedCoverage.rows[0]?.service_area, application.serviceArea,
      'provider coverage persists in the authorized local PostgreSQL row');
    const provisioned = await pool.query('select role,account_status,google_sub from public.profiles where id=$1', [applicant]);
    assert.equal(provisioned.rows[0].role, 'customer', 'untrusted role/status fields cannot self-activate');
    assert.equal(provisioned.rows[0].account_status, 'active');
    assert.equal(provisioned.rows[0].google_sub, 'google-new-provider');

    const retry = await request('POST', '/api/provider/registrations', applicantSession, application);
    assert.equal(retry.response.status, 200);
    assert.equal(retry.data.idempotent, true);
    assert.equal(retry.data.registration.id, submitted.data.registration.id);
    const changedReplay = await request('POST', '/api/provider/registrations', applicantSession, { ...application, businessName: 'Different Business' });
    assert.equal(changedReplay.response.status, 409, 'idempotency key cannot be reused for changed registration data');
    for (const providerType of ['pg_hostels', 'classes', 'venues', 'hotel_stay', 'movies']) {
      const additionalModule = await request('POST', '/api/provider/registrations', applicantSession, {
        ...application,
        requestId: randomUUID(),
        providerType,
        businessName: `Provider ${providerType}`,
      });
      assert.equal(additionalModule.response.status, 201, `${providerType} provider onboarding is accepted`);
      assert.equal(additionalModule.data.registration.providerType, providerType);
    }

    const otherUser = await request('GET', '/api/provider/registrations/me', providerBToken);
    assert.equal(otherUser.response.status, 200);
    assert.equal(otherUser.data.registration, null, 'another Google user cannot view the application');
    assert.equal((await request('GET', '/api/admin/provider-registrations', customerToken)).response.status, 403);
    const adminQueue = await request('GET', '/api/admin/provider-registrations', adminToken);
    assert.equal(adminQueue.response.status, 200);
    const queued = adminQueue.data.registrations.find((entry) => entry.id === submitted.data.registration.id);
    assert.equal(queued.contactPhone, '+91 90000 22222', 'authorized Admin can review submitted contact');
    const selfApproval = await request('PATCH', `/api/admin/provider-registrations/${submitted.data.registration.id}/review`, applicantSession, { decision: 'approved' });
    assert.equal(selfApproval.response.status, 403, 'applicant cannot self-approve');
    const forgedAdmin = sessionToken({ authId: applicant, role: 'admin', userId: 'USR-IT-NEW', email: 'new-provider@example.test' });
    const forgedQueue = await request('GET', '/api/admin/provider-registrations', forgedAdmin);
    assert.equal(forgedQueue.response.status, 403, 'a signed session role claim still cannot override the PostgreSQL profile');

    const approved = await request('PATCH', `/api/admin/provider-registrations/${submitted.data.registration.id}/review`, adminToken, { decision: 'approved' });
    assert.equal(approved.response.status, 200);
    assert.equal(approved.data.registration.status, 'approved');
    const activatedProfile = await pool.query('select role from public.profiles where id=$1', [applicant]);
    assert.equal(activatedProfile.rows[0].role, 'provider', 'application and profile activation are in one transaction');
    const repeatedApproval = await request('PATCH', `/api/admin/provider-registrations/${submitted.data.registration.id}/review`, adminToken, { decision: 'approved' });
    assert.equal(repeatedApproval.response.status, 200);
    assert.equal(repeatedApproval.data.idempotent, true);

    const refreshed = await request('GET', '/api/auth/me', applicantSession);
    assert.equal(refreshed.response.status, 200);
    assert.equal(refreshed.data.user.role, 'provider');
    assert.ok(refreshed.data.sessionToken, 'role refresh is signed by the server');
    const created = await createListing(refreshed.data.sessionToken, `new-provider-${randomUUID()}`, {
      categoryId: 'services', subcategory: 'Electrical repair', entityType: 'service',
      title: 'New provider listing', price: 500,
      payload: { location: { city: 'Test City', area: 'North District' } },
    });
    assert.equal(created.response.status, 201, 'activated provider can submit a pending listing');
    assert.equal(created.data.listing.ownerUserId, applicant);
    assert.equal(created.data.listing.status, 'pending_approval');
    assert.equal((await request('GET', `/api/marketplace/listings/${encodeURIComponent(created.data.listing.id)}`)).response.status, 404);
    const listingApproval = await request('PATCH', `/api/admin/provider/listings/${encodeURIComponent(created.data.listing.id)}/review`, adminToken, { decision: 'active' });
    assert.equal(listingApproval.response.status, 200);
    const publicDetail = await request('GET', `/api/marketplace/listings/${encodeURIComponent(created.data.listing.id)}`);
    assert.equal(publicDetail.response.status, 200);
    assert.equal(publicDetail.data.listing.categoryId, 'services');
    assert.equal(publicDetail.data.listing.attributes.location.city, 'Test City');
    assert.ok(!JSON.stringify(publicDetail.data).includes('+91 90000 22222'), 'provider registration contact is not public');
    const otherProviderEdit = await request('PATCH', `/api/provider/listings/${encodeURIComponent(created.data.listing.id)}`, providerBToken, { title: 'Takeover' });
    assert.equal(otherProviderEdit.response.status, 404);
    globalThis.newProviderListingId = created.data.listing.id;
    globalThis.newProviderSession = refreshed.data.sessionToken;
  });

  await t.test('provider creates a pending listing tied to the verified Auth UUID', async () => {
    const created = await createListing(providerAToken, listingId);
    assert.equal(created.response.status, 201);
    listing = created.data.listing;
    assert.equal(listing.ownerUserId, providerA);
    assert.equal(listing.providerId, `prov-${providerA.slice(0, 8)}`,
      'providerId must derive from the verified Auth UUID, not a client-supplied legacy id');
    assert.equal(listing.status, 'pending_approval');
    assert.equal(listing.isVerified, false);
    assert.equal(listing.isFeatured, false);
    assert.equal(listing.providerPhone, '+91 97777 00000');
    assert.equal(listing.payload.isVerified, undefined);
    assert.equal(listing.payload.verifiedBy, undefined);
  });

  await t.test('providers cannot request trusted verification fields', async () => {
    const attempt = await createListing(providerAToken, `pg-it-unverified-${randomUUID()}`, { isVerified: true });
    assert.equal(attempt.response.status, 403);
    assert.equal(attempt.data.error, 'FORBIDDEN_VERIFICATION_FIELD');
  });

  await t.test('duplicate create is idempotent and conflicting reuse is rejected', async () => {
    const input = { title: 'Retry listing', categoryId: 'classes', subcategory: 'Music', entityType: 'class', price: 100 };
    const results = await Promise.all([
      createListing(providerAToken, duplicateId, input),
      createListing(providerAToken, duplicateId, input),
    ]);
    assert.deepEqual(results.map((result) => result.response.status).sort(), [200, 201]);
    assert.equal(results[0].data.listing.id, duplicateId);
    const conflict = await createListing(providerAToken, duplicateId, { ...input, title: 'Different request' });
    assert.equal(conflict.response.status, 409);
    const mismatchedUnit = await createListing(providerAToken, duplicateId, { ...input, priceUnit: 'per year' });
    assert.equal(mismatchedUnit.response.status, 409);
    const { rows } = await pool.query('select count(*)::int as count from public.listings where id = $1', [duplicateId]);
    assert.equal(rows[0].count, 1);

    const requestId = `pg-it-request-${randomUUID()}`;
    const requestRetries = await Promise.all([
      createListing(providerAToken, `pg-it-request-a-${randomUUID()}`, { ...input, requestId }),
      createListing(providerAToken, `pg-it-request-b-${randomUUID()}`, { ...input, requestId }),
    ]);
    assert.deepEqual(requestRetries.map((result) => result.response.status).sort(), [200, 201]);
    assert.equal(requestRetries[0].data.listing.id, requestRetries[1].data.listing.id,
      'concurrent same-requestId retries must return the single committed row');
    const requestRows = await pool.query(
      "select count(*)::int as count from public.listings where owner_id = $1 and payload ->> 'requestId' = $2",
      [providerA, requestId],
    );
    assert.equal(requestRows.rows[0].count, 1);
  });

  await t.test('RLS and server authorization isolate rows between providers', async () => {
    const own = await request('GET', '/api/provider/listings', providerAToken);
    assert.ok(own.data.listings.some((entry) => entry.id === listingId));
    const other = await request('GET', '/api/provider/listings', providerBToken);
    assert.ok(!other.data.listings.some((entry) => entry.id === listingId));
    const edit = await request('PATCH', `/api/provider/listings/${encodeURIComponent(listingId)}`, providerBToken, { title: 'Takeover' });
    assert.equal(edit.response.status, 404);
    const deactivate = await request('DELETE', `/api/provider/listings/${encodeURIComponent(listingId)}`, providerBToken);
    assert.equal(deactivate.response.status, 404);
    assert.equal((await request('POST', '/api/provider/listings', customerToken, { id: `pg-it-customer-${randomUUID()}` })).response.status, 403);
  });

  await t.test('admin-created listing starts pending and requires a separate review transaction', async () => {
    const adminListingId = `pg-it-admin-${randomUUID()}`;
    const published = await createListing(adminToken, adminListingId, { status: 'active', isVerified: true });
    assert.equal(published.response.status, 201);
    assert.equal(published.data.listing.status, 'pending_approval');
    assert.equal(published.data.listing.isVerified, true);
    const beforeReview = await request('GET', '/api/marketplace/listings');
    assert.ok(!beforeReview.data.listings.some((entry) => entry.id === adminListingId));
    const approval = await request('PATCH', `/api/admin/provider/listings/${encodeURIComponent(adminListingId)}/review`, adminToken, { decision: 'active' });
    assert.equal(approval.response.status, 200);
    assert.equal(approval.data.listing.status, 'active');
    const publicListings = await request('GET', '/api/marketplace/listings');
    assert.equal(publicListings.response.status, 200);
    assert.equal(publicListings.data.source, 'postgresql');
    assert.ok(publicListings.data.listings.some((entry) => entry.id === adminListingId));
    assert.ok(!JSON.stringify(publicListings.data).includes('+91 97777 00000'));
    assert.ok(!JSON.stringify(publicListings.data).includes('ownerUserId'));
    const providerFeed = await request('GET', '/api/provider/listings', providerAToken);
    assert.ok(!providerFeed.data.listings.some((entry) => entry.id === adminListingId),
      'provider management feed must not expose another active provider listing or contact details');
    const categories = await request('GET', '/api/marketplace/categories');
    assert.equal(categories.response.status, 200);
    assert.equal(categories.data.source, 'postgresql');
    assert.ok(categories.data.categories.some((category) => category.id === 'pg_hostels'));

    const requestId = `admin-provider-request-${randomUUID()}`;
    const [first, retry] = await Promise.all([
      createListing(adminToken, `pg-it-admin-owner-a-${randomUUID()}`, { ownerId: providerA, requestId }),
      createListing(adminToken, `pg-it-admin-owner-b-${randomUUID()}`, { ownerId: providerA, requestId }),
    ]);
    assert.deepEqual([first.response.status, retry.response.status].sort(), [200, 201]);
    assert.equal(first.data.listing.id, retry.data.listing.id, 'admin retries for an assigned provider return the same persisted listing');
    assert.equal(first.data.listing.ownerUserId, providerA);
    assert.equal(first.data.listing.providerId, `prov-${providerA.slice(0, 8)}`);
  });

  await t.test('approval workflow publishes a listing into the public feed and details page', async () => {
    const approvalId = `pg-it-approval-${randomUUID()}`;
    const created = await createListing(providerAToken, approvalId, {
      title: 'Approval Slice Listing',
      categoryId: 'pg_hostels',
      subcategory: 'Single Sharing',
      entityType: 'property',
      price: 6400,
      priceUnit: 'per month',
      payload: {
        images: ['https://cdn.example.test/room.jpg'],
        area: 'Madhapur',
        description: 'Furnished single room',
      },
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.listing.status, 'pending_approval');

    const hiddenDetails = await request('GET', `/api/marketplace/listings/${encodeURIComponent(approvalId)}`);
    assert.equal(hiddenDetails.response.status, 404, 'unapproved listings must not be publicly addressable');
    const hiddenFeed = await request('GET', '/api/marketplace/listings');
    assert.ok(!hiddenFeed.data.listings.some((entry) => entry.id === approvalId));

    const providerApproval = await request('PATCH', `/api/admin/provider/listings/${encodeURIComponent(approvalId)}/review`, providerAToken, { decision: 'active' });
    assert.equal(providerApproval.response.status, 403, 'provider cannot use the admin review route');
    const customerApproval = await request('PATCH', `/api/admin/provider/listings/${encodeURIComponent(approvalId)}/review`, customerToken, { decision: 'active' });
    assert.equal(customerApproval.response.status, 403, 'customer cannot use the admin review route');

    const missingReason = await request('POST', '/api/super-admin/listings/action', adminToken, {
      listingId: approvalId,
      action: 'force_approve',
    });
    assert.equal(missingReason.response.status, 403);
    assert.equal(missingReason.data.error, 'SUPER_ADMIN_SCOPE_REQUIRED', 'a normal Admin session does not carry Super Admin authority');

    const approved = await request('PATCH', `/api/admin/provider/listings/${encodeURIComponent(approvalId)}/review`, adminToken, { decision: 'active' });
    assert.equal(approved.response.status, 200, JSON.stringify(approved.data));
    assert.equal(approved.data.source, 'postgres');
    assert.equal(approved.data.listing.status, 'active');
    assert.equal(approved.data.listing.providerPhone, undefined, 'admin responses stay contact-free');

    const details = await request('GET', `/api/marketplace/listings/${encodeURIComponent(approvalId)}`);
    assert.equal(details.response.status, 200);
    assert.equal(details.data.source, 'postgresql');
    assert.equal(details.data.listing.id, approvalId);
    assert.equal(details.data.listing.categoryId, 'pg_hostels');
    assert.equal(details.data.listing.subcategory, 'Single Sharing');
    assert.equal(details.data.listing.entityType, 'property');
    assert.equal(details.data.listing.price, 6400);
    assert.equal(details.data.listing.priceUnit, 'per month');
    assert.deepEqual(details.data.listing.attributes.images, ['https://cdn.example.test/room.jpg']);
    assert.equal(details.data.listing.attributes.area, 'Madhapur');
    const serializedDetails = JSON.stringify(details.data);
    assert.ok(!serializedDetails.includes('+91 97777 00000'), 'provider phone must never be public');
    assert.ok(!serializedDetails.includes('ownerUserId'), 'owner identity must never be public');
    assert.ok(!serializedDetails.includes('providerPhone'), 'provider contact keys must never be public');

    const byCategory = await request('GET', '/api/marketplace/listings?categoryId=pg_hostels&subcategory=Single%20Sharing');
    assert.equal(byCategory.response.status, 200);
    assert.ok(byCategory.data.listings.some((entry) => entry.id === approvalId));
    const wrongCategory = await request('GET', '/api/marketplace/listings?categoryId=classes');
    assert.ok(!wrongCategory.data.listings.some((entry) => entry.id === approvalId));
    const bySearch = await request('GET', '/api/marketplace/listings?q=Approval%20Slice');
    assert.ok(bySearch.data.listings.some((entry) => entry.id === approvalId));

    const archived = await request('POST', '/api/super-admin/listings/action', adminToken, {
      listingId: approvalId,
      action: 'archive',
      reason: 'owner requested removal',
    });
    assert.equal(archived.response.status, 403, 'a signed Admin token cannot archive without current Supabase Super Admin authority');
    assert.equal(archived.data.error, 'SUPER_ADMIN_SCOPE_REQUIRED');
    const afterDeniedArchive = await request('GET', `/api/marketplace/listings/${encodeURIComponent(approvalId)}`);
    assert.equal(afterDeniedArchive.response.status, 200, 'failed privileged action must not mutate the listing');
  });

  await t.test('all non-movie modules publish into their own category/subcategory feeds and details', async () => {
    const modules = [
      { categoryId: 'pg_hostels', subcategory: 'Co-living', entityType: 'property' },
      { categoryId: 'classes', subcategory: 'Music', entityType: 'course' },
      { categoryId: 'venues', subcategory: 'Function Hall', entityType: 'venue' },
      { categoryId: 'services', subcategory: 'Plumbing', entityType: 'service' },
      { categoryId: 'hotel-budget', subcategory: 'Family Suite Rooms', entityType: 'property' },
    ];
    for (const module of modules) {
      const id = `pg-it-${module.categoryId}-${randomUUID()}`;
      const created = await createListing(providerAToken, id, {
        title: `Real ${module.categoryId} listing`,
        ...module,
        price: 1200,
        priceUnit: 'per day',
        payload: { location: { city: 'Test City', area: 'Test District' }, description: 'Provider supplied details.' },
      });
      assert.equal(created.response.status, 201, `${module.categoryId} create`);
      assert.equal(created.data.listing.status, 'pending_approval');
      const approved = await request('PATCH', `/api/admin/provider/listings/${encodeURIComponent(id)}/review`, adminToken, { decision: 'active' });
      assert.equal(approved.response.status, 200, `${module.categoryId} review`);
      const filtered = await request('GET', `/api/marketplace/listings?categoryId=${encodeURIComponent(module.categoryId)}&subcategory=${encodeURIComponent(module.subcategory)}`);
      assert.ok(filtered.data.listings.some((entry) => entry.id === id), `${module.categoryId} filtered feed`);
      const detail = await request('GET', `/api/marketplace/listings/${encodeURIComponent(id)}`);
      assert.equal(detail.response.status, 200, `${module.categoryId} detail`);
      assert.equal(detail.data.listing.entityType, module.entityType);
      assert.equal(detail.data.listing.attributes.location.city, 'Test City');
      assert.ok(!JSON.stringify(detail.data).includes('+91 97777 00000'));
      if (module.categoryId === 'services') {
        const attributes = detail.data.listing.attributes;
        const customerCard = parseServiceListing({
          id,
          title: detail.data.listing.title,
          categoryId: detail.data.listing.categoryId,
          subcategory: detail.data.listing.subcategory,
          entityType: detail.data.listing.entityType,
          price: detail.data.listing.price,
          priceUnit: detail.data.listing.priceUnit,
          currency: 'INR',
          location: attributes.location,
          images: attributes.images || [],
          providerId: '', providerName: '', providerPhone: '', providerEmail: '', providerAvatar: '',
          providerRating: 0, reviewCount: 0, isVerified: detail.data.listing.isVerified,
          isFeatured: detail.data.listing.isFeatured, status: detail.data.listing.status,
          customFieldValues: attributes, postingPlanId: '', viewsCount: 0, enquiriesCount: 0,
        });
        assert.equal(filterServiceListings([customerCard], {
          query: 'Test District', categoryId: 'all', verifiedOnly: false, maxPrice: null, quoteOnly: false,
        }).length, 1, 'customer Services search matches the authorized listing area from PostgreSQL');
      }
      const stolen = await request('PATCH', `/api/provider/listings/${encodeURIComponent(id)}`, providerBToken, { title: 'Cross-owner takeover' });
      assert.equal(stolen.response.status, 404, `${module.categoryId} owner isolation`);
    }
  });

  await t.test('admin rejection remains private, providers cannot self-approve, and Movies stay display-only', async () => {
    const rejectedId = `pg-it-rejected-${randomUUID()}`;
    const created = await createListing(providerAToken, rejectedId, { categoryId: 'services', subcategory: 'Repair', entityType: 'service' });
    assert.equal(created.response.status, 201);
    const rejected = await request('PATCH', `/api/admin/provider/listings/${encodeURIComponent(rejectedId)}/review`, adminToken, { decision: 'rejected' });
    assert.equal(rejected.response.status, 200);
    assert.equal(rejected.data.listing.status, 'rejected');
    const rejectedDetail = await request('GET', `/api/marketplace/listings/${encodeURIComponent(rejectedId)}`);
    assert.equal(rejectedDetail.response.status, 404);
    const secondDecision = await request('PATCH', `/api/admin/provider/listings/${encodeURIComponent(rejectedId)}/review`, adminToken, { decision: 'active' });
    assert.equal(secondDecision.response.status, 409, 'a rejected listing needs a new provider submission; review is one-way');
    const movie = await createListing(providerAToken, `pg-it-movie-${randomUUID()}`, { categoryId: 'movies', subcategory: 'Cinema', entityType: 'movie' });
    assert.equal(movie.response.status, 409);
    assert.equal(movie.data.error, 'MOVIES_MODULE_DISPLAY_ONLY');

    const ordinary = await createListing(providerAToken, `pg-it-movie-reclass-${randomUUID()}`);
    assert.equal(ordinary.response.status, 201);
    const reclassified = await request('PATCH', `/api/provider/listings/${encodeURIComponent(ordinary.data.listing.id)}`, providerAToken, {
      categoryId: 'movie-showtimes', entityType: 'movie',
    });
    assert.equal(reclassified.response.status, 409, `an existing provider listing cannot be reclassified into Movies: ${JSON.stringify(reclassified.data)}`);
    assert.equal(reclassified.data.error, 'MOVIES_MODULE_DISPLAY_ONLY');

    const legacyMovieId = `pg-it-legacy-movie-${randomUUID()}`;
    await pool.query(
      `insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
       values ($1, $2, 'Legacy movie display row', 'movies', 'Cinema', 'movie', 0, 'display only', 'pending_approval', '{}'::jsonb)`,
      [legacyMovieId, providerA],
    );
    const movieApproval = await request('PATCH', `/api/admin/provider/listings/${encodeURIComponent(legacyMovieId)}/review`, adminToken, { decision: 'active' });
    assert.equal(movieApproval.response.status, 409, 'admin review cannot turn a legacy movie row into a provider listing');
    assert.equal(movieApproval.data.error, 'MOVIES_MODULE_DISPLAY_ONLY');
  });

  await t.test('concurrent row updates serialize without losing independent fields', async () => {
    const [titleUpdate, priceUpdate] = await Promise.all([
      request('PATCH', `/api/provider/listings/${encodeURIComponent(listingId)}`, providerAToken, { title: 'Concurrent title' }),
      request('PATCH', `/api/provider/listings/${encodeURIComponent(listingId)}`, providerAToken, { price: 8100 }),
    ]);
    assert.equal(titleUpdate.response.status, 200, JSON.stringify(titleUpdate.data));
    assert.equal(priceUpdate.response.status, 200, JSON.stringify(priceUpdate.data));
    const after = await request('GET', '/api/provider/listings', providerAToken);
    const row = after.data.listings.find((entry) => entry.id === listingId);
    assert.equal(row.title, 'Concurrent title');
    assert.equal(row.price, 8100);
    const providerPromotion = await request('PATCH', `/api/provider/listings/${encodeURIComponent(listingId)}`, providerAToken, { isFeatured: true });
    assert.equal(providerPromotion.response.status, 200);
    assert.equal(providerPromotion.data.listing.isFeatured, false, 'providers cannot self-feature listings');
    const providerVerification = await request('PATCH', `/api/provider/listings/${encodeURIComponent(listingId)}`, providerAToken, { isVerified: true });
    assert.equal(providerVerification.response.status, 403);
    assert.equal(providerVerification.data.error, 'FORBIDDEN_VERIFICATION_FIELD');
  });

  await t.test('a database exception rolls back an attempted update', async () => {
    await pool.query(`create or replace function public.bos_test_reject_listing_update()
      returns trigger language plpgsql as $$ begin
        if new.title = 'force-test-rollback' then raise exception 'test rollback'; end if;
        return new;
      end $$`);
    await pool.query('drop trigger if exists bos_test_reject_listing_update on public.listings');
    await pool.query(`create trigger bos_test_reject_listing_update before update on public.listings
      for each row execute function public.bos_test_reject_listing_update()`);
    try {
      const failed = await request('PATCH', `/api/provider/listings/${encodeURIComponent(listingId)}`, providerAToken, {
        title: 'force-test-rollback', price: 99999,
      });
      assert.equal(failed.response.status, 500);
      const { rows } = await pool.query('select title, price from public.listings where id = $1', [listingId]);
      assert.equal(rows[0].title, 'Concurrent title');
      assert.equal(Number(rows[0].price), 8100);
    } finally {
      await pool.query('drop trigger if exists bos_test_reject_listing_update on public.listings');
      await pool.query('drop function if exists public.bos_test_reject_listing_update()');
    }
  });

  await t.test('DELETE contract safely deactivates and restart reads persisted PostgreSQL data', async () => {
    const deleted = await request('DELETE', `/api/provider/listings/${encodeURIComponent(listingId)}`, providerAToken);
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.data.deletedId, listingId);
    const ownBeforeRestart = await request('GET', '/api/provider/listings', providerAToken);
    assert.equal(ownBeforeRestart.data.listings.find((entry) => entry.id === listingId).status, 'archived');

    await stopServer();
    await startServer();
    const ownAfterRestart = await request('GET', '/api/provider/listings', providerAToken);
    const persisted = ownAfterRestart.data.listings.find((entry) => entry.id === listingId);
    assert.ok(persisted, 'listing remains present after process restart');
    assert.equal(persisted.status, 'archived');
    const fromPublicFeed = await request('GET', '/api/marketplace/listings');
    assert.ok(!fromPublicFeed.data.listings.some((entry) => entry.id === listingId));
    const newProviderListing = await request('GET', `/api/marketplace/listings/${encodeURIComponent(globalThis.newProviderListingId)}`);
    assert.equal(newProviderListing.response.status, 200, 'approved newly onboarded provider listing persists after restart');
    const refreshedProvider = await request('GET', '/api/provider/listings', globalThis.newProviderSession);
    assert.ok(refreshedProvider.data.listings.some((entry) => entry.id === globalThis.newProviderListingId));
  });
});

after(async () => {
  await stopServer();
  if (authTestServer) await new Promise((resolve) => authTestServer.close(resolve));
  if (pool) await pool.end();
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

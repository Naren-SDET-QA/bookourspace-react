import { expect, test, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

/**
 * Provider/customer identity on the real server.
 *
 * The provider gate re-reads the account from PostgreSQL on every request, so a
 * signed token is only a claim. These checks pin the resulting HTTP contract:
 *
 * - a customer token can never reach a provider-owned workspace;
 * - a provider can only act inside a business it belongs to;
 * - a token minted before a role change is refused until the browser signs in
 *   again (`401 SESSION_ROLE_MISMATCH`) instead of being trusted either way;
 * - suspension applies on the next request.
 *
 * Fixtures are the seeded demo accounts; every mutation is restored afterwards.
 * When the local database or those accounts are unavailable the suite skips
 * with a printed reason rather than passing.
 */

const DATABASE_URL =
  process.env.BOS_TEST_DATABASE_URL
  || process.env.BOS_LISTINGS_DATABASE_URL
  || 'postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable';

const CUSTOMER_EMAIL = 'demo.guest.1@bookourspace.local';
const SUSPENDED_EMAIL = 'demo.guest.2@bookourspace.local';
const PROVIDER_EMAIL = 'demo.host@bookourspace.local';

type Snapshot = { email: string; role: string; account_status: string };

let db: Client | null = null;
let setupError = '';
let snapshot: Snapshot[] = [];
// A multi-business owner must select a business, exactly as the portal does.
let providerBusinessId = '';

async function localSession(
  request: APIRequestContext,
  role: 'customer' | 'provider' | 'admin',
  email: string,
): Promise<string> {
  const response = await request.post('/api/auth/local-dev/session', { data: { role, email } });
  if (!response.ok()) {
    throw new Error(`local dev session failed ${response.status()} ${await response.text()}`);
  }
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) throw new Error('local dev session returned no CSRF proof');
  return body.csrfToken;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  db = new Client({ connectionString: DATABASE_URL });
  try {
    await db.connect();
    const { rows } = await db.query<Snapshot>(
      `select email, role, account_status from public.profiles
        where email = any($1::text[]) order by email`,
      [[CUSTOMER_EMAIL, SUSPENDED_EMAIL, PROVIDER_EMAIL]],
    );
    if (rows.length !== 3) {
      setupError = `the seeded demo identities are missing (${rows.length}/3 found)`;
      return;
    }
    snapshot = rows;
    const profile = await db.query<{ id: string }>(
      `select id from public.profiles where email = $1`,
      [PROVIDER_EMAIL],
    );
    const business = await db.query<{ id: string }>(
      `select b.id from public.businesses b
         join public.business_members m on m.business_id = b.id and m.user_id = $1 and m.status = 'active'
        where b.business_ref = 'demo-pg-hostels' limit 1`,
      [profile.rows[0]?.id || ''],
    );
    providerBusinessId = business.rows[0]?.id || '';
    if (!providerBusinessId) setupError = 'the seeded demo business membership is missing';
  } catch (error) {
    setupError = `local database is unavailable: ${(error as Error).message}`;
  }
});

test.afterAll(async () => {
  if (db && snapshot.length > 0) {
    for (const row of snapshot) {
      await db.query(
        `update public.profiles set role = $2, account_status = $3 where email = $1`,
        [row.email, row.role, row.account_status],
      ).catch(() => undefined);
    }
  }
  await db?.end().catch(() => undefined);
});

test.beforeEach(async () => {
  test.skip(Boolean(setupError), setupError);
});

test('a customer token cannot reach a provider workspace', async ({ request }) => {
  const token = await localSession(request, 'customer', CUSTOMER_EMAIL);
  const auth = { 'x-bos-csrf': token };

  const listings = await request.get('/api/provider/listings', { headers: auth });
  expect(listings.status()).toBe(403);
  expect((await listings.json()).error).toBe('PROVIDER_ROLE_REQUIRED');

  // Stay-host onboarding is open to customers so they can become hosts; its
  // handlers authorize by draft ownership and still refuse a plain customer.
  const hosting = await request.get('/api/stays/host/listings', { headers: auth });
  expect([401, 403]).toContain(hosting.status());
});

test('a provider still reaches its own workspace', async ({ request }) => {
  const token = await localSession(request, 'provider', PROVIDER_EMAIL);
  const response = await request.get('/api/provider/listings', {
    headers: { 'x-bos-csrf': token, 'x-business-id': providerBusinessId },
  });
  expect(response.status()).toBe(200);
});

test('a provider cannot act inside a business it does not belong to', async ({ request }) => {
  const token = await localSession(request, 'provider', PROVIDER_EMAIL);
  const response = await request.get('/api/provider/listings', {
    headers: { 'x-bos-csrf': token, 'x-business-id': '0f0f0f0f-0000-4000-8000-000000000000' },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error).toBe('BUSINESS_ACCESS_DENIED');
});

test('a token minted before a role change is refused until the account signs in again', async ({ request }) => {
  const token = await localSession(request, 'customer', CUSTOMER_EMAIL);
  if (!db) throw new Error('database unavailable');
  try {
    await db.query(`update public.profiles set role = 'provider' where email = $1`, [CUSTOMER_EMAIL]);

    const stale = await request.post('/api/pg/bookings', {
      headers: { 'x-bos-csrf': token },
      data: {},
    });
    expect(stale.status()).toBe(401);
    expect((await stale.json()).error).toBe('SESSION_ROLE_MISMATCH');

    // The provider workspace agrees: the old customer claim is not a provider.
    const providerView = await request.get('/api/provider/listings', {
      headers: { 'x-bos-csrf': token },
    });
    expect(providerView.status()).toBe(401);
    expect((await providerView.json()).error).toBe('SESSION_ROLE_MISMATCH');
  } finally {
    await db.query(`update public.profiles set role = 'customer' where email = $1`, [CUSTOMER_EMAIL]);
  }
});

test('suspension applies on the very next request', async ({ request }) => {
  const token = await localSession(request, 'customer', SUSPENDED_EMAIL);
  if (!db) throw new Error('database unavailable');
  try {
    await db.query(`update public.profiles set account_status = 'suspended' where email = $1`, [SUSPENDED_EMAIL]);

    const booking = await request.post('/api/pg/bookings', {
      headers: { 'x-bos-csrf': token },
      data: {},
    });
    expect(booking.status()).toBe(403);
    expect((await booking.json()).error).toBe('ACCOUNT_NOT_ACTIVE');

    const provider = await request.get('/api/provider/listings', {
      headers: { 'x-bos-csrf': token },
    });
    expect(provider.status()).toBe(403);
    expect((await provider.json()).error).toBe('ACCOUNT_NOT_ACTIVE');
  } finally {
    await db.query(`update public.profiles set account_status = 'active' where email = $1`, [SUSPENDED_EMAIL]);
  }
});

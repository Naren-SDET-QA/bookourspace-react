import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

/**
 * HTTP contract for the centralized user-management engine.
 *
 * These checks run against the real server: the admin API must re-verify the
 * session in Postgres, a customer/provider must never reach it, a self-edit must
 * be refused, and the existing category gates must still return their contract
 * error codes now that they delegate to the shared engine.
 *
 * Requires the local dev server with `BOS_LOCAL_DEV_AUTH=1` plus the access
 * control migration. When the endpoint is unavailable the suite skips with a
 * reason instead of passing.
 */

type Session = { csrfToken: string; user: Record<string, unknown>; cookie: string };

let unavailableReason = '';

async function localSession(
  request: APIRequestContext,
  role: 'customer' | 'provider' | 'admin',
  email?: string,
): Promise<Session> {
  const response = await request.post('/api/auth/local-dev/session', {
    data: { role, ...(email ? { email } : {}) },
  });
  if (!response.ok()) {
    throw new Error(`local dev session failed ${response.status()} ${await response.text()}`);
  }
  const json = (await response.json()) as Omit<Session, 'cookie'>;
  if (!json?.csrfToken) throw new Error('local dev session returned no CSRF proof');
  const cookie = response.headers()['set-cookie']?.match(/(?:^|,\s*)bos_session=[^;]+/)?.[0]
    ?.replace(/^,\s*/, '') || '';
  if (!cookie) throw new Error('local dev session returned no session cookie');
  return { ...json, cookie };
}

function cookieCsrf(session: Session): Record<string, string> {
  return { Cookie: session.cookie, 'x-bos-csrf': session.csrfToken };
}

test.describe('centralized access control', () => {
  test.beforeAll(async ({ request }) => {
    try {
      await localSession(request, 'admin', 'demo.admin@bookourspace.local');
      const probe = await request.get('/api/admin/access-control/catalog');
      if (probe.status() === 404) {
        unavailableReason = 'the access-control API is not mounted on this server';
      }
    } catch (error) {
      unavailableReason = `local dev auth is unavailable: ${(error as Error).message}`;
    }
  });

  test('an admin can list accounts, health and the category catalog', async ({ request }) => {
    test.skip(Boolean(unavailableReason), unavailableReason);
    const session = await localSession(request, 'admin', 'demo.admin@bookourspace.local');

    const accounts = await request.get('/api/admin/access-control/accounts?limit=5', {
      headers: cookieCsrf(session),
    });
    expect(accounts.status()).toBe(200);
    const accountBody = await accounts.json();
    expect(accountBody.ok).toBe(true);
    expect(Array.isArray(accountBody.accounts)).toBe(true);
    expect(accountBody.accounts.length).toBeGreaterThan(0);

    const health = await request.get('/api/admin/access-control/health', {
      headers: cookieCsrf(session),
    });
    expect(health.status()).toBe(200);
    const healthBody = await health.json();
    expect(healthBody.ok).toBe(true);
    expect(typeof healthBody.report.healthy).toBe('boolean');
    expect(Array.isArray(healthBody.report.findings)).toBe(true);

    const catalog = await request.get('/api/admin/access-control/catalog', {
      headers: cookieCsrf(session),
    });
    expect(catalog.status()).toBe(200);
    const keys = ((await catalog.json()).categories as Array<{ key: string }>).map((entry) => entry.key);
    for (const expected of ['hotels', 'pg', 'function_hall', 'classes', 'movies', 'services']) {
      expect(keys).toContain(expected);
    }
  });

  test('anonymous, customer and provider sessions are refused', async ({ request }) => {
    test.skip(Boolean(unavailableReason), unavailableReason);

    const anonymous = await request.get('/api/admin/access-control/accounts');
    expect(anonymous.status()).toBe(401);

    const customer = await localSession(request, 'customer');
    const customerResponse = await request.get('/api/admin/access-control/accounts', {
      headers: cookieCsrf(customer),
    });
    expect(customerResponse.status()).toBe(403);
    expect((await customerResponse.json()).error).toBe('FORBIDDEN_ADMIN_ONLY');

    const provider = await localSession(request, 'provider', 'demo.services@bookourspace.local');
    const providerResponse = await request.get('/api/admin/access-control/health', {
      headers: cookieCsrf(provider),
    });
    expect(providerResponse.status()).toBe(403);
  });

  test('an admin cannot change their own permissions', async ({ request }) => {
    test.skip(Boolean(unavailableReason), unavailableReason);
    const session = await localSession(request, 'admin', 'demo.admin@bookourspace.local');

    const accounts = await request.get('/api/admin/access-control/accounts?role=admin&limit=5', {
      headers: cookieCsrf(session),
    });
    const self = (
      (await accounts.json()).accounts as Array<{ id: string; email: string }>
    ).find((entry) => entry.email === 'demo.admin@bookourspace.local');
    expect(self).toBeTruthy();

    const response = await request.put(`/api/admin/access-control/accounts/${self!.id}/permissions`, {
      headers: cookieCsrf(session),
      data: { categories: [{ category: 'pg', actions: ['view'] }] },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe('SELF_PERMISSION_EDIT');
  });

  test('unknown categories and actions are rejected before any write', async ({ request }) => {
    test.skip(Boolean(unavailableReason), unavailableReason);
    const session = await localSession(request, 'admin', 'demo.admin@bookourspace.local');

    const accounts = await request.get('/api/admin/access-control/accounts?role=customer&limit=1', {
      headers: cookieCsrf(session),
    });
    const target = ((await accounts.json()).accounts as Array<{ id: string }>)[0];
    expect(target).toBeTruthy();

    const unknown = await request.put(`/api/admin/access-control/accounts/${target.id}/permissions`, {
      headers: cookieCsrf(session),
      data: { categories: [{ category: 'wormhole', actions: ['view'] }] },
    });
    expect(unknown.status()).toBe(400);
    expect((await unknown.json()).error).toBe('UNKNOWN_CATEGORY');

    const badAction = await request.put(`/api/admin/access-control/accounts/${target.id}/permissions`, {
      headers: cookieCsrf(session),
      data: { categories: [{ category: 'pg', actions: ['root'] }] },
    });
    expect(badAction.status()).toBe(400);
    expect((await badAction.json()).error).toBe('INVALID_ACTIONS');
  });

  test('a signed-in account reads only its own effective permissions', async ({ request }) => {
    test.skip(Boolean(unavailableReason), unavailableReason);
    const customer = await localSession(request, 'customer');
    const response = await request.get('/api/access/me', { headers: cookieCsrf(customer) });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.role).toBe('customer');
    expect(Array.isArray(body.categories)).toBe(true);
    for (const category of body.categories) {
      expect(Array.isArray(category.actions)).toBe(true);
      for (const action of category.actions) {
        expect(['view', 'create', 'edit', 'delete', 'approve', 'manage']).toContain(action);
      }
    }

    const anonymous = await request.get('/api/access/me', { headers: { cookie: '' } });
    expect(anonymous.status()).toBe(401);
  });

  test('the existing category gates keep their contract error codes', async ({ request }) => {
    test.skip(Boolean(unavailableReason), unavailableReason);

    const customer = await localSession(request, 'customer');
    const view = await request.get('/api/pg/bookings', { headers: cookieCsrf(customer) });
    expect(view.status()).toBe(200);

    const provider = await localSession(request, 'provider', 'demo.services@bookourspace.local');
    const crossModule = await request.get('/api/stays/host/properties', {
      headers: cookieCsrf(provider),
    });
    expect(crossModule.status()).toBe(403);
    expect(['BUSINESS_MODULE_MISMATCH', 'BUSINESS_ACCESS_DENIED']).toContain(
      (await crossModule.json()).error,
    );
  });

  test('a view-only customer is refused a booking write until the category grants it', async ({ request }) => {
    test.skip(Boolean(unavailableReason), unavailableReason);
    const databaseUrl =
      process.env.BOS_TEST_DATABASE_URL
      || process.env.BOS_LISTINGS_DATABASE_URL
      || 'postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable';
    const userId = randomUUID();
    const email = `e2e-movie-gate-${userId.slice(0, 8)}@example.test`;
    const db = new Client({ connectionString: databaseUrl });
    await db.connect();
    try {
      await db.query(`insert into auth.users (id, email) values ($1,$2)`, [userId, email]);
      await db.query(
        `update public.profiles set role = 'customer', account_status = 'active' where id = $1`,
        [userId],
      );
      const customer = await localSession(request, 'customer', email);

      // Signup defaults are View only, so the write is refused by the engine.
      const denied = await request.post('/api/services/bookings', {
        headers: cookieCsrf(customer),
        data: {},
      });
      expect(denied.status()).toBe(403);
      expect((await denied.json()).error).toBe('CUSTOMER_ACTION_FORBIDDEN');

      // The same session reaches the handler once the category grants create.
      const admin = await localSession(request, 'admin', 'demo.admin@bookourspace.local');
      const granted = await request.put(`/api/admin/access-control/accounts/${userId}/permissions`, {
        headers: cookieCsrf(admin),
        data: { categories: [{ category: 'services', actions: ['view', 'create'] }] },
      });
      expect(granted.status()).toBe(200);

      const allowed = await request.post('/api/services/bookings', {
        headers: cookieCsrf(customer),
        data: {},
      });
      expect(allowed.status()).not.toBe(403);
    } finally {
      await db.query(`delete from auth.users where id = $1`, [userId]).catch(() => undefined);
      await db.end();
    }
  });
});

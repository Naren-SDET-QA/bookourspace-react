import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * `GET /api/admin/users` authorization.
 *
 * Local-dev sessions are minted from `public.profiles` (PostgreSQL), while the
 * legacy non-production admin gate reads `authoritative-marketplace-store.json`,
 * whose seed ids (`USR-*`) are not those profile UUIDs. A Postgres-backed demo
 * admin was therefore refused its own user list. The gate resolves the current
 * profile from Postgres whenever that runtime is active; these checks pin that
 * outcome and prove the admin role predicate itself was not widened.
 *
 * Requires the local dev server with `BOS_LOCAL_DEV_AUTH=1`. When the endpoint
 * is unavailable the suite skips with a reason instead of passing.
 */

type Session = { csrfToken: string; user: Record<string, unknown> };

let sessionUnavailableReason = '';

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
  const json = (await response.json()) as Session;
  if (!json?.csrfToken) throw new Error('local dev session returned no CSRF proof');
  return json;
}

function csrf(session: Session): Record<string, string> {
  return { 'x-bos-csrf': session.csrfToken };
}

/**
 * `/api/admin/*` shares one 30-per-minute budget per address, so a long serial
 * suite can reach this endpoint already throttled. Waiting out `Retry-After`
 * keeps the authorization assertion (401/403/200) instead of accepting a 429
 * as if it were the gate's answer.
 */
async function getAdminUsers(request: APIRequestContext, headers?: Record<string, string>) {
  let response = await request.get('/api/admin/users', headers ? { headers } : undefined);
  if (response.status() === 429) {
    const seconds = Math.min(70, Math.max(1, Number(response.headers()['retry-after']) || 1));
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 500));
    response = await request.get('/api/admin/users', headers ? { headers } : undefined);
  }
  return response;
}

test.describe('GET /api/admin/users authorization', () => {
  // A throttled first attempt may wait out one full rate-limit window.
  test.describe.configure({ timeout: 150_000 });
  test.beforeAll(async ({ request }) => {
    try {
      await localSession(request, 'admin', 'demo.admin@bookourspace.local');
    } catch (error) {
      sessionUnavailableReason = `local dev auth is unavailable: ${(error as Error).message}`;
    }
  });

  test('a Postgres-backed admin session receives the user list', async ({ request }) => {
    test.skip(Boolean(sessionUnavailableReason), sessionUnavailableReason);
    const session = await localSession(request, 'admin', 'demo.admin@bookourspace.local');

    const response = await getAdminUsers(request, csrf(session));
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.users)).toBe(true);
  });

  test('provider and customer sessions are refused', async ({ request }) => {
    test.skip(Boolean(sessionUnavailableReason), sessionUnavailableReason);
    const cases: Array<{ role: 'provider' | 'customer'; email?: string }> = [
      { role: 'provider', email: 'demo.services@bookourspace.local' },
      { role: 'customer' },
    ];

    for (const { role, email } of cases) {
      const session = await localSession(request, role, email);
      const response = await getAdminUsers(request, csrf(session));
      expect(response.status(), `${role} must not read the admin user list`).toBe(403);
      expect((await response.json()).error).toBe('FORBIDDEN_ADMIN_ONLY');
    }
  });

  test('missing, malformed and tampered tokens are rejected', async ({ request }) => {
    test.skip(Boolean(sessionUnavailableReason), sessionUnavailableReason);

    const missing = await getAdminUsers(request, { cookie: '' });
    expect(missing.status()).toBe(401);

    const malformed = await getAdminUsers(request, { cookie: 'bos_session=not-a-session-token' });
    expect(malformed.status()).toBe(401);

    const session = await localSession(request, 'admin', 'demo.admin@bookourspace.local');
    const tamperedResponse = await getAdminUsers(request, { cookie: 'bos_session=eyJ0YW1wZXJlZCI6dHJ1ZX0.invalid' });
    expect(tamperedResponse.status()).toBe(401);
  });
});

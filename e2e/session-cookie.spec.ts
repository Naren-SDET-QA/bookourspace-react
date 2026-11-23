import { expect, test } from '@playwright/test';
import { signInWithLocalDevSession } from './session-cookie-harness';

test.describe('SEC-02 browser session transport', () => {
  test('login uses an HttpOnly cookie and survives reload without exposing a bearer token', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const session = await signInWithLocalDevSession(context, { role: 'customer' });
      const cookies = await context.cookies();
      const cookie = cookies.find((entry) => entry.name === 'bos_session');
      expect(cookie).toBeDefined();
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe('Lax');
      const page = await context.newPage();
      await page.goto('/#login', { waitUntil: 'domcontentloaded' });
      const reloadMe = page.waitForResponse((response) => response.url().includes('/api/auth/me'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      expect((await reloadMe).status()).toBe(200);
      expect(await page.evaluate(() => localStorage.getItem('bos_session_token_v1'))).toBeNull();
      expect(session.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await context.close();
    }
  });

  test('sessions are isolated, logout revokes one session, and CSRF is required', async ({ browser }) => {
    const first = await browser.newContext();
    const second = await browser.newContext();
    try {
      const a = await signInWithLocalDevSession(first, { role: 'customer' });
      const b = await signInWithLocalDevSession(second, { role: 'customer' });
      expect((await first.request.post('/api/auth/logout')).status()).toBe(403);
      const logout = await first.request.post('/api/auth/logout', {
        headers: { 'x-bos-csrf': a.csrfToken },
      });
      expect(logout.status()).toBe(200);
      expect((await second.request.post('/api/auth/logout', {
        headers: { 'x-bos-csrf': b.csrfToken },
      })).status()).toBe(200);
    } finally {
      await first.close();
      await second.close();
    }
  });

  test('the cookie is path-scoped, HttpOnly and expires with the session', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      await signInWithLocalDevSession(context, { role: 'customer' });
      const cookie = (await context.cookies()).find((entry) => entry.name === 'bos_session');
      expect(cookie?.path).toBe('/');
      expect(cookie?.httpOnly).toBe(true);
      const nowSeconds = Math.floor(Date.now() / 1000);
      expect(cookie?.expires).toBeGreaterThan(nowSeconds);
      expect(cookie?.expires).toBeLessThanOrEqual(nowSeconds + 12 * 60 * 60 + 60);
      const page = await context.newPage();
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      // HttpOnly means page script cannot even see the name, let alone the value.
      expect(await page.evaluate(() => document.cookie)).not.toContain('bos_session');
    } finally {
      await context.close();
    }
  });

  test('a wrong CSRF proof is refused exactly like a missing one', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      await signInWithLocalDevSession(context, { role: 'customer' });
      const blocked = await context.request.post('/api/auth/logout', {
        headers: { 'x-bos-csrf': '0'.repeat(64) },
      });
      expect(blocked.status()).toBe(403);
      // The refused request must not have ended the session.
      expect((await context.request.get('/api/auth/me')).status()).toBe(200);
    } finally {
      await context.close();
    }
  });

  test('logout revokes the token, so a replayed cookie is refused', async ({ browser }) => {
    const context = await browser.newContext();
    const replay = await browser.newContext();
    try {
      const session = await signInWithLocalDevSession(context, { role: 'customer' });
      const token = (await context.cookies()).find((entry) => entry.name === 'bos_session')?.value || '';
      expect(token).toBeTruthy();
      expect((await context.request.post('/api/auth/logout', {
        headers: { 'x-bos-csrf': session.csrfToken },
      })).status()).toBe(200);
      await replay.addCookies([{
        name: 'bos_session',
        value: token,
        url: 'http://127.0.0.1/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      }]);
      expect((await replay.request.get('/api/auth/me')).status()).toBe(401);
    } finally {
      await replay.close();
      await context.close();
    }
  });

  test('closing the page keeps the cookie session; a fresh context is anonymous', async ({ browser }) => {
    const context = await browser.newContext();
    const anonymous = await browser.newContext();
    try {
      await signInWithLocalDevSession(context, { role: 'customer' });
      const first = await context.newPage();
      await first.goto('/', { waitUntil: 'domcontentloaded' });
      await first.close();
      const restarted = await context.newPage();
      await restarted.goto('/', { waitUntil: 'domcontentloaded' });
      const me = await restarted.request.get('/api/auth/me');
      expect(me.status()).toBe(200);
      expect(((await me.json()) as { user?: { role?: string } }).user?.role).toBe('customer');
      expect((await anonymous.request.get('/api/auth/me')).status()).toBe(401);
    } finally {
      await anonymous.close();
      await context.close();
    }
  });

  test('role authorization is enforced on the cookie session', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const customer = await signInWithLocalDevSession(context, { role: 'customer' });
      const response = await context.request.get('/api/admin/access-control/accounts');
      expect(response.status()).toBe(403);
      expect(customer.role).toBe('customer');
    } finally {
      await context.close();
    }
  });
});

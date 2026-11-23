import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function localLogin(page: Page, role: 'customer' | 'admin' = 'customer') {
  const response = await page.request.post('/api/auth/local-dev/session', { data: { role } });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as { csrfToken: string; user: { id: string; email: string } };
}

async function openSignedIn(context: BrowserContext, role: 'customer' | 'admin' = 'customer') {
  const page = await context.newPage();
  const session = await localLogin(page, role);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#bos-main-content')).toBeAttached({ timeout: 30_000 });
  return { page, session };
}

test.describe('SEC-02 browser cookie session contract', () => {
  test('login establishes an HttpOnly cookie and reload restores the session', async ({ browser }) => {
    const context = await browser.newContext();
    const { page, session } = await openSignedIn(context);
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === 'bos_session');
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.secure).toBe(false); // isolated loopback test server
    expect(sessionCookie?.sameSite).toBe('Lax');
    expect(await page.evaluate(() => localStorage.getItem('bos_session_token_v1'))).toBeNull();
    expect((await page.request.get('/api/auth/me')).status()).toBe(200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect((await page.request.get('/api/auth/me')).status()).toBe(200);
    expect(session.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    await context.close();
  });

  test('CSRF is required for unsafe requests and logout clears/revokes the session', async ({ browser }) => {
    const context = await browser.newContext();
    const { page, session } = await openSignedIn(context);
    const blocked = await page.request.post('/api/auth/logout');
    expect(blocked.status()).toBe(403);
    const logout = await page.request.post('/api/auth/logout', { headers: { 'x-bos-csrf': session.csrfToken } });
    expect(logout.status()).toBe(200);
    expect((await context.cookies()).find((cookie) => cookie.name === 'bos_session')?.expires ?? -1).toBeLessThanOrEqual(0);
    expect((await context.cookies()).some((cookie) => cookie.name === 'bos_session')).toBe(false);
    await context.close();
  });

  test('independent browser contexts cannot share sessions', async ({ browser }) => {
    const first = await browser.newContext();
    const second = await browser.newContext();
    const a = await openSignedIn(first, 'customer');
    const b = await openSignedIn(second, 'admin');
    expect((await first.cookies()).some((cookie) => cookie.name === 'bos_session')).toBe(true);
    expect((await second.cookies()).some((cookie) => cookie.name === 'bos_session')).toBe(true);
    expect((await first.cookies()).find((cookie) => cookie.name === 'bos_session')?.value)
      .not.toBe((await second.cookies()).find((cookie) => cookie.name === 'bos_session')?.value);
    await first.close();
    await second.close();
  });

  test('an expired cookie is refused after reload', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await context.addCookies([{ name: 'bos_session', value: 'expired.invalid', domain: '127.0.0.1', path: '/', expires: 1, httpOnly: true }]);
    const reloadMe = page.waitForResponse((response) => response.url().includes('/api/auth/me'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect((await reloadMe).status()).toBe(401);
    await context.close();
  });
});

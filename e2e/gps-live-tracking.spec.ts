import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Live GPS: customer map marker must move when the assigned provider location
 * changes. Runs against the already-started local DEV app when E2E_BASE_URL is
 * set (http://127.0.0.1:3010). Does not seed #services/old.
 */

const MAIN = 'c0a11e00-1111-4111-8111-000000000101';
const OUT = '/tmp/bos-gps-fix';

async function localSession(baseURL: string, role: 'customer' | 'provider', email: string) {
  const response = await fetch(`${baseURL}/api/auth/local-dev/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, email }),
  });
  const json = await response.json();
  if (!response.ok || !json?.sessionToken) {
    throw new Error(`local session failed ${response.status} ${JSON.stringify(json)}`);
  }
  return json as { sessionToken: string; user: Record<string, unknown> };
}

async function pageFor(browser: Browser, token: string, user: Record<string, unknown>) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(([sessionToken, authUser]) => {
    localStorage.setItem('bos_session_token_v1', String(sessionToken));
    localStorage.setItem('bos_google_auth_user_v1', JSON.stringify(authUser));
    localStorage.setItem('bos_entry_choice_v1', 'signed-in');
    localStorage.setItem('bos_privacy_consent_v1', JSON.stringify({ choice: 'essential', at: '2026-01-01T00:00:00.000Z' }));
    localStorage.removeItem('bos_section_styles_v2');
    localStorage.removeItem('bos_section_style_prefs_v1');
  }, [token, user]);
  const page = await context.newPage();
  return { context, page };
}

async function publish(baseURL: string, token: string, latitude: number, longitude: number) {
  const response = await fetch(`${baseURL}/api/services/bookings/${MAIN}/tracking/location`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      consentGranted: true,
      latitude,
      longitude,
      accuracyMeters: 10,
      speedMps: 6.5,
      capturedAt: new Date().toISOString(),
    }),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

test('customer map marker moves when provider GPS updates without refresh', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL=http://127.0.0.1:3010 to reuse the verified local GPS server');
  const origin = String(baseURL || process.env.E2E_BASE_URL);
  await new Promise((resolve) => setTimeout(resolve, 13_000));
  const customer = await localSession(origin, 'customer', 'demo.guest.1@bookourspace.local');
  const provider = await localSession(origin, 'provider', 'demo.services@bookourspace.local');

  const start = await fetch(`${origin}/api/services/bookings/${MAIN}/tracking/session/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.sessionToken}` },
    body: JSON.stringify({}),
  });
  expect(start.ok, `session start ${start.status}`).toBeTruthy();

  const first = await publish(origin, provider.sessionToken, 17.4300, 78.3500);
  expect(first.status, JSON.stringify(first.json)).toBe(201);

  const { context, page } = await pageFor(browser, customer.sessionToken, customer.user);
  await page.goto(`${origin}/#services`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'My service bookings' }).first().click();
  await page.locator('article', { hasText: 'Live GPS Water Can' }).getByRole('button', { name: 'Track live' }).click();
  const dialog = page.getByRole('dialog', { name: 'Live delivery tracking' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copy Tracking Link' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Share Tracking Link' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Share on WhatsApp' })).toBeVisible();
  await expect(dialog.getByText('Last GPS update')).toBeVisible();

  const map = dialog.locator('[data-provider-lat]');
  await expect(map).toHaveAttribute('data-provider-lat', /17\.43/, { timeout: 15_000 });
  const beforeLat = await map.getAttribute('data-provider-lat');
  const beforeLng = await map.getAttribute('data-provider-lng');
  await page.screenshot({ path: `${OUT}/01-customer-before-move.png`, fullPage: true });

  await page.waitForTimeout(13_000);
  const second = await publish(origin, provider.sessionToken, 17.4460, 78.3800);
  expect(second.status, JSON.stringify(second.json)).toBe(201);

  await expect(map).toHaveAttribute('data-provider-lat', /17\.446/, { timeout: 20_000 });
  const afterLat = await map.getAttribute('data-provider-lat');
  const afterLng = await map.getAttribute('data-provider-lng');
  expect(afterLat).not.toEqual(beforeLat);
  expect(afterLng).not.toEqual(beforeLng);
  await expect(dialog.getByText(/STALE GPS/i)).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/02-customer-after-move.png`, fullPage: true });

  await context.close();
});

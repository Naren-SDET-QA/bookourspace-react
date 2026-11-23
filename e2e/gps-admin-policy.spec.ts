import { expect, test, type Browser } from '@playwright/test';
import { sessionTokenFromSetCookie, useSessionCookie } from './session-cookie-harness';

const MAIN = 'c0a11e00-1111-4111-8111-000000000101';
const OUT = '/tmp/bos-gps-admin';

async function localSession(baseURL: string, role: 'customer' | 'provider' | 'admin', email: string) {
  const response = await fetch(`${baseURL}/api/auth/local-dev/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, email }),
  });
  const json = await response.json();
  // The session token is delivered only as an HttpOnly cookie; the body carries
  // the CSRF proof instead.
  const token = sessionTokenFromSetCookie(response.headers.get('set-cookie'));
  if (!response.ok || !token) {
    throw new Error(`local session failed ${response.status} ${JSON.stringify(json)}`);
  }
  return {
    token,
    csrfToken: String(json?.csrfToken || ''),
    user: json.user as Record<string, unknown>,
  };
}

/** Node-side API call authenticated by the same cookie the browser receives. */
function sessionFetch(
  baseURL: string,
  session: { token: string; csrfToken: string },
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  return fetch(`${baseURL}${path}`, {
    method: init.method || 'GET',
    headers: {
      cookie: `bos_session=${session.token}`,
      ...(init.body === undefined
        ? {}
        : { 'content-type': 'application/json', 'x-bos-csrf': session.csrfToken }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

async function pageFor(browser: Browser, token: string, user: Record<string, unknown>, hash: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await useSessionCookie(context, token);
  await context.addInitScript(([authUser]) => {
    localStorage.setItem('bos_google_auth_user_v1', JSON.stringify(authUser));
    localStorage.setItem('bos_entry_choice_v1', 'signed-in');
    localStorage.setItem('bos_privacy_consent_v1', JSON.stringify({ choice: 'essential', at: '2026-01-01T00:00:00.000Z' }));
  }, [user]);
  const page = await context.newPage();
  await page.goto(hash, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function putPolicy(
  baseURL: string,
  session: { token: string; csrfToken: string },
  body: Record<string, unknown>,
) {
  const response = await sessionFetch(baseURL, session, '/api/admin/gps-tracking', {
    method: 'PUT',
    body,
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

test('admin GPS global and category toggles hide customer tracking immediately', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL=http://127.0.0.1:3010 to reuse the verified local GPS server');
  const origin = String(baseURL || process.env.E2E_BASE_URL);
  const fs = await import('node:fs');
  fs.mkdirSync(OUT, { recursive: true });

  const admin = await localSession(origin, 'admin', 'demo.admin@bookourspace.local');
  const customer = await localSession(origin, 'customer', 'demo.guest.1@bookourspace.local');
  const stranger = await localSession(origin, 'customer', 'demo.guest.2@bookourspace.local').catch(() => null);

  const enabled = await putPolicy(origin, admin, { globalEnabled: true });
  expect(enabled.status, JSON.stringify(enabled.json)).toBe(200);
  const waterOn = await putPolicy(origin, admin, { categoryId: 'water_delivery', gpsTracking: true, liveMap: true });
  expect(waterOn.status, JSON.stringify(waterOn.json)).toBe(200);

  const { context: adminContext, page: adminPage } = await pageFor(browser, admin.token, admin.user, `${origin}/#admin`);
  await expect(adminPage.getByRole('tab', { name: 'GPS Tracking' })).toBeVisible({ timeout: 20_000 });
  await adminPage.getByRole('tab', { name: 'GPS Tracking' }).click();
  await expect(adminPage.getByTestId('admin-gps-tracking-panel')).toBeVisible();
  await expect(adminPage.getByText('Universal GPS tracking')).toBeVisible();
  await expect(adminPage.getByText('Manual test mode')).toBeVisible();
  await adminPage.screenshot({ path: `${OUT}/01-admin-gps-enabled.png`, fullPage: true });

  const { context: customerContext, page: customerPage } = await pageFor(browser, customer.token, customer.user, `${origin}/#services`);
  await customerPage.getByRole('button', { name: 'My service bookings' }).first().click();
  const article = customerPage.locator('article', { hasText: 'Live GPS Water Can' });
  await expect(article.getByRole('button', { name: 'Track live' })).toBeVisible();

  const provider = await localSession(origin, 'provider', 'demo.services@bookourspace.local');
  const disabled = await putPolicy(origin, admin, { categoryId: 'water_delivery', gpsTracking: false, liveMap: false });
  expect(disabled.status, JSON.stringify(disabled.json)).toBe(200);
  const startOff = await sessionFetch(origin, provider, `/api/services/bookings/${MAIN}/tracking/session/start`, {
    method: 'POST',
    body: {},
  });
  expect(startOff.ok, `GPS should refuse sharing while the category is disabled (${startOff.status})`).toBeFalsy();
  await customerPage.reload({ waitUntil: 'domcontentloaded' });
  await customerPage.getByRole('button', { name: 'My service bookings' }).first().click();
  await expect(article.getByRole('button', { name: 'Track live' })).toHaveCount(0);
  await expect(article.getByText('GPS tracking is disabled for this service.')).toBeVisible();
  await customerPage.screenshot({ path: `${OUT}/02-customer-gps-disabled.png`, fullPage: true });

  await adminPage.reload({ waitUntil: 'domcontentloaded' });
  await adminPage.getByRole('tab', { name: 'GPS Tracking' }).click();
  await expect(adminPage.getByTestId('admin-gps-tracking-panel')).toBeVisible();
  await adminPage.screenshot({ path: `${OUT}/03-admin-gps-category-off.png`, fullPage: true });

  const restored = await putPolicy(origin, admin, { categoryId: 'water_delivery', gpsTracking: true, liveMap: true });
  expect(restored.status, JSON.stringify(restored.json)).toBe(200);

  const customerForbidden = await sessionFetch(origin, customer, '/api/admin/gps-tracking');
  expect(customerForbidden.status).toBe(403);

  const start = await sessionFetch(origin, provider, `/api/services/bookings/${MAIN}/tracking/session/start`, {
    method: 'POST',
    body: {},
  });
  expect(start.ok, `provider session start ${start.status}`).toBeTruthy();
  const consent = await sessionFetch(origin, provider, `/api/services/bookings/${MAIN}/tracking/location`, {
    method: 'POST',
    body: {
      consentGranted: false,
      latitude: 17.43,
      longitude: 78.35,
      accuracyMeters: 10,
      capturedAt: new Date().toISOString(),
    },
  });
  expect(consent.status).toBe(400);

  if (stranger) {
    const isolated = await sessionFetch(origin, stranger, `/api/services/bookings/${MAIN}/tracking`);
    expect(isolated.status).toBe(404);
  }

  await adminContext.close();
  await customerContext.close();
});

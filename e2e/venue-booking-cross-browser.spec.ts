import { expect, test, type Page } from '@playwright/test';

/**
 * Cross-engine, mobile/tablet venue surface. This does not create bookings; it
 * proves the authenticated listing and the server-backed booking form render in
 * each installed Playwright engine without horizontal overflow.
 *
 * The session is a local HMAC test identity injected into the Google-flow
 * storage keys. It is not a Google OAuth or hosted Supabase session.
 */

const SESSIONS = JSON.parse(process.env.E2E_VENUE_SESSIONS || '{}');
if (!process.env.E2E_VENUE_SESSIONS) {
  test.skip(true, 'E2E_VENUE_SESSIONS is not configured for this run.');
}
const VENUE_TITLE = process.env.E2E_VENUE_TITLE || 'E2E Owner-Created Function Hall';

async function signIn(page: Page) {
  const session = SESSIONS.customer;
  if (!session?.token || !session?.user) throw new Error('missing customer E2E session');
  await page.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem('bos_session_token_v1', token);
      window.localStorage.setItem('bos_google_auth_user_v1', user);
    },
    { token: session.token, user: JSON.stringify(session.user) },
  );
}

async function boot(page: Page) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('#root > *', { state: 'attached', timeout: 20_000 });
      await expect
        .poll(async () => (await page.locator('body').innerText()).trim().length, { timeout: 20_000 })
        .toBeGreaterThan(200);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await page.waitForTimeout(1_500);
    }
  }
}

test('cross-browser venue booking surface', async ({ page }) => {
  test.setTimeout(120_000);
  const diagnostics: string[] = [];
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => diagnostics.push(`request failed: ${request.method()} ${request.url()}`));
  page.on('response', (response) => {
    if (response.status() >= 400) diagnostics.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.goto('/#venues', { waitUntil: 'domcontentloaded' });
  const venueHeading = page.getByRole('heading', { name: /^All Venues & Halls/ });
  const venueSection = page.locator('section').filter({ has: venueHeading }).last();
  const venueCard = venueSection.locator('article').filter({ hasText: VENUE_TITLE }).last();
  const view = venueCard.getByRole('button', { name: `View and book ${VENUE_TITLE}` });
  await expect(view).toBeVisible({ timeout: 45_000 });
  await view.click();
  const detail = page.getByRole('dialog', { name: VENUE_TITLE }).last();
  await expect(detail, `venue detail did not open; URL=${page.url()}; errors=${diagnostics.join(' || ') || 'none'}`)
    .toBeVisible({ timeout: 20_000 });
  await detail.getByRole('button', { name: 'Book Hall', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose date and time' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Event date')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(page.getByRole('heading', { name: 'Choose date and time' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

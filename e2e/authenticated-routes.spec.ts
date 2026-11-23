import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { signInWithLocalDevSession } from './session-cookie-harness';

/**
 * Authenticated route matrix: the provider portal and admin console are
 * protected routes. This spec mints a real HMAC session through the local dev
 * auth endpoint (the same one the GPS suites use), injects it into the same
 * storage keys as the Google flow, and proves each role sees only its own
 * surfaces. No role is ever granted by a URL hash.
 *
 * Requires the isolated dev server started by `playwright.config.ts` with
 * `BOS_LOCAL_DEV_AUTH=1` and its PostgreSQL cluster. When the endpoint is
 * unavailable the suite skips with an explicit reason instead of passing.
 */

type Session = { role: 'customer' | 'provider' | 'admin'; email?: string };

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
  if (!(await response.json()).csrfToken) throw new Error('local dev session returned no CSRF proof');
  return { role, ...(email ? { email } : {}) };
}

async function pageWithSession(page: Page, session: Session): Promise<void> {
  await signInWithLocalDevSession(page.context(), { role: session.role, ...(session.email ? { email: session.email } : {}) });
  await page.addInitScript(() => {
    localStorage.setItem('bos_entry_choice_v1', 'signed-in');
    localStorage.setItem('bos_guest_login_enabled_v1', '1');
    localStorage.setItem(
      'bos_privacy_consent_v1',
      JSON.stringify({ choice: 'essential', at: '2026-01-01T00:00:00.000Z' }),
    );
  });
}

async function gotoRoute(page: Page, hash: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('universal-marketplace-header')).toBeVisible({ timeout: 60_000 });
  return errors;
}

const providerPortal = (page: Page) => page.locator('nav[aria-label="Provider portal navigation"]');
const adminConsole = (page: Page) => page.getByText(/Enterprise Super Admin Console/);

/**
 * The privileged surface must appear from the deep link on the first load.
 *
 * Measured against the isolated server with an empty Vite cache: the lazy
 * ProviderDashboard and AdminDashboard chunks render in ~460 ms. There is no
 * cold-compile stall to absorb, so a reload here would only hide a real routing
 * regression (a dropped hash, or a view that opens only after a second load).
 */
async function expectDeepLinkOpens(
  page: Page,
  probe: () => Promise<boolean>,
  expectedHash: string,
): Promise<void> {
  await expect.poll(probe, { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 5_000 })
    .toBe(expectedHash);
}

test.describe('authenticated role routes', () => {
  test.beforeAll(async ({ request }) => {
    try {
      await localSession(request, 'customer');
    } catch (error) {
      sessionUnavailableReason = `local dev auth is unavailable: ${(error as Error).message}`;
    }
  });

  test('a provider session opens the provider portal from #provider and survives reload', async ({ page, request }) => {
    test.skip(Boolean(sessionUnavailableReason), sessionUnavailableReason);
    const session = await localSession(request, 'provider');
    await pageWithSession(page, session);
    const errors = await gotoRoute(page, '#provider');

    await expectDeepLinkOpens(
      page,
      () => providerPortal(page).isVisible().catch(() => false),
      '#provider',
    );
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible();

    // Reloading must restore the same deep-linked surface, not the marketplace.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(providerPortal(page)).toBeVisible({ timeout: 30_000 });
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });

  test('a provider session is refused the admin console', async ({ page, request }) => {
    test.skip(Boolean(sessionUnavailableReason), sessionUnavailableReason);
    const session = await localSession(request, 'provider');
    await pageWithSession(page, session);
    const errors = await gotoRoute(page, '#admin');

    await expect(adminConsole(page)).toHaveCount(0);
    await expect(page.getByTestId('admin-console-entry')).toHaveCount(0);
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible();
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });

  test('an admin session opens the console from #admin and can return to the marketplace', async ({ page, request }) => {
    test.skip(Boolean(sessionUnavailableReason), sessionUnavailableReason);
    const session = await localSession(request, 'admin', 'demo.admin@bookourspace.local');
    await pageWithSession(page, session);
    const errors = await gotoRoute(page, '#admin');

    await expectDeepLinkOpens(
      page,
      () => adminConsole(page).isVisible().catch(() => false),
      '#admin',
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(adminConsole(page)).toBeVisible({ timeout: 30_000 });

    // Leaving the console must clear the #admin hash, otherwise the router
    // reopens the console on the next render.
    const exit = page.getByRole('button', { name: /^Back to Marketplace/i }).first();
    await expect(exit).toBeVisible({ timeout: 30_000 });
    await exit.click();
    await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 15_000 })
      .not.toContain('admin');
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible();
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });

  test('the legacy #provider_portal1 alias normalises for an authorised provider', async ({ page, request }) => {
    test.skip(Boolean(sessionUnavailableReason), sessionUnavailableReason);
    const session = await localSession(request, 'provider');
    await pageWithSession(page, session);
    const errors = await gotoRoute(page, '#provider_portal1');

    await expectDeepLinkOpens(
      page,
      () => providerPortal(page).isVisible().catch(() => false),
      '#provider_portal',
    );
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });

  test('a customer session is refused both privileged routes but keeps module access', async ({ page, request }) => {
    test.skip(Boolean(sessionUnavailableReason), sessionUnavailableReason);
    const session = await localSession(request, 'customer');
    await pageWithSession(page, session);

    const portalErrors = await gotoRoute(page, '#admin');
    await expect(adminConsole(page)).toHaveCount(0);
    await expect(page.getByTestId('admin-console-entry')).toHaveCount(0);
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible();
    expect(portalErrors, portalErrors.join(' | ')).toHaveLength(0);

    const providerErrors = await gotoRoute(page, '#provider');
    await expect(providerPortal(page)).toHaveCount(0);
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible();

    await gotoRoute(page, '#classes');
    await expect(page.locator('section[aria-label="classes section"]')).toBeVisible({ timeout: 30_000 });
    expect(providerErrors, providerErrors.join(' | ')).toHaveLength(0);
  });
});

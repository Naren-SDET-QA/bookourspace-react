import { expect, test, type Page } from '@playwright/test';
import {
  AUTH,
  BUSINESS,
  startProviderContextHarness,
  type ProviderContextHarness,
} from './provider-context-harness';

/**
 * Provider business context in the real browser.
 *
 * The app runs with BOS_STRICT_PERMISSION_DEFAULTS=1 against a throwaway
 * database, so every assertion below sits behind the real middleware: the
 * session is HMAC-signed, the membership is read from Postgres, and the grant
 * decides whether the workspace opens.
 */

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

let harness: ProviderContextHarness;

test.beforeAll(async () => {
  harness = await startProviderContextHarness();
});

test.afterAll(async () => {
  await harness?.stop();
});

async function openProviderPortal(page: Page, authId: string) {
  await page.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem('bos_session_token_v1', token);
      window.localStorage.setItem('bos_google_auth_user_v1', user);
    },
    { token: harness.token(authId), user: JSON.stringify(harness.authUser(authId)) },
  );
  await page.goto(harness.url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#bos-main-content')).toBeAttached({ timeout: 60_000 });
  const contextTarget = page.locator('[data-testid="provider-business-bar"], [data-testid="provider-context-notice"]').first();
  // The shell ignores the hash while the visitor still looks signed out, so the
  // signed-in header must be on screen before routing to the provider portal.
  await expect(page.getByRole('button', { name: /Signed in as/i }).first()).toBeVisible({ timeout: 60_000 });
  const providerHub = page.getByRole('button', { name: /Provider Hub/i }).first();
  await providerHub.scrollIntoViewIfNeeded();
  await providerHub.click();
  // Either the workspace header or a context notice must appear; anything else
  // means the portal did not mount.
  await expect(contextTarget).toBeVisible({ timeout: 60_000 });
  // The dashboard is also rendered while hidden, so prove the provider view is
  // the one on screen: the marketplace hero must be gone.
  await expect(page.getByRole('heading', { name: /Find a space that fits your day/i })).toHaveCount(0);
}

test('a multi-business provider gets a selector listing only their businesses', async ({ page }) => {
  await openProviderPortal(page, AUTH.multi);

  const selector = page.getByTestId('provider-business-select');
  await expect(selector).toBeVisible();
  const options = selector.locator('option');
  await expect(options).toHaveCount(2);
  await expect(options.filter({ hasText: BUSINESS.alpha.name })).toHaveCount(1);
  await expect(options.filter({ hasText: BUSINESS.beta.name })).toHaveCount(1);
  await expect(page.getByTestId('provider-business-approval')).toHaveText(/approved/i);
  await page.getByTestId('provider-business-bar').scrollIntoViewIfNeeded();
  // The selector must sit above the KPI cards, not below them.
  const barTop = await page.getByTestId('provider-business-bar').evaluate((el) => el.getBoundingClientRect().top);
  const kpiTop = await page.getByText('Approved Live Posts', { exact: false }).first().evaluate((el) => el.getBoundingClientRect().top);
  expect(barTop).toBeLessThan(kpiTop);
  const essentialOnly = page.getByRole('button', { name: /Essential only/i });
  if (await essentialOnly.isVisible().catch(() => false)) await essentialOnly.click().catch(() => {});
  await page.screenshot({ path: 'e2e-artifacts/provider-business-selector.png' });
  // The working, granted business is selected automatically.
  await expect(selector).toHaveValue(BUSINESS.alpha.id);
});

test('switching to a business without a grant explains the refusal', async ({ page }) => {
  await openProviderPortal(page, AUTH.multi);
  await page.getByTestId('provider-business-select').selectOption(BUSINESS.beta.id);

  const notice = page.getByTestId('provider-context-notice');
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toHaveAttribute('data-notice-kind', 'permission');
  await expect(notice).toContainText(/permission/i);
  await expect(page.getByTestId('provider-contact-admin')).toBeVisible();
  const essentialOnly = page.getByRole('button', { name: /Essential only/i });
  if (await essentialOnly.isVisible().catch(() => false)) await essentialOnly.click().catch(() => {});
  // Park the panel below the two sticky headers so its heading is not clipped.
  await notice.evaluate((el) => {
    const shell = el.closest('.bos-app-shell');
    if (!shell) return;
    shell.scrollTop += el.getBoundingClientRect().top - 320;
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e-artifacts/provider-permission-denied.png' });
  // The refusal is not disguised as an empty dashboard.
  await expect(page.getByText('Owner overview')).toHaveCount(0);
});

test('a grant for the switched-to business loads its workspace', async ({ page }) => {
  await harness.query(
    `insert into public.business_member_access (business_id, user_id, allowed_modules, allowed_sections, allowed_actions)
     values ($1,$2,array['pg_hostels'],'{}'::jsonb,'{}'::jsonb)
     on conflict (business_id, user_id) do update set allowed_modules = excluded.allowed_modules`,
    [BUSINESS.beta.id, AUTH.multi],
  );

  await openProviderPortal(page, AUTH.multi);
  await page.getByTestId('provider-business-select').selectOption(BUSINESS.beta.id);

  await expect(page.getByTestId('provider-context-notice')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('provider-business-select')).toHaveValue(BUSINESS.beta.id);
  // The dashboard shell, not a permission panel, is what renders.
  await expect(page.getByRole('navigation', { name: 'Owner sections' })).toBeVisible({ timeout: 30_000 });
});

test('a single-business provider is selected automatically with no selector', async ({ page }) => {
  await openProviderPortal(page, AUTH.single);

  await expect(page.getByTestId('provider-business-name')).toContainText(BUSINESS.solo.name);
  await expect(page.getByTestId('provider-business-select')).toHaveCount(0);
  await expect(page.getByTestId('provider-context-notice')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Owner sections' })).toBeVisible({ timeout: 30_000 });
});

test('a provider with no business sees onboarding instead of a dashboard', async ({ page }) => {
  await openProviderPortal(page, AUTH.zero);

  const notice = page.getByTestId('provider-context-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('data-notice-kind', 'select-business');
  await expect(notice).toContainText(/Create a business or accept an invitation/i);
  await expect(page.getByTestId('provider-business-select')).toHaveCount(0);
  await expect(page.getByText('Owner overview')).toHaveCount(0);
});

test('switching back to the granted business works again', async ({ page }) => {
  await openProviderPortal(page, AUTH.multi);
  const selector = page.getByTestId('provider-business-select');

  await selector.selectOption(BUSINESS.beta.id);
  await expect(page.getByRole('navigation', { name: 'Owner sections' })).toBeVisible({ timeout: 30_000 });

  await selector.selectOption(BUSINESS.alpha.id);
  await expect(page.getByRole('navigation', { name: 'Owner sections' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('provider-context-notice')).toHaveCount(0);
});

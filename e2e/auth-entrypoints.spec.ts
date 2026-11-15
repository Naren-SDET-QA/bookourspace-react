import { expect, test } from '@playwright/test';

const MUMBAI_PROJECT = 'obkfgxjzlscungkhbyvq';

async function openApp(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root > *')).toBeAttached({ timeout: 30_000 });
}

test.describe('signed-out Google sign-in entry points', () => {
  test('home header exposes Continue with Google and opens the shared Supabase auth flow', async ({ page }) => {
    await openApp(page);
    const continueButton = page.getByRole('button', { name: 'Continue with Google', exact: true }).last();
    await expect(continueButton).toBeVisible();
    await continueButton.click();

    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue securely with Google' })).toBeVisible();
  });

  test('top-right menu Sign In opens the shared Supabase auth flow', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Open All Sections & Quick Menu' }).click();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue securely with Google' })).toBeVisible();
  });

  test('Profile offers Continue with Google and opens the shared auth modal', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: /^Profile$/ }).click();
    const continueButton = page.getByRole('button', { name: 'Continue with Google', exact: true }).last();
    await expect(continueButton).toBeVisible();
    await continueButton.click();

    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue securely with Google' })).toBeVisible();
  });

  test('new registration cannot select a privileged role', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).last().click();

    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toBeVisible();
    await expect(page.getByText('Select Account Portal')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Provider', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
  });

  test('a verified OAuth result closes the modal and returns to Home', async ({ page }) => {
    await page.goto('/#services', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root > *')).toBeAttached({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Open All Sections & Quick Menu' }).click();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toBeVisible();

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('bos-google-oauth-redirect', {
        detail: {
          isNewUser: true,
          user: { name: 'New Customer', email: 'new.customer@example.test', role: 'customer' },
          redirectTarget: 'marketplace',
        },
      }));
    });

    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');
  });

  test('popup flow builds the configured Google authorize URL and app callback', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__bosOAuthPopupUrl = null;
      window.open = (() => ({
        location: { replace: (url: string) => { (window as any).__bosOAuthPopupUrl = url; } },
        close: () => undefined,
      })) as any;
    });

    await openApp(page);
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).last().click();
    const appOrigin = new URL(page.url()).origin;
    await page.getByRole('button', { name: 'Continue securely with Google' }).click();
    await expect(page.getByText('Complete Google sign-in in the popup window...')).toBeVisible();
    const authorizeUrlValue = await page.evaluate(() => (window as any).__bosOAuthPopupUrl as string);
    const authorizeUrl = new URL(authorizeUrlValue);

    expect(authorizeUrl.origin).toBe(`https://${MUMBAI_PROJECT}.supabase.co`);
    expect(authorizeUrl.pathname).toBe('/auth/v1/authorize');
    expect(authorizeUrl.searchParams.get('provider')).toBe('google');
    expect(authorizeUrl.searchParams.get('redirect_to')).toBe(`${appOrigin}/auth/callback?role=customer`);
  });

  test('a blocked popup falls back to the same Google redirect flow', async ({ page }) => {
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await page.context().route(`https://${MUMBAI_PROJECT}.supabase.co/auth/v1/authorize**`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: 'OAuth redirect intercepted for local test.' });
    });

    await openApp(page);
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).last().click();
    const appOrigin = new URL(page.url()).origin;
    const authRequest = page.waitForRequest((request) =>
      request.url().startsWith(`https://${MUMBAI_PROJECT}.supabase.co/auth/v1/authorize`)
    );
    await page.getByRole('button', { name: 'Continue securely with Google' }).click();
    const request = await authRequest;
    const authorizeUrl = new URL(request.url());
    expect(authorizeUrl.searchParams.get('provider')).toBe('google');
    expect(authorizeUrl.searchParams.get('redirect_to')).toBe(`${appOrigin}/auth/callback?role=customer`);
  });
});

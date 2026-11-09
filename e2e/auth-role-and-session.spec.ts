import { expect, test } from '@playwright/test';

const MUMBAI_PROJECT = 'obkfgxjzlscungkhbyvq';
const ADMIN_CONSOLE = 'BookOurSpace Super Admin Console';

async function openApp(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root > *')).toBeAttached({ timeout: 30_000 });
}

test.describe('Google-only session and role boundaries', () => {
  test('a signed-out visitor cannot see an Admin Console entry or open the protected route', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('admin-console-entry')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open All Sections & Quick Menu' }).click();

    await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
    await expect(page.getByText(ADMIN_CONSOLE)).toHaveCount(0);
    expect(new URL(page.url()).hash).not.toContain('admin');
  });

  test('a signed-out visitor cannot open the Provider Portal from the portal switcher', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Open All Sections & Quick Menu' }).click();

    const providerSwitch = page.getByRole('button', { name: 'Provider', exact: true }).first();
    await expect(providerSwitch).toBeVisible();
    await providerSwitch.click();

    await expect(page.getByText(ADMIN_CONSOLE)).toHaveCount(0);
    expect(new URL(page.url()).hash).not.toContain('provider');
  });

  test('the persona switcher offers no privileged mode without a verified identity', async ({ page }) => {
    await openApp(page);
    const providerMode = page.getByRole('button', { name: 'Provider / Seller' });
    const adminMode = page.getByRole('button', { name: 'Super Admin' });
    if (await providerMode.count()) {
      await expect(providerMode).toBeDisabled();
    }
    if (await adminMode.count()) {
      await expect(adminMode).toBeDisabled();
    }
  });

  test('a blocked popup performs a full-page redirect to the hosted Google authorize endpoint', async ({ page }) => {
    await page.addInitScript(() => {
      // The browser refused to open a popup: the sign-in must continue as a
      // full-page redirect instead of being dropped.
      window.open = (() => null) as any;
    });
    await page.route(`https://${MUMBAI_PROJECT}.supabase.co/auth/v1/authorize**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>Google OAuth intercepted for the redirect-fallback test.</body></html>',
      });
    });

    await openApp(page);
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue securely with Google' }).click();

    await page.waitForURL(new RegExp(`${MUMBAI_PROJECT}\\.supabase\\.co/auth/v1/authorize`), {
      timeout: 20_000,
    });
    const authorizeUrl = new URL(page.url());
    expect(authorizeUrl.searchParams.get('provider')).toBe('google');
    expect(authorizeUrl.searchParams.get('redirect_to')).toContain('/auth/callback');
  });

  test('the OAuth popup carries the hosted project and the application callback only', async ({ page }) => {
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

    const authorizeUrl = new URL(await page.evaluate(() => (window as any).__bosOAuthPopupUrl as string));
    expect(authorizeUrl.origin).toBe(`https://${MUMBAI_PROJECT}.supabase.co`);
    expect(authorizeUrl.pathname).toBe('/auth/v1/authorize');
    expect(authorizeUrl.searchParams.get('provider')).toBe('google');
    expect(authorizeUrl.searchParams.get('redirect_to')).toBe(`${appOrigin}/auth/callback?role=customer`);
    // The authorize URL must never carry a privileged role or a credential.
    expect(authorizeUrl.search).not.toContain('role=admin');
    expect(authorizeUrl.search).not.toContain('client_secret');
    expect(authorizeUrl.search).not.toContain('service_role');
  });

  test('a verified OAuth result returns the application to Home', async ({ page }) => {
    await page.addInitScript(() => {
      const target = window as Window & { __bosOAuthRedirectListenerReady?: boolean };
      const addEventListener = window.addEventListener.bind(window);
      window.addEventListener = ((type: string, ...args: any[]) => {
        if (type === 'bos-google-oauth-redirect') target.__bosOAuthRedirectListenerReady = true;
        return (addEventListener as (...a: any[]) => void)(type, ...args);
      }) as typeof window.addEventListener;
    });
    await page.goto('/#services', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => Boolean(
      (window as Window & { __bosOAuthRedirectListenerReady?: boolean }).__bosOAuthRedirectListenerReady,
    ))).toBe(true);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('bos-google-oauth-redirect', {
        detail: {
          isNewUser: false,
          user: { name: 'Returning Customer', email: 'returning@example.test', role: 'customer' },
          redirectTarget: 'marketplace',
        },
      }));
    });

    await expect.poll(() => new URL(page.url()).hash).toBe('');
  });
});

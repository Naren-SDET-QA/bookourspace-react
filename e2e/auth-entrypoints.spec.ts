import { expect, test } from '@playwright/test';

const MUMBAI_PROJECT = 'obkfgxjzlscungkhbyvq';

/**
 * The first-visit entry and `#login` share one sign-in sheet
 * (`CustomerLoginExperience`). Guest availability is decided by the server's
 * `/api/auth/config`, so a test pins that response instead of inheriting the
 * deployment's administrator setting.
 */
async function mockAuthConfig(
  page: import('@playwright/test').Page,
  { guestLoginEnabled, emailOtpConfigured = true }: { guestLoginEnabled: boolean; emailOtpConfigured?: boolean },
) {
  await page.route('**/api/auth/config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      guestLoginEnabled,
      emailOtpEnabled: true,
      googleLoginEnabled: true,
      emailOtpConfigured,
      googleConfigured: true,
    }),
  }));
}

/** Hold the Vite entry (dev) or hashed production bundle so the HTML boot shell stays interactive. */
async function delayAppBootstrap(page: import('@playwright/test').Page, ms = 1200) {
  let delayed = false;
  await page.route(/\/(?:src\/(?:entry|main)\.tsx|assets\/index-[^/?]+\.js)(?:\?|$)/, async (route) => {
    if (!delayed) {
      delayed = true;
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.continue();
  });
}

async function openApp(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // `#root > *` also matches the Suspense fallback mounted beside the shell
  // while a section loads, so a strict locator sees two elements on a cold
  // start. Wait for the shell itself, then for the fallback to be gone.
  await expect(page.locator('#bos-main-content')).toBeAttached({ timeout: 30_000 });
  await expect(page.getByText('Loading BookOurSpace…')).toHaveCount(0, { timeout: 30_000 });
}

test.describe('signed-out Google sign-in entry points', () => {
  test('official logo selects the static artwork when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('bookourspace-splash')).toHaveCount(0, { timeout: 15_000 });
    const guestButton = page.getByTestId('bookourspace-welcome').getByRole('button', { name: 'Explore Spaces as Guest', exact: true });
    if (await guestButton.isVisible().catch(() => false)) await guestButton.click();
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).last().click();
    const logo = page.locator('[aria-label="BookOurSpace Google sign-in"] img');
    await expect(logo).toBeVisible();
    await expect.poll(async () => new URL(await logo.evaluate((image: HTMLImageElement) => image.currentSrc)).pathname)
      .toMatch(/bos-logo-lockup(?:-(?:560|1120)-[a-f0-9]+)?\.webp$/);
    await expect(page.getByTestId('bos-logo-pin-rotor')).toBeHidden();
  });

  test('combined sign-in entry is immediately usable and the Guest choice persists', async ({ page }) => {
    await mockAuthConfig(page, { guestLoginEnabled: true });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('bos_entry_choice_v1'));
    await page.reload({ waitUntil: 'domcontentloaded' });

    const welcome = page.getByTestId('bookourspace-welcome');
    await expect(welcome).toBeVisible();
    const sheet = welcome.getByRole('dialog', { name: 'Sign in or create an account' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet.getByRole('tab', { name: 'Mobile OTP' })).toBeVisible();
    await expect(sheet.getByRole('tab', { name: 'Email' })).toBeVisible();

    const lockup = sheet.locator('img[src*="bos-logo-lockup"]').first();
    await expect(lockup).toBeVisible();
    await expect.poll(async () => lockup.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);

    await expect(sheet.getByTestId('customer-login-google')).toBeVisible();
    const welcomeGuest = sheet.getByTestId('customer-login-guest');
    await expect(welcomeGuest).toBeEnabled();

    await welcomeGuest.click();
    await expect(welcome).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bos_entry_choice_v1'))).toBe('guest');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('bookourspace-welcome')).toHaveCount(0, { timeout: 10_000 });
  });

  test('fast Guest Home keeps search and module choices while React finishes loading', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Start as a first-time visitor: a stored guest choice now shows the
    // quick-home shell immediately (no welcome flash), which is covered by the
    // test above. This test exercises choosing Guest while React still loads.
    await page.addInitScript(() => localStorage.removeItem('bos_entry_choice_v1'));
    await delayAppBootstrap(page);
    await page.goto('/', { waitUntil: 'commit' });
    await page.getByTestId('entry-continue-guest').click();
    const quickHome = page.locator('#bos-quick-home-shell');
    await expect(quickHome).toBeVisible();
    await quickHome.getByRole('searchbox').fill('early mobile search');
    await quickHome.getByRole('button', { name: 'Classes', exact: true }).click();
    await expect(quickHome.getByRole('button', { name: 'Classes', exact: true })).toHaveAttribute('aria-current', 'page');

    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible({ timeout: 30_000 });
    const appHeader = page.getByTestId('universal-marketplace-header');
    await expect(appHeader.getByRole('searchbox')).toHaveValue('early mobile search');
    await expect(appHeader.getByRole('button', { name: 'Classes', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('a returning guest gets the quick home shell without a welcome flash', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('bos_entry_choice_v1', 'guest'));
    await delayAppBootstrap(page);
    await page.goto('/', { waitUntil: 'commit' });
    // The static boot shell must honour the stored choice: no sign-in screen
    // that detaches under the user's tap while React finishes loading.
    await expect(page.locator('#bos-quick-home-shell')).toBeVisible();
    await expect(page.getByTestId('bookourspace-welcome')).toBeHidden();
    await expect(page.getByTestId('entry-continue-guest')).toBeHidden();
  });

  test('the sign-in sheet stays usable at mobile and desktop sizes', async ({ page }) => {
    await mockAuthConfig(page, { guestLoginEnabled: true });
    await page.addInitScript(() => localStorage.removeItem('bos_entry_choice_v1'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const sheet = page.getByRole('dialog', { name: 'Sign in or create an account' });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    // The dialog is addressed by its accessible name, and the name comes from
    // the single sign-in title id, never from the hero headline beside it.
    await expect(sheet).toHaveAttribute('aria-labelledby', 'bos-customer-login-title');
    await expect(page.locator('#bos-customer-login-title')).toHaveCount(1);

    for (const viewport of [{ width: 360, height: 640 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect(sheet.getByTestId('customer-login-google')).toBeVisible();
      await expect(sheet.getByTestId('customer-login-guest')).toBeVisible();
      await expect(sheet.getByRole('tab', { name: 'Email' })).toBeVisible();
      const layout = await page.evaluate(() => {
        const root = document.documentElement;
        const google = document.querySelector('[data-testid="customer-login-google"]') as HTMLElement;
        const guest = document.querySelector('[data-testid="customer-login-guest"]') as HTMLElement;
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          googleWidth: google.getBoundingClientRect().width,
          guestWidth: guest.getBoundingClientRect().width,
        };
      });
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
      expect(layout.googleWidth).toBeGreaterThan(0);
      expect(layout.guestWidth).toBeGreaterThan(0);
    }
  });


  test('guest browsing is turned off when the administrator has not enabled it', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('bos_entry_choice_v1');
      localStorage.removeItem('bos_guest_login_enabled_v1');
    });
    await mockAuthConfig(page, { guestLoginEnabled: false });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const sheet = page.getByRole('dialog', { name: 'Sign in or create an account' });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByTestId('customer-login-google')).toBeVisible();

    // The control stays visible so visitors learn why, but it cannot be used
    // and the enabled guest action is never mounted.
    await expect(sheet.getByTestId('customer-login-guest')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Browse as Guest' })).toBeDisabled();
    await expect(sheet.getByText('Guest browsing is turned off by the administrator on this deployment.')).toBeVisible();

    await sheet.getByRole('tab', { name: 'Email' }).click();
    await expect(page.getByLabel('Email address')).toBeEnabled();
  });

  test('the full login page uses email OTP and turns guest off when disabled', async ({ page }) => {
    // A returning guest already holds the entry choice, so `#login` renders the
    // full-page sign-in on its own instead of stacking over the first-visit entry.
    await page.addInitScript(() => localStorage.setItem('bos_entry_choice_v1', 'guest'));
    await mockAuthConfig(page, { guestLoginEnabled: false, emailOtpConfigured: true });
    await page.goto('/#login', { waitUntil: 'domcontentloaded' });

    const sheet = page.getByRole('dialog', { name: 'Sign in or create an account' });
    await expect(sheet).toHaveCount(1);
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet.getByRole('button', { name: 'Close sign-in' })).toBeVisible();

    await sheet.getByRole('tab', { name: 'Email' }).click();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Send OTP' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(sheet.getByTestId('customer-login-guest')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Browse as Guest' })).toBeDisabled();
  });

  test('a first visit to #login shows one sign-in sheet and Escape closes it', async ({ page }) => {
    // No stored entry choice: this is the visitor who previously got the
    // first-visit sheet stacked underneath the full-page one.
    await page.addInitScript(() => localStorage.removeItem('bos_entry_choice_v1'));
    await mockAuthConfig(page, { guestLoginEnabled: true });
    await page.goto('/#login', { waitUntil: 'domcontentloaded' });

    const sheet = page.getByRole('dialog', { name: 'Sign in or create an account' });
    await expect(sheet).toHaveCount(1);
    await expect(sheet.first()).toBeVisible({ timeout: 15_000 });
    // Only the full-page login offers a close control, and the first-visit
    // entry is not mounted behind it.
    await expect(page.getByRole('button', { name: 'Close sign-in' })).toHaveCount(1);
    await expect(page.getByTestId('bookourspace-welcome')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close sign-in' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.location.hash)).not.toBe('#login');
    // Closing the login page returns the visitor to the first-visit entry,
    // still a single sheet.
    await expect(page.getByRole('dialog', { name: 'Sign in or create an account' })).toHaveCount(1);
    await expect(page.getByTestId('bookourspace-welcome')).toBeVisible();
  });

  test('Google opens the shared auth dialog above the entry sheet and Escape returns focus', async ({ page }) => {
    await mockAuthConfig(page, { guestLoginEnabled: true });
    await page.addInitScript(() => localStorage.removeItem('bos_entry_choice_v1'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const googleButton = page.getByTestId('customer-login-google');
    await expect(googleButton).toBeVisible({ timeout: 15_000 });
    await googleButton.click();

    const dialog = page.getByRole('dialog', { name: 'Sign In with Google' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('dialog', { name: 'Sign in or create an account' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Sign in or create an account' })).toBeVisible();
    await expect(googleButton).toBeFocused();
  });


  test('the entry Google button opens the existing Supabase Google auth flow', async ({ page }) => {
    await mockAuthConfig(page, { guestLoginEnabled: true });
    await page.addInitScript(() => localStorage.removeItem('bos_entry_choice_v1'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const googleButton = page.getByTestId('customer-login-google');
    await expect(googleButton).toBeVisible({ timeout: 15_000 });
    await googleButton.click();
    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue securely with Google' })).toBeVisible();
  });

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
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).last().click();

    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue securely with Google' })).toBeVisible();
  });

  test('Profile offers Continue with Google and opens the shared auth modal', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: /^Profile$/ }).click();
    const continueButton = page.locator('[role="region"][aria-label="Profile"]').getByRole('button', { name: 'Continue with Google', exact: true });
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

  test('a verified OAuth result restores the selected module destination', async ({ page }) => {
    await page.goto('/#services', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root > *')).toBeAttached({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Open All Sections & Quick Menu' }).click();
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toBeVisible();

    await page.evaluate(() => {
      sessionStorage.setItem('bos_oauth_return_section_v1', 'services');
      sessionStorage.setItem('bos_oauth_return_hash_v1', '#services');
      sessionStorage.setItem('bos_oauth_return_path_v1', '/');
      window.dispatchEvent(new CustomEvent('bos-google-oauth-redirect', {
        detail: {
          isNewUser: true,
          user: { name: 'New Customer', email: 'new.customer@example.test', role: 'customer' },
          redirectTarget: 'marketplace',
        },
      }));
    });

    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toHaveCount(0);
    await expect(page.locator('section[aria-label="services section"]')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#services');
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

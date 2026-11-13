import { expect, test } from '@playwright/test';

const MUMBAI_PROJECT = 'obkfgxjzlscungkhbyvq';

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

  test('lightweight boot welcome is immediately usable and Guest choice persists', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('bos_entry_choice_v1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('bookourspace-welcome')).toBeVisible();
    const officialLogo = page.locator('[data-testid="bookourspace-welcome"] .bos-entry-official-logo');
    await expect(officialLogo.locator('img')).toHaveAttribute('src', /bos-logo-lockup\.webp$/);
    await expect(page.getByTestId('bos-logo-pin-rotor')).toBeVisible();
    const pinRotor = page.locator('.bos-official-logo__spin');
    await expect(pinRotor).toHaveCSS('animation-name', 'bos-logo-pin-spinner');
    await expect(pinRotor).toHaveCSS('animation-duration', '2s');
    await expect(pinRotor).toHaveCSS('animation-timing-function', 'linear');
    await expect(pinRotor).toHaveCSS('animation-iteration-count', 'infinite');
    const pinOrigin = (await pinRotor.evaluate((element) => getComputedStyle(element).transformOrigin))
      .split(/\s+/).map(value => Number.parseFloat(value));
    expect(pinOrigin[0]).toBeCloseTo(259, 0);
    expect(pinOrigin[1]).toBeCloseTo(174.5, 0);
    await expect(officialLogo.locator('.bos-official-logo__face--back')).toHaveCSS('transform', /matrix3d/);
    const initialTransform = await pinRotor.evaluate((element) => getComputedStyle(element).transform);
    await page.waitForTimeout(350);
    const laterTransform = await pinRotor.evaluate((element) => getComputedStyle(element).transform);
    expect(laterTransform).not.toBe(initialTransform);
    await expect.poll(async () => officialLogo.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThanOrEqual(560);
    await expect(page.getByTestId('entry-google-sign-in')).toBeVisible();
    const welcomeGuest = page.getByTestId('bookourspace-welcome').getByRole('button', { name: 'Explore Spaces as Guest', exact: true });
    await expect(welcomeGuest).toBeVisible();

    await welcomeGuest.click();
    await expect(page.getByTestId('bookourspace-welcome')).toHaveCount(0);
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

  test('welcome uses the Flutter dark brand surface and stays usable at mobile and desktop sizes', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('bos_entry_choice_v1'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const welcome = page.getByTestId('bookourspace-welcome');
    await welcome.waitFor({ state: 'visible', timeout: 10_000 });

    await expect(welcome).toHaveCSS('background-color', 'rgb(11, 14, 26)');
    await expect(page.getByTestId('bos-logo-pin-rotor')).toBeVisible();
    await expect(page.getByTestId('entry-google-sign-in')).toHaveCSS('min-height', '56px');
    await expect(page.getByTestId('entry-continue-guest')).toHaveCSS('min-height', '56px');
    await expect(page.getByTestId('entry-google-sign-in')).toHaveAccessibleDescription(/New Google accounts get a profile automatically/);

    for (const viewport of [{ width: 360, height: 640 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect(page.getByTestId('entry-google-sign-in')).toBeVisible();
      await expect(page.getByTestId('entry-continue-guest')).toBeVisible();
      const layout = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="bookourspace-welcome"]') as HTMLElement;
        const google = document.querySelector('[data-testid="entry-google-sign-in"]') as HTMLElement;
        const guest = document.querySelector('[data-testid="entry-continue-guest"]') as HTMLElement;
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


  test('guest browsing stays hidden when the administrator has not enabled it', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('bos_entry_choice_v1');
      localStorage.removeItem('bos_guest_login_enabled_v1');
    });
    await page.route('**/api/auth/config', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        guestLoginEnabled: false,
        emailOtpEnabled: true,
        googleLoginEnabled: true,
        emailOtpConfigured: false,
        googleConfigured: true,
      }),
    }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('bookourspace-welcome')).toBeVisible();
    await expect(page.getByTestId('entry-google-sign-in')).toBeVisible();
    await expect(page.getByTestId('entry-continue-guest')).toHaveCount(0);
    await expect(page.getByTestId('entry-email-sign-in')).toBeVisible();
  });

  test('the full login page uses email OTP and hides guest when disabled', async ({ page }) => {
    await page.route('**/api/auth/config', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        guestLoginEnabled: false,
        emailOtpEnabled: true,
        googleLoginEnabled: true,
        emailOtpConfigured: true,
        googleConfigured: true,
      }),
    }));
    await page.goto('/#login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('dialog', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Browse as guest|Explore spaces as guest/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Continue$/ })).toBeVisible();
  });

  test('Google opens the shared auth dialog above welcome and Escape returns with focus', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('bos_entry_choice_v1'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const googleButton = page.getByTestId('entry-google-sign-in');
    await googleButton.waitFor({ state: 'visible', timeout: 10_000 });
    await googleButton.click();

    const dialog = page.getByRole('dialog', { name: 'Sign In with Google' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveClass(/\bdark\b/);
    await expect.poll(
      () => dialog.evaluate((element) => getComputedStyle(element).backgroundColor)
    ).not.toBe('rgb(255, 255, 255)');
    await expect(page.getByRole('button', { name: 'Close sign-in' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('bookourspace-welcome')).toBeVisible();
    await expect(googleButton).toBeFocused();
  });


  test('welcome Google button opens the existing Supabase Google auth flow', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('bos_entry_choice_v1'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('entry-google-sign-in').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByTestId('entry-google-sign-in').click();
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

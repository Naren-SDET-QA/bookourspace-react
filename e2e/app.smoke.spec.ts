import { expect, test, type Page } from '@playwright/test';

/**
 * Cross-size shell verification for the marketplace.
 *
 * Scope is deliberately explicit: this proves the shell boots, every module
 * deep link resolves, layout does not overflow horizontally, pinch-zoom is not
 * blocked, and the PWA manifest is served — on Chromium at five viewports.
 *
 * It does NOT prove a data-backed booking journey: the stays/services
 * discovery feeds read Supabase directly, and no local Supabase stack is
 * configured in this environment. That journey is covered at the HTTP +
 * PostgreSQL level by supabase/tests/run_stay_payment_e2e.sh.
 */

const VIEWPORTS = [
  { name: 'small phone 320×740', width: 320, height: 740 },
  { name: 'phone 360×800', width: 360, height: 800 },
  { name: 'phone 375×812', width: 375, height: 812 },
  { name: 'mobile portrait 390×844', width: 390, height: 844 },
  { name: 'large phone 430×932', width: 430, height: 932 },
  { name: 'tablet 768×1024', width: 768, height: 1024 },
  { name: 'tablet 820×1180', width: 820, height: 1180 },
  { name: 'iPad landscape 1024×768', width: 1024, height: 768 },
  { name: 'desktop 1280×800', width: 1280, height: 800 },
  { name: 'desktop 1440×900', width: 1440, height: 900 },
  { name: 'wide desktop 1920×1080', width: 1920, height: 1080 },
  { name: 'mobile landscape 844×390', width: 844, height: 390 },
];

const ROUTES = ['#pg', '#classes', '#venues', '#services', '#stays', '#movies'];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /cannot contain a nested <button>/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  return errors;
}

async function bootApp(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#root > *', { state: 'attached', timeout: 30_000 });
  // Wait for the real shell, not just the empty mount point: switching hash
  // while the first lazy route is still importing can race the render tree.
  await expect
    .poll(async () => (await page.locator('body').innerText()).trim().length, { timeout: 30_000 })
    .toBeGreaterThan(200);
  // The lightweight boot screen is interactive while App loads. Wait for the
  // real marketplace header so keyboard and route checks don't target it.
  await expect(page.getByRole('button', { name: 'Open All Sections & Quick Menu' }))
    .toBeVisible({ timeout: 30_000 });
}

async function waitForLazyModule(page: Page, route: string) {
  if (route === '#movies') {
    await expect(page.getByRole('heading', { name: /Movies & showtimes/i }).first()).toBeVisible();
    return;
  }
  const modules: Record<string, { section: string; loading: string }> = {
    '#pg': { section: 'pg_hostels', loading: 'Loading PGs…' },
    '#classes': { section: 'classes', loading: 'Loading classes…' },
    '#services': { section: 'services', loading: 'Loading services…' },
    '#stays': { section: 'hotel_stay', loading: 'Loading stays…' },
  };
  const module = modules[route];
  if (!module) return;
  const section = page.locator(`section[aria-label="${module.section} section"]`);
  await expect(section).toBeVisible();
  await expect(section.getByRole('status').filter({ hasText: module.loading })).toHaveCount(0);
}

test.describe('responsive shell', () => {
  for (const viewport of VIEWPORTS) {
    test(`renders without horizontal overflow — ${viewport.name}`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await bootApp(page);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      // A 2px tolerance absorbs sub-pixel rounding on scaled emulation.
      expect(overflow.scrollWidth, `scrollWidth ${overflow.scrollWidth} vs ${overflow.clientWidth}`)
        .toBeLessThanOrEqual(overflow.clientWidth + 2);

      expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
    });
  }

  test('pinch-zoom is not disabled (WCAG 1.4.4)', async ({ page }) => {
    await bootApp(page);
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).not.toContain('user-scalable=no');
    expect(viewport).not.toContain('maximum-scale=1');
  });

  test('200% text scaling remains usable on all six modules at a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await bootApp(page);
    for (const route of ROUTES) {
      await page.evaluate((hash) => { window.location.hash = hash; }, route);
      await expect.poll(async () => (await page.locator('body').innerText()).trim().length)
        .toBeGreaterThan(80);
      const scaleOverride = await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      const size = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(size.document, `${route} at 200% text scaling overflowed to ${size.document}px`)
        .toBeLessThanOrEqual(size.viewport + 2);
      await scaleOverride.evaluate((element) => (element as HTMLStyleElement).remove());
    }
  });

  test('keyboard navigation exposes a visible focus indicator', async ({ page }) => {
    await bootApp(page);
    await expect(page.getByTestId('bookourspace-splash')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId('bookourspace-welcome')).toHaveCount(0, { timeout: 10_000 });
    await page.keyboard.press('Tab');
    // Firefox on macOS first focuses the application shell wrapper before
    // advancing to the first actual control; verify a real control's ring.
    const firstTarget = await page.evaluate(() => document.activeElement?.tagName ?? '');
    if (firstTarget === 'DIV') await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      const style = element ? window.getComputedStyle(element) : null;
      return {
        tag: element?.tagName ?? '',
        outlineStyle: style?.outlineStyle ?? 'none',
        outlineWidth: Number.parseFloat(style?.outlineWidth ?? '0'),
        boxShadow: style?.boxShadow ?? 'none',
      };
    });
    expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focus.tag);
    expect(focus.outlineStyle !== 'none' && focus.outlineWidth >= 2 || focus.boxShadow !== 'none')
      .toBe(true);
  });

  test('light and dark themes remain operable at phone and desktop widths', async ({ page }) => {
    const errors = collectErrors(page);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await bootApp(page);
      if (width <= 520) await page.locator('.bos-header-menu-action').click();

      const initiallyDark = await page.locator('html').evaluate((element) => element.classList.contains('dark'));
      if (initiallyDark) {
        const initialLightToggle = width <= 520
          ? page.getByRole('button', { name: 'Switch to Light Mode' })
          : page.locator('.bos-header-theme-action:visible');
        await initialLightToggle.click();
        await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
      }

      const darkToggle = width <= 520
        ? page.getByRole('button', { name: 'Switch to Dark Mode' })
        : page.locator('.bos-header-theme-action:visible');
      if (width <= 520 && !(await darkToggle.isVisible())) await page.locator('.bos-header-menu-action').click();
      await darkToggle.click();
      await expect(page.locator('html')).toHaveClass(/\bdark\b/);

      const lightToggle = width <= 520
        ? page.getByRole('button', { name: 'Switch to Light Mode' })
        : page.locator('.bos-header-theme-action:visible');
      if (width <= 520 && !(await lightToggle.isVisible())) await page.locator('.bos-header-menu-action').click();
      await lightToggle.click();
      await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `theme switch created horizontal overflow at ${width}px`).toBeLessThanOrEqual(2);
    }
    expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('fixed bottom navigation has a dedicated scroll viewport at phone, tablet, and desktop widths', async ({ page }) => {
    await bootApp(page);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = await page.evaluate(() => {
        const shell = document.querySelector('.bos-app-shell')!.getBoundingClientRect();
        const nav = document.querySelector('[aria-label="Bottom Navigation"]')!.getBoundingClientRect();
        return { shellBottom: shell.bottom, navTop: nav.top, shellHeight: shell.height };
      });
      expect(Math.abs(bounds.shellBottom - bounds.navTop), `content/nav gap at ${width}px`).toBeLessThanOrEqual(1);
      expect(bounds.shellHeight).toBeGreaterThan(300);
    }
  });

  test('PWA manifest is linked and served', async ({ page, request }) => {
    await bootApp(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.name).toContain('BookOurSpace');
    expect(manifest.display).toBe('standalone');
  });
});

test('Movies route shows only real showtimes and no booking surfaces', async ({ page }) => {
  await bootApp(page);
  await page.evaluate(() => { window.location.hash = '#movies'; });
  await expect(page.getByRole('heading', { name: /Movies & showtimes/i }).first()).toBeVisible();
  // No bundled/demo movie titles may leak into the showtimes directory.
  await expect(page.getByText(/Pushpa 2|Kalki 2898 AD|PVR Orion Mall|indicative sample/i)).toHaveCount(0);
  // Real inventory or the honest empty state, never fabricated cards.
  await expect(page.getByText(/Movies near you|No showtimes for this location yet|Movie not assigned/).first()).toBeVisible();
  // Booking, seats, payments, tickets and refunds are hidden for Movies.
  await expect(page.getByRole('button', { name: /book seats|select seats|pay now|buy ticket|refund/i })).toHaveCount(0);
  await expect(page.getByText(/No online booking for Movies/i).first()).toBeVisible();
});

test.describe('module deep links', () => {
  test('repeated navigation and reloads keep lazy sections available', async ({ page }) => {
    const failures: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error'
        && /Outdated Optimize Dep|Failed to fetch dynamically imported module|SectionErrorBoundary|\[section\] failed to load/i.test(message.text())) {
        failures.push(`console: ${message.text()}`);
      }
    });
    page.on('response', (response) => {
      if (response.status() >= 500 && /node_modules\/\.vite|src\/components|\/assets\//.test(response.url())) {
        failures.push(`response ${response.status()}: ${response.url()}`);
      }
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await bootApp(page);
    for (let round = 0; round < 3; round += 1) {
      for (const route of ['#pg', '#classes', '#services', '#stays', '#movies']) {
        await page.evaluate((hash) => { window.location.hash = hash; }, route);
        await expect(page.getByRole('button', { name: 'Open All Sections & Quick Menu' })).toBeVisible();
        await waitForLazyModule(page, route);
        await expect(page.getByText('This section could not load')).toHaveCount(0);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'Open All Sections & Quick Menu' })).toBeVisible({ timeout: 30_000 });
        await waitForLazyModule(page, route);
        await expect(page.getByText('This section could not load')).toHaveCount(0);
      }
    }
    expect(failures, failures.join(' | ')).toHaveLength(0);
  });

  test('every registry route renders content and survives history navigation', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await bootApp(page);

    for (const route of ROUTES) {
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, route);
      await expect
        .poll(async () => page.evaluate(() => window.location.hash), { timeout: 10_000 })
        .toBe(route);
      // Lazy route components mount asynchronously; poll instead of guessing.
      await expect
        .poll(async () => (await page.locator('body').innerText()).trim().length, {
          message: `${route} rendered almost nothing`,
          timeout: 15_000,
        })
        .toBeGreaterThan(80);
    }

    await page.goBack();
    await expect
      .poll(async () => page.evaluate(() => window.location.hash), { timeout: 10_000 })
      .not.toBe('#movies');

    expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('all six module views stay within the viewport at every target width', async ({ page }) => {
    const errors = collectErrors(page);
    await bootApp(page);
    const sections: Record<string, string> = {
      '#pg': 'pg_hostels',
      '#classes': 'classes',
      '#venues': 'venues',
      '#services': 'services',
      '#stays': 'hotel_stay',
      '#movies': 'movies',
    };
    const header = page.getByTestId('universal-marketplace-header');
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of ROUTES) {
        const section = sections[route];
        const tab = header.getByTestId(`market-section-${section}`);
        await tab.click();
        await expect(tab).toHaveAttribute('aria-pressed', 'true');
        await waitForLazyModule(page, route);
        const size = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
        }));
        expect(size.document, `${route} at ${viewport.width}px overflowed to ${size.document}px`)
          .toBeLessThanOrEqual(size.viewport + 2);
      }
    }
    expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('narrow-screen header actions remain visible and have touch-sized targets', async ({ page }) => {
    const errors = collectErrors(page);
    for (const width of [320, 360, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await bootApp(page);
      const actions = page.locator('.bos-header-actions');
      await expect(actions.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      const boxes = await actions.locator('button:visible').evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      }));
      expect(boxes.length).toBeGreaterThanOrEqual(3);
      for (const box of boxes) {
        expect(box.left, `action starts outside viewport at ${width}px`).toBeGreaterThanOrEqual(-1);
        expect(box.right, `action ends outside viewport at ${width}px`).toBeLessThanOrEqual(width + 1);
        expect(box.width, `action is too narrow at ${width}px`).toBeGreaterThanOrEqual(44);
        expect(box.height, `action is too short at ${width}px`).toBeGreaterThanOrEqual(44);
      }
      if (width <= 520) {
        await actions.locator('.bos-header-menu-action').click();
        await expect(page.getByRole('button', { name: /Switch to (Dark|Light) Mode/ })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
        await page.getByRole('button', { name: 'Open All Sections & Quick Menu' }).click();
      }
    }
    expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('customer shortcuts and Google sign-in remain usable on a small phone', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await bootApp(page);
    const nav = page.getByRole('navigation', { name: 'Bottom Navigation' });

    await nav.getByRole('button', { name: 'Profile' }).click();
    const profile = page.getByRole('region', { name: 'Profile' });
    await expect(profile.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(profile.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    const profileModalBounds = await page.evaluate(() => {
      const modal = document.querySelector('[aria-label="Profile"]')!.getBoundingClientRect();
      return { modalTop: modal.top, modalBottom: modal.bottom, viewportHeight: window.innerHeight };
    });
    expect(profileModalBounds.modalTop, 'Profile starts within the visible page').toBeGreaterThanOrEqual(-1);
    expect(profileModalBounds.modalBottom, 'Profile stays within the visible page').toBeLessThanOrEqual(profileModalBounds.viewportHeight + 1);
    await profile.getByRole('button', { name: 'Close Profile' }).click();

    await nav.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('input[type="text"], input[type="search"]').first()).toBeFocused();

    await nav.getByRole('button', { name: 'My Bookings' }).click();
    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('bos_profile_after_auth'))).toBe('bookings');
    await page.getByRole('dialog', { name: 'Sign In with Google' }).getByRole('button', { name: 'Close sign-in' }).click();

    await nav.getByRole('button', { name: /My Favorites/ }).click();
    await expect(page.getByRole('heading', { name: 'Sign In with Google' })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('bos_profile_after_auth'))).toBe('favorites');

    await page.getByRole('dialog', { name: 'Sign In with Google' }).getByRole('button', { name: 'Close sign-in' }).click();
    await nav.getByRole('button', { name: 'Home' }).click();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByText('Sign In with Google')).toBeVisible();
    const modalBounds = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"][aria-labelledby="bos-auth-title"]')!.getBoundingClientRect();
      const nav = document.querySelector('[aria-label="Bottom Navigation"]')!.getBoundingClientRect();
      return { modalTop: modal.top, modalBottom: modal.bottom, navTop: nav.top };
    });
    expect(modalBounds.modalTop, 'Google login modal starts above the visible page').toBeGreaterThanOrEqual(-1);
    expect(modalBounds.modalBottom, 'Google login modal is covered by bottom navigation').toBeLessThanOrEqual(modalBounds.navTop + 1);
    const size = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(size.document).toBeLessThanOrEqual(size.viewport + 2);
    expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('one shared header switches all six modules and keeps the Admin entry hidden for guests', async ({ page }) => {
    for (const viewport of [
      { width: 320, height: 740 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await bootApp(page);
      const header = page.getByTestId('universal-marketplace-header');
      await expect(header).toHaveCount(1);
      await expect(header.getByTestId('admin-console-entry')).toHaveCount(0);
      await header.getByRole('button', { name: 'Open All Sections & Quick Menu' }).click();
      await expect(header.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
      await header.getByRole('button', { name: 'Open All Sections & Quick Menu' }).click();

      const search = header.getByPlaceholder(/Search PGs, classes, halls, services, stay, movies/i);
      await search.fill('PG query');
      await header.getByTestId('market-section-classes').click();
      await expect(search).toHaveValue('');
      await search.fill('Classes query');
      await header.getByTestId('market-section-pg_hostels').click();
      await expect(search).toHaveValue('PG query');

      for (const section of ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies']) {
        const tab = header.getByTestId(`market-section-${section}`);
        await expect(tab).toBeVisible();
        await tab.click();
        await expect(tab).toHaveAttribute('aria-pressed', 'true');
        await expect(header).toHaveCount(1);
      }

      const backToHub = page.locator('button[title="Back to Super-App Home Hub"]');
      if (await backToHub.count()) {
        await backToHub.click();
        await expect(header).toHaveCount(1);
        await expect(header.getByTestId('market-section-pg_hostels')).toHaveAttribute('aria-pressed', 'true');
      }

      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(widths.document, `shared header overflowed at ${viewport.width}px`).toBeLessThanOrEqual(widths.viewport + 2);
    }
  });

  test('keyboard Escape does not trap the user in an overlay', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootApp(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName || '');
    expect(focused).not.toBe('');
    await expect(page.locator('#root')).toBeVisible();
  });
});

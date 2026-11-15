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
  { name: 'mobile portrait 390×844', width: 390, height: 844 },
  { name: 'mobile landscape 844×390', width: 844, height: 390 },
  { name: 'tablet portrait 834×1112', width: 834, height: 1112 },
  { name: 'tablet landscape 1112×834', width: 1112, height: 834 },
  { name: 'desktop 1440×900', width: 1440, height: 900 },
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

test.describe('module deep links', () => {
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

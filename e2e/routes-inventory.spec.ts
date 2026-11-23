import { expect, test, type Page } from '@playwright/test';

/**
 * Route inventory sweep for the hash router.
 *
 * Every route the shared router (`src/lib/sectionRouteHash.ts`) classifies is
 * loaded from a direct URL, reloaded, and opened through internal navigation.
 * Each row asserts the surface that route is supposed to produce, so a route
 * that silently falls back to the marketplace home fails instead of "rendering
 * something".
 *
 * Scope: guest sessions (the harness storageState), the demo/fixture catalogue,
 * and Chromium at phone, tablet and desktop widths. Provider/admin/customer
 * authenticated journeys are covered by the session-minting suites
 * (`classes-training`, `venue-booking`, `services-booking`).
 */

type RouteRow = {
  hash: string;
  label: string;
  /** Expected `section[aria-label="<x> section"]` for module screens. */
  section?: string;
  /** Expected classes style wrapper (`data-bos-category-style`). */
  classesStyle?: 'classes-style3' | 'classes-style4';
  /** Expected visible heading instead of a section wrapper. */
  heading?: RegExp;
  /** Hash the app should normalise to after the route settles. */
  settledHash?: string;
};

const ROUTE_ROWS: RouteRow[] = [
  { hash: '#pg', label: 'PG deep link', section: 'pg_hostels' },
  { hash: '#pg/hostels', label: 'PG nested deep link', section: 'pg_hostels' },
  { hash: '#classes', label: 'Classes deep link', section: 'classes' },
  { hash: '#classes/style4', label: 'Classes Style 4 deep link', section: 'classes', classesStyle: 'classes-style4' },
  { hash: '#classes/style3', label: 'Classes Style 3 deep link', section: 'classes', classesStyle: 'classes-style3' },
  // Retired Classes layouts must never resurrect: they resolve to Style 4.
  { hash: '#classes/style2', label: 'Classes retired Style 2 alias', section: 'classes', classesStyle: 'classes-style4' },
  { hash: '#classes/style1', label: 'Classes retired Style 1 alias', section: 'classes', classesStyle: 'classes-style4' },
  { hash: '#services', label: 'Services deep link', section: 'services' },
  // Retired Services styles canonicalise to the single approved hash.
  { hash: '#services/style1', label: 'Services retired Style 1 alias', section: 'services', settledHash: '#services' },
  { hash: '#services/style3', label: 'Services retired Style 3 alias', section: 'services', settledHash: '#services' },
  { hash: '#venues', label: 'Venues deep link', heading: /All Venues & Halls/ },
  { hash: '#halls', label: 'Venues alias #halls', heading: /All Venues & Halls/ },
  { hash: '#stays', label: 'Stays deep link', section: 'hotel_stay' },
  { hash: '#hotels', label: 'Stays alias #hotels', section: 'hotel_stay' },
  { hash: '#movies', label: 'Movies deep link', heading: /Movies & showtimes/i },
  { hash: '#cinema', label: 'Movies alias #cinema', heading: /Movies & showtimes/i },
];

async function dismissPrivacy(page: Page, attempts = 10): Promise<void> {
  const essentialOnly = page.getByRole('button', { name: 'Essential only', exact: true });
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await essentialOnly.isVisible().catch(() => false)) {
      await essentialOnly.click();
      await expect(essentialOnly).toBeHidden();
      return;
    }
    await page.waitForTimeout(100);
  }
}

async function expectRouteSurface(page: Page, row: RouteRow): Promise<void> {
  if (row.classesStyle) {
    await expect(page.locator(`[data-bos-category-style="${row.classesStyle}"]`))
      .toBeVisible({ timeout: 30_000 });
  }
  if (row.section) {
    await expect(page.locator(`section[aria-label="${row.section} section"]`))
      .toBeVisible({ timeout: 30_000 });
  }
  if (row.heading) {
    await expect(page.getByRole('heading', { name: row.heading }).first())
      .toBeVisible({ timeout: 45_000 });
  }
  // The error boundary is the one string that means "this section could not load".
  await expect(page.getByText('This section could not load')).toHaveCount(0);
  await expect(page.getByTestId('universal-marketplace-header')).toBeVisible();
}

async function bootRoute(page: Page, hash: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('universal-marketplace-header')).toBeVisible({ timeout: 45_000 });
  await dismissPrivacy(page);
  return errors;
}

test.describe('route inventory — direct load, refresh and overflow', () => {
  for (const row of ROUTE_ROWS) {
    test(`${row.label} (${row.hash}) renders on load and after reload`, async ({ page }) => {
      const errors = await bootRoute(page, row.hash);
      await expectRouteSurface(page, row);

      if (row.settledHash) {
        await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 10_000 })
          .toBe(row.settledHash);
      }

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('universal-marketplace-header')).toBeVisible({ timeout: 45_000 });
      await dismissPrivacy(page, 3);
      await expectRouteSurface(page, row);

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(overflow.document, `${row.hash} overflowed to ${overflow.document}px`)
        .toBeLessThanOrEqual(overflow.viewport + 2);
      expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
    });
  }
});

test.describe('route inventory — guest gates and fallbacks', () => {
  test('an unknown hash keeps the marketplace usable instead of breaking the router', async ({ page }) => {
    const errors = await bootRoute(page, '#not-a-real-section');
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible();
    await expect(page.getByText(/This section could not load/)).toHaveCount(0);
    await expect.poll(async () => (await page.locator('body').innerText()).trim().length)
      .toBeGreaterThan(200);
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });

  test('a tracking hash without a valid token does not blank the app', async ({ page }) => {
    const errors = await bootRoute(page, '#track/not-a-real-token');
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible();
    await expect(page.getByText(/This section could not load/)).toHaveCount(0);
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });

  test('#admin never opens the console for a guest and leaves no privileged surface', async ({ page }) => {
    const errors = await bootRoute(page, '#admin');
    await expect(page.getByText('BookOurSpace Super Admin Console')).toHaveCount(0);
    await expect(page.getByTestId('admin-console-entry')).toHaveCount(0);
    // The guest stays in the marketplace; the hash may stay for a later
    // hydration but grants nothing.
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible();
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });

  test('#provider and the #provider_portal1 alias do not open the portal for a guest', async ({ page }) => {
    for (const hash of ['#provider', '#provider_portal1']) {
      const errors = await bootRoute(page, hash);
      await expect(page.getByRole('heading', { name: /Provider (Dashboard|Portal)/ })).toHaveCount(0);
      await expect(page.getByTestId('universal-marketplace-header')).toBeVisible();
      expect(errors, `${hash}: ${errors.join(' | ')}`).toHaveLength(0);
    }
  });

  test('#login opens the customer sign-in surface', async ({ page }) => {
    const errors = await bootRoute(page, '#login');
    await expect(page.getByRole('heading', { name: 'Book Spaces for Every Occasion' }))
      .toBeVisible({ timeout: 20_000 });
    // The harness has no hosted Google client, so the visible escape route in
    // this environment is the guest entry. Either published entry is a valid
    // sign-in surface; a page with neither would be a dead end.
    const googleEntry = page.getByTestId('customer-login-google');
    const guestEntry = page.getByTestId('customer-login-guest');
    await expect
      .poll(async () => (await googleEntry.count()) + (await guestEntry.count()), { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });
});

test.describe('route inventory — internal navigation', () => {
  test('the shared header rewrites the hash for each module and deep links survive Back/Forward', async ({ page }) => {
    const errors = await bootRoute(page, '');
    const header = page.getByTestId('universal-marketplace-header');
    // Classes pins its approved Style 4 hash, so the tab writes #classes/style4.
    const tabs: Array<[string, string]> = [
      ['pg_hostels', '#pg'],
      ['classes', '#classes/style4'],
      ['venues', '#venues'],
      ['services', '#services'],
      ['hotel_stay', '#stays'],
      ['movies', '#movies'],
    ];
    for (const [section, hash] of tabs) {
      const tab = header.getByTestId(`market-section-${section}`);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 10_000 })
        .toBe(hash);
    }

    // Section pinning is a replaceState route (`pinSectionRoute`), so switching
    // modules never stacks history entries; a visitor's Back button leaves the
    // section screen instead of walking backwards through every tab. Deep links
    // entered as real navigations still round-trip through Back/Forward.
    await page.goto('/#pg', { waitUntil: 'domcontentloaded' });
    await expectRouteSurface(page, { hash: '#pg', label: 'PG deep link', section: 'pg_hostels' });
    await page.goto('/#venues', { waitUntil: 'domcontentloaded' });
    await expectRouteSurface(page, { hash: '#venues', label: 'Venues deep link', heading: /All Venues & Halls/ });
    await page.goBack();
    await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 15_000 })
      .toBe('#pg');
    await expectRouteSurface(page, { hash: '#pg', label: 'PG after Back', section: 'pg_hostels' });
    await page.goForward();
    await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 15_000 })
      .toBe('#venues');
    await expectRouteSurface(page, { hash: '#venues', label: 'Venues after Forward', heading: /All Venues & Halls/ });
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });

  test('a venue detail share link (#venue-<id>) restores the detail page', async ({ page }) => {
    // The detail sheet's Share action is what publishes the deep link, so the
    // test reads the link the product actually builds instead of inventing an id.
    await page.addInitScript(() => {
      (window as unknown as { __bosSharedUrl: string | null }).__bosSharedUrl = null;
      const capture = async (data?: { url?: string }) => {
        (window as unknown as { __bosSharedUrl: string | null }).__bosSharedUrl = data?.url ?? null;
      };
      try {
        Object.defineProperty(navigator, 'share', { configurable: true, value: capture });
      } catch {
        // Older engines expose no Web Share API; the clipboard fallback still runs.
      }
    });

    const errors = await bootRoute(page, '#venues');
    const viewDetails = page.getByRole('button', { name: /View Details/i }).first();
    await expect(viewDetails).toBeVisible({ timeout: 30_000 });
    await viewDetails.click();
    await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Share', exact: true }).click();

    await expect.poll(
      () => page.evaluate(() => (window as unknown as { __bosSharedUrl: string | null }).__bosSharedUrl),
      { timeout: 10_000 },
    ).toMatch(/#venue-.+/);
    const sharedUrl = await page.evaluate(
      () => (window as unknown as { __bosSharedUrl: string }).__bosSharedUrl,
    );
    const detailHash = new URL(sharedUrl).hash;

    await page.goto(sharedUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible({ timeout: 45_000 });
    await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 15_000 })
      .toBe(detailHash);
    await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 30_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 30_000 });
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });
});

test.describe('route inventory — responsive surfaces', () => {
  for (const viewport of [
    { name: 'phone 390×844', width: 390, height: 844 },
    { name: 'tablet 768×1024', width: 768, height: 1024 },
    { name: 'desktop 1440×900', width: 1440, height: 900 },
  ]) {
    test(`every module route fits ${viewport.name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const row of ROUTE_ROWS.filter((entry) => !entry.settledHash)) {
        await page.goto(`/${row.hash}`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('universal-marketplace-header')).toBeVisible({ timeout: 45_000 });
        await dismissPrivacy(page, 3);
        await expectRouteSurface(page, row);
        const size = await page.evaluate(() => ({
          document: document.documentElement.scrollWidth,
          viewport: document.documentElement.clientWidth,
        }));
        expect(size.document, `${row.hash} at ${viewport.width}px overflowed to ${size.document}px`)
          .toBeLessThanOrEqual(size.viewport + 2);
      }
      expect(errors, `uncaught page errors: ${errors.join(' | ')}`).toHaveLength(0);
    });
  }
});

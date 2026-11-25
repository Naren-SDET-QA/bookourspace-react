import { expect, test, type Page } from '@playwright/test';

/**
 * Loading-state assertions.
 *
 * The smoke suite only proves that a loading message eventually disappears.
 * These tests hold the catalog request open and prove the rendered skeleton
 * actually appears while data is in flight, then clears once it resolves.
 */

async function openModule(page: Page, testId: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#root > *', { state: 'attached', timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Open All Sections & Quick Menu' }))
    .toBeVisible({ timeout: 30_000 });
  await page.getByTestId(testId).click();
}

/** Holds `/api/marketplace/listings` open until the returned release is called. */
async function holdCatalogRequest(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let intercepted = 0;
  await page.route('**/api/marketplace/listings', async (route) => {
    intercepted += 1;
    await gate;
    await route.continue();
  });
  return { release: () => release(), intercepted: () => intercepted };
}

test.describe('loading skeletons', () => {
  // Demo builds seed local listings synchronously, so there is no loading
  // phase to observe. The production-like harness starts empty: run these with
  // `BOS_E2E_NO_DEMO=1`.
  test.skip(process.env.BOS_E2E_NO_DEMO !== '1', 'requires the no-demo production-like harness (BOS_E2E_NO_DEMO=1)');

  test('PG results show the pulse skeleton while the catalog request is held', async ({ page }) => {
    const catalog = await holdCatalogRequest(page);
    await openModule(page, 'market-section-pg_hostels');

    const skeleton = page.locator('[aria-busy="true"][aria-label="Loading results"]');
    await expect(skeleton).toBeVisible({ timeout: 20_000 });
    // A live skeleton, not an empty placeholder container.
    await expect(skeleton.locator('.animate-pulse').first()).toBeVisible();
    expect(catalog.intercepted()).toBeGreaterThan(0);

    catalog.release();
    await expect(skeleton).toHaveCount(0, { timeout: 30_000 });
    // The harness catalog may hold no PG rows: a resolved section must show
    // either listings or its explicit empty state, never a permanent skeleton.
    await expect(
      page.locator('article[aria-label^="PG listing"]').first()
        .or(page.getByText('No PGs match these filters')),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('Services results show the skeleton while the same catalog request is held', async ({ page }) => {
    const catalog = await holdCatalogRequest(page);
    await openModule(page, 'market-section-services');

    const skeleton = page.locator('[aria-busy="true"][aria-label="Loading results"]');
    await expect(skeleton).toBeVisible({ timeout: 20_000 });
    await expect(skeleton.locator('.animate-pulse').first()).toBeVisible();
    expect(catalog.intercepted()).toBeGreaterThan(0);

    catalog.release();
    await expect(skeleton).toHaveCount(0, { timeout: 30_000 });
  });
});

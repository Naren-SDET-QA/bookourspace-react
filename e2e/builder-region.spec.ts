import { expect, test, type Page } from '@playwright/test';

/**
 * Customer-facing builder region.
 *
 * The published document is stubbed so this proves the browser wiring, not the
 * server (the PostgreSQL E2E covers the server). It asserts:
 *   1. a published document renders inside the real Classes page;
 *   2. the surrounding functional page is still present (the region is additive);
 *   3. a failed fetch with no cached document leaves the original page untouched.
 */

const publishedDocument = {
  schemaVersion: 1,
  pageKey: 'classes',
  title: 'Classes',
  module: 'classes',
  description: 'Browser probe',
  theme: { primaryColor: '#4338CA' },
  navigation: [{ id: 'nav_probe', label: 'Probe', href: '#classes', visible: true }],
  blocks: [
    { id: 'heading_probe', type: 'heading', visible: true, props: { text: 'Builder browser probe', level: 'h2' }, style: {}, children: [] },
    { id: 'text_probe', type: 'text', visible: true, props: { text: 'Published without an app deploy.' }, style: {}, children: [] },
  ],
};

function pageResult(versionNumber: number, headline: string) {
  return {
    ok: true,
    page: {
      pageKey: 'classes',
      versionId: `11111111-1111-4111-8111-${String(versionNumber).padStart(12, '0')}`,
      versionNumber,
      status: 'published',
      document: { ...publishedDocument, blocks: [{ ...publishedDocument.blocks[0], props: { text: headline, level: 'h2' } }] },
      summary: `Version ${versionNumber}`,
      createdAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    },
  };
}

async function stubPublished(page: Page) {
  await page.route('**/api/builder/pages/classes', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        page: {
          pageKey: 'classes',
          versionId: '11111111-1111-4111-8111-111111111111',
          versionNumber: 2,
          status: 'published',
          document: publishedDocument,
          summary: 'Browser probe',
          createdAt: new Date().toISOString(),
          publishedAt: new Date().toISOString(),
        },
      }),
    });
  });
}

test('published builder blocks render inside the real Classes page', async ({ page }) => {
  await stubPublished(page);
  await page.goto('/#classes', { waitUntil: 'domcontentloaded' });

  const region = page.locator('[data-builder-page="classes"]');
  await expect(region).toBeVisible({ timeout: 30_000 });
  await expect(region).toContainText('Builder browser probe');
  await expect(region).toContainText('Published without an app deploy.');

  // The functional module experience must still be mounted around the region.
  const section = page.locator('section[aria-label="classes section"]');
  await expect(section).toBeVisible();
  await expect(section.locator('text=Builder browser probe')).toHaveCount(1);
});

test('Movies stays discovery-only even when a booking widget is published', async ({ page }) => {
  await page.route('**/api/builder/pages/movies', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        page: {
          pageKey: 'movies',
          versionId: '22222222-2222-4222-8222-222222222222',
          versionNumber: 2,
          status: 'published',
          document: {
            ...publishedDocument,
            pageKey: 'movies',
            module: 'movies',
            blocks: [
              { id: 'heading_movies_probe', type: 'heading', visible: true, props: { text: 'Movies discovery heading' }, style: {}, children: [] },
              { id: 'booking_movies_probe', type: 'booking_widget', visible: true, props: { module: 'movies', mode: 'enquiry' }, style: {}, children: [] },
              { id: 'inventory_movies_probe', type: 'inventory_widget', visible: true, props: { module: 'movies', unitLabel: 'seats' }, style: {}, children: [] },
              { id: 'button_movies_probe', type: 'button', visible: true, props: { label: 'Buy movie tickets', action: 'open_booking' }, style: {}, children: [] },
              { id: 'hero_movies_probe', type: 'hero', visible: true, props: { headline: 'Reserve seats', ctaLabel: 'Book now', ctaAction: 'open_booking' }, style: {}, children: [] },
              { id: 'calendar_movies_probe', type: 'calendar', visible: true, props: { title: 'Showtimes' }, style: {}, children: [] },
              { id: 'form_movies_probe', type: 'form', visible: true, props: { title: 'Ticket order' }, style: {}, children: [] },
            ],
          },
          summary: 'Movies probe',
          createdAt: new Date().toISOString(),
          publishedAt: new Date().toISOString(),
        },
      }),
    });
  });
  await page.goto('/#movies', { waitUntil: 'domcontentloaded' });
  const region = page.locator('[data-builder-page="movies"]');
  await expect(region).toBeVisible({ timeout: 30_000 });
  await expect(region).toContainText('Movies discovery heading');
  await expect(region).not.toContainText('Check availability and book');
  await expect(region).not.toContainText('Live availability is shown');
  await expect(region).not.toContainText('Buy movie tickets');
  await expect(region).not.toContainText('Reserve seats');
  await expect(region).not.toContainText('Showtimes');
  await expect(region).not.toContainText('Ticket order');
});

test('a failed published fetch with no cache leaves the original page unchanged', async ({ page }) => {
  await page.route('**/api/builder/pages/classes', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' });
  });
  await page.goto('/#classes', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.locator('section[aria-label="classes section"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-builder-page="classes"]')).toHaveCount(0);
});

test('a recent published cache is shown when the API returns a transient 503', async ({ page }) => {
  const cached = pageResult(7, 'Recent offline page').page;
  await page.addInitScript((pageRecord) => {
    localStorage.setItem('bos_builder_page_v1:classes', JSON.stringify({ page: pageRecord, cachedAt: Date.now() }));
  }, cached);
  await page.route('**/api/builder/pages/classes', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }));
  await page.goto('/#classes', { waitUntil: 'domcontentloaded' });
  const region = page.locator('[data-builder-page="classes"]');
  await expect(region).toContainText('Recent offline page', { timeout: 30_000 });
  await expect(region).toHaveAttribute('data-builder-version', '7');
});

test('expired published cache is discarded and never shown on a cold offline start', async ({ page }) => {
  const expired = pageResult(3, 'Expired page').page;
  await page.addInitScript((pageRecord) => {
    localStorage.setItem('bos_builder_page_v1:classes', JSON.stringify({ page: pageRecord, cachedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }));
  }, expired);
  await page.route('**/api/builder/pages/classes', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }));
  await page.goto('/#classes', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('section[aria-label="classes section"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-builder-page="classes"]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('bos_builder_page_v1:classes'))).toBeNull();
});

test('cached customer page survives offline fetch and synchronizes after reconnect', async ({ page, context }) => {
  let current = pageResult(2, 'Published before disconnect');
  await page.route('**/api/builder/pages/classes', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { etag: `W/\"builder-${current.page.versionNumber}\"` }, body: JSON.stringify(current) });
  });
  await page.goto('/#classes', { waitUntil: 'domcontentloaded' });
  const region = page.locator('[data-builder-page="classes"]');
  await expect(region).toContainText('Published before disconnect', { timeout: 30_000 });

  await context.setOffline(true);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(region).toContainText('Published before disconnect');

  await context.setOffline(false);
  current = pageResult(3, 'Synchronized after reconnect');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(region).toContainText('Synchronized after reconnect', { timeout: 30_000 });
  await expect(region).toHaveAttribute('data-builder-version', '3');
});

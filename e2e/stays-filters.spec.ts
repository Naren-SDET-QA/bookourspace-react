import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  STAY,
  USERS,
  sessionToken,
  startStaysHarness,
  type StaysHarness,
} from './stays-e2e-harness';

/**
 * Hotels & Stays — filters, persistence and detail journey.
 *
 * Real browser → real Express → disposable PostgreSQL. Every assertion reads
 * rows the harness created, so a decorative filter fails the test.
 */

let harness: StaysHarness;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  harness = await startStaysHarness();
});

test.afterAll(async () => {
  await harness?.stop();
});

function isoPlus(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function openApp(browser: Browser, viewport?: { width: number; height: number }): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext(viewport ? { viewport } : undefined);
  await context.addInitScript(([token]) => {
    try { window.localStorage.setItem('bos_session_token_v1', String(token)); } catch { /* ignore */ }
  }, [sessionToken(USERS.customerA)]);
  const page = await context.newPage();
  await page.route('**/*', async (route) => {
    try {
      const target = new URL(route.request().url());
      if (target.origin === harness.uiUrl) {
        if (target.pathname.startsWith('/api/')) {
          // Bound the proxy: an upstream that never answers would otherwise
          // hang this handler, which close() waits on via unrouteAll.
          let proxyTimer: ReturnType<typeof setTimeout> | undefined;
          const upstream = await Promise.race([
            route.fetch({ url: `${harness.apiUrl}${target.pathname}${target.search}` }),
            new Promise<never>((_resolve, reject) => {
              proxyTimer = setTimeout(
                () => reject(Object.assign(new Error('API_PROXY_TIMEOUT'), { code: 'API_PROXY_TIMEOUT' })),
                30_000,
              );
            }),
          ]).finally(() => { if (proxyTimer) clearTimeout(proxyTimer); });
          await route.fulfill({ response: upstream });
        } else {
          await route.continue();
        }
        return;
      }
      await route.abort('blockedbyclient');
    } catch (error) {
    if ((error as { code?: string })?.code === 'API_PROXY_TIMEOUT') {
      await route.abort('timedout').catch(() => undefined);
      return;
    }
      // Navigation can close a context with a request in flight.
    }
  });
  return { page, context };
}

async function openStays(page: Page) {
  await page.goto(`${harness.uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('button[aria-label^="View "]').first()).toBeVisible({ timeout: 30_000 });
}

function card(page: Page, title: string) {
  return page.locator(`button[aria-label="View ${title}"]`).first();
}

async function expectTotal(page: Page, total: number) {
  // The heading wording is "N stays" in the current UI; older builds said
  // "N verified stays". Accept both while still asserting the exact count.
  await expect(page.getByText(new RegExp(`^${total} (?:verified )?stays?`)).first()).toBeVisible({ timeout: 20_000 });
}

async function openFilters(page: Page) {
  await page.getByRole('button', { name: /^Filters/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Filters' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function applyFilters(page: Page, dialog: ReturnType<Page['getByRole']>) {
  const show = dialog.getByRole('button', { name: /^Show \d+ stay/ });
  await expect(show).toBeEnabled({ timeout: 20_000 });
  await show.click();
  await expect(dialog).toBeHidden();
}

test('renders only the five verified stays and never sample listings', async ({ browser }) => {
  const { page, context } = await openApp(browser);
  try {
    await openStays(page);
    await expectTotal(page, 5);
    await expect(page.locator('button[aria-label^="View "]')).toHaveCount(5);
    await expect(page.locator('body')).not.toContainText('Sample listing');
    await expect(page.locator('body')).not.toContainText('Sample preview');
  } finally {
    await context.close();
  }
});

test('a recommended amenity filter narrows the server result and its chip removes cleanly', async ({ browser }) => {
  const { page, context } = await openApp(browser);
  try {
    await openStays(page);
    const dialog = await openFilters(page);
    await dialog.getByRole('button', { name: 'Pets allowed', exact: true }).click();
    await expect(dialog.getByRole('button', { name: /^Show 2 stays/ })).toBeEnabled({ timeout: 20_000 });
    await applyFilters(page, dialog);
    await expectTotal(page, 2);
    await expect(card(page, 'E2E Palm Pool Villa')).toBeVisible();
    await expect(page.getByLabel('Selected filters')).toContainText('Pets allowed');

    await page.getByRole('button', { name: 'Remove filter Pets allowed' }).click();
    await expectTotal(page, 5);
    await expect(page.getByLabel('Selected filters')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('place type, property type and price range combine correctly', async ({ browser }) => {
  const { page, context } = await openApp(browser);
  try {
    await openStays(page);
    let dialog = await openFilters(page);
    await dialog.getByRole('button', { name: 'Place type', exact: true }).click();
    await dialog.getByRole('button', { name: /^Entire home/ }).click();
    await expect(dialog.getByRole('button', { name: /^Show 3 stays/ })).toBeEnabled({ timeout: 20_000 });
    await applyFilters(page, dialog);

    dialog = await openFilters(page);
    await dialog.getByRole('button', { name: 'Property type', exact: true }).click();
    await dialog.getByRole('button', { name: 'Villa', exact: true }).click();
    await expect(dialog.getByRole('button', { name: /^Show 1 stay/ })).toBeEnabled({ timeout: 20_000 });
    await applyFilters(page, dialog);
    await expectTotal(page, 1);
    await expect(card(page, 'E2E Palm Pool Villa')).toBeVisible();

    dialog = await openFilters(page);
    await dialog.getByRole('button', { name: 'Price', exact: true }).click();
    await dialog.getByLabel('Minimum').fill('35000');
    await dialog.getByLabel('Maximum').fill('20000');
    await expect(dialog.getByRole('alert')).toContainText('minimum price cannot exceed');
    await dialog.getByLabel('Minimum').fill('0');
    await expect(dialog.getByRole('button', { name: /^Show 1 stay/ })).toBeEnabled({ timeout: 20_000 });
    await applyFilters(page, dialog);
    await expectTotal(page, 1);
    await expect(page.getByLabel('Selected filters')).toContainText('₹0 – ₹20000');
  } finally {
    await context.close();
  }
});

test('accessibility and host-language filters are backed by published attributes', async ({ browser }) => {
  const { page, context } = await openApp(browser);
  try {
    await openStays(page);
    let dialog = await openFilters(page);
    await dialog.getByRole('button', { name: 'Accessibility', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Shower chair' }).check();
    await expect(dialog.getByRole('button', { name: /^Show 1 stay/ })).toBeEnabled({ timeout: 20_000 });
    await applyFilters(page, dialog);
    await expectTotal(page, 1);
    await expect(card(page, 'E2E Coorg Coffee Homestay')).toBeVisible();
    await page.getByRole('button', { name: 'Remove filter Shower chair' }).click();
    await expectTotal(page, 5);

    dialog = await openFilters(page);
    await dialog.getByRole('button', { name: 'Host language', exact: true }).click();
    await dialog.getByRole('button', { name: /^Show all \d+ languages/ }).click();
    await dialog.getByRole('button', { name: 'French', exact: true }).click();
    await expect(dialog.getByRole('button', { name: /^Show 1 stay/ })).toBeEnabled({ timeout: 20_000 });
    await applyFilters(page, dialog);
    await expectTotal(page, 1);
    await expect(card(page, 'E2E Palm Pool Villa')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('search by dates excludes a fully booked stay and reports the real count', async ({ browser }) => {
  const { page, context } = await openApp(browser);
  try {
    await openStays(page);
    const form = page.locator('form[role="search"]:visible').first();
    const checkIn = isoPlus(31);
    const checkOut = isoPlus(33);
    await form.getByLabel('Check-in date').fill(checkIn);
    await form.getByLabel('Check-out date').fill(checkOut);
    const searchResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/stays/search'
        && url.searchParams.get('checkIn') === checkIn
        && url.searchParams.get('checkOut') === checkOut;
    });
    await form.getByRole('button', { name: 'Search' }).click();
    const response = await searchResponse;
    const responseBody = await response.json();
    const safeQuery = [...new URL(response.url()).searchParams.entries()];
    const safeSearchLog = harness.apiOutput().split('\n').filter((line) => line.includes('[stay-search]'));
    expect(response.status(), JSON.stringify({ status: response.status(), query: safeQuery, error: responseBody.error, message: responseBody.message, safeSearchLog })).toBe(200);
    expect(responseBody.total).toBe(4);
    await expectTotal(page, 4);
    await expect(card(page, 'E2E Bandra Sea View Flat')).toHaveCount(0);
    await expect(card(page, 'E2E Palm Pool Villa')).toBeVisible();

    await form.getByLabel('Check-in date').fill(isoPlus(41));
    await form.getByLabel('Check-out date').fill(isoPlus(43));
    await form.getByRole('button', { name: 'Search' }).click();
    await expectTotal(page, 5);
    await expect(card(page, 'E2E Bandra Sea View Flat')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('PostgreSQL date and guest search keeps typed parameters and applies availability', async () => {
  const checkIn = isoPlus(31);
  const checkOut = isoPlus(33);
  const dated = new URLSearchParams({ checkIn, checkOut, guests: '2' });
  const available = await fetch(`${harness.apiUrl}/api/stays/search?${dated}`);
  const availableBody = await available.json();

  expect(available.status).toBe(200);
  expect(availableBody.source).toBe('postgresql');
  expect(availableBody.total).toBe(4);
  expect(availableBody.items.some((item: { listingId: string }) => item.listingId === 'stay-e2e-flat-1')).toBe(false);
  expect(availableBody.items.every((item: { availableUnits: number | null }) => Number(item.availableUnits) > 0)).toBe(true);

  const tooManyGuests = await fetch(`${harness.apiUrl}/api/stays/search?${new URLSearchParams({ checkIn, checkOut, guests: '9' })}`);
  const tooManyGuestsBody = await tooManyGuests.json();
  expect(tooManyGuests.status).toBe(200);
  expect(tooManyGuestsBody.items).toHaveLength(0);

  const invalidGuests = await fetch(`${harness.apiUrl}/api/stays/search?${new URLSearchParams({ checkIn, checkOut, guests: '0' })}`);
  expect(invalidGuests.status).toBe(400);
  expect((await invalidGuests.json()).error).toBe('INVALID_GUESTS');

  const invalidDateRange = await fetch(`${harness.apiUrl}/api/stays/search?${new URLSearchParams({ checkIn, checkOut: checkIn, guests: '2' })}`);
  expect(invalidDateRange.status).toBe(400);
  expect((await invalidDateRange.json()).error).toBe('INVALID_DATE_ORDER');
});

test('published stays are discoverable while draft and demo rows stay hidden', async () => {
  const url = `${harness.apiUrl}/api/stays/search?listingIds=${encodeURIComponent(STAY.listingId)}`;
  const published = await fetch(url);
  expect(published.status).toBe(200);
  expect((await published.json()).items.map((item: { listingId: string }) => item.listingId)).toEqual([STAY.listingId]);

  try {
    // This is an isolated PostgreSQL fixture mutation; the public API itself
    // continues to execute under the anon role and its normal visibility SQL.
    await harness.query(
      `update public.listings
          set status = 'pending_approval',
              payload = coalesce(payload, '{}'::jsonb) || '{"stayLifecycle":"draft"}'::jsonb
        where id = $1
          and set_config('bos.stay_lifecycle_transition', 'on', true) = 'on'`,
      [STAY.listingId],
    );
    const draft = await fetch(url);
    expect(draft.status).toBe(200);
    expect((await draft.json()).items).toHaveLength(0);

    await harness.approveTestListings();
    await harness.query(
      `update public.listings
          set payload = coalesce(payload, '{}'::jsonb) || '{"demo":true,"stayLifecycle":"approved"}'::jsonb
        where id = $1
          and set_config('bos.stay_lifecycle_transition', 'on', true) = 'on'`,
      [STAY.listingId],
    );
    const demo = await fetch(url);
    expect(demo.status).toBe(200);
    expect((await demo.json()).items).toHaveLength(0);
  } finally {
    await harness.approveTestListings();
    await harness.query(
      `update public.listings
          set payload = (coalesce(payload, '{}'::jsonb) - 'demo') || '{"stayLifecycle":"approved"}'::jsonb
        where id = $1
          and set_config('bos.stay_lifecycle_transition', 'on', true) = 'on'`,
      [STAY.listingId],
    );
  }
});

test('filters persist across navigation and survive a reload', async ({ browser }) => {
  const { page, context } = await openApp(browser);
  try {
    await openStays(page);
    const dialog = await openFilters(page);
    await dialog.getByRole('button', { name: 'Pets allowed', exact: true }).click();
    await applyFilters(page, dialog);
    await expectTotal(page, 2);

    await page.evaluate(() => { window.location.hash = '#pg'; });
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.location.hash = '#stays/airbnb'; });
    await expect(card(page, 'E2E Palm Pool Villa')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Selected filters')).toContainText('Pets allowed');
    await expectTotal(page, 2);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(card(page, 'E2E Palm Pool Villa')).toBeVisible({ timeout: 30_000 });
    await expectTotal(page, 2);
    await expect(page.getByLabel('Selected filters')).toContainText('Pets allowed');
  } finally {
    await context.close();
  }
});

test('an impossible destination shows the empty state and reset restores results', async ({ browser }) => {
  const { page, context } = await openApp(browser);
  try {
    await openStays(page);
    const destination = page.locator('input[aria-label="Destination"]:visible').first();
    await destination.fill('Atlantis', { force: true });
    const form = destination.locator('xpath=ancestor::form');
    await form.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No exact matches')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expectTotal(page, 5);
    await expect(card(page, STAY.title)).toBeVisible();
  } finally {
    // A rapid filter change can leave an aborted proxied request in flight in
    // Chromium; do not let cleanup hang the assertion result.
    await Promise.race([
      context.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1_500)),
    ]);
  }
});

test('detail shows verified reviews, real availability and server-computed taxes', async ({ browser }) => {
  const { page, context } = await openApp(browser);
  try {
    await openStays(page);
    await card(page, STAY.title).click();
    const detail = page.getByRole('dialog', { name: STAY.title });
    await expect(detail).toContainText('Verified stay.');
    await expect(detail).toContainText('Reviewer One');
    await expect(detail).toContainText('2 reviews');
    await expect(detail).toContainText('What this place offers');

    const dateInputs = detail.locator('input[type="date"]');
    await dateInputs.nth(0).fill(isoPlus(40));
    await dateInputs.nth(1).fill(isoPlus(42));
    await expect(detail).toContainText(/Taxes \(12%\)/i, { timeout: 20_000 });
    await expect(detail).toContainText(/Total\s*₹[\d,]+/i);
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden();
    await page.getByRole('button', { name: /^Remove filter \d{4}-\d{2}-\d{2} → / }).click();
    await expectTotal(page, 5);

    await card(page, 'E2E Bandra Sea View Flat').click();
    const flat = page.getByRole('dialog', { name: 'E2E Bandra Sea View Flat' });
    await expect(flat).toContainText('Availability');
    const target = new Date();
    target.setDate(target.getDate() + 32);
    const today = new Date();
    const monthDiff = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
    for (let index = 0; index < monthDiff; index += 1) {
      await flat.getByRole('button', { name: 'Next month' }).click();
    }
    await expect(flat.locator('button[aria-label$="unavailable"]').first()).toBeDisabled({ timeout: 20_000 });
  } finally {
    await context.close();
  }
});

test('list and map views both work and the map only plots published coordinates', async ({ browser }) => {
  const { page, context } = await openApp(browser);
  try {
    await openStays(page);
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(5);
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await expectTotal(page, 5);
  } finally {
    await context.close();
  }
});

test('mobile filter drawer and detail fit a 390px viewport without overflow', async ({ browser }) => {
  const { page, context } = await openApp(browser, { width: 390, height: 844 });
  try {
    await openStays(page);
    const dialog = await openFilters(page);
    const box = await dialog.boundingBox();
    expect(box?.width || 0).toBeLessThanOrEqual(390);
    await dialog.getByRole('button', { name: 'Close filters' }).click();
    await card(page, STAY.title).click();
    await expect(page.getByRole('dialog').first()).toContainText('Verified stay.');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  } finally {
    await context.close();
  }
});

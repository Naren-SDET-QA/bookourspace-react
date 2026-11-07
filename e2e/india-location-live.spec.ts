import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const MODULES = ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies'] as const;

async function openPicker(page: Page) {
  const header = page.getByTestId('universal-marketplace-header');
  await expect(header).toBeVisible();
  const trigger = header.getByRole('button', { name: 'Select city or locality' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Select your location' });
  if (!(await dialog.isVisible().catch(() => false))) {
    await trigger.click();
  }
  await expect(dialog).toBeVisible();
  return dialog;
}

async function typeInPicker(page: Page, query: string) {
  const dialog = page.getByRole('dialog', { name: 'Select your location' });
  if (!(await dialog.isVisible().catch(() => false))) await openPicker(page);
  const input = page.getByRole('dialog', { name: 'Select your location' }).getByLabel('Search city, area, PIN or village');
  await expect(input).toBeVisible();
  await input.evaluate((node, value) => {
    const element = node as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  return input;
}

async function searchInPicker(page: Page, _dialog: Locator, query: string, expected: RegExp | string) {
  const started = Date.now();
  await typeInPicker(page, query);
  const dialog = page.getByRole('dialog', { name: 'Select your location' });
  await expect(dialog.getByText(expected).first()).toBeVisible({ timeout: 12_000 });
  return Date.now() - started;
}

async function searchApi(request: APIRequestContext, query: string) {
  const started = Date.now();
  const response = await request.get(`/api/locations/search?q=${encodeURIComponent(query)}`);
  const body = await response.json();
  return {
    ok: response.ok(),
    cache: response.headers()['x-location-cache'] || '',
    ms: Date.now() - started,
    locations: Array.isArray(body?.locations) ? body.locations : [],
  };
}

test('cold Guest Home exposes search and all six modules in under 3 seconds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/main.tsx', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  const started = Date.now();
  const response = await page.goto('/', { waitUntil: 'commit' });
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(() => (window as any).__bosEntryActionsReady === true);
  await page.getByTestId('entry-continue-guest').click();
  const quickHome = page.locator('#bos-quick-home-shell');
  await expect(quickHome).toBeVisible();
  await expect(quickHome.getByRole('searchbox')).toBeVisible();
  await expect(quickHome.getByRole('navigation', { name: 'Marketplace modules' }).getByRole('button')).toHaveCount(6);
  expect(Date.now() - started).toBeLessThan(3000);
});

test('location API bounds suggestions, returns catalog hits and caches catalog queries', async ({ request }) => {
  const city = await searchApi(request, 'Hyderabad');
  expect(city.ok).toBeTruthy();
  expect(city.ms).toBeLessThan(3000);
  expect(city.locations.some((row: { name?: string }) => /hyderabad/i.test(String(row.name)))).toBeTruthy();
  expect(city.locations.length).toBeLessThanOrEqual(10);

  const cached = await searchApi(request, 'Hyderabad');
  expect(cached.cache).toBe('HIT');
  expect(cached.ms).toBeLessThan(500);

  const village = await searchApi(request, 'Ali Samunder');
  expect(village.ms).toBeLessThan(3000);
  expect(village.locations.some((row: { name?: string; kind?: string; type?: string }) => (
    /ali samunder/i.test(String(row.name)) && /village/i.test(String(row.kind || row.type || ''))
  ))).toBeTruthy();

  const mandal = await searchApi(request, 'Amberpet');
  expect(mandal.ms).toBeLessThan(3000);
  expect(mandal.locations.some((row: { name?: string; kind?: string; type?: string }) => (
    /amberpet/i.test(String(row.name)) && /mandal|village/i.test(String(row.kind || row.type || ''))
  ))).toBeTruthy();

  const area = await searchApi(request, 'Madhapur');
  expect(area.ms).toBeLessThan(3000);
  expect(area.locations.some((row: { name?: string }) => /madhapur/i.test(String(row.name)))).toBeTruthy();

  const pin = await searchApi(request, '500081');
  expect(pin.ms).toBeLessThan(3000);
  expect(pin.locations.some((row: { name?: string; pincode?: string }) => (
    /hyderabad/i.test(String(row.name)) || String(row.pincode || '').startsWith('500')
  ))).toBeTruthy();

  const misspell = await searchApi(request, 'Hydrabad');
  expect(misspell.ms).toBeLessThan(3000);
  expect(misspell.locations[0]?.name).toMatch(/hyderabad/i);

  const empty = await searchApi(request, 'zzzznotacity999');
  expect(empty.ms).toBeLessThan(3000);
  const invented = empty.locations.filter((row: { source?: string; name?: string }) => (
    row.source !== 'geocode' && /hyderabad|mumbai|bengaluru|delhi/i.test(String(row.name))
  ));
  expect(invented).toEqual([]);

  const otherMiss = await searchApi(request, 'yyyyalsomissing888');
  expect(otherMiss.ms).toBeLessThan(1500);
});

test('live directory search covers city, village, mandal, area, PIN, misspelling and empty', async ({ page }) => {
  const searchMs: Record<string, number> = {};
  page.on('response', (response) => {
    if (!response.url().includes('/api/locations/search?')) return;
    const query = new URL(response.url()).searchParams.get('q') || '';
    const started = response.headers()['x-location-cache'] || 'MISS';
    searchMs[`${query}:${started}`] = Date.now();
  });

  await page.goto('/');
  const dialog = await openPicker(page);

  const latencies: Record<string, number> = {};
  latencies.Hyderabad = await searchInPicker(page, dialog, 'Hyderabad', /Hyderabad/);
  latencies['Ali Samunder'] = await searchInPicker(page, dialog, 'Ali Samunder', /Ali Samunder/);
  latencies.Amberpet = await searchInPicker(page, dialog, 'Amberpet', /Amberpet/);
  latencies.Madhapur = await searchInPicker(page, dialog, 'Madhapur', /Madhapur/);
  latencies['500081'] = await searchInPicker(page, dialog, '500081', /PIN 500/);
  latencies.Hydrabad = await searchInPicker(page, dialog, 'Hydrabad', /Hyderabad/);

  const emptyStarted = Date.now();
  await typeInPicker(page, 'zzzznotacity999');
  const liveDialog = page.getByRole('dialog', { name: 'Select your location' });
  await expect(liveDialog.getByText('Searching India locations…')).toHaveCount(0, { timeout: 12_000 });
  await expect(liveDialog.getByText('No location found')).toBeVisible({ timeout: 12_000 });
  latencies.empty = Date.now() - emptyStarted;

  for (const [query, ms] of Object.entries(latencies)) {
    expect(ms, `${query} picker latency`).toBeLessThan(3000);
  }
  expect(Object.keys(searchMs).length).toBeGreaterThan(0);
});

test('selecting Hyderabad keeps the same real city across all six modules', async ({ page }) => {
  await page.goto('/');
  const dialog = await openPicker(page);
  await typeInPicker(page, 'Hyderabad');
  await page.getByRole('dialog', { name: 'Select your location' }).getByRole('button', { name: /Hyderabad/ }).first().click();
  await expect(dialog).toHaveCount(0);

  const header = page.getByTestId('universal-marketplace-header');
  await expect(header.getByRole('button', { name: 'Select city or locality' })).toContainText(/Hyderabad/);

  for (const section of MODULES) {
    const tab = header.getByTestId(`market-section-${section}`);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
    await expect(header.getByRole('button', { name: 'Select city or locality' })).toContainText(/Hyderabad/);
  }
});

test('an unmatched village does not invent listings in other cities', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bos_selected_location', JSON.stringify({
      city: 'Hydalu',
      area: 'Hydalu',
      state: 'Telangana',
      district: 'Hyderabad',
      kind: 'village',
      label: 'Hydalu, Telangana',
    }));
  });
  await page.goto('/');
  const header = page.getByTestId('universal-marketplace-header');
  await expect(header.getByRole('button', { name: 'Select city or locality' })).toContainText(/Hydalu/);
  const listingCities = await page.locator('[data-listing-city]').evaluateAll((nodes) => (
    nodes.map((node) => (node.getAttribute('data-listing-city') || '').trim()).filter(Boolean)
  ));
  expect(listingCities.every((city) => /hydalu/i.test(city))).toBeTruthy();
  expect(listingCities.some((city) => /mumbai|bengaluru|delhi|chennai/i.test(city))).toBeFalsy();
});

test('mobile picker stays on-screen while a district page loads', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const dialog = await openPicker(page);
  const telangana = dialog.getByRole('button', { name: /Telangana/ });
  if (await telangana.count()) {
    await telangana.first().click();
    const hyderabad = dialog.getByRole('button', { name: /Hyderabad/ });
    if (await hyderabad.count()) await hyderabad.first().click();
  } else {
    await searchInPicker(page, dialog, 'Madhapur', /Madhapur/);
  }
  await expect(dialog).toBeVisible();
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    dialog: document.querySelector('[role="dialog"]')!.scrollWidth - document.querySelector('[role="dialog"]')!.clientWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.dialog).toBeLessThanOrEqual(1);
});

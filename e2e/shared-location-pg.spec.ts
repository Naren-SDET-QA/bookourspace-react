import { expect, test } from '@playwright/test';

test('shared selected city reaches the PG Style 3 page', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bos_selected_location', JSON.stringify({
      state: 'Maharashtra',
      district: 'Mumbai Suburban',
      city: 'Mumbai',
      area: 'Andheri East',
      label: 'Mumbai, Mumbai Suburban',
    }));
  });

  await page.goto('/');
  const header = page.getByTestId('universal-marketplace-header');
  const sharedLocation = header.locator('button[aria-label="Select city or locality"]');
  await expect(sharedLocation).toContainText('Mumbai');
  for (const section of ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies']) {
    const tab = header.getByTestId(`market-section-${section}`);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
    await expect(sharedLocation).toContainText('Mumbai');
  }
  await header.getByTestId('market-section-pg_hostels').click();
  await page.evaluate(() => { window.location.hash = 'pg/style3'; });
  await expect(page.locator('article[aria-label^="PG listing"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(sharedLocation).toContainText('Mumbai');
});

test('India location picker ranks names, aliases and PIN across modules', async ({ page }) => {
  await page.route('**/api/locations/popular', (route) => route.fulfill({ json: { ok: true, locations: [] } }));
  await page.route('**/api/locations/states', (route) => route.fulfill({ json: { ok: true, states: [] } }));
  await page.route('**/api/locations/search?**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') || '';
    const locations = query.toLowerCase().includes('vizag')
      ? [{ id: 1, name: 'Visakhapatnam', state: 'Andhra Pradesh', district: 'Visakhapatnam', stateCode: 'AP', type: 'city', lat: 17.6868, lng: 83.2185, aliases: ['Vizag'], label: 'Visakhapatnam, Andhra Pradesh', source: 'directory' }]
      : query === '500081'
        ? [{ id: 2, name: 'Hyderabad', state: 'Telangana', district: 'Hyderabad', stateCode: 'TG', type: 'city', lat: 17.385, lng: 78.4867, aliases: [], label: 'Hyderabad, Telangana', source: 'directory' }]
        : [];
    await route.fulfill({ json: { ok: true, locations, nextOffset: null } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Select city or locality' }).click();
  const dialog = page.getByRole('dialog', { name: 'Select your location' });
  await expect(dialog).toBeVisible();
  const input = dialog.getByLabel('Search city, area, PIN or village');

  await input.evaluate((node, value) => {
    const element = node as HTMLInputElement;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, 'Vizag');
  await expect(dialog.getByText('Visakhapatnam').first()).toBeVisible({ timeout: 8_000 });

  await input.evaluate((node, value) => {
    const element = node as HTMLInputElement;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, '500081');
  await expect(dialog.getByText('Hyderabad').first()).toBeVisible({ timeout: 8_000 });
  await dialog.getByRole('button', { name: /Hyderabad/ }).first().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select city or locality' })).toContainText(/Hyderabad/);
});

test('mobile location picker stays bounded and loads a server page on demand', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/locations/popular', (route) => route.fulfill({ json: { ok: true, locations: [] } }));
  await page.route('**/api/locations/states', (route) => route.fulfill({ json: { ok: true, states: [] } }));
  await page.route('**/api/locations/search?**', (route) => route.fulfill({ json: {
    ok: true,
    locations: [{ id: 3, name: 'Madhapur', state: 'Telangana', district: 'Hyderabad', stateCode: 'TG', type: 'town', lat: 17.4483, lng: 78.3915, aliases: [], label: 'Madhapur, Hyderabad, Telangana', source: 'directory' }],
    nextOffset: null,
  } }));
  await page.goto('/');
  const header = page.getByTestId('universal-marketplace-header');
  const trigger = header.getByRole('button', { name: 'Select city or locality' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Select your location' });
  if (!(await dialog.isVisible().catch(() => false))) await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Search city, area, PIN or village').fill('Madhapur');
  await expect(dialog.getByText('Madhapur').first()).toBeVisible({ timeout: 8_000 });
  const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth - window.innerWidth, dialog: document.querySelector('[role="dialog"]')!.scrollWidth - document.querySelector('[role="dialog"]')!.clientWidth }));
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.dialog).toBeLessThanOrEqual(0);
});

test('external location selection stays ephemeral and shows Google Maps attribution', async ({ page }) => {
  await page.route('**/api/locations/popular', (route) => route.fulfill({ json: { ok: true, locations: [] } }));
  await page.route('**/api/locations/states', (route) => route.fulfill({ json: { ok: true, states: [] } }));
  await page.route('**/api/locations/search?**', (route) => route.fulfill({ json: { ok: true, locations: [], nextOffset: null } }));
  await page.route('**/api/locations/external/autocomplete', (route) => route.fulfill({ headers: { 'Cache-Control': 'no-store' }, json: {
    ok: true, provider: 'google_maps', places: [{ placeId: 'ChIJTestPlace_01', text: 'Rare Town, Telangana', mainText: 'Rare Town', secondaryText: 'Telangana' }],
  } }));
  await page.route('**/api/locations/external/resolve', (route) => route.fulfill({ headers: { 'Cache-Control': 'no-store' }, json: {
    ok: true, location: { city: 'Rare Town', area: 'Rare Town', state: 'Telangana', label: 'Rare Town, Telangana, India', lat: 17.4, lng: 78.4, placeId: 'ChIJTestPlace_01', source: 'external' },
  } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Select city or locality' }).click();
  const dialog = page.getByRole('dialog', { name: 'Select your location' });
  await dialog.getByLabel('Search city, area, PIN or village').fill('Rare Town');
  await expect(dialog.getByText('No location found')).toBeVisible();
  await dialog.getByRole('button', { name: 'Search beyond catalog with Google Maps' }).click();
  await expect(dialog.getByText('Google Maps', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /Rare Town/ }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('bos_selected_location'))).toBeNull();
});

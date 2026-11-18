import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT_DIR = path.join('e2e-artifacts', 'location-ui-style');

async function dismissPrivacy(page: Page, attempts = 12): Promise<void> {
  const essentialOnly = page.getByRole('button', { name: 'Essential only', exact: true });
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await essentialOnly.isVisible().catch(() => false)) {
      await essentialOnly.click();
      await expect(essentialOnly).toBeHidden();
      return;
    }
    await page.waitForTimeout(200);
  }
}

async function mockLocationApis(page: Page) {
  await page.route('**/api/locations/popular', (route) => route.fulfill({
    json: {
      ok: true,
      locations: [
        { id: 1, name: 'Hyderabad', state: 'Telangana', district: 'Hyderabad', stateCode: 'TG', type: 'city', lat: 17.385, lng: 78.4867, aliases: [], label: 'Hyderabad, Telangana', source: 'directory' },
        { id: 2, name: 'Mumbai', state: 'Maharashtra', district: 'Mumbai Suburban', stateCode: 'MH', type: 'city', lat: 19.076, lng: 72.8777, aliases: [], label: 'Mumbai, Maharashtra', source: 'directory' },
      ],
    },
  }));
  await page.route('**/api/locations/states', (route) => route.fulfill({ json: { ok: true, states: [] } }));
  await page.route('**/api/locations/search?**', async (route) => {
    const query = (new URL(route.request().url()).searchParams.get('q') || '').toLowerCase();
    const locations = query.includes('vizag')
      ? [{ id: 10, name: 'Visakhapatnam', state: 'Andhra Pradesh', district: 'Visakhapatnam', stateCode: 'AP', type: 'city', lat: 17.6868, lng: 83.2185, aliases: ['Vizag'], label: 'Visakhapatnam, Andhra Pradesh', source: 'directory' }]
      : query.includes('mumbai')
        ? [{ id: 2, name: 'Mumbai', state: 'Maharashtra', district: 'Mumbai Suburban', stateCode: 'MH', type: 'city', lat: 19.076, lng: 72.8777, aliases: [], label: 'Mumbai, Maharashtra', source: 'directory' }]
        : query.includes('hyder')
          ? [{ id: 1, name: 'Hyderabad', state: 'Telangana', district: 'Hyderabad', stateCode: 'TG', type: 'city', lat: 17.385, lng: 78.4867, aliases: [], label: 'Hyderabad, Telangana', source: 'directory' }]
          : [];
    await route.fulfill({ json: { ok: true, locations, nextOffset: null } });
  });
}

async function seedApprovedUi(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('bos_entry_choice_v1', 'guest');
    localStorage.setItem('bos_guest_login_enabled_v1', '1');
    localStorage.setItem('bos_section_styles_v2', JSON.stringify({
      pg: 'style3', stay: 'airbnb', services: 'old', classes: 'style4', venues: 'agenda', movies: 'experience',
    }));
    localStorage.setItem('bos_section_style_prefs_v1', JSON.stringify({
      services: 'triangle', classes: 'style4',
    }));
  });
}

async function openPicker(page: Page) {
  const trigger = page.getByRole('button', { name: 'Select city or locality' }).first();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Select your location' });
  if (!(await dialog.isVisible().catch(() => false))) await trigger.click();
  await expect(dialog).toBeVisible();
  return dialog;
}

async function searchAndChoose(page: Page, query: string, visible: string) {
  const dialog = await openPicker(page);
  const input = dialog.getByLabel('Search city, area, PIN or village');
  await input.evaluate((node, value) => {
    const element = node as HTMLInputElement;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await expect(dialog.getByText(visible).first()).toBeVisible({ timeout: 8_000 });
  await dialog.getByRole('button', { name: new RegExp(visible, 'i') }).first().click();
  await expect(dialog).toHaveCount(0);
}

async function assertServicesTriangle(page: Page) {
  await expect(page.locator('[aria-label="Services app"]')).toBeVisible();
  await expect(page.locator('[aria-label="services section"]')).toBeVisible();
  expect(page.url()).not.toMatch(/services\/(old|style1|noddyy|style3)/i);
}

async function assertClassesStyle4(page: Page) {
  await expect(page.locator('[data-bos-category-style="classes-style4"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Academic Education\b/ })).toBeVisible();
  expect(page.url()).toMatch(/#classes\/style4/i);
  expect(page.url()).not.toMatch(/classes\/(old|style1|style2|style3)(?:$|[/?])/i);
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

test.describe('location selection preserves approved UI', () => {
  test.describe.configure({ mode: 'serial' });

  test('select / change / clear / autocomplete keep Services Triangle', async ({ page }) => {
    await seedApprovedUi(page);
    await mockLocationApis(page);
    await page.goto('/#services', { waitUntil: 'domcontentloaded' });
    await dismissPrivacy(page);
    await expect(page.locator('[aria-label="Services app"]')).toBeVisible({ timeout: 30_000 });
    await shot(page, 'desktop-services-before-location');

    await searchAndChoose(page, 'Hyderabad', 'Hyderabad');
    await expect(page.getByRole('button', { name: 'Select city or locality' }).first()).toContainText(/Hyderabad/);
    await assertServicesTriangle(page);
    await shot(page, 'desktop-services-after-select');

    await searchAndChoose(page, 'Mumbai', 'Mumbai');
    await expect(page.getByRole('button', { name: 'Select city or locality' }).first()).toContainText(/Mumbai/);
    await assertServicesTriangle(page);

    await searchAndChoose(page, 'Vizag', 'Visakhapatnam');
    await expect(page.getByRole('button', { name: 'Select city or locality' }).first()).toContainText(/Visakhapatnam/);
    await assertServicesTriangle(page);

    const dialog = await openPicker(page);
    await dialog.getByRole('button', { name: 'Clear selected location' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Select city or locality' }).first()).toContainText(/All Cities/i);
    await assertServicesTriangle(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissPrivacy(page);
    await expect(page.locator('[aria-label="Services app"]')).toBeVisible({ timeout: 30_000 });
    await assertServicesTriangle(page);

    await page.goBack();
    await page.goForward();
    await assertServicesTriangle(page);
    expect(await page.evaluate(() => window.location.hash.toLowerCase())).toBe('#services');
  });

  test('select / refresh / history keep Classes Style 4', async ({ page }) => {
    await seedApprovedUi(page);
    await mockLocationApis(page);
    await page.goto('/#classes/style4', { waitUntil: 'domcontentloaded' });
    await dismissPrivacy(page);
    await expect(page.getByRole('button', { name: /^Academic Education\b/ })).toBeVisible({ timeout: 30_000 });
    await shot(page, 'desktop-classes-before-location');

    await searchAndChoose(page, 'Hyderabad', 'Hyderabad');
    await assertClassesStyle4(page);
    await shot(page, 'desktop-classes-after-select');

    await searchAndChoose(page, 'Mumbai', 'Mumbai');
    await assertClassesStyle4(page);

    const dialog = await openPicker(page);
    await dialog.getByRole('button', { name: 'Clear selected location' }).click();
    await assertClassesStyle4(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissPrivacy(page);
    await expect(page.getByRole('button', { name: /^Academic Education\b/ })).toBeVisible({ timeout: 30_000 });
    await assertClassesStyle4(page);

    await page.goBack();
    await page.goForward();
    await assertClassesStyle4(page);
  });

  test('mobile location updates keep Triangle and Style 4', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedApprovedUi(page);
    await mockLocationApis(page);

    await page.goto('/#services', { waitUntil: 'domcontentloaded' });
    await dismissPrivacy(page);
    await expect(page.locator('[aria-label="Services app"]')).toBeVisible({ timeout: 30_000 });
    await searchAndChoose(page, 'Hyderabad', 'Hyderabad');
    await assertServicesTriangle(page);
    await shot(page, 'mobile-services-after-select');

    await page.goto('/#classes/style4', { waitUntil: 'domcontentloaded' });
    await dismissPrivacy(page);
    await expect(page.getByRole('button', { name: /^Academic Education\b/ })).toBeVisible({ timeout: 30_000 });
    await searchAndChoose(page, 'Mumbai', 'Mumbai');
    await assertClassesStyle4(page);
    await shot(page, 'mobile-classes-after-select');
    expect(page.url()).not.toMatch(/#services\/old|#classes\/style3/i);
  });
});

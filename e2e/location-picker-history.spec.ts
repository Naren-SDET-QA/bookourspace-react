import { expect, test, type Page } from '@playwright/test';

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
    const locations = query.includes('mumbai')
      ? [{ id: 2, name: 'Mumbai', state: 'Maharashtra', district: 'Mumbai Suburban', stateCode: 'MH', type: 'city', lat: 19.076, lng: 72.8777, aliases: [], label: 'Mumbai, Maharashtra', source: 'directory' }]
      : [{ id: 1, name: 'Hyderabad', state: 'Telangana', district: 'Hyderabad', stateCode: 'TG', type: 'city', lat: 17.385, lng: 78.4867, aliases: [], label: 'Hyderabad, Telangana', source: 'directory' }];
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

function picker(page: Page) {
  return page.getByRole('dialog', { name: 'Select your location' });
}

async function openPicker(page: Page) {
  const trigger = page.getByRole('button', { name: 'Select city or locality' }).first();
  await trigger.click();
  const dialog = picker(page);
  if (!(await dialog.isVisible().catch(() => false))) await trigger.click();
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window.history.state as { bosLocationPicker?: boolean } | null)?.bosLocationPicker === true)).toBe(true);
  return dialog;
}

async function assertServicesTriangle(page: Page) {
  await expect(page.locator('[aria-label="Services app"]')).toBeVisible();
  await expect(page.locator('[aria-label="services section"]')).toBeVisible();
  expect(page.url()).toMatch(/#services(?:$|[/?])/i);
  expect(page.url()).not.toMatch(/services\/(old|style1|noddyy)/i);
}

async function assertClassesStyle4(page: Page) {
  await expect(page.locator('[data-bos-category-style="classes-style4"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Academic Education\b/ })).toBeVisible();
  expect(page.url()).toMatch(/#classes\/style4/i);
}

async function boot(page: Page, hash: string) {
  await seedApprovedUi(page);
  await mockLocationApis(page);
  await page.goto(hash, { waitUntil: 'domcontentloaded' });
  await dismissPrivacy(page);
}

test.describe('location picker history', () => {
  test('open → Back closes only the picker on Services Triangle', async ({ page }) => {
    await boot(page, '/#services');
    await expect(page.locator('[aria-label="Services app"]')).toBeVisible({ timeout: 30_000 });
    await openPicker(page);
    await page.goBack();
    await expect(picker(page)).toHaveCount(0);
    await assertServicesTriangle(page);
    expect(await page.evaluate(() => (window.history.state as { bosLocationPicker?: boolean } | null)?.bosLocationPicker === true)).toBe(false);
  });

  test('open → Back → Forward reopens the picker without changing Services', async ({ page }) => {
    await boot(page, '/#services');
    await expect(page.locator('[aria-label="Services app"]')).toBeVisible({ timeout: 30_000 });
    await openPicker(page);
    await page.goBack();
    await expect(picker(page)).toHaveCount(0);
    await page.goForward();
    await expect(picker(page)).toBeVisible();
    await assertServicesTriangle(page);
    expect(await page.evaluate(() => (window.history.state as { bosLocationPicker?: boolean } | null)?.bosLocationPicker === true)).toBe(true);
  });

  test('location selection → Back keeps Triangle and does not reopen the picker', async ({ page }) => {
    await boot(page, '/#services');
    await expect(page.locator('[aria-label="Services app"]')).toBeVisible({ timeout: 30_000 });
    // Keep a same-URL entry under the overlay so Back after select cannot
    // leave Services; production users who opened the picker from a prior
    // page similarly return to that page, not into the overlay.
    await page.evaluate(() => {
      const previous = window.history.state && typeof window.history.state === 'object'
        ? window.history.state as Record<string, unknown>
        : {};
      window.history.pushState({ ...previous, bosHistoryGuard: true }, '', `${window.location.pathname}${window.location.search}${window.location.hash}`);
    });
    const dialog = await openPicker(page);
    const input = dialog.getByLabel('Search city, area, PIN or village');
    await input.evaluate((node, value) => {
      const element = node as HTMLInputElement;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, 'Hyderabad');
    await expect(dialog.getByText('Hyderabad').first()).toBeVisible({ timeout: 8_000 });
    await dialog.getByRole('button', { name: /Hyderabad/i }).first().click();
    await expect(picker(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Select city or locality' }).first()).toContainText(/Hyderabad/);
    await assertServicesTriangle(page);

    await page.goBack();
    await expect(picker(page)).toHaveCount(0);
    await assertServicesTriangle(page);
    await expect(page.getByRole('button', { name: 'Select city or locality' }).first()).toContainText(/Hyderabad/);
  });

  test('repeated open/close cycles do not loop or leave Services', async ({ page }) => {
    await boot(page, '/#services');
    await expect(page.locator('[aria-label="Services app"]')).toBeVisible({ timeout: 30_000 });
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await openPicker(page);
      await picker(page).getByRole('button', { name: 'Close location selector' }).click();
      await expect(picker(page)).toHaveCount(0);
      await assertServicesTriangle(page);
    }
    await openPicker(page);
    await page.goBack();
    await expect(picker(page)).toHaveCount(0);
    await page.goForward();
    await expect(picker(page)).toBeVisible();
    await page.goBack();
    await assertServicesTriangle(page);
  });

  test('mobile Back closes the picker on Classes Style 4', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '/#classes/style4');
    await expect(page.getByRole('button', { name: /^Academic Education\b/ })).toBeVisible({ timeout: 30_000 });
    await openPicker(page);
    await page.goBack();
    await expect(picker(page)).toHaveCount(0);
    await assertClassesStyle4(page);
    await page.goForward();
    await expect(picker(page)).toBeVisible();
    await assertClassesStyle4(page);
  });
});

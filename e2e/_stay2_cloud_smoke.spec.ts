import { expect, test } from '@playwright/test';

test.describe('Stay 2 local cloud wiring smoke', () => {
  test.skip(process.env.E2E_STAY2_SMOKE !== '1', 'points at the local 5173 stays-dev catalog, not the isolated harness');
  test('Stay 2 surface renders fixtures and the booking dialog, Stay 1 remains at #stays/old', async ({ page }) => {
    // The shipped default stay style is style 1; select the Stay 2 surface the
    // same way the style switcher persists it, then exercise it end to end.
    await page.addInitScript(() => {
      window.localStorage.setItem('bos_entry_choice_v1', 'guest');
      window.localStorage.setItem('bos_section_style_prefs_v1', JSON.stringify({ stay: 'airbnb' }));
    });
    await page.goto('/#stays');
    await expect(page.locator('body')).toContainText(/Available stays in India/i, { timeout: 30_000 });
    await expect(page.locator('body')).toContainText(/Local fixture listings/i);
    await expect(page.getByRole('button', { name: /Stay 1/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Wishlists/i }).first()).toBeVisible();
    await expect(page.getByText('Sample', { exact: true }).first()).toBeVisible();

    const who = page.getByRole('button', { name: /^Who/i }).first();
    if (await who.count()) {
      await who.click();
      await expect(page.getByText(/Adults/i).first()).toBeVisible();
      await page.keyboard.press('Escape');
    }

    const mapBtn = page.getByRole('button', { name: /Show map/i }).first();
    if (await mapBtn.count()) {
      await mapBtn.click();
      await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 15_000 });
      const listBtn = page.getByRole('button', { name: /Show list/i }).first();
      if (await listBtn.count()) await listBtn.click();
    }

    const heart = page.locator('button[aria-label*="Save"], button[aria-label*="saved"]').first();
    if (await heart.count()) await heart.click();
    await page.getByRole('button', { name: /Wishlists/i }).first().click();
    await expect(page.locator('body')).toContainText(/Wishlists|Guest saves stay on this device only|Save stays you like/i);
    const closeWish = page.getByRole('button', { name: /Close wishlists/i });
    if (await closeWish.count()) await closeWish.click();

    const card = page.locator('button[aria-label^="View "]').first();
    await card.click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const dateInputs = dialog.locator('input[type="date"]');
    const start = new Date();
    start.setDate(start.getDate() + 21);
    const end = new Date();
    end.setDate(end.getDate() + 23);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    await dateInputs.nth(0).fill(iso(start));
    await dateInputs.nth(1).fill(iso(end));
    // Fixture inventory must be labelled and may allow date/price exploration,
    // but sample inventory must never become reserveable or reach checkout.
    await expect(dialog).toContainText(/Sample data/i);
    const sampleOnly = dialog.getByRole('button', { name: /Sample listing — not bookable/i });
    const signIn = dialog.getByRole('button', { name: /Sign in to book/i });
    const availabilityCta = dialog.getByRole('button', { name: /^(Reserve|Check availability)$/i }).first();
    await expect(sampleOnly.or(signIn).or(availabilityCta)).toBeVisible();
    if (await sampleOnly.isVisible().catch(() => false)) {
      await expect(sampleOnly).toBeDisabled();
      await expect(dialog).toContainText(/cannot be reserved or paid for/i);
      // No reserve/check-availability control may compete with the disabled CTA.
      await expect(availabilityCta).toHaveCount(0);
    } else if (await signIn.isVisible().catch(() => false)) {
      await expect(dialog).toContainText(/You won’t be charged yet/i);
    } else {
      await expect(availabilityCta).toBeEnabled();
      // Live inventory: checkout stays server-confirmed.
      await expect(dialog).toContainText(/server confirms a room/i);
    }
    // Nothing on this surface may capture card details.
    await expect(
      dialog.locator('input[autocomplete="cc-number"], input[autocomplete="cc-exp"], input[name*="card" i]'),
    ).toHaveCount(0);

    await page.goto('/#stays/old');
    await expect(page.locator('body')).toContainText(/Hotels|Stay/i, { timeout: 20_000 });
  });

  test('sample stay inventory cannot be reserved or paid for', async ({ page, request }) => {
    // Force one listing into the non-bookable sample shape so this branch is
    // exercised deterministically: the live catalog serves demo inventory as
    // bookable, which would otherwise never reach the disabled CTA below.
    const apiRes = await request.get('/api/stays/search?page=0&pageSize=1');
    const apiJson = await apiRes.json();
    const sampleItem = { ...apiJson.items[0], demo: true, demoBookable: false };
    await page.route('**/api/stays/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...apiJson,
          page: 0,
          pageSize: 20,
          total: 1,
          hasMore: false,
          fixtures: true,
          liveInventory: false,
          items: [sampleItem],
        }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('bos_entry_choice_v1', 'guest');
      window.localStorage.setItem('bos_section_style_prefs_v1', JSON.stringify({ stay: 'airbnb' }));
    });
    await page.goto('/#stays');
    await expect(page.locator('body')).toContainText(/Available stays in India/i, { timeout: 30_000 });

    const card = page.locator('button[aria-label^="View "]').first();
    await card.click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const start = new Date();
    start.setDate(start.getDate() + 21);
    const end = new Date();
    end.setDate(end.getDate() + 23);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    await dialog.locator('input[type="date"]').nth(0).fill(iso(start));
    await dialog.locator('input[type="date"]').nth(1).fill(iso(end));

    // Sample inventory stays explorable but must never become reserveable.
    const sampleCta = dialog.getByRole('button', { name: /Sample listing — not bookable/i });
    await expect(sampleCta).toBeVisible();
    await expect(sampleCta).toBeDisabled();
    await expect(dialog).toContainText(/cannot be reserved or paid for/i);
    await expect(dialog.getByRole('button', { name: /^(Reserve|Check availability)$/i })).toHaveCount(0);
    // No checkout or card capture may be reachable.
    await expect(
      dialog.locator('input[autocomplete="cc-number"], input[autocomplete="cc-exp"], input[name*="card" i]'),
    ).toHaveCount(0);
  });
});

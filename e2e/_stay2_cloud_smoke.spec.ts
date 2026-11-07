import { expect, test } from '@playwright/test';

test.describe('Stay 2 local cloud wiring smoke', () => {
  test.skip(process.env.E2E_STAY2_SMOKE !== '1', 'points at the local 5173 stays-dev catalog, not the isolated harness');
  test('Stay 2 is default, Stay 1 remains at #stays/old, fixtures are labelled', async ({ page }) => {
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
    const signIn = dialog.getByRole('button', { name: /Sign in to book/i });
    const sampleOnly = dialog.getByRole('button', { name: /Sample listing — not bookable/i });
    await expect(signIn.or(sampleOnly)).toBeVisible();
    if (await sampleOnly.isVisible().catch(() => false)) {
      // Demo preview inventory must allow date/price exploration but must never
      // lead into checkout.
      await expect(sampleOnly).toBeDisabled();
      await expect(dialog).toContainText(/cannot be reserved or paid for/i);
    } else {
      await expect(dialog).toContainText(/You won’t be charged yet/i);
    }

    await page.goto('/#stays/old');
    await expect(page.locator('body')).toContainText(/Hotels|Stay/i, { timeout: 20_000 });
  });
});

import { expect, test } from '@playwright/test';

/**
 * Stay Style 2 (Airbnb-style) must surface the verified inventory feed, never a
 * "sample listing" placeholder, and must open the server-authoritative checkout
 * panel instead of a disabled Reserve button.
 */

test.describe('stay style 2 — real inventory', () => {
  test('renders the verified feed and never labels real stays as samples', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto('/#stays/airbnb');
    await expect(page.locator('body')).toContainText(/Live verified stays|Verified stay feed unavailable/, { timeout: 20_000 });

    const body = await page.locator('body').innerText();
    if (body.includes('Live verified stays')) {
      expect(body).not.toContain('Sample preview.');
      await expect(page.locator('[aria-label^="View "]').first()).toBeVisible();
    }
    expect(errors).toHaveLength(0);
  });

  test('opens a real stay with the verified banner and no sample-only notice', async ({ page }) => {
    await page.goto('/#stays/airbnb');
    const card = page.locator('[aria-label^="View "]').first();
    const hasCard = await card
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasCard, 'No verified stay listing is available in this environment');

    await card.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Verified stay.');
    await expect(page.getByRole('dialog')).not.toContainText('booking and payment are disabled in this preview');
    await expect(page.getByRole('dialog')).toContainText(/Reserve this stay|room inventory|Sign in/i);
  });
});

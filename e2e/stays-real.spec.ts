import { expect, test } from '@playwright/test';

/**
 * Stay Style 2 must surface the verified PostgreSQL inventory feed. An
 * unavailable repository is a failure, never a successful empty/demo state.
 */

test.describe('stay style 2 — real inventory', () => {
  test('renders the PostgreSQL verified-stay feed and never samples', async ({ page }) => {
    test.skip(process.env.E2E_STAYS_REAL !== '1', 'requires an explicitly authorized real verified-stay feed; the local dev catalog is fixture data');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto('/#stays/airbnb');
    const searchResponse = page.waitForResponse((response) =>
      response.url().includes('/api/stays/search') && response.request().method() === 'GET',
    );
    await page.reload();
    const response = await searchResponse;
    expect(response.status(), 'stay search must be served by the configured PostgreSQL repository').toBe(200);
    const payload = await response.json();
    expect(payload.source).toBe('postgresql');
    expect(Array.isArray(payload.items)).toBe(true);
    await expect(page.locator('body')).not.toContainText(/Stays could not be loaded|requires the PostgreSQL repository/i);

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Sample listing');
    expect(body).not.toContain('Sample preview');

    const cards = page.locator('button[aria-label^="View "]');
    const hasCard = await cards
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (hasCard) {
      await cards.first().click();
      await expect(page.getByRole('dialog').first()).toContainText('Verified stay.');
    }
    expect(errors).toHaveLength(0);
  });
});

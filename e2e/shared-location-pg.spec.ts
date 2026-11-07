import { expect, test } from '@playwright/test';

test('shared selected city reaches the PG Style 2 city filter', async ({ page }) => {
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
  await page.evaluate(() => { window.location.hash = 'pg/style2'; });
  await expect(page.getByPlaceholder('Search Location')).toBeVisible();
  await expect(page.getByLabel('PG city')).toHaveValue('Mumbai');
});

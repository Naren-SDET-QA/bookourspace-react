import { expect, test } from '@playwright/test';

test.describe('site chrome', () => {
  test('skip link, search, dark mode, cookie banner, help and FAQ are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a.bos-skip-link', { hasText: 'Skip to content' })).toHaveCount(1);
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#bos-site-search')).toBeVisible();
    await expect(page.getByRole('button', { name: /Switch to (Dark|Light) Mode/ }).first()).toBeVisible();

    const cookie = page.getByRole('dialog', { name: 'Privacy choices' });
    await expect(cookie).toBeVisible({ timeout: 8_000 });
    await cookie.getByRole('button', { name: 'Essential only' }).click();
    await expect(cookie).toHaveCount(0);

    await page.evaluate(() => {
      const shell = document.querySelector('.bos-app-shell') as HTMLElement | null;
      if (shell && shell.scrollHeight > shell.clientHeight + 24) shell.scrollTop = 900;
      else window.scrollTo(0, 1200);
    });
    await expect(page.getByRole('button', { name: 'Back to top' })).toBeVisible({ timeout: 5_000 });

    await expect(page.getByRole('button', { name: 'Help and frequently asked questions' })).toBeVisible();
    await page.getByRole('button', { name: 'Help and frequently asked questions' }).click();
    await expect(page.getByRole('button', { name: 'How do I sign in?' })).toBeVisible();
    await page.getByRole('button', { name: 'How do Movies work?' }).click();
    await expect(page.getByText('Movies shows theatre showtimes only')).toBeVisible();
  });

  test('mobile menu opens from the header hamburger', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('universal-marketplace-header')).toBeVisible({ timeout: 20_000 });
    await page.getByTitle('Open All Sections & Quick Menu').click();
    await expect(page.locator('#bos-mobile-menu')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Help & FAQ' })).toBeVisible();
  });
});

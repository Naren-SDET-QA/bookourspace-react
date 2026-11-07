import { expect, test } from '@playwright/test';

test('home image layout renders at the target responsive widths', async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 320) {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.body.innerText.includes('Continue with Google'), null, { timeout: 30_000 });
      await page.waitForFunction(() => !document.body.innerText.includes('Self-Healing Modular Engine'), null, { timeout: 30_000 });
    }
    await expect(page.locator('img[data-safe-image]').first()).toHaveAttribute('data-image-state', 'loaded');
    const rendered = await page.locator('img[data-safe-image]').count();
    expect(rendered).toBeGreaterThan(0);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: `/tmp/bookourspace-image-home-${width}.png`, fullPage: false });
    }
  }
});

test('a failed remote photo renders its local module fallback without retrying the photo', async ({ page }) => {
  let failedSourceRequests = 0;
  await page.route('https://images.unsplash.com/photo-safe-image-intentionally-missing**', async (route) => {
    failedSourceRequests += 1;
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'test image missing' });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const proof = page.locator('img[data-safe-image]').first();
  await expect(proof).toBeVisible();
  await proof.evaluate((image: HTMLImageElement) => {
    image.removeAttribute('srcset');
    image.src = 'https://images.unsplash.com/photo-safe-image-intentionally-missing?auto=format&fit=crop&w=640&q=80';
  });
  await expect(proof).toHaveAttribute('src', /\/assets\/fallbacks\/[a-z-]+\.svg$/);
  await expect(proof).toHaveAttribute('data-image-state', 'loaded');
  expect(await proof.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(failedSourceRequests).toBe(1);
});

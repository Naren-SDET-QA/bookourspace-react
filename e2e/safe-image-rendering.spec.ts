import { expect, test } from '@playwright/test';

test('Classes image layout renders at the target responsive widths', async ({ page }) => {
  // The optimized Guest Home intentionally defers module imagery. Classes has
  // deterministic fixture cards, so use it to cover the SafeImage surfaces.
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#64748b"/></svg>'),
  }));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 320) {
      await page.goto('/#classes', { waitUntil: 'domcontentloaded' });
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
  await page.goto('/#classes', { waitUntil: 'domcontentloaded' });
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

test('visible module imagery is loaded on phone and desktop without demo-host requests', async ({ page }) => {
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#64748b"/></svg>'),
  }));
  const imageRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'image') imageRequests.push(request.url());
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['#pg', '#classes', '#venues', '#services', '#stays', '#movies']) {
      await page.goto(`/${route}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Open All Sections & Quick Menu' }).waitFor({ timeout: 30_000 });
      const visibleImageState = () => page.locator('img[data-safe-image]').evaluateAll((images) => (images as HTMLImageElement[])
        .filter((image) => {
          const bounds = image.getBoundingClientRect();
          return bounds.bottom > 0 && bounds.top < window.innerHeight;
        })
        .map((image) => ({ loaded: image.complete && image.naturalWidth > 0, source: image.currentSrc || image.src })));
      await expect.poll(async () => {
        const images = await visibleImageState();
        return images.length > 0 && images.every((image) => image.loaded);
      }, { message: `${route} at ${width}px has a visible image that did not load`, timeout: 10_000 }).toBe(true);
      const visibleImages = await visibleImageState();
      expect(visibleImages.length, `${route} rendered no visible image at ${width}px`).toBeGreaterThan(0);
      expect(visibleImages.every((image) => image.loaded), `${route} has a broken visible image at ${width}px`).toBe(true);
    }
  }
  expect(imageRequests.filter((url) => /images\.example\.com|cdn\.example\.test|media\.example\.test/i.test(url))).toHaveLength(0);
});

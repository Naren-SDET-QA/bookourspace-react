import { readFileSync } from 'node:fs';
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
  test.skip(process.env.BOS_E2E_AI_STUDIO === '1', 'demo fixtures are disabled in the AI Studio preview harness');
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
  await expect(proof).toHaveAttribute('src', /\/assets\/fallbacks\/[a-z-]+\.webp$/);
  await expect(proof).toHaveAttribute('data-image-state', 'loaded');
  expect(await proof.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(failedSourceRequests).toBe(1);
});

test('visible module imagery is loaded on phone and desktop without demo-host requests', async ({ page }) => {
  test.skip(process.env.BOS_E2E_AI_STUDIO === '1', 'the AI Studio preview harness serves real, possibly empty inventory');
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

test('Google AI Studio-style preview signs real venue media in the Halls shell', async ({ page }) => {
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#64748b"/></svg>'),
  }));
  let signedRequests = 0;
  await page.route('https://obkfgxjzlscungkhbyvq.supabase.co/storage/v1/object/sign/**', async (route) => {
    signedRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signedURL: '/assets/fallbacks/venues.svg' }),
    });
  });
  await page.route('https://obkfgxjzlscungkhbyvq.supabase.co/rest/v1/media_assets**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  await page.route('**/api/marketplace/listings', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      source: 'postgresql',
      listings: [{
        id: 'ai-studio-venue-1',
        title: 'AI Studio venue media check',
        categoryId: 'venue-marriage',
        subcategory: 'Function Hall',
        entityType: 'venue',
        price: 25000,
        priceUnit: 'event',
        providerName: 'Verified venue owner',
        createdAt: '2026-11-10',
        attributes: {
          images: ['storage://bos-public-media/owner/listing/ai-studio-venue.webp'],
          location: { city: 'Hyderabad', area: 'Banjara Hills' },
        },
      }],
    }),
  }));
  await page.addInitScript(() => {
    window.localStorage.setItem('bos_section_style_prefs_v1', JSON.stringify({ venues: 'agenda' }));
  });
  await page.goto('/#venues', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open All Sections & Quick Menu' }).waitFor({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /All Venues & Halls/ })).toBeVisible({ timeout: 30_000 });
  const agendaImages = page.locator('article img[data-safe-image]');
  await expect(agendaImages.first()).toBeVisible();
  await agendaImages.first().scrollIntoViewIfNeeded();
  expect(signedRequests, 'AI Studio preview must request a signed Storage URL').toBeGreaterThan(0);
  await expect(agendaImages.first()).toHaveAttribute('data-image-source-status', 'authorized-media');
  await expect(agendaImages.first()).toHaveAttribute('src', /\/assets\/fallbacks\/venues\.svg$/);

  const signedRequestsBeforeReload = signedRequests;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open All Sections & Quick Menu' }).waitFor({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /All Venues & Halls/ })).toBeVisible({ timeout: 30_000 });
  const reloadedAgendaImage = page.locator('article img[data-safe-image]').first();
  await expect(reloadedAgendaImage).toBeVisible();
  await reloadedAgendaImage.scrollIntoViewIfNeeded();
  await expect.poll(() => signedRequests, {
    message: 'AI Studio preview must re-authorize stored media after a reload',
    timeout: 10_000,
  }).toBeGreaterThan(signedRequestsBeforeReload);
  await expect(reloadedAgendaImage).toHaveAttribute('data-image-source-status', 'authorized-media');
  await expect(reloadedAgendaImage).toHaveAttribute('src', /\/assets\/fallbacks\/venues\.svg$/);
});

test('AI Studio preview decodes a re-signed Storage photo at natural size', async ({ page }) => {
  test.skip(process.env.BOS_E2E_AI_STUDIO !== '1', 'runs only against the AI Studio preview harness');
  let signedRequests = 0;
  const realPhoto = readFileSync(new URL('../public/assets/aistudio/WhatsApp_Image_2026-10-17_at_7.17.13_PM_64b54ca7.jpeg', import.meta.url));
  await page.route('https://obkfgxjzlscungkhbyvq.supabase.co/storage/v1/object/sign/**', async (route) => {
    // POST creates the signed grant; GET fetches the authorized object bytes.
    if (route.request().method() === 'POST') {
      signedRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ signedURL: '/object/sign/mock/ai-studio-real.jpg' }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: realPhoto });
  });
  await page.route('https://obkfgxjzlscungkhbyvq.supabase.co/rest/v1/media_assets**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  await page.route('**/api/marketplace/listings', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      source: 'postgresql',
      listings: [{
        id: 'ai-studio-venue-real-photo',
        title: 'AI Studio real photo decode',
        categoryId: 'venue-marriage',
        subcategory: 'Function Hall',
        entityType: 'venue',
        price: 25000,
        priceUnit: 'event',
        providerName: 'Verified venue owner',
        createdAt: '2026-11-10',
        attributes: {
          images: ['storage://bos-public-media/owner/listing/ai-studio-real.webp'],
          location: { city: 'Hyderabad', area: 'Banjara Hills' },
        },
      }],
    }),
  }));
  await page.addInitScript(() => {
    window.localStorage.setItem('bos_section_style_prefs_v1', JSON.stringify({ venues: 'agenda' }));
  });
  await page.goto('/#venues', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open All Sections & Quick Menu' }).waitFor({ timeout: 30_000 });
  const image = page.locator('section[aria-label="Venues agenda"] img[data-safe-image]').first();
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/mock\/ai-studio-real\.jpg$/);
  await expect(image).toHaveAttribute('data-image-state', 'loaded');
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  expect(signedRequests).toBeGreaterThan(0);
});

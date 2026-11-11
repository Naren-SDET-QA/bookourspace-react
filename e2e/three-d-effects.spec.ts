import { expect, test } from '@playwright/test';

test('3D marketplace surfaces remain visible on touch and desktop layouts', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bos_entry_choice_v1', 'guest');
  });

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#classes', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Open All Sections & Quick Menu' }).waitFor({ timeout: 30_000 });
    await expect.poll(async () => page.locator('.bos-rail-3d').count(), { timeout: 10_000 }).toBeGreaterThan(0);

    const depth = await page.locator('.bos-rail-3d').first().evaluate((rail) => ({
      transform: getComputedStyle(rail).transform,
      transformStyle: getComputedStyle(rail).transformStyle,
      perspective: getComputedStyle(rail).perspective,
    }));
    const pillTransform = await page.locator('.bos-pill-3d').first().evaluate((pill) => getComputedStyle(pill).transform);
    expect(depth.transform, `3D rail lost its depth at ${width}px`).not.toBe('none');
    expect(depth.transformStyle).toBe('preserve-3d');
    expect(depth.perspective).toBe('1000px');
    expect(pillTransform, `3D pill lost its resting depth at ${width}px`).not.toBe('none');
  }
});

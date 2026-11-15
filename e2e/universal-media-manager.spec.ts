import { expect, test } from '@playwright/test';

test('SVG sanitizer removes active and external content while preserving safe vector artwork', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const sanitized = await page.evaluate(async () => {
    const modulePath: string = '/src/lib/media/sanitizeSvg.ts';
    const module = await import(modulePath);
    return module.sanitizeSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"><script>alert(1)</script><rect width="10" height="10" fill="url(https://evil.test/x)"/><image href="https://evil.test/a.svg"/></svg>');
  });
  expect(sanitized).toContain('<svg');
  expect(sanitized).toContain('<rect');
  expect(sanitized).not.toMatch(/script|onload|https:\/\/evil|<image/i);
});

test('shared media manager previews inspected files and fails closed without storage', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const [managerSource, mainSource] = await Promise.all([
      fetch('/src/components/UniversalMediaManager.tsx').then((response) => response.text()),
      fetch('/src/main.tsx').then((response) => response.text()),
    ]);
    const reactUrl = managerSource.match(/from\s+["']([^"']*\/(?:node_modules\/\.vite|@fs[^"']*)\/deps\/react\.js\?v=[^"']+)["']/)?.[1];
    const reactDomUrl = mainSource.match(/from\s+["']([^"']*\/(?:node_modules\/\.vite|@fs[^"']*)\/deps\/react-dom_client\.js\?v=[^"']+)["']/)?.[1];
    if (!reactUrl || !reactDomUrl) throw new Error('The app React runtime was not loaded.');
    const load = (modulePath: string): Promise<any> => new Function('url', 'return import(url)')(modulePath);
    const [reactModule, reactDomModule, managerModule] = await Promise.all([
      load(reactUrl),
      load(reactDomUrl),
      load('/src/components/UniversalMediaManager.tsx'),
    ]);
    const host = document.createElement('div');
    host.id = 'media-manager-proof';
    document.body.append(host);
    const root = reactDomModule.default.createRoot(host);
    root.render(reactModule.default.createElement(managerModule.default, { moduleKey: 'services', parentType: 'listing', onUpload: null }));
  });
  await expect(page.getByRole('button', { name: 'Storage setup required' })).toBeDisabled();
  await expect(page.getByText(/Storage is not configured/i)).toBeVisible();
  await page.locator('#media-manager-proof input[type=file]').setInputFiles({
    name: 'banner.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" onload="alert(1)"><script>alert(1)</script><rect width="640" height="360" fill="#4f46e5"/></svg>'),
  });
  await expect(page.getByText(/SVG · .* MB/)).toBeVisible();
  await expect(page.locator('#media-manager-proof img[data-safe-image]')).toHaveAttribute('data-image-state', 'loaded');
});

test('responsive image variants keep originals, preserve aspect ratio, and never upscale', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const modulePath: string = '/src/lib/media/imageVariants.ts';
    const module = await import(modulePath);
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 640, 360);
    gradient.addColorStop(0, '#4338ca');
    gradient.addColorStop(1, '#f59e0b');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 640, 360);
    context.fillStyle = '#fff';
    context.font = 'bold 30px sans-serif';
    context.fillText('BookOurSpace', 24, 80);
    const source = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'));
    const file = new File([source], 'source.png', { type: 'image/png' });
    const processed = await module.createResponsiveImageVariants(file);
    return {
      originalType: processed.original.type,
      originalBytes: processed.original.size,
      sourceBytes: file.size,
      width: processed.width,
      height: processed.height,
      variants: processed.variants.map((variant: { width: number; height: number; mimeType: string; file: File }) => ({ width: variant.width, height: variant.height, mimeType: variant.mimeType, bytes: variant.file.size })),
    };
  });
  expect(result.originalType).toBe('image/png');
  expect(result.originalBytes).toBe(result.sourceBytes);
  expect(result.width).toBe(640);
  expect(result.height).toBe(360);
  expect(result.variants.length).toBe(2);
  expect(result.variants.map((variant: { width: number }) => variant.width)).toEqual([160, 400]);
  expect(result.variants.every((variant: { mimeType: string; width: number; height: number; bytes: number }) => (variant.mimeType === 'image/webp' || variant.mimeType === 'image/avif') && variant.width * 360 === variant.height * 640 && variant.bytes > 0)).toBe(true);
});

test('GIF originals stay animated and PNG transparency is kept on the source file', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const modulePath: string = '/src/lib/media/imageVariants.ts';
    const module = await import(modulePath);
    const gifBytes = Uint8Array.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
      0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
      0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
      0x44, 0x01, 0x00, 0x3b,
    ]);
    const gif = new File([gifBytes], 'loop.gif', { type: 'image/gif' });
    const gifProcessed = await module.createResponsiveImageVariants(gif);
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d', { alpha: true })!;
    context.clearRect(0, 0, 320, 180);
    context.fillStyle = 'rgba(67, 56, 202, 0.4)';
    context.fillRect(40, 20, 240, 140);
    const pngBlob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'));
    const png = new File([pngBlob], 'alpha.png', { type: 'image/png' });
    const pngProcessed = await module.createResponsiveImageVariants(png);
    return {
      gifType: gifProcessed.original.type,
      gifBytes: gifProcessed.original.size,
      gifSourceBytes: gif.size,
      gifVariants: gifProcessed.variants.length,
      pngType: pngProcessed.original.type,
      pngBytes: pngProcessed.original.size,
      pngSourceBytes: png.size,
      pngVariantTypes: pngProcessed.variants.map((variant: { mimeType: string }) => variant.mimeType),
    };
  });
  expect(result.gifType).toBe('image/gif');
  expect(result.gifBytes).toBe(result.gifSourceBytes);
  expect(result.gifVariants).toBe(0);
  expect(result.pngType).toBe('image/png');
  expect(result.pngBytes).toBe(result.pngSourceBytes);
  expect(result.pngVariantTypes.every((type: string) => type === 'image/webp' || type === 'image/avif')).toBe(true);
});

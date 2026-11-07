import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(root, 'public/assets/brand');

test('the supplied horizontal BOS lockup is losslessly served as a compact WebP', async () => {
  const logoPath = path.join(brandDir, 'bos-logo-lockup.webp');
  const [metadata, bytes] = await Promise.all([sharp(logoPath).metadata(), fs.stat(logoPath)]);
  assert.equal(metadata.width, 1560);
  assert.equal(metadata.height, 320);
  assert.ok(bytes.size < 250_000, 'official lockup stays below 250 KB');
});

test('the rotating front and back faces reuse the tricolor pin from the supplied logo', async () => {
  const component = await fs.readFile(path.join(root, 'src/components/BOSOfficialLogo.tsx'), 'utf8');
  const { data } = await sharp(path.join(brandDir, 'bos-logo-lockup.webp'))
    .extract({ left: 176, top: 72, width: 168, height: 207 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let saffron = 0;
  let green = 0;
  let chakraBlue = 0;
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = data.subarray(i, i + 3);
    if (r > 150 && g > 65 && r > g * 1.3 && b < 145) saffron++;
    if (g > 65 && g > r * 1.2 && g > b * 0.8 && r < 150) green++;
    if (b > 55 && b > r * 1.2 && b > g * 1.1) chakraBlue++;
  }
  assert.ok(saffron > 100, 'supplied pin retains saffron');
  assert.ok(green > 50, 'supplied pin retains green');
  assert.ok(chakraBlue > 50, 'supplied pin retains Chakra blue');
  assert.match(component, /bos-official-logo__face--front/);
  assert.match(component, /bos-official-logo__face--back/);
  assert.equal((component.match(/<image[^>]*href=\{BOS_OFFICIAL_LOGO_(?:STATIC|ANIMATED)\}/g) || []).length, 2);
  const css = await fs.readFile(path.join(root, 'src/index.css'), 'utf8');
  assert.match(css, /animation: bos-logo-pin-spinner 2s linear infinite/);
  assert.match(css, /transform-origin: 16\.603% 54\.531%/);
  assert.match(css, /perspective-origin: 16\.603% 54\.531%/);
  assert.match(css, /\.bos-official-logo__face\s*\{[^}]*backface-visibility: hidden/s);
  assert.match(css, /\.bos-official-logo__face--back\s*\{\s*transform: rotateY\(180deg\);/);
  assert.match(css, /@keyframes bos-logo-pin-spinner\s*\{\s*from\s*\{\s*transform: rotateY\(0deg\)/);
  assert.match(css, /to\s*\{\s*transform: rotateY\(360deg\)/);
});

test('reduced motion selects a static logo and startup does not wait on animation', async () => {
  const [component, entry, html] = await Promise.all([
    fs.readFile(path.join(root, 'src/components/BOSOfficialLogo.tsx'), 'utf8'),
    fs.readFile(path.join(root, 'src/components/BookOurSpaceEntryExperience.tsx'), 'utf8'),
    fs.readFile(path.join(root, 'index.html'), 'utf8'),
  ]);
  const css = await fs.readFile(path.join(root, 'src/index.css'), 'utf8');
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /bos-official-logo__pin-rotor\s*\{\s*display:\s*none/);
  assert.match(component, /BOS_OFFICIAL_LOGO_STATIC/);
  assert.match(component, /bos-logo-pin-rotor/);
  assert.match(entry, /animated/);
  assert.match(html, /bos-logo-lockup\.webp/);
  assert.doesNotMatch(html, /bos-logo-animated\.webp/);
  assert.doesNotMatch(html, /setTimeout\([^)]*bos-prelaunch/i);
});

test('native icons and splash use the supplied static logo artwork', async () => {
  const appIcon = JSON.parse(await fs.readFile(path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json'), 'utf8'));
  const splash = JSON.parse(await fs.readFile(path.join(root, 'ios/App/App/Assets.xcassets/BOSBrandSplash.imageset/Contents.json'), 'utf8'));
  const manifest = await fs.readFile(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.equal(appIcon.images[0].filename, 'BOSOfficialAppIconV2.png');
  assert.equal(splash.images[0].filename, 'bos-official-splash-v2.png');
  assert.match(manifest, /@mipmap\/bos_official_launcher_v2/);
  for (const filename of [
    'ios/App/App/Assets.xcassets/AppIcon.appiconset/BOSOfficialAppIconV2.png',
    'ios/App/App/Assets.xcassets/BOSBrandSplash.imageset/bos-official-splash-v2.png',
    'android/app/src/main/res/drawable-nodpi/bos_official_launch_logo_v2.png',
    'android/app/src/main/res/mipmap-nodpi/bos_official_launcher_v2.png',
  ]) {
    await fs.access(path.join(root, filename));
  }
});

test('persistent web surfaces use the static official logo while auth uses animation', async () => {
  const [brand, profile, invoice, auth, html, manifestText] = await Promise.all([
    fs.readFile(path.join(root, 'src/components/BOSBrandLogo.tsx'), 'utf8'),
    fs.readFile(path.join(root, 'src/components/ProfileScreen.tsx'), 'utf8'),
    fs.readFile(path.join(root, 'src/utils/gstInvoiceGenerator.ts'), 'utf8'),
    fs.readFile(path.join(root, 'src/components/SupabaseAuthModal.tsx'), 'utf8'),
    fs.readFile(path.join(root, 'index.html'), 'utf8'),
    fs.readFile(path.join(root, 'public/manifest.webmanifest'), 'utf8'),
  ]);
  assert.match(brand, /BOSOfficialLogo/);
  assert.match(profile, /BOSOfficialLogo/);
  assert.match(invoice, /bos-logo-lockup\.webp/);
  assert.match(auth, /BOSOfficialLogo animated/);
  assert.match(html, /bos-favicon-v2\.png/);
  assert.match(html, /bos-apple-touch-icon-v2\.png/);
  assert.match(manifestText, /bos-app-icon-192-v2\.png/);
  const webIcons = JSON.parse(manifestText).icons;
  assert.equal(webIcons.find(icon => icon.purpose === 'maskable').src, webIcons.find(icon => icon.purpose === 'any').src);
});

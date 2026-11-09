import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { assertVariantVisualQuality, inspectServerImage } from '../src/server/mediaImageInspection.ts';

test('server inspection verifies a raster by signature and full decode, preserving original bytes', async () => {
  const original = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#369' } })
    .jpeg({ quality: 90 }).toBuffer();
  const inspected = await inspectServerImage(original);
  assert.equal(inspected.format, 'jpeg');
  assert.equal(inspected.mimeType, 'image/jpeg');
  assert.equal(inspected.width, 32);
  assert.equal(inspected.height, 24);
  assert.equal(inspected.bytes, original.length);
  assert.deepEqual(inspected.sanitizedBytes, original);
  assert.match(inspected.sha256, /^[a-f0-9]{64}$/);
});

test('server inspection rejects signature-only and corrupt image payloads', async () => {
  await assert.rejects(inspectServerImage(Buffer.from([0xff, 0xd8, 0xff, 0x00])), /MEDIA_IMAGE|Input|corrupt|Vips/i);
  const valid = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#369' } }).png().toBuffer();
  const spoofed = Buffer.from(valid);
  spoofed[0] = 0;
  await assert.rejects(inspectServerImage(spoofed));
});

test('server inspection decodes common GIF originals without rewriting them', async () => {
  const original = await sharp({ create: { width: 24, height: 18, channels: 4, background: '#369' } }).gif().toBuffer();
  const inspected = await inspectServerImage(original);
  assert.equal(inspected.format, 'gif');
  assert.equal(inspected.width, 24);
  assert.equal(inspected.height, 18);
  assert.deepEqual(inspected.sanitizedBytes, original);
});

test('server SVG validation accepts only static image elements and rejects active or external references', async () => {
  const safe = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#336699"/></svg>');
  const inspected = await inspectServerImage(safe);
  assert.equal(inspected.format, 'svg');
  assert.equal(inspected.width, 20);
  assert.equal(inspected.height, 10);
  assert.ok(inspected.sanitizedBytes.length > 0);

  const active = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><script>alert(1)</script></svg>');
  await assert.rejects(inspectServerImage(active), /MEDIA_SVG_ELEMENT_FORBIDDEN/);
  const external = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect fill="url(https://example.test/a.svg#x)"/></svg>');
  await assert.rejects(inspectServerImage(external), /MEDIA_SVG_EXTERNAL_REFERENCE_FORBIDDEN/);
});

test('server image limits reject oversized input before decoding', async () => {
  await assert.rejects(inspectServerImage(Buffer.alloc(15 * 1024 * 1024 + 1)), /MEDIA_IMAGE_SIZE_INVALID/);
});

test('responsive variants must preserve visual quality while staying below original dimensions', async () => {
  const width = 256;
  const height = 256;
  const raw = Buffer.alloc(width * height * 3);
  let seed = 7;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      seed = (seed * 48271) % 2147483647;
      const noise = (seed % 65) - 32;
      const index = (y * width + x) * 3;
      raw[index] = Math.max(0, Math.min(255, 65 + 0.5 * x + noise));
      raw[index + 1] = Math.max(0, Math.min(255, 45 + 0.6 * y + noise));
      raw[index + 2] = Math.max(0, Math.min(255, 90 + 0.3 * (x + y) + noise));
    }
  }
  const source = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const good = await sharp(raw, { raw: { width, height, channels: 3 } }).resize(128, 128).webp({ quality: 90 }).toBuffer();
  const poor = await sharp(raw, { raw: { width, height, channels: 3 } }).resize(128, 128).webp({ quality: 10 }).toBuffer();
  const psnr = await assertVariantVisualQuality(source, good);
  assert.ok(psnr >= 30);
  await assert.rejects(assertVariantVisualQuality(source, poor), /MEDIA_VARIANT_VISUAL_QUALITY_TOO_LOW/);
});

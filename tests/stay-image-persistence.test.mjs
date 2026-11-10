import assert from 'node:assert/strict';
import test from 'node:test';
import { persistableStayImages } from '../src/server/stayHostApi.ts';

test('stay host media persists original HTTPS and canonical public Storage refs only', () => {
  const images = persistableStayImages([
    'storage://bos-public-media/owner/listing/cover.webp',
    'https://images.example.test/owner/cover.jpg',
    'https://obkfgxjzlscungkhbyvq.supabase.co/storage/v1/object/sign/bos-public-media/owner/cover.webp?token=expired',
    'storage://bos-private-profile-media/owner/avatar.webp',
    'storage://bos-public-media/owner/%2Fwrong.webp',
    'http://images.example.test/insecure.jpg',
  ]);

  assert.deepEqual(images, [
    'storage://bos-public-media/owner/listing/cover.webp',
    'https://images.example.test/owner/cover.jpg',
  ]);
});

test('stay host media is bounded and non-array input is omitted', () => {
  assert.equal(persistableStayImages(null), undefined);
  assert.equal(persistableStayImages('storage://bos-public-media/owner/cover.webp'), undefined);
  assert.equal(
    persistableStayImages(Array.from({ length: 20 }, (_, index) => `storage://bos-public-media/owner/${index}.webp`)).length,
    16,
  );
});

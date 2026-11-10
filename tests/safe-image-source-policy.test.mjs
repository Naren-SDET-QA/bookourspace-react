import assert from 'node:assert/strict';
import test from 'node:test';
import { isKnownUnavailableDemoImageSource } from '../src/components/SafeImage.tsx';

test('known disposable image fixtures are rejected before the browser makes a DNS request', () => {
  assert.equal(isKnownUnavailableDemoImageSource('https://images.example.com/pg-a.jpg'), true);
  assert.equal(isKnownUnavailableDemoImageSource('https://cdn.example.test/room.jpg'), true);
  assert.equal(isKnownUnavailableDemoImageSource('https://media.example.test/cover.webp'), true);
  assert.equal(isKnownUnavailableDemoImageSource('https://images.example.com.evil.test/pg-a.jpg'), false);
});

test('real listing providers and authorized Storage references remain eligible', () => {
  assert.equal(isKnownUnavailableDemoImageSource('https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800'), false);
  assert.equal(isKnownUnavailableDemoImageSource('storage://bos-public-media/listings/one/cover.webp'), false);
  assert.equal(isKnownUnavailableDemoImageSource('/assets/fallbacks/pg.svg'), false);
});

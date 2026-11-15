import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/components/DistrictMoviesSection.tsx', import.meta.url), 'utf8');

test('Movies remains discovery-only and does not turn other modules into movie results', () => {
  assert.match(source, /const MOVIES_BOOKING_ENABLED = false/);
  assert.match(source, /return listings\.filter\(/);
  assert.doesNotMatch(source, /return filtered\.length > 0 \? filtered : listings/);
  assert.match(source, /No movie or cinema listings are available for discovery yet/);
  assert.match(source, /No showtimes provided/);
});

test('Movies does not display fabricated showtimes, cinema availability, ratings, or ticket actions as live', () => {
  assert.doesNotMatch(source, /10:30 AM • 01:45 PM • 04:50 PM • 07:55 PM • 10:55 PM/);
  assert.doesNotMatch(source, /const isFastFilling =/);
  assert.match(source, /Availability is not verified/);
  assert.match(source, /Demo preview · not verified/);
  assert.match(source, /Booking coming soon/);
  assert.match(source, /disabled\s+data-testid=\{`book-movie-btn-/);
  assert.match(source, /Saved interest stays in this browser; notifications are not sent/);
});

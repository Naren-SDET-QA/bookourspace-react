import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('../src/components/MoviesShowtimes.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('Movies remains discovery-only and does not turn other modules into movie results', () => {
  assert.match(ui, /\/api\/movies\/showtimes/);
  assert.match(ui, /No online booking for Movies/);
  assert.doesNotMatch(ui, /setBookingStep|selectedSeats|paymentStep|ticketId/);
  assert.doesNotMatch(app, /<DistrictMoviesSection|<MoviesAppExperience/);
  assert.doesNotMatch(app, /from '\.\/components\/DistrictMoviesSection'|from '\.\/components\/MoviesAppExperience'/);
});

test('Movies active UI has no bundled or fabricated showtime fallback', () => {
  assert.match(ui, /No showtimes for this location yet/);
  assert.doesNotMatch(ui, /MOVIES_APP_DATA|moviesAppData/);
  assert.doesNotMatch(ui, /10:30 AM • 01:45 PM • 04:50 PM • 07:55 PM • 10:55 PM/);
  assert.doesNotMatch(ui, /const isFastFilling =/);
});

test('Movies tells customers that showtimes are not bookable online', () => {
  assert.match(ui, /Showtimes are updated by theatres\/admins and authorized daily sync\. No seats, tickets, payments or refunds\./);
  assert.match(ui, /Movies → nearby theatres → real timings\. No online booking for Movies\./);
});

test('legacy Movies booking and discovery components are removed', () => {
  const removed = [
    'src/components/DistrictMoviesSection.tsx',
    'src/components/MoviesAppExperience.tsx',
    'src/data/moviesAppData.ts',
  ];
  for (const file of removed) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, `${file} should be removed`);
  }
});

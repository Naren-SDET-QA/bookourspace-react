import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Movies active UI is showtimes-only with no seat, booking, payment or ticket surface', () => {
  const app = read('src/App.tsx');
  const ui = read('src/components/MoviesShowtimes.tsx');
  assert.match(app, /MoviesShowtimes/);
  assert.doesNotMatch(app, /<DistrictMoviesSection|<MoviesAppExperience/);
  assert.equal(existsSync(new URL('../src/components/DistrictMoviesSection.tsx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/components/MoviesAppExperience.tsx', import.meta.url)), false);
  assert.doesNotMatch(ui, /setBookingStep|selectedSeats|paymentStep|ticketId|\/api\/movies\/bookings|\/api\/seats/);
  assert.match(ui, /No online booking for Movies/);
});

test('Movies supports all-India state filters and approval-gated visibility', () => {
  const ui = read('src/components/MoviesShowtimes.tsx');
  const api = read('src/server/moviesShowtimesApi.ts');
  const migration = read('supabase/migrations/20261112330000_movies_state_approval.sql');
  assert.match(ui, /INDIA_MOVIE_STATES\.map/);
  assert.match(migration, /all Indian states and/);
  assert.match(migration, /Andaman and Nicobar Islands/);
  assert.match(migration, /Dadra and Nagar Haveli and Daman and Diu/);
  assert.match(api, /approval_status = 'approved'/);
  assert.match(api, /show_date = current_date/);
  assert.match(api, /state =/);
  assert.match(api, /\/api\/admin\/movies\/theatres\/:screenId\/approval/);
  assert.match(api, /BOS_MOVIES_SYNC_TOKEN/);
  assert.match(api, /showtime_source = 'authorized_sync'/);
});

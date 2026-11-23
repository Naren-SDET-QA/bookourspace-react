import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const activeMovieFiles = [
  'src/components/MoviesShowtimes.tsx',
  'src/components/AdminDashboard.tsx',
  'src/server/moviesShowtimesApi.ts',
  'src/server/providerListingRepository.ts',
];

const forbiddenCatalogTokens = [
  'movie_theatres',
  'movie_titles',
  'movie_showtimes',
  'movies_now_showing',
  'movie_admin_catalog',
  'manage_movie_visibility',
  'movie_admin_permissions',
];

test('active Movies UI, API and repository use the canonical cinema_screens path', () => {
  const ui = read('src/components/MoviesShowtimes.tsx');
  const api = read('src/server/moviesShowtimesApi.ts');
  const repository = read('src/server/providerListingRepository.ts');
  const admin = read('src/components/AdminDashboard.tsx');

  assert.match(ui, /\/api\/movies\/showtimes/);
  assert.match(admin, /<MoviesShowtimes inline \/>/);
  assert.match(api, /from public\.cinema_screens/);
  assert.match(api, /update public\.cinema_screens/);
  assert.match(api, /insert into public\.cinema_screens/);
  assert.match(api, /cinema_listing_id/);
  assert.match(repository, /listPublicCinemaScreens/);
  assert.match(repository, /from public\.cinema_screens/);
  assert.match(repository, /insert into public\.cinema_screens/);
  assert.match(repository, /cinema_listing_id/);
});

test('active movie application code does not depend on the superseded catalog', () => {
  for (const file of activeMovieFiles) {
    const source = read(file);
    for (const token of forbiddenCatalogTokens) {
      assert.doesNotMatch(
        source,
        new RegExp(`\\b${token.replaceAll('_', '\\_')}\\b`),
        `${file} must not reference superseded movie catalog symbol ${token}`,
      );
    }
  }
});

test('the November 2 catalog migrations remain isolated from active application code', () => {
  const first = read('supabase/migrations/20261102124513_movie_visibility_management.sql');
  const second = read('supabase/migrations/20261102142141_movie_tamil_nadu.sql');
  for (const migration of [first, second]) {
    assert.match(migration, /movie_theatres|movie_titles|movie_showtimes/);
  }
  assert.match(first, /create function public\.movies_now_showing/);
  assert.match(second, /movie_theatres_state_check/);
  assert.match(read('src/server/moviesShowtimesApi.ts'), /public\.cinema_screens/);
});

test('movie state handling accepts all Indian states and union territories', () => {
  const states = read('src/lib/indiaMovieStates.ts');
  const api = read('src/features/movies/moviesApi.ts');
  const routes = read('src/server/movieRoutes.ts');
  const showtimesUi = read('src/components/MoviesShowtimes.tsx');
  assert.match(states, /Andaman and Nicobar Islands/);
  assert.match(states, /Dadra and Nagar Haveli and Daman and Diu/);
  assert.match(states, /Jammu and Kashmir/);
  assert.match(states, /Tamil Nadu/);
  assert.match(api, /INDIA_MOVIE_STATES/);
  assert.match(routes, /INDIA_MOVIE_STATES/);
  assert.match(showtimesUi, /INDIA_MOVIE_STATES\.map/);
  assert.doesNotMatch(read('supabase/migrations/20261112330000_movies_state_approval.sql'), /state in \('Andhra Pradesh','Telangana','Karnataka'\)/);
});


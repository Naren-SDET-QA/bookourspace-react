import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoMovieShowtimes, demoTheatreAdminRows, filterDemoMovieShowtimes } from './movieDemoData';

test('local Movies demo has a small original catalogue with theatre and timing coverage', () => {
  assert.equal(new Set(demoMovieShowtimes.map(row => row.movie_id)).size, 4);
  assert.equal(new Set(demoMovieShowtimes.map(row => row.theatre_id)).size, 4);
  assert.equal(demoTheatreAdminRows.length, 4);
  assert.equal(demoMovieShowtimes.length, 12);
  assert.ok(demoMovieShowtimes.every(row => row.poster_url === '/assets/demo/movie.svg'));
  assert.ok(demoMovieShowtimes.every(row => Date.parse(row.starts_at) > Date.parse('2026-11-02T23:59:59Z')));
  assert.equal(new Set(demoMovieShowtimes.map(row => row.showtime_id)).size, demoMovieShowtimes.length);
});

test('local Movies demo respects search, city and state filters', () => {
  assert.equal(filterDemoMovieShowtimes({ query: 'Metro Dreams', state: '', city: '' }).length, 3);
  assert.equal(filterDemoMovieShowtimes({ query: '', state: '', city: '', language: 'Hindi' }).length, 3);
  assert.equal(filterDemoMovieShowtimes({ query: '', state: 'Karnataka', city: '' }).length, 3);
  assert.equal(filterDemoMovieShowtimes({ query: '', state: '', city: 'Chennai' }).length, 3);
  assert.equal(filterDemoMovieShowtimes({ query: 'does-not-exist', state: '', city: '' }).length, 0);
});

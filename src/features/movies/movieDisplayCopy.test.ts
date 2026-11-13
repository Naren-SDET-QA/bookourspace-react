import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMovieDisplayCopy } from './movieDisplayCopy';

test('movie cards show only the movie title, theatre and show timings with a clear display-only note', () => {
  const copy = getMovieDisplayCopy({ title: 'Metro Dreams', theatreName: 'BookOurSpace Cinema', language: 'Telugu' });

  assert.deepEqual(copy, {
    title: 'Metro Dreams',
    theatre: 'BookOurSpace Cinema',
    language: 'Telugu',
    notice: 'Display-only movie information — this is not a booking platform. Booking and seat selection are not available here.',
    timingsLabel: 'Show timings',
  });
  assert.doesNotMatch(copy.title, /book|reserve|pay|platform/i);
  assert.doesNotMatch(copy.notice, /available to book|checkout|payment confirmation/i);
});

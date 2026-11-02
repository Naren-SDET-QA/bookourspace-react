import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_PAGE_PRESENTATION } from './categoryPagePresentation';
import { filterMovieListings } from './sectionListingFilters';

test('category pages are static and do not render spotlight surfaces', () => {
  assert.equal(CATEGORY_PAGE_PRESENTATION.showSpotlights, false);
  assert.equal(CATEGORY_PAGE_PRESENTATION.enableAnimations, false);
});

test('movie feeds keep only movie-related listings', () => {
  const movie = { categoryId: 'movie-hyd-1', entityType: 'property' } as never;
  const service = { categoryId: 'cat-2', entityType: 'service' } as never;

  assert.deepEqual(filterMovieListings([movie, service]), [movie]);
});

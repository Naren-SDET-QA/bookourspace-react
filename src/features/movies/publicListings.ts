import type { MarketplaceListing } from '../../types/marketplace';

// Cinema records are served exclusively by the RLS-backed Now Showing endpoint.
// Never fall back to static/local cinema records when that endpoint is unavailable.
export function nonCinemaPublicListings(listings: MarketplaceListing[]) {
  return listings.filter(listing => !listing.categoryId.startsWith('movie-') && listing.customFieldValues?.sectionType !== 'movies');
}

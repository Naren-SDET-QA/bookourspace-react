import { MarketplaceListing } from '../types/marketplace';

export function filterMovieListings(listings: MarketplaceListing[]): MarketplaceListing[] {
  return listings.filter(
    (listing) =>
      listing.categoryId.startsWith('movie-') ||
      listing.entityType === 'event' ||
      listing.customFieldValues?.sectionType === 'movies'
  );
}

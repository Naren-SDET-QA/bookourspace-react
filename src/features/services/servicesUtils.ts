import { MarketplaceListing } from '../../types/marketplace';
import { servicesCategories } from '../../data/servicesStayMoviesData';

export interface ServiceSearchFilters {
  query: string;
  categoryId: string;
  verifiedOnly: boolean;
  minimumRating: number;
  page: number;
  pageSize: number;
  categoryIds?: readonly string[];
}

export interface ServicePriceBreakdown {
  baseAmount: number;
  platformFee: number;
  taxes: number;
  total: number;
}

const normalize = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('en-IN');
const serviceCategoryIds = new Set(servicesCategories.map((category) => category.id));

export function filterServiceListings(
  listings: MarketplaceListing[],
  filters: ServiceSearchFilters
) {
  const query = normalize(filters.query);
  const matching = listings.filter((listing) => {
    if (
      listing.status !== 'active' ||
      listing.entityType !== 'service' ||
      !serviceCategoryIds.has(listing.categoryId)
    ) {
      return false;
    }
    if (filters.categoryId !== 'all' && listing.categoryId !== filters.categoryId) return false;
    if (filters.categoryIds && !filters.categoryIds.includes(listing.categoryId)) return false;
    if (filters.verifiedOnly && !listing.isVerified) return false;
    if (listing.providerRating < filters.minimumRating) return false;

    if (!query) return true;
    return [
      listing.title,
      listing.description,
      listing.subcategory,
      listing.providerName,
      listing.location.city,
      listing.location.area,
    ].some((field) => normalize(field).includes(query));
  });

  const start = Math.max(0, (filters.page - 1) * filters.pageSize);
  return {
    total: matching.length,
    items: matching.slice(start, start + filters.pageSize),
    hasNextPage: start + filters.pageSize < matching.length,
  };
}

export function buildServicePriceBreakdown(listing: MarketplaceListing): ServicePriceBreakdown {
  const breakdown = listing.priceBreakdown;
  const baseAmount = Number(breakdown?.baseRent ?? listing.price);
  const platformFee = Number(breakdown?.serviceFee ?? 0);
  const taxes = Number(breakdown?.taxes ?? 0);
  return {
    baseAmount,
    platformFee,
    taxes,
    total: baseAmount + platformFee + taxes,
  };
}

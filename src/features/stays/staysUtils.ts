import { MarketplaceListing } from '../../types/marketplace';

export type StayTypeId =
  | 'all'
  | 'hotels'
  | 'home_stays'
  | 'flats'
  | 'apartments'
  | 'villas'
  | 'resorts'
  | 'lodges';

export interface StayTypeOption {
  id: Exclude<StayTypeId, 'all'>;
  label: string;
  teLabel: string;
  description: string;
  emoji: string;
}

export const stayTypeOptions: StayTypeOption[] = [
  { id: 'hotels', label: 'Hotels', teLabel: 'హోటల్స్', description: 'Reliable stays for every trip', emoji: '🏨' },
  { id: 'home_stays', label: 'Home Stays', teLabel: 'హోమ్ స్టేస్', description: 'Local comfort and warm hosts', emoji: '🏡' },
  { id: 'flats', label: 'Flats', teLabel: 'ఫ్లాట్స్', description: 'Entire homes with everyday space', emoji: '🏢' },
  { id: 'apartments', label: 'Apartments', teLabel: 'అపార్ట్‌మెంట్స్', description: 'Furnished stays for longer visits', emoji: '🛋️' },
  { id: 'villas', label: 'Villas', teLabel: 'విల్లాస్', description: 'Private space for groups', emoji: '🏠' },
  { id: 'resorts', label: 'Resorts', teLabel: 'రిసార్ట్స్', description: 'Relaxed stays with amenities', emoji: '🌴' },
  { id: 'lodges', label: 'Lodges', teLabel: 'లాడ్జెస్', description: 'Simple stays close to the road', emoji: '🛏️' },
];

export interface StaySearchFilters {
  query: string;
  stayType: StayTypeId;
  guests: number;
  minimumRating: number;
  page: number;
  pageSize: number;
}

export interface StaySearchResult {
  items: MarketplaceListing[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

export interface StayPriceBreakdown {
  nightlyRate: number;
  nights: number;
  baseAmount: number;
  cleaningFee: number;
  serviceFee: number;
  taxes: number;
  total: number;
}

const textOf = (listing: MarketplaceListing) =>
  [
    listing.title,
    listing.description,
    listing.subcategory,
    listing.location?.area,
    listing.location?.city,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const categoryOf = (listing: MarketplaceListing) =>
  `${listing.categoryId} ${listing.subcategory}`.toLowerCase();

const isStayListing = (listing: MarketplaceListing) =>
  listing.status === 'active' &&
  (listing.categoryId.startsWith('hotel-') || listing.customFieldValues?.sectionType === 'hotel_stay');

const firstNumber = (value: unknown, fallback: number) => {
  const match = String(value ?? '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
};

export function getStayTypeForListing(listing: MarketplaceListing): Exclude<StayTypeId, 'all'> {
  const category = categoryOf(listing);
  const title = textOf(listing);

  if (category.includes('resort') || title.includes('resort')) return 'resorts';
  if (category.includes('villa') || title.includes('villa')) return 'villas';
  if (title.includes('apartment') || category.includes('apartment')) return 'apartments';
  if (category.includes('flat')) return 'flats';
  if (category.includes('service-apt')) return 'apartments';
  if (category.includes('homestay') || category.includes('home stay') || title.includes('home stay')) {
    return 'home_stays';
  }
  if (category.includes('hourly') || category.includes('lodge') || title.includes('lodge')) return 'lodges';
  return 'hotels';
}

export function filterStayListings(
  listings: MarketplaceListing[],
  filters: StaySearchFilters
): StaySearchResult {
  const normalizedQuery = filters.query.trim().toLowerCase();
  const filtered = listings.filter((listing) => {
    if (!isStayListing(listing)) return false;
    if (filters.stayType !== 'all' && getStayTypeForListing(listing) !== filters.stayType) return false;
    if (normalizedQuery && !textOf(listing).includes(normalizedQuery)) return false;
    if (listing.providerRating < filters.minimumRating) return false;

    const capacity = firstNumber(
      listing.customFieldValues?.guestCapacityEn || listing.customFieldValues?.guestCapacity,
      2
    );
    return capacity >= Math.max(1, filters.guests);
  });

  const pageSize = Math.max(1, Math.floor(filters.pageSize));
  const page = Math.max(1, Math.floor(filters.page));
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    hasNextPage: start + pageSize < filtered.length,
  };
}

export function buildStayPriceBreakdown(
  listing: MarketplaceListing,
  nights: number
): StayPriceBreakdown {
  const nightlyRate = Math.max(
    0,
    Number(listing.customFieldValues?.dailyPrice || listing.price) || 0
  );
  const safeNights = Math.max(1, Math.floor(nights));
  const baseAmount = nightlyRate * safeNights;
  const cleaningFee = Math.round(baseAmount * 0.05);
  const serviceFee = Math.round(baseAmount * 0.08);
  const taxes = Math.round((baseAmount + cleaningFee + serviceFee) * 0.12);

  return {
    nightlyRate,
    nights: safeNights,
    baseAmount,
    cleaningFee,
    serviceFee,
    taxes,
    total: baseAmount + cleaningFee + serviceFee + taxes,
  };
}


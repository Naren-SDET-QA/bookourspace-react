import type { MarketplaceListing } from '../types/marketplace';
import { servicesCategories } from '../data/servicesStayMoviesData';

/**
 * Section view models for the PG and home-services experiences.
 *
 * Everything here is pure: it maps listings the application has already loaded
 * into the shapes the new screens render. No extra queries, no new tables and
 * no invented values — a field that is absent in the listing payload comes back
 * as `null` so the UI can say "not provided" instead of guessing.
 */

export const SECTION_PAGE_SIZE = 9;

export type SectionState = 'loading' | 'error' | 'empty' | 'results';

export interface DetailRow {
  label: string;
  value: string;
}

export type PgGender = 'boys' | 'girls' | 'co-living' | 'unspecified';
export type PgGenderFilter = 'all' | 'boys' | 'girls' | 'co-living';
export type PgSharingFilter = 'all' | 'single' | '2' | '3' | '4';

export interface PgCard {
  id: string;
  title: string;
  subcategory: string;
  locality: string;
  city: string;
  rentRupees: number | null;
  rentUnit: string;
  gender: PgGender;
  genderPolicy: string;
  sharingText: string;
  deposit: string | null;
  food: string | null;
  attachedBath: string | null;
  bedsAvailable: number | null;
  verified: boolean;
  photo: string | null;
  photos: string[];
  photoCount: number;
  description: string;
  facilities: DetailRow[];
  rules: DetailRow[];
  providerName: string;
}

export interface PgFilters {
  query: string;
  gender: PgGenderFilter;
  sharing: PgSharingFilter;
  maxRent: number | null;
  foodOnly: boolean;
  attachedBathOnly: boolean;
}

export interface ServiceCard {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  categoryEmoji: string;
  subcategory: string;
  locality: string;
  city: string;
  priceRupees: number | null;
  priceUnit: string;
  priceLabel: string;
  quoteOnly: boolean;
  verified: boolean;
  rating: number | null;
  reviewCount: number;
  photo: string | null;
  photos: string[];
  photoCount: number;
  description: string;
  highlights: DetailRow[];
  providerName: string;
}

export interface ServiceFilters {
  query: string;
  categoryId: string;
  verifiedOnly: boolean;
  maxPrice: number | null;
  quoteOnly: boolean;
}

const FACILITY_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['foodIncluded', 'Food'],
  ['wifiSpeed', 'Internet'],
  ['housekeeping', 'Housekeeping'],
  ['laundryFacility', 'Laundry'],
  ['powerBackup', 'Power backup'],
  ['attachedWashroom', 'Bathroom'],
];

const RULE_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['noticePeriod', 'Notice period'],
  ['gateClosingTime', 'Gate timing'],
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
}

export function formatInr(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function isPgListing(listing: MarketplaceListing): boolean {
  const section = String(listing.customFieldValues?.sectionType ?? '');
  return listing.categoryId.startsWith('pg-') || section === 'pg_hostels';
}

export function isServiceListing(listing: MarketplaceListing): boolean {
  const section = String(listing.customFieldValues?.sectionType ?? '');
  if (section === 'services') return true;
  return servicesCategories.some((category) => category.id === listing.categoryId);
}

/** Gender policy comes from the listing's own payload first, then its category. */
export function pgGenderOf(listing: MarketplaceListing): PgGender {
  const policy = text(listing.customFieldValues?.genderPolicy);
  const haystack = `${policy} ${listing.categoryId} ${listing.subcategory}`.toLowerCase();
  if (/(co-living|coliving|co living|mixed|unisex|co-ed)/.test(haystack)) return 'co-living';
  if (/(women|woman|girls|female|lady|mahila)/.test(haystack)) return 'girls';
  if (/(men|man|boys|male|gents)/.test(haystack)) return 'boys';
  return 'unspecified';
}

export function pgGenderLabel(gender: PgGender): string {
  if (gender === 'boys') return 'Boys';
  if (gender === 'girls') return 'Girls';
  if (gender === 'co-living') return 'Co-living';
  return 'PG';
}

/** "2-Sharing" style options, read from the payload text that actually exists. */
export function matchesPgSharing(sharingText: string, filter: PgSharingFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'single') return /single\s*(room|occupancy|sharing)?/i.test(sharingText);
  return new RegExp(`${filter}\\s*-?\\s*sharing`, 'i').test(sharingText);
}

export function parsePgListing(listing: MarketplaceListing): PgCard {
  const fields = listing.customFieldValues ?? {};
  const images = Array.isArray(listing.images) ? listing.images.filter((src) => text(src)) : [];
  const sharingText = `${text(fields.roomTypesAvailable)} ${text(fields.sharingHighlight)}`.trim();
  return {
    id: listing.id,
    title: listing.title,
    subcategory: listing.subcategory,
    locality: text(listing.location?.area),
    city: text(listing.location?.city),
    rentRupees: isPositiveNumber(listing.price) ? listing.price : null,
    rentUnit: text(listing.priceUnit) || '/month',
    gender: pgGenderOf(listing),
    genderPolicy: text(fields.genderPolicy),
    sharingText,
    deposit: text(fields.securityDeposit) || null,
    food: text(fields.foodIncluded) || null,
    attachedBath: text(fields.attachedWashroom) || null,
    bedsAvailable: typeof fields.bedsAvailable === 'number' ? fields.bedsAvailable : null,
    verified: listing.isVerified === true,
    photo: images[0] ?? null,
    photos: images,
    photoCount: images.length,
    description: listing.description,
    facilities: FACILITY_FIELDS.flatMap(([key, label]) => {
      const value = text(fields[key]);
      return value ? [{ label, value }] : [];
    }),
    rules: RULE_FIELDS.flatMap(([key, label]) => {
      const value = text(fields[key]);
      return value ? [{ label, value }] : [];
    }),
    providerName: text(listing.providerName),
  };
}

export function filterPgListings(cards: readonly PgCard[], filters: PgFilters): PgCard[] {
  const query = filters.query.trim().toLowerCase();
  return cards.filter((card) => {
    if (filters.gender !== 'all' && card.gender !== filters.gender) return false;
    if (!matchesPgSharing(card.sharingText, filters.sharing)) return false;
    if (filters.maxRent !== null) {
      if (card.rentRupees === null || card.rentRupees > filters.maxRent) return false;
    }
    if (filters.foodOnly && !/^\s*yes/i.test(card.food ?? '')) return false;
    if (filters.attachedBathOnly && !/^\s*yes/i.test(card.attachedBath ?? '')) return false;
    if (!query) return true;
    return [card.title, card.subcategory, card.locality, card.city, card.providerName]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

function quoteUnit(priceUnit: string): boolean {
  return /negotiable|quote|quotation|project|custom/i.test(priceUnit);
}

export function parseServiceListing(listing: MarketplaceListing): ServiceCard {
  const category = servicesCategories.find((item) => item.id === listing.categoryId);
  const fields = listing.customFieldValues ?? {};
  const images = Array.isArray(listing.images) ? listing.images.filter((src) => text(src)) : [];
  const priceRupees = isPositiveNumber(listing.price) ? listing.price : null;
  const priceUnit = text(listing.priceUnit);
  const quoteOnly = priceRupees === null || quoteUnit(priceUnit);
  const rating = isPositiveNumber(listing.providerRating) && listing.reviewCount > 0 ? listing.providerRating : null;
  const priceLabel = quoteOnly || priceRupees === null
    ? 'Request a quote'
    : `${formatInr(priceRupees) ?? ''}${priceUnit ? ` ${priceUnit}` : ''}`.trim();

  return {
    id: listing.id,
    title: listing.title,
    categoryId: listing.categoryId,
    categoryName: category?.name ?? listing.subcategory ?? 'Home service',
    categoryEmoji: category?.emoji ?? '🛠️',
    subcategory: listing.subcategory,
    locality: text(listing.location?.area),
    city: text(listing.location?.city),
    priceRupees,
    priceUnit,
    priceLabel,
    quoteOnly,
    verified: listing.isVerified === true,
    rating,
    reviewCount: Number.isFinite(listing.reviewCount) ? listing.reviewCount : 0,
    photo: images[0] ?? null,
    photos: images,
    photoCount: images.length,
    description: listing.description,
    highlights: Object.entries(fields)
      .flatMap(([key, value]) => {
        const rendered = typeof value === 'string' ? value.trim() : '';
        return rendered ? [{ label: humanizeKey(key), value: rendered }] : [];
      })
      .slice(0, 4),
    providerName: text(listing.providerName),
  };
}

export function filterServiceListings(cards: readonly ServiceCard[], filters: ServiceFilters): ServiceCard[] {
  const query = filters.query.trim().toLowerCase();
  return cards.filter((card) => {
    if (filters.categoryId !== 'all' && card.categoryId !== filters.categoryId) return false;
    if (filters.verifiedOnly && !card.verified) return false;
    if (filters.quoteOnly && !card.quoteOnly) return false;
    if (filters.maxPrice !== null) {
      if (card.priceRupees === null || card.priceRupees > filters.maxPrice) return false;
    }
    if (!query) return true;
    return [card.title, card.subcategory, card.categoryName, card.locality, card.city, card.providerName]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

export function serviceCategoryCounts(cards: readonly ServiceCard[]): Array<{
  id: string;
  name: string;
  emoji: string;
  count: number;
}> {
  return servicesCategories.map((category) => ({
    id: category.id,
    name: category.name,
    emoji: category.emoji,
    count: cards.filter((card) => card.categoryId === category.id).length,
  }));
}

export function pageCount(total: number, size = SECTION_PAGE_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.ceil(total / size);
}

export function paginate<T>(items: readonly T[], page: number, size = SECTION_PAGE_SIZE): T[] {
  const safePage = Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));
  return items.slice(safePage * size, (safePage + 1) * size);
}

export function resolveSectionState(loading: boolean, error: boolean, count: number): SectionState {
  if (loading) return 'loading';
  if (error) return 'error';
  return count === 0 ? 'empty' : 'results';
}

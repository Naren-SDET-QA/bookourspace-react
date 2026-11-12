import type { MarketplaceListing } from '../types/marketplace';
import { servicesCategories } from '../data/servicesStayMoviesData';
import { listingImageSources } from './media/signedStorageUrl';

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
export type PgSharingFilter = 'all' | 'single' | '2' | '3' | '4' | 'multiple';
export type PgAcFilter = 'any' | 'ac' | 'non-ac';
export type PgBathroomFilter = 'any' | 'attached' | 'common';
export type PgOccupantFilter = 'any' | 'student' | 'working';
export type PgKindFilter = 'any' | 'pg' | 'hostel';
export type PgBathroomKind = 'attached' | 'common' | 'mixed' | null;
export type PgOccupant = 'student' | 'working' | 'mixed' | null;
export type PgKind = 'pg' | 'hostel' | null;

export interface PgRoomTypePrice {
  label: string;
  price: number | null;
  deposit: string | null;
}

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
  acText: string;
  hasAc: boolean;
  hasNonAc: boolean;
  bathroomKind: PgBathroomKind;
  occupant: PgOccupant;
  kind: PgKind;
  bedsAvailable: number | null;
  verified: boolean;
  photo: string | null;
  photos: string[];
  photoCount: number;
  description: string;
  facilities: DetailRow[];
  rules: DetailRow[];
  providerName: string;
  /** Full owner-supplied detail used by the common PG property page. */
  availableFor: string;
  preferredTenant: string;
  availableFrom: string;
  totalCapacity: number | null;
  parking: string;
  roomCleaning: string;
  noticePeriod: string;
  gateClosingTime: string;
  powerBackup: string;
  wifi: string;
  bathroom: string;
  housekeeping: string;
  roomTypes: PgRoomTypePrice[];
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewCount: number;
}

export interface PgFilters {
  query: string;
  gender: PgGenderFilter;
  sharing: PgSharingFilter;
  maxRent: number | null;
  foodOnly: boolean;
  attachedBathOnly: boolean;
  /** Optional so existing callers keep the documented default of "any". */
  ac?: PgAcFilter;
  bathroom?: PgBathroomFilter;
  occupant?: PgOccupantFilter;
  kind?: PgKindFilter;
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
  ['acType', 'Air conditioning'],
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
  // The PostgreSQL public feed keeps the reviewed payload under `attributes`
  // and also spreads it onto the listing; dynamic category ids are not in the
  // built-in catalog, so the section marker must be honoured in both places.
  const section = String(
    listing.customFieldValues?.sectionType
      ?? (listing as MarketplaceListing & { sectionType?: unknown }).sectionType
      ?? '',
  );
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
  // "Multiple" is the 4+ bucket: dormitory or any 4-or-more sharing label.
  if (filter === 'multiple') return /multiple|dormitory|[4-9]\s*-?\s*sharing/i.test(sharingText);
  return new RegExp(`${filter}\\s*-?\\s*sharing`, 'i').test(sharingText);
}

/** AC and Non-AC are independent: "AC & Non-AC" genuinely offers both. */
function acFlags(rawText: string): { hasAc: boolean; hasNonAc: boolean } {
  const haystack = rawText.toLowerCase();
  const hasNonAc = /non[\s-]?ac\b/.test(haystack);
  const hasAc = /\bac\b/.test(haystack.replace(/non[\s-]?ac\b/g, ' '));
  return { hasAc, hasNonAc };
}

/** Bathroom wording comes only from the owner's own field. */
export function pgBathroomKindOf(value: string): PgBathroomKind {
  const text = value.toLowerCase();
  if (!text) return null;
  const attached = /attached/.test(text);
  const common = /common|shared|public/.test(text);
  if (attached && common) return 'mixed';
  if (attached) return 'attached';
  if (common) return 'common';
  return null;
}

/** Student/working-professional audience, read from owner-supplied wording. */
export function pgOccupantOf(rawText: string): PgOccupant {
  const text = rawText.toLowerCase();
  if (!text) return null;
  const student = /student|coaching|college|academic/.test(text);
  const working = /working|professional|employee|corporate|it\s|\bit\b/.test(text);
  if (student && working) return 'mixed';
  if (student) return 'student';
  if (working) return 'working';
  return null;
}

/** Hostel versus PG, from the listing's own category/subcategory/type wording. */
export function pgKindOf(rawText: string): PgKind {
  const text = rawText.toLowerCase();
  if (/hostel|dormitory/.test(text)) return 'hostel';
  if (/paying\s*guest|\bpg\b|pg[-_]/.test(text)) return 'pg';
  return null;
}

function boundedNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function parenthetical(value: string): string {
  const match = /\(([^)]+)\)/.exec(value);
  return match ? match[1].trim() : '';
}

function parseRoomTypePrices(
  highlight: string,
  sharingText: string,
  rent: number | null,
  deposit: string | null,
): PgRoomTypePrice[] {
  const rows: PgRoomTypePrice[] = [];
  const pattern = /([^|,]+?)\s*:\s*₹\s*([\d,]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(highlight)) !== null) {
    const label = match[1].trim().replace(/^[-•\s]+/, '').slice(0, 60);
    const price = Number(match[2].replace(/,/g, ''));
    if (!label || !Number.isFinite(price) || price <= 0) continue;
    rows.push({ label, price, deposit });
  }
  if (rows.length > 0) return rows;
  return [{ label: sharingText || 'Room type as listed', price: rent, deposit }];
}

export function parsePgListing(listing: MarketplaceListing): PgCard {
  const fields = listing.customFieldValues ?? {};
  const images = listingImageSources(listing.images, listing);
  const sharingText = `${text(fields.roomTypesAvailable)} ${text(fields.sharingHighlight)}`.trim();
  const acText = `${text(fields.acType)} ${text(fields.roomTypesAvailable)}`.trim();
  const { hasAc, hasNonAc } = acFlags(acText);
  // Do not infer a resident audience from a loosely named subcategory. Only
  // structured owner-provided audience fields are specific enough to filter.
  const audienceText = `${text(fields.occupantType)} ${text(fields.genderPolicy)}`;
  const gender = pgGenderOf(listing);
  const occupant = pgOccupantOf(audienceText);
  const facilities = FACILITY_FIELDS.flatMap(([key, label]) => {
    const value = text(fields[key]);
    return value ? [{ label, value }] : [];
  });
  const rules = RULE_FIELDS.flatMap(([key, label]) => {
    const value = text(fields[key]);
    return value ? [{ label, value }] : [];
  });
  const facilityValue = (label: string) => facilities.find((row) => row.label === label)?.value || '';
  const ruleValue = (label: string) => rules.find((row) => row.label === label)?.value || '';
  const genderPolicy = text(fields.genderPolicy);
  const sharingTextForRoomTypes = sharingText;
  const deposit = text(fields.securityDeposit) || null;
  const preferredTenant = text(fields.preferredTenant)
    || text(fields.occupantType)
    || parenthetical(genderPolicy)
    || (occupant === 'student' ? 'Students'
      : occupant === 'working' ? 'Working professionals'
        : occupant === 'mixed' ? 'Students & working professionals'
          : '');
  return {
    id: listing.id,
    title: listing.title,
    subcategory: listing.subcategory,
    locality: text(listing.location?.area),
    city: text(listing.location?.city),
    rentRupees: isPositiveNumber(listing.price) ? listing.price : null,
    rentUnit: text(listing.priceUnit) || '/month',
    gender,
    genderPolicy,
    sharingText,
    deposit,
    food: text(fields.foodIncluded) || null,
    attachedBath: text(fields.attachedWashroom) || null,
    acText,
    hasAc,
    hasNonAc,
    bathroomKind: pgBathroomKindOf(text(fields.attachedWashroom)),
    occupant,
    kind: pgKindOf(`${listing.categoryId} ${listing.subcategory} ${text(fields.propertyType)}`),
    bedsAvailable: typeof fields.bedsAvailable === 'number' ? fields.bedsAvailable : null,
    verified: listing.isVerified === true,
    photo: images[0] ?? null,
    photos: images,
    photoCount: images.length,
    description: listing.description,
    facilities,
    rules,
    providerName: text(listing.providerName),
    availableFor: genderPolicy || pgGenderLabel(gender),
    preferredTenant,
    availableFrom: text(fields.availableFrom) || text(fields.availableDate) || text(fields.moveInDate),
    totalCapacity: boundedNumber(fields.totalCapacity),
    parking: text(fields.parking) || text(fields.parkingFacility) || facilityValue('Parking'),
    roomCleaning: text(fields.roomCleaning) || facilityValue('Housekeeping'),
    noticePeriod: ruleValue('Notice period'),
    gateClosingTime: ruleValue('Gate timing'),
    powerBackup: facilityValue('Power backup'),
    wifi: facilityValue('Internet'),
    bathroom: facilityValue('Bathroom') || text(fields.attachedWashroom),
    housekeeping: facilityValue('Housekeeping'),
    roomTypes: parseRoomTypePrices(text(fields.sharingHighlight), sharingTextForRoomTypes, isPositiveNumber(listing.price) ? listing.price : null, deposit),
    lat: typeof listing.location?.lat === 'number' && Number.isFinite(listing.location.lat) ? listing.location.lat : null,
    lng: typeof listing.location?.lng === 'number' && Number.isFinite(listing.location.lng) ? listing.location.lng : null,
    rating: isPositiveNumber(listing.providerRating) && listing.reviewCount > 0 ? listing.providerRating : null,
    reviewCount: Number.isFinite(listing.reviewCount) ? listing.reviewCount : 0,
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
    if (filters.ac === 'ac' && !card.hasAc) return false;
    if (filters.ac === 'non-ac' && !card.hasNonAc) return false;
    if (filters.bathroom === 'attached' && card.bathroomKind !== 'attached' && card.bathroomKind !== 'mixed') return false;
    if (filters.bathroom === 'common' && card.bathroomKind !== 'common' && card.bathroomKind !== 'mixed') return false;
    if (filters.occupant === 'student' && card.occupant !== 'student' && card.occupant !== 'mixed') return false;
    if (filters.occupant === 'working' && card.occupant !== 'working' && card.occupant !== 'mixed') return false;
    if (filters.kind === 'pg' && card.kind !== 'pg') return false;
    if (filters.kind === 'hostel' && card.kind !== 'hostel') return false;
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
  const images = listingImageSources(listing.images, listing);
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

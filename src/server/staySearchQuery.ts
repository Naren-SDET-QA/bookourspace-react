import { stayAmenityKey } from '../lib/stayFilters';

/**
 * Pure parser for the public stay-search query.
 *
 * Everything that reaches SQL goes through this module so a malformed or
 * hostile query can never widen a statement. It is deliberately free of
 * Express/PostgreSQL imports so the rules can be unit-tested directly.
 */

export const PLACE_TYPES = ['entire_home', 'private_room', 'shared_room'] as const;
export const PROPERTY_TYPES = [
  'hotel',
  'resort',
  'homestay',
  'apartment',
  'villa',
  'guesthouse',
  'guest_house',
  'house',
  'flat',
  'lodge',
  'temple_stay',
] as const;
export const ACCESSIBILITY_KEYS = [
  'step_free_entrance',
  'accessible_parking',
  'wide_entrance',
  'accessible_bedroom',
  'accessible_bathroom',
  'grab_bars',
  'shower_chair',
  'hoist',
  'elevator',
] as const;
export const SORTS = ['recommended', 'price_asc', 'price_desc', 'rating'] as const;

export type StayPlaceType = (typeof PLACE_TYPES)[number];
export type StaySort = (typeof SORTS)[number];

export interface StaySearchQuery {
  destination: string;
  hostId: string | null;
  checkIn: string | null;
  checkOut: string | null;
  nights: number | null;
  guests: number | null;
  placeTypes: StayPlaceType[];
  propertyTypes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  priceBasis: 'nightly' | 'total';
  bedrooms: number;
  beds: number;
  bathrooms: number;
  amenities: string[];
  accessibility: string[];
  languages: string[];
  instantBook: boolean;
  selfCheckIn: boolean;
  petsAllowed: boolean;
  guestFavourite: boolean;
  luxeVerified: boolean;
  includeUnavailable: boolean;
  listingIds: string[];
  sort: StaySort;
  page: number;
  pageSize: number;
}

export interface StaySearchParseError {
  ok: false;
  error: string;
  message: string;
}

export type StaySearchParseResult =
  | { ok: true; query: StaySearchQuery }
  | StaySearchParseError;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGE_SIZE = 48;
const MAX_RANGE_NIGHTS = 365;
const MAX_PRICE_RUPEES = 10_000_000;

function first(value: unknown): string {
  if (Array.isArray(value)) return value.length ? String(value[0] ?? '') : '';
  return value === undefined || value === null ? '' : String(value);
}

function csv(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(',') : first(value);
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function bool(value: unknown): boolean {
  const text = first(value).trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes';
}

function integer(value: unknown): number | null {
  const text = first(value).trim();
  if (!text) return null;
  if (!/^\d{1,9}$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function sanitizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

export function parseStaySearchQuery(
  raw: Record<string, unknown>,
  todayIso: string
): StaySearchParseResult {
  const destination = first(raw.destination ?? raw.where ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 120);

  const hostIdRaw = first(raw.hostId ?? raw.host_id ?? '').trim().toLowerCase();
  if (hostIdRaw && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(hostIdRaw)) {
    return { ok: false, error: 'INVALID_HOST_ID', message: 'That host could not be resolved.' };
  }
  const checkIn = first(raw.checkIn ?? raw.check_in ?? '').trim();
  const checkOut = first(raw.checkOut ?? raw.check_out ?? '').trim();

  let nights: number | null = null;
  if (checkIn || checkOut) {
    if (!DATE.test(checkIn) || !DATE.test(checkOut)) {
      return { ok: false, error: 'INVALID_DATES', message: 'Both check-in and check-out are required as YYYY-MM-DD.' };
    }
    if (!DATE.test(todayIso)) {
      return { ok: false, error: 'INVALID_DATES', message: 'The server could not resolve today’s date.' };
    }
    if (checkIn < todayIso) {
      return { ok: false, error: 'CHECK_IN_IN_PAST', message: 'Check-in cannot be before today.' };
    }
    nights = daysBetween(checkIn, checkOut);
    if (nights <= 0) {
      return { ok: false, error: 'INVALID_DATE_ORDER', message: 'Check-out must be after check-in.' };
    }
    if (nights > MAX_RANGE_NIGHTS) {
      return { ok: false, error: 'RANGE_TOO_LONG', message: `Stays can be searched for up to ${MAX_RANGE_NIGHTS} nights.` };
    }
  }

  const guestsRaw = integer(raw.guests ?? raw.adults);
  if (guestsRaw !== null && (guestsRaw < 1 || guestsRaw > 16)) {
    return { ok: false, error: 'INVALID_GUESTS', message: 'Guests must be between 1 and 16.' };
  }

  const minPriceRaw = integer(raw.minPrice ?? raw.min_price);
  const maxPriceRaw = integer(raw.maxPrice ?? raw.max_price);
  if (minPriceRaw !== null && minPriceRaw > MAX_PRICE_RUPEES) {
    return { ok: false, error: 'INVALID_MIN_PRICE', message: 'The minimum price is too large.' };
  }
  if (maxPriceRaw !== null && maxPriceRaw > MAX_PRICE_RUPEES) {
    return { ok: false, error: 'INVALID_MAX_PRICE', message: 'The maximum price is too large.' };
  }
  if (minPriceRaw !== null && maxPriceRaw !== null && minPriceRaw > maxPriceRaw) {
    return { ok: false, error: 'INVALID_PRICE_RANGE', message: 'The minimum price cannot exceed the maximum price.' };
  }

  const placeTypes = csv(raw.placeTypes ?? raw.place_type)
    .map(sanitizeToken)
    .filter((value): value is StayPlaceType => (PLACE_TYPES as readonly string[]).includes(value));

  const propertyTypes = [...new Set(
    csv(raw.propertyTypes ?? raw.property_type)
      .map(sanitizeToken)
      .filter((value) => (PROPERTY_TYPES as readonly string[]).includes(value))
  )].sort();

  const accessibility = [...new Set(
    csv(raw.accessibility)
      .map(sanitizeToken)
      .filter((value) => (ACCESSIBILITY_KEYS as readonly string[]).includes(value))
  )].sort();

  const amenities = [...new Set(
    csv(raw.amenities)
      .map((value) => stayAmenityKey(value))
      .filter((value) => value.length > 0 && value.length <= 40)
  )].sort();

  const languages = [...new Set(
    csv(raw.languages ?? raw.host_language)
      .map(sanitizeToken)
      .filter(Boolean)
  )].sort();

  const bedrooms = integer(raw.bedrooms) ?? 0;
  const beds = integer(raw.beds) ?? 0;
  const bathrooms = integer(raw.bathrooms ?? raw.baths) ?? 0;
  const negativeRoom = [raw.bedrooms, raw.beds, raw.bathrooms ?? raw.baths]
    .some((value) => /^-\d+$/.test(first(value).trim()));
  if (negativeRoom || [bedrooms, beds, bathrooms].some((value) => value < 0 || value > 20)) {
    return { ok: false, error: 'INVALID_ROOM_COUNT', message: 'Room counts must be between 0 and 20.' };
  }

  const pageRaw = integer(raw.page) ?? 0;
  if (/^-\d+$/.test(first(raw.page).trim()) || pageRaw > 10_000) {
    return { ok: false, error: 'INVALID_PAGE', message: 'That page is out of range.' };
  }
  const pageSizeRaw = integer(raw.pageSize ?? raw.limit) ?? 24;
  if (pageSizeRaw < 1 || pageSizeRaw > MAX_PAGE_SIZE) {
    return { ok: false, error: 'INVALID_PAGE_SIZE', message: `Page size must be between 1 and ${MAX_PAGE_SIZE}.` };
  }

  const sortRaw = sanitizeToken(first(raw.sort ?? 'recommended'));
  const sort: StaySort = (SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as StaySort)
    : 'recommended';

  const priceBasis = first(raw.priceBasis ?? raw.price_basis).toLowerCase() === 'total'
    ? 'total'
    : 'nightly';

  const listingIds = [...new Set(
    csv(raw.listingIds ?? raw.listing_ids)
      .map((value) => value.trim())
      .filter((value) => /^[A-Za-z0-9._:-]{1,120}$/.test(value))
  )].slice(0, 80);

  return {
    ok: true,
    query: {
      destination,
      hostId: hostIdRaw || null,
      checkIn: checkIn || null,
      checkOut: checkOut || null,
      nights,
      guests: guestsRaw ?? null,
      placeTypes,
      propertyTypes,
      minPrice: minPriceRaw,
      maxPrice: maxPriceRaw,
      priceBasis,
      bedrooms,
      beds,
      bathrooms,
      amenities,
      accessibility,
      languages,
      instantBook: bool(raw.instantBook),
      selfCheckIn: bool(raw.selfCheckIn),
      petsAllowed: bool(raw.petsAllowed),
      guestFavourite: bool(raw.guestFavourite),
      luxeVerified: bool(raw.luxeVerified),
      includeUnavailable: bool(raw.includeUnavailable),
      listingIds,
      sort,
      page: pageRaw,
      pageSize: pageSizeRaw,
    },
  };
}

/** Local calendar date in Asia/Kolkata, independent of the host timezone. */
export function istTodayIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

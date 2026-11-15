import { toApiQuery, type StayFilters } from './stayFilters';
import type { StayProperty, StayRoomType } from './stayDiscoveryData';

/**
 * Browser client for `/api/stays/search`, `/calendar` and `/reviews`.
 *
 * The server is the only source of listings, counts and availability. This
 * module performs no local filtering, so a chip can never disagree with the
 * result count.
 */

export interface StaySearchRoomType extends StayRoomType {
  bedrooms: number;
  beds: number;
  bathrooms: number;
  availableUnits: number | null;
}

export interface StaySearchItem {
  id: string;
  listingId: string;
  name: string;
  demo: boolean;
  /** True only when the server runs the explicit local demo-booking preview. */
  demoBookable?: boolean;
  localTestFixture: boolean;
  propertyType: string;
  placeType: 'entire_home' | 'private_room' | 'shared_room';
  city: string;
  area: string;
  address: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  checkInTime: string;
  checkOutTime: string;
  taxPercent: number;
  cleaningFeePaise: number;
  serviceFeeBps: number;
  amenities: string[];
  accessibility: string[];
  hostLanguages: string[];
  hostId: string;
  hostName: string;
  hostAvatarUrl: string;
  instantBook: boolean;
  selfCheckIn: boolean;
  petsAllowed: boolean;
  guestFavourite: boolean;
  luxeVerified: boolean;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  maxGuests: number;
  cancellationPolicy: string;
  cancellationFreeHours: number;
  priceFromPaise: number;
  listingPriceAmount: number | null;
  listingPriceUnit: string;
  rating: number;
  reviewCount: number;
  availableUnits: number | null;
  minAvailablePricePaise: number | null;
  images: string[];
  roomTypes: StaySearchRoomType[];
}

export interface StaySearchResponse {
  ok: true;
  source: 'postgresql';
  generatedAt: string;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  nights: number | null;
  destination: string;
  fixtures?: boolean;
  liveInventory?: boolean;
  items: StaySearchItem[];
}

export interface StayHostProfile {
  ok: true;
  host: {
    id: string;
    name: string;
    avatarUrl: string;
    city: string;
    verified: boolean;
    languages: string[];
    activeStays: number;
    rating: number;
    reviewCount: number;
  };
  listings: Array<{
    listingId: string;
    name: string;
    propertyType: string;
    placeType: string;
    city: string;
    area: string;
    priceFromPaise: number;
    guestFavourite: boolean;
    images: string[];
  }>;
}

export interface StayCalendarNight {
  date: string;
  availableUnits: number;
  totalUnits: number;
  minPricePaise: number | null;
}

export interface StayCalendarResponse {
  ok: true;
  listingId: string;
  from: string;
  to: string;
  nights: StayCalendarNight[];
}

export interface StayReview {
  id: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;
  hostReply: string;
}

export interface StayReviewsResponse {
  ok: true;
  listingId: string;
  rating: number;
  reviewCount: number;
  reviews: StayReview[];
}

export interface StaySearchFailure {
  ok: false;
  error: string;
  message: string;
  status: number;
}

export type StaySearchResult = StaySearchResponse | StaySearchFailure;
export type StayCalendarResult = StayCalendarResponse | StaySearchFailure;
export type StayReviewsResult = StayReviewsResponse | StaySearchFailure;

async function request<T>(path: string, signal?: AbortSignal): Promise<T | StaySearchFailure> {
  try {
    const response = await fetch(path, {
      signal,
      headers: { Accept: 'application/json' },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      return {
        ok: false,
        error: String(body?.error || `HTTP_${response.status}`),
        message: String(body?.message || 'The stay search could not be completed.'),
        status: response.status,
      };
    }
    return body as T;
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      return { ok: false, error: 'ABORTED', message: 'Search was replaced.', status: 0 };
    }
    return {
      ok: false,
      error: 'NETWORK_ERROR',
      message: 'The server could not be reached. No stays are being shown as available.',
      status: 0,
    };
  }
}

export function searchStays(
  filters: StayFilters,
  options: { page?: number; pageSize?: number; signal?: AbortSignal } = {}
): Promise<StaySearchResult> {
  const query = toApiQuery(filters);
  query.set('page', String(options.page ?? 0));
  query.set('pageSize', String(options.pageSize ?? 24));
  return request<StaySearchResponse>(`/api/stays/search?${query.toString()}`, options.signal);
}

export function searchStaysByListingIds(
  listingIds: string[],
  signal?: AbortSignal,
): Promise<StaySearchResult> {
  const ids = [...new Set(listingIds.map((id) => id.trim()).filter(Boolean))].slice(0, 80);
  if (ids.length === 0) {
    return Promise.resolve({
      ok: true,
      source: 'postgresql',
      generatedAt: new Date().toISOString(),
      page: 0,
      pageSize: 0,
      total: 0,
      hasMore: false,
      nights: null,
      destination: '',
      items: [],
    });
  }
  const query = new URLSearchParams();
  query.set('listingIds', ids.join(','));
  query.set('page', '0');
  query.set('pageSize', String(Math.min(48, Math.max(ids.length, 1))));
  query.set('includeUnavailable', '1');
  return request<StaySearchResponse>(`/api/stays/search?${query.toString()}`, signal);
}

export function fetchStayHostProfile(hostId: string, signal?: AbortSignal): Promise<StayHostProfile | StaySearchFailure> {
  return request<StayHostProfile>(`/api/stays/hosts/${encodeURIComponent(hostId)}`, signal);
}

export function fetchStayCalendar(
  listingId: string,
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<StayCalendarResult> {
  const query = new URLSearchParams({ from, to });
  return request<StayCalendarResponse>(
    `/api/stays/${encodeURIComponent(listingId)}/calendar?${query.toString()}`,
    signal
  );
}

export function fetchStayReviews(
  listingId: string,
  limit = 8,
  signal?: AbortSignal
): Promise<StayReviewsResult> {
  const query = new URLSearchParams({ limit: String(limit) });
  return request<StayReviewsResponse>(
    `/api/stays/${encodeURIComponent(listingId)}/reviews?${query.toString()}`,
    signal
  );
}

/** Adapt a search row to the shape the existing checkout panel consumes. */
export function toStayProperty(item: StaySearchItem): StayProperty {
  return {
    id: item.id,
    listingId: item.listingId,
    name: item.name,
    propertyType: item.propertyType,
    city: item.city,
    area: item.area,
    address: item.address,
    description: item.description,
    amenities: item.amenities,
    basePricePaise: item.priceFromPaise,
    listingPriceAmount: item.listingPriceAmount ?? undefined,
    listingPriceUnit: item.listingPriceUnit || undefined,
    checkInTime: item.checkInTime,
    checkOutTime: item.checkOutTime,
    images: item.images,
    roomTypes: item.roomTypes,
    demo: item.demo === true,
    demoBookable: item.demoBookable === true,
    localTestFixture: item.localTestFixture === true,
  };
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

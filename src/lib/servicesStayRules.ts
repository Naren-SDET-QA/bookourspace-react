import { resolveModuleAccess, toDayNumber } from '../server/moduleGate';
import type { ModuleAccess, ModuleFlagRow } from '../server/moduleGate';

export type ServicesModuleKey =
  | 'services'
  | 'hotels'
  | 'pg'
  | 'function_hall'
  | 'classes'
  | 'movies'
  | 'ecommerce';

export type DiscoverySection =
  | 'services'
  | 'hotel_stay'
  | 'pg_hostels'
  | 'venues'
  | 'classes'
  | 'movies';

export interface StayContactDetails {
  available: boolean;
  phone?: string | null;
  whatsapp?: string | null;
  disclaimer?: string;
}

export type StayScreenState = 'loading' | 'error' | 'empty' | 'results';

export function resolveServicesModuleAccess(
  flags: readonly ModuleFlagRow[] | null | undefined,
  key: ServicesModuleKey
): ModuleAccess {
  return resolveModuleAccess(flags, key);
}

export function getDiscoverySection(key: ServicesModuleKey): DiscoverySection | null {
  const sections: Partial<Record<ServicesModuleKey, DiscoverySection>> = {
    services: 'services',
    hotels: 'hotel_stay',
    pg: 'pg_hostels',
    function_hall: 'venues',
    classes: 'classes',
    movies: 'movies',
  };
  return sections[key] ?? null;
}

/**
 * `public.listings.id` is TEXT, and real identifiers are not uuid-shaped
 * (`hotel-budget`, `listing-contact-text-001`). An earlier uuid-only regex
 * rejected every genuine id; migration 003 aligned the RPCs with the same
 * TEXT contract. Reject only values that could never be a stored id.
 */
export function isValidListingContactId(listingId: string): boolean {
  if (typeof listingId !== 'string') return false;
  const trimmed = listingId.trim();
  if (!trimmed || trimmed.length > 128) return false;
  return !/[\u0000-\u001F\u007F]/.test(trimmed);
}

export function canContactOwner(
  access: ModuleAccess,
  details: StayContactDetails | null | undefined,
  isAuthenticated: boolean,
  channel: 'call' | 'whatsapp'
): boolean {
  if (!access.enabled || !access.contactOwner || !isAuthenticated || !details?.available) {
    return false;
  }
  const value = channel === 'call' ? details.phone : details.whatsapp;
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateStaySearch(
  destination: string,
  checkIn: string,
  checkOut: string,
  guests: number,
  today: string
): { ok: true } | { ok: false; message: string } {
  if (!destination.trim()) return { ok: false, message: 'Enter a destination to search.' };
  if (!checkIn || !checkOut) return { ok: false, message: 'Choose check-in and check-out dates.' };
  let checkInDay: number;
  let checkOutDay: number;
  let todayDay: number;
  try {
    checkInDay = toDayNumber(checkIn);
    checkOutDay = toDayNumber(checkOut);
    todayDay = toDayNumber(today);
    const normalized = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);
    if (normalized(checkInDay) !== checkIn || normalized(checkOutDay) !== checkOut || normalized(todayDay) !== today) {
      return { ok: false, message: 'Choose valid check-in and check-out dates.' };
    }
  } catch {
    return { ok: false, message: 'Choose valid check-in and check-out dates.' };
  }
  if (checkInDay < todayDay) return { ok: false, message: 'Check-in cannot be in the past.' };
  if (checkOutDay <= checkInDay) return { ok: false, message: 'Check-out must be after check-in.' };
  if (!Number.isInteger(guests) || guests < 1 || guests > 16) {
    return { ok: false, message: 'Choose between 1 and 16 guests.' };
  }
  return { ok: true };
}

export function resolveStayScreenState(
  loading: boolean,
  error: boolean,
  resultCount: number
): StayScreenState {
  if (loading) return 'loading';
  if (error) return 'error';
  return resultCount === 0 ? 'empty' : 'results';
}

/** This branch has no complete stay payment-and-confirmation workflow yet. */
export function canBookStayOnline(
  access: ModuleAccess,
  hasAvailableUnit: boolean,
  completeWorkflowAvailable: boolean
): boolean {
  return access.enabled && access.onlineBooking && hasAvailableUnit && completeWorkflowAvailable;
}

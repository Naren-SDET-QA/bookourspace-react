import { supabase } from './supabaseClient';
import type { ModuleFlagRow } from '../server/moduleGate';
import type { StayContactDetails } from './servicesStayRules';
import { FORMER_LOCAL_SERVICE_CATEGORY_IDS } from './formerLocalServices';
import type { FormerLocalServiceRow } from './formerLocalServices';
import { isRenderableListingImageSource } from './media/signedStorageUrl';

export const STAY_PAGE_SIZE = 24;

/**
 * A stay listing contributes exactly one photo. Images live inside
 * `listings.payload` (JSONB), so every extra URL is duplicated in the row,
 * the wire payload and the browser cache. One photo per listing keeps rows
 * small and matches what the marketplace can actually supply today.
 */
export const MAX_STAY_IMAGES = 1;
export const FORMER_LOCAL_SERVICES_PAGE_SIZE = 12;

export async function fetchFormerLocalServicesPage(page = 0): Promise<{
  rows: FormerLocalServiceRow[];
  total: number;
}> {
  if (!supabase) throw new Error('SUPABASE_UNAVAILABLE');
  const safePage = Math.max(0, Math.floor(page));
  const start = safePage * FORMER_LOCAL_SERVICES_PAGE_SIZE;
  const end = start + FORMER_LOCAL_SERVICES_PAGE_SIZE - 1;
  const { data, error, count } = await supabase
    .from('listings')
    .select('id, title, category_id, subcategory, price, price_unit, status, payload, provider_availability_status, is_verified', { count: 'exact' })
    .in('category_id', [...FORMER_LOCAL_SERVICE_CATEGORY_IDS])
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(start, end);

  if (error || !data) throw new Error('FORMER_LOCAL_SERVICES_UNAVAILABLE');
  return { rows: data as FormerLocalServiceRow[], total: count ?? data.length };
}

export interface StayRoomType {
  id: string;
  propertyId: string;
  name: string;
  maxAdults: number;
  maxChildren: number;
  basePricePaise: number;
  amenities: string[];
  /** Server-computed free units for the active date search, when present. */
  availableUnits?: number | null;
}

export interface StayProperty {
  id: string;
  listingId: string;
  name: string;
  propertyType: string;
  city: string;
  area: string;
  address: string;
  description: string;
  amenities: string[];
  basePricePaise: number;
  listingPriceAmount?: number;
  listingPriceUnit?: string;
  checkInTime: string;
  checkOutTime: string;
  images: string[];
  roomTypes: StayRoomType[];
  /** Illustrative preview inventory. */
  demo?: boolean;
  /** True only when the local preview allows booking demo inventory. */
  demoBookable?: boolean;
  /** Explicitly labeled local-only E2E listing; never a live marketplace property. */
  localTestFixture?: boolean;
}

export interface StayAvailability {
  roomTypeId: string;
  freeUnitCount: number;
}

export async function fetchPlatformModuleFlags(): Promise<ModuleFlagRow[]> {
  // The Express API is authoritative and reads the same public table, so prefer
  // it: this keeps module access working when the browser has no Supabase
  // client (local/staging) and avoids a second source of truth.
  try {
    const response = await fetch('/api/modules', { headers: { Accept: 'application/json' } });
    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload?.modules) && payload.modules.length > 0) {
        return payload.modules as ModuleFlagRow[];
      }
    }
  } catch {
    // Fall through to the Supabase client when the API is unreachable.
  }
  if (!supabase) throw new Error('MODULE_FLAGS_UNAVAILABLE');
  const { data, error } = await supabase
    .from('platform_module_flags')
    .select(
      'module_key, is_enabled, allow_contact_owner, allow_online_booking, requires_owner_approval, booking_approved_at'
    );
  if (error || !data) throw new Error('MODULE_FLAGS_UNAVAILABLE');
  return data as ModuleFlagRow[];
}

export async function updatePlatformModuleFlag(
  moduleKey: string,
  patch: { is_enabled?: boolean; allow_contact_owner?: boolean }
): Promise<ModuleFlagRow> {
  const client = supabase;
  if (!client) throw new Error('SUPABASE_UNAVAILABLE');
  const { data: authData, error: authError } = await client.auth.getUser();
  const user = authData.user;
  if (authError || !user) throw new Error('SUPABASE_AUTH_REQUIRED');

  // UI checks are for clear feedback only. The table's RLS policy still
  // performs the authoritative public.is_admin() check on every write.
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role, account_status')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || profile?.role !== 'admin' || profile.account_status !== 'active') {
    throw new Error('SUPABASE_ADMIN_REQUIRED');
  }

  const { data, error } = await client
    .from('platform_module_flags')
    .update({ ...patch, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('module_key', moduleKey)
    .select('module_key, is_enabled, allow_contact_owner, allow_online_booking, requires_owner_approval, booking_approved_at')
    .maybeSingle();
  if (error || !data) throw new Error('MODULE_FLAG_SAVE_FAILED');
  return data as ModuleFlagRow;
}

export function subscribeToPlatformModuleFlags(onChange: () => void): () => void {
  const client = supabase;
  if (!client) return () => {};
  const channel = client
    .channel('platform-module-flags-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_module_flags' }, onChange)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

function safeImages(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const row = payload as Record<string, unknown>;
  const candidates = [
    ...(Array.isArray(row.images) ? row.images : []),
    ...(typeof row.imageUrl === 'string' ? [row.imageUrl] : []),
  ];
  const usable = [...new Set(candidates.filter(isRenderableListingImageSource))];
  return usable.slice(0, MAX_STAY_IMAGES);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

/**
 * Stay categories appear under several ids across the registry and the
 * authoritative store (`hotel-budget`, `hotel_stay`, `stay-hotel`, ...).
 * Matching only `hotel-` hid real `stay-*` listings, so a verified stay never
 * reached discovery. Keep the match explicit and case-insensitive.
 */
export function isStayCategory(value: unknown): boolean {
  const id = String(value || '').trim().toLowerCase();
  if (!id) return false;
  return (
    /^hotel[-_]/.test(id)
    || /^stay[-_]/.test(id)
    || id === 'hotel'
    || id === 'stays'
    || id.endsWith('_stay')
    || id.includes('hotel')
  );
}

export async function fetchStayProperties(options: {
  destination: string;
  page?: number;
}): Promise<StayProperty[]> {
  const page = Math.max(0, Math.floor(options.page ?? 0));
  let postgresListings: StayProperty[] | null = null;
  try {
    const response = await fetch('/api/marketplace/listings', { headers: { Accept: 'application/json' } });
    if (response.ok) {
      const payload = await response.json();
      if ((payload?.source === 'postgresql' || payload?.source === 'authoritative-store') && Array.isArray(payload.listings)) {
        const destination = options.destination.trim().toLocaleLowerCase();
        postgresListings = payload.listings
          .filter((listing: any) => listing?.status === 'active' && isStayCategory(listing.categoryId))
          .filter((listing: any) => {
            const location = listing.attributes?.location && typeof listing.attributes.location === 'object' ? listing.attributes.location : {};
            const city = String(location.city || listing.attributes?.city || '').toLocaleLowerCase();
            return !destination || city.includes(destination);
          })
          .sort((left: any, right: any) => String(left.title || '').localeCompare(String(right.title || '')))
          .slice(page * STAY_PAGE_SIZE, (page + 1) * STAY_PAGE_SIZE)
          .map((listing: any) => {
            const attributes = listing.attributes && typeof listing.attributes === 'object' ? listing.attributes : {};
            const location = attributes.location && typeof attributes.location === 'object' ? attributes.location : {};
            const amount = Number(listing.price);
            return {
              id: `listing-${String(listing.id)}`,
              listingId: String(listing.id),
              name: String(listing.title || ''),
              propertyType: String(listing.categoryId || 'stay'),
              city: String(location.city || attributes.city || ''),
              area: String(location.area || attributes.area || ''),
              address: typeof attributes.address === 'string' ? attributes.address : '',
              description: typeof attributes.description === 'string' ? attributes.description : '',
              amenities: stringArray(attributes.amenities),
              // No room/night rate is inferred from a generic listing price.
              basePricePaise: 0,
              listingPriceAmount: Number.isFinite(amount) && amount >= 0 ? amount : undefined,
              listingPriceUnit: typeof listing.priceUnit === 'string' ? listing.priceUnit : undefined,
              demo: attributes.demo === true,
              localTestFixture: attributes.localTestFixture === true,
              checkInTime: typeof attributes.checkInTime === 'string' ? attributes.checkInTime : '',
              checkOutTime: typeof attributes.checkOutTime === 'string' ? attributes.checkOutTime : '',
              images: safeImages({
                images: [
                  ...(Array.isArray(listing.images) ? listing.images : []),
                  ...(Array.isArray(attributes.images) ? attributes.images : []),
                ],
                // The PostgreSQL listing API puts the complete listing payload
                // under `attributes`; legacy listings may still store their
                // single cover image as `imageUrl` instead of `images`.
                imageUrl: typeof attributes.imageUrl === 'string'
                  ? attributes.imageUrl
                  : typeof listing.imageUrl === 'string' ? listing.imageUrl : undefined,
              }),
              roomTypes: [],
            } as StayProperty;
          });
      }
    }
  } catch {
    // An existing Supabase stay inventory source may still be available below.
  }
  if (!supabase) {
    if (postgresListings === null) throw new Error('STAY_PROPERTIES_UNAVAILABLE');
    return postgresListings;
  }
  let propertyQuery = supabase
    .from('stay_properties')
    .select(
      'id, listing_id, name, property_type, city, area, address, description, amenities, base_price_paise, check_in_time, check_out_time'
    )
    .eq('is_active', true)
    .order('name', { ascending: true })
    .range(page * STAY_PAGE_SIZE, (page + 1) * STAY_PAGE_SIZE - 1);
  if (options.destination.trim()) {
    propertyQuery = propertyQuery.ilike('city', `%${options.destination.trim()}%`);
  }
  const { data: propertyRows, error: propertyError } = await propertyQuery;
  if (propertyError) {
    if (postgresListings !== null) return postgresListings;
    throw new Error('STAY_PROPERTIES_UNAVAILABLE');
  }

  const properties = (propertyRows ?? []).filter((row) => typeof row.listing_id === 'string' && row.listing_id);
  if (!properties.length) return postgresListings || [];

  const listingIds = properties.map((row) => String(row.listing_id));
  const [{ data: listings, error: listingError }, { data: roomRows, error: roomsError }] = await Promise.all([
    supabase
      .from('listings')
      .select('id, title, status, payload')
      .in('id', listingIds)
      .eq('status', 'active'),
    supabase
      .from('stay_room_types')
      .select('id, property_id, name, max_adults, max_children, base_price_paise, amenities')
      .in('property_id', properties.map((row) => row.id))
      .eq('is_active', true)
      .order('base_price_paise', { ascending: true }),
  ]);
  if (listingError || roomsError) {
    if (postgresListings !== null) return postgresListings;
    throw new Error('STAY_LISTINGS_UNAVAILABLE');
  }

  const listingById = new Map((listings ?? []).map((row) => [String(row.id), row]));
  const roomsByProperty = new Map<string, StayRoomType[]>();
  for (const room of roomRows ?? []) {
    const key = String(room.property_id);
    const collection = roomsByProperty.get(key) ?? [];
    collection.push({
      id: String(room.id),
      propertyId: key,
      name: String(room.name),
      maxAdults: Number(room.max_adults),
      maxChildren: Number(room.max_children),
      basePricePaise: Number(room.base_price_paise),
      amenities: stringArray(room.amenities),
    });
    roomsByProperty.set(key, collection);
  }

  const inventoryBacked = properties.flatMap((row) => {
    const listing = listingById.get(String(row.listing_id));
    if (!listing) return [];
    const roomTypes = roomsByProperty.get(String(row.id)) ?? [];
    const roomRates = roomTypes.map((room) => room.basePricePaise).filter(Number.isFinite);
    const configuredRate = Number(row.base_price_paise);
    return [{
      id: String(row.id),
      listingId: String(row.listing_id),
      name: String(row.name || listing.title || 'Stay'),
      propertyType: String(row.property_type || 'stay'),
      city: String(row.city || ''),
      area: String(row.area || ''),
      address: String(row.address || ''),
      description: String(row.description || ''),
      amenities: stringArray(row.amenities),
      basePricePaise: roomRates.length ? Math.min(...roomRates) : configuredRate,
      checkInTime: String(row.check_in_time || ''),
      checkOutTime: String(row.check_out_time || ''),
      images: safeImages(listing.payload),
      roomTypes,
    }];
  });
  const seenListingIds = new Set(inventoryBacked.map((property) => property.listingId));
  return [...inventoryBacked, ...(postgresListings || []).filter((property) => !seenListingIds.has(property.listingId))];
}

/** Load the public PostgreSQL room inventory for a selected listing when the
 * generic marketplace projection does not carry stay-specific room types. */
export async function fetchStayRoomTypesForListing(listingId: string): Promise<StayRoomType[]> {
  const response = await fetch(`/api/stays/${encodeURIComponent(listingId)}/room-types`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('STAY_ROOM_TYPES_UNAVAILABLE');
  const payload = await response.json();
  if (!Array.isArray(payload?.roomTypes)) throw new Error('STAY_ROOM_TYPES_UNAVAILABLE');
  return payload.roomTypes.map((room: any) => ({
    id: String(room.id),
    propertyId: '',
    name: String(room.name || ''),
    maxAdults: Number(room.max_adults ?? room.maxAdults ?? 0),
    maxChildren: Number(room.max_children ?? room.maxChildren ?? 0),
    basePricePaise: Number(room.base_price_paise ?? room.basePricePaise ?? 0),
    amenities: stringArray(room.amenities),
  })).filter((room: StayRoomType) => room.id && room.name && Number.isFinite(room.basePricePaise));
}

export async function fetchStayAvailability(
  roomTypeId: string,
  checkIn: string,
  checkOut: string
): Promise<StayAvailability> {
  if (!supabase) throw new Error('SUPABASE_UNAVAILABLE');
  const { data, error } = await supabase.rpc('stay_availability', {
    p_room_type_id: roomTypeId,
    p_from: checkIn,
    p_to: checkOut,
  });
  if (error || !Array.isArray(data)) throw new Error('STAY_AVAILABILITY_UNAVAILABLE');
  return { roomTypeId, freeUnitCount: data.length };
}

export async function fetchAuthorizedOwnerContact(
  listingId: string
): Promise<StayContactDetails | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('provider_contact_details', {
    p_listing_id: listingId,
  });
  if (error || !data || typeof data !== 'object') return null;
  const details = data as Record<string, unknown>;
  return {
    available: details.available === true,
    phone: typeof details.phone === 'string' ? details.phone : null,
    whatsapp: typeof details.whatsapp === 'string' ? details.whatsapp : null,
    disclaimer: typeof details.disclaimer === 'string' ? details.disclaimer : undefined,
  };
}

export async function recordAuthorizedOwnerContact(
  listingId: string,
  channel: 'call' | 'whatsapp'
): Promise<boolean> {
  if (!supabase) return false;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return false;
  const { error } = await supabase.rpc('record_contact_click', {
    p_listing_id: listingId,
    p_channel: channel,
  });
  return !error;
}

import { supabase } from './supabaseClient';
import type { ModuleFlagRow } from '../server/moduleGate';
import type { StayContactDetails } from './servicesStayRules';

export const STAY_PAGE_SIZE = 24;

/**
 * A stay listing contributes exactly one photo. Images live inside
 * `listings.payload` (JSONB), so every extra URL is duplicated in the row,
 * the wire payload and the browser cache. One photo per listing keeps rows
 * small and matches what the marketplace can actually supply today.
 */
export const MAX_STAY_IMAGES = 1;

export interface StayRoomType {
  id: string;
  propertyId: string;
  name: string;
  maxAdults: number;
  maxChildren: number;
  basePricePaise: number;
  amenities: string[];
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
  checkInTime: string;
  checkOutTime: string;
  images: string[];
  roomTypes: StayRoomType[];
}

export interface StayAvailability {
  roomTypeId: string;
  freeUnitCount: number;
}

export async function fetchPlatformModuleFlags(): Promise<ModuleFlagRow[]> {
  if (!supabase) throw new Error('SUPABASE_UNAVAILABLE');
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
  const usable = [...new Set(candidates.filter((value): value is string => {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
      const origin = typeof window === 'undefined' ? 'https://bookourspace.invalid' : window.location.origin;
      const url = new URL(value, origin);
      return url.protocol === 'https:' || (typeof window !== 'undefined' && url.origin === window.location.origin);
    } catch {
      return false;
    }
  }))];
  return usable.slice(0, MAX_STAY_IMAGES);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export async function fetchStayProperties(options: {
  destination: string;
  page?: number;
}): Promise<StayProperty[]> {
  if (!supabase) throw new Error('SUPABASE_UNAVAILABLE');
  const page = Math.max(0, Math.floor(options.page ?? 0));
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
  if (propertyError) throw new Error('STAY_PROPERTIES_UNAVAILABLE');

  const properties = (propertyRows ?? []).filter((row) => typeof row.listing_id === 'string' && row.listing_id);
  if (!properties.length) return [];

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
  if (listingError || roomsError) throw new Error('STAY_LISTINGS_UNAVAILABLE');

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

  return properties.flatMap((row) => {
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

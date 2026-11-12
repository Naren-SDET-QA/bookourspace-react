import { supabase } from './supabaseClient';
import type { DeliveryKind, DeliveryStatus } from './deliveryTracking';

export interface TrackingPoint {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
}

export interface TrackingEvent {
  id: number;
  eventType: string;
  note: string | null;
  createdAt: string;
}

export interface DeliveryTrackingSnapshot {
  bookingId: string;
  bookingRef: string;
  title: string;
  status: DeliveryStatus;
  customerId: string;
  providerId: string;
  helperAssignedAt: string | null;
  trackingStartedAt: string | null;
  trackingStoppedAt: string | null;
  serviceKind: DeliveryKind;
  categoryId: string | null;
  categoryName: string | null;
  trackingEnabled: boolean;
  liveMapEnabled: boolean;
  otpEnabled: boolean;
  deliveryConfirmationEnabled: boolean;
  deliveryConfirmedAt: string | null;
  prescriptionStatus: 'not_required' | 'pending' | 'verified' | 'rejected';
  recurrenceRule: 'none' | 'daily' | 'weekly' | 'custom';
  latestLocation: TrackingPoint | null;
  events: TrackingEvent[];
}

export const hasRealtimeTransport = Boolean(supabase);

const configured = () => {
  if (!supabase) throw new Error('SUPABASE_UNAVAILABLE');
  return supabase;
};

function sessionToken(): string | null {
  try {
    return (
      window.localStorage.getItem('bos_session_token_v1')
      || window.localStorage.getItem('bos_authoritative_session_token')
    );
  } catch {
    return null;
  }
}

async function serviceRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers, credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(String(payload?.error || 'TRACKING_SERVICE_UNAVAILABLE'));
  }
  return payload as T;
}

function mapStatus(value: unknown): DeliveryStatus {
  const allowed: DeliveryStatus[] = ['requested', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected'];
  return allowed.includes(value as DeliveryStatus) ? value as DeliveryStatus : 'requested';
}

function mapKind(value: unknown): DeliveryKind {
  return value === 'medicine_delivery' || value === 'water_delivery' ? value : 'human_help';
}

function mapPoint(row: any): TrackingPoint | null {
  if (!row) return null;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    accuracyMeters: row.accuracy_meters === null || row.accuracy_meters === undefined ? null : Number(row.accuracy_meters),
    capturedAt: String(row.captured_at || ''),
  };
}

async function fetchDeliveryTrackingFromSupabase(bookingId: string): Promise<DeliveryTrackingSnapshot> {
  const client = configured();
  const { data: booking, error: bookingError } = await client
    .from('service_bookings')
    .select('id, booking_ref, category_id, subcategory, status, customer_id, provider_id, helper_assigned_at, tracking_started_at, tracking_stopped_at, listings(title)')
    .eq('id', bookingId)
    .maybeSingle();
  if (bookingError) throw new Error(bookingError.message);
  if (!booking) throw new Error('BOOKING_NOT_FOUND');

  const [{ data: profile }, { data: locations }, { data: events }] = await Promise.all([
    client.from('service_delivery_profiles').select('service_kind, category_id, tracking_enabled, live_map_enabled, otp_enabled, delivery_confirmation_enabled, delivery_confirmed_at, prescription_status, recurrence_rule').eq('booking_id', bookingId).maybeSingle(),
    client.from('service_tracking_locations').select('latitude, longitude, accuracy_meters, captured_at').eq('booking_id', bookingId).order('captured_at', { ascending: false }).limit(1),
    client.from('service_tracking_events').select('id, event_type, note, created_at').eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(20),
  ]);

  const listing = Array.isArray((booking as any).listings) ? (booking as any).listings[0] : (booking as any).listings;
  return {
    bookingId: String(booking.id),
    bookingRef: String(booking.booking_ref || ''),
    title: String(listing?.title || booking.subcategory || 'Delivery booking'),
    status: mapStatus(booking.status),
    customerId: String(booking.customer_id),
    providerId: String(booking.provider_id),
    helperAssignedAt: booking.helper_assigned_at || null,
    trackingStartedAt: booking.tracking_started_at || null,
    trackingStoppedAt: booking.tracking_stopped_at || null,
    serviceKind: mapKind(profile?.service_kind),
    categoryId: profile?.category_id ? String(profile.category_id) : null,
    categoryName: null,
    trackingEnabled: profile?.tracking_enabled !== false,
    liveMapEnabled: profile?.live_map_enabled !== false,
    otpEnabled: profile?.otp_enabled !== false,
    deliveryConfirmationEnabled: profile?.delivery_confirmation_enabled === true,
    deliveryConfirmedAt: profile?.delivery_confirmed_at ? String(profile.delivery_confirmed_at) : null,
    prescriptionStatus: (profile?.prescription_status || 'not_required') as DeliveryTrackingSnapshot['prescriptionStatus'],
    recurrenceRule: (profile?.recurrence_rule || 'none') as DeliveryTrackingSnapshot['recurrenceRule'],
    latestLocation: mapPoint(Array.isArray(locations) ? locations[0] : null),
    events: (events || []).map((event: any) => ({
      id: Number(event.id),
      eventType: String(event.event_type || ''),
      note: event.note ?? null,
      createdAt: String(event.created_at || ''),
    })),
  };
}

function normalizeServerSnapshot(payload: any): DeliveryTrackingSnapshot {
  const location = payload?.latestLocation;
  return {
    bookingId: String(payload?.bookingId || ''),
    bookingRef: String(payload?.bookingRef || ''),
    title: String(payload?.title || 'Delivery booking'),
    status: mapStatus(payload?.status),
    customerId: String(payload?.customerId || ''),
    providerId: String(payload?.providerId || ''),
    helperAssignedAt: payload?.helperAssignedAt || null,
    trackingStartedAt: payload?.trackingStartedAt || null,
    trackingStoppedAt: payload?.trackingStoppedAt || null,
    serviceKind: mapKind(payload?.serviceKind),
    categoryId: payload?.categoryId ? String(payload.categoryId) : null,
    categoryName: payload?.categoryName ? String(payload.categoryName) : null,
    trackingEnabled: payload?.trackingEnabled !== false,
    liveMapEnabled: payload?.liveMapEnabled !== false,
    otpEnabled: payload?.otpEnabled !== false,
    deliveryConfirmationEnabled: payload?.deliveryConfirmationEnabled === true,
    deliveryConfirmedAt: payload?.deliveryConfirmedAt || null,
    prescriptionStatus: (payload?.prescriptionStatus || 'not_required') as DeliveryTrackingSnapshot['prescriptionStatus'],
    recurrenceRule: (payload?.recurrenceRule || 'none') as DeliveryTrackingSnapshot['recurrenceRule'],
    latestLocation: location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
      ? {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          accuracyMeters: location.accuracyMeters === null || location.accuracyMeters === undefined ? null : Number(location.accuracyMeters),
          capturedAt: String(location.capturedAt || ''),
        }
      : null,
    events: Array.isArray(payload?.events)
      ? payload.events.map((event: any) => ({
          id: Number(event.id),
          eventType: String(event.eventType || ''),
          note: event.note ?? null,
          createdAt: String(event.createdAt || ''),
        }))
      : [],
  };
}

/**
 * Server-authoritative snapshot. Supabase Realtime remains the live update
 * transport when configured; this read path is what the polling fallback and
 * the local/offline-safe browser use.
 */
export async function fetchDeliveryTracking(bookingId: string): Promise<DeliveryTrackingSnapshot> {
  try {
    const response = await serviceRequest<{ ok: true; snapshot: any }>(
      `/api/services/bookings/${encodeURIComponent(bookingId)}/tracking`,
    );
    return normalizeServerSnapshot(response.snapshot);
  } catch (error) {
    if (!supabase) throw error;
    return fetchDeliveryTrackingFromSupabase(bookingId);
  }
}

export async function createDeliveryOtp(bookingId: string): Promise<string> {
  try {
    const response = await serviceRequest<{ ok: true; code: string }>(
      `/api/services/bookings/${encodeURIComponent(bookingId)}/otp`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    if (!/^\d{6}$/.test(response.code)) throw new Error('OTP_NOT_RETURNED');
    return response.code;
  } catch (error) {
    if (!supabase) throw error;
    const client = configured();
    const { data, error: rpcError } = await client.rpc('create_delivery_otp', { p_booking_id: bookingId });
    if (rpcError) throw new Error(rpcError.message);
    if (typeof data !== 'string' || !/^\d{6}$/.test(data)) throw new Error('OTP_NOT_RETURNED');
    return data;
  }
}

export async function verifyDeliveryOtp(bookingId: string, code: string): Promise<boolean> {
  try {
    const response = await serviceRequest<{ ok: true; verified: boolean }>(
      `/api/services/bookings/${encodeURIComponent(bookingId)}/verify-otp`,
      { method: 'POST', body: JSON.stringify({ code }) },
    );
    return response.verified === true;
  } catch (error) {
    if (!supabase) throw error;
    const client = configured();
    const { data, error: rpcError } = await client.rpc('verify_delivery_otp', { p_booking_id: bookingId, p_code: code });
    if (rpcError) throw new Error(rpcError.message);
    return data === true;
  }
}

export async function publishTrackingLocation(bookingId: string, point: TrackingPoint): Promise<void> {
  try {
    await serviceRequest(`/api/services/bookings/${encodeURIComponent(bookingId)}/tracking/location`, {
      method: 'POST',
      body: JSON.stringify({
        latitude: point.latitude,
        longitude: point.longitude,
        accuracyMeters: point.accuracyMeters,
        capturedAt: point.capturedAt,
      }),
    });
    return;
  } catch (error) {
    if (!supabase) throw error;
  }
  // Hosted Supabase fallback keeps the original RLS-enforced insert path.
  const client = configured();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error('UNAUTHORIZED');
  const { error } = await client.from('service_tracking_locations').insert({
    booking_id: bookingId,
    actor_id: userData.user.id,
    actor_role: 'helper',
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy_meters: point.accuracyMeters,
    captured_at: point.capturedAt,
    source: 'device_gps',
  });
  if (error) throw new Error(error.message);
}

export function subscribeToDeliveryTracking(
  bookingId: string,
  onChange: () => void,
  onStatus?: (status: string) => void,
): () => void {
  if (!supabase) {
    // The adaptive server poll in useDeliveryTracking is the fallback. Do not
    // create a second fixed timer here; that would double database reads.
    return () => {};
  }
  const client = configured();
  const channel = client
    .channel(`delivery-tracking-${bookingId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_tracking_locations', filter: `booking_id=eq.${bookingId}` }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_tracking_events', filter: `booking_id=eq.${bookingId}` }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'service_delivery_profiles', filter: `booking_id=eq.${bookingId}` }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'service_bookings', filter: `id=eq.${bookingId}` }, (payload) => {
      onStatus?.(String((payload.new as any)?.status || ''));
      onChange();
    })
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

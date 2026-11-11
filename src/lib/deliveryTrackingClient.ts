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

const configured = () => {
  if (!supabase) throw new Error('SUPABASE_UNAVAILABLE');
  return supabase;
};

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

export async function fetchDeliveryTracking(bookingId: string): Promise<DeliveryTrackingSnapshot> {
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

export async function createDeliveryOtp(bookingId: string): Promise<string> {
  const client = configured();
  const { data, error } = await client.rpc('create_delivery_otp', { p_booking_id: bookingId });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string' || !/^\d{6}$/.test(data)) throw new Error('OTP_NOT_RETURNED');
  return data;
}

export async function verifyDeliveryOtp(bookingId: string, code: string): Promise<boolean> {
  const client = configured();
  const { data, error } = await client.rpc('verify_delivery_otp', { p_booking_id: bookingId, p_code: code });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function publishTrackingLocation(bookingId: string, point: TrackingPoint): Promise<void> {
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

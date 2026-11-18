/**
 * Shared, server-agnostic rules for BookOurSpace delivery tracking.
 *
 * The database is authoritative for booking access and OTP verification. GPS
 * itself is service-independent: category toggles and booking assignment decide
 * whether a plumber, water-can driver or packers crew is tracked.
 */

export type DeliveryKind = 'human_help' | 'medicine_delivery' | 'water_delivery';

export type DeliveryStatus =
  | 'requested'
  | 'accepted'
  | 'assigned'
  | 'travelling'
  | 'arrived'
  | 'started'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type JourneyStatus = 'idle' | 'awaiting_permission' | 'en_route' | 'arriving' | 'arrived' | 'stopped';

export interface DeliveryKindConfig {
  kind: DeliveryKind;
  label: string;
  shortLabel: string;
  requiresPrescription: boolean;
  supportsRecurrence: boolean;
  otpLabel: string;
  helperNoun: string;
}

export const DELIVERY_TRACKING_CONFIG: Record<DeliveryKind, DeliveryKindConfig> = {
  human_help: {
    kind: 'human_help',
    label: 'Human Help',
    shortLabel: 'Helper',
    requiresPrescription: false,
    supportsRecurrence: false,
    otpLabel: 'Delivery OTP',
    helperNoun: 'helper',
  },
  medicine_delivery: {
    kind: 'medicine_delivery',
    label: 'Medicine Delivery',
    shortLabel: 'Pharmacy',
    requiresPrescription: true,
    supportsRecurrence: false,
    otpLabel: 'Medicine handover OTP',
    helperNoun: 'delivery partner',
  },
  water_delivery: {
    kind: 'water_delivery',
    label: 'Water Bottle Delivery',
    shortLabel: 'Water',
    requiresPrescription: false,
    supportsRecurrence: true,
    otpLabel: 'Water handover OTP',
    helperNoun: 'delivery partner',
  },
};

export const TRACKING_STALE_AFTER_MS = 45_000;
export const TRACKING_UPDATE_INTERVAL_MS = 12_000;
export const INACCURATE_GPS_METERS = 150;
export const ARRIVAL_RADIUS_METERS = 80;
export const APPROACHING_RADIUS_METERS = 400;
export const DEFAULT_URBAN_SPEED_MPS = 6.11;
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LENGTH = 6;

export const TERMINAL_DELIVERY_STATUSES: readonly DeliveryStatus[] = ['completed', 'cancelled', 'rejected'];
export const LIVE_DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  'accepted', 'assigned', 'travelling', 'arrived', 'started', 'in_progress',
];

export function isTerminalDeliveryStatus(status: DeliveryStatus): boolean {
  return TERMINAL_DELIVERY_STATUSES.includes(status);
}

export function isLiveDeliveryStatus(status: DeliveryStatus): boolean {
  return LIVE_DELIVERY_STATUSES.includes(status);
}

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

export function isGpsInaccurate(accuracyMeters: number | null | undefined): boolean {
  return Number.isFinite(Number(accuracyMeters)) && Number(accuracyMeters) > INACCURATE_GPS_METERS;
}

/** Haversine distance in whole metres. Used for ETA; no external maps API. */
export function haversineMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a))));
}

export function etaSecondsFromDistance(distanceMeters: number, speedMps?: number | null): number {
  const speed = Number(speedMps) >= 1.5 ? Number(speedMps) : DEFAULT_URBAN_SPEED_MPS;
  return Math.max(0, Math.ceil(distanceMeters / speed));
}

/**
 * One GPS-derived journey triple. Distance, ETA and status always come from
 * the same two coordinates so the map, Distance card and Time Taken cannot
 * drift apart.
 */
export function deriveJourneyMetrics(
  from: { latitude: number; longitude: number } | null | undefined,
  to: { latitude: number; longitude: number } | null | undefined,
  speedMps?: number | null,
): { distanceMeters: number | null; etaSeconds: number | null; journeyStatus: JourneyStatus } {
  if (!from || !to || !isValidCoordinate(from.latitude, from.longitude) || !isValidCoordinate(to.latitude, to.longitude)) {
    return { distanceMeters: null, etaSeconds: null, journeyStatus: from ? 'en_route' : 'idle' };
  }
  const distanceMeters = haversineMeters(from, to);
  return {
    distanceMeters,
    etaSeconds: etaSecondsFromDistance(distanceMeters, speedMps),
    journeyStatus: journeyStatusFromDistance(distanceMeters),
  };
}

export function journeyStatusFromDistance(distanceMeters: number | null | undefined): JourneyStatus {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) return 'en_route';
  if (distanceMeters <= ARRIVAL_RADIUS_METERS) return 'arrived';
  if (distanceMeters <= APPROACHING_RADIUS_METERS) return 'arriving';
  return 'en_route';
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return 'Distance unavailable';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'ETA unavailable';
  if (seconds < 60) return 'Under 1 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function journeyStatusLabel(status: JourneyStatus | string | null | undefined): string {
  switch (status) {
    case 'awaiting_permission': return 'Waiting for location permission';
    case 'en_route': return 'On the way';
    case 'arriving': return 'Arriving';
    case 'arrived': return 'Arrived';
    case 'stopped': return 'Tracking stopped';
    default: return 'Waiting for GPS';
  }
}

export function isLocationStale(capturedAt: string | number | Date, now = Date.now()): boolean {
  const timestamp = capturedAt instanceof Date ? capturedAt.getTime() : new Date(capturedAt).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return now - timestamp > TRACKING_STALE_AFTER_MS;
}

export function canViewBookingTracking(input: {
  actorId: string | null;
  customerId: string;
  providerId: string;
  isAdmin?: boolean;
}): boolean {
  if (input.isAdmin) return true;
  return Boolean(input.actorId && (input.actorId === input.customerId || input.actorId === input.providerId));
}

export function canPublishHelperLocation(input: {
  actorId: string | null;
  providerId: string;
  status: DeliveryStatus;
  trackingEnabled: boolean;
}): boolean {
  return Boolean(input.actorId && input.actorId === input.providerId && input.trackingEnabled && isLiveDeliveryStatus(input.status));
}

export function canCreateDeliveryOtp(input: {
  actorId: string | null;
  customerId: string;
  status: DeliveryStatus;
  trackingEnabled: boolean;
  requiresPrescription: boolean;
  prescriptionStatus: 'not_required' | 'pending' | 'verified' | 'rejected';
}): boolean {
  if (!input.actorId || input.actorId !== input.customerId) return false;
  if (!input.trackingEnabled || !isLiveDeliveryStatus(input.status)) return false;
  return !input.requiresPrescription || input.prescriptionStatus === 'verified';
}

export function normalizeOtp(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return digits.length === OTP_LENGTH ? digits : null;
}

export function deliveryKindFor(input: { categoryId?: string | null; title?: string | null; subcategory?: string | null }): DeliveryKind {
  const text = `${input.categoryId || ''} ${input.subcategory || ''} ${input.title || ''}`.toLowerCase();
  if (/medicine|pharmacy|medical|prescription|tablet|drug/.test(text)) return 'medicine_delivery';
  if (/water|bottle|can|tanker|mineral/.test(text)) return 'water_delivery';
  return 'human_help';
}

export function trackingStatusLabel(status: DeliveryStatus): string {
  switch (status) {
    case 'requested': return 'Waiting for assignment';
    case 'accepted': return 'Assigned';
    case 'assigned': return 'Assigned';
    case 'travelling': return 'On the way';
    case 'arrived': return 'Arrived';
    case 'started': return 'Service started';
    case 'in_progress': return 'On the way';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    case 'rejected': return 'Rejected';
  }
}

export interface TrackingPollState {
  online: boolean;
  visible: boolean;
  status: DeliveryStatus;
  trackingEnabled: boolean;
  hasLocation: boolean;
  capturedAt?: string | null;
  /** Supabase Realtime is the primary transport when configured. */
  realtime: boolean;
  now?: number;
}

/**
 * Adaptive fallback cadence. Realtime remains primary; this runner only reads
 * the server snapshot. It stops for terminal/inactive tracking and backs off
 * when the tab is hidden or offline, so a fallback deployment does not keep
 * polling forever.
 */
export function nextTrackingPollDelay(input: TrackingPollState): number | null {
  if (!input.trackingEnabled || isTerminalDeliveryStatus(input.status)) return null;
  if (!input.online) return 30_000;
  if (!input.visible) return 30_000;
  if (!input.hasLocation) return 4_000;
  const stale = isLocationStale(input.capturedAt || 0, input.now ?? Date.now());
  if (stale) return 5_000;
  // Realtime (when it actually delivers) is still primary. The poll is the
  // live safety-net so a customer map moves without a manual refresh even
  // when hosted Realtime is pointed at a different database.
  return 8_000;
}

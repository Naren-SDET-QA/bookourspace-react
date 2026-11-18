import { isLiveDeliveryStatus, isLocationStale, isTerminalDeliveryStatus, type DeliveryStatus } from './deliveryTracking.ts';

export type GpsShareState = 'disabled' | 'waiting' | 'live' | 'stale' | 'stopped';

export interface GpsCategoryToggle {
  gpsTracking: boolean;
  liveMap: boolean;
}

export interface GpsPolicySnapshot {
  globalEnabled: boolean;
  categoryOverrides: Record<string, GpsCategoryToggle>;
  catalogToggles: Record<string, GpsCategoryToggle>;
}

export function parseGpsToggleMap(value: unknown): Record<string, GpsCategoryToggle> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, GpsCategoryToggle> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) continue;
    const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const gpsTracking = row.gpsTracking !== false;
    out[key] = {
      gpsTracking,
      liveMap: gpsTracking && row.liveMap !== false,
    };
  }
  return out;
}

export function categoryGpsToggle(
  policy: GpsPolicySnapshot,
  categoryId: string | null | undefined,
): GpsCategoryToggle | null {
  const key = String(categoryId || '').trim();
  if (!key) return null;
  return policy.categoryOverrides[key] || policy.catalogToggles[key] || null;
}

export function effectiveGpsFlags(input: {
  globalEnabled: boolean;
  categoryGpsTracking?: boolean | null;
  categoryLiveMap?: boolean | null;
  profileTrackingEnabled: boolean;
  profileLiveMapEnabled: boolean;
  status: DeliveryStatus;
}): { trackingEnabled: boolean; liveMapEnabled: boolean } {
  const categoryGps = input.categoryGpsTracking !== false;
  const categoryMap = input.categoryLiveMap !== false;
  const trackingEnabled = Boolean(
    input.globalEnabled
    && categoryGps
    && input.profileTrackingEnabled
    && isLiveDeliveryStatus(input.status)
    && !isTerminalDeliveryStatus(input.status),
  );
  return {
    trackingEnabled,
    liveMapEnabled: trackingEnabled && categoryMap && input.profileLiveMapEnabled,
  };
}

export function overlayBookingGps(
  policy: GpsPolicySnapshot,
  booking: {
    categoryId?: string | null;
    categoryConfigId?: string | null;
    trackingEnabled: boolean;
    liveMapEnabled: boolean;
    status: DeliveryStatus;
  },
): { trackingEnabled: boolean; liveMapEnabled: boolean } {
  const primary = categoryGpsToggle(policy, booking.categoryConfigId);
  const listing = categoryGpsToggle(policy, booking.categoryId);
  const categoryGps = (primary?.gpsTracking !== false) && (listing?.gpsTracking !== false);
  const categoryMap = (primary?.liveMap !== false) && (listing?.liveMap !== false);
  return effectiveGpsFlags({
    globalEnabled: policy.globalEnabled,
    categoryGpsTracking: categoryGps,
    categoryLiveMap: categoryMap,
    profileTrackingEnabled: booking.trackingEnabled,
    profileLiveMapEnabled: booking.liveMapEnabled,
    status: booking.status,
  });
}

export function gpsShareState(input: {
  trackingEnabled: boolean;
  status: DeliveryStatus;
  hasLocation: boolean;
  stale?: boolean;
  trackingStartedAt?: string | null;
  trackingStoppedAt?: string | null;
  capturedAt?: string | null;
  now?: number;
}): GpsShareState {
  if (isTerminalDeliveryStatus(input.status)) return 'stopped';
  if (!input.trackingEnabled) return 'disabled';
  const started = input.trackingStartedAt ? Date.parse(input.trackingStartedAt) : Number.NaN;
  const stopped = input.trackingStoppedAt ? Date.parse(input.trackingStoppedAt) : Number.NaN;
  if (Number.isFinite(stopped) && (!Number.isFinite(started) || stopped >= started)) return 'stopped';
  const stale = input.stale ?? (input.capturedAt ? isLocationStale(input.capturedAt, input.now) : true);
  if (input.hasLocation && stale) return 'stale';
  if (input.hasLocation) return 'live';
  return 'waiting';
}

export function gpsShareStateLabel(state: GpsShareState): 'Disabled' | 'Waiting' | 'Live' | 'Stale' | 'Stopped' {
  switch (state) {
    case 'disabled': return 'Disabled';
    case 'waiting': return 'Waiting';
    case 'live': return 'Live';
    case 'stale': return 'Stale';
    case 'stopped': return 'Stopped';
  }
}

export const GPS_MANUAL_TEST = {
  customerEmail: 'demo.guest.1@bookourspace.local',
  providerEmail: 'demo.services@bookourspace.local',
  adminEmail: 'demo.admin@bookourspace.local',
  bookingId: 'c0a11e00-1111-4111-8111-000000000101',
  listingTitle: 'Live GPS Water Can',
  categoryId: 'water_delivery',
} as const;

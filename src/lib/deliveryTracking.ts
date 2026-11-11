/**
 * Shared, server-agnostic rules for BookOurSpace delivery tracking.
 *
 * The database is authoritative for booking access and OTP verification. This
 * module only describes the client-visible contract so Human Help, Medicine
 * Delivery and Water Bottle Delivery use the same states and limits.
 */

export type DeliveryKind = 'human_help' | 'medicine_delivery' | 'water_delivery';

export type DeliveryStatus =
  | 'requested'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected';

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
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LENGTH = 6;

export const TERMINAL_DELIVERY_STATUSES: readonly DeliveryStatus[] = ['completed', 'cancelled', 'rejected'];
export const LIVE_DELIVERY_STATUSES: readonly DeliveryStatus[] = ['accepted', 'in_progress'];

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
    case 'accepted': return 'Helper assigned';
    case 'in_progress': return 'On the way';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    case 'rejected': return 'Rejected';
  }
}

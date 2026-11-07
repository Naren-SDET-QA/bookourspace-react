/**
 * Hotels & Stays publication gate.
 *
 * Public search and real bookings require APPROVED + ACTIVE + AVAILABLE.
 * Demo inventory may be prepared by Super Admin and must never take money.
 * Owners cannot flip these fields from the client.
 */

export const STAY_UNBOOKABLE_LIFECYCLES = new Set([
  'draft',
  'submitted',
  'changes_requested',
  'rejected',
  'suspended',
]);

export const STAY_DOC_KINDS = ['gst_certificate', 'property_ownership', 'government_id'] as const;
export type StayDocKind = (typeof STAY_DOC_KINDS)[number];

export type StayLifecycle =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'suspended';

export interface StayListingGateInput {
  listingStatus?: string | null;
  listingVerified?: boolean | null;
  ownerVerified?: boolean | null;
  propertyActive?: boolean | null;
  payload?: Record<string, unknown> | null;
  availableUnits?: number | null;
  /**
   * Local preview only: when the server sets BOS_STAY_ALLOW_DEMO_BOOKING=1
   * outside production, demo inventory may be booked end to end. Production
   * never enables this, so demo rows stay unbookable there.
   */
  allowDemoBooking?: boolean;
}

export function stayPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stayLifecycleOf(payload: Record<string, unknown> | null | undefined): StayLifecycle {
  const raw = String(payload?.stayLifecycle || '').trim();
  if (raw === 'draft' || raw === 'submitted' || raw === 'changes_requested' || raw === 'approved' || raw === 'rejected' || raw === 'suspended') {
    return raw;
  }
  return 'approved';
}

export function stayIsDemo(payload: Record<string, unknown> | null | undefined): boolean {
  return payload?.demo === true || payload?.demo === 'true';
}

export function stayListingUnbookableReason(
  input: StayListingGateInput,
): string | null {
  const payload = stayPayload(input.payload);
  // Demo inventory is unbookable unless the local preview flag is explicit.
  if (stayIsDemo(payload) && input.allowDemoBooking !== true) return 'STAY_DEMO_NOT_BOOKABLE';
  if (String(input.listingStatus || '') !== 'active') return 'STAY_NOT_APPROVED';
  if (input.listingVerified !== true) return 'STAY_NOT_APPROVED';
  if (input.ownerVerified !== true) return 'STAY_OWNER_NOT_VERIFIED';
  if (input.propertyActive !== true) return 'STAY_NOT_ACTIVE';
  // Missing lifecycle metadata is not proof of Super Admin approval.
  const rawLife = String(payload.stayLifecycle || '').trim();
  if (rawLife !== 'approved' || STAY_UNBOOKABLE_LIFECYCLES.has(stayLifecycleOf(payload))) return 'STAY_NOT_APPROVED';
  const availability = payload.availability;
  if (availability && typeof availability === 'object' && !Array.isArray(availability)) {
    const status = String((availability as Record<string, unknown>).status || '');
    if (status === 'sold_out') return 'STAY_NOT_AVAILABLE';
  }
  if (input.availableUnits !== undefined && input.availableUnits !== null && Number(input.availableUnits) <= 0) {
    return 'STAY_NOT_AVAILABLE';
  }
  return null;
}

export function stayListingIsPubliclyBookable(input: StayListingGateInput): boolean {
  return stayListingUnbookableReason(input) === null;
}

export function stayProtectedPayloadPatch(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...existing, ...incoming };
  next.demo = existing.demo === true;
  next.stayLifecycle = existing.stayLifecycle || 'draft';
  next.isFeatured = existing.isFeatured === true;
  if (existing.review) next.review = existing.review;
  return next;
}

export function staySubmitMissing(input: {
  name?: string;
  city?: string;
  basePricePaise?: number;
  images?: unknown;
  roomCount?: number;
  unitCount?: number;
  documents?: unknown;
}): string[] {
  const missing: string[] = [];
  if (!String(input.name || '').trim()) missing.push('name');
  if (!String(input.city || '').trim()) missing.push('city');
  if (!Number.isFinite(Number(input.basePricePaise)) || Number(input.basePricePaise) <= 0) missing.push('pricing');
  const images = Array.isArray(input.images) ? input.images.filter((item) => typeof item === 'string' && item.trim()) : [];
  if (images.length < 1) missing.push('photos');
  if (!Number(input.roomCount)) missing.push('rooms');
  if (!Number(input.unitCount)) missing.push('units');
  const docs = Array.isArray(input.documents) ? input.documents : [];
  const kinds = new Set(
    docs
      .map((doc) => (doc && typeof doc === 'object' ? String((doc as Record<string, unknown>).kind || '') : ''))
      .filter(Boolean),
  );
  for (const kind of STAY_DOC_KINDS) {
    if (!kinds.has(kind)) missing.push(kind);
  }
  return missing;
}

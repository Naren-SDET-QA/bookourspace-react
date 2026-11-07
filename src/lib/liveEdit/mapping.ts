import { liveEditModuleSchema } from './moduleSchemas';
import { inferLiveEditModule, type ModuleInferenceInput } from './moduleInference';
import { parseShowtimes, parseTierPricing } from './validation';
import type {
  LiveEditAvailabilityStatus,
  LiveEditCapabilities,
  LiveEditDetailValue,
  LiveEditDraft,
  LiveEditListing,
  LiveEditListingStatus,
  LiveEditModule,
  ProviderAvailabilityStatus,
} from './types';

export const EMPTY_DRAFT: LiveEditDraft = {
  title: '',
  description: '',
  categoryId: '',
  subcategory: '',
  price: '',
  priceUnit: '',
  images: [],
  facilities: [],
  availability: { status: 'not_reported', note: '', nextAvailableFrom: '', unitsAvailable: '' },
  details: {},
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function asDetailValue(value: unknown): LiveEditDetailValue | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return undefined;
}

export function availabilityStatusFromProvider(
  status: ProviderAvailabilityStatus | string
): LiveEditAvailabilityStatus {
  if (status === 'available') return 'available';
  if (status === 'unavailable') return 'sold_out';
  return 'not_reported';
}

export function providerAvailabilityFromStatus(
  status: LiveEditAvailabilityStatus
): ProviderAvailabilityStatus {
  if (status === 'limited' || status === 'available') return 'available';
  if (status === 'sold_out') return 'unavailable';
  return 'not_reported';
}

export function draftFromListing(listing: LiveEditListing): LiveEditDraft {
  const schema = liveEditModuleSchema(listing.module);
  const details: Record<string, LiveEditDetailValue> = {};
  for (const field of schema.detailFields) {
    const value = listing.details[field.key];
    if (value !== undefined) details[field.key] = value;
  }
  return {
    title: listing.title,
    description: listing.description,
    categoryId: listing.categoryId,
    subcategory: listing.subcategory,
    price: schema.supportsPricing && Number.isFinite(listing.price) ? String(listing.price) : '',
    priceUnit: schema.supportsPricing ? listing.priceUnit : '',
    images: schema.supportsImages ? [...listing.images] : [],
    facilities: schema.supportsFacilities ? [...listing.facilities] : [],
    availability: schema.supportsAvailability
      ? {
          status: listing.availability.status,
          note: listing.availability.note,
          nextAvailableFrom: listing.availability.nextAvailableFrom,
          unitsAvailable:
            listing.availability.unitsAvailable === null ? '' : String(listing.availability.unitsAvailable),
        }
      : { status: 'not_reported', note: '', nextAvailableFrom: '', unitsAvailable: '' },
    details,
  };
}

export interface LiveEditRow {
  id: string;
  owner_id?: string;
  title?: string;
  category_id?: string;
  subcategory?: string;
  entity_type?: string;
  price?: number;
  price_unit?: string;
  status?: string;
  payload?: Record<string, unknown>;
  provider_availability_status?: string;
  is_verified?: boolean;
  created_at?: string;
  updated_at?: string;
  provider_name?: string;
}

const LISTING_STATUSES = new Set<LiveEditListingStatus>([
  'pending_approval',
  'active',
  'expired',
  'archived',
  'rejected',
]);

function normalizeListingStatus(value: unknown): LiveEditListingStatus {
  const status = String(value || '');
  return LISTING_STATUSES.has(status as LiveEditListingStatus)
    ? (status as LiveEditListingStatus)
    : 'pending_approval';
}

/** Project a server/Postgres listing row into the Live Edit model. */
export function listingFromRow(row: LiveEditRow): LiveEditListing | null {
  const payload = asRecord(row.payload);
  const module = inferLiveEditModule({
    categoryId: row.category_id,
    subcategory: row.subcategory,
    entityType: row.entity_type,
    title: row.title,
    payload,
  } satisfies ModuleInferenceInput);
  if (!module) return null;

  const customFields = asRecord(payload.customFieldValues);
  const details: Record<string, LiveEditDetailValue> = {};
  for (const [key, value] of Object.entries(customFields)) {
    const detailValue = asDetailValue(value);
    if (detailValue !== undefined) details[key] = detailValue;
  }

  const availability = asRecord(payload.availability);
  const status = availability.status;
  const units = availability.unitsAvailable;
  const availabilityStatus: LiveEditAvailabilityStatus =
    status === 'available' || status === 'limited' || status === 'sold_out' || status === 'not_reported'
      ? status
      : availabilityStatusFromProvider(row.provider_availability_status || 'not_reported');

  return {
    id: String(row.id || ''),
    module,
    ownerId: String(row.owner_id || ''),
    ownerName: String(row.provider_name || ''),
    title: String(row.title || ''),
    description: typeof payload.description === 'string' ? payload.description : '',
    categoryId: String(row.category_id || ''),
    subcategory: String(row.subcategory || ''),
    entityType: String(row.entity_type || ''),
    price: Number(row.price ?? 0),
    priceUnit: String(row.price_unit || ''),
    images: asStringArray(payload.images),
    facilities: asStringArray(payload.facilities),
    availability: {
      status: availabilityStatus,
      note: typeof availability.note === 'string' ? availability.note : '',
      nextAvailableFrom:
        typeof availability.nextAvailableFrom === 'string' ? availability.nextAvailableFrom : '',
      unitsAvailable:
        typeof units === 'number' && Number.isFinite(units)
          ? units
          : typeof units === 'string' && units.trim() !== '' && Number.isFinite(Number(units))
            ? Number(units)
            : null,
    },
    details,
    status: normalizeListingStatus(row.status),
    isVerified: row.is_verified === true,
    providerAvailabilityStatus:
      row.provider_availability_status === 'available' || row.provider_availability_status === 'unavailable'
        ? row.provider_availability_status
        : 'not_reported',
    updatedAt: String(row.updated_at || ''),
    source: 'supabase_listings',
    raw: { ...row, payload },
  };
}

export interface CinemaScreenLike {
  id?: string;
  screenId?: string;
  listingId?: string;
  cinemaListingId?: string;
  cinemaName?: string;
  cinemaTitle?: string;
  screenName?: string;
  area?: string;
  soundFormat?: string;
  soundSystem?: string;
  projectionFormat?: string;
  format?: string;
  showtimes?: unknown;
  cancellationCutoffMins?: number;
  cancellationCutoffMinutes?: number;
  refundPercent?: number;
  fnbDeliveryEnabled?: boolean;
  wheelchairSeats?: unknown;
  tiers?: Array<{ name?: string; rows?: unknown; price?: number }>;
  seatTiers?: Array<{ name?: string; priceMultiplier?: number }>;
  updatedAt?: string;
}

function screenTiers(screen: CinemaScreenLike): Array<{ name: string; rows: string[]; price: number }> {
  if (Array.isArray(screen.tiers)) {
    return screen.tiers
      .filter((tier) => tier && typeof tier.name === 'string')
      .map((tier) => ({
        name: String(tier.name),
        rows: Array.isArray(tier.rows) ? tier.rows.map(String) : [],
        price: Number(tier.price ?? 0),
      }));
  }
  if (Array.isArray(screen.seatTiers)) {
    return screen.seatTiers
      .filter((tier) => tier && typeof tier.name === 'string')
      .map((tier) => ({
        name: String(tier.name),
        rows: [],
        price: Math.round(250 * Number(tier.priceMultiplier ?? 1)),
      }));
  }
  return [];
}

export function tierPricingText(screen: CinemaScreenLike): string {
  return screenTiers(screen)
    .map((tier) => `${tier.name} = ${tier.price}`)
    .join('\n');
}

/** Project a server-authoritative cinema screen into the Live Edit model. */
export function listingFromCinemaScreen(screen: CinemaScreenLike): LiveEditListing {
  const screenId = String(screen.screenId || screen.id || '');
  const showtimes = Array.isArray(screen.showtimes) ? screen.showtimes.map(String) : [];
  const tiers = screenTiers(screen);
  const basePrice = tiers.reduce(
    (lowest, tier) => (tier.price >= 0 && tier.price < lowest ? tier.price : lowest),
    Number.POSITIVE_INFINITY
  );
  return {
    id: screenId,
    module: 'movies',
    ownerId: '',
    ownerName: String(screen.cinemaName || screen.cinemaTitle || ''),
    title: String(screen.cinemaName || screen.cinemaTitle || ''),
    description: '',
    categoryId: 'movie-screens',
    subcategory: String(screen.screenName || ''),
    entityType: 'movie',
    price: Number.isFinite(basePrice) ? basePrice : 0,
    priceUnit: '/ticket',
    images: [],
    facilities: [],
    availability: {
      status: showtimes.length > 0 ? 'available' : 'sold_out',
      note: showtimes.length > 0 ? `${showtimes.length} showtimes scheduled` : 'No showtimes scheduled',
      nextAvailableFrom: '',
      unitsAvailable: null,
    },
    details: {
      format: String(screen.projectionFormat || screen.format || ''),
      soundSystem: String(screen.soundFormat || screen.soundSystem || ''),
      showtimes: showtimes.join(', '),
      tierPricing: tierPricingText(screen),
      cancellationCutoffMinutes: Number(
        screen.cancellationCutoffMins ?? screen.cancellationCutoffMinutes ?? 0
      ),
      refundPercent: Number(screen.refundPercent ?? 0),
      fnbDeliveryEnabled: screen.fnbDeliveryEnabled === true,
      wheelchairSeats: Array.isArray(screen.wheelchairSeats)
        ? screen.wheelchairSeats.map(String).join(', ')
        : '',
    },
    status: 'active',
    isVerified: true,
    providerAvailabilityStatus: 'not_reported',
    updatedAt: String(screen.updatedAt || ''),
    source: 'server_cinema_store',
    raw: { ...screen },
  };
}

function sanitizedDetailPayload(
  draft: LiveEditDraft,
  existing: Record<string, unknown>,
  schemaKeys: Set<string>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(draft.details)) {
    // Supported fields are written even when cleared, so emptying an input
    // removes the old value instead of silently keeping it. Unknown payload
    // keys are preserved and only updated when they carry a value.
    if (schemaKeys.has(key) || value !== '') merged[key] = value;
  }
  return merged;
}

/**
 * Build the PATCH body for the existing authenticated provider listing API.
 * Publication status, verification and featured flags are never included:
 * those stay on the dedicated review/moderation endpoints.
 */
export function buildListingUpdateInput(
  draft: LiveEditDraft,
  listing: LiveEditListing,
  capabilities: LiveEditCapabilities
): Record<string, unknown> {
  const rawPayload = asRecord(listing.raw.payload);
  const existingCustomFields = asRecord(rawPayload.customFieldValues);
  const numericUnits = draft.availability.unitsAvailable.trim();

  const body: Record<string, unknown> = {
    id: listing.id,
    title: draft.title.trim(),
    categoryId: draft.categoryId.trim(),
    subcategory: draft.subcategory.trim(),
    entityType: listing.entityType,
    price: Number(draft.price),
    priceUnit: draft.priceUnit.trim(),
    expectedUpdatedAt: listing.updatedAt || undefined,
    payload: {
      ...rawPayload,
      description: draft.description.trim(),
      images: capabilities.canEditImages ? draft.images.map((url) => url.trim()).filter(Boolean) : listing.images,
      facilities: capabilities.canEditFacilities
        ? draft.facilities.map((facility) => facility.trim()).filter(Boolean)
        : listing.facilities,
      availability: capabilities.canEditAvailability
        ? {
            status: draft.availability.status,
            note: draft.availability.note.trim(),
            nextAvailableFrom: draft.availability.nextAvailableFrom.trim(),
            unitsAvailable: numericUnits === '' ? null : Number(numericUnits),
          }
        : listing.availability,
      customFieldValues: sanitizedDetailPayload(
        draft,
        existingCustomFields,
        new Set(liveEditModuleSchema(listing.module).detailFields.map((field) => field.key))
      ),
    },
  };

  if (capabilities.canEditModerationAvailability && capabilities.canEditAvailability) {
    body.providerAvailabilityStatus = providerAvailabilityFromStatus(draft.availability.status);
  }

  return body;
}

/**
 * Build the PUT body for the existing cinema screen endpoint. Tier row layouts
 * are preserved; only the price is taken from the edited tier list.
 */
export function buildCinemaScreenUpdateInput(
  draft: LiveEditDraft,
  listing: LiveEditListing
): Record<string, unknown> {
  const raw = asRecord(listing.raw);
  const showtimes = parseShowtimes(String(draft.details.showtimes ?? '')).times;
  const tiers = parseTierPricing(String(draft.details.tierPricing ?? '')).tiers;
  const existingTiers = screenTiers(raw as unknown as CinemaScreenLike);
  const mergedTiers = tiers.map((tier, index) => {
    const byName = existingTiers.find(
      (candidate) => candidate.name.toLowerCase() === tier.name.toLowerCase()
    );
    const existing = byName ?? existingTiers[index];
    return { name: tier.name, rows: existing?.rows ?? [], price: tier.price };
  });

  const wheelchairSeats = String(draft.details.wheelchairSeats ?? '')
    .split(/[,\s]+/)
    .map((seat) => seat.trim().toUpperCase())
    .filter(Boolean);

  return {
    id: listing.id,
    screenId: listing.id,
    listingId: String(raw.cinemaListingId || raw.listingId || ''),
    expectedUpdatedAt: listing.updatedAt || undefined,
    area: String(raw.area || 'Hyderabad'),
    totalSeats: Number(raw.totalSeats ?? 80),
    cancellationAllowed: raw.cancellationAllowed !== false,
    cinemaName: draft.title.trim(),
    cinemaTitle: draft.title.trim(),
    screenName: draft.subcategory.trim(),
    projectionFormat: String(draft.details.format ?? ''),
    format: String(draft.details.format ?? ''),
    soundFormat: String(draft.details.soundSystem ?? ''),
    showtimes,
    cancellationCutoffMins: Number(draft.details.cancellationCutoffMinutes ?? 0),
    refundPercent: Number(draft.details.refundPercent ?? 0),
    fnbDeliveryEnabled: draft.details.fnbDeliveryEnabled === true,
    wheelchairSeats,
    tiers: mergedTiers,
  };
}

export function draftDefaultsForModule(module: LiveEditModule): LiveEditDraft {
  const schema = liveEditModuleSchema(module);
  const details: Record<string, LiveEditDetailValue> = {};
  for (const field of schema.detailFields) {
    if (field.kind === 'boolean') details[field.key] = false;
  }
  return {
    ...EMPTY_DRAFT,
    priceUnit: schema.supportsPricing ? schema.priceUnits[0] || '' : '',
    availability: { status: 'not_reported', note: '', nextAvailableFrom: '', unitsAvailable: '' },
    details,
  };
}

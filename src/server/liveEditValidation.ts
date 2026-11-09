import { isPersistableListingImageSource } from '../lib/media/signedStorageUrl';
import { inferLiveEditModule } from '../lib/liveEdit/moduleInference';
import { liveEditModuleSchema } from '../lib/liveEdit/moduleSchemas';
import {
  isIsoDateOnly,
  normalizeShowtimeEntry,
  parseShowtimes,
  parseTierPricing,
  validateModuleDetailValue,
} from '../lib/liveEdit/validation';
import type { LiveEditDetailValue, LiveEditModule } from '../lib/liveEdit/types';

export class LiveEditValidationError extends Error {
  constructor(
    readonly code: string,
    message: string = code,
  ) {
    super(message);
    this.name = 'LiveEditValidationError';
  }
}

function fail(code: string, message: string): never {
  throw new LiveEditValidationError(code, message);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function hasTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

export interface ListingValidationInput {
  actorRole: 'provider' | 'admin';
  existing: Record<string, unknown>;
  updates: Record<string, unknown>;
}

export interface ValidatedListingPatch {
  module: LiveEditModule | null;
  payload?: Record<string, unknown>;
}

const PRICE_UNIT = /^\/?[A-Za-z][A-Za-z0-9 /+.-]{0,39}$/;

/**
 * Server-side re-validation for a listing PATCH/POST. The React validator is
 * not a trust boundary; this runs inside the authenticated repository
 * transaction before any SQL write. Only fields present in the request are
 * validated so an untouched legacy value cannot block an unrelated edit.
 */
export function validateListingPatch(input: ListingValidationInput): ValidatedListingPatch {
  const { actorRole, existing, updates } = input;
  const existingPayload = asRecord(existing.payload);

  const categoryValue = updates.categoryId ?? updates.category_id;
  const entityValue = updates.entityType ?? updates.entity_type;
  const nextCategory =
    categoryValue === undefined ? text(existing.category_id) : text(categoryValue);
  const nextEntity = entityValue === undefined ? text(existing.entity_type) : text(entityValue);

  if (categoryValue !== undefined) {
    if (!nextCategory || nextCategory.length > 80) {
      fail('INVALID_LISTING_FIELDS', 'Category must be between 1 and 80 characters.');
    }
  }
  if (updates.subcategory !== undefined) {
    const value = text(updates.subcategory);
    if (!value || value.length > 80) {
      fail('INVALID_LISTING_FIELDS', 'Subcategory must be between 1 and 80 characters.');
    }
  }
  if (updates.title !== undefined) {
    const value = text(updates.title);
    if (value.length < 2 || value.length > 160) {
      fail('INVALID_LISTING_FIELDS', 'Title must be between 2 and 160 characters.');
    }
  }
  if (entityValue !== undefined && (!nextEntity || nextEntity.length > 40)) {
    fail('INVALID_LISTING_FIELDS', 'Entity type must be between 1 and 40 characters.');
  }
  if (updates.price !== undefined) {
    const price = numberValue(updates.price);
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000 || !hasTwoDecimals(price)) {
      fail('INVALID_LISTING_PRICE', 'Price must be a non-negative amount with at most two decimals.');
    }
  }
  if (updates.priceUnit !== undefined || updates.price_unit !== undefined) {
    const unit = text(updates.priceUnit ?? updates.price_unit);
    if (!unit || !PRICE_UNIT.test(unit)) {
      fail('INVALID_LISTING_FIELDS', 'Price unit must be a short label such as /month.');
    }
  }

  const existingModule = inferLiveEditModule({
    categoryId: existing.category_id,
    subcategory: existing.subcategory,
    entityType: existing.entity_type,
    title: existing.title,
    payload: existingPayload,
  });
  const nextModule = inferLiveEditModule({
    categoryId: nextCategory,
    subcategory: updates.subcategory ?? existing.subcategory,
    entityType: nextEntity,
    title: updates.title ?? existing.title,
    payload: updates.payload === undefined ? existingPayload : asRecord(updates.payload),
  });
  if (categoryValue !== undefined && !nextModule) {
    fail('INVALID_LISTING_CATEGORY', 'Category does not belong to a supported marketplace module.');
  }
  if (actorRole === 'provider' && existingModule && nextModule && existingModule !== nextModule) {
    fail('LISTING_MODULE_CHANGE_FORBIDDEN', 'A provider cannot move a listing to another module.');
  }

  const result: ValidatedListingPatch = { module: nextModule ?? existingModule };
  if (updates.payload === undefined) return result;
  if (!updates.payload || typeof updates.payload !== 'object' || Array.isArray(updates.payload)) {
    fail('INVALID_LISTING_FIELDS', 'Payload must be an object.');
  }

  const incoming = { ...(updates.payload as Record<string, unknown>) };

  if (incoming.description !== undefined) {
    if (typeof incoming.description !== 'string') {
      fail('INVALID_LISTING_FIELDS', 'Description must be text.');
    }
    const description = incoming.description.trim();
    if (description.length > 5000) {
      fail('INVALID_LISTING_FIELDS', 'Description must be 5,000 characters or fewer.');
    }
    incoming.description = description;
  }

  if (incoming.images !== undefined) {
    if (!Array.isArray(incoming.images) || incoming.images.length > 16) {
      fail('INVALID_LISTING_IMAGES', 'Images must be an array of at most 16 public HTTPS or Storage references.');
    }
    const images: string[] = [];
    for (const entry of incoming.images) {
      if (typeof entry !== 'string') {
        fail('INVALID_LISTING_IMAGES', 'Each image must be a string URL.');
      }
      const url = entry.trim();
      if (!isPersistableListingImageSource(url)) {
        fail('INVALID_LISTING_IMAGES', 'Images must be credential-free https:// URLs or storage://bos-public-media object references.');
      }
      if (!images.includes(url)) images.push(url);
    }
    incoming.images = images;
  }

  if (incoming.facilities !== undefined) {
    if (!Array.isArray(incoming.facilities) || incoming.facilities.length > 30) {
      fail('INVALID_LISTING_FACILITIES', 'Facilities must be an array of at most 30 entries.');
    }
    const facilities: string[] = [];
    for (const entry of incoming.facilities) {
      if (typeof entry !== 'string') {
        fail('INVALID_LISTING_FACILITIES', 'Each facility must be text.');
      }
      const facility = entry.trim();
      if (!facility || facility.length > 60) {
        fail('INVALID_LISTING_FACILITIES', 'Each facility must be between 1 and 60 characters.');
      }
      if (!facilities.some((existingFacility) => existingFacility.toLowerCase() === facility.toLowerCase())) {
        facilities.push(facility);
      }
    }
    incoming.facilities = facilities;
  }

  if (incoming.availability !== undefined) {
    const availability = incoming.availability;
    if (!availability || typeof availability !== 'object' || Array.isArray(availability)) {
      fail('INVALID_LISTING_AVAILABILITY', 'Availability must be an object.');
    }
    const record = availability as Record<string, unknown>;
    const status = text(record.status) || 'not_reported';
    if (!['available', 'limited', 'sold_out', 'not_reported'].includes(status)) {
      fail('INVALID_LISTING_AVAILABILITY', 'Availability status is not supported.');
    }
    const note = record.note === undefined ? '' : String(record.note).trim();
    if (note.length > 300) {
      fail('INVALID_LISTING_AVAILABILITY', 'Availability note must be 300 characters or fewer.');
    }
    const nextAvailableFrom =
      record.nextAvailableFrom === undefined ? '' : String(record.nextAvailableFrom).trim();
    if (nextAvailableFrom && !isIsoDateOnly(nextAvailableFrom)) {
      fail('INVALID_LISTING_AVAILABILITY', 'Availability date must be YYYY-MM-DD.');
    }
    let unitsAvailable: number | null = null;
    if (record.unitsAvailable !== undefined && record.unitsAvailable !== null && record.unitsAvailable !== '') {
      const units = numberValue(record.unitsAvailable);
      if (
        !Number.isInteger(units) ||
        units < 0 ||
        units > 1_000_000
      ) {
        fail('INVALID_LISTING_AVAILABILITY', 'Units available must be a whole number between 0 and 1,000,000.');
      }
      unitsAvailable = units;
    }
    incoming.availability = { status, note, nextAvailableFrom, unitsAvailable };
  }

  if (incoming.customFieldValues !== undefined) {
    const custom = incoming.customFieldValues;
    if (!custom || typeof custom !== 'object' || Array.isArray(custom)) {
      fail('INVALID_LISTING_DETAILS', 'customFieldValues must be an object.');
    }
    const entries = Object.entries(custom as Record<string, unknown>);
    if (entries.length > 100) {
      fail('INVALID_LISTING_DETAILS', 'Too many custom fields.');
    }
    const existingCustom = asRecord(existingPayload.customFieldValues);
    const schema = nextModule ? liveEditModuleSchema(nextModule) : null;
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (!key || key.length > 80) {
        fail('INVALID_LISTING_DETAILS', 'Custom field keys must be 80 characters or fewer.');
      }
      if (
        value !== null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        fail('INVALID_LISTING_DETAILS', `Custom field "${key}" must be a scalar value.`);
      }
      if (typeof value === 'string' && value.length > 1000) {
        fail('INVALID_LISTING_DETAILS', `Custom field "${key}" is too long.`);
      }
      const field = schema?.detailFields.find((candidate) => candidate.key === key);
      if (field && JSON.stringify(existingCustom[key]) !== JSON.stringify(value)) {
        const checked = validateModuleDetailValue(nextModule as LiveEditModule, key, value as LiveEditDetailValue);
        if (!checked.ok) {
          fail('INVALID_LISTING_DETAILS', `Custom field "${key}": ${checked.error}`);
        }
        normalized[key] = checked.value;
      } else if (field) {
        normalized[key] = value;
      } else {
        normalized[key] = value;
      }
    }
    incoming.customFieldValues = normalized;
  }

  result.payload = incoming;
  return result;
}

export interface CinemaTier {
  name: string;
  rows: string[];
  price: number;
}

export interface ValidatedCinemaScreen {
  cinemaName: string;
  screenName: string;
  projectionFormat: string;
  soundFormat: string;
  showtimes: string[];
  cancellationCutoffMins: number;
  refundPercent: number;
  convenienceFeePerSeat: number;
  gstPercent: number;
  fnbDeliveryEnabled: boolean;
  wheelchairSeats: string[];
  tiers: CinemaTier[];
  totalSeats: number;
  cancellationAllowed: boolean;
}

function boundedNumber(value: unknown, min: number, max: number, label: string): number {
  const parsed = numberValue(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    fail('INVALID_CINEMA_FIELDS', `${label} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function boundedInteger(value: unknown, min: number, max: number, label: string): number {
  const parsed = boundedNumber(value, min, max, label);
  if (!Number.isInteger(parsed)) fail('INVALID_CINEMA_FIELDS', `${label} must be a whole number.`);
  return parsed;
}

/**
 * Validate the cinema screen PUT body against the existing screen. The server
 * persists only the fields returned here.
 */
export function validateCinemaScreenUpdate(
  body: Record<string, unknown>,
  previous: Record<string, unknown>,
): ValidatedCinemaScreen {
  const cinemaName = text(body.cinemaName ?? body.cinemaTitle ?? previous.cinemaName ?? previous.cinemaTitle);
  if (!cinemaName || cinemaName.length > 120) {
    fail('INVALID_CINEMA_FIELDS', 'Cinema name must be between 1 and 120 characters.');
  }
  const screenName = text(body.screenName ?? previous.screenName);
  if (!screenName || screenName.length > 120) {
    fail('INVALID_CINEMA_FIELDS', 'Screen name must be between 1 and 120 characters.');
  }
  const projectionFormat = text(body.projectionFormat ?? body.format ?? previous.projectionFormat ?? previous.format);
  if (projectionFormat.length > 80) {
    fail('INVALID_CINEMA_FIELDS', 'Projection format must be 80 characters or fewer.');
  }
  const soundFormat = text(body.soundFormat ?? body.soundSystem ?? previous.soundFormat ?? previous.soundSystem);
  if (soundFormat.length > 80) {
    fail('INVALID_CINEMA_FIELDS', 'Sound format must be 80 characters or fewer.');
  }

  const rawShowtimes = Array.isArray(body.showtimes)
    ? body.showtimes
    : Array.isArray(previous.showtimes)
      ? previous.showtimes
      : [];
  if (rawShowtimes.length === 0 || rawShowtimes.length > 30) {
    fail('INVALID_CINEMA_FIELDS', 'At least one and at most 30 showtimes are required.');
  }
  const parsedShowtimes = parseShowtimes(rawShowtimes.map((entry) => String(entry)).join(', '));
  if (!parsedShowtimes.ok || parsedShowtimes.times.length === 0) {
    fail('INVALID_CINEMA_FIELDS', `Invalid showtimes: ${parsedShowtimes.invalid.slice(0, 4).join(', ')}.`);
  }

  const cancellationCutoffMins = boundedInteger(
    body.cancellationCutoffMins ?? body.cancellationCutoffMinutes ?? previous.cancellationCutoffMins ?? previous.cancellationCutoffMinutes ?? 0,
    0,
    1440,
    'Cancellation cutoff'
  );
  const refundPercent = boundedInteger(
    body.refundPercent ?? previous.refundPercent ?? 0,
    0,
    100,
    'Refund percent'
  );
  const convenienceFeePerSeat = boundedNumber(
    body.convenienceFeePerSeat ?? previous.convenienceFeePerSeat ?? 0,
    0,
    10000,
    'Convenience fee'
  );
  const gstPercent = boundedNumber(body.gstPercent ?? previous.gstPercent ?? 0, 0, 50, 'GST percent');

  if (body.fnbDeliveryEnabled !== undefined && typeof body.fnbDeliveryEnabled !== 'boolean') {
    fail('INVALID_CINEMA_FIELDS', 'F&B delivery must be a boolean.');
  }
  const fnbDeliveryEnabled =
    body.fnbDeliveryEnabled === undefined
      ? Boolean(previous.fnbDeliveryEnabled)
      : body.fnbDeliveryEnabled === true;

  const rawWheelchair = Array.isArray(body.wheelchairSeats)
    ? body.wheelchairSeats
    : Array.isArray(previous.wheelchairSeats)
      ? previous.wheelchairSeats
      : [];
  if (rawWheelchair.length > 50) {
    fail('INVALID_CINEMA_FIELDS', 'Too many wheelchair seats.');
  }
  const wheelchairSeats: string[] = [];
  for (const entry of rawWheelchair) {
    const seat = String(entry).trim().toUpperCase();
    if (!/^[A-Z]{1,3}\d{1,3}$/.test(seat)) {
      fail('INVALID_CINEMA_FIELDS', `Invalid wheelchair seat code "${seat}".`);
    }
    if (!wheelchairSeats.includes(seat)) wheelchairSeats.push(seat);
  }

  let rawTiers: unknown = body.tiers ?? body.seatTiers ?? previous.tiers;
  if (!Array.isArray(rawTiers) && Array.isArray(previous.seatTiers)) {
    rawTiers = previous.seatTiers.map((tier) => {
      const record = asRecord(tier);
      return {
        name: record.name,
        rows: record.rows,
        price: record.price ?? Math.round(250 * Number(record.priceMultiplier ?? 1)),
      };
    });
  }
  if (!Array.isArray(rawTiers) || rawTiers.length === 0 || rawTiers.length > 10) {
    fail('INVALID_CINEMA_FIELDS', 'Between 1 and 10 seat tiers are required.');
  }
  const tiers: CinemaTier[] = [];
  for (const tier of rawTiers) {
    const record = asRecord(tier);
    const name = text(record.name);
    if (!name || name.length > 40) {
      fail('INVALID_CINEMA_FIELDS', 'Each seat tier needs a name of 40 characters or fewer.');
    }
    const price = boundedNumber(record.price, 0, 1_000_000, `Seat tier "${name}" price`);
    const rows = Array.isArray(record.rows) ? record.rows : [];
    if (rows.length > 26) fail('INVALID_CINEMA_FIELDS', `Seat tier "${name}" has too many rows.`);
    const normalizedRows: string[] = [];
    for (const row of rows) {
      const label = String(row).trim().toUpperCase();
      if (!/^[A-Z]{1,3}$/.test(label)) {
        fail('INVALID_CINEMA_FIELDS', `Seat tier "${name}" has an invalid row label.`);
      }
      if (!normalizedRows.includes(label)) normalizedRows.push(label);
    }
    if (tiers.some((existingTier) => existingTier.name.toLowerCase() === name.toLowerCase())) {
      fail('INVALID_CINEMA_FIELDS', 'Seat tier names must be unique.');
    }
    tiers.push({ name, rows: normalizedRows, price });
  }

  const totalSeats = boundedInteger(
    body.totalSeats ?? previous.totalSeats ?? 80,
    1,
    100000,
    'Total seats'
  );
  if (body.cancellationAllowed !== undefined && typeof body.cancellationAllowed !== 'boolean') {
    fail('INVALID_CINEMA_FIELDS', 'Cancellation allowed must be a boolean.');
  }
  const cancellationAllowed =
    body.cancellationAllowed === undefined
      ? previous.cancellationAllowed !== false
      : body.cancellationAllowed === true;

  return {
    cinemaName,
    screenName,
    projectionFormat,
    soundFormat,
    showtimes: parsedShowtimes.times,
    cancellationCutoffMins,
    refundPercent,
    convenienceFeePerSeat,
    gstPercent,
    fnbDeliveryEnabled,
    wheelchairSeats,
    tiers,
    totalSeats,
    cancellationAllowed,
  };
}

// Re-exported for tests that exercise the parser directly.
export { normalizeShowtimeEntry, parseTierPricing };

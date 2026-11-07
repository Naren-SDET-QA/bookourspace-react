import { isPersistableListingImageSource } from '../media/signedStorageUrl';
import { liveEditModuleSchema } from './moduleSchemas';
import { categoryMatchesModule } from './moduleInference';
import type {
  LiveEditDetailValue,
  LiveEditDraft,
  LiveEditFieldDefinition,
  LiveEditFieldErrorMap,
  LiveEditModule,
  LiveEditValidationResult,
} from './types';

const HTTPS_URL = /^https:\/\/[^\s]+$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24 = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_12 = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([AaPp][Mm])$/;
const PRICE_UNIT = /^\/?[A-Za-z][A-Za-z0-9 /+.-]{0,39}$/;
const MAX_IMAGES = 20;
const MAX_FACILITIES = 30;
const MAX_PRICE = 1_000_000_000;

export function isHttpsUrl(value: string): boolean {
  if (!HTTPS_URL.test(value)) return false;
  if (value.length > 600) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function isIsoDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Accept both the 24-hour form used by new editors and the 12-hour labels the
 * cinema store already contains (e.g. "10:30 AM"). Entries are normalised for
 * comparison but keep their original order and 12/24-hour shape, because the
 * booking workflow matches showtime labels exactly.
 */
export function normalizeShowtimeEntry(entry: string): string | null {
  const value = entry.trim();
  if (TIME_24.test(value)) {
    const [hour, minute] = value.split(':');
    return `${hour.padStart(2, '0')}:${minute}`;
  }
  const match = value.match(TIME_12);
  if (match) {
    const [, hour, minute, meridiem] = match;
    return `${hour.padStart(2, '0')}:${minute} ${meridiem.toUpperCase()}`;
  }
  return null;
}

export function parseShowtimes(raw: string): { ok: boolean; times: string[]; invalid: string[] } {
  const entries = raw
    .split(/[,\n;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const times: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const normalized = normalizeShowtimeEntry(entry);
    if (!normalized) {
      invalid.push(entry);
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    times.push(normalized);
  }
  return { ok: invalid.length === 0, times, invalid };
}

export function normalizeShowtimes(raw: string): string {
  return parseShowtimes(raw).times.join(', ');
}

export interface SeatTierPrice {
  name: string;
  price: number;
}

export function parseTierPricing(raw: string): {
  ok: boolean;
  tiers: SeatTierPrice[];
  invalid: string[];
} {
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const tiers: SeatTierPrice[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^([^=]{1,40}?)\s*=\s*₹?\s*(\d{1,7}(?:\.\d{1,2})?)$/);
    if (!match) {
      invalid.push(line);
      continue;
    }
    const name = match[1].trim();
    const price = Number(match[2]);
    if (!name || !Number.isFinite(price) || price < 0 || seen.has(name.toLowerCase())) {
      invalid.push(line);
      continue;
    }
    seen.add(name.toLowerCase());
    tiers.push({ name, price });
  }
  return { ok: invalid.length === 0, tiers, invalid };
}

export function normalizeTierPricing(raw: string): string {
  return parseTierPricing(raw)
    .tiers.map((tier) => `${tier.name} = ${tier.price}`)
    .join('\n');
}

function coerceText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value === true) return 'true';
  if (value === false) return 'false';
  return '';
}

function validateDetailField(
  field: LiveEditFieldDefinition,
  value: LiveEditDetailValue | undefined,
  errors: LiveEditFieldErrorMap
): LiveEditDetailValue | undefined {
  const path = `details.${field.key}`;
  if (value === undefined) return undefined;

  if (field.kind === 'boolean') {
    const checked = value === true || value === 'true';
    if (field.required && !checked) errors[path] = `${field.label} must be enabled.`;
    return checked;
  }

  const text = coerceText(value);
  if (!text) {
    if (field.required) errors[path] = `${field.label} is required.`;
    return '';
  }

  switch (field.kind) {
    case 'number':
    case 'currency': {
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) {
        errors[path] = `${field.label} must be a number.`;
        return text;
      }
      if (field.min !== undefined && numeric < field.min) {
        errors[path] = `${field.label} must be at least ${field.min}.`;
        return text;
      }
      if (field.max !== undefined && numeric > field.max) {
        errors[path] = `${field.label} must be at most ${field.max}.`;
        return text;
      }
      return numeric;
    }
    case 'select': {
      if (field.options && field.options.length > 0 && !field.options.includes(text)) {
        errors[path] = `${field.label} must be one of the supported options.`;
        return text;
      }
      return text;
    }
    case 'url': {
      if (!isHttpsUrl(text)) {
        errors[path] = `${field.label} must be a secure https:// URL.`;
        return text;
      }
      return text;
    }
    case 'date': {
      if (!isIsoDateOnly(text)) {
        errors[path] = `${field.label} must be a valid date (YYYY-MM-DD).`;
        return text;
      }
      return text;
    }
    case 'time-list': {
      const parsed = parseShowtimes(text);
      if (parsed.times.length === 0) {
        errors[path] = `${field.label} needs at least one valid time.`;
        return text;
      }
      if (!parsed.ok) {
        errors[path] = `Invalid times: ${parsed.invalid.slice(0, 4).join(', ')}. Use HH:MM (24h) or h:mm AM/PM.`;
        return text;
      }
      return parsed.times.join(', ');
    }
    case 'tier-pricing': {
      const parsed = parseTierPricing(text);
      if (!parsed.ok) {
        errors[path] = `Use "Tier name = ₹price" per line. Invalid: ${parsed.invalid.slice(0, 3).join(' | ')}.`;
        return text;
      }
      if (parsed.tiers.length === 0) {
        errors[path] = `${field.label} needs at least one tier.`;
        return text;
      }
      return normalizeTierPricing(text);
    }
    default: {
      if (field.maxLength !== undefined && text.length > field.maxLength) {
        errors[path] = `${field.label} must be ${field.maxLength} characters or fewer.`;
        return text;
      }
      return text;
    }
  }
}

/**
 * Pure, synchronous validation. The UI disables Save on `!ok` and the
 * repository re-runs the same validation before any network call, so a stale or
 * tampered draft cannot reach the backend.
 */
export function validateLiveEditDraft(module: LiveEditModule, draft: LiveEditDraft): LiveEditValidationResult {
  const schema = liveEditModuleSchema(module);
  const errors: LiveEditFieldErrorMap = {};

  const clean: LiveEditDraft = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    categoryId: draft.categoryId.trim(),
    subcategory: draft.subcategory.trim(),
    price: String(draft.price ?? '').trim(),
    priceUnit: draft.priceUnit.trim(),
    images: [],
    facilities: [],
    availability: {
      status: draft.availability.status,
      note: draft.availability.note.trim(),
      nextAvailableFrom: draft.availability.nextAvailableFrom.trim(),
      unitsAvailable: String(draft.availability.unitsAvailable ?? '').trim(),
    },
    details: { ...draft.details },
  };

  if (clean.title.length < 2 || clean.title.length > 160) {
    errors.title = 'Title must be between 2 and 160 characters.';
  }

  if (schema.descriptionMaxLength > 0) {
    if (clean.description.length > schema.descriptionMaxLength) {
      errors.description = `Description must be ${schema.descriptionMaxLength} characters or fewer.`;
    }
  } else if (!schema.blockedFields.description) {
    errors.description = 'This module has no editable description.';
  }

  if (schema.supportsCategories) {
    if (!clean.categoryId) {
      errors.categoryId = 'Category is required.';
    } else if (clean.categoryId.length > 80) {
      errors.categoryId = 'Category must be 80 characters or fewer.';
    } else if (!categoryMatchesModule(module, clean.categoryId)) {
      errors.categoryId = `Category must belong to ${module.replaceAll('_', ' ')}.`;
    }
  }
  if (!clean.subcategory || clean.subcategory.length > 80) {
    errors.subcategory = schema.supportsCategories
      ? 'Subcategory must be between 1 and 80 characters.'
      : 'Screen name must be between 1 and 80 characters.';
  }

  if (schema.supportsPricing) {
    if (!clean.price) {
      errors.price = 'Price is required.';
    } else {
      const numeric = Number(clean.price);
      if (!Number.isFinite(numeric)) {
        errors.price = 'Price must be a number.';
      } else if (numeric < 0) {
        errors.price = 'Price cannot be negative.';
      } else if (numeric > MAX_PRICE) {
        errors.price = 'Price is above the supported maximum.';
      } else if (!/^\d+(\.\d{1,2})?$/.test(clean.price)) {
        errors.price = 'Use up to 2 decimal places.';
      }
    }
    if (!clean.priceUnit) {
      errors.priceUnit = 'Price unit is required.';
    } else if (!PRICE_UNIT.test(clean.priceUnit)) {
      errors.priceUnit = 'Price unit must be a short label such as /month or /visit.';
    }
  } else {
    clean.price = '';
    clean.priceUnit = '';
  }

  if (schema.supportsImages) {
    const seen = new Set<string>();
    clean.images = draft.images.map((url) => url.trim()).filter(Boolean);
    if (clean.images.length > Math.min(MAX_IMAGES, schema.imageLimit)) {
      errors.images = `Add at most ${Math.min(MAX_IMAGES, schema.imageLimit)} images.`;
    }
    clean.images.forEach((url, index) => {
      if (!isPersistableListingImageSource(url)) errors[`images.${index}`] = 'Images must be secure https:// URLs or public Storage references.';
      if (seen.has(url)) errors[`images.${index}`] = 'Duplicate image URL.';
      seen.add(url);
    });
  } else {
    clean.images = [];
  }

  if (schema.supportsFacilities) {
    const seen = new Set<string>();
    clean.facilities = draft.facilities
      .map((facility) => facility.trim())
      .filter(Boolean)
      .filter((facility) => {
        const key = facility.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (clean.facilities.length > MAX_FACILITIES) {
      errors.facilities = `List at most ${MAX_FACILITIES} facilities.`;
    }
    clean.facilities.forEach((facility, index) => {
      if (facility.length > 60) errors[`facilities.${index}`] = 'Each facility must be 60 characters or fewer.';
    });
  } else {
    clean.facilities = [];
  }

  if (schema.supportsAvailability) {
    if (!['available', 'limited', 'sold_out', 'not_reported'].includes(clean.availability.status)) {
      errors['availability.status'] = 'Choose a valid availability status.';
    }
    if (clean.availability.note.length > 300) {
      errors['availability.note'] = 'Availability note must be 300 characters or fewer.';
    }
    if (clean.availability.nextAvailableFrom && !isIsoDateOnly(clean.availability.nextAvailableFrom)) {
      errors['availability.nextAvailableFrom'] = 'Use a valid date (YYYY-MM-DD).';
    }
    if (clean.availability.unitsAvailable) {
      const units = Number(clean.availability.unitsAvailable);
      if (!Number.isInteger(units) || units < 0 || units > 1_000_000) {
        errors['availability.unitsAvailable'] = 'Units available must be a whole number between 0 and 1,000,000.';
      }
    }
  } else {
    clean.availability = { status: 'not_reported', note: '', nextAvailableFrom: '', unitsAvailable: '' };
  }

  for (const field of schema.detailFields) {
    const nextValue = validateDetailField(field, clean.details[field.key], errors);
    if (nextValue === undefined) continue;
    clean.details[field.key] = nextValue;
  }

  return { ok: Object.keys(errors).length === 0, errors, draft: clean };
}

/** Validate one module-specific detail value (used by the server re-check). */
export function validateModuleDetailValue(
  module: LiveEditModule,
  key: string,
  value: LiveEditDetailValue
): { ok: boolean; value: LiveEditDetailValue | undefined; error?: string } {
  const field = liveEditModuleSchema(module).detailFields.find((candidate) => candidate.key === key);
  if (!field) return { ok: false, value: undefined, error: `Unknown detail field "${key}".` };
  const errors: LiveEditFieldErrorMap = {};
  const normalized = validateDetailField(field, value, errors);
  const error = errors[`details.${key}`];
  return { ok: !error, value: normalized, error };
}

export function hasUnsavedChanges(original: LiveEditDraft, draft: LiveEditDraft): boolean {
  return JSON.stringify(original) !== JSON.stringify(draft);
}

export function changedFieldPaths(original: LiveEditDraft, next: LiveEditDraft): string[] {
  const paths: string[] = [];
  const simpleKeys: Array<keyof LiveEditDraft> = [
    'title',
    'description',
    'categoryId',
    'subcategory',
    'price',
    'priceUnit',
  ];
  for (const key of simpleKeys) {
    if (JSON.stringify(original[key]) !== JSON.stringify(next[key])) paths.push(String(key));
  }
  if (JSON.stringify(original.images) !== JSON.stringify(next.images)) paths.push('images');
  if (JSON.stringify(original.facilities) !== JSON.stringify(next.facilities)) paths.push('facilities');
  if (JSON.stringify(original.availability) !== JSON.stringify(next.availability)) paths.push('availability');
  const detailKeys = new Set([...Object.keys(original.details), ...Object.keys(next.details)]);
  for (const key of detailKeys) {
    if (JSON.stringify(original.details[key]) !== JSON.stringify(next.details[key])) {
      paths.push(`details.${key}`);
    }
  }
  return paths.sort();
}

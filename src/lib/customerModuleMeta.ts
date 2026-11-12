/**
 * Shared customer-module vocabulary.
 *
 * Browser-safe: no database, no Node imports. Both the server gate and the
 * client navigation use this single mapping so a module or section rename can
 * never drift between enforcement and visibility.
 */

export const CUSTOMER_MODULE_KEYS = [
  'pg',
  'hotels',
  'services',
  'movies',
  'classes',
  'function_hall',
  'ecommerce',
] as const;

export type CustomerModuleKey = (typeof CUSTOMER_MODULE_KEYS)[number];

export type CustomerModuleSection =
  | 'pg_hostels'
  | 'hotel_stay'
  | 'services'
  | 'movies'
  | 'classes'
  | 'venues';

export interface CustomerModuleMeta {
  label: string;
  shortLabel: string;
  section: CustomerModuleSection | null;
  emoji: string;
}

export const CUSTOMER_MODULE_META: Record<CustomerModuleKey, CustomerModuleMeta> = {
  pg: { label: 'PG Accommodation', shortLabel: "PG's", section: 'pg_hostels', emoji: '🏠' },
  hotels: { label: 'Stays & Properties', shortLabel: 'Stays', section: 'hotel_stay', emoji: '🏨' },
  services: { label: 'Home Services', shortLabel: 'Services', section: 'services', emoji: '🛠️' },
  movies: { label: 'Movies & Cinemas', shortLabel: 'Movies', section: 'movies', emoji: '🎬' },
  classes: { label: 'Institutes & Classes', shortLabel: 'Classes', section: 'classes', emoji: '🎓' },
  function_hall: { label: 'Events & Function Halls', shortLabel: 'Events', section: 'venues', emoji: '🏛️' },
  ecommerce: { label: 'Ecommerce', shortLabel: 'Ecommerce', section: null, emoji: '🛒' },
};

const SECTION_TO_MODULE: Record<string, CustomerModuleKey> = Object.fromEntries(
  (Object.entries(CUSTOMER_MODULE_META) as Array<[CustomerModuleKey, CustomerModuleMeta]>)
    .filter(([, meta]) => meta.section)
    .map(([key, meta]) => [meta.section as string, key]),
);

export function isCustomerModuleKey(value: unknown): value is CustomerModuleKey {
  return typeof value === 'string' && (CUSTOMER_MODULE_KEYS as readonly string[]).includes(value);
}

export function normalizeCustomerModuleKey(value: unknown): CustomerModuleKey | null {
  return isCustomerModuleKey(value) ? value : null;
}

export function moduleKeyForSection(section: string | null | undefined): CustomerModuleKey | null {
  if (!section) return null;
  return SECTION_TO_MODULE[section] ?? null;
}

export function sectionForModuleKey(key: CustomerModuleKey): CustomerModuleSection | null {
  return CUSTOMER_MODULE_META[key].section;
}

/** Every module that has a customer-facing section screen. */
export const CUSTOMER_VISIBLE_MODULE_KEYS: CustomerModuleKey[] = CUSTOMER_MODULE_KEYS.filter(
  (key) => CUSTOMER_MODULE_META[key].section !== null,
);

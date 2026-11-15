/**
 * Canonical customer/business module mapping.
 *
 * The platform has three historical naming schemes for the same marketplace
 * modules, and they have drifted:
 *
 *   - `business_module_access` / provider business context / marketplace UI use
 *     `pg_hostels`, `classes`, `venues`, `services`, `hotel_stay`, `movies`.
 *   - `platform_module_flags` / `src/server/moduleGate.ts` use
 *     `pg`, `classes`, `function_hall`, `services`, `hotels`, `movies`, `ecommerce`.
 *   - `src/modules/registry.ts` uses `pg`, `classes`, `function_hall`,
 *     `services`, `hotels`, `movies`, `ecommerce`.
 *
 * This module is the single source of truth for the *customer/business* module
 * namespace (the one that controls per-business access) and its aliases into
 * the other namespaces. Nothing here grants access; it only names modules so
 * that authorization decisions and audits never disagree about which module a
 * request belongs to.
 */

/** Canonical business module type. Mirrors the SQL check constraint. */
export type BusinessModuleId =
  | 'pg_hostels'
  | 'classes'
  | 'venues'
  | 'services'
  | 'hotel_stay'
  | 'movies';

export const BUSINESS_MODULE_IDS: readonly BusinessModuleId[] = [
  'pg_hostels',
  'classes',
  'venues',
  'services',
  'hotel_stay',
  'movies',
];

export interface BusinessModuleMapEntry {
  id: BusinessModuleId;
  /** Human label used in admin and provider UI. */
  label: string;
  /** The `platform_module_flags.module_key` / moduleGate key for this module. */
  platformModuleKey: string;
  /** The `MODULE_REGISTRY` id for this module. */
  registryId: string;
  /** The marketplace section type (`MarketSectionType`) for this module. */
  marketSection: string;
  /** Names a customer may use when describing their module. */
  aliases: readonly string[];
}

export const BUSINESS_MODULE_MAP: readonly BusinessModuleMapEntry[] = [
  {
    id: 'pg_hostels',
    label: 'PG & Hostels',
    platformModuleKey: 'pg',
    registryId: 'pg',
    marketSection: 'pg_hostels',
    aliases: ['pg', 'hostel', 'pg & hostels', 'pg_hostels'],
  },
  {
    id: 'classes',
    label: 'Classes & Institutes',
    platformModuleKey: 'classes',
    registryId: 'classes',
    marketSection: 'classes',
    aliases: ['classes', 'institutes', 'institute', 'coaching', 'courses'],
  },
  {
    id: 'venues',
    label: 'Function Halls & Events',
    platformModuleKey: 'function_hall',
    registryId: 'function_hall',
    marketSection: 'venues',
    aliases: ['venues', 'events', 'function halls', 'halls', 'function_hall'],
  },
  {
    id: 'services',
    label: 'Home Services',
    platformModuleKey: 'services',
    registryId: 'services',
    marketSection: 'services',
    aliases: ['services', 'home services'],
  },
  {
    id: 'hotel_stay',
    label: 'Hotels & Stays',
    platformModuleKey: 'hotels',
    registryId: 'hotels',
    marketSection: 'hotel_stay',
    aliases: ['stays', 'hotels', 'hotel_stay', 'properties', 'stay properties'],
  },
  {
    id: 'movies',
    label: 'Movies & Events',
    platformModuleKey: 'movies',
    registryId: 'movies',
    marketSection: 'movies',
    aliases: ['movies', 'cinemas', 'movies & events'],
  },
];

export function businessModuleById(id: string): BusinessModuleMapEntry | null {
  return BUSINESS_MODULE_MAP.find((entry) => entry.id === id) ?? null;
}

/**
 * Resolve a free-form customer module name (as used in the audit request:
 * "PG", "Properties", "Stays", "Services", "Movies", "Institutes", "Events")
 * to a canonical business module id. Returns `null` when the name cannot be
 * mapped unambiguously, which callers must treat as "no module" (fail closed).
 */
export function resolveRequestedModuleName(name: string): BusinessModuleId | null {
  const normalised = String(name || '').trim().toLowerCase();
  if (!normalised) return null;
  for (const entry of BUSINESS_MODULE_MAP) {
    if (entry.id === normalised) return entry.id;
    if (entry.aliases.some((alias) => alias.toLowerCase() === normalised)) return entry.id;
  }
  return null;
}

/** Every alias must resolve to exactly one canonical module and never collide. */
export function moduleAliasCollisions(): Array<{ alias: string; ids: BusinessModuleId[] }> {
  const seen = new Map<string, BusinessModuleId[]>();
  for (const entry of BUSINESS_MODULE_MAP) {
    for (const alias of [entry.id, ...entry.aliases]) {
      const key = alias.toLowerCase();
      const existing = seen.get(key) ?? [];
      if (!existing.includes(entry.id)) existing.push(entry.id);
      seen.set(key, existing);
    }
  }
  return [...seen.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([alias, ids]) => ({ alias, ids }));
}

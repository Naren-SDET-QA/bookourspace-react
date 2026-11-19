/**
 * One catalog for every marketplace category the access-control engine governs.
 *
 * This is deliberately built on the vocabulary the product already stores:
 *   * `customer_module_access.module_key` is the storage key for a customer;
 *   * `business_member_access.allowed_modules` stores provider module keys;
 *   * `src/lib/businessAccess.ts` publishes the action and section catalogs;
 *   * `src/modules/registry.ts` declares the active marketplace modules.
 *
 * Adding a category therefore means adding a module to the registry (or an
 * alias below for a sub-category that is governed by its parent module and no
 * migration and no engine change are needed. Nothing here touches the database.
 */

import {
  ACCESS_ACTIONS,
  ACCESS_MODULE_LABELS,
  MODULE_SECTION_KEYS,
  type AccessAction,
  type AccessModule,
} from '../lib/businessAccess';
import {
  CUSTOMER_MODULE_META,
  CUSTOMER_VISIBLE_MODULE_KEYS,
  type CustomerModuleKey,
} from '../lib/customerModuleMeta';
import { MODULE_REGISTRY, type ModuleId } from '../modules/registry';

/** The exact actions the authorization engine understands. */
export type PermissionAction = AccessAction;

/** Deny-by-default action list for a brand-new customer or provider account. */
export const DEFAULT_SIGNUP_ACTIONS: readonly PermissionAction[] = ['view'];

/** Explicit "complete access" action list written by the admin console. */
export const COMPLETE_ACCESS_ACTIONS: readonly PermissionAction[] = [...ACCESS_ACTIONS];

export interface AccessCategory {
  /** Storage key: `customer_module_access.module_key`. */
  key: CustomerModuleKey;
  label: string;
  emoji: string;
  /** Module declared in `src/modules/registry.ts`. */
  moduleId: ModuleId;
  /**
   * Provider/business module key (`businesses.module_type`), or `null` when the
   * category has no provider workspace.
   */
  providerModule: AccessModule | null;
  /** Whether the category renders a marketplace screen today. */
  active: boolean;
  /** Sections that can be granted inside the category. */
  sections: ReadonlyArray<{ key: string; label: string }>;
}

const PROVIDER_MODULE_FOR_CATEGORY: Record<CustomerModuleKey, AccessModule | null> = {
  hotels: 'hotel_stay',
  pg: 'pg_hostels',
  services: 'services',
  movies: 'movies',
  classes: 'classes',
  function_hall: 'venues',
  ecommerce: null,
};

const MODULE_ID_FOR_CATEGORY: Record<CustomerModuleKey, ModuleId> = {
  hotels: 'hotels',
  pg: 'pg',
  services: 'services',
  movies: 'movies',
  classes: 'classes',
  function_hall: 'function_hall',
  ecommerce: 'ecommerce',
};

function buildCategory(key: CustomerModuleKey): AccessCategory {
  const meta = CUSTOMER_MODULE_META[key];
  const providerModule = PROVIDER_MODULE_FOR_CATEGORY[key];
  return {
    key,
    label: meta.label,
    emoji: meta.emoji,
    moduleId: MODULE_ID_FOR_CATEGORY[key],
    providerModule,
    active: CUSTOMER_VISIBLE_MODULE_KEYS.includes(key),
    sections: providerModule ? MODULE_SECTION_KEYS[providerModule] : [],
  };
}

/**
 * Every category the engine knows, including `ecommerce`, which exists in the
 * registry but has no screen yet. An admin can therefore prepare a grant before
 * the screen ships, and the engine can still refuse an unknown key.
 */
export const ACCESS_CATEGORIES: readonly AccessCategory[] = (
  Object.keys(CUSTOMER_MODULE_META) as CustomerModuleKey[]
).map(buildCategory);

const CATEGORY_BY_KEY = new Map<string, AccessCategory>(
  ACCESS_CATEGORIES.map((category) => [category.key, category]),
);

/**
 * Alternate names the rest of the product, the admin UI, provider module keys
 * and service sub-categories use for the same governed category.
 *
 * Local services (including water delivery, milk, groceries, laundry and the
 * other builder-defined service categories) are all governed by the `services`
 * module grant. Listing them here means an API or admin request can name its
 * own category without creating a second permission store.
 */
export const CATEGORY_ALIASES: Readonly<Record<string, CustomerModuleKey>> = {
  // Stays
  hotels: 'hotels',
  hotel: 'hotels',
  hotels_stay: 'hotels',
  hotel_stay: 'hotels',
  stays: 'hotels',
  // PG
  pg: 'pg',
  pg_hostels: 'pg',
  pg_hostel: 'pg',
  hostels: 'pg',
  // Function halls
  function_hall: 'function_hall',
  function_halls: 'function_hall',
  venues: 'function_hall',
  venue: 'function_hall',
  events: 'function_hall',
  // Classes & courses
  classes: 'classes',
  courses: 'classes',
  course: 'classes',
  institutes: 'classes',
  institute: 'classes',
  // Local services and every service sub-category
  services: 'services',
  service: 'services',
  local_services: 'services',
  home_services: 'services',
  water_delivery: 'services',
  'srv-water-delivery': 'services',
  medicine_delivery: 'services',
  'srv-milk': 'services',
  'srv-groceries': 'services',
  'srv-flowers': 'services',
  'srv-mechanic': 'services',
  'srv-agriculture': 'services',
  'srv-laundry': 'services',
  'srv-local-delivery': 'services',
  'srv-renovation': 'services',
  // Movies
  movies: 'movies',
  movie: 'movies',
  cinemas: 'movies',
  // Ecommerce
  ecommerce: 'ecommerce',
  shop: 'ecommerce',
};

/** Resolve any accepted category name to its canonical storage key. */
export function canonicalCategoryKey(raw: unknown): CustomerModuleKey | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;
  if (CATEGORY_BY_KEY.has(value)) return value as CustomerModuleKey;
  return CATEGORY_ALIASES[value] ?? null;
}

export function getAccessCategory(raw: unknown): AccessCategory | null {
  const key = canonicalCategoryKey(raw);
  return key ? CATEGORY_BY_KEY.get(key) ?? null : null;
}

export function isPermissionAction(value: unknown): value is PermissionAction {
  return typeof value === 'string' && (ACCESS_ACTIONS as readonly string[]).includes(value);
}

/** Normalise an untrusted action list; unknown keys are refused, not dropped. */
export function sanitizeActions(input: unknown):
  | { ok: true; actions: PermissionAction[] }
  | { ok: false; error: 'INVALID_ACTIONS' } {
  if (input == null) return { ok: true, actions: [] };
  if (!Array.isArray(input)) return { ok: false, error: 'INVALID_ACTIONS' };
  const actions: PermissionAction[] = [];
  for (const entry of input) {
    if (!isPermissionAction(entry)) return { ok: false, error: 'INVALID_ACTIONS' };
    if (!actions.includes(entry)) actions.push(entry);
  }
  return { ok: true, actions };
}

/** Category that owns a provider/business module key. */
export function categoryForProviderModule(moduleKey: unknown): AccessCategory | null {
  const value = String(moduleKey ?? '').trim();
  if (!value) return null;
  return ACCESS_CATEGORIES.find((category) => category.providerModule === value) ?? null;
}

/** Only categories that currently render a screen, for signup seeding. */
export function activeAccessCategories(): readonly AccessCategory[] {
  return ACCESS_CATEGORIES.filter((category) => category.active);
}

/** Every provider module key the engine governs. */
export const PROVIDER_MODULE_KEYS: readonly AccessModule[] = ACCESS_CATEGORIES
  .map((category) => category.providerModule)
  .filter((moduleKey): moduleKey is AccessModule => moduleKey !== null);

export function categoryLabel(raw: unknown): string {
  return getAccessCategory(raw)?.label ?? String(raw ?? '');
}

export { ACCESS_ACTIONS, ACCESS_MODULE_LABELS };

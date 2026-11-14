/**
 * Customer-side section and action enforcement.
 *
 * The customer marketplace reuses one shared set of booking endpoints, so the
 * only trustworthy place to check a customer's grant is the server. This module
 * turns a request into the module, section and action it needs and decides
 * whether the signed-in customer's `customer_module_access` rows allow it.
 *
 * Pure functions only (no express, no database) so the rules can be unit
 * tested; `server.ts` owns the middleware and the query.
 *
 * Semantics mirror `src/lib/businessAccess.ts` exactly:
 *   * no grant rows at all          -> legacy behaviour (unrestricted) unless
 *                                      BOS_STRICT_CUSTOMER_DEFAULTS=1
 *   * a grant row for the module   -> that module's sections/actions apply
 *   * empty section/action array   -> every section / every action
 *   * `manage` implies every action; any granted action implies `view`
 */

import {
  ACCESS_ACTIONS,
  ACTION_FOR_METHOD,
  accessScopeFrom,
  actionGranted,
  moduleGranted,
  sectionGranted,
} from '../lib/businessAccess';
import type { AccessAction, AccessScope } from '../lib/businessAccess';
import { customerSectionKeysFor } from '../lib/customerModuleMeta';
import type { CustomerModuleKey } from '../lib/customerModuleMeta';



/** Customer grant row as read from `public.customer_module_access`. */
export interface CustomerGrantRow {
  module_key: string;
  allowed_sections?: unknown;
  allowed_actions?: unknown;
  expires_at?: string | null;
}

export interface CustomerRoutePermission {
  moduleKey: CustomerModuleKey;
  sectionKey: string;
  action: AccessAction;
}

/**
 * Customer-facing route prefixes. Only endpoints that already exist are
 * listed; an unlisted route keeps its handler's own authorization, which is
 * the pre-existing behaviour for unmapped provider routes too.
 */
const CUSTOMER_ROUTE_SECTIONS: ReadonlyArray<{
  prefix: string;
  moduleKey: CustomerModuleKey;
  sectionKey: string;
}> = [
  // src/server/stayApi.ts — discovery, holds, requests, wishlists, bookings
  { prefix: '/api/stays/bookings', moduleKey: 'hotels', sectionKey: 'hotel_stay' },
  { prefix: '/api/stays/holds', moduleKey: 'hotels', sectionKey: 'hotel_stay' },
  { prefix: '/api/stays/requests', moduleKey: 'hotels', sectionKey: 'hotel_stay' },
  { prefix: '/api/stays/wishlists', moduleKey: 'hotels', sectionKey: 'hotel_stay' },
  // src/server/pgBookingsApi.ts
  { prefix: '/api/pg/bookings', moduleKey: 'pg', sectionKey: 'pg_hostels' },
  // src/server/venueBookingsApi.ts
  { prefix: '/api/venue-bookings', moduleKey: 'function_hall', sectionKey: 'venues' },
  // src/server/serviceBookingApi.ts + serviceCommerceApi.ts
  { prefix: '/api/services/bookings', moduleKey: 'services', sectionKey: 'services' },
  // src/server/classEnrollmentApi.ts
  { prefix: '/api/classes/enrollments', moduleKey: 'classes', sectionKey: 'classes' },
].sort((a, b) => b.prefix.length - a.prefix.length) as ReadonlyArray<{
  prefix: string;
  moduleKey: CustomerModuleKey;
  sectionKey: string;
}>;

/**
 * Path fragments that act on an existing record instead of creating one.
 * `cancel` is a delete of the customer's own commitment; `review` is a new
 * record; `payment-intent`/`payment` belong to the booking they settle.
 */
const CANCEL_PATH = /\/(cancel|release)(\/|$)/i;
const REVIEW_PATH = /\/(review|reviews)(\/|$)/i;
const SETTLE_PATH = /\/(payment-intent|payment|payments|refund|quote)(\/|$)/i;

export function customerModuleForPath(rawPath: string): CustomerModuleKey | null {
  const pathOnly = String(rawPath || '').split(/[?#]/)[0];
  const normalized = `/${pathOnly.replace(/^\/+/, '')}`;
  const entry = CUSTOMER_ROUTE_SECTIONS.find(
    (candidate) => normalized === candidate.prefix || normalized.startsWith(`${candidate.prefix}/`),
  );
  return entry ? entry.moduleKey : null;
}

export function customerSectionForPath(rawPath: string): string | null {
  const pathOnly = String(rawPath || '').split(/[?#]/)[0];
  const normalized = `/${pathOnly.replace(/^\/+/, '')}`;
  const entry = CUSTOMER_ROUTE_SECTIONS.find(
    (candidate) => normalized === candidate.prefix || normalized.startsWith(`${candidate.prefix}/`),
  );
  return entry ? entry.sectionKey : null;
}

/** Action a customer request performs, from its method and path. */
export function actionForCustomerRoute(rawMethod: string, rawPath: string): AccessAction {
  const pathOnly = String(rawPath || '').split(/[?#]/)[0];
  if (CANCEL_PATH.test(pathOnly)) return 'delete';
  if (REVIEW_PATH.test(pathOnly)) return 'create';
  if (SETTLE_PATH.test(pathOnly)) return 'edit';
  return ACTION_FOR_METHOD[String(rawMethod || 'GET').toUpperCase()] || 'manage';
}

/** Permission a customer route requires, or `null` when the route is unmapped. */
export function permissionForCustomerRoute(
  rawMethod: string,
  rawPath: string,
): CustomerRoutePermission | null {
  const moduleKey = customerModuleForPath(rawPath);
  const sectionKey = customerSectionForPath(rawPath);
  if (!moduleKey || !sectionKey) return null;
  return { moduleKey, sectionKey, action: actionForCustomerRoute(rawMethod, rawPath) };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((entry) => entry.length > 0);
}

/**
 * Build the scope a customer's grant rows represent, or `null` when the
 * customer has no grants at all (the legacy contract).
 *
 * Expired rows must be filtered by the query, not here: this function only
 * interprets what it is given.
 */
export function customerScopeFromGrants(rows: readonly CustomerGrantRow[] | null | undefined): AccessScope | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return accessScopeFrom({
    allowed_modules: rows.map((row) => String(row.module_key)),
    allowed_sections: Object.fromEntries(
      rows
        .map((row) => [String(row.module_key), stringArray(row.allowed_sections)] as const)
        .filter(([, sections]) => sections.length > 0),
    ),
    allowed_actions: Object.fromEntries(
      rows
        .map((row) => [String(row.module_key), stringArray(row.allowed_actions)] as const)
        .filter(([, actions]) => actions.length > 0),
    ),
  });
}

export type CustomerPermissionError =
  | 'CUSTOMER_PERMISSIONS_REQUIRED'
  | 'CUSTOMER_MODULE_FORBIDDEN'
  | 'CUSTOMER_SECTION_FORBIDDEN'
  | 'CUSTOMER_ACTION_FORBIDDEN';

export type CustomerPermissionDecision =
  | { ok: true }
  | { ok: false; status: 403; error: CustomerPermissionError };

/** Deny-by-default for customers with no grant rows. Off unless explicitly set. */
export function strictCustomerDefaults(env?: Record<string, string | undefined>): boolean {
  return String(env?.BOS_STRICT_CUSTOMER_DEFAULTS || '') === '1';
}

/**
 * Authorize one customer request.
 *
 * Providers and administrators are never constrained here — their access is
 * decided by the business gate. A route with no permission mapping keeps its
 * handler's authorization. Everything else fails closed.
 */
export function evaluateCustomerPermission(input: {
  role?: string | null;
  grants: readonly CustomerGrantRow[] | null | undefined;
  permission: CustomerRoutePermission | null;
  strictDefaults?: boolean;
}): CustomerPermissionDecision {
  const role = String(input.role || '');
  if (role === 'admin' || role === 'provider') return { ok: true };
  if (role !== 'customer') return { ok: true };
  if (!input.permission) return { ok: true };

  const scope = customerScopeFromGrants(input.grants);
  if (!scope) {
    return input.strictDefaults
      ? { ok: false, status: 403, error: 'CUSTOMER_PERMISSIONS_REQUIRED' }
      : { ok: true };
  }

  const { moduleKey, sectionKey, action } = input.permission;
  if (!moduleGranted(scope, moduleKey)) {
    return { ok: false, status: 403, error: 'CUSTOMER_MODULE_FORBIDDEN' };
  }
  // Validate the grant catalog so a stored key the product does not render
  // cannot accidentally match; unknown keys simply fail the section check.
  const known = customerSectionKeysFor(moduleKey);
  if (known && !known.includes(sectionKey)) {
    return { ok: false, status: 403, error: 'CUSTOMER_SECTION_FORBIDDEN' };
  }
  if (!sectionGranted(scope, moduleKey, sectionKey)) {
    return { ok: false, status: 403, error: 'CUSTOMER_SECTION_FORBIDDEN' };
  }
  if (!actionGranted(scope, moduleKey, action)) {
    return { ok: false, status: 403, error: 'CUSTOMER_ACTION_FORBIDDEN' };
  }
  return { ok: true };
}

/**
 * Validate one module's section and action grants before they are stored.
 * Unknown keys are refused rather than dropped, so a mistyped grant cannot
 * quietly widen access.
 */
export function sanitizeCustomerGrants(input: {
  moduleKey: string;
  sections?: unknown;
  actions?: unknown;
}):
  | { ok: true; sections: string[]; actions: string[] }
  | { ok: false; error: 'INVALID_SECTIONS' | 'INVALID_ACTIONS' } {
  const knownSections = customerSectionKeysFor(input.moduleKey) || [];
  let sections: string[] = [];
  if (input.sections != null) {
    if (!Array.isArray(input.sections)) return { ok: false, error: 'INVALID_SECTIONS' };
    sections = Array.from(new Set(input.sections.map(String)));
    for (const key of sections) {
      if (!knownSections.includes(key)) return { ok: false, error: 'INVALID_SECTIONS' };
    }
  }
  let actions: string[] = [];
  if (input.actions != null) {
    if (!Array.isArray(input.actions)) return { ok: false, error: 'INVALID_ACTIONS' };
    actions = Array.from(new Set(input.actions.map(String)));
    for (const key of actions) {
      if (!CUSTOMER_ACTIONS.has(key)) return { ok: false, error: 'INVALID_ACTIONS' };
    }
  }
  // An empty list means "everything", which the database stores as [].
  return { ok: true, sections, actions };
}

const CUSTOMER_ACTIONS = new Set<string>(ACCESS_ACTIONS);

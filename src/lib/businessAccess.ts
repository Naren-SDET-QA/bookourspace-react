/**
 * Per-member module and section access policy.
 *
 * One source of truth shared by the API (which validates grants) and the
 * provider portal (which hides what a member may not use). Importing this file
 * must stay free of React and database code so the server can use it too.
 *
 * Semantics:
 *   * no grant row for a member     -> unrestricted access to the business
 *   * grant row                     -> only `allowedModules` are usable
 *   * allowedSections[moduleKey]    -> `null`/missing/empty means every section
 */

export const ACCESS_MODULES = ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies'] as const;
export type AccessModule = (typeof ACCESS_MODULES)[number];

export const ACCESS_MODULE_LABELS: Record<AccessModule, string> = {
  pg_hostels: 'PG & Hostels',
  classes: 'Classes',
  venues: 'Function Halls',
  services: 'Home services',
  hotel_stay: 'Stays',
  movies: 'Movies',
};

/** Sections that can be granted individually inside a section-aware module. */
export const MODULE_SECTION_KEYS: Partial<Record<AccessModule, ReadonlyArray<{ key: string; label: string }>>> = {
  hotel_stay: [
    { key: 'overview', label: 'Overview' },
    { key: 'properties', label: 'Properties' },
    { key: 'rooms', label: 'Rooms & rates' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'reservations', label: 'Reservations' },
    { key: 'payments', label: 'Payments' },
    { key: 'sell_pg', label: 'Sell PG' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ],
  services: [
    { key: 'overview', label: 'Overview' },
    { key: 'bookings', label: 'Bookings & jobs' },
    { key: 'workers', label: 'Workers' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'payments', label: 'Payments' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ],
};

export type AccessSections = Record<string, string[]>;

export interface AccessScope {
  allowedModules: string[];
  allowedSections: AccessSections;
}

export interface AccessScopeSource {
  /** Absent/undefined means the member has no restriction row. */
  allowed_modules?: string[] | null;
  allowed_sections?: AccessSections | null;
}

function sectionKeysFor(moduleKey: string): string[] | null {
  const entries = MODULE_SECTION_KEYS[moduleKey as AccessModule];
  return entries ? entries.map((entry) => entry.key) : null;
}

/** Read a member's stored scope, or `null` when the member is unrestricted. */
export function accessScopeFrom(source: AccessScopeSource | null | undefined): AccessScope | null {
  if (!source || !Array.isArray(source.allowed_modules)) return null;
  const allowedSections: AccessSections = {};
  const raw = source.allowed_sections && typeof source.allowed_sections === 'object' ? source.allowed_sections : {};
  for (const [moduleKey, sections] of Object.entries(raw)) {
    if (Array.isArray(sections) && sections.length > 0) allowedSections[moduleKey] = sections.map(String);
  }
  return { allowedModules: source.allowed_modules.map(String), allowedSections };
}

export function moduleGranted(scope: AccessScope | null, moduleKey: string): boolean {
  if (!scope) return true;
  return scope.allowedModules.includes(moduleKey);
}

/**
 * Provider API prefixes that unambiguously belong to one marketplace module.
 * Module-specific paths are mapped even when they live under the broad
 * `/api/provider` prefix, because a business is approved for exactly one
 * module. Genuinely shared surfaces (`/api/provider/listings`,
 * `/api/provider/registrations`, `/api/provider-portal`) stay absent and are
 * scoped by their handlers instead.
 */
export const PROVIDER_ROUTE_MODULES: ReadonlyArray<{ prefix: string; module: AccessModule }> = [
  { prefix: '/api/stays/host', module: 'hotel_stay' },
  { prefix: '/api/stays/bookings', module: 'hotel_stay' },
  { prefix: '/api/movies/screens', module: 'movies' },
  { prefix: '/api/venue-bookings', module: 'venues' },
  { prefix: '/api/pg/bookings', module: 'pg_hostels' },
  { prefix: '/api/provider/pg', module: 'pg_hostels' },
  { prefix: '/api/provider/venues', module: 'venues' },
  { prefix: '/api/provider/venue-bookings', module: 'venues' },
  { prefix: '/api/provider/classes', module: 'classes' },
  { prefix: '/api/services/provider', module: 'services' },
  { prefix: '/api/services/workers', module: 'services' },
  { prefix: '/api/services/bookings', module: 'services' },
  { prefix: '/api/services/earnings', module: 'services' },
  { prefix: '/api/services/payment-claims', module: 'services' },
];

/** Module a provider route belongs to, or `null` when the route is ambiguous. */
export function providerModuleForPath(rawPath: string): AccessModule | null {
  const pathOnly = String(rawPath || '').split(/[?#]/)[0];
  const normalized = `/${pathOnly.replace(/^\/+/, '')}`;
  const entry = PROVIDER_ROUTE_MODULES.find(
    (candidate) => normalized === candidate.prefix || normalized.startsWith(`${candidate.prefix}/`),
  );
  return entry ? entry.module : null;
}

const BUSINESS_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BusinessContextSelection =
  | { ok: true; businessId: string; derived: boolean }
  | { ok: false; status: 403; error: 'BUSINESS_CONTEXT_REQUIRED' };

/**
 * Resolve the business for a provider request. An explicit UUID header wins; a
 * single active membership is derived server-side; anything else fails closed
 * so a multi-business user must choose deliberately.
 */
export function selectBusinessContext(
  requestedBusinessId: string | null | undefined,
  activeBusinessIds: readonly string[],
): BusinessContextSelection {
  const requested = String(requestedBusinessId || '').trim();
  if (BUSINESS_ID_PATTERN.test(requested)) return { ok: true, businessId: requested, derived: false };
  if (activeBusinessIds.length === 1) return { ok: true, businessId: String(activeBusinessIds[0]), derived: true };
  return { ok: false, status: 403, error: 'BUSINESS_CONTEXT_REQUIRED' };
}

export interface ProviderBusinessContextRow {
  module_type?: string | null;
  approval_status?: string | null;
  is_enabled?: boolean | null;
  module_enabled?: boolean | null;
  module_approval_status?: string | null;
  role?: string | null;
  member_modules?: string[] | null;
}

export type BusinessContextDecision =
  | { ok: true }
  | { ok: false; status: 403; error: 'BUSINESS_ACCESS_DENIED' | 'BUSINESS_MODULE_MISMATCH' | 'BUSINESS_MODULE_FORBIDDEN' };

/**
 * Authorize a provider request against the resolved business. Administrators
 * bypass the gate; every other role must hold an active, approved business and
 * may only use the module the route serves, within their member grant.
 */
export function evaluateProviderBusinessContext(input: {
  role?: string | null;
  path: string;
  business: ProviderBusinessContextRow | null | undefined;
}): BusinessContextDecision {
  const deny = (
    error: 'BUSINESS_ACCESS_DENIED' | 'BUSINESS_MODULE_MISMATCH' | 'BUSINESS_MODULE_FORBIDDEN',
  ): BusinessContextDecision => ({ ok: false, status: 403, error });
  if (String(input.role || '') === 'admin') return { ok: true };
  const business = input.business;
  if (!business) return deny('BUSINESS_ACCESS_DENIED');
  if (
    business.approval_status !== 'approved'
    || business.is_enabled !== true
    || business.module_enabled !== true
    || business.module_approval_status !== 'approved'
  ) {
    return deny('BUSINESS_ACCESS_DENIED');
  }
  const moduleType = String(business.module_type || '');
  const expectedModule = providerModuleForPath(input.path);
  if (expectedModule && moduleType !== expectedModule) return deny('BUSINESS_MODULE_MISMATCH');
  const memberRole = String(business.role || '');
  if (memberRole !== 'owner') {
    const scope = accessScopeFrom({ allowed_modules: business.member_modules ?? null });
    if (!moduleGranted(scope, moduleType)) return deny('BUSINESS_MODULE_FORBIDDEN');
  }
  return { ok: true };
}

/**
 * Sections a member may use inside a module, or `null` for "every section".
 * The caller filters its own navigation with this list, so unknown keys the
 * portal does not render are simply ignored.
 */
export function grantedSections(scope: AccessScope | null, moduleKey: string): string[] | null {
  if (!scope) return null;
  const granted = scope.allowedSections[moduleKey];
  return granted && granted.length > 0 ? granted : null;
}

export type SanitizeResult =
  | { ok: true; scope: AccessScope }
  | { ok: false; error: 'INVALID_MODULES' | 'INVALID_SECTIONS' | 'NO_MODULES' };

/**
 * Validate an untrusted grant payload. Unknown modules and unknown section
 * keys are refused rather than silently dropped, so a mistyped grant cannot
 * quietly widen access.
 */
export function sanitizeAccessScope(input: unknown): SanitizeResult {
  const body = (input || {}) as { allowedModules?: unknown; allowedSections?: unknown };
  const modules = Array.isArray(body.allowedModules) ? body.allowedModules.map(String) : null;
  if (!modules) return { ok: false, error: 'INVALID_MODULES' };
  if (modules.length === 0) return { ok: false, error: 'NO_MODULES' };
  const uniqueModules = Array.from(new Set(modules));
  for (const moduleKey of uniqueModules) {
    if (!(ACCESS_MODULES as readonly string[]).includes(moduleKey)) return { ok: false, error: 'INVALID_MODULES' };
  }
  const rawSections = body.allowedSections;
  if (rawSections != null && (typeof rawSections !== 'object' || Array.isArray(rawSections))) return { ok: false, error: 'INVALID_SECTIONS' };
  const allowedSections: AccessSections = {};
  for (const [moduleKey, sections] of Object.entries((rawSections || {}) as Record<string, unknown>)) {
    if (!uniqueModules.includes(moduleKey)) continue;
    const known = sectionKeysFor(moduleKey);
    if (!known) continue;
    if (!Array.isArray(sections)) return { ok: false, error: 'INVALID_SECTIONS' };
    const keys = Array.from(new Set(sections.map(String)));
    for (const key of keys) {
      if (!known.includes(key)) return { ok: false, error: 'INVALID_SECTIONS' };
    }
    // An empty list means "every section", which is stored by omitting the key.
    if (keys.length > 0 && keys.length < known.length) allowedSections[moduleKey] = keys;
  }
  return { ok: true, scope: { allowedModules: uniqueModules, allowedSections } };
}

/** Short human summary used in the staff panel and access chips. */
export function describeAccessScope(scope: AccessScope | null): string {
  if (!scope) return 'Full access';
  return scope.allowedModules
    .map((moduleKey) => {
      const label = ACCESS_MODULE_LABELS[moduleKey as AccessModule] || moduleKey;
      const sections = scope.allowedSections[moduleKey];
      return sections && sections.length > 0 ? `${label} (${sections.length} sections)` : label;
    })
    .join(', ') || 'No modules';
}

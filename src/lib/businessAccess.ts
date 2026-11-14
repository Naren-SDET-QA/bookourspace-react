/**
 * Per-member module, section and action access policy.
 *
 * One source of truth shared by the API (which validates grants) and the
 * provider/customer portals (which hide what a member may not use). Importing
 * this file must stay free of React and database code so the server can use it
 * too.
 *
 * Semantics (all three levels are deny-by-default once a grant row exists):
 *   * no grant row for a member       -> unrestricted access (legacy contract)
 *   * grant row                       -> only `allowedModules` are usable
 *   * allowedSections[moduleKey]      -> `null`/missing/empty means every section
 *   * allowedActions[moduleKey]       -> `null`/missing/empty means every action
 *   * `manage` implies every other action; any granted action implies `view`
 *
 * Section keys below are taken from the real workspace unions so a grant can
 * never name a section the product does not render:
 *   pg_hostels  -> PgProviderWorkspace `OwnerSection`
 *   classes     -> InstituteOwnerDashboard `Section`
 *   hotel_stay  -> StaysOwnerAdminDashboard `StayOwnerSection`
 *   services    -> ServicesProviderDashboard section keys
 *   venues      -> VenueOwnerWorkspace panels (listings/bookings/blocks)
 *   movies      -> /api/movies/* provider endpoints (screens/showtimes/support)
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

/** Every section that can be granted individually inside each module. */
export const MODULE_SECTION_KEYS: Record<AccessModule, ReadonlyArray<{ key: string; label: string }>> = {
  pg_hostels: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'properties', label: 'Properties' },
    { key: 'rooms', label: 'Rooms & beds' },
    { key: 'tenants', label: 'Tenants' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'dues', label: 'Dues' },
    { key: 'collections', label: 'Collections' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'disputes', label: 'Disputes' },
    { key: 'leads', label: 'Leads' },
    { key: 'complaints', label: 'Complaints' },
    { key: 'requests', label: 'Service requests' },
    { key: 'food_menu', label: 'Food menu' },
    { key: 'notices', label: 'Notices' },
    { key: 'reviews', label: 'Reviews' },
    { key: 'community', label: 'Community' },
    { key: 'staff', label: 'Staff' },
    { key: 'listings', label: 'Listings' },
    { key: 'reports', label: 'Reports' },
    { key: 'plan_billing', label: 'Plan & billing' },
    { key: 'settings', label: 'Settings' },
  ],
  classes: [
    { key: 'overview', label: 'Overview' },
    { key: 'profile', label: 'Profile' },
    { key: 'branches', label: 'Branches' },
    { key: 'classrooms', label: 'Classrooms' },
    { key: 'courses', label: 'Courses' },
    { key: 'batches', label: 'Batches' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'faculty', label: 'Faculty' },
    { key: 'admissions', label: 'Admissions' },
    { key: 'students', label: 'Student management' },
    { key: 'leave', label: 'Leave' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'fees', label: 'Fees' },
    { key: 'exams', label: 'Exams' },
    { key: 'certificates', label: 'Certificates' },
    { key: 'announcements', label: 'Announcements' },
    { key: 'enquiries', label: 'Enquiries' },
    { key: 'reviews', label: 'Reviews' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'staff', label: 'Staff management' },
    { key: 'audit', label: 'Audit log' },
    { key: 'admin', label: 'Administration' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ],
  venues: [
    { key: 'overview', label: 'Overview' },
    { key: 'listings', label: 'Halls & listings' },
    { key: 'calendar', label: 'Availability' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'disputes', label: 'Disputes' },
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
  movies: [
    { key: 'overview', label: 'Overview' },
    { key: 'screens', label: 'Screens & seat layout' },
    { key: 'showtimes', label: 'Showtimes' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'support', label: 'Support tickets' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ],
};

/** Actions that can be granted inside a module or a single section. */
export const ACCESS_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'manage'] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

export const ACCESS_ACTION_LABELS: Record<AccessAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
  manage: 'Manage (implies every action)',
};

/** Actions that inherently include another action. Never widen beyond this map. */
const IMPLIED_ACTIONS: Record<AccessAction, ReadonlyArray<AccessAction>> = {
  view: [],
  create: ['view'],
  edit: ['view'],
  delete: ['view'],
  approve: ['view'],
  manage: ['view', 'create', 'edit', 'delete', 'approve'],
};

export type AccessSections = Record<string, string[]>;
export type AccessActions = Record<string, string[]>;

export interface AccessScope {
  allowedModules: string[];
  allowedSections: AccessSections;
  allowedActions: AccessActions;
}

export interface AccessScopeSource {
  /** Absent/undefined means the member has no restriction row. */
  allowed_modules?: string[] | null;
  allowed_sections?: AccessSections | null;
  /** Absent/undefined/{} means every action is allowed inside granted modules. */
  allowed_actions?: AccessActions | null;
}

export function sectionKeysFor(moduleKey: string): string[] | null {
  const entries = MODULE_SECTION_KEYS[moduleKey as AccessModule];
  return entries ? entries.map((entry) => entry.key) : null;
}

/** Read a member's stored scope, or `null` when the member is unrestricted. */
export function accessScopeFrom(source: AccessScopeSource | null | undefined): AccessScope | null {
  if (!source || !Array.isArray(source.allowed_modules)) return null;
  const collect = (raw: unknown): Record<string, string[]> => {
    const collected: Record<string, string[]> = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return collected;
    for (const [moduleKey, values] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(values) && values.length > 0) collected[moduleKey] = values.map(String);
    }
    return collected;
  };
  return {
    allowedModules: source.allowed_modules.map(String),
    allowedSections: collect(source.allowed_sections),
    allowedActions: collect(source.allowed_actions),
  };
}

export function moduleGranted(scope: AccessScope | null, moduleKey: string): boolean {
  if (!scope) return true;
  return scope.allowedModules.includes(moduleKey);
}

/**
 * True when a single section inside a granted module is usable.
 * An absent/empty grant means every section, matching stored legacy rows.
 */
export function sectionGranted(scope: AccessScope | null, moduleKey: string, sectionKey?: string | null): boolean {
  if (!moduleGranted(scope, moduleKey)) return false;
  if (!scope || !sectionKey) return true;
  const granted = grantedSections(scope, moduleKey);
  return granted === null || granted.includes(sectionKey);
}

/**
 * True when one action is granted inside a module. An absent/empty grant means
 * every action, so existing rows keep working unchanged. `manage` implies the
 * rest and any action implies `view`.
 */
export function actionGranted(scope: AccessScope | null, moduleKey: string, action: AccessAction): boolean {
  if (!moduleGranted(scope, moduleKey)) return false;
  if (!scope) return true;
  const granted = scope.allowedActions[moduleKey];
  if (!granted || granted.length === 0) return true;
  if (granted.includes(action)) return true;
  return granted.some((candidate) =>
    (IMPLIED_ACTIONS[candidate as AccessAction] || []).includes(action),
  );
}

/** Combined module + section + action check, the one server routes should call. */
export function permissionGranted(
  scope: AccessScope | null,
  request: { moduleKey: string; action: AccessAction; sectionKey?: string | null },
): boolean {
  return sectionGranted(scope, request.moduleKey, request.sectionKey)
    && actionGranted(scope, request.moduleKey, request.action);
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
  member_sections?: AccessSections | null;
  member_actions?: AccessActions | null;
}

/** HTTP method -> the action the route performs. Unknown methods are treated as manage. */
export const ACTION_FOR_METHOD: Readonly<Record<string, AccessAction>> = {
  GET: 'view',
  HEAD: 'view',
  OPTIONS: 'view',
  POST: 'create',
  PUT: 'edit',
  PATCH: 'edit',
  DELETE: 'delete',
};

/** Path fragments that turn an otherwise plain request into a decision/manage request. */
const APPROVAL_PATH = /\/(approve|reject|decision|review|publish|settle|verify)(\/|$)/i;
const MANAGE_PATH = /\/(assign|transfer|ownership[-a-z]*|members|access)(\/|$)/i;

export interface ProviderRoutePermission {
  moduleKey: AccessModule;
  action: AccessAction;
  sectionKey: string | null;
}

/**
 * Provider route prefix -> the workspace section it belongs to. Longest prefix
 * wins, so `/api/stays/host/properties` never falls back to a broader prefix.
 * Paths without an entry stay module-gated only, which is the pre-existing
 * behaviour and keeps shared surfaces (for example `/api/provider/listings`)
 * working for every module.
 */
// Only endpoint families that actually exist in the server are mapped. Anything
// else resolves to no section, which keeps its pre-existing module-only gate
// instead of inventing a restriction the product cannot honour.
const PROVIDER_SECTION_PREFIX_ROWS = [
  // Host stays: src/server/stayHostApi.ts
  { prefix: '/api/stays/host/properties', moduleKey: 'hotel_stay', sectionKey: 'properties' },
  { prefix: '/api/stays/host/listings', moduleKey: 'hotel_stay', sectionKey: 'properties' },
  { prefix: '/api/stays/host/onboard', moduleKey: 'hotel_stay', sectionKey: 'properties' },
  { prefix: '/api/stays/host/media-order', moduleKey: 'hotel_stay', sectionKey: 'properties' },
  { prefix: '/api/stays/host/room-types', moduleKey: 'hotel_stay', sectionKey: 'rooms' },
  { prefix: '/api/stays/host/units', moduleKey: 'hotel_stay', sectionKey: 'rooms' },
  { prefix: '/api/stays/host/blocks', moduleKey: 'hotel_stay', sectionKey: 'calendar' },
  { prefix: '/api/stays/host/bookings', moduleKey: 'hotel_stay', sectionKey: 'reservations' },
  // Services: src/server/serviceBookingApi.ts, serviceCommerceApi.ts
  { prefix: '/api/services/provider/workers', moduleKey: 'services', sectionKey: 'workers' },
  { prefix: '/api/services/workers', moduleKey: 'services', sectionKey: 'workers' },
  { prefix: '/api/services/provider/schedule', moduleKey: 'services', sectionKey: 'schedule' },
  { prefix: '/api/services/earnings', moduleKey: 'services', sectionKey: 'payments' },
  { prefix: '/api/services/payment-claims', moduleKey: 'services', sectionKey: 'payments' },
  { prefix: '/api/services/bookings', moduleKey: 'services', sectionKey: 'bookings' },
  // PG: src/server/pgAdminApi.ts
  { prefix: '/api/provider/pg/bookings', moduleKey: 'pg_hostels', sectionKey: 'bookings' },
  { prefix: '/api/pg/bookings', moduleKey: 'pg_hostels', sectionKey: 'bookings' },
  // Movies: src/server/moviesShowtimesApi.ts / server.ts
  { prefix: '/api/movies/screens', moduleKey: 'movies', sectionKey: 'screens' },
  { prefix: '/api/movies/support', moduleKey: 'movies', sectionKey: 'support' },
  { prefix: '/api/movies/bookings', moduleKey: 'movies', sectionKey: 'bookings' },
  // Venues: src/server/venueBookingsApi.ts
  { prefix: '/api/provider/venues', moduleKey: 'venues', sectionKey: 'listings' },
  { prefix: '/api/venue-bookings', moduleKey: 'venues', sectionKey: 'bookings' },
  // Classes: src/server/classEnrollmentApi.ts
  { prefix: '/api/provider/classes/batches', moduleKey: 'classes', sectionKey: 'batches' },
  { prefix: '/api/provider/classes/enrollments', moduleKey: 'classes', sectionKey: 'students' },
  { prefix: '/api/provider/classes/listings', moduleKey: 'classes', sectionKey: 'courses' },
] satisfies ReadonlyArray<{ prefix: string; moduleKey: AccessModule; sectionKey: string }>;

const PROVIDER_SECTION_PREFIXES: ReadonlyArray<{ prefix: string; moduleKey: AccessModule; sectionKey: string }> =
  PROVIDER_SECTION_PREFIX_ROWS.slice().sort((a, b) => b.prefix.length - a.prefix.length);

export function sectionForProviderPath(rawPath: string): string | null {
  const pathOnly = String(rawPath || '').split(/[?#]/)[0];
  const normalized = `/${pathOnly.replace(/^\/+/, '')}`;
  const entry = PROVIDER_SECTION_PREFIXES.find(
    (candidate) => normalized === candidate.prefix || normalized.startsWith(`${candidate.prefix}/`),
  );
  return entry ? entry.sectionKey : null;
}

/** Action a provider request performs, from its method and path. */
export function actionForProviderRoute(rawMethod: string, rawPath: string): AccessAction {
  const pathOnly = String(rawPath || '').split(/[?#]/)[0];
  if (APPROVAL_PATH.test(pathOnly)) return 'approve';
  if (MANAGE_PATH.test(pathOnly)) return 'manage';
  return ACTION_FOR_METHOD[String(rawMethod || 'GET').toUpperCase()] || 'manage';
}

/** Resolve the permission a provider route requires, or `null` for module-only routes. */
export function permissionForProviderRoute(rawMethod: string, rawPath: string): ProviderRoutePermission | null {
  const moduleKey = providerModuleForPath(rawPath);
  if (!moduleKey) return null;
  return {
    moduleKey,
    action: actionForProviderRoute(rawMethod, rawPath),
    sectionKey: sectionForProviderPath(rawPath),
  };
}

/**
 * Deny-by-default switch. Off by default: a member without any grant row keeps
 * the legacy unrestricted contract until an explicit full-grant backfill has
 * been applied and reviewed.
 */
export function strictPermissionDefaults(env?: Record<string, string | undefined>): boolean {
  return String(env?.BOS_STRICT_PERMISSION_DEFAULTS || '') === '1';
}

export type BusinessContextDecision =
  | { ok: true }
  | {
      ok: false;
      status: 403;
      error:
        | 'BUSINESS_ACCESS_DENIED'
        | 'BUSINESS_MODULE_MISMATCH'
        | 'BUSINESS_MODULE_FORBIDDEN'
        | 'BUSINESS_SECTION_FORBIDDEN'
        | 'BUSINESS_ACTION_FORBIDDEN'
        | 'BUSINESS_PERMISSIONS_REQUIRED';
    };

/**
 * Authorize a provider request against the resolved business. Administrators
 * bypass the gate; every other role must hold an active, approved business and
 * may only use the module the route serves, within their member grant of
 * modules, sections and actions.
 */
export function evaluateProviderBusinessContext(input: {
  role?: string | null;
  path: string;
  business: ProviderBusinessContextRow | null | undefined;
  /** Section/action the route requires. `null` keeps the module-only check. */
  permission?: ProviderRoutePermission | null;
  /** When true, a member with no grant row is denied instead of unrestricted. */
  strictDefaults?: boolean;
}): BusinessContextDecision {
  const deny = (
    error: Extract<BusinessContextDecision, { ok: false }>['error'],
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
    // No grant row means `member_modules` is null. That is unrestricted unless
    // strict defaults are enabled, which requires an explicit grant.
    if (input.strictDefaults && !Array.isArray(business.member_modules)) {
      return deny('BUSINESS_PERMISSIONS_REQUIRED');
    }
    const scope = accessScopeFrom({
      allowed_modules: business.member_modules ?? null,
      allowed_sections: business.member_sections ?? null,
      allowed_actions: business.member_actions ?? null,
    });
    if (!moduleGranted(scope, moduleType)) return deny('BUSINESS_MODULE_FORBIDDEN');
    if (input.permission) {
      if (!sectionGranted(scope, moduleType, input.permission.sectionKey)) return deny('BUSINESS_SECTION_FORBIDDEN');
      if (!actionGranted(scope, moduleType, input.permission.action)) return deny('BUSINESS_ACTION_FORBIDDEN');
    }
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
  | { ok: false; error: 'INVALID_MODULES' | 'INVALID_SECTIONS' | 'INVALID_ACTIONS' | 'NO_MODULES' };

/**
 * Validate an untrusted grant payload. Unknown modules and unknown section
 * keys are refused rather than silently dropped, so a mistyped grant cannot
 * quietly widen access.
 */
export function sanitizeAccessScope(input: unknown): SanitizeResult {
  const body = (input || {}) as { allowedModules?: unknown; allowedSections?: unknown; allowedActions?: unknown };
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
  const rawActions = body.allowedActions;
  if (rawActions != null && (typeof rawActions !== 'object' || Array.isArray(rawActions))) return { ok: false, error: 'INVALID_ACTIONS' };
  const allowedActions: AccessActions = {};
  for (const [moduleKey, actions] of Object.entries((rawActions || {}) as Record<string, unknown>)) {
    // An action grant for a module the member cannot open would be inert; skip it
    // the same way an unknown-module section grant is skipped.
    if (!uniqueModules.includes(moduleKey)) continue;
    if (!Array.isArray(actions)) return { ok: false, error: 'INVALID_ACTIONS' };
    const keys = Array.from(new Set(actions.map(String)));
    for (const key of keys) {
      if (!(ACCESS_ACTIONS as readonly string[]).includes(key)) return { ok: false, error: 'INVALID_ACTIONS' };
    }
    // An empty list means "every action", which is stored by omitting the key.
    if (keys.length > 0 && keys.length < ACCESS_ACTIONS.length) allowedActions[moduleKey] = keys;
  }
  return { ok: true, scope: { allowedModules: uniqueModules, allowedSections, allowedActions } };
}

/** Short human summary used in the staff panel and access chips. */
export function describeAccessScope(scope: AccessScope | null): string {
  if (!scope) return 'Full access';
  return scope.allowedModules
    .map((moduleKey) => {
      const label = ACCESS_MODULE_LABELS[moduleKey as AccessModule] || moduleKey;
      const sections = scope.allowedSections[moduleKey];
      const actions = scope.allowedActions[moduleKey];
      const bits: string[] = [];
      if (sections && sections.length > 0) bits.push(`${sections.length} sections`);
      if (actions && actions.length > 0) bits.push(`${actions.length} actions`);
      return bits.length > 0 ? `${label} (${bits.join(', ')})` : label;
    })
    .join(', ') || 'No modules';
}

/**
 * Business permission model.
 *
 * Single source of truth for role → capability decisions, invitation/assignment
 * rank rules and the provider route → business module map. Everything here is
 * pure (no I/O) so the server, UI and tests can share the same rules. Nothing in
 * this module grants access by itself: callers must still re-derive the actor's
 * role from PostgreSQL on every request.
 */

import type { BusinessModuleId } from './businessModuleMap';

export type BusinessRole = 'owner' | 'manager' | 'staff' | 'accountant';

export const BUSINESS_ROLES: readonly BusinessRole[] = ['owner', 'manager', 'staff', 'accountant'];

const ROLE_RANK: Record<BusinessRole, number> = {
  owner: 3,
  manager: 2,
  staff: 1,
  accountant: 1,
};

export type BusinessCapability =
  | 'business.read'
  | 'business.update'
  | 'business.invite'
  | 'business.invitation.revoke'
  | 'business.member.manage'
  | 'business.member.access'
  | 'business.transfer.request'
  | 'business.audit.read'
  | 'listings.read'
  | 'listings.write'
  | 'bookings.read'
  | 'bookings.manage'
  | 'finance.read'
  | 'finance.manage'
  | 'reports.read';

const CAPABILITIES: Record<BusinessRole, readonly BusinessCapability[]> = {
  owner: [
    'business.read',
    'business.update',
    'business.invite',
    'business.invitation.revoke',
    'business.member.manage',
    'business.member.access',
    'business.transfer.request',
    'business.audit.read',
    'listings.read',
    'listings.write',
    'bookings.read',
    'bookings.manage',
    'finance.read',
    'finance.manage',
    'reports.read',
  ],
  manager: [
    'business.read',
    'business.update',
    'business.invite',
    'business.invitation.revoke',
    'business.member.manage',
    'business.member.access',
    'business.audit.read',
    'listings.read',
    'listings.write',
    'bookings.read',
    'bookings.manage',
    'finance.read',
    'reports.read',
  ],
  staff: [
    'business.read',
    'listings.read',
    'bookings.read',
    'bookings.manage',
  ],
  accountant: [
    'business.read',
    'listings.read',
    'bookings.read',
    'finance.read',
    'finance.manage',
    'reports.read',
  ],
};

export function isBusinessRole(value: unknown): value is BusinessRole {
  return typeof value === 'string' && (BUSINESS_ROLES as readonly string[]).includes(value);
}

export function roleRank(role: string | null | undefined): number {
  return isBusinessRole(role) ? ROLE_RANK[role] : 0;
}

/** Unknown roles never receive a capability. */
export function hasBusinessCapability(role: string | null | undefined, capability: BusinessCapability): boolean {
  if (!isBusinessRole(role)) return false;
  return CAPABILITIES[role].includes(capability);
}

export function capabilitiesForRole(role: string | null | undefined): readonly BusinessCapability[] {
  return isBusinessRole(role) ? CAPABILITIES[role] : [];
}

/* ------------------------------------------------------------------ */
/* Invitations and member management                                   */
/* ------------------------------------------------------------------ */

/** Roles `actorRole` may invite. Owners may add managers; managers may not. */
export function assignableRoles(actorRole: string | null | undefined): BusinessRole[] {
  if (actorRole === 'owner') return ['manager', 'staff', 'accountant'];
  if (actorRole === 'manager') return ['staff', 'accountant'];
  return [];
}

export function canInviteRole(actorRole: string | null | undefined, invitedRole: string | null | undefined): boolean {
  if (!isBusinessRole(invitedRole)) return false;
  if (invitedRole === 'owner') return false;
  return assignableRoles(actorRole).includes(invitedRole);
}

/**
 * Role changes and removals. The owner is never manageable; nobody may manage
 * themselves (no self-promotion, no self-removal); a manager cannot manage a
 * peer manager, but the owner can manage every non-owner.
 */
export function canManageMember(
  actorRole: string | null | undefined,
  actorUserId: string | null | undefined,
  targetRole: string | null | undefined,
  targetUserId: string | null | undefined,
): boolean {
  if (!isBusinessRole(actorRole) || !isBusinessRole(targetRole)) return false;
  if (actorRole !== 'owner' && actorRole !== 'manager') return false;
  if (targetRole === 'owner') return false;
  if (actorUserId && targetUserId && String(actorUserId) === String(targetUserId)) return false;
  if (actorRole === 'manager' && targetRole === 'manager') return false;
  return true;
}

/** Owners are permanent at the business level and their scope is never restricted. */
export function isAccessScopeRequired(role: string | null | undefined): boolean {
  return isBusinessRole(role) && role !== 'owner';
}

/**
 * Effective module scope for a member. An empty `allowed_modules` means "every
 * module of the business" (the default); owners are always unrestricted.
 */
export function isModuleAllowedForMember(
  role: string | null | undefined,
  allowedModules: readonly string[] | null | undefined,
  moduleType: string,
): boolean {
  if (!isBusinessRole(role)) return false;
  if (role === 'owner') return true;
  if (!Array.isArray(allowedModules) || allowedModules.length === 0) return true;
  return allowedModules.includes(moduleType);
}

/* ------------------------------------------------------------------ */
/* Provider route → module map (F3)                                    */
/* ------------------------------------------------------------------ */

export interface ProviderRouteModule {
  /** Literal route prefix. Matching is segment-aware (prefix or prefix + '/'). */
  prefix: string;
  /** Required business module, or `null` for multi-module provider routes. */
  module: BusinessModuleId | null;
}

/**
 * Every provider-owned route prefix that reaches the business-context
 * middleware. `/api/provider` stays multi-module so that a provider can manage
 * any of their approved businesses through it.
 */
export const PROVIDER_ROUTE_MODULES: readonly ProviderRouteModule[] = [
  { prefix: '/api/provider', module: null },
  { prefix: '/api/services/provider', module: 'services' },
  { prefix: '/api/stays/host', module: 'hotel_stay' },
  { prefix: '/api/stays/bookings', module: 'hotel_stay' },
  { prefix: '/api/movies/screens', module: 'movies' },
  { prefix: '/api/services/earnings', module: 'services' },
  { prefix: '/api/services/payment-claims', module: 'services' },
  { prefix: '/api/services/bookings', module: 'services' },
  { prefix: '/api/pg/bookings', module: 'pg_hostels' },
  { prefix: '/api/venue-bookings', module: 'venues' },
];

/** Routes only a provider session may call; customers are rejected earlier. */
export const PROVIDER_ONLY_PREFIXES: readonly string[] = [
  '/api/provider',
  '/api/services/provider',
  '/api/stays/host',
  '/api/movies/screens',
  '/api/services/earnings',
  '/api/services/payment-claims',
];

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Resolve the business module a provider route belongs to. Longest matching
 * prefix wins so `/api/services/provider/...` is not shadowed by
 * `/api/services/...`. Returns `null` when the route is multi-module or
 * unguarded.
 */
export function expectedModuleForPath(rawPath: string): BusinessModuleId | null {
  const path = String(rawPath || '').split('?')[0].replace(/\/+$/, '');
  if (!path) return null;
  let best: ProviderRouteModule | null = null;
  for (const route of PROVIDER_ROUTE_MODULES) {
    if (!matchesPrefix(path, route.prefix)) continue;
    if (!best || route.prefix.length > best.prefix.length) best = route;
  }
  return best?.module ?? null;
}

export function isProviderOnlyPath(rawPath: string): boolean {
  const path = String(rawPath || '').split('?')[0].replace(/\/+$/, '');
  if (!path) return false;
  return PROVIDER_ONLY_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

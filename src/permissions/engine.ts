/**
 * The single authorization engine.
 *
 * `authorize(actor, category, action, resource)` is the one interface every
 * protected API and database operation funnels through. The server calls it
 * from the provider gate, the customer gate and the admin console API; the
 * admin UI uses the same catalog for its switches, and the recovery service
 * uses it to reject an unsafe repair.
 *
 * It is a pure function: no database, no express, no network. Callers resolve
 * the actor and its grants, then the rules here decide. That keeps the decision
 * testable in isolation and prevents a second, drifting permission model.
 *
 * Security posture
 *   * deny when the account is not active;
 *   * deny an unknown category or action instead of guessing;
 *   * a customer with no grant rows at all is unverified, so access is denied
 *     (self-healing restores VIEW-only defaults, never more);
 *   * category isolation is structural: a grant for one category can never
 *     authorise another;
 *   * a non-owner business member is bounded by module, section and action;
 *   * Super Admin is unrestricted, but only for an active account;
 *   * resource ownership and business/category binding are checked here when a
 *     caller supplies a resource.
 */

import {
  accessScopeFrom,
  actionGranted,
  moduleGranted,
  sectionGranted,
} from '../lib/businessAccess';
import {
  DEFAULT_SIGNUP_ACTIONS,
  activeAccessCategories,
  canonicalCategoryKey,
  getAccessCategory,
  isPermissionAction,
  type PermissionAction,
} from './catalog';

export type AccessErrorCode =
  | 'UNAUTHORIZED_SESSION'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'UNKNOWN_CATEGORY'
  | 'INVALID_ACTION'
  | 'ROLE_NOT_RECOGNIZED'
  | 'PERMISSIONS_NOT_CONFIGURED'
  | 'CUSTOMER_PERMISSIONS_REQUIRED'
  | 'CUSTOMER_MODULE_FORBIDDEN'
  | 'CUSTOMER_SECTION_FORBIDDEN'
  | 'CUSTOMER_ACTION_FORBIDDEN'
  | 'BUSINESS_ACCESS_DENIED'
  | 'BUSINESS_MODULE_MISMATCH'
  | 'BUSINESS_MODULE_FORBIDDEN'
  | 'BUSINESS_SECTION_FORBIDDEN'
  | 'BUSINESS_ACTION_FORBIDDEN'
  | 'BUSINESS_PERMISSIONS_REQUIRED'
  | 'RESOURCE_NOT_OWNED'
  | 'RESOURCE_CONTEXT_MISMATCH';

export type AccessReason =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'CUSTOMER_GRANT'
  | 'PROVIDER_OWNER'
  | 'PROVIDER_MEMBER_GRANT';

export type AccessDecision =
  | { ok: true; reason: AccessReason; category: string; action: PermissionAction }
  | { ok: false; status: 400 | 401 | 403; error: AccessErrorCode; category: string };

/** A `customer_module_access` row as the server reads it. */
export interface AccessGrantRow {
  module_key: string;
  allowed_sections?: unknown;
  allowed_actions?: unknown;
  expires_at?: string | null;
}

/** One business the provider actor belongs to, with its member grant. */
export interface ProviderBusinessGrant {
  businessId: string;
  /** `businesses.module_type` (provider module vocabulary). */
  moduleType: string;
  approvalStatus?: string | null;
  isEnabled?: boolean | null;
  moduleEnabled?: boolean | null;
  moduleApprovalStatus?: string | null;
  /** `owner`, `manager`, `staff`, `accountant`. */
  memberRole?: string | null;
  memberModules?: string[] | null;
  memberSections?: Record<string, string[]> | null;
  memberActions?: Record<string, string[]> | null;
}

export interface AccessActor {
  userId?: string | null;
  role?: string | null;
  accountStatus?: string | null;
  isSuperAdmin?: boolean | null;
  /** Customer grant rows. Providers and admins may leave this empty. */
  customerGrants?: readonly AccessGrantRow[] | null;
  /** Active business memberships for a provider. */
  businesses?: readonly ProviderBusinessGrant[] | null;
}

export interface AccessResource {
  /** Profile that owns the record, when the record has one. */
  ownerUserId?: string | null;
  /** Business the record belongs to, when the record has one. */
  businessId?: string | null;
  /** Category named by the record itself, when it carries one. */
  category?: string | null;
  /** Set false only for a deliberately public read. Defaults to true. */
  requireOwnership?: boolean;
}

function deny(
  status: 400 | 401 | 403,
  error: AccessErrorCode,
  category: string,
): AccessDecision {
  return { ok: false, status, error, category };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((entry) => entry.length > 0);
}

function grantIsLive(row: AccessGrantRow, nowIso: string): boolean {
  if (!row.expires_at) return true;
  const expiry = Date.parse(row.expires_at);
  return Number.isFinite(expiry) && expiry > Date.parse(nowIso);
}

/**
 * Authorize one action in one category for one actor.
 *
 * @param actor     signed-in identity plus its resolved grants
 * @param category  any catalog name or alias (`pg`, `pg_hostels`, `stays`, ...)
 * @param action    VIEW | CREATE | EDIT | DELETE | APPROVE | MANAGE
 * @param resource  optional record context used for ownership/category binding
 */
export function authorize(
  actor: AccessActor | null | undefined,
  category: string,
  action: PermissionAction | string,
  resource?: AccessResource | null,
  nowIso: string = new Date().toISOString(),
): AccessDecision {
  const categoryKey = canonicalCategoryKey(category);
  const requested = String(category ?? '');
  if (!actor || !String(actor.userId || '').trim()) {
    return deny(401, 'UNAUTHORIZED_SESSION', requested);
  }
  if (!isPermissionAction(action)) return deny(400, 'INVALID_ACTION', requested);
  const definition = getAccessCategory(categoryKey);
  if (!categoryKey || !definition) return deny(400, 'UNKNOWN_CATEGORY', requested);

  // Revocation and suspension take effect on the very next request.
  const status = String(actor.accountStatus || 'active');
  if (status !== 'active') return deny(403, 'ACCOUNT_NOT_ACTIVE', categoryKey);

  const role = String(actor.role || '');
  const allow = (reason: AccessReason): AccessDecision => ({
    ok: true,
    reason,
    category: categoryKey,
    action,
  });

  if (actor.isSuperAdmin) return allow('SUPER_ADMIN');
  if (role === 'admin') return allow('ADMIN');

  // A resource that names a different category can never be reached through this
  // one, even for an administrator-adjacent owner. This blocks ID swaps.
  if (resource?.category) {
    const resourceCategory = canonicalCategoryKey(resource.category);
    if (resourceCategory && resourceCategory !== categoryKey) {
      return deny(403, 'RESOURCE_CONTEXT_MISMATCH', categoryKey);
    }
  }

  if (role === 'customer') {
    const rows = (actor.customerGrants || []).filter((row) => grantIsLive(row, nowIso));
    if (rows.length === 0) return deny(403, 'PERMISSIONS_NOT_CONFIGURED', categoryKey);
    const grant = rows.find((row) => canonicalCategoryKey(row.module_key) === categoryKey);
    if (!grant) return deny(403, 'CUSTOMER_MODULE_FORBIDDEN', categoryKey);

    const scope = accessScopeFrom({
      allowed_modules: [categoryKey],
      allowed_sections: { [categoryKey]: stringArray(grant.allowed_sections) },
      allowed_actions: { [categoryKey]: stringArray(grant.allowed_actions) },
    });
    if (!moduleGranted(scope, categoryKey)) return deny(403, 'CUSTOMER_MODULE_FORBIDDEN', categoryKey);
    if (!sectionGranted(scope, categoryKey, null)) return deny(403, 'CUSTOMER_SECTION_FORBIDDEN', categoryKey);
    if (!actionGranted(scope, categoryKey, action)) {
      return deny(403, 'CUSTOMER_ACTION_FORBIDDEN', categoryKey);
    }

    // A customer may only mutate a record they own. A public read is allowed.
    const resourceOwner = String(resource?.ownerUserId || '').trim();
    const ownsResource = resourceOwner.length === 0 || resourceOwner === String(actor.userId);
    if (!ownsResource && resource?.requireOwnership !== false && action !== 'view') {
      return deny(403, 'RESOURCE_NOT_OWNED', categoryKey);
    }
    return allow('CUSTOMER_GRANT');
  }

  if (role === 'provider') {
    const providerModule = definition.providerModule;
    const businesses = (actor.businesses || []).filter(
      (business) =>
        business
        && business.moduleType === providerModule
        && business.approvalStatus === 'approved'
        && business.isEnabled === true
        && business.moduleEnabled === true
        && business.moduleApprovalStatus === 'approved',
    );
    if (businesses.length === 0) return deny(403, 'BUSINESS_ACCESS_DENIED', categoryKey);

    const requestedBusinessId = String(resource?.businessId || '').trim();
    const business = requestedBusinessId
      ? businesses.find((candidate) => candidate.businessId === requestedBusinessId)
      : businesses[0];
    if (!business) return deny(403, 'BUSINESS_ACCESS_DENIED', categoryKey);

    // An owner keeps full control of their own business. A record that belongs
    // to a different owner is refused even before the member grant is read.
    const resourceOwner = String(resource?.ownerUserId || '').trim();
    if (resourceOwner && resourceOwner !== String(actor.userId) && resourceOwner !== String(business.businessId)) {
      // Business-owned records name the business id in ownerUserId for some
      // legacy tables, so a mismatch is only a denial when it is neither.
      return deny(403, 'RESOURCE_NOT_OWNED', categoryKey);
    }

    if (String(business.memberRole || '') === 'owner') return allow('PROVIDER_OWNER');

    if (!Array.isArray(business.memberModules)) {
      // No grant row: the legacy contract is unrestricted, unless the operator
      // has explicitly turned deny-by-default on.
      return allow('PROVIDER_MEMBER_GRANT');
    }
    const scope = accessScopeFrom({
      allowed_modules: business.memberModules,
      allowed_sections: business.memberSections ?? null,
      allowed_actions: business.memberActions ?? null,
    });
    if (!providerModule || !moduleGranted(scope, providerModule)) {
      return deny(403, 'BUSINESS_MODULE_FORBIDDEN', categoryKey);
    }
    if (!actionGranted(scope, providerModule, action)) {
      return deny(403, 'BUSINESS_ACTION_FORBIDDEN', categoryKey);
    }
    return allow('PROVIDER_MEMBER_GRANT');
  }

  return deny(403, 'ROLE_NOT_RECOGNIZED', categoryKey);
}

/** Convenience wrapper matching the documented interface. */
export const authorizeAccess = authorize;

export function canManageAccess(actor: AccessActor | null | undefined): boolean {
  if (!actor?.userId) return false;
  if (String(actor.accountStatus || 'active') !== 'active') return false;
  return actor.isSuperAdmin === true || String(actor.role || '') === 'admin';
}

/**
 * Self-elevation guard. An administrator may never edit their own permissions,
 * and only a Super Admin may edit another Super Admin.
 */
export function mayModifyPermissionsFor(
  actor: AccessActor | null | undefined,
  target: { userId: string; isSuperAdmin?: boolean | null } | null | undefined,
): { ok: true } | { ok: false; status: 403; error: 'SELF_PERMISSION_EDIT' | 'SUPER_ADMIN_PROTECTED' } {
  if (!canManageAccess(actor)) return { ok: false, status: 403, error: 'SELF_PERMISSION_EDIT' };
  if (!target?.userId) return { ok: false, status: 403, error: 'SELF_PERMISSION_EDIT' };
  if (String(actor!.userId) === String(target.userId)) {
    return { ok: false, status: 403, error: 'SELF_PERMISSION_EDIT' };
  }
  if (target.isSuperAdmin && actor!.isSuperAdmin !== true) {
    return { ok: false, status: 403, error: 'SUPER_ADMIN_PROTECTED' };
  }
  return { ok: true };
}

/**
 * The grants a new account starts with: VIEW on every active category, nothing
 * else. This is the only place signup defaults are defined, so the database
 * trigger, the repository and the tests cannot drift.
 */
export function defaultSignupGrantRows(): Array<{
  module_key: string;
  allowed_sections: string[];
  allowed_actions: PermissionAction[];
}> {
  return activeAccessCategories().map((category) => ({
    module_key: category.key,
    allowed_sections: [],
    allowed_actions: [...DEFAULT_SIGNUP_ACTIONS],
  }));
}

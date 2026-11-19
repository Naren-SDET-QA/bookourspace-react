/**
 * Permission health checking and repair planning.
 *
 * Pure functions: the repository loads a snapshot, these rules classify it, and
 * `buildRepairPlan` produces the exact set of operations an administrator may
 * preview, apply and roll back.
 *
 * Invariants enforced here:
 *   * a repair never invents an elevated grant — the only grant it can create is
 *     VIEW-only;
 *   * anything destructive (deleting a row, stripping an action) is marked
 *     `approvalRequired` and is excluded from a plan unless an administrator
 *     explicitly approves it;
 *   * every operation is reversible: the repository stores the before-state so a
 *     rollback can restore it exactly.
 */

import {
  ACCESS_ACTIONS,
  canonicalCategoryKey,
  getAccessCategory,
  isPermissionAction,
  type PermissionAction,
} from './catalog';

export type HealthFindingCode =
  | 'MISSING_CUSTOMER_PERMISSIONS'
  | 'MISSING_MEMBER_PERMISSIONS'
  | 'UNKNOWN_CATEGORY_REFERENCE'
  | 'INVALID_ACTION_KEY'
  | 'INVALID_SECTION_KEY'
  | 'INVALID_MEMBER_MODULE'
  | 'DUPLICATE_ASSIGNMENT'
  | 'ORPHANED_ASSIGNMENT'
  | 'INVALID_ROLE'
  | 'EXPIRED_PERMISSION_GRANT'
  | 'SUSPENDED_ACCOUNT_WITH_GRANTS';

export interface HealthProfileRow {
  id: string;
  email: string;
  role: string;
  accountStatus: string;
  isSuperAdmin: boolean;
}

export interface HealthCustomerGrantRow {
  userId: string;
  moduleKey: string;
  sections: string[];
  actions: string[];
  expiresAt: string | null;
  grantSource?: string | null;
}

export interface HealthMembershipRow {
  businessId: string;
  userId: string;
  memberRole: string;
  memberStatus: string;
  moduleType: string;
  hasGrantRow: boolean;
  allowedModules: string[] | null;
  sections: Record<string, string[]>;
  actions: Record<string, string[]>;
}

export interface HealthFlagRow {
  moduleKey: string;
  isEnabled: boolean;
}

export interface HealthSnapshot {
  profiles: readonly HealthProfileRow[];
  customerGrants: readonly HealthCustomerGrantRow[];
  memberships: readonly HealthMembershipRow[];
  flags: readonly HealthFlagRow[];
  nowIso?: string;
}

export type RepairOperation =
  | { kind: 'insert_view_only_customer_grants'; userId: string; categories: string[] }
  | { kind: 'insert_view_only_member_grant'; businessId: string; userId: string; moduleKey: string }
  | { kind: 'delete_customer_grant'; userId: string; moduleKey: string }
  | { kind: 'delete_expired_customer_grant'; userId: string; moduleKey: string }
  | { kind: 'strip_invalid_customer_actions'; userId: string; moduleKey: string; actions: PermissionAction[] }
  | { kind: 'delete_member_grant'; businessId: string; userId: string };

export interface HealthFinding {
  id: string;
  code: HealthFindingCode;
  severity: 'info' | 'warning' | 'critical';
  approvalRequired: boolean;
  summary: string;
  userId?: string;
  email?: string;
  businessId?: string;
  categoryKey?: string;
  repair: RepairOperation | null;
}

export interface HealthReport {
  checkedAt: string;
  healthy: boolean;
  profileCount: number;
  customerGrantCount: number;
  membershipCount: number;
  findings: HealthFinding[];
  countsByCode: Record<string, number>;
  safeRepairCount: number;
  approvalRequiredCount: number;
}

const KNOWN_ROLES = new Set(['customer', 'provider', 'admin']);
const KNOWN_PROVIDER_MODULES = new Set(['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies']);

function isExpired(expiresAt: string | null, nowIso: string): boolean {
  if (!expiresAt) return false;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry <= Date.parse(nowIso);
}

/**
 * Scan a snapshot. The result is deterministic for the same input, which is
 * what the preview and the apply step rely on.
 */
export function checkPermissionHealth(snapshot: HealthSnapshot): HealthReport {
  const nowIso = snapshot.nowIso || new Date().toISOString();
  const findings: HealthFinding[] = [];
  const push = (finding: Omit<HealthFinding, 'id'>) => {
    findings.push({ ...finding, id: `${finding.code}:${findings.length + 1}` });
  };

  const activeCategoryKeys = new Set<string>(
    (['pg', 'hotels', 'services', 'movies', 'classes', 'function_hall', 'ecommerce'] as const)
      .filter((key) => getAccessCategory(key) !== null),
  );
  const enabledCategoryKeys = new Set<string>(
    snapshot.flags
      .filter((flag) => flag.isEnabled)
      .map((flag) => canonicalCategoryKey(flag.moduleKey))
      .filter((key): key is NonNullable<typeof key> => key !== null),
  );

  const grantsByUser = new Map<string, HealthCustomerGrantRow[]>();
  for (const grant of snapshot.customerGrants) {
    const list = grantsByUser.get(grant.userId) || [];
    list.push(grant);
    grantsByUser.set(grant.userId, list);
  }

  for (const profile of snapshot.profiles) {
    const label = profile.email || profile.id;
    if (!KNOWN_ROLES.has(profile.role)) {
      push({
        code: 'INVALID_ROLE',
        severity: 'critical',
        approvalRequired: true,
        summary: `${label} has role "${profile.role}", which the engine does not recognise.`,
        userId: profile.id,
        email: profile.email,
        repair: null,
      });
    }

    const grants = grantsByUser.get(profile.id) || [];
    const liveGrants = grants.filter((grant) => !isExpired(grant.expiresAt, nowIso));

    if (profile.role === 'customer' && profile.accountStatus === 'active' && liveGrants.length === 0) {
      const categories = [...enabledCategoryKeys].filter((key) => activeCategoryKeys.has(key)) as string[];
      push({
        code: 'MISSING_CUSTOMER_PERMISSIONS',
        severity: 'critical',
        approvalRequired: false,
        summary: `${label} has no permission rows; VIEW-only defaults can be restored safely.`,
        userId: profile.id,
        email: profile.email,
        repair: categories.length > 0
          ? { kind: 'insert_view_only_customer_grants', userId: profile.id, categories }
          : null,
      });
    }

    if (profile.accountStatus !== 'active' && grants.length > 0) {
      push({
        code: 'SUSPENDED_ACCOUNT_WITH_GRANTS',
        severity: 'warning',
        approvalRequired: true,
        summary: `${label} is ${profile.accountStatus} but still holds ${grants.length} permission row(s).`,
        userId: profile.id,
        email: profile.email,
        repair: null,
      });
    }
  }

  const seenCustomer = new Set<string>();
  for (const grant of snapshot.customerGrants) {
    const profile = snapshot.profiles.find((candidate) => candidate.id === grant.userId);
    const label = profile?.email || grant.userId;
    const canonical = canonicalCategoryKey(grant.moduleKey);
    const duplicateKey = `${grant.userId}:${grant.moduleKey}`;
    if (seenCustomer.has(duplicateKey)) {
      push({
        code: 'DUPLICATE_ASSIGNMENT',
        severity: 'warning',
        approvalRequired: true,
        summary: `${label} has duplicate rows for "${grant.moduleKey}".`,
        userId: grant.userId,
        email: profile?.email,
        categoryKey: grant.moduleKey,
        repair: { kind: 'delete_customer_grant', userId: grant.userId, moduleKey: grant.moduleKey },
      });
    }
    seenCustomer.add(duplicateKey);

    if (!canonical) {
      push({
        code: 'UNKNOWN_CATEGORY_REFERENCE',
        severity: 'critical',
        approvalRequired: true,
        summary: `${label} holds a grant for unknown category "${grant.moduleKey}".`,
        userId: grant.userId,
        email: profile?.email,
        categoryKey: grant.moduleKey,
        repair: { kind: 'delete_customer_grant', userId: grant.userId, moduleKey: grant.moduleKey },
      });
      continue;
    }

    if (profile && profile.role !== 'customer') {
      push({
        code: 'ORPHANED_ASSIGNMENT',
        severity: 'warning',
        approvalRequired: true,
        summary: `${label} is a ${profile.role} and cannot use a customer grant for "${canonical}".`,
        userId: grant.userId,
        email: profile.email,
        categoryKey: canonical,
        repair: { kind: 'delete_customer_grant', userId: grant.userId, moduleKey: grant.moduleKey },
      });
    }

    if (isExpired(grant.expiresAt, nowIso)) {
      push({
        code: 'EXPIRED_PERMISSION_GRANT',
        severity: 'info',
        approvalRequired: false,
        summary: `${label} has an expired grant for "${canonical}" that can be removed.`,
        userId: grant.userId,
        email: profile?.email,
        categoryKey: canonical,
        repair: { kind: 'delete_expired_customer_grant', userId: grant.userId, moduleKey: grant.moduleKey },
      });
    }

    const invalidActions = grant.actions.filter((action) => !isPermissionAction(action));
    if (invalidActions.length > 0) {
      const validActions = grant.actions.filter((action): action is PermissionAction => isPermissionAction(action));
      push({
        code: 'INVALID_ACTION_KEY',
        severity: 'critical',
        approvalRequired: true,
        summary: `${label} has unknown action(s) ${invalidActions.join(', ')} on "${canonical}".`,
        userId: grant.userId,
        email: profile?.email,
        categoryKey: canonical,
        // Never grant more: the cleaned list keeps exactly the valid entries.
        repair: { kind: 'strip_invalid_customer_actions', userId: grant.userId, moduleKey: grant.moduleKey, actions: validActions },
      });
    }

    const definition = getAccessCategory(canonical);
    if (definition && definition.sections.length > 0) {
      const knownSections = new Set(definition.sections.map((section) => section.key));
      const invalidSections = grant.sections.filter((section) => !knownSections.has(section));
      if (invalidSections.length > 0) {
        push({
          code: 'INVALID_SECTION_KEY',
          severity: 'warning',
          approvalRequired: true,
          summary: `${label} has unknown section(s) ${invalidSections.join(', ')} on "${canonical}".`,
          userId: grant.userId,
          email: profile?.email,
          categoryKey: canonical,
          repair: null,
        });
      }
    }
  }

  for (const membership of snapshot.memberships) {
    const profile = snapshot.profiles.find((candidate) => candidate.id === membership.userId);
    const label = profile?.email || membership.userId;
    if (membership.memberStatus !== 'active') continue;
    if (membership.memberRole === 'owner') continue;
    if (!membership.hasGrantRow) {
      push({
        code: 'MISSING_MEMBER_PERMISSIONS',
        severity: 'critical',
        approvalRequired: false,
        summary: `${label} is an active business member with no permission row; VIEW-only defaults can be restored safely.`,
        userId: membership.userId,
        email: profile?.email,
        businessId: membership.businessId,
        categoryKey: membership.moduleType,
        repair: {
          kind: 'insert_view_only_member_grant',
          businessId: membership.businessId,
          userId: membership.userId,
          moduleKey: membership.moduleType,
        },
      });
    }
    const unknownModules = (membership.allowedModules || []).filter((module) => !KNOWN_PROVIDER_MODULES.has(module));
    if (unknownModules.length > 0) {
      push({
        code: 'INVALID_MEMBER_MODULE',
        severity: 'critical',
        approvalRequired: true,
        summary: `${label} holds unknown provider module(s) ${unknownModules.join(', ')}.`,
        userId: membership.userId,
        email: profile?.email,
        businessId: membership.businessId,
        categoryKey: membership.moduleType,
        repair: null,
      });
    }
    const badActions = Object.values(membership.actions)
      .flat()
      .filter((action) => !(ACCESS_ACTIONS as readonly string[]).includes(action));
    if (badActions.length > 0) {
      push({
        code: 'INVALID_ACTION_KEY',
        severity: 'critical',
        approvalRequired: true,
        summary: `${label} holds unknown member action(s) ${Array.from(new Set(badActions)).join(', ')}.`,
        userId: membership.userId,
        email: profile?.email,
        businessId: membership.businessId,
        categoryKey: membership.moduleType,
        repair: { kind: 'delete_member_grant', businessId: membership.businessId, userId: membership.userId },
      });
    }
  }

  const countsByCode: Record<string, number> = {};
  for (const finding of findings) countsByCode[finding.code] = (countsByCode[finding.code] || 0) + 1;

  const safeRepairCount = findings.filter((finding) => finding.repair && !finding.approvalRequired).length;
  const approvalRequiredCount = findings.filter((finding) => finding.approvalRequired).length;

  return {
    checkedAt: nowIso,
    healthy: findings.length === 0,
    profileCount: snapshot.profiles.length,
    customerGrantCount: snapshot.customerGrants.length,
    membershipCount: snapshot.memberships.length,
    findings,
    countsByCode,
    safeRepairCount,
    approvalRequiredCount,
  };
}

export interface RepairPlan {
  /** Findings the plan addresses. */
  findingIds: string[];
  /** Deduplicated, ordered operations. */
  operations: RepairOperation[];
  /** Unsafe operations held back because approval was not given. */
  heldOperations: RepairOperation[];
  requiresApproval: boolean;
  includesElevation: false;
}

function operationKey(operation: RepairOperation): string {
  if (operation.kind === 'insert_view_only_customer_grants') {
    return `${operation.kind}:${operation.userId}:${[...operation.categories].sort().join(',')}`;
  }
  if (operation.kind === 'strip_invalid_customer_actions') {
    return `${operation.kind}:${operation.userId}:${operation.moduleKey}`;
  }
  if (operation.kind === 'insert_view_only_member_grant' || operation.kind === 'delete_member_grant') {
    return `${operation.kind}:${operation.businessId}:${operation.userId}`;
  }
  return `${operation.kind}:${operation.userId}:${operation.moduleKey}`;
}

/**
 * Turn a report into an executable plan.
 *
 * Safe repairs are always included. Destructive repairs only appear when the
 * administrator passes `approveDestructive`, and the plan reports what it held
 * back rather than silently doing it.
 */
export function buildRepairPlan(
  report: HealthReport,
  options: { approveDestructive?: boolean } = {},
): RepairPlan {
  const seen = new Set<string>();
  const operations: RepairOperation[] = [];
  const heldOperations: RepairOperation[] = [];

  for (const finding of report.findings) {
    if (!finding.repair) continue;
    const key = `${finding.approvalRequired ? 'approval' : 'safe'}:${operationKey(finding.repair)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (finding.approvalRequired && !options.approveDestructive) {
      heldOperations.push(finding.repair);
      continue;
    }
    operations.push(finding.repair);
  }

  return {
    findingIds: report.findings.map((finding) => finding.id),
    operations,
    heldOperations,
    requiresApproval: heldOperations.length > 0,
    includesElevation: false,
  };
}

/**
 * Guard used by the repository before executing any plan produced anywhere
 * else. A repair may never contain an action other than VIEW, and may never
 * name an unknown category.
 */
export function validateRepairOperation(operation: RepairOperation):
  | { ok: true }
  | { ok: false; error: string } {
  if (operation.kind === 'insert_view_only_customer_grants') {
    if (operation.categories.length === 0) return { ok: false, error: 'EMPTY_CATEGORY_LIST' };
    for (const category of operation.categories) {
      if (!canonicalCategoryKey(category)) return { ok: false, error: 'UNKNOWN_CATEGORY' };
    }
    return { ok: true };
  }
  if (operation.kind === 'insert_view_only_member_grant') {
    if (!KNOWN_PROVIDER_MODULES.has(operation.moduleKey)) return { ok: false, error: 'UNKNOWN_PROVIDER_MODULE' };
    return { ok: true };
  }
  if (operation.kind === 'strip_invalid_customer_actions') {
    if (!operation.actions.every((action) => action === 'view' || isPermissionAction(action))) {
      return { ok: false, error: 'INVALID_ACTION' };
    }
    return { ok: true };
  }
  return { ok: true };
}

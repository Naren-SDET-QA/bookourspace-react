/**
 * Persistence for the centralized user-management engine.
 *
 * It deliberately writes the tables the product already uses
 * (`customer_module_access` and `business_member_access`) instead of creating a
 * parallel permission store. Category permissions are therefore visible to the
 * existing provider and customer gates the moment they are saved, and a
 * revocation takes effect on the next request.
 *
 * Every mutating method:
 *   * requires an active administrator and refuses a self-edit;
 *   * validates the category, sections and actions against the shared catalog;
 *   * refuses to touch a Super Admin unless the actor is one;
 *   * records the before/after state in `access_control_audit`.
 *
 * Repairs are stored as a preview first, applied only through `applyRepair`
 * (which re-derives the plan from the stored report), and can be rolled back
 * exactly from the receipts captured at apply time.
 */

import type { PoolClient } from 'pg';
import { getSharedPostgresPool } from '../server/postgresPool';
import { assertPostgresConnectionTarget } from '../server/persistencePolicy';
import { logSafeError } from '../server/safeLogging';
import {
  COMPLETE_ACCESS_ACTIONS,
  DEFAULT_SIGNUP_ACTIONS,
  activeAccessCategories,
  canonicalCategoryKey,
  getAccessCategory,
  sanitizeActions,
  type PermissionAction,
} from './catalog';
import {
  canManageAccess,
  mayModifyPermissionsFor,
  type AccessActor,
  type AccessGrantRow,
  type ProviderBusinessGrant,
} from './engine';
import {
  buildRepairPlan,
  validateRepairOperation,
  type HealthReport,
  type HealthSnapshot,
  type RepairOperation,
} from './health';

export class AccessControlError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string = code,
  ) {
    super(message);
    this.name = 'AccessControlError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AccountSummary {
  id: string;
  email: string;
  fullName: string;
  role: string;
  accountStatus: string;
  isSuperAdmin: boolean;
  verified: boolean;
  createdAt: string | null;
  categoryCount: number;
  businessCount: number;
}

export interface AccountDetail extends AccountSummary {
  customerGrants: Array<{
    category: string;
    label: string;
    sections: string[];
    actions: string[];
    expiresAt: string | null;
    grantSource: string | null;
  }>;
  businesses: Array<{
    businessId: string;
    name: string;
    moduleType: string;
    approvalStatus: string;
    isEnabled: boolean;
    moduleEnabled: boolean;
    moduleApprovalStatus: string;
    memberRole: string;
    memberStatus: string;
    category: string | null;
    allowedModules: string[] | null;
    sections: Record<string, string[]>;
    actions: Record<string, string[]>;
  }>;
}

export interface CategoryPermissionInput {
  category: string;
  actions: string[];
  sections?: string[];
  expiresAt?: string | null;
}

interface TargetProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  account_status: string;
  is_super_admin: boolean;
  verified?: boolean | null;
}

type GrantSnapshot = {
  sections: string[];
  actions: string[];
  expiresAt: string | null;
  grantedBy: string | null;
  grantSource: string | null;
};

type RepairReceipt =
  | { kind: 'customer_grant_inserted'; userId: string; moduleKey: string }
  | { kind: 'customer_grant_updated'; userId: string; moduleKey: string; previous: GrantSnapshot }
  | { kind: 'customer_grant_deleted'; userId: string; moduleKey: string; previous: GrantSnapshot }
  | { kind: 'member_grant_inserted'; businessId: string; userId: string }
  | { kind: 'member_grant_updated'; businessId: string; userId: string; previous: Record<string, unknown> }
  | { kind: 'member_grant_deleted'; businessId: string; userId: string; previous: Record<string, unknown> };

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((entry) => entry.length > 0);
}

function mapOfLists(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(entry)) result[key] = entry.map(String);
  }
  return result;
}

export class AccessControlRepository {
  private readonly pool: ReturnType<typeof getSharedPostgresPool>;
  private grantSourceSupported: boolean | null = null;

  constructor(connectionString: string, environment: NodeJS.ProcessEnv = process.env) {
    assertPostgresConnectionTarget(connectionString, environment);
    this.pool = getSharedPostgresPool(connectionString, environment);
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): AccessControlRepository | null {
    const url = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
    if (!url) return null;
    return new AccessControlRepository(url, env);
  }

  async verifyConnection(): Promise<void> {
    await this.pool.query('select 1');
  }

  /** True when the additive `grant_source` column is present. */
  private async supportsGrantSource(): Promise<boolean> {
    if (this.grantSourceSupported !== null) return this.grantSourceSupported;
    const { rows } = await this.pool.query(
      `select count(*)::int as present
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'customer_module_access'
          and column_name = 'grant_source'`,
    );
    this.grantSourceSupported = Number(rows[0]?.present) === 1;
    return this.grantSourceSupported;
  }

  private requireAdmin(actor: AccessActor | null | undefined): void {
    if (!canManageAccess(actor)) throw new AccessControlError('FORBIDDEN_ADMIN_ONLY', 403);
  }

  private async loadTarget(userId: string): Promise<TargetProfile> {
    if (!UUID.test(String(userId || ''))) throw new AccessControlError('INVALID_ACCOUNT_ID', 400);
    const { rows } = await this.pool.query(
      `select id, email, full_name, role, account_status, is_super_admin, verified
         from public.profiles where id = $1`,
      [userId],
    );
    const profile = rows[0] as TargetProfile | undefined;
    if (!profile) throw new AccessControlError('ACCOUNT_NOT_FOUND', 404);
    return profile;
  }

  /** Resolve the actor record used by the engine and the guards. */
  async actorFor(userId: string): Promise<AccessActor | null> {
    if (!UUID.test(String(userId || ''))) return null;
    const { rows } = await this.pool.query(
      `select id, role, account_status, is_super_admin from public.profiles where id = $1`,
      [userId],
    );
    const profile = rows[0];
    if (!profile) return null;
    return {
      userId: String(profile.id),
      role: String(profile.role),
      accountStatus: String(profile.account_status || 'active'),
      isSuperAdmin: profile.is_super_admin === true,
    };
  }

  async listAccounts(input: {
    query?: string;
    role?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ accounts: AccountSummary[]; total: number }> {
    const limit = Math.min(100, Math.max(1, Number(input.limit) || 25));
    const offset = Math.max(0, Number(input.offset) || 0);
    const query = String(input.query || '').trim().replace(/[%_]/g, (char) => `\\${char}`);
    const role = ['customer', 'provider', 'admin'].includes(String(input.role)) ? String(input.role) : null;
    const status = String(input.status || '').trim() || null;

    const params: Array<string | number> = [];
    const where: string[] = ['true'];
    if (query) {
      params.push(`%${query}%`);
      where.push(`(p.email ilike $${params.length} or p.full_name ilike $${params.length})`);
    }
    if (role) {
      params.push(role);
      where.push(`p.role = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`p.account_status = $${params.length}`);
    }
    const whereSql = where.join(' and ');

    const totalResult = await this.pool.query(
      `select count(*)::int as total from public.profiles p where ${whereSql}`,
      params,
    );
    const limitIndex = params.length + 1;
    const { rows } = await this.pool.query(
      `select p.id, p.email, p.full_name, p.role, p.account_status, p.is_super_admin, p.verified, p.created_at,
              (select count(*)::int from public.customer_module_access g where g.user_id = p.id) as category_count,
              (select count(*)::int from public.business_members m where m.user_id = p.id and m.status = 'active') as business_count
         from public.profiles p
        where ${whereSql}
        order by (p.role = 'admin') desc, p.full_name asc nulls last, p.email asc
        limit $${limitIndex} offset $${limitIndex + 1}`,
      [...params, limit, offset],
    );

    return {
      total: Number(totalResult.rows[0]?.total) || 0,
      accounts: rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        email: String(row.email || ''),
        fullName: String(row.full_name || row.email || ''),
        role: String(row.role || 'customer'),
        accountStatus: String(row.account_status || 'active'),
        isSuperAdmin: row.is_super_admin === true,
        verified: row.verified === true,
        createdAt: row.created_at ? String(row.created_at) : null,
        categoryCount: Number(row.category_count) || 0,
        businessCount: Number(row.business_count) || 0,
      })),
    };
  }

  async getAccount(userId: string): Promise<AccountDetail> {
    const profile = await this.loadTarget(userId);
    const grants = await this.pool.query(
      `select module_key,
              to_jsonb(cma) -> 'allowed_sections' as allowed_sections,
              to_jsonb(cma) -> 'allowed_actions' as allowed_actions,
              to_jsonb(cma) -> 'grant_source' as grant_source,
              expires_at
         from public.customer_module_access cma
        where user_id = $1
        order by module_key`,
      [userId],
    );
    const memberships = await this.pool.query(
      `select m.business_id, m.role as member_role, m.status as member_status,
              b.name as business_name, b.module_type, b.approval_status, b.is_enabled,
              bma.enabled as module_enabled, bma.approval_status as module_approval_status,
              to_jsonb(ma) -> 'allowed_modules' as allowed_modules,
              to_jsonb(ma) -> 'allowed_sections' as allowed_sections,
              to_jsonb(ma) -> 'allowed_actions' as allowed_actions
         from public.business_members m
         join public.businesses b on b.id = m.business_id
         left join public.business_module_access bma
           on bma.business_id = b.id and bma.module_type = b.module_type
         left join public.business_member_access ma
           on ma.business_id = m.business_id and ma.user_id = m.user_id
        where m.user_id = $1
        order by b.name asc`,
      [userId],
    );

    const customerGrants = (grants.rows as Array<Record<string, unknown>>).map((row) => ({
      category: String(row.module_key),
      label: getAccessCategory(row.module_key)?.label || String(row.module_key),
      sections: idList(row.allowed_sections),
      actions: idList(row.allowed_actions),
      expiresAt: row.expires_at ? String(row.expires_at) : null,
      grantSource: row.grant_source ? String(row.grant_source) : null,
    }));

    const businesses = (memberships.rows as Array<Record<string, unknown>>).map((row) => ({
      businessId: String(row.business_id),
      name: String(row.business_name || ''),
      moduleType: String(row.module_type || ''),
      approvalStatus: String(row.approval_status || ''),
      isEnabled: row.is_enabled === true,
      moduleEnabled: row.module_enabled === true,
      moduleApprovalStatus: String(row.module_approval_status || ''),
      memberRole: String(row.member_role || ''),
      memberStatus: String(row.member_status || ''),
      category: getAccessCategory(String(row.module_type))?.key ?? null,
      allowedModules: Array.isArray(row.allowed_modules) ? row.allowed_modules.map(String) : null,
      sections: mapOfLists(row.allowed_sections),
      actions: mapOfLists(row.allowed_actions),
    }));

    return {
      id: profile.id,
      email: String(profile.email || ''),
      fullName: String(profile.full_name || profile.email || ''),
      role: profile.role,
      accountStatus: profile.account_status,
      isSuperAdmin: profile.is_super_admin === true,
      verified: profile.verified === true,
      createdAt: null,
      categoryCount: customerGrants.length,
      businessCount: businesses.filter((business) => business.memberStatus === 'active').length,
      customerGrants,
      businesses,
    };
  }

  /** Validate one untrusted category entry against the shared catalog. */
  private normalizeEntry(input: CategoryPermissionInput): {
    categoryKey: string;
    actions: PermissionAction[];
    /** `null` means the caller did not send sections: preserve what is stored. */
    sections: string[] | null;
    expiresAt: string | null;
  } {
    const categoryKey = canonicalCategoryKey(input?.category);
    const definition = getAccessCategory(categoryKey);
    if (!categoryKey || !definition) throw new AccessControlError('UNKNOWN_CATEGORY', 400);
    const sanitized = sanitizeActions(input.actions);
    if (!sanitized.ok) throw new AccessControlError('INVALID_ACTIONS', 400);
    let sections: string[] | null = null;
    if (input.sections != null) {
      if (!Array.isArray(input.sections)) throw new AccessControlError('INVALID_SECTIONS', 400);
      const known = new Set(definition.sections.map((section) => section.key));
      sections = Array.from(new Set(input.sections.map(String)));
      // An empty list explicitly means "every section".
      for (const section of sections) {
        if (!known.has(section)) throw new AccessControlError('INVALID_SECTIONS', 400);
      }
    }
    let expiresAt: string | null = null;
    if (input.expiresAt) {
      const parsed = Date.parse(String(input.expiresAt));
      if (!Number.isFinite(parsed)) throw new AccessControlError('INVALID_EXPIRY', 400);
      expiresAt = new Date(parsed).toISOString();
    }
    return { categoryKey, actions: sanitized.actions, sections, expiresAt };
  }

  private async audit(input: {
    actorId: string | null;
    targetUserId: string;
    action: string;
    before: unknown;
    after: unknown;
    reason?: string | null;
    repairId?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `insert into public.access_control_audit
         (actor_user_id, target_user_id, action, before_state, after_state, reason, repair_id)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.actorId,
        input.targetUserId,
        input.action,
        JSON.stringify(input.before ?? null),
        JSON.stringify(input.after ?? null),
        input.reason ?? null,
        input.repairId ?? null,
      ],
    );
  }

  /**
   * Replace the permissions of the named categories for one account.
   * An empty action list revokes that category instead of storing "everything".
   */
  async setCategoryPermissions(
    actor: AccessActor | null | undefined,
    userId: string,
    entries: CategoryPermissionInput[],
  ): Promise<AccountDetail> {
    this.requireAdmin(actor);
    const target = await this.loadTarget(userId);
    const guard = mayModifyPermissionsFor(actor, {
      userId: target.id,
      isSuperAdmin: target.is_super_admin,
    });
    if (!guard.ok) throw new AccessControlError(guard.error, guard.status);
    if (target.role === 'admin') throw new AccessControlError('ADMIN_PERMISSIONS_IMMUTABLE', 403);
    if (!Array.isArray(entries)) throw new AccessControlError('PERMISSIONS_REQUIRED', 400);

    const normalized = entries.map((entry) => this.normalizeEntry(entry));
    const supportsSource = await this.supportsGrantSource();
    const client = await this.pool.connect();
    const before = await this.getAccount(userId);
    const sourceColumns = supportsSource
      ? '(user_id, module_key, allowed_sections, allowed_actions, expires_at, granted_by, grant_source, updated_at)'
      : '(user_id, module_key, allowed_sections, allowed_actions, expires_at, granted_by, updated_at)';
    const sourceValues = supportsSource ? '$1,$2,$3,$4,$5,$6,$7, now()' : '$1,$2,$3,$4,$5,$6, now()';

    try {
      await client.query('begin');
      if (target.role === 'provider') {
        for (const entry of normalized) {
          const definition = getAccessCategory(entry.categoryKey);
          const moduleKey = definition?.providerModule ?? null;
          if (!moduleKey) {
            // A category with no provider workspace can only be a no-op revoke;
            // granting one is a client error.
            if (entry.actions.length === 0) continue;
            throw new AccessControlError('CATEGORY_NOT_FOR_PROVIDER', 400);
          }
          // Owners bypass member grants entirely and the database guard rejects a
          // row for them, so a provider save must never write one.
          const { rows } = await client.query(
            `select m.business_id, b.module_type,
                    to_jsonb(ma) -> 'allowed_sections' as existing_sections
               from public.business_members m
               join public.businesses b on b.id = m.business_id
               left join public.business_member_access ma
                 on ma.business_id = m.business_id and ma.user_id = m.user_id
              where m.user_id = $1 and m.status = 'active' and m.role <> 'owner'
                and b.module_type = $2`,
            [userId, moduleKey],
          );
          for (const membership of rows) {
            if (entry.actions.length === 0) {
              // Revoke by storing an empty module list. Deleting the row would
              // restore the legacy "no row means unrestricted" contract.
              await client.query(
                `insert into public.business_member_access
                   (business_id, user_id, allowed_modules, allowed_sections, allowed_actions, updated_by, updated_at)
                 values ($1,$2,'{}'::text[],'{}'::jsonb,'{}'::jsonb,$3,now())
                 on conflict (business_id, user_id) do update
                   set allowed_modules = '{}'::text[],
                       allowed_sections = '{}'::jsonb,
                       allowed_actions = '{}'::jsonb,
                       updated_by = excluded.updated_by,
                       updated_at = now()`,
                [membership.business_id, userId, actor!.userId],
              );
              continue;
            }
            // Omitting sections means "leave the stored section scope alone";
            // overwriting it here would silently widen a restricted member.
            const storedSections = mapOfLists(membership.existing_sections)[moduleKey] || [];
            const effectiveSections = entry.sections === null ? storedSections : entry.sections;
            const sections = effectiveSections.length > 0 ? { [moduleKey]: effectiveSections } : {};
            const actions = { [moduleKey]: entry.actions };
            await client.query(
              `insert into public.business_member_access
                 (business_id, user_id, allowed_modules, allowed_sections, allowed_actions, updated_by, updated_at)
               values ($1,$2,$3,$4,$5,$6, now())
               on conflict (business_id, user_id) do update
                 set allowed_modules = excluded.allowed_modules,
                     allowed_sections = excluded.allowed_sections,
                     allowed_actions = excluded.allowed_actions,
                     updated_by = excluded.updated_by,
                     updated_at = now()`,
              [membership.business_id, userId, [moduleKey], JSON.stringify(sections), JSON.stringify(actions), actor!.userId],
            );
          }
        }
      } else {
        for (const entry of normalized) {
          if (entry.actions.length === 0) {
            await client.query(
              `delete from public.customer_module_access where user_id = $1 and module_key = $2`,
              [userId, entry.categoryKey],
            );
            continue;
          }
          // Preserve a stored section scope when the request did not send one.
          let customerSections = entry.sections;
          if (customerSections === null) {
            const existing = await client.query(
              `select to_jsonb(cma) -> 'allowed_sections' as allowed_sections
                 from public.customer_module_access cma
                where user_id = $1 and module_key = $2`,
              [userId, entry.categoryKey],
            );
            customerSections = idList(existing.rows[0]?.allowed_sections);
          }
          const params: unknown[] = [
            userId,
            entry.categoryKey,
            JSON.stringify(customerSections),
            JSON.stringify(entry.actions),
            entry.expiresAt,
            actor!.userId,
          ];
          if (supportsSource) params.push('manual');
          await client.query(
            `insert into public.customer_module_access ${sourceColumns}
             values (${sourceValues})
             on conflict (user_id, module_key) do update
               set allowed_sections = excluded.allowed_sections,
                   allowed_actions = excluded.allowed_actions,
                   expires_at = excluded.expires_at,
                   granted_by = excluded.granted_by,
                   updated_at = now()`,
            params,
          );
        }
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const after = await this.getAccount(userId);
    await this.audit({
      actorId: actor!.userId ? String(actor!.userId) : null,
      targetUserId: userId,
      action: 'category_permissions.updated',
      before: before.customerGrants.concat(before.businesses as never),
      after: after.customerGrants.concat(after.businesses as never),
      reason: null,
    });
    return after;
  }

  private async applyPreset(
    actor: AccessActor | null | undefined,
    userId: string,
    categories: string[] | null | undefined,
    mode: 'complete' | 'view',
  ): Promise<AccountDetail> {
    this.requireAdmin(actor);
    const target = await this.loadTarget(userId);
    const guard = mayModifyPermissionsFor(actor, { userId: target.id, isSuperAdmin: target.is_super_admin });
    if (!guard.ok) throw new AccessControlError(guard.error, guard.status);
    if (target.role === 'admin') throw new AccessControlError('ADMIN_PERMISSIONS_IMMUTABLE', 403);

    const requested = Array.isArray(categories) && categories.length > 0
      ? categories
      : ['pg', 'hotels', 'services', 'movies', 'classes', 'function_hall'];
    const actions: PermissionAction[] = mode === 'complete'
      ? [...COMPLETE_ACCESS_ACTIONS]
      : [...DEFAULT_SIGNUP_ACTIONS];

    const entries = requested.map((category) => ({ category, actions, sections: [] }));
    const detail = await this.setCategoryPermissions(actor, userId, entries);
    await this.audit({
      actorId: actor!.userId ? String(actor!.userId) : null,
      targetUserId: userId,
      action: mode === 'complete' ? 'category_permissions.complete_access' : 'category_permissions.restore_view_only',
      before: null,
      after: { categories: requested, actions },
      reason: null,
    });
    return detail;
  }

  async grantCompleteAccess(
    actor: AccessActor | null | undefined,
    userId: string,
    categories?: string[] | null,
  ): Promise<AccountDetail> {
    return this.applyPreset(actor, userId, categories, 'complete');
  }

  async restoreViewOnly(
    actor: AccessActor | null | undefined,
    userId: string,
    categories?: string[] | null,
  ): Promise<AccountDetail> {
    return this.applyPreset(actor, userId, categories, 'view');
  }

  /** A conservative summary of an account, safe to return to the console. */
  private summarize(account: AccountDetail): AccountSummary {
    return {
      id: account.id,
      email: account.email,
      fullName: account.fullName,
      role: account.role,
      accountStatus: account.accountStatus,
      isSuperAdmin: account.isSuperAdmin,
      verified: account.verified,
      createdAt: account.createdAt,
      categoryCount: account.categoryCount,
      businessCount: account.businessCount,
    };
  }

  /**
   * Change an account's platform role.
   *
   * The actor is re-read from `profiles` by the HTTP layer, never trusted from
   * the session token. Role changes are stricter than a permission edit:
   *   * an administrator can never change their own role;
   *   * only a Super Admin may grant or remove `admin`;
   *   * a Super Admin can never be demoted by an ordinary administrator, and the
   *     last active Super Admin can never be demoted at all;
   *   * promotion to `admin` never grants `is_super_admin`.
   */
  async setAccountRole(
    actor: AccessActor | null | undefined,
    userId: string,
    role: 'customer' | 'provider' | 'admin',
    reason?: string | null,
  ): Promise<AccountSummary> {
    this.requireAdmin(actor);
    if (!['customer', 'provider', 'admin'].includes(role)) {
      throw new AccessControlError('INVALID_ROLE', 400);
    }
    const target = await this.loadTarget(userId);
    const guard = mayModifyPermissionsFor(actor, { userId: target.id, isSuperAdmin: target.is_super_admin });
    if (!guard.ok) throw new AccessControlError(guard.error, guard.status);
    if ((role === 'admin' || target.role === 'admin' || target.is_super_admin) && actor!.isSuperAdmin !== true) {
      throw new AccessControlError('SUPER_ADMIN_REQUIRED', 403);
    }
    if (target.is_super_admin && role !== 'admin') {
      const { rows } = await this.pool.query(
        `select count(*)::int as active_supers from public.profiles
          where is_super_admin and account_status = 'active'`,
      );
      if (Number(rows[0]?.active_supers) <= 1) {
        throw new AccessControlError('LAST_SUPER_ADMIN_PROTECTED', 403);
      }
    }
    if (target.role === role) {
      return this.summarize(await this.getAccount(userId));
    }

    await this.pool.query(
      `update public.profiles
          set role = $2,
              is_super_admin = case when $2 = 'admin' then is_super_admin else false end,
              updated_at = now()
        where id = $1`,
      [userId, role],
    );
    await this.audit({
      actorId: actor!.userId ? String(actor!.userId) : null,
      targetUserId: userId,
      action: 'account.role',
      before: { role: target.role, isSuperAdmin: target.is_super_admin === true },
      after: { role, isSuperAdmin: role === 'admin' ? target.is_super_admin === true : false },
      reason: reason ?? null,
    });
    return this.summarize(await this.getAccount(userId));
  }

  /**
   * Mark an account verified or unverified.
   *
   * Verification never changes a role or a grant; it only records the KYC/
   * identity decision and is auditable and reversible.
   */
  async setAccountVerified(
    actor: AccessActor | null | undefined,
    userId: string,
    verified: boolean,
    reason?: string | null,
  ): Promise<AccountSummary> {
    this.requireAdmin(actor);
    const target = await this.loadTarget(userId);
    const guard = mayModifyPermissionsFor(actor, { userId: target.id, isSuperAdmin: target.is_super_admin });
    if (!guard.ok) throw new AccessControlError(guard.error, guard.status);
    await this.pool.query(
      `update public.profiles set verified = $2, updated_at = now() where id = $1`,
      [userId, verified === true],
    );
    await this.audit({
      actorId: actor!.userId ? String(actor!.userId) : null,
      targetUserId: userId,
      action: 'account.verified',
      before: { verified: target.verified === true },
      after: { verified: verified === true },
      reason: reason ?? null,
    });
    return this.summarize(await this.getAccount(userId));
  }

  /**
   * Activate, suspend or revoke an account.
   *
   * `revoked` is stored as the existing `blocked` status and also removes the
   * account's grant rows, so revocation is immediate and cannot be re-enabled by
   * a stale session. The removed rows are preserved in the audit entry.
   *
   * Reactivating a customer who has no grant rows seeds the View-only signup
   * default. Without that, zero customer rows mean the legacy "unrestricted"
   * contract, so a suspend/reactivate cycle would silently widen access.
   */
  async setAccountStatus(
    actor: AccessActor | null | undefined,
    userId: string,
    status: 'active' | 'suspended' | 'revoked' | 'blocked' | 'pending_verification',
    reason?: string | null,
  ): Promise<AccountSummary> {
    this.requireAdmin(actor);
    const target = await this.loadTarget(userId);
    const guard = mayModifyPermissionsFor(actor, { userId: target.id, isSuperAdmin: target.is_super_admin });
    if (!guard.ok) throw new AccessControlError(guard.error, guard.status);
    const nextStatus = status === 'revoked' ? 'blocked' : status;
    if (!['active', 'suspended', 'blocked', 'pending_verification'].includes(nextStatus)) {
      throw new AccessControlError('INVALID_ACCOUNT_STATUS', 400);
    }
    if (target.is_super_admin && nextStatus !== 'active' && actor!.isSuperAdmin !== true) {
      throw new AccessControlError('SUPER_ADMIN_PROTECTED', 403);
    }
    if (target.is_super_admin && nextStatus !== 'active') {
      const { rows } = await this.pool.query(
        `select count(*)::int as active_supers from public.profiles
          where is_super_admin and account_status = 'active'`,
      );
      if (Number(rows[0]?.active_supers) <= 1) {
        throw new AccessControlError('LAST_SUPER_ADMIN_PROTECTED', 403);
      }
    }

    const before = await this.getAccount(userId);
    const grantSource = await this.supportsGrantSource();
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `update public.profiles set account_status = $2, updated_at = now() where id = $1`,
        [userId, nextStatus],
      );
      if (nextStatus !== 'active') {
        await client.query(`delete from public.customer_module_access where user_id = $1`, [userId]);
        // Provider member rows are retained with an empty module list. Deleting
        // them would restore the legacy "no grant row = unrestricted" contract
        // the moment the account is reactivated.
        await client.query(
          `update public.business_member_access
              set allowed_modules = '{}'::text[],
                  allowed_sections = '{}'::jsonb,
                  allowed_actions = '{}'::jsonb,
                  updated_at = now()
            where user_id = $1`,
          [userId],
        );
      } else if (String(target.role) === 'customer') {
        const { rows: existing } = await client.query(
          `select 1 from public.customer_module_access where user_id = $1 limit 1`,
          [userId],
        );
        if (existing.length === 0) {
          const categories = activeAccessCategories().map((category) => category.key);
          if (grantSource) {
            await client.query(
              `insert into public.customer_module_access
                 (user_id, module_key, allowed_sections, allowed_actions, granted_by, grant_source)
               select $1, key, '[]'::jsonb, $3::jsonb, $2, 'signup_default'
                 from unnest($4::text[]) as key
               on conflict (user_id, module_key) do nothing`,
              [userId, actor!.userId ? String(actor!.userId) : null, JSON.stringify([...DEFAULT_SIGNUP_ACTIONS]), categories],
            );
          } else {
            await client.query(
              `insert into public.customer_module_access
                 (user_id, module_key, allowed_sections, allowed_actions, granted_by)
               select $1, key, '[]'::jsonb, $3::jsonb, $2
                 from unnest($4::text[]) as key
               on conflict (user_id, module_key) do nothing`,
              [userId, actor!.userId ? String(actor!.userId) : null, JSON.stringify([...DEFAULT_SIGNUP_ACTIONS]), categories],
            );
          }
        }
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    await this.audit({
      actorId: actor!.userId ? String(actor!.userId) : null,
      targetUserId: userId,
      action: `account.${status}`,
      before: { status: before.accountStatus, grants: before.customerGrants, businesses: before.businesses },
      after: { status: nextStatus },
      reason: reason ?? null,
    });
    return this.summarize(await this.getAccount(userId));
  }

  async history(userId: string): Promise<Array<Record<string, unknown>>> {
    if (!UUID.test(String(userId || ''))) throw new AccessControlError('INVALID_ACCOUNT_ID', 400);
    const { rows } = await this.pool.query(
      `select 'permission' as scope, a.id::text as id, a.module_key as category,
              a.action, a.created_at, a.expires_at,
              p.full_name as actor_name,
              to_jsonb(a) -> 'allowed_sections' as sections,
              to_jsonb(a) -> 'allowed_actions' as actions,
              null::text as reason
         from public.customer_module_access_audit a
         left join public.profiles p on p.id = a.granted_by
        where a.user_id = $1
        union all
       select 'account' as scope, e.id::text as id, coalesce(e.after_state ->> 'status', '') as category,
              e.action, e.created_at, null as expires_at,
              p.full_name as actor_name,
              e.after_state -> 'grants' as sections,
              e.before_state -> 'grants' as actions,
              e.reason
         from public.access_control_audit e
         left join public.profiles p on p.id = e.actor_user_id
        where e.target_user_id = $1
        order by created_at desc
        limit 200`,
      [userId],
    );
    return rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      scope: String(row.scope),
      category: String(row.category || ''),
      action: String(row.action || ''),
      createdAt: row.created_at,
      expiresAt: row.expires_at || null,
      actor: row.actor_name ? String(row.actor_name) : null,
      reason: row.reason ? String(row.reason) : null,
      sections: idList(row.sections),
      actions: idList(row.actions),
    }));
  }

  async loadHealthSnapshot(): Promise<HealthSnapshot> {
    const [profiles, grants, memberships, flags] = await Promise.all([
      this.pool.query(`select id, email, role, account_status, is_super_admin from public.profiles order by email asc`),
      this.pool.query(
        `select user_id, module_key,
                to_jsonb(cma) -> 'allowed_sections' as allowed_sections,
                to_jsonb(cma) -> 'allowed_actions' as allowed_actions,
                to_jsonb(cma) -> 'grant_source' as grant_source,
                expires_at
           from public.customer_module_access cma
          order by user_id, module_key`,
      ),
      this.pool.query(
        `select m.business_id, m.user_id, m.role as member_role, m.status as member_status,
                b.module_type,
                (ma.user_id is not null) as has_grant_row,
                to_jsonb(ma) -> 'allowed_modules' as allowed_modules,
                to_jsonb(ma) -> 'allowed_sections' as allowed_sections,
                to_jsonb(ma) -> 'allowed_actions' as allowed_actions
           from public.business_members m
           join public.businesses b on b.id = m.business_id
           left join public.business_member_access ma
             on ma.business_id = m.business_id and ma.user_id = m.user_id
          order by m.business_id, m.user_id`,
      ),
      this.pool.query(`select module_key, is_enabled from public.platform_module_flags order by module_key`),
    ]);

    return {
      nowIso: new Date().toISOString(),
      profiles: (profiles.rows as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        email: String(row.email || ''),
        role: String(row.role || ''),
        accountStatus: String(row.account_status || 'active'),
        isSuperAdmin: row.is_super_admin === true,
      })),
      customerGrants: (grants.rows as Array<Record<string, unknown>>).map((row) => ({
        userId: String(row.user_id),
        moduleKey: String(row.module_key),
        sections: idList(row.allowed_sections),
        actions: idList(row.allowed_actions),
        expiresAt: row.expires_at ? String(row.expires_at) : null,
        grantSource: row.grant_source ? String(row.grant_source) : null,
      })),
      memberships: (memberships.rows as Array<Record<string, unknown>>).map((row) => ({
        businessId: String(row.business_id),
        userId: String(row.user_id),
        memberRole: String(row.member_role || ''),
        memberStatus: String(row.member_status || ''),
        moduleType: String(row.module_type || ''),
        hasGrantRow: row.has_grant_row === true,
        allowedModules: Array.isArray(row.allowed_modules) ? row.allowed_modules.map(String) : null,
        sections: mapOfLists(row.allowed_sections),
        actions: mapOfLists(row.allowed_actions),
      })),
      flags: (flags.rows as Array<Record<string, unknown>>).map((row) => ({
        moduleKey: String(row.module_key),
        isEnabled: row.is_enabled === true,
      })),
    };
  }

  /** Most recent repair records, for the console's rollback list. */
  async listRepairs(limit = 20): Promise<Array<Record<string, unknown>>> {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const { rows } = await this.pool.query(
      `select id, status, requires_approval, approved_destructive, created_at, applied_at, rolled_back_at
         from public.access_control_repairs
        order by created_at desc
        limit $1`,
      [safeLimit],
    );
    return rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      status: String(row.status),
      requiresApproval: row.requires_approval === true,
      approvedDestructive: row.approved_destructive === true,
      createdAt: row.created_at,
      appliedAt: row.applied_at || null,
      rolledBackAt: row.rolled_back_at || null,
    }));
  }

  /** Persist a repair preview; nothing is executed until `applyRepair`. */
  async createRepair(
    actor: AccessActor | null | undefined,
    report: HealthReport,
  ): Promise<{ id: string; status: string; report: HealthReport }> {
    this.requireAdmin(actor);
    const plan = buildRepairPlan(report);
    const { rows } = await this.pool.query(
      `insert into public.access_control_repairs
         (created_by, status, report, plan, requires_approval)
       values ($1, 'preview', $2, $3, $4)
       returning id, status`,
      [actor!.userId ?? null, JSON.stringify(report), JSON.stringify(plan), plan.requiresApproval],
    );
    return { id: String(rows[0].id), status: String(rows[0].status), report };
  }

  private async executeOperation(
    client: PoolClient,
    operation: RepairOperation,
    actorId: string | null,
  ): Promise<RepairReceipt | null> {
    const supportsSource = await this.supportsGrantSource();
    if (operation.kind === 'insert_view_only_customer_grants') {
      for (const category of operation.categories) {
        const existing = await client.query(
          `select module_key from public.customer_module_access where user_id = $1 and module_key = $2`,
          [operation.userId, category],
        );
        if (existing.rows.length > 0) continue; // never overwrite an explicit grant
        await client.query(
          supportsSource
            ? `insert into public.customer_module_access
                 (user_id, module_key, allowed_sections, allowed_actions, granted_by, grant_source)
               values ($1,$2,'[]'::jsonb,$3,$4,'repair')`
            : `insert into public.customer_module_access
                 (user_id, module_key, allowed_sections, allowed_actions, granted_by)
               values ($1,$2,'[]'::jsonb,$3,$4)`,
          [operation.userId, category, JSON.stringify(DEFAULT_SIGNUP_ACTIONS), actorId],
        );
      }
      return { kind: 'customer_grant_inserted', userId: operation.userId, moduleKey: operation.categories.join(',') };
    }
    if (operation.kind === 'insert_view_only_member_grant') {
      const existing = await client.query(
        `select 1 from public.business_member_access where business_id = $1 and user_id = $2`,
        [operation.businessId, operation.userId],
      );
      if (existing.rows.length > 0) return null;
      await client.query(
        `insert into public.business_member_access
           (business_id, user_id, allowed_modules, allowed_sections, allowed_actions, updated_by)
         values ($1,$2,$3,'{}'::jsonb,$4,$5)`,
        [
          operation.businessId,
          operation.userId,
          [operation.moduleKey],
          JSON.stringify({ [operation.moduleKey]: DEFAULT_SIGNUP_ACTIONS }),
          actorId,
        ],
      );
      return { kind: 'member_grant_inserted', businessId: operation.businessId, userId: operation.userId };
    }
    if (operation.kind === 'delete_customer_grant' || operation.kind === 'delete_expired_customer_grant') {
      const { rows } = await client.query(
        `select module_key, allowed_sections, allowed_actions, expires_at, granted_by,
                to_jsonb(cma) -> 'grant_source' as grant_source
           from public.customer_module_access cma
          where user_id = $1 and module_key = $2`,
        [operation.userId, operation.moduleKey],
      );
      if (rows.length === 0) return null;
      const row = rows[0];
      const previous: GrantSnapshot = {
        sections: idList(row.allowed_sections),
        actions: idList(row.allowed_actions),
        expiresAt: row.expires_at ? String(row.expires_at) : null,
        grantedBy: row.granted_by ? String(row.granted_by) : null,
        grantSource: row.grant_source ? String(row.grant_source) : null,
      };
      await client.query(
        `delete from public.customer_module_access where user_id = $1 and module_key = $2`,
        [operation.userId, operation.moduleKey],
      );
      return { kind: 'customer_grant_deleted', userId: operation.userId, moduleKey: operation.moduleKey, previous };
    }
    if (operation.kind === 'strip_invalid_customer_actions') {
      const { rows } = await client.query(
        `select allowed_sections, allowed_actions, expires_at, granted_by,
                to_jsonb(cma) -> 'grant_source' as grant_source
           from public.customer_module_access cma
          where user_id = $1 and module_key = $2`,
        [operation.userId, operation.moduleKey],
      );
      if (rows.length === 0) return null;
      const row = rows[0];
      const previous: GrantSnapshot = {
        sections: idList(row.allowed_sections),
        actions: idList(row.allowed_actions),
        expiresAt: row.expires_at ? String(row.expires_at) : null,
        grantedBy: row.granted_by ? String(row.granted_by) : null,
        grantSource: row.grant_source ? String(row.grant_source) : null,
      };
      await client.query(
        `update public.customer_module_access set allowed_actions = $3, updated_at = now()
          where user_id = $1 and module_key = $2`,
        [operation.userId, operation.moduleKey, JSON.stringify(operation.actions)],
      );
      return { kind: 'customer_grant_updated', userId: operation.userId, moduleKey: operation.moduleKey, previous };
    }
    if (operation.kind === 'delete_member_grant') {
      const { rows } = await client.query(
        `select allowed_modules, allowed_sections, allowed_actions
           from public.business_member_access where business_id = $1 and user_id = $2`,
        [operation.businessId, operation.userId],
      );
      if (rows.length === 0) return null;
      const previous = rows[0] as Record<string, unknown>;
      await client.query(
        `delete from public.business_member_access where business_id = $1 and user_id = $2`,
        [operation.businessId, operation.userId],
      );
      return { kind: 'member_grant_deleted', businessId: operation.businessId, userId: operation.userId, previous };
    }
    return null;
  }

  async applyRepair(
    actor: AccessActor | null | undefined,
    repairId: string,
    options: { approveDestructive?: boolean } = {},
  ): Promise<{ id: string; status: string; applied: number; held: number }> {
    this.requireAdmin(actor);
    if (!UUID.test(String(repairId || ''))) throw new AccessControlError('INVALID_REPAIR_ID', 400);
    const { rows } = await this.pool.query(
      `select id, status, report from public.access_control_repairs where id = $1`,
      [repairId],
    );
    const repair = rows[0];
    if (!repair) throw new AccessControlError('REPAIR_NOT_FOUND', 404);
    if (String(repair.status) !== 'preview') throw new AccessControlError('REPAIR_NOT_PREVIEWED', 409);

    const report = repair.report as HealthReport;
    const plan = buildRepairPlan(report, { approveDestructive: options.approveDestructive === true });
    for (const operation of plan.operations) {
      const valid = validateRepairOperation(operation);
      if (!valid.ok) throw new AccessControlError(`UNSAFE_REPAIR:${valid.error}`, 400);
    }

    const client = await this.pool.connect();
    const receipts: RepairReceipt[] = [];
    try {
      await client.query('begin');
      for (const operation of plan.operations) {
        const receipt = await this.executeOperation(client, operation, actor!.userId ?? null);
        if (receipt) receipts.push(receipt);
      }
      await client.query(
        `update public.access_control_repairs
            set status = 'applied', applied_by = $2, applied_at = now(),
                plan = $3, applied_state = $4, approved_destructive = $5
          where id = $1`,
        [
          repairId,
          actor!.userId ?? null,
          JSON.stringify(plan),
          JSON.stringify({ receipts }),
          options.approveDestructive === true,
        ],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    await this.pool.query(
      `insert into public.access_control_audit
         (actor_user_id, target_user_id, action, before_state, after_state, reason, repair_id)
       values ($1, $1, 'permission_repair.applied', '{}'::jsonb, $2, $3, $4)`,
      [
        actor!.userId ?? null,
        JSON.stringify({ operations: plan.operations.length, receipts: receipts.length }),
        `Repair ${repairId} applied from a previewed plan`,
        repairId,
      ],
    ).catch((error) => logSafeError('access-control', 'repair audit', error));

    return { id: repairId, status: 'applied', applied: receipts.length, held: plan.heldOperations.length };
  }

  async rollbackRepair(
    actor: AccessActor | null | undefined,
    repairId: string,
  ): Promise<{ id: string; status: string; reversed: number }> {
    this.requireAdmin(actor);
    if (!UUID.test(String(repairId || ''))) throw new AccessControlError('INVALID_REPAIR_ID', 400);
    const { rows } = await this.pool.query(
      `select id, status, applied_state from public.access_control_repairs where id = $1`,
      [repairId],
    );
    const repair = rows[0];
    if (!repair) throw new AccessControlError('REPAIR_NOT_FOUND', 404);
    if (String(repair.status) !== 'applied') throw new AccessControlError('REPAIR_NOT_APPLIED', 409);

    const receipts: RepairReceipt[] = Array.isArray((repair.applied_state as { receipts?: RepairReceipt[] })?.receipts)
      ? (repair.applied_state as { receipts: RepairReceipt[] }).receipts
      : [];

    const client = await this.pool.connect();
    let reversed = 0;
    try {
      await client.query('begin');
      // Undo in reverse order so a later operation cannot depend on an earlier one.
      for (const receipt of [...receipts].reverse()) {
        if (receipt.kind === 'customer_grant_inserted') {
          for (const moduleKey of receipt.moduleKey.split(',')) {
            await client.query(
              `delete from public.customer_module_access where user_id = $1 and module_key = $2`,
              [receipt.userId, moduleKey],
            );
          }
          reversed += 1;
        } else if (receipt.kind === 'customer_grant_deleted' || receipt.kind === 'customer_grant_updated') {
          await client.query(
            `insert into public.customer_module_access
               (user_id, module_key, allowed_sections, allowed_actions, expires_at, granted_by)
             values ($1,$2,$3,$4,$5,$6)
             on conflict (user_id, module_key) do update
               set allowed_sections = excluded.allowed_sections,
                   allowed_actions = excluded.allowed_actions,
                   expires_at = excluded.expires_at,
                   granted_by = excluded.granted_by,
                   updated_at = now()`,
            [
              receipt.userId,
              receipt.moduleKey,
              JSON.stringify(receipt.previous.sections),
              JSON.stringify(receipt.previous.actions),
              receipt.previous.expiresAt,
              receipt.previous.grantedBy,
            ],
          );
          reversed += 1;
        } else if (receipt.kind === 'member_grant_inserted') {
          await client.query(
            `delete from public.business_member_access where business_id = $1 and user_id = $2`,
            [receipt.businessId, receipt.userId],
          );
          reversed += 1;
        } else if (receipt.kind === 'member_grant_deleted') {
          await client.query(
            `insert into public.business_member_access
               (business_id, user_id, allowed_modules, allowed_sections, allowed_actions)
             values ($1,$2,$3,$4,$5)
             on conflict (business_id, user_id) do update
               set allowed_modules = excluded.allowed_modules,
                   allowed_sections = excluded.allowed_sections,
                   allowed_actions = excluded.allowed_actions,
                   updated_at = now()`,
            [
              receipt.businessId,
              receipt.userId,
              idList(receipt.previous.allowed_modules),
              JSON.stringify(mapOfLists(receipt.previous.allowed_sections)),
              JSON.stringify(mapOfLists(receipt.previous.allowed_actions)),
            ],
          );
          reversed += 1;
        } else if (receipt.kind === 'member_grant_updated') {
          await client.query(
            `insert into public.business_member_access
               (business_id, user_id, allowed_modules, allowed_sections, allowed_actions)
             values ($1,$2,$3,$4,$5)
             on conflict (business_id, user_id) do update
               set allowed_modules = excluded.allowed_modules,
                   allowed_sections = excluded.allowed_sections,
                   allowed_actions = excluded.allowed_actions,
                   updated_at = now()`,
            [
              receipt.businessId,
              receipt.userId,
              idList(receipt.previous.allowed_modules),
              JSON.stringify(mapOfLists(receipt.previous.allowed_sections)),
              JSON.stringify(mapOfLists(receipt.previous.allowed_actions)),
            ],
          );
          reversed += 1;
        }
      }
      await client.query(
        `update public.access_control_repairs
            set status = 'rolled_back', rolled_back_by = $2, rolled_back_at = now()
          where id = $1`,
        [repairId, actor!.userId ?? null],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    await this.pool.query(
      `insert into public.access_control_audit
         (actor_user_id, target_user_id, action, before_state, after_state, reason, repair_id)
       values ($1, $1, 'permission_repair.rolled_back', '{}'::jsonb, $2, $3, $4)`,
      [actor!.userId ?? null, JSON.stringify({ reversed }), `Repair ${repairId} rolled back`, repairId],
    ).catch((error) => logSafeError('access-control', 'repair rollback audit', error));

    return { id: repairId, status: 'rolled_back', reversed };
  }
}

export type { AccessGrantRow, ProviderBusinessGrant };

import type express from 'express';
import { getSharedPostgresPool } from './postgresPool';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { logSafeError } from './safeLogging';
import type { BuilderActor } from './platformBuilderRepository';

/**
 * Customer-specific module access.
 *
 * Roles are unchanged. A `customer` account may use only the marketplace
 * modules an administrator grants; `provider` and `admin` accounts are never
 * constrained by this table and keep their existing role/ownership access.
 *
 * Pure functions are deliberately free of database and network so the gate can
 * be unit-tested; the database RPC `public.effective_customer_module_keys()`
 * and the RLS policies on `customer_module_access` are the runtime authority.
 */

import {
  CUSTOMER_MODULE_KEYS,
  isCustomerModuleKey,
  normalizeCustomerModuleKey,
} from '../lib/customerModuleMeta';
import type { CustomerModuleKey } from '../lib/customerModuleMeta';
import { sanitizeCustomerGrants } from './customerPermissions';

export {
  CUSTOMER_MODULE_KEYS,
  CUSTOMER_MODULE_META,
  CUSTOMER_VISIBLE_MODULE_KEYS,
  isCustomerModuleKey,
  moduleKeyForSection,
  normalizeCustomerModuleKey,
  sectionForModuleKey,
} from '../lib/customerModuleMeta';
export type { CustomerModuleKey, CustomerModuleSection } from '../lib/customerModuleMeta';

export interface CustomerModuleGrantRow {
  user_id?: string;
  module_key: string;
  expires_at?: string | null;
}

/** One module grant as the admin API and the portals consume it. */
export interface CustomerModuleGrant {
  moduleKey: CustomerModuleKey;
  expiresAt: string | null;
  /** Empty means every section of the module. */
  sections: string[];
  /** Empty means every action in the module. */
  actions: string[];
}

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((entry) => entry.length > 0);
}

export interface ModuleFlagLike {
  module_key: string;
  is_enabled?: unknown;
}

/** A grant is live when it has no expiry or the expiry is still in the future. */
export function isGrantActive(
  row: Pick<CustomerModuleGrantRow, 'expires_at'> | null | undefined,
  nowIso: string
): boolean {
  if (!row) return false;
  if (!row.expires_at) return true;
  const expiry = Date.parse(row.expires_at);
  return Number.isFinite(expiry) && expiry > Date.parse(nowIso);
}

/**
 * Resolve the module keys a signed-in account may use.
 *
 * Providers and active administrators bypass the allow-list entirely. A
 * customer receives only granted, unexpired modules whose global flag is
 * enabled. Anything else yields an empty list (fail closed).
 */
export function effectiveModuleKeysForActor(input: {
  role: string | null | undefined;
  accountStatus: string | null | undefined;
  grants: readonly CustomerModuleGrantRow[] | null | undefined;
  moduleFlags: readonly ModuleFlagLike[] | null | undefined;
  nowIso: string;
}): CustomerModuleKey[] {
  const enabled = new Set(
    (input.moduleFlags || [])
      .filter((flag) => flag && flag.module_key && flag.is_enabled === true)
      .map((flag) => flag.module_key)
  );

  if (input.role === 'provider' || input.role === 'admin') {
    if (input.accountStatus && input.accountStatus !== 'active') return [];
    return CUSTOMER_MODULE_KEYS.filter((key) => enabled.has(key));
  }

  if (input.role !== 'customer') return [];
  if (input.accountStatus && input.accountStatus !== 'active') return [];

  return CUSTOMER_MODULE_KEYS.filter((key) => {
    if (!enabled.has(key)) return false;
    const grant = (input.grants || []).find((row) => row && row.module_key === key);
    if (!grant) return false;
    return isGrantActive(grant, input.nowIso);
  });
}

export interface CustomerModuleGateResult {
  allowed: boolean;
  status: number;
  code: string;
  message: string;
}

/** HTTP-shaped decision for one module, mirroring the DB RPC. */
export function evaluateCustomerModule(
  input: {
    role: string | null | undefined;
    accountStatus: string | null | undefined;
    grants: readonly CustomerModuleGrantRow[] | null | undefined;
    moduleFlags: readonly ModuleFlagLike[] | null | undefined;
    nowIso: string;
  },
  moduleKey: string
): CustomerModuleGateResult {
  if (!isCustomerModuleKey(moduleKey)) {
    return { allowed: false, status: 400, code: 'UNKNOWN_MODULE', message: 'Unknown module.' };
  }
  const modules = effectiveModuleKeysForActor(input);
  if (modules.includes(moduleKey)) {
    return { allowed: true, status: 200, code: 'OK', message: 'Allowed.' };
  }
  return {
    allowed: false,
    status: 403,
    code: 'CUSTOMER_MODULE_NOT_AUTHORIZED',
    message: 'Your account does not have access to this module.',
  };
}

export interface CustomerModuleRecord {
  id: string;
  email: string;
  fullName: string;
  modules: CustomerModuleGrant[];
}

export interface CustomerModuleAccessRepositoryDependencies {
  connectionString: string;
  environment?: NodeJS.ProcessEnv;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value: unknown): string {
  return String(value || '').trim();
}

function moduleKeyOrNull(value: unknown): CustomerModuleKey | null {
  return normalizeCustomerModuleKey(value);
}

export class CustomerModuleAccessRepository {
  private readonly pool: ReturnType<typeof getSharedPostgresPool>;
  /** Memoised schema probe: `null` until the first write or read of grants. */
  private sectionActionsSupported: boolean | null = null;
  private memberActionsSupported: boolean | null = null;

  constructor(connectionString: string, environment: NodeJS.ProcessEnv = process.env) {
    assertPostgresConnectionTarget(connectionString, environment);
    this.pool = getSharedPostgresPool(connectionString, environment);
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): CustomerModuleAccessRepository | null {
    const url = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
    if (!url) return null;
    assertPostgresConnectionTarget(url, env);
    return new CustomerModuleAccessRepository(url, env);
  }

  async verifyConnection(): Promise<void> {
    await this.pool.query('select 1');
  }

  async listCustomers(input: {
    query?: string;
    limit?: number;
    offset?: number;
    /** Only customers holding a live grant for this module. */
    module?: string;
    /** `yes` / `no` filter on whether the customer holds any grant at all. */
    granted?: string;
  }): Promise<{
    customers: CustomerModuleRecord[];
    total: number;
  }> {
    const limit = Math.min(100, Math.max(1, Number(input.limit) || 50));
    const offset = Math.max(0, Number(input.offset) || 0);
    const query = clean(input.query).replace(/[%_]/g, (char) => `\\${char}`);
    const moduleKey = normalizeCustomerModuleKey(input.module);
    const granted = input.granted === 'yes' || input.granted === 'no' ? input.granted : null;
    const params: Array<string | number> = [];
    const where: string[] = [`p.role = 'customer'`, `p.account_status = 'active'`];
    if (query) {
      params.push(`%${query}%`);
      const index = params.length;
      where.push(`(p.email ilike $${index} or p.full_name ilike $${index})`);
    }
    if (moduleKey) {
      params.push(moduleKey);
      where.push(
        `exists (select 1 from public.customer_module_access g
                  where g.user_id = p.id and g.module_key = $${params.length}
                    and (g.expires_at is null or g.expires_at > now()))`,
      );
    }
    if (granted) {
      where.push(
        `${granted === 'no' ? 'not ' : ''}exists (select 1 from public.customer_module_access g where g.user_id = p.id)`,
      );
    }
    const whereSql = where.join(' and ');
    const totalResult = await this.pool.query(
      `select count(*)::int as total from public.profiles p where ${whereSql}`,
      params,
    );
    const limitIndex = params.length + 1;
    const customerResult = await this.pool.query(
      `select p.id, p.email, p.full_name
         from public.profiles p
        where ${whereSql}
        order by p.full_name asc, p.email asc
        limit $${limitIndex} offset $${limitIndex + 1}`,
      [...params, limit, offset],
    );
    const rows = customerResult.rows as Array<{ id: string; email: string; full_name: string }>;
    const ids = rows.map((row) => String(row.id));
    const grants = ids.length
      ? await this.pool.query(
          `select user_id, module_key, expires_at,
                  to_jsonb(cma) -> 'allowed_sections' as allowed_sections,
                  to_jsonb(cma) -> 'allowed_actions' as allowed_actions
             from public.customer_module_access cma
            where user_id = any($1::uuid[])
            order by module_key`,
          [ids],
        )
      : { rows: [] as Array<Record<string, unknown>> };

    const byUser = new Map<string, CustomerModuleGrant[]>();
    for (const grant of grants.rows as Array<Record<string, unknown>>) {
      const key = moduleKeyOrNull(grant.module_key);
      if (!key) continue;
      const list = byUser.get(String(grant.user_id)) || [];
      list.push({
        moduleKey: key,
        expiresAt: (grant.expires_at as string | null) || null,
        sections: idList(grant.allowed_sections),
        actions: idList(grant.allowed_actions),
      });
      byUser.set(String(grant.user_id), list);
    }

    return {
      total: Number(totalResult.rows[0]?.total) || 0,
      customers: rows.map((row) => ({
        id: String(row.id),
        email: String(row.email || ''),
        fullName: String(row.full_name || row.email || ''),
        modules: byUser.get(String(row.id)) || [],
      })),
    };
  }

  async listModuleFlags(): Promise<ModuleFlagLike[]> {
    try {
      const { rows } = await this.pool.query(
        `select module_key, is_enabled from public.platform_module_flags order by module_key`,
      );
      return rows.map((row) => ({ module_key: String(row.module_key), is_enabled: row.is_enabled === true }));
    } catch (error) {
      logSafeError('customer-module-access', 'list module flags', error);
      return [];
    }
  }

  async grantsFor(userId: string): Promise<CustomerModuleGrant[]> {
    if (!UUID.test(userId)) return [];
    const { rows } = await this.pool.query(
      // to_jsonb keeps this readable before the section/action migration lands.
      `select module_key, expires_at,
              to_jsonb(cma) -> 'allowed_sections' as allowed_sections,
              to_jsonb(cma) -> 'allowed_actions' as allowed_actions
         from public.customer_module_access cma
        where user_id = $1
        order by module_key`,
      [userId],
    );
    return (rows as Array<Record<string, unknown>>)
      .map((row) => {
        const key = moduleKeyOrNull(row.module_key);
        if (!key) return null;
        return {
          moduleKey: key,
          expiresAt: (row.expires_at as string | null) || null,
          sections: idList(row.allowed_sections),
          actions: idList(row.allowed_actions),
        };
      })
      .filter((row): row is CustomerModuleGrant => row !== null);
  }

  /** True when the section/action columns exist in this database. */
  private async supportsSectionActions(): Promise<boolean> {
    if (this.sectionActionsSupported !== null) return this.sectionActionsSupported;
    const { rows } = await this.pool.query(
      `select count(*)::int as present
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'customer_module_access'
          and column_name in ('allowed_sections', 'allowed_actions')`,
    );
    this.sectionActionsSupported = Number(rows[0]?.present) === 2;
    return this.sectionActionsSupported;
  }

  async auditFor(userId: string): Promise<Array<Record<string, unknown>>> {
    if (!UUID.test(userId)) return [];
    const { rows } = await this.pool.query(
      `select a.id, a.module_key, a.action, a.expires_at, a.created_at, p.full_name as granted_by_name,
              to_jsonb(a) -> 'allowed_sections' as allowed_sections,
              to_jsonb(a) -> 'allowed_actions' as allowed_actions
         from public.customer_module_access_audit a
         left join public.profiles p on p.id = a.granted_by
        where a.user_id = $1
        order by a.created_at desc
        limit 200`,
      [userId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      moduleKey: String(row.module_key),
      action: String(row.action),
      expiresAt: row.expires_at || null,
      createdAt: row.created_at,
      grantedBy: row.granted_by_name ? String(row.granted_by_name) : null,
      sections: idList(row.allowed_sections),
      actions: idList(row.allowed_actions),
    }));
  }

  async replaceGrants(
    actor: BuilderActor,
    userId: string,
    grants: Array<{ moduleKey: string; expiresAt?: string | null; sections?: unknown; actions?: unknown }>,
  ): Promise<CustomerModuleGrant[]> {
    if (!UUID.test(userId)) throw new CustomerModuleAccessError('INVALID_CUSTOMER', 400);
    const normalized: CustomerModuleGrant[] = [];
    for (const grant of grants) {
      const key = normalizeCustomerModuleKey(grant.moduleKey);
      if (!key) throw new CustomerModuleAccessError('INVALID_MODULE', 400);
      const scoped = sanitizeCustomerGrants({
        moduleKey: key,
        sections: grant.sections,
        actions: grant.actions,
      });
      if (!scoped.ok) throw new CustomerModuleAccessError(scoped.error, 400);
      let expiresAt: string | null = null;
      if (grant.expiresAt) {
        const parsed = Date.parse(String(grant.expiresAt));
        if (!Number.isFinite(parsed)) throw new CustomerModuleAccessError('INVALID_EXPIRY', 400);
        expiresAt = new Date(parsed).toISOString();
      }
      normalized.push({
        moduleKey: key,
        expiresAt,
        sections: scoped.sections,
        actions: scoped.actions,
      });
    }

    if (!(await this.supportsSectionActions())) {
      const scoped = normalized.some((grant) => grant.sections.length > 0 || grant.actions.length > 0);
      if (scoped) throw new CustomerModuleAccessError('PERMISSION_SCHEMA_NOT_READY', 503);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `delete from public.customer_module_access where user_id = $1`,
        [userId],
      );
      if (normalized.length > 0) {
        for (const grant of normalized) {
          await client.query(
            `insert into public.customer_module_access
               (user_id, module_key, expires_at, granted_by, allowed_sections, allowed_actions)
             values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
             on conflict (user_id, module_key) do update
               set expires_at = excluded.expires_at,
                   granted_by = excluded.granted_by,
                   allowed_sections = excluded.allowed_sections,
                   allowed_actions = excluded.allowed_actions,
                   updated_at = now()`,
            [
              userId,
              grant.moduleKey,
              grant.expiresAt,
              actor.id,
              JSON.stringify(grant.sections),
              JSON.stringify(grant.actions),
            ],
          );
        }
      }
      await client.query('COMMIT');
      return normalized;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* keep original error */ }
      logSafeError('customer-module-access', 'replace grants', error);
      throw new CustomerModuleAccessError('GRANTS_SAVE_FAILED', 503);
    } finally {
      client.release();
    }
  }

  /** True when `business_member_access.allowed_actions` exists in this database. */
  private async supportsMemberActions(): Promise<boolean> {
    if (this.memberActionsSupported !== null) return this.memberActionsSupported;
    const { rows } = await this.pool.query(
      `select count(*)::int as present
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'business_member_access'
          and column_name = 'allowed_actions'`,
    );
    this.memberActionsSupported = Number(rows[0]?.present) === 1;
    return this.memberActionsSupported;
  }

  /**
   * Copy one account's grants onto another.
   *
   * `customer` copies `customer_module_access`; `member` copies the
   * `business_member_access` row inside one business. A source with no grant
   * row means "unrestricted", which is copied by removing the target row so
   * both accounts end up in the same state.
   */
  async copyPermissions(
    actor: BuilderActor,
    input: {
      scope: 'customer' | 'member';
      fromUserId: string;
      toUserId: string;
      businessId?: string | null;
    },
  ): Promise<{ scope: 'customer' | 'member'; copiedModules: string[] }> {
    if (!UUID.test(input.fromUserId) || !UUID.test(input.toUserId)) {
      throw new CustomerModuleAccessError('INVALID_CUSTOMER', 400);
    }
    if (input.scope === 'customer') {
      const grants = await this.grantsFor(input.fromUserId);
      await this.replaceGrants(actor, input.toUserId, grants);
      return { scope: 'customer', copiedModules: grants.map((grant) => grant.moduleKey) };
    }
    const businessId = String(input.businessId || '');
    if (!UUID.test(businessId)) throw new CustomerModuleAccessError('INVALID_BUSINESS', 400);
    const memberActions = await this.supportsMemberActions();
    const source = await this.pool.query(
      `select allowed_modules, allowed_sections${memberActions ? ', allowed_actions' : ""}
         from public.business_member_access
        where business_id = $1 and user_id = $2 limit 1`,
      [businessId, input.fromUserId],
    );
    if (source.rows.length === 0) {
      await this.pool.query(
        `delete from public.business_member_access where business_id = $1 and user_id = $2`,
        [businessId, input.toUserId],
      );
      return { scope: 'member', copiedModules: [] };
    }
    const row = source.rows[0] as Record<string, unknown>;
    const modules = Array.isArray(row.allowed_modules) ? (row.allowed_modules as string[]) : null;
    if (!modules) throw new CustomerModuleAccessError('INVALID_SOURCE_SCOPE', 400);
    const sections = row.allowed_sections || {};
    const actions = row.allowed_actions || {};
    await this.pool.query(
      // allowed_modules is a text[] column, not jsonb.
      `insert into public.business_member_access
         (business_id, user_id, allowed_modules, allowed_sections${memberActions ? ', allowed_actions' : ''}, updated_by)
       values ($1, $2, $3, $4::jsonb${memberActions ? ', $5::jsonb, $6' : ', $5'})
       on conflict (business_id, user_id) do update
          set allowed_modules = excluded.allowed_modules,
              allowed_sections = excluded.allowed_sections,
              ${memberActions ? 'allowed_actions = excluded.allowed_actions,' : ''}
              updated_by = excluded.updated_by,
              updated_at = now()`,
      memberActions
        ? [businessId, input.toUserId, JSON.stringify(modules), JSON.stringify(sections), JSON.stringify(actions), actor.id]
        : [businessId, input.toUserId, JSON.stringify(modules), JSON.stringify(sections), actor.id],
    );
    await this.pool.query(
      `insert into public.business_audit_events (business_id, actor_user_id, event_type, after_state, reason)
       values ($1, $2, 'business.member_access_copied', $3, $4)`,
      [
        businessId,
        actor.id,
        JSON.stringify({ userId: input.toUserId, copiedFrom: input.fromUserId, allowedModules: modules, allowedSections: sections, allowedActions: actions }),
        'Permissions copied from another member',
      ],
    );
    return { scope: 'member', copiedModules: modules };
  }

  /**
   * Restore full access: every enabled customer module with no section or
   * action limitation, or (for a business member) no restriction row at all.
   */
  async resetToFull(
    actor: BuilderActor,
    input: { scope: 'customer' | 'member'; userId: string; businessId?: string | null },
  ): Promise<{ scope: 'customer' | 'member'; modules: string[] }> {
    if (!UUID.test(input.userId)) throw new CustomerModuleAccessError('INVALID_CUSTOMER', 400);
    if (input.scope === 'member') {
      const businessId = String(input.businessId || '');
      if (!UUID.test(businessId)) throw new CustomerModuleAccessError('INVALID_BUSINESS', 400);
      await this.pool.query(
        `delete from public.business_member_access where business_id = $1 and user_id = $2`,
        [businessId, input.userId],
      );
      await this.pool.query(
        `insert into public.business_audit_events (business_id, actor_user_id, event_type, after_state, reason)
         values ($1, $2, 'business.member_access_reset', $3, $4)`,
        [
          businessId,
          actor.id,
          JSON.stringify({ userId: input.userId, allowedModules: null }),
          'Permissions reset to full business access',
        ],
      );
      return { scope: 'member', modules: [] };
    }
    const flags = await this.listModuleFlags();
    const enabled = flags.filter((flag) => flag.is_enabled === true).map((flag) => flag.module_key);
    const modules = enabled.filter((key): key is CustomerModuleKey => normalizeCustomerModuleKey(key) !== null);
    await this.replaceGrants(
      actor,
      input.userId,
      modules.map((moduleKey) => ({ moduleKey, sections: [], actions: [] })),
    );
    return { scope: 'customer', modules };
  }

  /** Combined customer and business-member audit trail for one account. */
  async permissionHistory(userId: string): Promise<Array<Record<string, unknown>>> {
    if (!UUID.test(userId)) return [];
    const { rows } = await this.pool.query(
      `select 'customer' as scope, a.id::text as id, a.module_key, a.action, a.created_at,
              a.expires_at, p.full_name as actor_name,
              to_jsonb(a) -> 'allowed_sections' as allowed_sections,
              to_jsonb(a) -> 'allowed_actions' as allowed_actions
         from public.customer_module_access_audit a
         left join public.profiles p on p.id = a.granted_by
        where a.user_id = $1
        union all
       select 'member' as scope, e.id::text as id,
              coalesce(e.after_state ->> 'moduleType', '') as module_key,
              e.event_type as action, e.created_at, null as expires_at,
              p.full_name as actor_name,
              e.after_state -> 'allowedSections' as allowed_sections,
              e.after_state -> 'allowedActions' as allowed_actions
         from public.business_audit_events e
         left join public.profiles p on p.id = e.actor_user_id
        where e.after_state ->> 'userId' = $1::text
        order by created_at desc
        limit 200`,
      [userId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      scope: String(row.scope),
      moduleKey: String(row.module_key || ''),
      action: String(row.action || ''),
      expiresAt: row.expires_at || null,
      createdAt: row.created_at,
      actor: row.actor_name ? String(row.actor_name) : null,
      sections: idList(row.allowed_sections),
      actions: idList(row.allowed_actions),
    }));
  }

  async revokeAll(actor: BuilderActor, userId: string): Promise<void> {
    if (!UUID.test(userId)) throw new CustomerModuleAccessError('INVALID_CUSTOMER', 400);
    await this.pool.query(`delete from public.customer_module_access where user_id = $1`, [userId]);
    void actor;
  }
}

export class CustomerModuleAccessError extends Error {
  constructor(readonly code: string, readonly status: number, message: string = code) {
    super(message);
    this.name = 'CustomerModuleAccessError';
  }
}

export interface CustomerModuleAccessApiDependencies {
  repository: CustomerModuleAccessRepository | null;
  verifySession: (request: express.Request) => {
    userId?: string;
    supabaseUserId?: string;
    role?: string;
    email?: string;
  } | null;
  resolveAdminActor?: (request: express.Request) => Promise<BuilderActor | null>;
  env?: NodeJS.ProcessEnv;
}

export function registerCustomerModuleAccessApi(
  app: express.Express,
  dependencies: CustomerModuleAccessApiDependencies,
): void {
  const { repository, verifySession } = dependencies;

  const requireAdminActor = async (request: express.Request): Promise<BuilderActor | null> => {
    const claims = verifySession(request);
    if (!claims || claims.role !== 'admin') return null;
    if (dependencies.resolveAdminActor) {
      try {
        const actor = await dependencies.resolveAdminActor(request);
        if (actor) return actor;
      } catch {
        return null;
      }
    }
    return null;
  };

  const sendError = (response: express.Response, error: unknown) => {
    if (error instanceof CustomerModuleAccessError) {
      response.status(error.status).json({ ok: false, error: error.code, message: error.message });
      return;
    }
    logSafeError('customer-module-access', 'unexpected', error);
    response.status(500).json({ ok: false, error: 'CUSTOMER_MODULE_ACCESS_ERROR' });
  };

  // -- signed-in customer: authoritative module list ------------------------
  app.get('/api/customer/modules', async (request, response) => {
    const claims = verifySession(request);
    response.setHeader('cache-control', 'no-store');
    if (!claims) {
      response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    const role = String(claims.role || 'customer');
    const targetId = String(claims.supabaseUserId || claims.userId || '').trim();

    if (!repository) {
      // Local compatibility mode has no per-customer grants; expose every
      // module so local development is not broken. Production always has a DB.
      response.json({
        ok: true,
        role,
        modules: CUSTOMER_MODULE_KEYS,
        grants: [],
        source: 'compatibility',
      });
      return;
    }

    try {
      const grants = targetId ? await repository.grantsFor(targetId) : [];
      const grantRows = grants.map((g) => ({ module_key: g.moduleKey, expires_at: g.expiresAt }));
      // The RPC is the authority; the repository read only helps local tests.
      // Re-derive effective keys with the same pure helper and the global flags.
      const flags = await repository.listModuleFlags();
      const modules = effectiveModuleKeysForActor({
        role,
        accountStatus: 'active',
        grants: grantRows,
        moduleFlags: flags,
        nowIso: new Date().toISOString(),
      });
      // `modules` stays a flat key list for existing callers; `grants` carries
      // the section and action detail the navigation needs to gate fully.
      response.json({
        ok: true,
        role,
        modules,
        grants: grants.map((grant) => ({
          moduleKey: grant.moduleKey,
          expiresAt: grant.expiresAt,
          sections: grant.sections,
          actions: grant.actions,
        })),
        source: 'database',
      });
    } catch (error) {
      logSafeError('customer-module-access', 'customer modules', error);
      response.status(503).json({ ok: false, error: 'CUSTOMER_MODULES_UNAVAILABLE' });
    }
  });

  // -- signed-in customer: single module check ------------------------------
  app.post('/api/customer/modules/verify', async (request, response) => {
    const claims = verifySession(request);
    response.setHeader('cache-control', 'no-store');
    if (!claims) {
      response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    const moduleKey = String(request.body?.moduleKey || '');
    if (!isCustomerModuleKey(moduleKey)) {
      response.status(400).json({ ok: false, error: 'UNKNOWN_MODULE' });
      return;
    }
    const role = String(claims.role || 'customer');
    if (!repository) {
      response.json({ ok: true, allowed: true, moduleKey, source: 'compatibility' });
      return;
    }
    try {
      const targetId = String(claims.supabaseUserId || claims.userId || '').trim();
      const grants = targetId ? await repository.grantsFor(targetId) : [];
      const grantRows = grants.map((g) => ({ module_key: g.moduleKey, expires_at: g.expiresAt }));
      const flags = await repository.listModuleFlags();
      const result = evaluateCustomerModule(
        { role, accountStatus: 'active', grants: grantRows, moduleFlags: flags, nowIso: new Date().toISOString() },
        moduleKey,
      );
      response.status(result.allowed ? 200 : 403).json({
        ok: result.allowed,
        allowed: result.allowed,
        moduleKey,
        error: result.allowed ? undefined : result.code,
      });
    } catch (error) {
      logSafeError('customer-module-access', 'verify module', error);
      response.status(503).json({ ok: false, error: 'CUSTOMER_MODULES_UNAVAILABLE' });
    }
  });

  // -- admin: search customers ---------------------------------------------
  app.get('/api/admin/customer-module-access', async (request, response) => {
    const actor = await requireAdminActor(request);
    if (!actor) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    if (!repository) {
      response.status(503).json({ ok: false, error: 'CUSTOMER_MODULES_UNAVAILABLE' });
      return;
    }
    try {
      const result = await repository.listCustomers({
        query: typeof request.query.q === 'string' ? request.query.q : '',
        limit: Number(request.query.limit) || 50,
        offset: Number(request.query.offset) || 0,
        module: typeof request.query.module === 'string' ? request.query.module : undefined,
        granted: typeof request.query.granted === 'string' ? request.query.granted : undefined,
      });
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, ...result });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/customer-module-access/:userId', async (request, response) => {
    const actor = await requireAdminActor(request);
    if (!actor) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    if (!repository) {
      response.status(503).json({ ok: false, error: 'CUSTOMER_MODULES_UNAVAILABLE' });
      return;
    }
    try {
      const modules = await repository.grantsFor(String(request.params.userId));
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, userId: String(request.params.userId), modules });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.put('/api/admin/customer-module-access/:userId', async (request, response) => {
    const actor = await requireAdminActor(request);
    if (!actor) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    if (!repository) {
      response.status(503).json({ ok: false, error: 'CUSTOMER_MODULES_UNAVAILABLE' });
      return;
    }
    const body = (request.body || {}) as Record<string, unknown>;
    if (!Array.isArray(body.modules)) {
      response.status(400).json({ ok: false, error: 'MODULES_ARRAY_REQUIRED' });
      return;
    }
    try {
      const modules = await repository.replaceGrants(
        actor,
        String(request.params.userId),
        body.modules as Array<{ moduleKey: string; expiresAt?: string | null; sections?: unknown; actions?: unknown }>,
      );
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, userId: String(request.params.userId), modules });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.delete('/api/admin/customer-module-access/:userId', async (request, response) => {
    const actor = await requireAdminActor(request);
    if (!actor) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    if (!repository) {
      response.status(503).json({ ok: false, error: 'CUSTOMER_MODULES_UNAVAILABLE' });
      return;
    }
    try {
      await repository.revokeAll(actor, String(request.params.userId));
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, userId: String(request.params.userId), modules: [] });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/customer-module-access/:userId/audit', async (request, response) => {
    const actor = await requireAdminActor(request);
    if (!actor) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    if (!repository) {
      response.status(503).json({ ok: false, error: 'CUSTOMER_MODULES_UNAVAILABLE' });
      return;
    }
    try {
      const audit = await repository.auditFor(String(request.params.userId));
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, userId: String(request.params.userId), audit });
    } catch (error) {
      sendError(response, error);
    }
  });

  // -- admin: copy permissions between accounts -----------------------------
  app.post('/api/admin/permissions/copy', async (request, response) => {
    const actor = await requireAdminActor(request);
    if (!actor) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    if (!repository) {
      response.status(503).json({ ok: false, error: 'CUSTOMER_MODULES_UNAVAILABLE' });
      return;
    }
    const body = (request.body || {}) as Record<string, unknown>;
    const scope = body.scope === 'member' ? 'member' : 'customer';
    const fromUserId = String(body.fromUserId || '').trim();
    const toUserId = String(body.toUserId || '').trim();
    if (!fromUserId || !toUserId) {
      response.status(400).json({ ok: false, error: 'USER_IDS_REQUIRED' });
      return;
    }
    if (fromUserId === toUserId) {
      response.status(400).json({ ok: false, error: 'SAME_SOURCE_AND_TARGET' });
      return;
    }
    try {
      const result = await repository.copyPermissions(actor, {
        scope,
        fromUserId,
        toUserId,
        businessId: typeof body.businessId === 'string' ? body.businessId : null,
      });
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, ...result });
    } catch (error) {
      sendError(response, error);
    }
  });

  // -- admin: reset an account to full access -------------------------------
  app.post('/api/admin/permissions/:userId/reset', async (request, response) => {
    const actor = await requireAdminActor(request);
    if (!actor) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    if (!repository) {
      response.status(503).json({ ok: false, error: 'CUSTOMER_MODULES_UNAVAILABLE' });
      return;
    }
    const body = (request.body || {}) as Record<string, unknown>;
    const scope = body.scope === 'member' ? 'member' : 'customer';
    try {
      const result = await repository.resetToFull(actor, {
        scope,
        userId: String(request.params.userId),
        businessId: typeof body.businessId === 'string' ? body.businessId : null,
      });
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, userId: String(request.params.userId), ...result });
    } catch (error) {
      sendError(response, error);
    }
  });

  // -- admin: one account's full permission history --------------------------
  app.get('/api/admin/permissions/:userId/history', async (request, response) => {
    const actor = await requireAdminActor(request);
    if (!actor) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    if (!repository) {
      response.status(503).json({ ok: false, error: 'CUSTOMER_MODULES_UNAVAILABLE' });
      return;
    }
    try {
      const history = await repository.permissionHistory(String(request.params.userId));
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, userId: String(request.params.userId), history });
    } catch (error) {
      sendError(response, error);
    }
  });
}

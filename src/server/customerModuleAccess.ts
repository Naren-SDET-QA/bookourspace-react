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
  modules: Array<{ moduleKey: CustomerModuleKey; expiresAt: string | null }>;
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

  async listCustomers(input: { query?: string; limit?: number; offset?: number }): Promise<{
    customers: CustomerModuleRecord[];
    total: number;
  }> {
    const limit = Math.min(100, Math.max(1, Number(input.limit) || 50));
    const offset = Math.max(0, Number(input.offset) || 0);
    const query = clean(input.query).replace(/[%_]/g, (char) => `\\${char}`);
    const filter = query ? `and (p.email ilike $3 or p.full_name ilike $3)` : '';
    const params: Array<string | number> = query ? ['customer', 'active', `%${query}%`, limit, offset] : ['customer', 'active', limit, offset];
    const customerResult = await this.pool.query(
      `select p.id, p.email, p.full_name
         from public.profiles p
        where p.role = $1 and p.account_status = $2 ${filter}
        order by p.full_name asc, p.email asc
        limit $${query ? 4 : 3} offset $${query ? 5 : 4}`,
      params,
    );
    const totalResult = await this.pool.query(
      `select count(*)::int as total
         from public.profiles p
        where p.role = $1 and p.account_status = $2 ${filter}`,
      query ? ['customer', 'active', `%${query}%`] : ['customer', 'active'],
    );
    const rows = customerResult.rows as Array<{ id: string; email: string; full_name: string }>;
    const ids = rows.map((row) => String(row.id));
    const grants = ids.length
      ? await this.pool.query(
          `select user_id, module_key, expires_at
             from public.customer_module_access
            where user_id = any($1::uuid[])
            order by module_key`,
          [ids],
        )
      : { rows: [] as Array<{ user_id: string; module_key: string; expires_at: string | null }> };

    const byUser = new Map<string, Array<{ moduleKey: CustomerModuleKey; expiresAt: string | null }>>();
    for (const grant of grants.rows) {
      const key = moduleKeyOrNull(grant.module_key);
      if (!key) continue;
      const list = byUser.get(String(grant.user_id)) || [];
      list.push({ moduleKey: key, expiresAt: grant.expires_at || null });
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

  async grantsFor(userId: string): Promise<Array<{ moduleKey: CustomerModuleKey; expiresAt: string | null }>> {
    if (!UUID.test(userId)) return [];
    const { rows } = await this.pool.query(
      `select module_key, expires_at
         from public.customer_module_access
        where user_id = $1
        order by module_key`,
      [userId],
    );
    return rows
      .map((row) => ({ moduleKey: moduleKeyOrNull(row.module_key), expiresAt: row.expires_at || null }))
      .filter((row): row is { moduleKey: CustomerModuleKey; expiresAt: string | null } => row.moduleKey !== null);
  }

  async auditFor(userId: string): Promise<Array<Record<string, unknown>>> {
    if (!UUID.test(userId)) return [];
    const { rows } = await this.pool.query(
      `select a.id, a.module_key, a.action, a.expires_at, a.created_at, p.full_name as granted_by_name
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
    }));
  }

  async replaceGrants(
    actor: BuilderActor,
    userId: string,
    grants: Array<{ moduleKey: string; expiresAt?: string | null }>,
  ): Promise<Array<{ moduleKey: CustomerModuleKey; expiresAt: string | null }>> {
    if (!UUID.test(userId)) throw new CustomerModuleAccessError('INVALID_CUSTOMER', 400);
    const normalized: Array<{ moduleKey: CustomerModuleKey; expiresAt: string | null }> = [];
    for (const grant of grants) {
      const key = normalizeCustomerModuleKey(grant.moduleKey);
      if (!key) throw new CustomerModuleAccessError('INVALID_MODULE', 400);
      let expiresAt: string | null = null;
      if (grant.expiresAt) {
        const parsed = Date.parse(String(grant.expiresAt));
        if (!Number.isFinite(parsed)) throw new CustomerModuleAccessError('INVALID_EXPIRY', 400);
        expiresAt = new Date(parsed).toISOString();
      }
      normalized.push({ moduleKey: key, expiresAt });
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
            `insert into public.customer_module_access (user_id, module_key, expires_at, granted_by)
             values ($1, $2, $3, $4)
             on conflict (user_id, module_key) do update
               set expires_at = excluded.expires_at, granted_by = excluded.granted_by, updated_at = now()`,
            [userId, grant.moduleKey, grant.expiresAt, actor.id],
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
      response.json({ ok: true, role, modules, source: 'database' });
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
        body.modules as Array<{ moduleKey: string; expiresAt?: string | null }>,
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
}

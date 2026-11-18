import type express from 'express';
import { type Pool, type PoolClient } from 'pg';
import { logSafeError } from './safeLogging';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';
import type { ProviderListingActor } from './providerListingRepository';
import { GPS_MANUAL_TEST, parseGpsToggleMap } from '../lib/gpsPolicy';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_KEY = /^[a-z][a-z0-9_]{1,40}$/;

export class GpsPolicyError extends Error {
  constructor(readonly code: string, readonly httpStatus: number, message = code) {
    super(message);
    this.name = 'GpsPolicyError';
  }
}

interface GpsPolicyActor {
  id: string;
  role: 'admin' | 'super_admin';
  displayName: string;
}

export class GpsPolicyRepository {
  private readonly pool: Pool;

  constructor(
    private readonly connectionString: string,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {
    assertPostgresConnectionTarget(connectionString, environment);
    this.pool = getSharedPostgresPool(connectionString, environment);
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): GpsPolicyRepository | null {
    const url = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
    if (!url) return null;
    assertPostgresConnectionTarget(url, env);
    return new GpsPolicyRepository(url, env);
  }

  private async withActor<T>(actorId: string, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId]);
      await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)", []);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* keep original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async resolveAdmin(userId: string): Promise<GpsPolicyActor> {
    if (!UUID.test(userId)) throw new GpsPolicyError('GPS_POLICY_AUTH_REQUIRED', 401);
    const { rows } = await this.pool.query(
      `select id, role, account_status, is_super_admin, full_name, email
         from public.profiles where id = $1 limit 1`,
      [userId],
    );
    const profile = rows[0];
    if (!profile || profile.account_status !== 'active') {
      throw new GpsPolicyError('GPS_POLICY_ADMIN_REQUIRED', 403);
    }
    const role: GpsPolicyActor['role'] | '' = profile.is_super_admin === true
      ? 'super_admin'
      : profile.role === 'admin'
        ? 'admin'
        : '';
    if (!role) throw new GpsPolicyError('GPS_POLICY_ADMIN_REQUIRED', 403);
    return {
      id: String(profile.id),
      role,
      displayName: String(profile.full_name || profile.email || 'Admin'),
    };
  }

  async publicPolicy(): Promise<{
    globalEnabled: boolean;
    categories: Array<{ id: string; gpsTracking: boolean; liveMap: boolean }>;
  }> {
    const [policy, catalog] = await Promise.all([
      this.pool.query(
        `select global_enabled, coalesce(category_overrides, '{}'::jsonb) as category_overrides
           from public.service_gps_policy where id = 'global' limit 1`,
      ).catch((error) => {
        if ((error as { code?: string }).code === '42P01') return { rows: [] as Array<Record<string, unknown>> };
        throw error;
      }),
      this.pool.query(
        `select category.id,
                (version.config->'toggles'->>'gpsTracking')::boolean as gps_tracking,
                (version.config->'toggles'->>'liveMap')::boolean as live_map
           from public.service_category_configs category
           join public.service_category_config_versions version
             on version.id = category.current_version_id
          where version.status = 'published'`,
      ).catch(() => ({ rows: [] as Array<Record<string, unknown>> })),
    ]);
    const row = policy.rows[0] || {};
    const overrides = parseGpsToggleMap(row.category_overrides);
    const globalEnabled = row.global_enabled !== false;
    const seen = new Set<string>();
    const categories: Array<{ id: string; gpsTracking: boolean; liveMap: boolean }> = [];
    for (const [id, toggle] of Object.entries(overrides)) {
      seen.add(id);
      categories.push({ id, gpsTracking: toggle.gpsTracking, liveMap: toggle.liveMap });
    }
    for (const catalogRow of catalog.rows) {
      const id = String(catalogRow.id);
      if (seen.has(id)) continue;
      const gpsTracking = catalogRow.gps_tracking !== false;
      categories.push({
        id,
        gpsTracking,
        liveMap: gpsTracking && catalogRow.live_map !== false,
      });
    }
    categories.sort((a, b) => a.id.localeCompare(b.id));
    return { globalEnabled, categories };
  }

  async adminPolicy(actor: GpsPolicyActor): Promise<Record<string, unknown>> {
    return this.withActor(actor.id, async (client) => {
      const [policyResult, catalogResult, bookingCats, demoBooking] = await Promise.all([
        client.query(
          `select global_enabled, coalesce(category_overrides, '{}'::jsonb) as category_overrides,
                  updated_at, updated_by
             from public.service_gps_policy where id = 'global' limit 1`,
        ),
        client.query(
          `select category.id, category.enabled,
                  coalesce(version.config->>'name', category.id) as name,
                  (version.config->'toggles'->>'gpsTracking')::boolean as gps_tracking,
                  (version.config->'toggles'->>'liveMap')::boolean as live_map
             from public.service_category_configs category
             left join public.service_category_config_versions version
               on version.id = category.current_version_id
            order by category.id`,
        ),
        client.query(
          `select distinct category_id
             from public.service_bookings
            where category_id is not null and category_id <> ''
            order by 1`,
        ),
        client.query(
          `select id, booking_ref, status, category_id
             from public.service_bookings
            where id = $1
            limit 1`,
          [GPS_MANUAL_TEST.bookingId],
        ),
      ]);
      const policy = policyResult.rows[0] || { global_enabled: true, category_overrides: {} };
      const overrides = parseGpsToggleMap(policy.category_overrides);
      const categories: Array<Record<string, unknown>> = [];
      const seen = new Set<string>();
      for (const row of catalogResult.rows) {
        const id = String(row.id);
        seen.add(id);
        const override = overrides[id];
        const gpsTracking = override ? override.gpsTracking : row.gps_tracking !== false;
        const liveMap = override ? override.liveMap : (gpsTracking && row.live_map !== false);
        categories.push({
          id,
          name: String(row.name || id),
          catalogEnabled: row.enabled === true,
          gpsTracking,
          liveMap,
          source: override ? 'admin_override' : 'catalog',
        });
      }
      for (const row of bookingCats.rows) {
        const id = String(row.category_id);
        if (seen.has(id) || !CATEGORY_KEY.test(id)) continue;
        seen.add(id);
        const override = overrides[id];
        const gpsTracking = override ? override.gpsTracking : true;
        categories.push({
          id,
          name: id.replace(/_/g, ' '),
          catalogEnabled: false,
          gpsTracking,
          liveMap: override ? override.liveMap : gpsTracking,
          source: override ? 'admin_override' : 'listing_category',
        });
      }
      if (!seen.has(GPS_MANUAL_TEST.categoryId)) {
        const override = overrides[GPS_MANUAL_TEST.categoryId];
        categories.push({
          id: GPS_MANUAL_TEST.categoryId,
          name: 'Water can delivery',
          catalogEnabled: false,
          gpsTracking: override ? override.gpsTracking : true,
          liveMap: override ? override.liveMap : true,
          source: override ? 'admin_override' : 'listing_category',
        });
      }
      categories.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const demo = demoBooking.rows[0] || null;
      return {
        globalEnabled: policy.global_enabled !== false,
        updatedAt: policy.updated_at ? new Date(policy.updated_at).toISOString() : null,
        updatedBy: policy.updated_by ? String(policy.updated_by) : null,
        categories,
        manualTest: {
          ...GPS_MANUAL_TEST,
          bookingRef: demo?.booking_ref ? String(demo.booking_ref) : null,
          bookingStatus: demo?.status ? String(demo.status) : null,
          seeded: Boolean(demo),
        },
      };
    });
  }

  async setGlobal(actor: GpsPolicyActor, enabled: boolean): Promise<Record<string, unknown>> {
    return this.withActor(actor.id, async (client) => {
      try {
        const { rows } = await client.query('select public.admin_set_gps_global($1) as payload', [enabled]);
        return rows[0]?.payload || { ok: true, globalEnabled: enabled };
      } catch (error) {
        throw mapSqlError(error);
      }
    });
  }

  async setCategory(
    actor: GpsPolicyActor,
    categoryId: string,
    gpsTracking: boolean,
    liveMap?: boolean | null,
  ): Promise<Record<string, unknown>> {
    if (!CATEGORY_KEY.test(categoryId)) throw new GpsPolicyError('INVALID_GPS_CATEGORY', 400);
    return this.withActor(actor.id, async (client) => {
      try {
        const { rows } = await client.query(
          'select public.admin_set_category_gps($1,$2,$3) as payload',
          [categoryId, gpsTracking, liveMap ?? gpsTracking],
        );
        return rows[0]?.payload || { ok: true, categoryId, gpsTracking };
      } catch (error) {
        throw mapSqlError(error);
      }
    });
  }
}

function mapSqlError(error: unknown): GpsPolicyError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('FORBIDDEN')) return new GpsPolicyError('FORBIDDEN', 403);
  if (message.includes('UNAUTHORIZED')) return new GpsPolicyError('UNAUTHORIZED', 401);
  if (message.includes('INVALID_GPS_CATEGORY')) return new GpsPolicyError('INVALID_GPS_CATEGORY', 400);
  if (message.includes('INVALID_GPS_POLICY')) return new GpsPolicyError('INVALID_GPS_POLICY', 400);
  if (message.includes('42P01') || message.includes('does not exist')) {
    return new GpsPolicyError('GPS_POLICY_UNAVAILABLE', 503);
  }
  return new GpsPolicyError('GPS_POLICY_ERROR', 500, message.slice(0, 180));
}

export interface GpsPolicyApiDependencies {
  repository: GpsPolicyRepository | null;
  verifySession: (request: express.Request) => ProviderListingActor | null;
}

function actorId(claims: { userId?: string; supabaseUserId?: string } | null): string {
  const candidate = String(claims?.supabaseUserId || claims?.userId || '').trim();
  return UUID.test(candidate) ? candidate : '';
}

export function registerGpsPolicyApi(app: express.Express, dependencies: GpsPolicyApiDependencies): void {
  const requireRepository = (): GpsPolicyRepository => {
    if (!dependencies.repository) throw new GpsPolicyError('GPS_POLICY_UNAVAILABLE', 503);
    return dependencies.repository;
  };

  const sendError = (response: express.Response, error: unknown) => {
    if (error instanceof GpsPolicyError) {
      response.status(error.httpStatus).json({ ok: false, error: error.code });
      return;
    }
    logSafeError('gps-policy', 'unexpected', error);
    response.status(500).json({ ok: false, error: 'GPS_POLICY_ERROR' });
  };

  app.get('/api/gps-tracking/policy', async (_request, response) => {
    try {
      const policy = await requireRepository().publicPolicy();
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, ...policy });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/gps-tracking', async (request, response) => {
    try {
      const claims = dependencies.verifySession(request);
      const id = actorId(claims);
      if (!claims || !id) throw new GpsPolicyError('GPS_POLICY_AUTH_REQUIRED', 401);
      const repository = requireRepository();
      const actor = await repository.resolveAdmin(id);
      const policy = await repository.adminPolicy(actor);
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, actor, ...policy });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.put('/api/admin/gps-tracking', async (request, response) => {
    try {
      const claims = dependencies.verifySession(request);
      const id = actorId(claims);
      if (!claims || !id) throw new GpsPolicyError('GPS_POLICY_AUTH_REQUIRED', 401);
      const repository = requireRepository();
      const actor = await repository.resolveAdmin(id);
      const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
      if (typeof body.globalEnabled === 'boolean' && !body.categoryId) {
        const result = await repository.setGlobal(actor, body.globalEnabled);
        const policy = await repository.adminPolicy(actor);
        response.setHeader('cache-control', 'no-store');
        response.json({ ok: true, result, ...policy });
        return;
      }
      if (typeof body.categoryId === 'string' && typeof body.gpsTracking === 'boolean') {
        const liveMap = typeof body.liveMap === 'boolean' ? body.liveMap : body.gpsTracking;
        const result = await repository.setCategory(actor, body.categoryId, body.gpsTracking, liveMap);
        const policy = await repository.adminPolicy(actor);
        response.setHeader('cache-control', 'no-store');
        response.json({ ok: true, result, ...policy });
        return;
      }
      throw new GpsPolicyError('INVALID_GPS_POLICY', 400);
    } catch (error) {
      sendError(response, error);
    }
  });
}

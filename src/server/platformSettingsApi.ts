import { logSafeError } from './safeLogging';
import type express from 'express';
import { getSharedPostgresPool } from './postgresPool';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { BuilderError, type BuilderActor } from './platformBuilderRepository';
import type { ModuleFlagRow } from './moduleGate';
import { normalizePolicies, PolicyValidationError, type PolicyDocument } from '../lib/builder/policies';
import { findEmbeddedDataUrl } from './mediaInputGuard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODULE_KEY = /^[a-z][a-z0-9_]{1,40}$/;

const PLATFORMS = ['Web SPA', 'Android APK/Bundle (OTA)', 'iOS IPA (OTA)'];

function iso(value: unknown): string | null {
  return value ? new Date(value as string).toISOString() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface LivePageVersion {
  versionId: string;
  versionNumber: number;
  publishedAt: string | null;
  publishedBy: string | null;
  summary: string;
  platforms: string[];
  configSnapshot: Record<string, unknown>;
}

interface MarketplaceVisibilityPatch {
  popularCategoriesDisabledCities?: string[];
  disabledSubcategories?: string[];
}

function mapVersion(row: Record<string, any>): LivePageVersion {
  return {
    versionId: String(row.id),
    versionNumber: Number(row.version_number),
    publishedAt: iso(row.published_at),
    publishedBy: row.published_by ?? null,
    summary: String(row.summary ?? ''),
    platforms: PLATFORMS,
    configSnapshot: record(row.config),
  };
}

/** Published configuration in the legacy envelope the OTA clients already read. */
function mapPublished(row: Record<string, any> | undefined): (Record<string, unknown> & {
  versionId: string;
  lastPublishedAt: string | null;
}) | null {
  if (!row) return null;
  return {
    ...record(row.config),
    versionId: String(row.id),
    lastPublishedAt: iso(row.published_at),
    publishedBy: row.published_by ?? null,
  };
}

/**
 * PostgreSQL persistence for the live page configuration stream and the 17
 * admin module settings.
 *
 * The JSON compatibility store remains usable in local development, but a
 * database-backed process always answers from these tables: the role is
 * re-derived from public.profiles on every write inside the SQL functions, and
 * the browser roles cannot execute the RPCs at all.
 */
export class PlatformSettingsRepository {
  private readonly pool: ReturnType<typeof getSharedPostgresPool>;

  constructor(
    private readonly connectionString: string,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {
    assertPostgresConnectionTarget(connectionString, environment);
    this.pool = getSharedPostgresPool(connectionString, environment);
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): PlatformSettingsRepository | null {
    const url = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
    if (!url) return null;
    assertPostgresConnectionTarget(url, env);
    return new PlatformSettingsRepository(url, env);
  }

  async verifyConnection(): Promise<void> {
    await this.pool.query('select 1');
  }

  async resolveActor(userId: string): Promise<BuilderActor> {
    if (!UUID.test(userId)) throw new BuilderError('BUILDER_AUTH_REQUIRED', 401);
    let rows: Array<Record<string, any>>;
    try {
      ({ rows } = await this.pool.query(
        `select id, role, account_status, is_super_admin, full_name, email
           from public.profiles where id = $1`,
        [userId],
      ));
    } catch {
      throw new BuilderError('BUILDER_UNAVAILABLE', 503);
    }
    const profile = rows[0];
    if (!profile) throw new BuilderError('BUILDER_ADMIN_REQUIRED', 403);
    if (profile.account_status !== 'active') throw new BuilderError('BUILDER_ACCOUNT_INACTIVE', 403);
    const role: BuilderActor['role'] | '' = profile.is_super_admin === true
      ? 'super_admin'
      : profile.role === 'admin'
        ? 'admin'
        : '';
    if (!role) throw new BuilderError('BUILDER_ADMIN_REQUIRED', 403);
    return {
      id: String(profile.id),
      role,
      displayName: String(profile.full_name || profile.email || 'Administrator'),
    };
  }

  // -- live page configuration ---------------------------------------------

  async liveState() {
    const [published, draft, versions, audit] = await Promise.all([
      this.pool.query(
        `select * from public.platform_live_page_config
          where state = 'published' order by version_number desc limit 1`,
      ),
      this.pool.query(
        `select * from public.platform_live_page_config where state = 'draft' limit 1`,
      ),
      this.pool.query(
        `select * from public.platform_live_page_config order by version_number desc limit 50`,
      ),
      this.pool.query(
        `select id, actor_id, actor_role, action, summary, version_number, created_at
           from public.platform_builder_audit
          where target_key = 'live_page_config'
          order by id desc limit 50`,
      ),
    ]);
    return {
      published: mapPublished(published.rows[0]),
      publishedVersion: published.rows[0] ? mapVersion(published.rows[0]) : null,
      draft: draft.rows[0] ? record(draft.rows[0].config) : null,
      versions: versions.rows.map(mapVersion),
      auditLogs: audit.rows.map((row) => ({
        id: String(row.id),
        timestamp: iso(row.created_at),
        actor: row.actor_id,
        role: row.actor_role,
        action: row.action,
        pageId: 'all_pages',
        details: row.summary,
        versionNumber: row.version_number === null ? null : Number(row.version_number),
      })),
    };
  }

  async saveLiveDraft(actor: BuilderActor, config: unknown, summary: string): Promise<LivePageVersion> {
    const document = record(config);
    if (Object.keys(document).length === 0) throw new BuilderError('LIVE_PAGE_CONFIG_INVALID', 400);
    const inlineMediaPath = findEmbeddedDataUrl(document, 'config');
    if (inlineMediaPath) throw new BuilderError('MEDIA_OBJECT_REFERENCE_REQUIRED', 400, `Inline media is not stored in PostgreSQL (${inlineMediaPath}). Upload media to approved object storage first.`);
    try {
      const { rows } = await this.pool.query(
        `select public.platform_live_page_save_draft($1,$2::jsonb,$3) as result`,
        [actor.id, JSON.stringify(document), summary],
      );
      return mapVersion(rows[0].result);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async publishLive(actor: BuilderActor, versionId: string | null): Promise<LivePageVersion> {
    const target = versionId ? String(versionId) : null;
    if (target && !UUID.test(target)) throw new BuilderError('BUILDER_INVALID_VERSION', 400);
    try {
      const { rows } = await this.pool.query(
        `select public.platform_live_page_publish($1,$2) as result`,
        [actor.id, target],
      );
      return mapVersion(rows[0].result);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async rollbackLive(actor: BuilderActor, targetVersionId: string): Promise<LivePageVersion> {
    if (!UUID.test(targetVersionId)) throw new BuilderError('BUILDER_INVALID_VERSION', 400);
    try {
      const { rows } = await this.pool.query(
        `select public.platform_live_page_rollback($1,$2) as result`,
        [actor.id, targetVersionId],
      );
      return mapVersion(rows[0].result);
    } catch (error) {
      throw this.translate(error);
    }
  }

  /** Merge and publish a narrow visibility patch in one DB transaction. */
  async publishLiveVisibility(actor: BuilderActor, patch: MarketplaceVisibilityPatch) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("select pg_advisory_xact_lock(hashtext('live_page_config')::bigint)");
      const current = await client.query(
        `select config from public.platform_live_page_config
          where state = 'published' order by version_number desc limit 1 for update`,
      );
      const base = record(current.rows[0]?.config);
      const visibility = {
        ...record(base.visibility),
        ...patch,
      };
      const config = { ...base, visibility };
      const draft = await client.query(
        `select public.platform_live_page_save_draft($1,$2::jsonb,$3) as result`,
        [actor.id, JSON.stringify(config), 'Super Admin marketplace visibility'],
      );
      const draftRow = draft.rows[0]?.result as Record<string, any> | undefined;
      if (!draftRow?.id) throw new BuilderError('LIVE_PAGE_CONFIG_INVALID', 400);
      const published = await client.query(
        `select public.platform_live_page_publish($1,$2::uuid) as result`,
        [actor.id, String(draftRow.id)],
      );
      const state = await client.query(
        `select id, published_at, published_by, config
           from public.platform_live_page_config where id = $1 and state = 'published'`,
        [String(draftRow.id)],
      );
      await client.query('commit');
      return {
        version: mapVersion(published.rows[0].result),
        published: mapPublished(state.rows[0]),
        visibility,
      };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw this.translate(error);
    } finally {
      client.release();
    }
  }

  /** Update only public module visibility/contact fields after a fresh DB role check. */
  async updateModuleFlag(actor: BuilderActor, moduleKey: string, patch: {
    is_enabled?: boolean;
    allow_contact_owner?: boolean;
  }): Promise<ModuleFlagRow> {
    const allowed = new Set(['services', 'hotels', 'pg', 'function_hall', 'classes', 'movies', 'ecommerce']);
    if (!allowed.has(moduleKey)) throw new BuilderError('MODULE_FLAG_UNKNOWN', 404);
    const entries = Object.entries(patch);
    if (!entries.length || entries.some(([key, value]) => (
      !['is_enabled', 'allow_contact_owner'].includes(key) || typeof value !== 'boolean'
    ))) throw new BuilderError('MODULE_FLAG_PATCH_INVALID', 400);

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const profile = await client.query(
        `select role, account_status, is_super_admin
           from public.profiles where id = $1 for share`,
        [actor.id],
      );
      const row = profile.rows[0];
      if (!row || row.account_status !== 'active' || row.is_super_admin !== true) {
        throw new BuilderError('BUILDER_SUPER_ADMIN_REQUIRED', 403);
      }
      const old = await client.query(
        `select * from public.platform_module_flags where module_key = $1 for update`,
        [moduleKey],
      );
      if (!old.rows[0]) throw new BuilderError('MODULE_FLAG_UNKNOWN', 404);
      const columns = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ');
      const values = entries.map(([, value]) => value);
      const update = await client.query(
        `update public.platform_module_flags
            set ${columns}, updated_by = $${values.length + 1}, updated_at = now()
          where module_key = $${values.length + 2}
          returning module_key, is_enabled, allow_contact_owner, allow_online_booking,
                    requires_owner_approval, booking_approved_at`,
        [...values, actor.id, moduleKey],
      );
      await client.query(
        `insert into public.platform_builder_audit
          (actor_id, actor_role, action, target_kind, target_key, summary, detail)
         values ($1,'super_admin','module_visibility_updated','settings','platform_module_flags',$2,$3::jsonb)`,
        [actor.id, `Updated ${moduleKey} visibility/contact settings`, JSON.stringify({ moduleKey, patch })],
      );
      await client.query('commit');
      return update.rows[0] as ModuleFlagRow;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw this.translate(error);
    } finally {
      client.release();
    }
  }

  // -- admin module settings ----------------------------------------------

  async moduleSettings() {
    const { rows } = await this.pool.query(
      `select registry.module_key, settings.payload, settings.revision,
              settings.updated_at, settings.updated_by,
              profile.full_name, profile.email
         from public.platform_admin_module_registry registry
         left join public.platform_admin_module_settings settings
                on settings.module_key = registry.module_key
         left join public.profiles profile on profile.id = settings.updated_by
        order by registry.sort_order`,
    );
    const modules: Record<string, { payload: Record<string, unknown>; updatedBy: string | null; updatedAt: string | null; revision: number }> = {};
    for (const row of rows) {
      if (!row.payload) continue;
      modules[String(row.module_key)] = {
        payload: record(row.payload),
        updatedBy: row.full_name || row.email || null,
        updatedAt: iso(row.updated_at),
        revision: Number(row.revision ?? 0),
      };
    }
    return { supportedModules: rows.map((row) => String(row.module_key)), modules };
  }

  async saveModuleSettings(actor: BuilderActor, moduleKey: string, payload: unknown) {
    if (!MODULE_KEY.test(moduleKey)) throw new BuilderError('INVALID_MODULE_KEY', 400);
    const inlineMediaPath = findEmbeddedDataUrl(payload, 'settings');
    if (inlineMediaPath) throw new BuilderError('MEDIA_OBJECT_REFERENCE_REQUIRED', 400, `Inline media is not stored in PostgreSQL (${inlineMediaPath}). Upload media to approved object storage first.`);
    const body = record(payload);
    try {
      const { rows } = await this.pool.query(
        `select public.platform_admin_save_module_settings($1,$2,$3::jsonb) as result`,
        [actor.id, moduleKey, JSON.stringify(body)],
      );
      const row = rows[0].result as Record<string, any>;
      return {
        moduleKey,
        moduleState: {
          payload: record(row.payload),
          updatedBy: actor.displayName,
          updatedAt: iso(row.updated_at),
          revision: Number(row.revision ?? 1),
        },
      };
    } catch (error) {
      throw this.translate(error);
    }
  }

  private translate(error: unknown): never {
    if (error instanceof BuilderError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const known: Array<[string, number]> = [
      ['BUILDER_ADMIN_REQUIRED', 403],
      ['BUILDER_SUPER_ADMIN_REQUIRED', 403],
      ['BUILDER_DRAFT_NOT_FOUND', 404],
      ['BUILDER_TARGET_VERSION_NOT_FOUND', 404],
      ['ADMIN_MODULE_UNKNOWN', 404],
      ['ADMIN_MODULE_PAYLOAD_INVALID', 400],
      ['LIVE_PAGE_CONFIG_INVALID', 400],
    ];
    const match = known.find(([code]) => message.includes(code));
    if (match) throw new BuilderError(match[0], match[1], match[0]);
    throw error;
  }
}

export interface PlatformSettingsApiDependencies {
  repository: PlatformSettingsRepository | null;
  verifySession: (request: express.Request) => {
    userId?: string;
    supabaseUserId?: string;
    name?: string;
    role?: string;
  } | null;
}

function actorIdFromClaims(claims: { userId?: string; supabaseUserId?: string } | null): string {
  const candidate = String(claims?.supabaseUserId || claims?.userId || '').trim();
  return UUID.test(candidate) ? candidate : '';
}

function validateVisibilityPatch(value: unknown): MarketplaceVisibilityPatch {
  const input = record(value);
  const allowed = new Set(['popularCategoriesDisabledCities', 'disabledSubcategories']);
  if (Object.keys(input).length === 0 || Object.keys(input).some((key) => !allowed.has(key))) {
    throw new BuilderError('MARKETPLACE_VISIBILITY_INVALID', 400);
  }
  const result: MarketplaceVisibilityPatch = {};
  for (const key of allowed) {
    if (!(key in input)) continue;
    const values = input[key];
    const maxItems = key === 'disabledSubcategories' ? 300 : 100;
    if (!Array.isArray(values) || values.length > maxItems || values.some((item) => (
      typeof item !== 'string' || item.trim().length === 0 || item.trim().length > 100
    ))) throw new BuilderError('MARKETPLACE_VISIBILITY_INVALID', 400);
    const normalized = [...new Set((values as string[]).map((item) => item.trim()))];
    if (key === 'popularCategoriesDisabledCities') result.popularCategoriesDisabledCities = normalized;
    else result.disabledSubcategories = normalized;
  }
  return result;
}

/**
 * PostgreSQL-backed handlers are registered only when their repository is
 * configured. server.ts registers JSON compatibility handlers behind the
 * inverse startup guard, leaving one route owner in either mode.
 */
export function registerPlatformSettingsApi(
  app: express.Express,
  dependencies: PlatformSettingsApiDependencies,
): void {
  const { repository, verifySession } = dependencies;

  const repositoryOrFail = (): PlatformSettingsRepository => {
    if (!repository) throw new BuilderError('BUILDER_NOT_CONFIGURED', 503);
    return repository;
  };

  const actorFrom = async (request: express.Request): Promise<BuilderActor | null> => {
    const claims = verifySession(request);
    const id = actorIdFromClaims(claims);
    if (!claims || !id) return null;
    return repositoryOrFail().resolveActor(id);
  };

  const requireActor = async (request: express.Request): Promise<BuilderActor> => {
    const actor = await actorFrom(request);
    if (!actor) throw new BuilderError('BUILDER_AUTH_REQUIRED', 401);
    return actor;
  };

  const requireSuperAdmin = async (request: express.Request): Promise<BuilderActor> => {
    const actor = await requireActor(request);
    if (actor.role !== 'super_admin') throw new BuilderError('BUILDER_SUPER_ADMIN_REQUIRED', 403);
    return actor;
  };

  const sendError = (response: express.Response, error: unknown) => {
    if (error instanceof BuilderError) {
      response.status(error.status).json({ ok: false, error: error.code, message: error.message });
      return;
    }
    if (error instanceof PolicyValidationError) {
      response.status(400).json({ ok: false, error: error.code, message: error.message });
      return;
    }
    logSafeError('platform-settings', 'unexpected', error);
    response.status(500).json({ ok: false, error: 'PLATFORM_SETTINGS_ERROR' });
  };

  const otaSync = (state: { publishedVersion: LivePageVersion | null }) => ({
    web: 'synced',
    android: 'synced',
    ios: 'synced',
    activeVersion: state.publishedVersion ? state.publishedVersion.versionId : 'v1.0.0',
    lastPublishedAt: state.publishedVersion?.publishedAt ?? 'Default Baseline',
  });

  app.get('/api/live-page-config', async (request, response) => {
    try {
      const state = await repositoryOrFail().liveState();
      // This endpoint is public: an anonymous visitor and a signed-in customer
      // both get the published configuration, and neither learns whether an
      // admin session exists.
      let admin = false;
      try {
        admin = Boolean(await actorFrom(request));
      } catch {
        admin = false;
      }
      response.setHeader('cache-control', 'no-store');
      response.json({
        ok: true,
        published: state.published,
        ...(admin ? { draft: state.draft, versions: state.versions, auditLogs: state.auditLogs } : {}),
        otaSync: otaSync(state),
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/live-page-config/draft', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const body = (request.body || {}) as Record<string, unknown>;
      const version = await repositoryOrFail().saveLiveDraft(
        actor,
        body.config,
        typeof body.summary === 'string' ? body.summary : 'Saved draft changes',
      );
      const state = await repositoryOrFail().liveState();
      response.setHeader('cache-control', 'no-store');
      response.json({
        ok: true,
        draft: state.draft,
        versions: state.versions,
        auditLogs: state.auditLogs,
        savedAt: version.publishedAt ?? new Date().toISOString(),
        versionNumber: version.versionNumber,
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/live-page-config/publish', async (request, response) => {
    try {
      const actor = await requireSuperAdmin(request);
      const body = (request.body || {}) as Record<string, unknown>;
      const repository = repositoryOrFail();
      let version: LivePageVersion;
      if (body.config && typeof body.config === 'object') {
        const saved = await repository.saveLiveDraft(
          actor,
          body.config,
          typeof body.summary === 'string' ? body.summary : 'Published live page updates to Web, Android & iOS',
        );
        version = await repository.publishLive(actor, saved.versionId);
      } else {
        version = await repository.publishLive(actor, body.versionId ? String(body.versionId) : null);
      }
      const state = await repository.liveState();
      response.setHeader('cache-control', 'no-store');
      response.json({
        ok: true,
        published: state.published,
        draft: state.draft,
        versions: state.versions,
        auditLogs: state.auditLogs,
        versionId: version.versionId,
        publishedAt: version.publishedAt,
      });
    } catch (error) {
      sendError(response, error);
    }
  });


  app.get('/api/platform-settings/access', async (request, response) => {
    try {
      const actor = await actorFrom(request);
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, canManage: actor?.role === 'super_admin' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch('/api/platform-settings/module-flags/:moduleKey', async (request, response) => {
    try {
      const actor = await requireSuperAdmin(request);
      const body = record(request.body);
      const allowed = new Set(['is_enabled', 'allow_contact_owner']);
      if (Object.keys(body).length === 0 || Object.keys(body).some((key) => !allowed.has(key))) {
        throw new BuilderError('MODULE_FLAG_PATCH_INVALID', 400);
      }
      const patch: { is_enabled?: boolean; allow_contact_owner?: boolean } = {};
      if ('is_enabled' in body) {
        if (typeof body.is_enabled !== 'boolean') throw new BuilderError('MODULE_FLAG_PATCH_INVALID', 400);
        patch.is_enabled = body.is_enabled;
      }
      if ('allow_contact_owner' in body) {
        if (typeof body.allow_contact_owner !== 'boolean') throw new BuilderError('MODULE_FLAG_PATCH_INVALID', 400);
        patch.allow_contact_owner = body.allow_contact_owner;
      }
      const saved = await repositoryOrFail().updateModuleFlag(actor, String(request.params.moduleKey), patch);
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, module: saved });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/live-page-config/visibility', async (request, response) => {
    try {
      const actor = await requireSuperAdmin(request);
      const body = record(request.body);
      const patch = validateVisibilityPatch(body.visibility);
      const result = await repositoryOrFail().publishLiveVisibility(actor, patch);
      response.setHeader('cache-control', 'no-store');
      response.json({
        ok: true,
        visibility: result.visibility,
        versionId: result.version.versionId,
        versionNumber: result.version.versionNumber,
        publishedAt: result.version.publishedAt,
      });
    } catch (error) {
      sendError(response, error);
    }
  });


  // Public GET already returns the published config. This endpoint lets a
  // Super Admin persist the six category display styles centrally instead of
  // keeping them in one browser's localStorage.
  app.post('/api/live-page-config/section-styles', async (request, response) => {
    try {
      const actor = await requireSuperAdmin(request);
      const body = (request.body || {}) as Record<string, unknown>;
      const styles = body.styles && typeof body.styles === 'object' ? body.styles as Record<string, unknown> : null;
      const allowed: Record<string, string[]> = {
        pg: ['style1', 'style2', 'style3'],
        stay: ['old', 'airbnb', 'style3'],
        services: ['old', 'triangle', 'noddyy'],
        classes: ['cards', 'timetable', 'style3'],
        venues: ['showcase', 'agenda', 'style3'],
        movies: ['experience', 'classic', 'style3'],
      };
      if (!styles) throw new BuilderError('SECTION_STYLES_INVALID', 400);
      for (const key of Object.keys(styles)) {
        if (!(key in allowed) || !allowed[key].includes(String(styles[key]))) {
          throw new BuilderError('SECTION_STYLES_INVALID', 400, `Invalid style for ${key}`);
        }
      }
      const repository = repositoryOrFail();
      const state = await repository.liveState();
      const base = (state.published || {}) as Record<string, unknown>;
      const merged = {
        ...base,
        // Marks this publish as using the unified Style 1/2/3 model so older
        // defaults are not re-normalised on the next visit.
        sectionStylesVersion: 2,
        sectionStyles: { ...(typeof base.sectionStyles === 'object' ? base.sectionStyles as object : {}), ...styles },
      };
      const saved = await repository.saveLiveDraft(actor, merged, 'Super Admin section display styles');
      const version = await repository.publishLive(actor, saved.versionId);
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, okStyles: true, sectionStyles: merged.sectionStyles, versionId: version.versionId, publishedAt: version.publishedAt });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/live-page-config/rollback', async (request, response) => {
    try {
      const actor = await requireSuperAdmin(request);
      const body = (request.body || {}) as Record<string, unknown>;
      const repository = repositoryOrFail();
      const versionId = String(body.versionId || '');
      if (!versionId) throw new BuilderError('BUILDER_INVALID_VERSION', 400);
      const version = await repository.rollbackLive(actor, versionId);
      const state = await repository.liveState();
      response.setHeader('cache-control', 'no-store');
      response.json({
        ok: true,
        published: state.published,
        draft: state.draft,
        versions: state.versions,
        auditLogs: state.auditLogs,
        versionId: version.versionId,
        publishedAt: version.publishedAt,
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/modules', async (request, response) => {
    try {
      await requireActor(request);
      const settings = await repositoryOrFail().moduleSettings();
      response.setHeader('cache-control', 'no-store');
      response.json({
        ok: true,
        supportedModules: settings.supportedModules,
        moduleCount: settings.supportedModules.length,
        modules: settings.modules,
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.put('/api/admin/modules/:moduleKey', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const body = (request.body || {}) as Record<string, unknown>;
      const payload = body.payload ?? body;
      const result = await repositoryOrFail().saveModuleSettings(
        actor,
        String(request.params.moduleKey || ''),
        payload,
      );
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, ...result });
    } catch (error) {
      sendError(response, error);
    }
  });

  /**
   * Approved platform policy configuration. Admin-authenticated, server-validated
   * and stored with the other module settings. These values are advisory: the
   * server continues to compute prices, availability, refunds and permissions.
   */
  app.get('/api/admin/policies', async (request, response) => {
    try {
      await requireActor(request);
      const settings = await repositoryOrFail().moduleSettings();
      const stored = (settings.modules.app_settings?.payload as Record<string, unknown> | undefined)?.policies;
      let policies: PolicyDocument;
      try {
        policies = normalizePolicies(stored ?? {});
      } catch {
        policies = normalizePolicies({});
      }
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, policies });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.put('/api/admin/policies', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const repository = repositoryOrFail();
      const policies = normalizePolicies((request.body || {}).policies);
      const settings = await repository.moduleSettings();
      const existing = (settings.modules.app_settings?.payload as Record<string, unknown> | undefined) ?? {};
      const saved = await repository.saveModuleSettings(actor, 'app_settings', {
        ...existing,
        policies,
      });
      response.setHeader('cache-control', 'no-store');
      response.json({ ok: true, policies, revision: saved.moduleState.revision });
    } catch (error) {
      sendError(response, error);
    }
  });
}

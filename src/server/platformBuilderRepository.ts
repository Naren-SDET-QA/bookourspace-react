import { logSafeError } from './safeLogging';
import type express from 'express';
import { getSharedPostgresPool } from './postgresPool';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import {
  BUILDER_COMPONENTS,
  BUILDER_METRICS,
  builderMetric,
} from '../lib/builder/registry';
import {
  BuilderValidationError,
  normalizeEntitySchema,
  normalizePageDocument,
  normalizeRecordData,
} from '../lib/builder/validate';
import { findEmbeddedDataUrl } from './mediaInputGuard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_KEY = /^[a-z][a-z0-9_]{1,40}$/;

export type BuilderActorRole = 'admin' | 'super_admin';

export interface BuilderActor {
  id: string;
  role: BuilderActorRole;
  displayName: string;
}

export class BuilderError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string = code,
  ) {
    super(message);
    this.name = 'BuilderError';
  }
}

const SQL_ERROR_STATUS: Record<string, number> = {
  BUILDER_ADMIN_REQUIRED: 403,
  BUILDER_SUPER_ADMIN_REQUIRED: 403,
  BUILDER_VERSION_CONFLICT: 409,
  BUILDER_VERSION_IMMUTABLE: 409,
  BUILDER_DRAFT_NOT_FOUND: 404,
  BUILDER_TARGET_VERSION_NOT_FOUND: 404,
  BUILDER_RECORD_NOT_FOUND: 404,
  BUILDER_ENTITY_NOT_PUBLISHED: 409,
  BUILDER_RELATION_TARGET_UNPUBLISHED: 409,
  BUILDER_UNKNOWN_COMPONENT: 400,
  BUILDER_UNKNOWN_FIELD_TYPE: 400,
  BUILDER_INVALID_KEY: 400,
  BUILDER_KEY_MISMATCH: 400,
  BUILDER_INVALID_DOCUMENT: 400,
  BUILDER_INVALID_RECORD: 400,
  BUILDER_TOO_MANY_BLOCKS: 400,
  BUILDER_TOO_MANY_FIELDS: 400,
  BUILDER_ENTITY_FIELDS_REQUIRED: 400,
  BUILDER_NESTING_TOO_DEEP: 400,
  BUILDER_SCHEMA_UNSUPPORTED: 400,
  BUILDER_PUBLISH_TIMESTAMP_INVALID: 409,
  BUILDER_AUDIT_IMMUTABLE: 409,
};

function translateError(error: unknown): never {
  if (error instanceof BuilderValidationError) {
    throw new BuilderError(error.code, 400, error.message);
  }
  if (error instanceof BuilderError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  for (const [code, status] of Object.entries(SQL_ERROR_STATUS)) {
    if (message.includes(code)) throw new BuilderError(code, status, code);
  }
  if (message.includes('23505')) throw new BuilderError('BUILDER_CONFLICT', 409, 'conflicting write');
  throw error;
}

export interface BuilderPageView {
  pageKey: string;
  versionId: string;
  versionNumber: number;
  status: 'draft' | 'published' | 'superseded_draft';
  document: unknown;
  summary: string;
  createdAt: string;
  publishedAt: string | null;
  publishedBy: string | null;
}

function mapPageRow(row: Record<string, any>): BuilderPageView {
  return {
    pageKey: String(row.page_key),
    versionId: String(row.id),
    versionNumber: Number(row.version_number),
    status: row.status,
    document: row.document,
    summary: String(row.summary),
    createdAt: new Date(row.created_at).toISOString(),
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    publishedBy: row.published_by ?? null,
  };
}

/**
 * PostgreSQL-backed builder repository.
 *
 * All authorization is re-derived from public.profiles on every call; the role
 * in a signed session token is a routing hint, never the authority. The SQL
 * functions repeat the check, so a repository bug cannot grant admin rights.
 */
export class PlatformBuilderRepository {
  private readonly pool: ReturnType<typeof getSharedPostgresPool>;

  constructor(
    private readonly connectionString: string,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {
    this.pool = getSharedPostgresPool(this.connectionString, this.environment);
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): PlatformBuilderRepository | null {
    const url = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
    if (!url) return null;
    assertPostgresConnectionTarget(url, env);
    return new PlatformBuilderRepository(url, env);
  }

  async verifyConnection(): Promise<void> {
    await this.pool.query('select 1');
  }

  async close(): Promise<void> {
    // The pool is shared with the other repositories; server shutdown owns it.
  }

  async resolveActor(userId: string): Promise<BuilderActor> {
    if (!UUID.test(userId)) throw new BuilderError('BUILDER_AUTH_REQUIRED', 401);
    let rows;
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
    const role: BuilderActorRole =
      profile.is_super_admin === true ? 'super_admin' : profile.role === 'admin' ? 'admin' : ('' as BuilderActorRole);
    if (!role) throw new BuilderError('BUILDER_ADMIN_REQUIRED', 403);
    return {
      id: String(profile.id),
      role,
      displayName: String(profile.full_name || profile.email || 'Administrator'),
    };
  }

  // -- reads ---------------------------------------------------------------

  async listPages(): Promise<Array<{ pageKey: string; published: BuilderPageView | null; draft: BuilderPageView | null; versionCount: number }>> {
    const { rows } = await this.pool.query(
      `select page_key,
              max(version_number) filter (where status = 'published') as published_version,
              count(*)::int as version_count
         from public.platform_page_versions
        group by page_key
        order by page_key`,
    );
    const result = [] as Array<{ pageKey: string; published: BuilderPageView | null; draft: BuilderPageView | null; versionCount: number }>;
    for (const row of rows) {
      const detail = await this.pageDetail(String(row.page_key));
      result.push({ pageKey: String(row.page_key), published: detail.published, draft: detail.draft, versionCount: Number(row.version_count) });
    }
    return result;
  }

  async pageDetail(pageKey: string): Promise<{ published: BuilderPageView | null; draft: BuilderPageView | null }> {
    if (!PAGE_KEY.test(pageKey)) throw new BuilderError('BUILDER_INVALID_KEY', 400);
    const { rows } = await this.pool.query(
      `select * from public.platform_page_versions where page_key = $1
        order by version_number desc limit 2`,
      [pageKey],
    );
    const publishedRow = rows.find((row) => row.status === 'published') ?? null;
    const draftRow = rows.find((row) => row.status === 'draft') ?? null;
    return {
      published: publishedRow ? mapPageRow(publishedRow) : null,
      draft: draftRow ? mapPageRow(draftRow) : null,
    };
  }

  async publishedPage(pageKey: string): Promise<BuilderPageView | null> {
    if (!PAGE_KEY.test(pageKey)) throw new BuilderError('BUILDER_INVALID_KEY', 400);
    const { rows } = await this.pool.query(
      `select * from public.platform_page_versions
        where page_key = $1 and status = 'published'
        order by version_number desc limit 1`,
      [pageKey],
    );
    return rows[0] ? mapPageRow(rows[0]) : null;
  }

  async pageVersions(pageKey: string, limit = 30): Promise<BuilderPageView[]> {
    if (!PAGE_KEY.test(pageKey)) throw new BuilderError('BUILDER_INVALID_KEY', 400);
    const { rows } = await this.pool.query(
      `select * from public.platform_page_versions
        where page_key = $1 order by version_number desc limit $2`,
      [pageKey, Math.min(Math.max(limit, 1), 100)],
    );
    return rows.map(mapPageRow);
  }

  async savePageDraft(actor: BuilderActor, pageKey: string, document: unknown, summary: string, expectedVersion: number | null): Promise<BuilderPageView> {
    const inlineMediaPath = findEmbeddedDataUrl(document, 'page');
    if (inlineMediaPath) throw new BuilderError('MEDIA_OBJECT_REFERENCE_REQUIRED', 400, `Inline media is not stored in PostgreSQL (${inlineMediaPath}). Upload media to approved object storage first.`);
    const normalized = normalizePageDocument(document, pageKey);
    try {
      const { rows } = await this.pool.query(
        `select public.builder_save_page_draft($1,$2,$3::jsonb,$4,$5) as result`,
        [actor.id, pageKey, JSON.stringify(normalized), summary, expectedVersion],
      );
      return mapPageRow(rows[0].result);
    } catch (error) {
      translateError(error);
    }
  }

  async publishPage(actor: BuilderActor, pageKey: string, versionId: string): Promise<BuilderPageView> {
    if (!UUID.test(versionId)) throw new BuilderError('BUILDER_INVALID_VERSION', 400);
    try {
      const { rows } = await this.pool.query(
        `select public.builder_publish_page($1,$2,$3) as result`,
        [actor.id, pageKey, versionId],
      );
      return mapPageRow(rows[0].result);
    } catch (error) {
      translateError(error);
    }
  }

  async rollbackPage(actor: BuilderActor, pageKey: string, targetVersionId: string): Promise<BuilderPageView> {
    if (!UUID.test(targetVersionId)) throw new BuilderError('BUILDER_INVALID_VERSION', 400);
    try {
      const { rows } = await this.pool.query(
        `select public.builder_rollback_page($1,$2,$3) as result`,
        [actor.id, pageKey, targetVersionId],
      );
      return mapPageRow(rows[0].result);
    } catch (error) {
      translateError(error);
    }
  }

  // -- entities ------------------------------------------------------------

  async listEntities(): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `select entity.key, entity.label, entity.module, entity.status, entity.updated_at,
              version.id as current_version_id, version.version_number,
              (select count(*)::int from public.platform_entity_records record
                where record.entity_key = entity.key and record.status = 'active') as record_count,
              (select count(*)::int from public.platform_entity_versions draft
                where draft.entity_key = entity.key and draft.status = 'draft') as draft_count
         from public.platform_entities entity
         left join public.platform_entity_versions version on version.id = entity.current_version_id
        order by entity.key`,
    );
    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      module: row.module,
      status: row.status,
      updatedAt: row.updated_at,
      currentVersionId: row.current_version_id,
      versionNumber: row.version_number,
      recordCount: Number(row.record_count),
      hasDraft: Number(row.draft_count) > 0,
    }));
  }

  async publishedEntity(entityKey: string): Promise<{ key: string; schema: unknown; versionNumber: number } | null> {
    if (!PAGE_KEY.test(entityKey)) throw new BuilderError('BUILDER_INVALID_KEY', 400);
    const { rows } = await this.pool.query(
      `select entity.key, version.schema, version.version_number
         from public.platform_entities entity
         join public.platform_entity_versions version on version.id = entity.current_version_id
        where entity.key = $1 and entity.status = 'published'`,
      [entityKey],
    );
    if (!rows[0]) return null;
    return { key: rows[0].key, schema: rows[0].schema, versionNumber: Number(rows[0].version_number) };
  }

  async entityVersions(entityKey: string): Promise<Array<Record<string, unknown>>> {
    if (!PAGE_KEY.test(entityKey)) throw new BuilderError('BUILDER_INVALID_KEY', 400);
    const { rows } = await this.pool.query(
      `select id, version_number, status, schema, summary, created_at, published_at
         from public.platform_entity_versions where entity_key = $1
        order by version_number desc limit 30`,
      [entityKey],
    );
    return rows.map((row) => ({
      versionId: row.id,
      versionNumber: Number(row.version_number),
      status: row.status,
      schema: row.schema,
      summary: row.summary,
      createdAt: row.created_at,
      publishedAt: row.published_at,
    }));
  }

  async entityDraft(entityKey: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.pool.query(
      `select id, version_number, schema, summary, created_at
         from public.platform_entity_versions
        where entity_key = $1 and status = 'draft' order by version_number desc limit 1`,
      [entityKey],
    );
    return rows[0] ?? null;
  }

  async saveEntityDraft(actor: BuilderActor, entityKey: string, schema: unknown, summary: string, expectedVersion: number | null): Promise<Record<string, unknown>> {
    const inlineMediaPath = findEmbeddedDataUrl(schema, 'schema');
    if (inlineMediaPath) throw new BuilderError('MEDIA_OBJECT_REFERENCE_REQUIRED', 400, `Inline media is not stored in PostgreSQL (${inlineMediaPath}). Upload media to approved object storage first.`);
    const normalized = normalizeEntitySchema(schema, entityKey);
    try {
      const { rows } = await this.pool.query(
        `select public.builder_save_entity_draft($1,$2,$3::jsonb,$4,$5) as result`,
        [actor.id, entityKey, JSON.stringify(normalized), summary, expectedVersion],
      );
      return rows[0].result;
    } catch (error) {
      translateError(error);
    }
  }

  async publishEntity(actor: BuilderActor, entityKey: string, versionId: string): Promise<Record<string, unknown>> {
    if (!UUID.test(versionId)) throw new BuilderError('BUILDER_INVALID_VERSION', 400);
    try {
      const { rows } = await this.pool.query(
        `select public.builder_publish_entity($1,$2,$3) as result`,
        [actor.id, entityKey, versionId],
      );
      return rows[0].result;
    } catch (error) {
      translateError(error);
    }
  }

  async rollbackEntity(actor: BuilderActor, entityKey: string, targetVersionId: string): Promise<Record<string, unknown>> {
    if (!PAGE_KEY.test(entityKey)) throw new BuilderError('BUILDER_INVALID_KEY', 400);
    if (!UUID.test(targetVersionId)) throw new BuilderError('BUILDER_INVALID_VERSION', 400);
    try {
      const { rows } = await this.pool.query(
        `select public.builder_rollback_entity($1,$2,$3) as result`,
        [actor.id, entityKey, targetVersionId],
      );
      return rows[0].result as Record<string, unknown>;
    } catch (error) {
      translateError(error);
    }
  }

  async listRecords(entityKey: string, limit = 50): Promise<Array<Record<string, unknown>>> {
    if (!PAGE_KEY.test(entityKey)) throw new BuilderError('BUILDER_INVALID_KEY', 400);
    const { rows } = await this.pool.query(
      `select id, data, status, revision, created_at, updated_at
         from public.platform_entity_records
        where entity_key = $1 and status = 'active'
        order by created_at desc limit $2`,
      [entityKey, Math.min(Math.max(limit, 1), 200)],
    );
    return rows.map((row) => ({
      id: row.id,
      data: row.data,
      status: row.status,
      revision: Number(row.revision),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async upsertRecord(actor: BuilderActor, entityKey: string, recordId: string | null, data: unknown): Promise<Record<string, unknown>> {
    const inlineMediaPath = findEmbeddedDataUrl(data, 'record');
    if (inlineMediaPath) throw new BuilderError('MEDIA_OBJECT_REFERENCE_REQUIRED', 400, `Inline media is not stored in PostgreSQL (${inlineMediaPath}). Upload media to approved object storage first.`);
    const published = await this.publishedEntity(entityKey);
    if (!published) throw new BuilderError('BUILDER_ENTITY_NOT_PUBLISHED', 409);
    const schema = normalizeEntitySchema(published.schema, entityKey);
    const normalized = normalizeRecordData(schema, data);
    if (recordId && !UUID.test(recordId)) throw new BuilderError('BUILDER_INVALID_RECORD', 400);
    try {
      const { rows } = await this.pool.query(
        `select public.builder_upsert_record($1,$2,$3,$4::jsonb) as result`,
        [actor.id, entityKey, recordId, JSON.stringify(normalized)],
      );
      return rows[0].result;
    } catch (error) {
      translateError(error);
    }
  }

  async archiveRecord(actor: BuilderActor, entityKey: string, recordId: string): Promise<Record<string, unknown>> {
    if (!UUID.test(recordId)) throw new BuilderError('BUILDER_INVALID_RECORD', 400);
    try {
      const { rows } = await this.pool.query(
        `select public.builder_archive_record($1,$2,$3) as result`,
        [actor.id, entityKey, recordId],
      );
      return rows[0].result;
    } catch (error) {
      translateError(error);
    }
  }

  // -- reports -------------------------------------------------------------

  async report(metricId: string): Promise<{ metric: string; generatedAt: string; rows: Array<Record<string, unknown>> }> {
    const metric = builderMetric(metricId);
    if (!metric) throw new BuilderError('BUILDER_UNKNOWN_METRIC', 400);
    const queries: Record<string, string> = {
      listings_by_module: `select coalesce(category_id, 'uncategorised') as module, count(*)::int as listings
                             from public.listings where status = 'published'
                            group by 1 order by listings desc limit 50`,
      providers: `select coalesce(role, 'unknown') as role, coalesce(account_status, 'unknown') as status,
                         count(*)::int as accounts
                    from public.profiles group by 1,2 order by accounts desc limit 50`,
      service_bookings: `select coalesce(status, 'unknown') as status, count(*)::int as bookings,
                                coalesce(sum(amount), 0)::numeric(14,2) as gross_amount
                           from public.service_bookings group by 1 order by bookings desc limit 50`,
      refunds: `select coalesce(payment_status, 'unknown') as payment_status, count(*)::int as bookings,
                       coalesce(sum(amount), 0)::numeric(14,2) as amount
                  from public.service_bookings
                 where payment_status in ('refunded','partially_refunded','refund_pending')
                 group by 1 limit 50`,
      reviews: `select rating, count(*)::int as reviews from public.service_reviews
                 where is_published = true group by 1 order by rating desc`,
      user_growth: `select to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
                           coalesce(role, 'unknown') as role, count(*)::int as profiles
                      from public.profiles group by 1,2 order by month desc, role limit 120`,
      module_performance: `select coalesce(listing.category_id, 'uncategorised') as module,
                                  count(distinct listing.id)::int as listings,
                                  count(distinct listing.owner_id)::int as owners
                             from public.listings listing
                            where listing.status = 'published'
                            group by 1 order by listings desc limit 50`,
    };
    const sql = queries[metric.id];
    if (!sql) throw new BuilderError('BUILDER_UNKNOWN_METRIC', 400);
    try {
      const { rows } = await this.pool.query(sql);
      return { metric: metric.id, generatedAt: new Date().toISOString(), rows: rows as Array<Record<string, unknown>> };
    } catch (error) {
      // A report over a table the deployment has not created yet is a 503, not
      // a fabricated empty dashboard.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('does not exist')) throw new BuilderError('BUILDER_METRIC_UNAVAILABLE', 503);
      throw error;
    }
  }

  async auditLog(limit = 100): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `select id, actor_id, actor_role, action, target_kind, target_key, version_number,
              summary, detail, created_at
         from public.platform_builder_audit order by id desc limit $1`,
      [Math.min(Math.max(limit, 1), 200)],
    );
    return rows;
  }

}

export interface PlatformBuilderApiDependencies {
  repository: PlatformBuilderRepository | null;
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

export function registerPlatformBuilderApi(app: express.Express, deps: PlatformBuilderApiDependencies): void {
  const { repository, verifySession } = deps;

  const requireRepository = (): PlatformBuilderRepository => {
    if (!repository) throw new BuilderError('BUILDER_NOT_CONFIGURED', 503);
    return repository;
  };

  const requireActor = async (request: express.Request): Promise<BuilderActor> => {
    const claims = verifySession(request);
    const id = actorIdFromClaims(claims);
    if (!claims || !id) throw new BuilderError('BUILDER_AUTH_REQUIRED', 401);
    return requireRepository().resolveActor(id);
  };

  const sendError = (response: express.Response, error: unknown) => {
    if (error instanceof BuilderError) {
      response.status(error.status).json({ ok: false, error: error.code, message: error.message });
      return;
    }
    if (error instanceof BuilderValidationError) {
      response.status(400).json({ ok: false, error: error.code, message: error.message });
      return;
    }
    logSafeError('builder', 'unexpected', error);
    response.status(500).json({ ok: false, error: 'BUILDER_INTERNAL_ERROR' });
  };

  const publicHeaders = (response: express.Response, version: number) => {
    response.setHeader('cache-control', 'public, max-age=30, stale-while-revalidate=300');
    response.setHeader('etag', `W/"builder-${version}"`);
  };
  const privateHeaders = (response: express.Response) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('vary', 'authorization, x-bos-session-token');
  };

  app.get('/api/builder/registry', (_request, response) => {
    response.setHeader('cache-control', 'public, max-age=300');
    response.json({
      ok: true,
      registry: {
        schemaVersion: 1,
        components: builderComponentList(),
        metrics: BUILDER_METRICS,
      },
    });
  });

  app.get('/api/builder/pages', async (request, response) => {
    try {
      const actor = await requireActor(request);
      privateHeaders(response);
      response.json({ ok: true, actor, pages: await requireRepository().listPages() });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/builder/pages/:key', async (request, response) => {
    try {
      const mode = String(request.query.mode || 'published');
      const pageKey = String(request.params.key || '');
      if (mode === 'draft' || mode === 'admin') {
        const actor = await requireActor(request);
        privateHeaders(response);
        const detail = await requireRepository().pageDetail(pageKey);
        response.json({ ok: true, actor, ...detail, versions: await requireRepository().pageVersions(pageKey) });
        return;
      }
      const page = await requireRepository().publishedPage(pageKey);
      if (!page) {
        response.status(404).json({ ok: false, error: 'BUILDER_PAGE_NOT_FOUND' });
        return;
      }
      publicHeaders(response, page.versionNumber);
      response.json({ ok: true, page });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/builder/pages/:key/versions', async (request, response) => {
    try {
      await requireActor(request);
      privateHeaders(response);
      response.json({ ok: true, versions: await requireRepository().pageVersions(String(request.params.key || '')) });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/builder/pages/:key/draft', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const body = (request.body || {}) as Record<string, unknown>;
      const expected = body.expectedVersion === null || body.expectedVersion === undefined
        ? null
        : Number(body.expectedVersion);
      if (expected !== null && (!Number.isSafeInteger(expected) || expected < 0)) {
        throw new BuilderError('BUILDER_INVALID_VERSION', 400);
      }
      const summary = typeof body.summary === 'string' ? body.summary : 'Saved draft';
      const page = await requireRepository().savePageDraft(
        actor,
        String(request.params.key || ''),
        body.document,
        summary,
        expected,
      );
      privateHeaders(response);
      response.json({ ok: true, page });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/builder/pages/:key/publish', async (request, response) => {
    try {
      const actor = await requireActor(request);
      if (actor.role !== 'super_admin') throw new BuilderError('BUILDER_SUPER_ADMIN_REQUIRED', 403);
      const versionId = String((request.body || {}).versionId || '');
      const page = await requireRepository().publishPage(actor, String(request.params.key || ''), versionId);
      privateHeaders(response);
      response.json({ ok: true, page });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/builder/pages/:key/rollback', async (request, response) => {
    try {
      const actor = await requireActor(request);
      if (actor.role !== 'super_admin') throw new BuilderError('BUILDER_SUPER_ADMIN_REQUIRED', 403);
      const target = String((request.body || {}).targetVersionId || '');
      const page = await requireRepository().rollbackPage(actor, String(request.params.key || ''), target);
      privateHeaders(response);
      response.json({ ok: true, page });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/builder/entities', async (request, response) => {
    try {
      await requireActor(request);
      privateHeaders(response);
      response.json({ ok: true, entities: await requireRepository().listEntities() });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/builder/entities/:key', async (request, response) => {
    try {
      const entityKey = String(request.params.key || '');
      const mode = String(request.query.mode || 'published');
      if (mode === 'draft' || mode === 'admin') {
        await requireActor(request);
        privateHeaders(response);
        const draft = await requireRepository().entityDraft(entityKey);
        response.json({
          ok: true,
          published: await requireRepository().publishedEntity(entityKey),
          draft: draft ? { versionId: draft.id, versionNumber: Number(draft.version_number), schema: draft.schema, summary: draft.summary, createdAt: draft.created_at } : null,
          versions: await requireRepository().entityVersions(entityKey),
        });
        return;
      }
      const entity = await requireRepository().publishedEntity(entityKey);
      if (!entity) {
        response.status(404).json({ ok: false, error: 'BUILDER_ENTITY_NOT_FOUND' });
        return;
      }
      publicHeaders(response, entity.versionNumber);
      response.json({
        ok: true,
        entity,
        // The read scope is part of the published schema. Records are never
        // exposed publicly unless the schema says they are public.
        recordsAllowed: ['public', 'authenticated'].includes(
          String((entity.schema as any)?.permissions?.read || 'authenticated'),
        ),
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/builder/entities/:key/draft', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const body = (request.body || {}) as Record<string, unknown>;
      const expected = body.expectedVersion === null || body.expectedVersion === undefined ? null : Number(body.expectedVersion);
      if (expected !== null && (!Number.isSafeInteger(expected) || expected < 0)) {
        throw new BuilderError('BUILDER_INVALID_VERSION', 400);
      }
      const version = await requireRepository().saveEntityDraft(
        actor,
        String(request.params.key || ''),
        body.schema,
        typeof body.summary === 'string' ? body.summary : 'Saved module draft',
        expected,
      );
      privateHeaders(response);
      response.json({ ok: true, version });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/builder/entities/:key/publish', async (request, response) => {
    try {
      const actor = await requireActor(request);
      if (actor.role !== 'super_admin') throw new BuilderError('BUILDER_SUPER_ADMIN_REQUIRED', 403);
      const versionId = String((request.body || {}).versionId || '');
      const version = await requireRepository().publishEntity(actor, String(request.params.key || ''), versionId);
      privateHeaders(response);
      response.json({ ok: true, version });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/builder/entities/:key/rollback', async (request, response) => {
    try {
      const actor = await requireActor(request);
      if (actor.role !== 'super_admin') throw new BuilderError('BUILDER_SUPER_ADMIN_REQUIRED', 403);
      const target = String((request.body || {}).targetVersionId || '');
      const version = await requireRepository().rollbackEntity(
        actor,
        String(request.params.key || ''),
        target,
      );
      privateHeaders(response);
      response.json({ ok: true, version });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/builder/entities/:key/records', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const entity = await requireRepository().publishedEntity(String(request.params.key || ''));
      if (!entity) throw new BuilderError('BUILDER_ENTITY_NOT_PUBLISHED', 409);
      const schema = normalizeEntitySchema(entity.schema, String(request.params.key || ''));
      if (schema.permissions.read === 'public' && actor.role !== 'super_admin' && actor.role !== 'admin') {
        throw new BuilderError('BUILDER_ADMIN_REQUIRED', 403);
      }
      privateHeaders(response);
      response.json({ ok: true, records: await requireRepository().listRecords(String(request.params.key || '')) });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/builder/entities/:key/records', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const body = (request.body || {}) as Record<string, unknown>;
      const record = await requireRepository().upsertRecord(
        actor,
        String(request.params.key || ''),
        body.recordId ? String(body.recordId) : null,
        body.data,
      );
      privateHeaders(response);
      response.json({ ok: true, record });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/builder/entities/:key/records/:id/archive', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const record = await requireRepository().archiveRecord(actor, String(request.params.key || ''), String(request.params.id || ''));
      privateHeaders(response);
      response.json({ ok: true, record });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/builder/reports/:metric', async (request, response) => {
    try {
      const actor = await requireActor(request);
      privateHeaders(response);
      response.json({ ok: true, actor, report: await requireRepository().report(String(request.params.metric || '')) });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/builder/audit', async (request, response) => {
    try {
      await requireActor(request);
      const limit = Number(request.query.limit || 100);
      privateHeaders(response);
      response.json({ ok: true, entries: await requireRepository().auditLog(Number.isFinite(limit) ? limit : 100) });
    } catch (error) {
      sendError(response, error);
    }
  });
}

function builderComponentList() {
  return BUILDER_COMPONENTS;
}

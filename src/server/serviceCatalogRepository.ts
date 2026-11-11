import { logSafeError } from './safeLogging';
import type express from 'express';
import { type Pool } from 'pg';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';
import type { ProviderListingActor } from './providerListingRepository';
import {
  normalizeServiceCategoryConfig,
  normalizePublicServiceCategory,
  type PublicServiceCategory,
  type ServiceCategoryAdminView,
  type ServiceCategoryConfig,
  type ServiceCategoryVersionView,
  type ServiceCredentialType,
  type ServiceCredentialView,
  type PendingServiceDocumentView,
} from '../lib/serviceCatalog';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_KEY = /^[a-z][a-z0-9_]{1,40}$/;
const TENANT = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export type ServiceCatalogActorRole = 'super_admin' | 'admin';

export interface ServiceCatalogActor {
  id: string;
  role: ServiceCatalogActorRole;
  displayName: string;
}

export interface ServiceCatalogAuditView {
  id: number;
  tenantId: string;
  categoryId: string;
  versionNumber: number | null;
  actorId: string | null;
  actorRole: string;
  action: string;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: string;
}


export class ServiceCatalogRepositoryError extends Error {
  constructor(readonly code: string, readonly httpStatus: number, message: string = code) {
    super(message);
    this.name = 'ServiceCatalogRepositoryError';
  }
}

function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function iso(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : value ? String(value) : null;
}

function translateError(error: unknown): never {
  if (error instanceof ServiceCatalogRepositoryError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  const status: Record<string, number> = {
    SERVICE_CATALOG_SUPER_ADMIN_REQUIRED: 403,
    SERVICE_CATALOG_ADMIN_REQUIRED: 403,
    SERVICE_CATALOG_AUTH_REQUIRED: 401,
    SERVICE_CATALOG_NOT_FOUND: 404,
    SERVICE_CATALOG_VERSION_NOT_FOUND: 404,
    SERVICE_CATALOG_VERSION_NOT_DRAFT: 409,
    SERVICE_CATALOG_VERSION_CONFLICT: 409,
    SERVICE_CATALOG_VERSION_IMMUTABLE: 409,
    SERVICE_CATALOG_TENANT_MISMATCH: 409,
    SERVICE_CATALOG_REASON_REQUIRED: 400,
    SERVICE_CATALOG_REVIEW_NOTE_REQUIRED: 400,
    SERVICE_CATALOG_INVALID_REVIEW_STATUS: 400,
    SERVICE_CATALOG_INVALID_KEY: 400,
    SERVICE_CATALOG_INVALID_TENANT: 400,
    SERVICE_DOCUMENT_NOT_FOUND: 404,
    SERVICE_CREDENTIAL_NOT_FOUND: 404,
    SERVICE_CATALOG_UNAVAILABLE: 503,
  };
  for (const [code, httpStatus] of Object.entries(status)) {
    if (message.includes(code)) throw new ServiceCatalogRepositoryError(code, httpStatus);
  }
  if (message.includes('23505')) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_CONFLICT', 409);
  if (message.includes('42501')) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_FORBIDDEN', 403);
  if (message.startsWith('SERVICE_CATALOG_') || message.startsWith('SERVICE_')) {
    throw new ServiceCatalogRepositoryError(message, 400);
  }
  throw error;
}

function mapVersion(row: Record<string, any>): ServiceCategoryVersionView {
  let config: ServiceCategoryConfig;
  try {
    config = normalizeServiceCategoryConfig(String(row.category_id), row.config);
  } catch {
    config = row.config as ServiceCategoryConfig;
  }
  return {
    versionId: String(row.id),
    versionNumber: Number(row.version_number),
    status: row.status,
    config,
    summary: String(row.summary || ''),
    createdAt: iso(row.created_at) || '',
    publishedAt: iso(row.published_at),
    publishedBy: row.published_by ? String(row.published_by) : null,
    sourceVersionId: row.source_version_id ? String(row.source_version_id) : null,
  };
}

export class ServiceCatalogRepository {
  private readonly pool: Pool;
  readonly tenantId: string;

  constructor(connectionString: string, environment: NodeJS.ProcessEnv = process.env) {
    assertPostgresConnectionTarget(connectionString, environment);
    this.pool = getSharedPostgresPool(connectionString, environment);
    const tenant = String(environment.BOS_SERVICE_TENANT_ID || 'default').trim() || 'default';
    if (!TENANT.test(tenant)) throw new Error('BOS_SERVICE_TENANT_ID_INVALID');
    this.tenantId = tenant;
  }

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): ServiceCatalogRepository | null {
    const connectionString = String(environment.BOS_LISTINGS_DATABASE_URL || '').trim();
    if (!connectionString) return null;
    assertPostgresConnectionTarget(connectionString, environment);
    return new ServiceCatalogRepository(connectionString, environment);
  }

  async verifyConnection(): Promise<void> {
    await this.pool.query('select 1');
  }

  async close(): Promise<void> {
    // Shared pool; process shutdown owns it.
  }

  async resolveActor(userId: string): Promise<ServiceCatalogActor> {
    if (!UUID.test(userId)) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_AUTH_REQUIRED', 401);
    const { rows } = await this.pool.query(
      `select id, role, account_status, is_super_admin, full_name, email
         from public.profiles where id = $1 limit 1`,
      [userId],
    );
    const profile = rows[0];
    if (!profile) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_ADMIN_REQUIRED', 403);
    if (profile.account_status !== 'active') throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_ACCOUNT_INACTIVE', 403);
    const role: ServiceCatalogActorRole | null = profile.is_super_admin === true
      ? 'super_admin'
      : profile.role === 'admin' ? 'admin' : null;
    if (!role) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_ADMIN_REQUIRED', 403);
    return {
      id: String(profile.id),
      role,
      displayName: String(profile.full_name || profile.email || 'Administrator'),
    };
  }

  private requireSuperAdmin(actor: ServiceCatalogActor): void {
    if (actor.role !== 'super_admin') {
      throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_SUPER_ADMIN_REQUIRED', 403);
    }
  }

  private requireAdmin(actor: ServiceCatalogActor): void {
    if (actor.role !== 'super_admin' && actor.role !== 'admin') {
      throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_ADMIN_REQUIRED', 403);
    }
  }

  async listPublic(): Promise<PublicServiceCategory[]> {
    const { rows } = await this.pool.query(
      `select category.id, category.tenant_id, category.enabled, version.version_number, version.config
         from public.service_category_configs category
         join public.service_category_config_versions version
           on version.id = category.current_version_id
        where category.tenant_id = $1
          and category.enabled = true
          and version.status = 'published'
        order by category.id`,
      [this.tenantId],
    );
    return rows
      .map((row) => normalizePublicServiceCategory({
        id: row.id,
        tenantId: row.tenant_id,
        enabled: row.enabled,
        versionNumber: row.version_number,
        config: row.config,
      }))
      .filter((value): value is PublicServiceCategory => Boolean(value));
  }

  async publishedCategory(categoryId: string): Promise<PublicServiceCategory | null> {
    if (!CATEGORY_KEY.test(categoryId)) return null;
    const { rows } = await this.pool.query(
      `select category.id, category.tenant_id, category.enabled, version.version_number, version.config
         from public.service_category_configs category
         join public.service_category_config_versions version
           on version.id = category.current_version_id
        where category.tenant_id = $1 and category.id = $2
          and category.enabled = true and version.status = 'published'
        limit 1`,
      [this.tenantId, categoryId],
    );
    return rows[0] ? normalizePublicServiceCategory({
      id: rows[0].id,
      tenantId: rows[0].tenant_id,
      enabled: rows[0].enabled,
      versionNumber: rows[0].version_number,
      config: rows[0].config,
    }) : null;
  }

  async listAdmin(actor: ServiceCatalogActor): Promise<ServiceCategoryAdminView[]> {
    this.requireAdmin(actor);
    const { rows } = await this.pool.query(
      `select id, tenant_id, enabled, current_version_id, updated_at
         from public.service_category_configs
        where tenant_id = $1 order by id`,
      [this.tenantId],
    );
    const views: ServiceCategoryAdminView[] = [];
    for (const row of rows) {
      views.push(await this.adminDetailForRow(actor, row));
    }
    return views;
  }

  async adminDetail(actor: ServiceCatalogActor, categoryId: string): Promise<ServiceCategoryAdminView> {
    this.requireAdmin(actor);
    if (!CATEGORY_KEY.test(categoryId)) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_KEY', 400);
    const { rows } = await this.pool.query(
      `select id, tenant_id, enabled, current_version_id, updated_at
         from public.service_category_configs
        where tenant_id = $1 and id = $2 limit 1`,
      [this.tenantId, categoryId],
    );
    if (!rows[0]) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_NOT_FOUND', 404);
    return this.adminDetailForRow(actor, rows[0]);
  }

  private async adminDetailForRow(actor: ServiceCatalogActor, row: Record<string, any>): Promise<ServiceCategoryAdminView> {
    const { rows: versions } = await this.pool.query(
      `select * from public.service_category_config_versions
        where category_id = $1 and tenant_id = $2
        order by version_number desc limit 50`,
      [String(row.id), this.tenantId],
    );
    const mapped = versions.map(mapVersion);
    const published = mapped.find((version) => version.status === 'published') || null;
    const draft = mapped.find((version) => version.status === 'draft') || null;
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      enabled: Boolean(row.enabled),
      currentVersionNumber: published?.versionNumber ?? null,
      published,
      draft,
      versions: mapped,
      updatedAt: iso(row.updated_at) || '',
    };
  }

  async saveDraft(
    actor: ServiceCatalogActor,
    categoryId: string,
    config: unknown,
    summary: string,
    expectedVersion: number | null,
  ): Promise<ServiceCategoryVersionView> {
    this.requireSuperAdmin(actor);
    if (!CATEGORY_KEY.test(categoryId)) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_KEY', 400);
    const normalized = normalizeServiceCategoryConfig(categoryId, config);
    try {
      const { rows } = await this.pool.query(
        `select public.service_catalog_save_draft($1,$2,$3,$4::jsonb,$5,$6) as result`,
        [actor.id, this.tenantId, categoryId, JSON.stringify(normalized), summary, expectedVersion],
      );
      const result = rows[0]?.result;
      return mapVersion({
        id: result.versionId,
        category_id: categoryId,
        version_number: result.versionNumber,
        status: result.status,
        config: result.config,
        summary: result.summary,
        created_at: result.createdAt,
      });
    } catch (error) {
      translateError(error);
    }
  }

  async publish(actor: ServiceCatalogActor, categoryId: string, versionId: string): Promise<ServiceCategoryVersionView> {
    this.requireSuperAdmin(actor);
    if (!CATEGORY_KEY.test(categoryId)) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_KEY', 400);
    if (!UUID.test(versionId)) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_VERSION_NOT_FOUND', 404);
    try {
      const { rows } = await this.pool.query(
        `select public.service_catalog_publish($1,$2,$3,$4) as result`,
        [actor.id, this.tenantId, categoryId, versionId],
      );
      const result = rows[0]?.result;
      return mapVersion({
        id: result.versionId,
        category_id: categoryId,
        version_number: result.versionNumber,
        status: result.status,
        config: result.config,
        summary: result.summary,
        published_at: result.publishedAt,
      });
    } catch (error) {
      translateError(error);
    }
  }

  async rollback(actor: ServiceCatalogActor, categoryId: string, targetVersionId: string): Promise<ServiceCategoryVersionView> {
    this.requireSuperAdmin(actor);
    if (!CATEGORY_KEY.test(categoryId)) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_KEY', 400);
    if (!UUID.test(targetVersionId)) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_VERSION_NOT_FOUND', 404);
    try {
      const { rows } = await this.pool.query(
        `select public.service_catalog_rollback($1,$2,$3,$4) as result`,
        [actor.id, this.tenantId, categoryId, targetVersionId],
      );
      const result = rows[0]?.result;
      return mapVersion({
        id: result.versionId,
        category_id: categoryId,
        version_number: result.versionNumber,
        status: result.status,
        config: result.config,
        summary: result.summary,
        published_at: result.publishedAt,
      });
    } catch (error) {
      translateError(error);
    }
  }

  async setEnabled(actor: ServiceCatalogActor, categoryId: string, enabled: boolean, reason: string): Promise<{ categoryId: string; enabled: boolean }> {
    this.requireSuperAdmin(actor);
    if (!CATEGORY_KEY.test(categoryId)) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_KEY', 400);
    try {
      const { rows } = await this.pool.query(
        `select public.service_catalog_set_enabled($1,$2,$3,$4,$5) as result`,
        [actor.id, this.tenantId, categoryId, enabled, reason],
      );
      return { categoryId: String(rows[0].result.categoryId), enabled: Boolean(rows[0].result.enabled) };
    } catch (error) {
      translateError(error);
    }
  }

  async listAudit(actor: ServiceCatalogActor, limit = 100): Promise<ServiceCatalogAuditView[]> {
    this.requireAdmin(actor);
    const { rows } = await this.pool.query(
      `select * from public.service_category_config_audit
        where tenant_id = $1 order by created_at desc, id desc limit $2`,
      [this.tenantId, Math.min(Math.max(limit, 1), 500)],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      tenantId: String(row.tenant_id),
      categoryId: String(row.category_id),
      versionNumber: row.version_number === null ? null : Number(row.version_number),
      actorId: row.actor_id ? String(row.actor_id) : null,
      actorRole: String(row.actor_role),
      action: String(row.action),
      summary: String(row.summary),
      detail: row.detail || {},
      createdAt: iso(row.created_at) || '',
    }));
  }

  async listProviderCredentials(actor: ServiceCatalogActor, providerId: string): Promise<ServiceCredentialView[]> {
    this.requireAdmin(actor);
    if (!UUID.test(providerId)) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_PROVIDER', 400);
    return this.credentialsForProvider(providerId);
  }

  async listOwnCredentials(actor: ProviderListingActor): Promise<ServiceCredentialView[]> {
    if (actor.role !== 'provider' || !actor.supabaseUserId || !UUID.test(actor.supabaseUserId)) {
      throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_PROVIDER_REQUIRED', 403);
    }
    await this.assertActiveProvider(actor.supabaseUserId);
    return this.credentialsForProvider(actor.supabaseUserId);
  }

  private async assertActiveProvider(providerId: string): Promise<void> {
    const { rows } = await this.pool.query(
      'select role, account_status from public.profiles where id = $1 limit 1',
      [providerId],
    );
    if (!rows[0]) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_PROVIDER_REQUIRED', 403);
    if (rows[0].account_status !== 'active') throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_ACCOUNT_INACTIVE', 403);
    if (rows[0].role !== 'provider') throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_PROVIDER_REQUIRED', 403);
  }

  private async credentialsForProvider(providerId: string): Promise<ServiceCredentialView[]> {
    const { rows } = await this.pool.query(
      `select credential.*, profile.full_name as provider_name
         from public.service_provider_credentials credential
         left join public.profiles profile on profile.id = credential.provider_id
        where credential.tenant_id = $1 and credential.provider_id = $2
        order by credential.created_at desc`,
      [this.tenantId, providerId],
    );
    return rows.map(mapCredential);
  }

  async listPendingVerifications(actor: ServiceCatalogActor): Promise<{
    documents: PendingServiceDocumentView[];
    credentials: ServiceCredentialView[];
  }> {
    this.requireAdmin(actor);
    const { rows: documents } = await this.pool.query(
      `select document.id, document.booking_id, document.document_key, document.document_reference,
              document.file_name, document.mime_type, document.status, document.created_at,
              booking.booking_ref, booking.customer_id, booking.provider_id, booking.category_config_id,
              listing.title as listing_title
         from public.service_booking_documents document
         join public.service_bookings booking on booking.id = document.booking_id
         join public.listings listing on listing.id = booking.listing_id
         left join public.service_category_configs category on category.id = booking.category_config_id
        where document.status = 'pending'
          and (booking.category_config_id is null or category.tenant_id = $1)
        order by document.created_at, document.id
        limit 200`,
      [this.tenantId],
    );
    // Legacy category rows are platform-owned and still reviewable; a
    // category-bound document only appears for its own tenant.
    const filtered = documents;
    const { rows: credentials } = await this.pool.query(
      `select credential.*, profile.full_name as provider_name
         from public.service_provider_credentials credential
         left join public.profiles profile on profile.id = credential.provider_id
        where credential.tenant_id = $1 and credential.status = 'pending'
        order by credential.created_at, credential.id
        limit 200`,
      [this.tenantId],
    );
    return {
      documents: filtered.map((row) => ({
        id: String(row.id),
        bookingId: String(row.booking_id),
        bookingRef: String(row.booking_ref || ''),
        listingTitle: String(row.listing_title || ''),
        categoryConfigId: row.category_config_id ? String(row.category_config_id) : null,
        documentKey: String(row.document_key),
        reference: String(row.document_reference),
        fileName: row.file_name ?? null,
        mimeType: row.mime_type ?? null,
        status: row.status,
        createdAt: iso(row.created_at) || '',
        customerId: String(row.customer_id),
        providerId: String(row.provider_id),
      })),
      credentials: credentials.map(mapCredential),
    };
  }

  async submitCredential(actor: ProviderListingActor, input: Record<string, unknown>): Promise<ServiceCredentialView> {
    if (actor.role !== 'provider') throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_PROVIDER_REQUIRED', 403);
    if (!actor.supabaseUserId || !UUID.test(actor.supabaseUserId)) {
      throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_AUTH_REQUIRED', 401);
    }
    await this.assertActiveProvider(actor.supabaseUserId);
    const credentialType = safeText(input.credentialType) as ServiceCredentialType;
    if (!['pharmacy_license', 'professional_license', 'other'].includes(credentialType)) {
      throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_CREDENTIAL_TYPE', 400);
    }
    const licenseNumber = safeText(input.licenseNumber);
    if (licenseNumber.length < 3 || licenseNumber.length > 120) {
      throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_LICENSE_NUMBER', 400);
    }
    const categoryId = safeText(input.categoryId) || null;
    if (categoryId) {
      if (!CATEGORY_KEY.test(categoryId)) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_KEY', 400);
      const { rows } = await this.pool.query(
        'select 1 from public.service_category_configs where tenant_id = $1 and id = $2 limit 1',
        [this.tenantId, categoryId],
      );
      if (!rows[0]) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_NOT_FOUND', 404);
    }
    const documentReference = safeText(input.documentReference) || null;
    if (documentReference && !/^(storage:\/\/|https:\/\/)[^\s]+$/i.test(documentReference)) {
      throw new ServiceCatalogRepositoryError('SERVICE_INVALID_DOCUMENT_REFERENCE', 400);
    }
    const expiresOn = safeText(input.expiresOn) || null;
    if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
      throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_EXPIRY', 400);
    }
    try {
      const { rows } = await this.pool.query(
        `insert into public.service_provider_credentials
          (tenant_id, provider_id, category_id, credential_type, license_number,
           issuing_authority, expires_on, document_reference, status)
         values ($1,$2,$3,$4,$5,NULLIF($6,''),$7::date,$8,'pending')
         on conflict (provider_id, credential_type, coalesce(category_id, '')) do update
           set license_number = excluded.license_number,
               issuing_authority = excluded.issuing_authority,
               expires_on = excluded.expires_on,
               document_reference = excluded.document_reference,
               status = 'pending',
               reviewed_by = null,
               reviewed_at = null,
               review_note = null,
               updated_at = now()
         returning *`,
        [
          this.tenantId, actor.supabaseUserId, categoryId, credentialType, licenseNumber,
          safeText(input.issuingAuthority).slice(0, 160), expiresOn, documentReference,
        ],
      );
      return mapCredential({ ...rows[0], provider_name: actor.name || null });
    } catch (error) {
      translateError(error);
    }
  }

  async reviewCredential(
    actor: ServiceCatalogActor,
    credentialId: string,
    status: 'verified' | 'rejected',
    note: string,
  ): Promise<ServiceCredentialView> {
    this.requireAdmin(actor);
    if (!UUID.test(credentialId)) throw new ServiceCatalogRepositoryError('SERVICE_CREDENTIAL_NOT_FOUND', 404);
    try {
      const { rows } = await this.pool.query(
        `select public.service_catalog_review_credential($1,$2,$3,$4,$5) as result`,
        [actor.id, this.tenantId, credentialId, status, note],
      );
      const result = rows[0].result;
      const detail = await this.pool.query(
        `select credential.*, profile.full_name as provider_name
           from public.service_provider_credentials credential
           left join public.profiles profile on profile.id = credential.provider_id
          where credential.id = $1`,
        [result.credentialId],
      );
      return mapCredential(detail.rows[0]);
    } catch (error) {
      translateError(error);
    }
  }

  async reviewBookingDocument(
    actor: ServiceCatalogActor,
    documentId: string,
    status: 'verified' | 'rejected',
    note: string,
  ): Promise<{ documentId: string; bookingId: string; documentKey: string; status: string; reviewNote: string | null; reviewedAt: string | null }> {
    this.requireAdmin(actor);
    if (!UUID.test(documentId)) throw new ServiceCatalogRepositoryError('SERVICE_DOCUMENT_NOT_FOUND', 404);
    try {
      const { rows } = await this.pool.query(
        `select public.service_catalog_review_document($1,$2,$3,$4,$5) as result`,
        [actor.id, this.tenantId, documentId, status, note],
      );
      const result = rows[0].result;
      return {
        documentId: String(result.documentId),
        bookingId: String(result.bookingId),
        documentKey: String(result.documentKey),
        status: String(result.status),
        reviewNote: result.reviewNote ?? null,
        reviewedAt: iso(result.reviewedAt),
      };
    } catch (error) {
      translateError(error);
    }
  }
}

function mapCredential(row: Record<string, any>): ServiceCredentialView {
  return {
    id: String(row.id),
    providerId: String(row.provider_id),
    providerName: row.provider_name ? String(row.provider_name) : null,
    categoryId: row.category_id ? String(row.category_id) : null,
    credentialType: row.credential_type,
    licenseNumber: String(row.license_number || ''),
    issuingAuthority: row.issuing_authority ?? null,
    expiresOn: row.expires_on ? (row.expires_on instanceof Date ? row.expires_on.toISOString().slice(0, 10) : String(row.expires_on).slice(0, 10)) : null,
    documentReference: row.document_reference ?? null,
    status: row.status,
    reviewNote: row.review_note ?? null,
    reviewedAt: iso(row.reviewed_at),
    createdAt: iso(row.created_at) || '',
  };
}

export interface ServiceCatalogApiDependencies {
  repository: ServiceCatalogRepository | null;
  verifySession: (request: express.Request) => ProviderListingActor | null;
}

function actorIdFromClaims(claims: { userId?: string; supabaseUserId?: string } | null): string {
  const candidate = String(claims?.supabaseUserId || claims?.userId || '').trim();
  return UUID.test(candidate) ? candidate : '';
}

export function registerServiceCatalogApi(app: express.Express, dependencies: ServiceCatalogApiDependencies): void {
  const requireRepository = (): ServiceCatalogRepository => {
    if (!dependencies.repository) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_NOT_CONFIGURED', 503);
    return dependencies.repository;
  };

  const requireActor = async (request: express.Request): Promise<ServiceCatalogActor> => {
    const claims = dependencies.verifySession(request);
    const id = actorIdFromClaims(claims);
    if (!claims || !id) throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_AUTH_REQUIRED', 401);
    return requireRepository().resolveActor(id);
  };

  const sendError = (response: express.Response, error: unknown) => {
    if (error instanceof ServiceCatalogRepositoryError) {
      response.status(error.httpStatus).json({ ok: false, error: error.code, message: error.message });
      return;
    }
    if (error instanceof Error && error.name === 'ServiceCatalogValidationError') {
      const code = (error as { code?: string }).code || 'SERVICE_CATALOG_INVALID_CONFIG';
      response.status(400).json({ ok: false, error: code, message: error.message });
      return;
    }
    logSafeError('service-catalog', 'unexpected', error);
    response.status(500).json({ ok: false, error: 'SERVICE_CATALOG_INTERNAL_ERROR' });
  };

  const privateHeaders = (response: express.Response) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('vary', 'authorization, x-bos-session-token');
  };

  app.get('/api/service-catalog', async (_request, response) => {
    try {
      const categories = await requireRepository().listPublic();
      response.setHeader('cache-control', 'public, max-age=30, stale-while-revalidate=300');
      response.json({ ok: true, categories });
    } catch (error) {
      if (error instanceof ServiceCatalogRepositoryError && error.httpStatus === 503) {
        response.status(503).json({ ok: false, error: error.code, categories: [] });
        return;
      }
      sendError(response, error);
    }
  });

  app.get('/api/service-catalog/:id', async (request, response) => {
    try {
      const category = await requireRepository().publishedCategory(String(request.params.id || ''));
      if (!category) {
        response.status(404).json({ ok: false, error: 'SERVICE_CATALOG_NOT_FOUND' });
        return;
      }
      response.setHeader('cache-control', 'public, max-age=30, stale-while-revalidate=300');
      response.json({ ok: true, category });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/service-catalog', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const categories = await requireRepository().listAdmin(actor);
      privateHeaders(response);
      response.json({ ok: true, actor, tenantId: requireRepository().tenantId, categories });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/service-catalog/audit', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const audit = await requireRepository().listAudit(actor, Number(request.query.limit || 100));
      privateHeaders(response);
      response.json({ ok: true, actor, audit });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/service-catalog/verifications', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const verifications = await requireRepository().listPendingVerifications(actor);
      privateHeaders(response);
      response.json({ ok: true, actor, ...verifications });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/service-catalog/credentials', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const providerId = String(request.query.providerId || '').trim();
      const credentials = await requireRepository().listProviderCredentials(actor, providerId);
      privateHeaders(response);
      response.json({ ok: true, actor, credentials });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/service-catalog/credentials/:id/decision', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const status = String(request.body?.status || '');
      if (status !== 'verified' && status !== 'rejected') {
        throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_REVIEW_STATUS', 400);
      }
      const credential = await requireRepository().reviewCredential(
        actor,
        String(request.params.id || ''),
        status,
        String(request.body?.note || ''),
      );
      privateHeaders(response);
      response.json({ ok: true, credential });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/service-catalog/documents/:id/decision', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const status = String(request.body?.status || '');
      if (status !== 'verified' && status !== 'rejected') {
        throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_REVIEW_STATUS', 400);
      }
      const document = await requireRepository().reviewBookingDocument(
        actor,
        String(request.params.id || ''),
        status,
        String(request.body?.note || ''),
      );
      privateHeaders(response);
      response.json({ ok: true, document });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/service-catalog/:id', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const category = await requireRepository().adminDetail(actor, String(request.params.id || ''));
      privateHeaders(response);
      response.json({ ok: true, actor, category });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/service-catalog/:id/draft', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const body = (request.body || {}) as Record<string, unknown>;
      const expected = body.expectedVersion === null || body.expectedVersion === undefined
        ? null
        : Number(body.expectedVersion);
      if (expected !== null && (!Number.isSafeInteger(expected) || expected < 0)) {
        throw new ServiceCatalogRepositoryError('SERVICE_CATALOG_INVALID_VERSION', 400);
      }
      const version = await requireRepository().saveDraft(
        actor,
        String(request.params.id || ''),
        body.config,
        String(body.summary || 'Saved service category draft'),
        expected,
      );
      privateHeaders(response);
      response.json({ ok: true, actor, version });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/service-catalog/:id/publish', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const version = await requireRepository().publish(
        actor,
        String(request.params.id || ''),
        String(request.body?.versionId || ''),
      );
      privateHeaders(response);
      response.json({ ok: true, actor, version });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/service-catalog/:id/rollback', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const version = await requireRepository().rollback(
        actor,
        String(request.params.id || ''),
        String(request.body?.targetVersionId || ''),
      );
      privateHeaders(response);
      response.json({ ok: true, actor, version });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/service-catalog/:id/enabled', async (request, response) => {
    try {
      const actor = await requireActor(request);
      const result = await requireRepository().setEnabled(
        actor,
        String(request.params.id || ''),
        Boolean(request.body?.enabled),
        String(request.body?.reason || ''),
      );
      privateHeaders(response);
      response.json({ ok: true, actor, ...result });
    } catch (error) {
      sendError(response, error);
    }
  });

  // Provider-facing licence submission.
  const providerActor = (request: express.Request): ProviderListingActor | null => {
    const claims = dependencies.verifySession(request);
    if (!claims?.supabaseUserId || !UUID.test(String(claims.supabaseUserId))) return null;
    if (claims.authProvider !== 'google') return null;
    return claims;
  };

  app.get('/api/services/provider/credentials', async (request, response) => {
    const actor = providerActor(request);
    if (!actor) {
      response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    try {
      const credentials = await requireRepository().listOwnCredentials(actor);
      privateHeaders(response);
      response.json({ ok: true, credentials });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/services/provider/credentials', async (request, response) => {
    const actor = providerActor(request);
    if (!actor) {
      response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    try {
      const credential = await requireRepository().submitCredential(actor, request.body || {});
      privateHeaders(response);
      response.status(201).json({ ok: true, credential });
    } catch (error) {
      sendError(response, error);
    }
  });
}

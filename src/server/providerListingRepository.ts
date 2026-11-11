import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { inferLiveEditModule } from '../lib/liveEdit/moduleInference';
import { LiveEditValidationError, validateListingPatch } from './liveEditValidation';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import {
  closeSharedPostgresPool,
  getSharedPostgresPool,
  loadApprovedPublicListingMedia,
} from './postgresPool';
import { findEmbeddedDataUrl } from './mediaInputGuard';

export interface ProviderListingActor {
  userId: string;
  supabaseUserId?: string;
  email?: string;
  name?: string;
  phone?: string;
  googleSub?: string;
  avatarUrl?: string;
  authProvider?: 'google' | 'email_otp';
  role: 'customer' | 'provider' | 'admin';
  providerId?: string;
}

export type ProviderModule = 'pg_hostels' | 'classes' | 'venues' | 'services' | 'hotel_stay';
export type ProviderRegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface ProviderRegistrationInput {
  requestId?: unknown;
  providerType?: unknown;
  businessName?: unknown;
  contactPhone?: unknown;
  city?: unknown;
  area?: unknown;
  providerKind?: unknown;
  serviceCategories?: unknown;
  skills?: unknown;
  experienceYears?: unknown;
  serviceArea?: unknown;
  pricingNote?: unknown;
  availability?: unknown;
}

export interface ProviderRegistrationRecord {
  id: string;
  requestId: string;
  userId: string;
  providerType: ProviderModule;
  businessName: string;
  contactPhone: string;
  city: string;
  area: string;
  providerKind: 'individual' | 'business';
  serviceCategories: string[];
  skills: string[];
  experienceYears: number | null;
  serviceArea: string | null;
  pricingNote: string | null;
  availability: Record<string, unknown>;
  status: ProviderRegistrationStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicListingFilters {
  categoryId?: string;
  subcategory?: string;
  query?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface ProviderListingInput {
  id?: string;
  ownerId?: unknown;
  requestId?: unknown;
  idempotencyKey?: unknown;
  title?: unknown;
  categoryId?: unknown;
  subcategory?: unknown;
  entityType?: unknown;
  price?: unknown;
  priceUnit?: unknown;
  providerName?: unknown;
  providerPhone?: unknown;
  status?: unknown;
  isFeatured?: unknown;
  isVerified?: unknown;
  providerAvailabilityStatus?: unknown;
  payload?: unknown;
}

export interface ProviderListingRecord {
  id: string;
  title: string;
  categoryId: string;
  subcategory: string;
  entityType: string;
  price: number;
  priceUnit: string;
  providerId: string;
  ownerUserId: string;
  providerName: string;
  providerPhone: string;
  status: string;
  isFeatured: boolean;
  isVerified: boolean;
  providerAvailabilityStatus: 'not_reported' | 'available' | 'unavailable';
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
}

export interface CinemaScreenRecord {
  screenId: string;
  listingId: string;
  cinemaName: string;
  screenName: string;
  area: string;
  format: string;
  soundSystem: string;
  totalSeats: number;
  tiers: unknown[];
  seatTiers: unknown[];
  wheelchairSeats: string[];
  showtimes: string[];
  cancellationAllowed: boolean;
  cancellationCutoffMinutes: number;
  refundPercent: number;
  convenienceFeePerSeat: number;
  gstPercent: number;
  fnbDeliveryEnabled: boolean;
  rowVersion: number;
  updatedAt: string;
}

export interface CinemaScreenInput {
  screenId: string;
  listingId: string;
  cinemaName: string;
  screenName: string;
  area: string;
  format: string;
  soundSystem: string;
  totalSeats: number;
  tiers: unknown[];
  wheelchairSeats: string[];
  showtimes: string[];
  cancellationAllowed: boolean;
  cancellationCutoffMinutes: number;
  refundPercent: number;
  convenienceFeePerSeat: number;
  gstPercent: number;
  fnbDeliveryEnabled: boolean;
  expectedUpdatedAt?: string;
}

export class ProviderListingRepositoryError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message = code,
  ) {
    super(message);
    this.name = 'ProviderListingRepositoryError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_MODULES = new Set<ProviderModule>(['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay']);
const LISTING_STATUS = new Set(['pending_approval', 'active', 'rejected', 'expired', 'archived']);
const PROVIDER_SETTABLE_STATUS = new Set(['pending_approval', 'archived']);

function isMovieListing(categoryId: string, entityType: string): boolean {
  return entityType.toLowerCase() === 'movie' || /(^|[-_])(movie|movies|cinema|showtimes?)([-_]|$)/i.test(categoryId);
}

function defaultEntityType(categoryId: string): string {
  const id = categoryId.toLowerCase();
  if (/(pg|hostel|co-living|coliving|room|flat|hotel|stay|resort|villa)/.test(id)) return 'property';
  if (/(venue|banquet|hall|turf|ground|studio)/.test(id)) return 'venue';
  if (/(class|course|tuition|coaching|academy)/.test(id)) return 'course';
  if (/(movie|cinema|show)/.test(id)) return 'movie';
  if (/(service|salon|plumb|electric|clean|repair|carpent|paint|packer|pest)/.test(id)) return 'service';
  return 'listing';
}

function asPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function rejectEmbeddedMediaData(value: unknown): void {
  const path = findEmbeddedDataUrl(value);
  if (path) {
    throw new ProviderListingRepositoryError(
      'MEDIA_OBJECT_REFERENCE_REQUIRED',
      400,
      `Embedded media data is not stored in PostgreSQL (${path}); upload it to approved object storage first.`,
    );
  }
}

function cleanPayload(value: unknown): Record<string, unknown> {
  const reserved = /^(id|title|categoryId|category_id|subcategory|entityType|entity_type|price|priceUnit|price_unit|status|isFeatured|is_featured|isVerified|is_verified|verified|verifiedAt|verifiedBy|verified_by|providerAvailabilityStatus|provider_availability_status|provider|providerId|providerName|providerPhone|providerRating|rating|reviewCount|reviews|verifiedCustomer|ownerId|owner_id|ownerUserId|userId|requestId|moderation|reviewedBy|reviewedAt)$/i;
  const visit = (item: unknown, depth: number): unknown => {
    if (depth > 8 || item === null || typeof item !== 'object') return item;
    if (Array.isArray(item)) return item.map((entry) => visit(entry, depth + 1));
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>)
        .filter(([key]) => !reserved.test(key))
        .map(([key, entry]) => [key, visit(entry, depth + 1)]),
    );
  };
  return visit(value, 0) as Record<string, unknown>;
}

export function mergeReadyPublicListingMedia(
  payload: unknown,
  references: unknown,
): Record<string, unknown> {
  const cleaned = cleanPayload(payload);
  const existing = Array.isArray(cleaned.images)
    ? cleaned.images.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const media = Array.isArray(references)
    ? references.filter((value): value is string => (
      typeof value === 'string'
      && /^storage:\/\/bos-public-media\/[^?#\\\u0000-\u001f\u007f]+$/.test(value)
      && !value.includes('..')
      && !value.slice('storage://'.length).includes('//')
    ))
    : [];
  if (!media.length) return cleaned;
  cleaned.images = [...new Set([...existing, ...media])].slice(0, 20);
  return cleaned;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const text = safeText(entry);
    if (!text || text.length > maxLength) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function toProviderRegistration(row: any): ProviderRegistrationRecord {
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    userId: String(row.user_id),
    providerType: row.provider_type as ProviderModule,
    businessName: String(row.business_name),
    contactPhone: String(row.contact_phone),
    city: String(row.city),
    area: String(row.area),
    providerKind: row.provider_kind === 'business' ? 'business' : 'individual',
    serviceCategories: Array.isArray(row.service_categories) ? row.service_categories.map(String) : [],
    skills: Array.isArray(row.skills) ? row.skills.map(String) : [],
    experienceYears: row.experience_years == null ? null : Number(row.experience_years),
    serviceArea: row.service_area == null ? null : String(row.service_area),
    pricingNote: row.pricing_note == null ? null : String(row.pricing_note),
    availability: asPayload(row.availability),
    status: row.status as ProviderRegistrationStatus,
    reviewNote: row.review_note == null ? null : String(row.review_note),
    reviewedBy: row.reviewed_by == null ? null : String(row.reviewed_by),
    reviewedAt: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : row.reviewed_at == null ? null : String(row.reviewed_at),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function toRecord(row: any): ProviderListingRecord {
  const payload = asPayload(row.payload);
  const provider = asPayload(payload.provider);
  return {
    id: String(row.id),
    title: String(row.title || ''),
    categoryId: String(row.category_id || ''),
    subcategory: String(row.subcategory || ''),
    entityType: String(row.entity_type || 'listing'),
    price: Number(row.price || 0),
    priceUnit: String(row.price_unit || 'quote'),
    providerId: safeText(provider.id, `prov-${String(row.owner_id || '').slice(0, 8).toLowerCase()}`),
    ownerUserId: String(row.owner_id || ''),
    providerName: safeText(row.provider_name, safeText(provider.name)),
    providerPhone: String(row.provider_phone || ''),
    status: String(row.status || 'pending_approval'),
    isFeatured: payload.isFeatured === true,
    isVerified: row.is_verified === true,
    providerAvailabilityStatus: row.provider_availability_status === 'available' || row.provider_availability_status === 'unavailable'
      ? row.provider_availability_status
      : 'not_reported',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || ''),
    payload: mergeReadyPublicListingMedia(payload, row.public_media_images),
  };
}

function asJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stableCinemaJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableCinemaJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableCinemaJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function toCinemaScreenRecord(row: any): CinemaScreenRecord {
  const updatedAt = row.updated_at instanceof Date
    ? row.updated_at.toISOString()
    : String(row.updated_at || '');
  return {
    screenId: String(row.id || ''),
    listingId: String(row.cinema_listing_id || ''),
    cinemaName: String(row.cinema_title || ''),
    screenName: String(row.screen_name || ''),
    area: String(row.area || 'Hyderabad'),
    format: String(row.format || ''),
    soundSystem: String(row.sound_system || ''),
    totalSeats: Number(row.total_seats ?? 80),
    tiers: asJsonArray(row.tiers),
    seatTiers: asJsonArray(row.seat_tiers),
    wheelchairSeats: asStringArray(row.wheelchair_seats),
    showtimes: asStringArray(row.showtimes),
    cancellationAllowed: row.cancellation_allowed !== false,
    cancellationCutoffMinutes: Number(row.cancellation_cutoff_minutes ?? 0),
    refundPercent: Number(row.refund_percent ?? 0),
    convenienceFeePerSeat: Number(row.convenience_fee_per_seat ?? 0),
    gstPercent: Number(row.gst_percent ?? 0),
    fnbDeliveryEnabled: row.fnb_delivery_enabled === true,
    rowVersion: Number(row.row_version ?? 1),
    updatedAt,
  };
}

function validateLocalConnectionString(
  connectionString: string,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  // Shared policy: loopback for development/test, TLS production target in
  // production. The repository never opens a pool the policy rejected.
  assertPostgresConnectionTarget(connectionString, environment);
}

/**
 * Transactional repository for the first local-only PostgreSQL vertical
 * slice. Every authenticated query runs as the `authenticated` DB role with
 * transaction-local claims derived from the server-signed session. RLS is an
 * additional owner/admin check, not a replacement for server role checks.
 */
export class ProviderListingRepository {
  private readonly pool: Pool;

  constructor(connectionString: string, environment: NodeJS.ProcessEnv = process.env) {
    validateLocalConnectionString(connectionString, environment);
    this.pool = getSharedPostgresPool(connectionString, environment);
  }

  async verifyConnection(): Promise<void> {
    await this.pool.query('select 1');
  }

  async close(): Promise<void> {
    await closeSharedPostgresPool();
  }

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): ProviderListingRepository | null {
    const connectionString = String(environment.BOS_LISTINGS_DATABASE_URL || '').trim();
    const legacyConnectionString = String(environment.BOS_PG_URL || '').trim();
    if (legacyConnectionString && !connectionString) {
      throw new Error('BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL');
    }
    if (legacyConnectionString && connectionString && legacyConnectionString !== connectionString) {
      throw new Error('BOS_LISTINGS_DATABASE_URL_CONFLICT');
    }
    if (legacyConnectionString) {
      throw new Error('BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL');
    }
    if (!connectionString) return null;
    assertPostgresConnectionTarget(connectionString, environment);
    return new ProviderListingRepository(connectionString, environment);
  }

  private async transaction<T>(
    actor: ProviderListingActor | null,
    operation: (client: PoolClient) => Promise<T>,
    afterAnonCommit?: (client: PoolClient, result: T) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const dbRole = actor ? 'authenticated' : 'anon';
      await client.query(`SET LOCAL ROLE ${dbRole}`);
      const claims = actor
        ? {
            sub: actor.supabaseUserId,
            role: 'authenticated',
            aal: 'aal1',
          }
        : { role: 'anon' };
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor?.supabaseUserId || '']);
      await client.query("select set_config('request.jwt.claim.role', $1, true)", [dbRole]);
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      const result = await operation(client);
      await client.query('COMMIT');
      if (!actor && afterAnonCommit) {
        return await afterAnonCommit(client, result);
      }
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Keep the original database failure; the pooled connection is released below.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async isCurrentSuperAdmin(client: PoolClient): Promise<boolean> {
    const { rows } = await client.query(
      'select public.is_current_user_super_admin() as is_super_admin',
    );
    return rows[0]?.is_super_admin === true;
  }

  private async assertAdminAssignment(
    client: PoolClient,
    listing: { category_id?: unknown; entity_type?: unknown; payload?: unknown },
    listingId: string,
  ): Promise<void> {
    const module = inferLiveEditModule({
      categoryId: listing.category_id,
      entityType: listing.entity_type,
      payload: asPayload(listing.payload),
    });
    const { rows } = await client.query(
      'select public.live_edit_admin_can_edit($1, $2, $3) as allowed',
      [module, safeText(listing.category_id), listingId],
    );
    if (rows[0]?.allowed !== true) {
      throw new ProviderListingRepositoryError(
        'LISTING_ASSIGNMENT_REQUIRED',
        403,
        'This listing is outside the modules, categories or listings assigned to this administrator.',
      );
    }
  }

  private async assertNewListingAssignment(
    client: PoolClient,
    module: string | null,
    categoryId: string,
    listingId: string,
  ): Promise<void> {
    const { rows } = await client.query(
      'select public.live_edit_admin_can_edit($1, $2, $3) as allowed',
      [module, categoryId, listingId],
    );
    if (rows[0]?.allowed !== true) {
      throw new ProviderListingRepositoryError(
        'LISTING_ASSIGNMENT_REQUIRED',
        403,
        'This new listing is outside the modules or categories assigned to this administrator.',
      );
    }
  }

  private mapValidationFailure(error: unknown): never {
    if (error instanceof LiveEditValidationError) {
      const status = error.code === 'LISTING_MODULE_CHANGE_FORBIDDEN' ? 403 : 400;
      throw new ProviderListingRepositoryError(error.code, status, error.message);
    }
    throw error;
  }

  private mapDatabaseWriteFailure(error: unknown): never {
    const message = String((error as any)?.message || '');
    const code = String((error as any)?.code || '');
    if (message.includes('LIVE_EDIT_AUDIT')) {
      throw new ProviderListingRepositoryError(
        'AUDIT_PERSISTENCE_FAILED',
        503,
        'The listing change was rolled back because its audit event could not be persisted.',
      );
    }
    const mapping: Record<string, { code: string; status: number }> = {
      LISTING_ASSIGNMENT_REQUIRED: { code: 'LISTING_ASSIGNMENT_REQUIRED', status: 403 },
      LISTING_REVIEW_ENDPOINT_REQUIRED: { code: 'LISTING_REVIEW_ENDPOINT_REQUIRED', status: 409 },
      LISTING_PUBLICATION_ADMIN_ONLY: { code: 'FORBIDDEN_ADMIN_APPROVAL_REQUIRED', status: 403 },
      LISTING_VERIFICATION_ADMIN_ONLY: { code: 'SUPER_ADMIN_REQUIRED', status: 403 },
      LISTING_FEATURED_SUPER_ADMIN_ONLY: { code: 'SUPER_ADMIN_REQUIRED', status: 403 },
      LISTING_MODERATION_SUPER_ADMIN_ONLY: { code: 'SUPER_ADMIN_REQUIRED', status: 403 },
      LISTING_OWNER_CHANGE_SUPER_ADMIN_ONLY: { code: 'SUPER_ADMIN_REQUIRED', status: 403 },
      LISTING_MODULE_CHANGE_FORBIDDEN: { code: 'LISTING_MODULE_CHANGE_FORBIDDEN', status: 403 },
      INVALID_LISTING_PRICE: { code: 'INVALID_LISTING_PRICE', status: 400 },
      INVALID_LISTING_IMAGES: { code: 'INVALID_LISTING_IMAGES', status: 400 },
      INVALID_LISTING_FACILITIES: { code: 'INVALID_LISTING_FACILITIES', status: 400 },
      INVALID_LISTING_AVAILABILITY: { code: 'INVALID_LISTING_AVAILABILITY', status: 400 },
      INVALID_LISTING_STATUS: { code: 'INVALID_LISTING_STATUS', status: 400 },
      INVALID_LISTING_FIELDS: { code: 'INVALID_LISTING_FIELDS', status: 400 },
      FORBIDDEN_NOT_LISTING_OWNER: { code: 'FORBIDDEN_NOT_LISTING_OWNER', status: 403 },
      FORBIDDEN_CINEMA_SCREEN: { code: 'FORBIDDEN_CINEMA_SCREEN', status: 403 },
      CINEMA_SCREEN_ID_IMMUTABLE: { code: 'CINEMA_SCREEN_ID_IMMUTABLE', status: 403 },
      CINEMA_LISTING_CHANGE_FORBIDDEN: { code: 'CINEMA_LISTING_CHANGE_FORBIDDEN', status: 403 },
      CINEMA_SCREEN_NOT_FOUND: { code: 'CINEMA_SCREEN_NOT_FOUND', status: 404 },
      ACTIVE_PROVIDER_REQUIRED: { code: 'ACTIVE_PROVIDER_REQUIRED', status: 400 },
      INVALID_CINEMA_FIELDS: { code: 'INVALID_CINEMA_FIELDS', status: 400 },
      SUPER_ADMIN_REQUIRED: { code: 'SUPER_ADMIN_REQUIRED', status: 403 },
      'row-level security': { code: 'FORBIDDEN_CINEMA_SCREEN', status: 403 },
      LIVE_EDIT_UNAUTHENTICATED: { code: 'UNAUTHORIZED_SESSION', status: 401 },
      STORE_PERSISTENCE_FAILED: { code: 'STORE_PERSISTENCE_FAILED', status: 503 },
      LIVE_EDIT_ACTIVE_PROFILE_REQUIRED: { code: 'ACTIVE_PROFILE_REQUIRED', status: 403 },
    };
    for (const [needle, target] of Object.entries(mapping)) {
      if (message.includes(needle)) {
        throw new ProviderListingRepositoryError(target.code, target.status, message);
      }
    }
    if (code === '23514' && message.includes('listings_price_range_check')) {
      throw new ProviderListingRepositoryError('INVALID_LISTING_PRICE', 400, message);
    }
    throw error;
  }

  private async latestAuditEventId(client: PoolClient, listingId: string): Promise<string | null> {
    const { rows } = await client.query(
      `select id from public.live_edit_audit_events
        where listing_id = $1 and actor_user_id = auth.uid()
        order by occurred_at desc
        limit 1`,
      [listingId],
    );
    return rows[0]?.id ? String(rows[0].id) : null;
  }

  private async requireActiveProfile(client: PoolClient, actor: ProviderListingActor): Promise<any> {
    if (!actor.supabaseUserId || !UUID_PATTERN.test(actor.supabaseUserId)) {
      throw new ProviderListingRepositoryError('VERIFIED_AUTH_ID_REQUIRED', 401);
    }
    const { rows } = await client.query(
      `select id, email, full_name, phone, role, account_status
         from public.profiles
        where id = auth.uid()
        limit 1`,
    );
    const profile = rows[0];
    if (!profile || profile.account_status !== 'active') {
      throw new ProviderListingRepositoryError('ACTIVE_PROFILE_REQUIRED', 403);
    }
    if (profile.role !== actor.role) {
      throw new ProviderListingRepositoryError('SESSION_ROLE_MISMATCH', 403);
    }
    return profile;
  }

  /**
   * Provision the profile associated with a server-verified Google session.
   * New rows are always customers. Existing DB-assigned roles/status are never
   * overwritten by OAuth metadata or client input. The caller must pass only
   * claims from a verified Supabase identity or a server-signed app session.
   */
  async provisionGoogleProfile(actor: ProviderListingActor): Promise<any> {
    if (actor.authProvider !== 'google' || !actor.supabaseUserId || !UUID_PATTERN.test(actor.supabaseUserId)) {
      throw new ProviderListingRepositoryError('VERIFIED_GOOGLE_IDENTITY_REQUIRED', 401);
    }
    const email = safeText(actor.email).toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ProviderListingRepositoryError('VERIFIED_GOOGLE_EMAIL_REQUIRED', 401);
    }
    return this.transaction(actor, async (client) => {
      const { rows } = await client.query(
        `select profile_id as id, email, full_name, role, account_status, avatar_url
           from private.provision_google_profile($1, $2, $3)`,
        [safeText(actor.name), safeText(actor.avatarUrl), safeText(actor.googleSub)],
      );
      if (!rows[0]) {
        throw new ProviderListingRepositoryError('PROFILE_IDENTITY_CONFLICT_OR_INACTIVE', 403);
      }
      return rows[0];
    });
  }

  async profileForIdentity(actor: ProviderListingActor): Promise<any | null> {
    if (!['google', 'email_otp'].includes(String(actor.authProvider)) || !actor.supabaseUserId || !UUID_PATTERN.test(actor.supabaseUserId)) {
      throw new ProviderListingRepositoryError('VERIFIED_AUTH_IDENTITY_REQUIRED', 401);
    }
    return this.transaction(actor, async (client) => {
      const { rows } = await client.query(
        `select id, email, full_name, role, account_status, avatar_url
           from public.profiles where id = auth.uid() limit 1`,
      );
      if (!rows[0]) return null;
      if (rows[0].account_status !== 'active') {
        throw new ProviderListingRepositoryError('PROFILE_INACTIVE', 403);
      }
      return rows[0];
    });
  }

  async submitProviderRegistration(actor: ProviderListingActor, input: ProviderRegistrationInput): Promise<{ registration: ProviderRegistrationRecord; idempotent: boolean }> {
    if (actor.role !== 'customer') throw new ProviderListingRepositoryError('PROVIDER_REGISTRATION_CUSTOMER_REQUIRED', 409);
    if (actor.authProvider !== 'google') throw new ProviderListingRepositoryError('VERIFIED_GOOGLE_IDENTITY_REQUIRED', 401);
    const providerType = safeText(input.providerType) as ProviderModule;
    const businessName = safeText(input.businessName);
    const contactPhone = safeText(input.contactPhone);
    const city = safeText(input.city);
    const area = safeText(input.area);
    const requestId = safeText(input.requestId);
    if (!UUID_PATTERN.test(requestId)) throw new ProviderListingRepositoryError('INVALID_REGISTRATION_REQUEST_ID', 400);
    const providerKind = safeText(input.providerKind, 'individual');
    if (!['individual', 'business'].includes(providerKind)) {
      throw new ProviderListingRepositoryError('INVALID_PROVIDER_KIND', 400);
    }
    const serviceCategories = normalizeStringList(input.serviceCategories, 12, 60);
    if (serviceCategories.some((value) => !/^(cat|srv|rural)-[a-z0-9-]+$/i.test(value))) {
      throw new ProviderListingRepositoryError('INVALID_SERVICE_CATEGORY_SELECTION', 400);
    }
    const skills = normalizeStringList(input.skills, 20, 80);
    const experienceYears = input.experienceYears === undefined || input.experienceYears === null || input.experienceYears === ''
      ? null
      : Number(input.experienceYears);
    if (experienceYears !== null && (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 70)) {
      throw new ProviderListingRepositoryError('INVALID_EXPERIENCE_YEARS', 400);
    }
    const serviceArea = safeText(input.serviceArea);
    if (serviceArea && (serviceArea.length < 2 || serviceArea.length > 200)) {
      throw new ProviderListingRepositoryError('INVALID_SERVICE_AREA', 400);
    }
    const pricingNote = safeText(input.pricingNote).slice(0, 300);
    const availability = asPayload(input.availability);
    const availabilityDays = Array.isArray(availability.days) ? availability.days : [];
    const validDays = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    if (availabilityDays.length > 7 || availabilityDays.some((day) => !validDays.has(String(day)))) {
      throw new ProviderListingRepositoryError('INVALID_AVAILABILITY', 400);
    }
    if (!PROVIDER_MODULES.has(providerType) || !businessName || businessName.length > 120 || businessName.length < 2 ||
        !/^\+?[0-9][0-9\s().-]{5,22}$/.test(contactPhone) || city.length < 2 || city.length > 100 ||
        area.length < 2 || area.length > 120) {
      throw new ProviderListingRepositoryError('INVALID_PROVIDER_REGISTRATION', 400);
    }
    return this.transaction(actor, async (client) => {
      const profile = await this.provisionGoogleProfileInTransaction(client, actor);
      if (profile.account_status !== 'active') throw new ProviderListingRepositoryError('PROFILE_INACTIVE', 403);
      if (profile.role !== 'customer') throw new ProviderListingRepositoryError('PROVIDER_ALREADY_ACTIVE', 409);
      const { rows: inserted } = await client.query(
        `insert into public.provider_registration_requests
          (user_id, request_id, provider_type, business_name, contact_phone, city, area,
           provider_kind, service_categories, skills, experience_years, service_area, pricing_note, availability, status)
         values (auth.uid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULLIF($11, ''), NULLIF($12, ''), $13::jsonb, 'pending')
         on conflict do nothing
         returning *`,
        [
          requestId, providerType, businessName, contactPhone, city, area,
          providerKind, serviceCategories, skills, experienceYears, serviceArea, pricingNote,
          JSON.stringify(availability),
        ],
      );
      if (inserted[0]) return { registration: toProviderRegistration(inserted[0]), idempotent: false };
      const { rows: replay } = await client.query(
        `select * from public.provider_registration_requests
          where user_id = auth.uid() and (request_id = $1 or (provider_type = $2 and status = 'pending'))
          order by (request_id = $1) desc, created_at desc limit 1`,
        [requestId, providerType],
      );
      if (!replay[0]) throw new ProviderListingRepositoryError('PROVIDER_REGISTRATION_CONFLICT', 409);
      if (replay[0].request_id === requestId &&
          (replay[0].provider_type !== providerType || replay[0].business_name !== businessName || replay[0].contact_phone !== contactPhone || replay[0].city !== city || replay[0].area !== area)) {
        throw new ProviderListingRepositoryError('PROVIDER_REGISTRATION_REQUEST_ID_CONFLICT', 409);
      }
      return { registration: toProviderRegistration(replay[0]), idempotent: true };
    });
  }

  private async provisionGoogleProfileInTransaction(client: PoolClient, actor: ProviderListingActor): Promise<any> {
    const email = safeText(actor.email).toLowerCase();
    if (!actor.supabaseUserId || !UUID_PATTERN.test(actor.supabaseUserId) || actor.authProvider !== 'google' || !email) {
      throw new ProviderListingRepositoryError('VERIFIED_GOOGLE_IDENTITY_REQUIRED', 401);
    }
    const { rows } = await client.query(
      `select profile_id as id, email, full_name, role, account_status, avatar_url
         from private.provision_google_profile($1, $2, $3)`,
      [safeText(actor.name), safeText(actor.avatarUrl), safeText(actor.googleSub)],
    );
    if (!rows[0]) throw new ProviderListingRepositoryError('PROFILE_IDENTITY_CONFLICT_OR_INACTIVE', 403);
    return rows[0];
  }

  async ownProviderRegistration(actor: ProviderListingActor): Promise<ProviderRegistrationRecord | null> {
    if (!actor.supabaseUserId || !UUID_PATTERN.test(actor.supabaseUserId)) throw new ProviderListingRepositoryError('VERIFIED_AUTH_ID_REQUIRED', 401);
    return this.transaction(actor, async (client) => {
      const { rows } = await client.query(
        `select * from public.provider_registration_requests
          where user_id = auth.uid() order by created_at desc limit 1`,
      );
      return rows[0] ? toProviderRegistration(rows[0]) : null;
    });
  }

  async listProviderRegistrations(actor: ProviderListingActor): Promise<ProviderRegistrationRecord[]> {
    if (actor.role !== 'admin') throw new ProviderListingRepositoryError('FORBIDDEN_ADMIN_REQUIRED', 403);
    return this.transaction(actor, async (client) => {
      const profile = await this.requireActiveProfile(client, actor);
      if (profile.role !== 'admin') throw new ProviderListingRepositoryError('FORBIDDEN_ADMIN_REQUIRED', 403);
      const { rows } = await client.query(
        `select * from public.provider_registration_requests order by
          case status when 'pending' then 0 else 1 end, created_at desc limit 500`,
      );
      return rows.map(toProviderRegistration);
    });
  }

  async reviewProviderRegistration(actor: ProviderListingActor, registrationId: string, decision: 'approved' | 'rejected', reviewNote = ''): Promise<{ registration: ProviderRegistrationRecord; idempotent: boolean } | null> {
    if (actor.role !== 'admin') throw new ProviderListingRepositoryError('FORBIDDEN_ADMIN_REQUIRED', 403);
    return this.transaction(actor, async (client) => {
      const profile = await this.requireActiveProfile(client, actor);
      if (profile.role !== 'admin') throw new ProviderListingRepositoryError('FORBIDDEN_ADMIN_REQUIRED', 403);
      const current = await client.query(
        `select * from public.provider_registration_requests where id = $1 for update`,
        [registrationId],
      );
      if (!current.rows[0]) return null;
      if (current.rows[0].status !== 'pending') {
        if (current.rows[0].status === decision) {
          return { registration: toProviderRegistration(current.rows[0]), idempotent: true };
        }
        throw new ProviderListingRepositoryError('PROVIDER_REGISTRATION_ALREADY_REVIEWED', 409);
      }
      const { rows } = await client.query(
        `select * from private.review_provider_registration($1::uuid, $2, $3)`,
        [registrationId, decision, safeText(reviewNote).slice(0, 1000)],
      );
      if (!rows[0]) return null;
      return { registration: toProviderRegistration(rows[0]), idempotent: false };
    });
  }

  async listForActor(actor: ProviderListingActor): Promise<ProviderListingRecord[]> {
    if (!['provider', 'admin'].includes(actor.role)) {
      throw new ProviderListingRepositoryError('FORBIDDEN_PROVIDER_ROLE_REQUIRED', 403);
    }
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const { rows } = await client.query(
        `select l.*, p.full_name as provider_name, p.phone as provider_phone,
                coalesce(media.images, '[]'::jsonb) as public_media_images
           from public.listings l
           left join public.profiles p on p.id = l.owner_id
           left join lateral (
             select jsonb_agg(
                      'storage://' || asset.bucket_id || '/' || asset.object_path
                      order by asset.display_order, asset.created_at, asset.id
                    ) as images
               from public.media_assets asset
              where asset.owner_id = l.owner_id
                and asset.parent_type = 'provider_listing'
                and asset.parent_id = l.id
                and asset.bucket_id = 'bos-public-media'
                and asset.privacy = 'public'
                and asset.processing_status = 'ready'
           ) media on true
          where l.owner_id = auth.uid()
             or (
               public.is_admin()
               and public.live_edit_admin_can_edit(
                 public.live_edit_listing_module(l.category_id, l.entity_type),
                 l.category_id,
                 l.id
               )
             )
          order by l.updated_at desc, l.id`,
      );
      return rows.map(toRecord);
    });
  }

  async listActiveProviders(actor: ProviderListingActor): Promise<Array<{ id: string; fullName: string; email: string }>> {
    if (actor.role !== 'admin') throw new ProviderListingRepositoryError('FORBIDDEN_ADMIN_REQUIRED', 403);
    return this.transaction(actor, async (client) => {
      const profile = await this.requireActiveProfile(client, actor);
      if (profile.role !== 'admin') throw new ProviderListingRepositoryError('FORBIDDEN_ADMIN_REQUIRED', 403);
      const { rows } = await client.query(
        `select id, full_name, email from public.profiles
          where role = 'provider' and account_status = 'active'
          order by full_name nulls last, id limit 500`,
      );
      return rows.map((row) => ({ id: String(row.id), fullName: String(row.full_name || ''), email: String(row.email || '') }));
    });
  }

  async listPublic(filters: PublicListingFilters = {}): Promise<ProviderListingRecord[]> {
    const clauses = [`l.status = 'active'`];
    const values: unknown[] = [];
    if (filters.categoryId) {
      values.push(filters.categoryId);
      clauses.push(`l.category_id = $${values.length}`);
    }
    if (filters.subcategory) {
      values.push(filters.subcategory);
      clauses.push(`l.subcategory = $${values.length}`);
    }
    if (filters.query) {
      values.push(`%${filters.query}%`);
      clauses.push(`(l.title ilike $${values.length} or l.subcategory ilike $${values.length})`);
    }
    if (typeof filters.minPrice === 'number') {
      values.push(filters.minPrice);
      clauses.push(`l.price >= $${values.length}`);
    }
    if (typeof filters.maxPrice === 'number') {
      values.push(filters.maxPrice);
      clauses.push(`l.price <= $${values.length}`);
    }
    return this.transaction(
      null,
      async (client) => {
        const { rows } = await client.query(
          `select l.*, l.payload #>> '{provider,name}' as provider_name, null::text as provider_phone
             from public.listings l
            where ${clauses.join(' and ')}
            order by l.updated_at desc, l.id
            limit 500`,
          values,
        );
        return rows.map(toRecord);
      },
      async (client, records) => {
        const mediaByListingId = await loadApprovedPublicListingMedia(
          client,
          records.map((record) => record.id),
        );
        if (mediaByListingId.size === 0) return records;
        return records.map((record) => ({
          ...record,
          payload: mergeReadyPublicListingMedia(record.payload, mediaByListingId.get(record.id) || []),
        }));
      },
    );
  }

  /**
   * Public details read. Non-active rows are indistinguishable from missing
   * rows so the endpoint cannot be used to probe unapproved listings.
   */
  async findPublicById(listingId: string): Promise<ProviderListingRecord | null> {
    if (!listingId) return null;
    return this.transaction(
      null,
      async (client) => {
        const { rows } = await client.query(
          `select l.*, l.payload #>> '{provider,name}' as provider_name, null::text as provider_phone
             from public.listings l
            where l.id = $1 and l.status = 'active'
            limit 1`,
          [listingId],
        );
        return rows[0] ? toRecord(rows[0]) : null;
      },
      async (client, record) => {
        if (!record) return null;
        const mediaByListingId = await loadApprovedPublicListingMedia(client, [record.id]);
        const media = mediaByListingId.get(record.id);
        if (!media?.length) return record;
        return {
          ...record,
          payload: mergeReadyPublicListingMedia(record.payload, media),
        };
      },
    );
  }

  /**
   * Authorized admin transition used by the Super Admin approval workflow.
   * `status` is null for a pricing-only edit. The row lock plus RLS admin
   * policy make concurrent approvals deterministic.
   */
  async setStatusForAdmin(
    actor: ProviderListingActor,
    listingId: string,
    status: string | null,
    patch: { price?: number; isFeatured?: boolean } = {},
  ): Promise<ProviderListingRecord> {
    if (actor.role !== 'admin') {
      throw new ProviderListingRepositoryError('FORBIDDEN_ADMIN_REQUIRED', 403);
    }
    if (status !== null && !LISTING_STATUS.has(status)) {
      throw new ProviderListingRepositoryError('INVALID_LISTING_STATUS', 400);
    }
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const superAdmin = await this.isCurrentSuperAdmin(client);
      const existing = await client.query('select * from public.listings where id = $1 for update', [listingId]);
      const row = existing.rows[0];
      if (!row) throw new ProviderListingRepositoryError('LISTING_NOT_FOUND', 404);
      if (!superAdmin) {
        await this.assertAdminAssignment(client, row, listingId);
        if (patch.isFeatured !== undefined) {
          throw new ProviderListingRepositoryError('SUPER_ADMIN_REQUIRED', 403);
        }
      }
      if (status === 'active' && isMovieListing(String(row.category_id || ''), String(row.entity_type || ''))) {
        throw new ProviderListingRepositoryError('MOVIES_MODULE_DISPLAY_ONLY', 409);
      }

      if (status && status !== row.status) {
        if (['active', 'rejected'].includes(status) && row.status !== 'pending_approval') {
          throw new ProviderListingRepositoryError('LISTING_REVIEW_STATE_CONFLICT', 409);
        }
        if (status === 'pending_approval') {
          throw new ProviderListingRepositoryError('LISTING_REVIEW_STATE_CONFLICT', 409);
        }
      }

      const price = patch.price === undefined ? Number(row.price) : Number(patch.price);
      if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) {
        throw new ProviderListingRepositoryError('INVALID_LISTING_PRICE', 400);
      }
      const payload = asPayload(row.payload);
      if (patch.isFeatured !== undefined) payload.isFeatured = patch.isFeatured === true;

      if (status && status !== row.status && ['active', 'rejected'].includes(status)) {
        await client.query("select set_config('bos.review_transition', 'on', true)");
      }
      let updated;
      try {
        updated = await client.query(
          `update public.listings
              set status = $2, price = $3, payload = $4::jsonb, updated_at = now()
            where id = $1`,
          [listingId, status ?? row.status, price, JSON.stringify(payload)],
        );
      } catch (error) {
        this.mapDatabaseWriteFailure(error);
      }
      if (updated.rowCount !== 1) {
        throw new ProviderListingRepositoryError('LISTING_NOT_FOUND', 404);
      }
      return toRecord(await this.fetchRecordById(client, listingId));
    });
  }

  async categoriesPublic(): Promise<Array<{ id: string; label: string; count: number; subcategories: string[] }>> {
    return this.transaction(null, async (client) => {
      const { rows } = await client.query(
        `select category_id as id,
                count(*)::integer as count,
                coalesce(array_agg(distinct subcategory order by subcategory), '{}') as subcategories
           from public.listings
          where status = 'active'
          group by category_id
          order by category_id`,
      );
      return rows.map((row) => ({ id: row.id, label: row.id, count: row.count, subcategories: row.subcategories }));
    });
  }

  async create(actor: ProviderListingActor, input: ProviderListingInput): Promise<{ listing: ProviderListingRecord; created: boolean; idempotent?: boolean }> {
    rejectEmbeddedMediaData(input.payload);
    if (!['provider', 'admin'].includes(actor.role)) {
      throw new ProviderListingRepositoryError('FORBIDDEN_PROVIDER_ROLE_REQUIRED', 403);
    }
    const id = safeText(input.id, `lst-${randomUUID()}`);
    const requestId = safeText(input.requestId ?? input.idempotencyKey);
    const title = safeText(input.title);
    const categoryId = safeText(input.categoryId);
    const subcategory = safeText(input.subcategory);
    const entityType = safeText(input.entityType, defaultEntityType(safeText(input.categoryId)));
    const price = Number(input.price ?? 0);
    const priceUnit = safeText(input.priceUnit, 'quote');
    // No caller, including an administrator creating a listing on behalf of a
    // provider, may create a publicly visible listing. Publication is a
    // separate locked admin review transition.
    if (!id || id.length > 160 || !title || title.length < 2 || title.length > 160 || !categoryId || categoryId.length > 80 || !subcategory || subcategory.length > 80) {
      throw new ProviderListingRepositoryError('INVALID_LISTING_FIELDS', 400);
    }
    if (entityType.length > 40 || priceUnit.length > 40 || (requestId && requestId.length > 100)) {
      throw new ProviderListingRepositoryError('INVALID_LISTING_FIELDS', 400);
    }
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) throw new ProviderListingRepositoryError('INVALID_LISTING_PRICE', 400);
    if (isMovieListing(categoryId, entityType)) {
      throw new ProviderListingRepositoryError('MOVIES_MODULE_DISPLAY_ONLY', 409);
    }

    return this.transaction(actor, async (client) => {
      const profile = await this.requireActiveProfile(client, actor);
      if (!['provider', 'admin'].includes(String(profile.role))) {
        throw new ProviderListingRepositoryError('FORBIDDEN_PROVIDER_ROLE_REQUIRED', 403);
      }
      const superAdmin = actor.role === 'admin' ? await this.isCurrentSuperAdmin(client) : false;
      let validatedCreate: ReturnType<typeof validateListingPatch>;
      try {
        validatedCreate = validateListingPatch({
          actorRole: actor.role === 'admin' ? 'admin' : 'provider',
          existing: {},
          updates: {
            title: input.title,
            categoryId: input.categoryId,
            subcategory: input.subcategory,
            entityType: input.entityType,
            price: input.price,
            priceUnit: input.priceUnit,
            ...(input.payload === undefined ? {} : { payload: input.payload }),
          },
        });
      } catch (error) {
        this.mapValidationFailure(error);
      }
      if (actor.role === 'admin' && !superAdmin) {
        await this.assertNewListingAssignment(
          client,
          validatedCreate.module,
          safeText(input.categoryId),
          id,
        );
        if (input.isVerified !== undefined || input.isFeatured !== undefined) {
          throw new ProviderListingRepositoryError('SUPER_ADMIN_REQUIRED', 403);
        }
      }
      const ownerIdInput = safeText(input.ownerId);
      if (actor.role !== 'admin' && ownerIdInput && ownerIdInput !== actor.supabaseUserId) {
        throw new ProviderListingRepositoryError('FORBIDDEN_OWNER_ASSIGNMENT', 403);
      }
      let ownerId = actor.supabaseUserId;
      if (actor.role === 'admin' && ownerIdInput) {
        if (!UUID_PATTERN.test(ownerIdInput)) throw new ProviderListingRepositoryError('INVALID_LISTING_OWNER', 400);
        const target = await client.query(
          `select id from public.profiles where id = $1 and role = 'provider' and account_status = 'active' limit 1`,
          [ownerIdInput],
        );
        if (!target.rows[0]) throw new ProviderListingRepositoryError('ACTIVE_PROVIDER_REQUIRED', 400);
        ownerId = ownerIdInput;
      }
      if (input.isVerified !== undefined && actor.role !== 'admin') {
        throw new ProviderListingRepositoryError('FORBIDDEN_VERIFICATION_FIELD', 403);
      }
      const isVerified = actor.role === 'admin' && superAdmin && input.isVerified === true;
      // Admin creation is still a draft operation. Publication can happen only
      // through the separate, locked review endpoint after this transaction.
      // Ignore caller-supplied `status` for every role so there is no alternate
      // route around the review state machine.
      const insertStatus = 'pending_approval';
      const sourcePayload =
        validatedCreate.payload ?? (input.payload === undefined ? asPayload(input) : asPayload(input.payload));
      const payload = {
        ...cleanPayload(sourcePayload),
        ...(requestId ? { requestId } : {}),
        provider: {
          id: String(ownerId) === actor.supabaseUserId && actor.providerId
            ? actor.providerId
            : `prov-${String(ownerId).slice(0, 8).toLowerCase()}`,
          name: String(ownerId) === actor.supabaseUserId ? safeText(profile.full_name) : '',
        },
        isFeatured: false,
      };
      const inserted = await client.query(
        `insert into public.listings
           (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload, is_verified)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
         on conflict do nothing
         returning *`,
        [id, ownerId, title, categoryId, subcategory, entityType, price, priceUnit, insertStatus, JSON.stringify(payload), isVerified],
      );
      if (inserted.rowCount === 1) {
        const row = await this.fetchRecordById(client, id);
        return { listing: toRecord(row), created: true };
      }

      // Request IDs support retries even when a client generated a fresh
      // listing ID. The unique index arbitrates concurrent submissions.
      if (requestId) {
        const replay = await client.query(
          `select * from public.listings
            where owner_id = $1 and payload ->> 'requestId' = $2
            limit 1`,
          [ownerId, requestId],
        );
        if (replay.rows[0]) return { listing: toRecord(await this.fetchRecordById(client, replay.rows[0].id)), created: false, idempotent: true };
      }

      // A repeated explicit ID without a request key is idempotent only when
      // all caller-controlled listing fields match the original request.
      const existing = await this.fetchRecordById(client, id);
      if (existing && existing.owner_id === actor.supabaseUserId &&
          existing.title === title && existing.category_id === categoryId &&
          existing.subcategory === subcategory && existing.entity_type === entityType &&
          existing.price_unit === priceUnit && Number(existing.price) === price) {
        return { listing: toRecord(existing), created: false, idempotent: true };
      }
      throw new ProviderListingRepositoryError('LISTING_ID_CONFLICT', 409);
    });
  }

  async update(
    actor: ProviderListingActor,
    listingId: string,
    updates: Record<string, unknown>,
  ): Promise<{ listing: ProviderListingRecord; auditEventId: string | null } | null> {
    rejectEmbeddedMediaData(updates);
    if (!['provider', 'admin'].includes(actor.role)) {
      throw new ProviderListingRepositoryError('FORBIDDEN_PROVIDER_ROLE_REQUIRED', 403);
    }
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const { rows } = await client.query('select * from public.listings where id = $1 for update', [listingId]);
      const existing = rows[0];
      if (!existing) return null; // RLS hides another provider's row as not found.

      if (actor.role !== 'admin' && String(existing.owner_id) !== actor.supabaseUserId) {
        throw new ProviderListingRepositoryError('FORBIDDEN_NOT_LISTING_OWNER', 403);
      }

      const superAdmin = actor.role === 'admin' ? await this.isCurrentSuperAdmin(client) : false;

      const protectedFieldsRequested =
        updates.isVerified !== undefined
        || updates.providerAvailabilityStatus !== undefined
        || updates.verifiedBy !== undefined
        || updates.verifiedAt !== undefined;
      const featuredRequested = updates.isFeatured !== undefined;

      if (actor.role === 'admin') {
        if (!superAdmin) {
          await this.assertAdminAssignment(client, existing, listingId);
          if (protectedFieldsRequested || featuredRequested) {
            throw new ProviderListingRepositoryError(
              'SUPER_ADMIN_REQUIRED',
              403,
              'Verification, featured and moderation fields are Super Admin only.',
            );
          }
        }
      } else if (protectedFieldsRequested) {
        throw new ProviderListingRepositoryError('FORBIDDEN_VERIFICATION_FIELD', 403);
      }

      if (typeof updates.expectedUpdatedAt === 'string' && updates.expectedUpdatedAt) {
        const expected = new Date(updates.expectedUpdatedAt).getTime();
        const actual = new Date(existing.updated_at).getTime();
        if (!Number.isFinite(expected) || expected !== actual) {
          throw new ProviderListingRepositoryError('CONCURRENT_MODIFICATION', 409);
        }
      }

      const earlyCategory = updates.categoryId ?? updates.category_id;
      const earlyEntity = updates.entityType ?? updates.entity_type;
      if (
        isMovieListing(
          earlyCategory === undefined ? String(existing.category_id) : safeText(earlyCategory),
          earlyEntity === undefined ? String(existing.entity_type) : safeText(earlyEntity),
        )
      ) {
        throw new ProviderListingRepositoryError('MOVIES_MODULE_DISPLAY_ONLY', 409);
      }

      let validated: ReturnType<typeof validateListingPatch>;
      try {
        validated = validateListingPatch({
          actorRole: actor.role === 'admin' ? 'admin' : 'provider',
          existing,
          updates,
        });
      } catch (error) {
        this.mapValidationFailure(error);
      }

      if (actor.role === 'admin') {
        const categoryValue = updates.categoryId ?? updates.category_id;
        const entityValue = updates.entityType ?? updates.entity_type;
        const nextCategory = categoryValue === undefined ? String(existing.category_id) : safeText(categoryValue);
        const nextEntity = entityValue === undefined ? String(existing.entity_type) : safeText(entityValue);
        const nextModule = inferLiveEditModule({
          categoryId: nextCategory,
          entityType: nextEntity,
          payload: validated.payload ?? asPayload(existing.payload),
        });
        if (!superAdmin) {
          if (nextCategory !== String(existing.category_id) || nextModule !== inferLiveEditModule({
            categoryId: existing.category_id,
            entityType: existing.entity_type,
            payload: asPayload(existing.payload),
          })) {
            await this.assertNewListingAssignment(client, nextModule, nextCategory, listingId);
          }
        }
      }

      const nextTitle = updates.title === undefined ? existing.title : safeText(updates.title);
      if (!nextTitle || nextTitle.length < 2 || nextTitle.length > 160) {
        throw new ProviderListingRepositoryError('INVALID_LISTING_FIELDS', 400);
      }
      const categoryValue = updates.categoryId ?? updates.category_id;
      const nextCategory = categoryValue === undefined ? existing.category_id : safeText(categoryValue);
      const nextSubcategory = updates.subcategory === undefined ? existing.subcategory : safeText(updates.subcategory);
      const entityValue = updates.entityType ?? updates.entity_type;
      const nextEntityType = entityValue === undefined ? existing.entity_type : safeText(entityValue);
      const priceValue = updates.price === undefined ? Number(existing.price) : Number(updates.price);
      const priceUnitValue = updates.priceUnit ?? updates.price_unit;
      const nextPriceUnit = priceUnitValue === undefined ? existing.price_unit : safeText(priceUnitValue);
      if (!nextCategory || nextCategory.length > 80 || !nextSubcategory || nextSubcategory.length > 80 ||
          !nextEntityType || nextEntityType.length > 40 || !nextPriceUnit || nextPriceUnit.length > 40 ||
          !Number.isFinite(priceValue) || priceValue < 0 || priceValue > 1_000_000_000) {
        throw new ProviderListingRepositoryError('INVALID_LISTING_FIELDS', 400);
      }
      if (isMovieListing(nextCategory, nextEntityType)) {
        throw new ProviderListingRepositoryError('MOVIES_MODULE_DISPLAY_ONLY', 409);
      }
      let nextStatus = String(existing.status);
      if (updates.status !== undefined) {
        const requested = safeText(updates.status);
        if (!LISTING_STATUS.has(requested)) throw new ProviderListingRepositoryError('INVALID_LISTING_STATUS', 400);
        if (actor.role === 'admin') {
          if (!superAdmin && requested !== existing.status && !['archived', 'expired'].includes(requested)) {
            throw new ProviderListingRepositoryError('LISTING_REVIEW_ENDPOINT_REQUIRED', 409);
          }
          nextStatus = requested;
        } else if (!PROVIDER_SETTABLE_STATUS.has(requested)) {
          throw new ProviderListingRepositoryError('FORBIDDEN_ADMIN_APPROVAL_REQUIRED', 403);
        } else nextStatus = requested;
      }

      const existingPayload = asPayload(existing.payload);
      const validatedPayload = validated.payload ?? {};
      const incomingPayload = cleanPayload(validatedPayload);
      const payload = { ...cleanPayload(existingPayload), ...incomingPayload };
      // cleanPayload strips the protected isFeatured key; preserve the trusted
      // existing flag so an unrelated edit cannot accidentally clear (and then
      // be rejected as a moderation change by the database guard).
      if (existingPayload.isFeatured === true) payload.isFeatured = true;
      if (actor.role === 'admin' && updates.isFeatured !== undefined) {
        payload.isFeatured = updates.isFeatured === true;
      }
      const nextVerified = actor.role === 'admin' && updates.isVerified !== undefined
        ? updates.isVerified === true
        : existing.is_verified;
      const availability = updates.providerAvailabilityStatus === undefined
        ? existing.provider_availability_status
        : safeText(updates.providerAvailabilityStatus);
      if (!['not_reported', 'available', 'unavailable'].includes(availability)) {
        throw new ProviderListingRepositoryError('INVALID_PROVIDER_AVAILABILITY', 400);
      }
      payload.provider = existingPayload.provider || {};
      if (existingPayload.requestId) payload.requestId = existingPayload.requestId;

      let updated;
      try {
        updated = await client.query(
          `update public.listings
              set title = $2,
                  category_id = $3,
                  subcategory = $4,
                  entity_type = $5,
                  price = $6,
                  price_unit = $7,
                  status = $8,
                  payload = $9::jsonb,
                  is_verified = $10,
                  provider_availability_status = $11,
                  updated_at = now()
            where id = $1
            returning *`,
          [listingId, nextTitle, nextCategory, nextSubcategory, nextEntityType, priceValue, nextPriceUnit, nextStatus, JSON.stringify(payload), nextVerified, availability],
        );
      } catch (error) {
        this.mapDatabaseWriteFailure(error);
      }
      if (updated.rowCount !== 1) return null;
      const listing = toRecord(await this.fetchRecordById(client, listingId));
      const auditEventId = await this.latestAuditEventId(client, listingId);
      return { listing, auditEventId };
    });
  }

  async review(
    actor: ProviderListingActor,
    listingId: string,
    decision: 'active' | 'rejected',
  ): Promise<{ listing: ProviderListingRecord; idempotent: boolean } | null> {
    if (actor.role !== 'admin') throw new ProviderListingRepositoryError('FORBIDDEN_ADMIN_REQUIRED', 403);
    return this.transaction(actor, async (client) => {
      const profile = await this.requireActiveProfile(client, actor);
      if (profile.role !== 'admin') throw new ProviderListingRepositoryError('FORBIDDEN_ADMIN_REQUIRED', 403);
      const superAdmin = await this.isCurrentSuperAdmin(client);
      const { rows } = await client.query('select * from public.listings where id = $1 for update', [listingId]);
      const existing = rows[0];
      if (!existing) return null;
      if (!superAdmin) {
        await this.assertAdminAssignment(client, existing, listingId);
      }
      if (decision === 'active' && isMovieListing(String(existing.category_id || ''), String(existing.entity_type || ''))) {
        throw new ProviderListingRepositoryError('MOVIES_MODULE_DISPLAY_ONLY', 409);
      }
      if (existing.status === decision) {
        return { listing: toRecord(await this.fetchRecordById(client, listingId)), idempotent: true };
      }
      if (existing.status !== 'pending_approval') {
        throw new ProviderListingRepositoryError('LISTING_REVIEW_STATE_CONFLICT', 409);
      }
      await client.query("select set_config('bos.review_transition', 'on', true)");
      let updated;
      try {
        updated = await client.query(
          `update public.listings set status = $2, updated_at = now() where id = $1 returning id`,
          [listingId, decision],
        );
      } catch (error) {
        this.mapDatabaseWriteFailure(error);
      }
      if (updated.rowCount !== 1) return null;
      return { listing: toRecord(await this.fetchRecordById(client, listingId)), idempotent: false };
    });
  }

  async deactivate(actor: ProviderListingActor, listingId: string): Promise<{ listing: ProviderListingRecord; alreadyArchived: boolean } | null> {
    if (!['provider', 'admin'].includes(actor.role)) {
      throw new ProviderListingRepositoryError('FORBIDDEN_PROVIDER_ROLE_REQUIRED', 403);
    }
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const existing = await client.query('select * from public.listings where id = $1 for update', [listingId]);
      const row = existing.rows[0];
      if (!row) return null;
      if (actor.role === 'provider') {
        if (String(row.owner_id) !== actor.supabaseUserId) {
          throw new ProviderListingRepositoryError('FORBIDDEN_NOT_LISTING_OWNER', 403);
        }
      } else {
        const superAdmin = await this.isCurrentSuperAdmin(client);
        if (!superAdmin) await this.assertAdminAssignment(client, row, listingId);
      }
      if (row.status === 'archived') {
        return { listing: toRecord(await this.fetchRecordById(client, listingId)), alreadyArchived: true };
      }
      let result;
      try {
        result = await client.query(
          `update public.listings
              set status = 'archived', updated_at = now()
            where id = $1
            returning id`,
          [listingId],
        );
      } catch (error) {
        this.mapDatabaseWriteFailure(error);
      }
      if (result.rowCount !== 1) return null;
      return { listing: toRecord(await this.fetchRecordById(client, listingId)), alreadyArchived: false };
    });
  }

  /**
   * Authorize and audit a cinema screen edit in one database transaction.
   * `persist` writes the server-authoritative store; returning false rolls the
   * audit insert back, so a screen edit cannot be committed without its audit
   * event. If the transaction commit fails after `persist`, the HTTP layer
   * restores the previous store snapshot and reports failure.
   */
  async applyCinemaScreenEdit(
    actor: ProviderListingActor,
    input: {
      screenId: string;
      listingId: string;
      cinemaName: string;
      changedFields: string[];
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    },
    persist: () => boolean,
  ): Promise<{ auditEventId: string }> {
    if (!actor.supabaseUserId) {
      throw new ProviderListingRepositoryError('VERIFIED_AUTH_ID_REQUIRED', 401);
    }
    if (
      !input.screenId ||
      input.screenId.length > 160 ||
      (input.listingId && input.listingId.length > 160) ||
      !Array.isArray(input.changedFields) ||
      input.changedFields.length === 0 ||
      input.changedFields.length > 50
    ) {
      throw new ProviderListingRepositoryError('INVALID_CINEMA_FIELDS', 400);
    }
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      let allowed;
      try {
        allowed = await client.query(
          'select public.live_edit_cinema_actor_can_edit($1, $2) as allowed',
          [input.screenId, input.listingId || null],
        );
      } catch (error) {
        this.mapDatabaseWriteFailure(error);
      }
      if (allowed.rows[0]?.allowed !== true) {
        throw new ProviderListingRepositoryError(
          'FORBIDDEN_CINEMA_SCREEN',
          403,
          'This cinema screen is not owned by your account or covered by an assignment.',
        );
      }

      // This audit write is service-role-only. A caller-controlled custom GUC
      // is not an authorization boundary because set_config() is callable in
      // PostgreSQL sessions.
      await client.query('SET LOCAL ROLE service_role');
      await client.query("select set_config('request.jwt.claim.role','service_role',true)");
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: actor.supabaseUserId, role: 'service_role' }),
      ]);
      await client.query("select set_config('bos.live_edit_server', 'on', true)");
      let audit;
      try {
        audit = await client.query(
          `select public.record_live_edit_cinema_audit(
             $1, $2, $3, $4::text[], $5::jsonb, $6::jsonb
           ) as id`,
          [
            input.screenId,
            input.listingId || null,
            input.cinemaName || '',
            input.changedFields,
            JSON.stringify(input.before || {}),
            JSON.stringify(input.after || {}),
          ],
        );
      } catch (error) {
        this.mapDatabaseWriteFailure(error);
      }
      const auditEventId = audit.rows[0]?.id ? String(audit.rows[0].id) : '';
      if (!auditEventId) {
        throw new ProviderListingRepositoryError(
          'AUDIT_PERSISTENCE_FAILED',
          503,
          'The cinema screen change was not saved because its audit event could not be persisted.',
        );
      }

      let persisted = false;
      try {
        persisted = persist() === true;
      } catch {
        persisted = false;
      }
      if (!persisted) {
        throw new ProviderListingRepositoryError(
          'STORE_PERSISTENCE_FAILED',
          503,
          'The cinema store could not be persisted; the audit event was rolled back.',
        );
      }
      return { auditEventId };
    });
  }

  private cinemaScreenMatches(row: any, input: CinemaScreenInput): boolean {
    const normalize = (value: unknown) => stableCinemaJson(value ?? null);
    return (
      String(row.cinema_listing_id || '') === input.listingId
      && String(row.cinema_title || '') === input.cinemaName
      && String(row.screen_name || '') === input.screenName
      && String(row.area || '') === input.area
      && String(row.format || '') === input.format
      && String(row.sound_system || '') === input.soundSystem
      && Number(row.total_seats) === input.totalSeats
      && normalize(row.tiers) === normalize(input.tiers)
      && normalize(row.wheelchair_seats) === normalize(input.wheelchairSeats)
      && normalize(row.showtimes) === normalize(input.showtimes)
      && (row.cancellation_allowed !== false) === input.cancellationAllowed
      && Number(row.cancellation_cutoff_minutes) === input.cancellationCutoffMinutes
      && Number(row.refund_percent) === input.refundPercent
      && Number(row.convenience_fee_per_seat) === input.convenienceFeePerSeat
      && Number(row.gst_percent) === input.gstPercent
      && (row.fnb_delivery_enabled === true) === input.fnbDeliveryEnabled
    );
  }

  /**
   * Public discovery reads. The table's select policy is public, so this runs
   * as anon and does not require an authenticated session.
   */
  async listPublicCinemaScreens(): Promise<CinemaScreenRecord[]> {
    return this.transaction(null, async (client) => {
      const { rows } = await client.query(
        `select * from public.cinema_screens
          order by cinema_title asc, screen_name asc, id asc`,
      );
      return rows.map(toCinemaScreenRecord);
    });
  }

  async findPublicCinemaScreen(screenIdOrListing: string): Promise<CinemaScreenRecord | null> {
    if (!screenIdOrListing) return null;
    return this.transaction(null, async (client) => {
      const { rows } = await client.query(
        `select * from public.cinema_screens
          where id = $1 or cinema_listing_id = $1
          order by id asc
          limit 1`,
        [screenIdOrListing],
      );
      return rows[0] ? toCinemaScreenRecord(rows[0]) : null;
    });
  }

  async saveCinemaScreen(
    actor: ProviderListingActor,
    input: CinemaScreenInput,
  ): Promise<{ screen: CinemaScreenRecord; auditEventId: string | null; unchanged?: boolean }> {
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const authorized = await client.query(
        'select public.live_edit_cinema_actor_can_edit($1, $2) as allowed',
        [input.screenId, input.listingId],
      );
      if (authorized.rows[0]?.allowed !== true) {
        throw new ProviderListingRepositoryError(
          'FORBIDDEN_CINEMA_SCREEN',
          403,
          'This cinema screen is not owned by your account or covered by an assignment.',
        );
      }

      const existing = await client.query(
        `select * from public.cinema_screens where id = $1 for update`,
        [input.screenId],
      );
      const row = existing.rows[0];
      if (row && input.expectedUpdatedAt) {
        const expected = new Date(input.expectedUpdatedAt).getTime();
        const actual = new Date(row.updated_at).getTime();
        if (!Number.isFinite(expected) || expected !== actual) {
          throw new ProviderListingRepositoryError('CONCURRENT_MODIFICATION', 409);
        }
      }

      if (row && this.cinemaScreenMatches(row, input)) {
        return { screen: toCinemaScreenRecord(row), auditEventId: null, unchanged: true };
      }

      try {
        if (row) {
          await client.query(
            `update public.cinema_screens
                set cinema_listing_id = $2,
                    cinema_title = $3,
                    area = $4,
                    screen_name = $5,
                    format = $6,
                    sound_system = $7,
                    total_seats = $8,
                    tiers = $9::jsonb,
                    wheelchair_seats = $10::jsonb,
                    showtimes = $11::jsonb,
                    cancellation_allowed = $12,
                    cancellation_cutoff_minutes = $13,
                    refund_percent = $14,
                    convenience_fee_per_seat = $15,
                    gst_percent = $16,
                    fnb_delivery_enabled = $17,
                    updated_at = now()
              where id = $1`,
            [
              input.screenId,
              input.listingId,
              input.cinemaName,
              input.area,
              input.screenName,
              input.format,
              input.soundSystem,
              input.totalSeats,
              JSON.stringify(input.tiers),
              JSON.stringify(input.wheelchairSeats),
              JSON.stringify(input.showtimes),
              input.cancellationAllowed,
              input.cancellationCutoffMinutes,
              input.refundPercent,
              input.convenienceFeePerSeat,
              input.gstPercent,
              input.fnbDeliveryEnabled,
            ],
          );
        } else {
          await client.query(
            `insert into public.cinema_screens
               (id, cinema_listing_id, cinema_title, area, screen_name, format, sound_system,
                total_seats, tiers, seat_tiers, wheelchair_seats, showtimes, cancellation_allowed,
                cancellation_cutoff_minutes, refund_percent, convenience_fee_per_seat, gst_percent,
                fnb_delivery_enabled)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, '[]'::jsonb, $10::jsonb,
                     $11::jsonb, $12, $13, $14, $15, $16, $17)`,
            [
              input.screenId,
              input.listingId,
              input.cinemaName,
              input.area,
              input.screenName,
              input.format,
              input.soundSystem,
              input.totalSeats,
              JSON.stringify(input.tiers),
              JSON.stringify(input.wheelchairSeats),
              JSON.stringify(input.showtimes),
              input.cancellationAllowed,
              input.cancellationCutoffMinutes,
              input.refundPercent,
              input.convenienceFeePerSeat,
              input.gstPercent,
              input.fnbDeliveryEnabled,
            ],
          );
        }
      } catch (error) {
        this.mapDatabaseWriteFailure(error);
      }

      const saved = await client.query(
        `select * from public.cinema_screens where id = $1 limit 1`,
        [input.screenId],
      );
      if (!saved.rows[0]) {
        throw new ProviderListingRepositoryError('CINEMA_SCREEN_NOT_FOUND', 404);
      }
      const auditEventId = await this.latestAuditEventId(client, input.screenId);
      return { screen: toCinemaScreenRecord(saved.rows[0]), auditEventId };
    });
  }

  /** Super-Admin-only, verified ownership assignment / revocation. */
  async setCinemaScreenOwner(
    actor: ProviderListingActor,
    screenId: string,
    ownerUserId: string | null,
  ): Promise<{ screenId: string; ownerUserId: string | null; auditEventId: string | null }> {
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      if (!(await this.isCurrentSuperAdmin(client))) {
        throw new ProviderListingRepositoryError('SUPER_ADMIN_REQUIRED', 403);
      }
      const screen = await client.query(
        `select id, cinema_listing_id from public.cinema_screens where id = $1 for update`,
        [screenId],
      );
      if (!screen.rows[0]) {
        throw new ProviderListingRepositoryError('CINEMA_SCREEN_NOT_FOUND', 404);
      }
      if (ownerUserId) {
        if (!UUID_PATTERN.test(ownerUserId)) {
          throw new ProviderListingRepositoryError('INVALID_CINEMA_OWNER', 400);
        }
        const provider = await client.query(
          `select id from public.profiles
            where id = $1 and role = 'provider' and account_status = 'active'
            limit 1`,
          [ownerUserId],
        );
        if (!provider.rows[0]) {
          throw new ProviderListingRepositoryError('ACTIVE_PROVIDER_REQUIRED', 400);
        }
        try {
          await client.query(
            `insert into public.live_edit_cinema_screen_owners (screen_id, listing_id, owner_user_id)
             values ($1, $2, $3)
             on conflict (screen_id) do update
               set owner_user_id = excluded.owner_user_id,
                   listing_id = excluded.listing_id,
                   updated_at = now()`,
            [screenId, screen.rows[0].cinema_listing_id, ownerUserId],
          );
        } catch (error) {
          this.mapDatabaseWriteFailure(error);
        }
      } else {
        await client.query(
          'delete from public.live_edit_cinema_screen_owners where screen_id = $1',
          [screenId],
        );
      }
      const auditEventId = await this.latestAuditEventId(client, screenId);
      return { screenId, ownerUserId, auditEventId };
    });
  }

  private async fetchRecordById(client: PoolClient, id: string): Promise<any | null> {
    const { rows } = await client.query(
      `select l.*, p.full_name as provider_name, p.phone as provider_phone,
              coalesce(media.images, '[]'::jsonb) as public_media_images
         from public.listings l
         left join public.profiles p on p.id = l.owner_id
         left join lateral (
           select jsonb_agg(
                    'storage://' || asset.bucket_id || '/' || asset.object_path
                    order by asset.display_order, asset.created_at, asset.id
                  ) as images
             from public.media_assets asset
            where asset.owner_id = l.owner_id
              and asset.parent_type = 'provider_listing'
              and asset.parent_id = l.id
              and asset.bucket_id = 'bos-public-media'
              and asset.privacy = 'public'
              and asset.processing_status = 'ready'
         ) media on true
        where l.id = $1
        limit 1`,
      [id],
    );
    return rows[0] || null;
  }
}

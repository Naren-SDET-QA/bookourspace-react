import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

export interface ProviderListingActor {
  userId: string;
  supabaseUserId?: string;
  email?: string;
  name?: string;
  phone?: string;
  googleSub?: string;
  avatarUrl?: string;
  authProvider?: 'google';
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
    payload: cleanPayload(payload),
  };
}

function validateLocalConnectionString(connectionString: string): void {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('BOS_LISTINGS_DATABASE_URL_INVALID');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('BOS_LISTINGS_DATABASE_URL_INVALID');
  }
  const host = parsed.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error('BOS_LISTINGS_DATABASE_MUST_BE_LOOPBACK');
  }
}

/**
 * Transactional repository for the first local-only PostgreSQL vertical
 * slice. Every authenticated query runs as the `authenticated` DB role with
 * transaction-local claims derived from the server-signed session. RLS is an
 * additional owner/admin check, not a replacement for server role checks.
 */
export class ProviderListingRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    validateLocalConnectionString(connectionString);
    this.pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000 });
  }

  async verifyConnection(): Promise<void> {
    await this.pool.query('select 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
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
    if (environment.NODE_ENV === 'production') {
      throw new Error('BOS_LISTINGS_POSTGRES_REPOSITORY_LOCAL_ONLY');
    }
    return new ProviderListingRepository(connectionString);
  }

  private async transaction<T>(
    actor: ProviderListingActor | null,
    operation: (client: PoolClient) => Promise<T>,
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
    if (actor.authProvider !== 'google' || !actor.supabaseUserId || !UUID_PATTERN.test(actor.supabaseUserId)) {
      throw new ProviderListingRepositoryError('VERIFIED_GOOGLE_IDENTITY_REQUIRED', 401);
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
        `select l.*, p.full_name as provider_name, p.phone as provider_phone
           from public.listings l
           left join public.profiles p on p.id = l.owner_id
          where l.owner_id = auth.uid() or public.is_admin()
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
    return this.transaction(null, async (client) => {
      const { rows } = await client.query(
        `select l.*, l.payload #>> '{provider,name}' as provider_name, null::text as provider_phone
           from public.listings l
          where ${clauses.join(' and ')}
          order by l.updated_at desc, l.id
          limit 500`,
        values,
      );
      return rows.map(toRecord);
    });
  }

  /**
   * Public details read. Non-active rows are indistinguishable from missing
   * rows so the endpoint cannot be used to probe unapproved listings.
   */
  async findPublicById(listingId: string): Promise<ProviderListingRecord | null> {
    if (!listingId) return null;
    return this.transaction(null, async (client) => {
      const { rows } = await client.query(
        `select l.*, l.payload #>> '{provider,name}' as provider_name, null::text as provider_phone
           from public.listings l
          where l.id = $1 and l.status = 'active'
          limit 1`,
        [listingId],
      );
      return rows[0] ? toRecord(rows[0]) : null;
    });
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
      const existing = await client.query('select * from public.listings where id = $1 for update', [listingId]);
      const row = existing.rows[0];
      if (!row) throw new ProviderListingRepositoryError('LISTING_NOT_FOUND', 404);
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

      await client.query(
        `update public.listings
            set status = $2, price = $3, payload = $4::jsonb, updated_at = now()
          where id = $1`,
        [listingId, status ?? row.status, price, JSON.stringify(payload)],
      );
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
      const isVerified = actor.role === 'admin' && input.isVerified === true;
      // Admin creation is still a draft operation. Publication can happen only
      // through the separate, locked review endpoint after this transaction.
      // Ignore caller-supplied `status` for every role so there is no alternate
      // route around the review state machine.
      const insertStatus = 'pending_approval';
      const sourcePayload = input.payload === undefined ? asPayload(input) : asPayload(input.payload);
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

  async update(actor: ProviderListingActor, listingId: string, updates: Record<string, unknown>): Promise<ProviderListingRecord | null> {
    if (!['provider', 'admin'].includes(actor.role)) {
      throw new ProviderListingRepositoryError('FORBIDDEN_PROVIDER_ROLE_REQUIRED', 403);
    }
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const { rows } = await client.query('select * from public.listings where id = $1 for update', [listingId]);
      const existing = rows[0];
      if (!existing) return null; // RLS hides another provider's row as not found.

      if (typeof updates.expectedUpdatedAt === 'string' && updates.expectedUpdatedAt) {
        const expected = new Date(updates.expectedUpdatedAt).getTime();
        const actual = new Date(existing.updated_at).getTime();
        if (!Number.isFinite(expected) || expected !== actual) {
          throw new ProviderListingRepositoryError('CONCURRENT_MODIFICATION', 409);
        }
      }
      if ((updates.isVerified !== undefined || updates.providerAvailabilityStatus !== undefined) && actor.role !== 'admin') {
        throw new ProviderListingRepositoryError('FORBIDDEN_VERIFICATION_FIELD', 403);
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
          if (requested !== existing.status && !['archived', 'expired'].includes(requested)) {
            throw new ProviderListingRepositoryError('LISTING_REVIEW_ENDPOINT_REQUIRED', 409);
          }
          nextStatus = requested;
        }
        else if (!PROVIDER_SETTABLE_STATUS.has(requested)) {
          throw new ProviderListingRepositoryError('FORBIDDEN_ADMIN_APPROVAL_REQUIRED', 403);
        } else nextStatus = requested;
      }
      if (actor.role !== 'admin' && existing.owner_id !== actor.supabaseUserId) {
        throw new ProviderListingRepositoryError('FORBIDDEN_NOT_LISTING_OWNER', 403);
      }
      const existingPayload = asPayload(existing.payload);
      const incomingPayload = cleanPayload(updates.payload);
      const payload = { ...cleanPayload(existingPayload), ...incomingPayload };
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

      const updated = await client.query(
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
      return updated.rowCount === 1 ? toRecord(await this.fetchRecordById(client, listingId)) : null;
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
      const { rows } = await client.query('select * from public.listings where id = $1 for update', [listingId]);
      const existing = rows[0];
      if (!existing) return null;
      if (decision === 'active' && isMovieListing(String(existing.category_id || ''), String(existing.entity_type || ''))) {
        throw new ProviderListingRepositoryError('MOVIES_MODULE_DISPLAY_ONLY', 409);
      }
      if (existing.status === decision) {
        return { listing: toRecord(await this.fetchRecordById(client, listingId)), idempotent: true };
      }
      if (existing.status !== 'pending_approval') {
        throw new ProviderListingRepositoryError('LISTING_REVIEW_STATE_CONFLICT', 409);
      }
      const updated = await client.query(
        `update public.listings set status = $2, updated_at = now() where id = $1 returning id`,
        [listingId, decision],
      );
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
      if (!existing.rows[0]) return null;
      if (existing.rows[0].status === 'archived') {
        return { listing: toRecord(await this.fetchRecordById(client, listingId)), alreadyArchived: true };
      }
      const result = await client.query(
        `update public.listings
            set status = 'archived', updated_at = now()
          where id = $1
          returning id`,
        [listingId],
      );
      if (result.rowCount !== 1) return null;
      return { listing: toRecord(await this.fetchRecordById(client, listingId)), alreadyArchived: false };
    });
  }

  private async fetchRecordById(client: PoolClient, id: string): Promise<any | null> {
    const { rows } = await client.query(
      `select l.*, p.full_name as provider_name, p.phone as provider_phone
         from public.listings l
         left join public.profiles p on p.id = l.owner_id
        where l.id = $1
        limit 1`,
      [id],
    );
    return rows[0] || null;
  }
}

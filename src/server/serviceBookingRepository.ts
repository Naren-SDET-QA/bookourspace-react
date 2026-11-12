import { type Pool, type PoolClient } from 'pg';
import {
  ProviderListingRepositoryError,
  type ProviderListingActor,
} from './providerListingRepository';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { closeSharedPostgresPool, getSharedPostgresPool } from './postgresPool';
import {
  assertServiceBookingWindow,
  computeServiceBookingAmount,
  isMedicineServiceCategory,
  normalizeServiceBookingDocuments,
  normalizeServiceBookingFieldValues,
  normalizeServiceCategoryConfig,
  normalizeServiceRecurrence,
  type ServiceBookingDocumentView,
  type ServiceBookingFieldValues,
  type ServiceCategoryConfig,
  type ServiceDocumentInput,
  type ServiceRecurrenceFrequency,
} from '../lib/serviceCatalog';
import { hasVerifiedSupabaseIdentity, type VerifiedAuthProvider } from './authIdentity';

/**
 * Server-authoritative Services booking repository.
 *
 * It shares the canonical local PostgreSQL selector with the provider-listing
 * repository (`BOS_LISTINGS_DATABASE_URL`) so there is one database source and
 * no split-brain configuration. It is deliberately local-only and refuses to
 * start in production until durable, hosted configuration is approved.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_MODES = new Set(['pay_after_service', 'upi_qr', 'upi_intent', 'razorpay']);
const LIVE_STATUSES = ['requested', 'accepted', 'in_progress'];

export type ServiceBookingStatus = 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'rejected';
export type ServicePaymentStatus = 'due' | 'declared' | 'settled' | 'refunded' | 'failed' | 'waived';
export type ServiceBookingAction = 'accept' | 'reject' | 'start' | 'complete' | 'cancel' | 'reschedule';

export interface ServiceBookingRecord {
  id: string;
  bookingRef: string;
  listingId: string;
  listingTitle: string;
  customerId: string;
  providerId: string;
  categoryId: string;
  subcategory: string;
  scheduledDate: string;
  timeSlot: string;
  serviceAddress: string;
  addressNotes: string | null;
  customerPhone: string;
  notes: string | null;
  status: ServiceBookingStatus;
  paymentMode: string;
  paymentStatus: ServicePaymentStatus;
  amount: number;
  currency: string;
  amountBasis: string;
  categoryConfigId: string | null;
  categoryConfigVersion: number | null;
  quantity: number;
  recurrenceFrequency: ServiceRecurrenceFrequency;
  recurrenceOccurrences: number | null;
  paymentEnabled: boolean;
  assignmentMode: 'customer_selects' | 'platform_managed' | 'admin_assigns';
  deliveryMode: 'on_site' | 'home_delivery' | 'pickup' | 'digital';
  fieldValues: ServiceBookingFieldValues;
  documents: ServiceBookingDocumentView[];
  trackingEnabled: boolean;
  liveMapEnabled: boolean;
  otpEnabled: boolean;
  deliveryConfirmationEnabled: boolean;
  deliveryConfirmedAt: string | null;
  prescriptionStatus: 'not_required' | 'pending' | 'verified' | 'rejected';
  cancellationReason: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServicePaymentClaimRecord {
  id: string;
  bookingId: string;
  bookingRef: string;
  claimedBy: string;
  method: 'cash' | 'upi' | 'razorpay';
  reference: string | null;
  evidenceNote: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface ServiceReviewRecord {
  id: string;
  bookingId: string;
  listingId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface ServiceEarningsSummary {
  completedJobs: number;
  grossAmount: number;
  settledAmount: number;
  outstandingAmount: number;
}

export class ServiceBookingRepositoryError extends ProviderListingRepositoryError {
  constructor(code: string, httpStatus: number, message = code) {
    super(code, httpStatus, message);
    this.name = 'ServiceBookingRepositoryError';
  }
}

function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function iso(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : value ? String(value) : null;
}

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function toBooking(row: any): ServiceBookingRecord {
  return {
    id: String(row.id),
    bookingRef: String(row.booking_ref),
    listingId: String(row.listing_id),
    listingTitle: String(row.listing_title || ''),
    customerId: String(row.customer_id),
    providerId: String(row.provider_id),
    categoryId: String(row.category_id || ''),
    subcategory: String(row.subcategory || ''),
    scheduledDate: isoDate(row.scheduled_date),
    timeSlot: String(row.time_slot || ''),
    serviceAddress: String(row.service_address || ''),
    addressNotes: row.address_notes ?? null,
    customerPhone: String(row.customer_phone || ''),
    notes: row.notes ?? null,
    status: row.status as ServiceBookingStatus,
    paymentMode: String(row.payment_mode),
    paymentStatus: row.payment_status as ServicePaymentStatus,
    amount: Number(row.amount || 0),
    currency: String(row.currency || 'INR'),
    amountBasis: String(row.amount_basis || 'listing_price'),
    categoryConfigId: row.category_config_id ? String(row.category_config_id) : null,
    categoryConfigVersion: row.category_config_version === null || row.category_config_version === undefined
      ? null
      : Number(row.category_config_version),
    quantity: Number(row.quantity || 1),
    recurrenceFrequency: (row.recurrence_frequency || 'none') as ServiceRecurrenceFrequency,
    recurrenceOccurrences: row.recurrence_occurrences === null || row.recurrence_occurrences === undefined
      ? null
      : Number(row.recurrence_occurrences),
    paymentEnabled: row.payment_enabled !== false,
    assignmentMode: (row.assignment_mode || 'customer_selects') as ServiceBookingRecord['assignmentMode'],
    deliveryMode: (row.delivery_mode || 'on_site') as ServiceBookingRecord['deliveryMode'],
    fieldValues: (row.field_values && typeof row.field_values === 'object' ? row.field_values : {}) as ServiceBookingFieldValues,
    documents: Array.isArray(row.documents) ? row.documents : [],
    trackingEnabled: row.delivery_profile ? row.delivery_profile.tracking_enabled !== false : true,
    liveMapEnabled: row.delivery_profile ? row.delivery_profile.live_map_enabled !== false : true,
    otpEnabled: row.delivery_profile ? row.delivery_profile.otp_enabled !== false : true,
    deliveryConfirmationEnabled: row.delivery_profile ? row.delivery_profile.delivery_confirmation_enabled === true : false,
    deliveryConfirmedAt: row.delivery_profile ? iso(row.delivery_profile.delivery_confirmed_at) : null,
    prescriptionStatus: (row.delivery_profile?.prescription_status || 'not_required') as ServiceBookingRecord['prescriptionStatus'],
    cancellationReason: row.cancellation_reason ?? null,
    acceptedAt: iso(row.accepted_at),
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    cancelledAt: iso(row.cancelled_at),
    createdAt: iso(row.created_at) || '',
    updatedAt: iso(row.updated_at) || '',
  };
}

function toClaim(row: any): ServicePaymentClaimRecord {
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    bookingRef: String(row.booking_ref || ''),
    claimedBy: String(row.claimed_by),
    method: row.method,
    reference: row.reference ?? null,
    evidenceNote: String(row.evidence_note || ''),
    amount: Number(row.amount || 0),
    status: row.status,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: iso(row.reviewed_at),
    reviewNote: row.review_note ?? null,
    createdAt: iso(row.created_at) || '',
  };
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const candidate = error as { code?: string; constraint?: string; detail?: string; message?: string };
  if (candidate?.code !== '23505') return false;
  return [candidate.constraint, candidate.detail, candidate.message].filter(Boolean).some((text) => String(text).includes(constraint));
}

/**
 * Two indexes guard a provider slot: the legacy free-text one and the canonical
 * 'HH:MM' one. Both mean the same thing to a caller: that slot is taken.
 */
function isSlotConflict(error: unknown): boolean {
  return (
    isUniqueViolation(error, 'uniq_service_booking_active_slot')
    || isUniqueViolation(error, 'uniq_service_booking_canonical_slot')
  );
}

function validateFutureDate(raw: string): string {
  const date = safeText(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ServiceBookingRepositoryError('INVALID_SERVICE_DATE', 400);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ServiceBookingRepositoryError('INVALID_SERVICE_DATE', 400);
  }
  if (date < new Date().toISOString().slice(0, 10)) {
    throw new ServiceBookingRepositoryError('SERVICE_DATE_IN_PAST', 400);
  }
  return date;
}

/**
 * Canonical 'HH:MM' slot key.
 *
 * Free-text slots allowed '9 AM', '09:00' and '9:00 AM' to coexist as three
 * different bookings of the same provider hour. Normalising the key makes the
 * per-provider unique index meaningful.
 */
function normalizeSlotKey(raw: string): string | null {
  const value = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  const withMinutes = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (withMinutes) {
    let hours = Number(withMinutes[1]);
    const minutes = Number(withMinutes[2]);
    const meridiem = withMinutes[3];
    if (minutes > 59) return null;
    if (meridiem) {
      if (hours < 1 || hours > 12) return null;
      hours = hours % 12;
      if (meridiem === 'PM') hours += 12;
    }
    if (hours > 23) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  const hourOnly = value.match(/^(\d{1,2})\s*(AM|PM)$/);
  if (hourOnly) {
    const hours = Number(hourOnly[1]);
    if (hours < 1 || hours > 12) return null;
    return `${String((hours % 12) + (hourOnly[2] === 'PM' ? 12 : 0)).padStart(2, '0')}:00`;
  }
  return null;
}

export class ServiceBookingRepository {
  private readonly pool: Pool;
  private readonly tenantId: string;

  constructor(connectionString: string, environment: NodeJS.ProcessEnv = process.env) {
    assertPostgresConnectionTarget(connectionString, environment);
    this.pool = getSharedPostgresPool(connectionString, environment);
    this.tenantId = String(environment.BOS_SERVICE_TENANT_ID || 'default').trim() || 'default';
  }

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): ServiceBookingRepository | null {
    const connectionString = String(environment.BOS_LISTINGS_DATABASE_URL || '').trim();
    if (String(environment.BOS_PG_URL || '').trim()) {
      throw new Error('BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL');
    }
    if (!connectionString) return null;
    assertPostgresConnectionTarget(connectionString, environment);
    return new ServiceBookingRepository(connectionString, environment);
  }

  async verifyConnection(): Promise<void> {
    await this.pool.query('select 1');
  }

  async close(): Promise<void> {
    await closeSharedPostgresPool();
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
        ? { sub: actor.supabaseUserId, role: 'authenticated', aal: 'aal1' }
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
        // Preserve the original database failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async requireActiveProfile(client: PoolClient, actor: ProviderListingActor): Promise<any> {
    if (!hasVerifiedSupabaseIdentity(actor)) {
      throw new ServiceBookingRepositoryError('VERIFIED_AUTH_ID_REQUIRED', 401);
    }
    const { rows } = await client.query(
      'select id, email, full_name, phone, role, account_status from public.profiles where id = auth.uid() limit 1',
    );
    const profile = rows[0];
    if (!profile || profile.account_status !== 'active') {
      throw new ServiceBookingRepositoryError('ACTIVE_PROFILE_REQUIRED', 403);
    }
    if (profile.role !== actor.role) {
      throw new ServiceBookingRepositoryError('SESSION_ROLE_MISMATCH', 403);
    }
    return profile;
  }

  /**
   * Enforces the provider's published window. Without a published schedule the
   * documented default (06:00–23:00, every day) applies, so existing bookings
   * and the provider tests keep working while a real schedule always wins.
   */
  private async assertSlotWindow(
    client: PoolClient,
    listingId: string,
    scheduledDate: string,
    slotKey: string,
  ): Promise<void> {
    // Customer transactions run with the authenticated Data API role. Read
    // only the public active-listing availability projection here; direct
    // schedule and blackout rows are intentionally private to providers/admins.
    const { rows } = await client.query(
      `select count(*)::integer as day_slot_count,
              count(*) filter (where slot_key = $3)::integer as matching_slot_count
         from public.service_listing_slots($1, $2::date, $2::date)`,
      [listingId, scheduledDate, slotKey],
    );
    const daySlotCount = Number(rows[0]?.day_slot_count || 0);
    const matchingSlotCount = Number(rows[0]?.matching_slot_count || 0);
    if (daySlotCount === 0) {
      throw new ServiceBookingRepositoryError('SERVICE_DATE_UNAVAILABLE', 409);
    }
    if (matchingSlotCount === 0) {
      throw new ServiceBookingRepositoryError('SERVICE_SLOT_UNAVAILABLE', 409);
    }
  }

  private async hydrateBookings(client: PoolClient, rows: any[]): Promise<ServiceBookingRecord[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => String(row.id));
    const [fieldResult, documentResult, deliveryResult] = await Promise.all([
      client.query('select booking_id, data from public.service_booking_field_values where booking_id = any($1::uuid[])', [ids]),
      client.query(
        `select id, booking_id, document_key, document_reference, file_name, mime_type,
                status, review_note, reviewed_at, created_at
           from public.service_booking_documents
          where booking_id = any($1::uuid[])
          order by created_at, id`,
        [ids],
      ),
      client.query(
        `select booking_id, tracking_enabled, live_map_enabled, otp_enabled,
                delivery_confirmation_enabled, delivery_confirmed_at, prescription_status
           from public.service_delivery_profiles
          where booking_id = any($1::uuid[])`,
        [ids],
      ),
    ]);
    const fieldMap = new Map<string, ServiceBookingFieldValues>();
    for (const row of fieldResult.rows) fieldMap.set(String(row.booking_id), row.data || {});
    const documentMap = new Map<string, ServiceBookingDocumentView[]>();
    for (const row of documentResult.rows) {
      const list = documentMap.get(String(row.booking_id)) || [];
      list.push({
        id: String(row.id),
        documentKey: String(row.document_key),
        reference: String(row.document_reference),
        fileName: row.file_name ?? null,
        mimeType: row.mime_type ?? null,
        status: row.status,
        reviewNote: row.review_note ?? null,
        reviewedAt: iso(row.reviewed_at),
        createdAt: iso(row.created_at) || '',
      });
      documentMap.set(String(row.booking_id), list);
    }
    const deliveryMap = new Map<string, any>();
    for (const row of deliveryResult.rows) deliveryMap.set(String(row.booking_id), row);
    return rows.map((row) => toBooking({
      ...row,
      field_values: fieldMap.get(String(row.id)) || {},
      documents: documentMap.get(String(row.id)) || [],
      delivery_profile: deliveryMap.get(String(row.id)) || null,
    }));
  }

  private async hydrateBooking(client: PoolClient, row: any): Promise<ServiceBookingRecord> {
    const [booking] = await this.hydrateBookings(client, [row]);
    return booking;
  }

  private async fetchBooking(client: PoolClient, id: string): Promise<any | null> {
    const { rows } = await client.query(
      `select b.*, l.title as listing_title
         from public.service_bookings b
         join public.listings l on l.id = b.listing_id
        where b.id = $1
        limit 1`,
      [id],
    );
    return rows[0] || null;
  }

  private async appendEvent(
    client: PoolClient,
    bookingId: string,
    actor: ProviderListingActor,
    fromStatus: string | null,
    toStatus: string,
    note: string,
  ): Promise<void> {
    await client.query(
      `insert into public.service_booking_events
        (booking_id, actor_id, actor_role, from_status, to_status, note)
       values ($1, auth.uid(), $2, $3, $4, NULLIF($5, ''))`,
      [bookingId, actor.role, fromStatus, toStatus, note.slice(0, 1000)],
    );
  }

  async createBooking(actor: ProviderListingActor, input: Record<string, unknown>): Promise<{ booking: ServiceBookingRecord; idempotent: boolean }> {
    if (actor.role !== 'customer') throw new ServiceBookingRepositoryError('CUSTOMER_SESSION_REQUIRED', 403);
    const idempotencyKey = safeText(input.idempotencyKey);
    if (!UUID_PATTERN.test(idempotencyKey)) throw new ServiceBookingRepositoryError('INVALID_IDEMPOTENCY_KEY', 400);
    const listingId = safeText(input.listingId);
    if (!listingId) throw new ServiceBookingRepositoryError('LISTING_ID_REQUIRED', 400);
    const scheduledDate = validateFutureDate(safeText(input.scheduledDate));
    const timeSlot = safeText(input.timeSlot);
    if (!timeSlot || timeSlot.length > 60) throw new ServiceBookingRepositoryError('INVALID_TIME_SLOT', 400);
    const slotKey = normalizeSlotKey(timeSlot);
    if (!slotKey) throw new ServiceBookingRepositoryError('INVALID_TIME_SLOT', 400);
    const serviceAddress = safeText(input.serviceAddress);
    if (serviceAddress.length < 5 || serviceAddress.length > 500) throw new ServiceBookingRepositoryError('INVALID_SERVICE_ADDRESS', 400);
    const customerPhone = safeText(input.customerPhone);
    if (!/^\+?[0-9][0-9\s().-]{5,22}$/.test(customerPhone)) throw new ServiceBookingRepositoryError('INVALID_CUSTOMER_PHONE', 400);
    let paymentMode = safeText(input.paymentMode, 'pay_after_service');
    if (!PAYMENT_MODES.has(paymentMode)) throw new ServiceBookingRepositoryError('INVALID_PAYMENT_MODE', 400);
    const notes = safeText(input.notes).slice(0, 2000);
    const addressNotes = safeText(input.addressNotes).slice(0, 500);
    const requestedConfigId = safeText(input.categoryConfigId);

    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);

      const existing = await client.query(
        `select b.*, l.title as listing_title from public.service_bookings b
           join public.listings l on l.id = b.listing_id
          where b.customer_id = auth.uid() and b.idempotency_key = $1 limit 1`,
        [idempotencyKey],
      );
      if (existing.rows[0]) {
        const replay = existing.rows[0];
        if (replay.listing_id !== listingId || isoDate(replay.scheduled_date) !== scheduledDate || replay.time_slot !== timeSlot) {
          throw new ServiceBookingRepositoryError('IDEMPOTENCY_KEY_CONFLICT', 409);
        }
        return { booking: await this.hydrateBooking(client, replay), idempotent: true };
      }

      const listing = await client.query(
        `select l.id, l.title, l.owner_id, l.category_id, l.subcategory, l.price, l.price_unit, l.status, l.entity_type
           from public.listings l
          where l.id = $1 limit 1`,
        [listingId],
      );
      const row = listing.rows[0];
      if (!row || row.status !== 'active' || String(row.entity_type || '').toLowerCase() !== 'service') {
        throw new ServiceBookingRepositoryError('SERVICE_LISTING_NOT_AVAILABLE', 404);
      }
      if (!row.owner_id) throw new ServiceBookingRepositoryError('SERVICE_PROVIDER_NOT_AVAILABLE', 409);

      let categoryConfigId: string | null = null;
      let categoryConfigVersion: number | null = null;
      let configSnapshot: ServiceCategoryConfig | null = null;
      let quantity = 1;
      let recurrenceFrequency: ServiceRecurrenceFrequency = 'none';
      let recurrenceOccurrences: number | null = null;
      let paymentEnabled = true;
      let assignmentMode: ServiceBookingRecord['assignmentMode'] = 'customer_selects';
      let deliveryMode: ServiceBookingRecord['deliveryMode'] = 'on_site';
      let amount = Number(row.price || 0);
      let amountBasis = String(row.price_unit || 'listed price');
      let fieldValues: ServiceBookingFieldValues = {};
      let documents: ServiceDocumentInput[] = [];

      const configId = requestedConfigId || String(row.category_id || '');
      if (configId) {
        const configResult = await client.query(
          `select category.id, category.enabled, version.version_number, version.config
             from public.service_category_configs category
             join public.service_category_config_versions version on version.id = category.current_version_id
            where category.id = $1 and category.tenant_id = $2
            limit 1`,
          [configId, this.tenantId],
        );
        const configRow = configResult.rows[0];
        if (!configRow) {
          if (requestedConfigId) throw new ServiceBookingRepositoryError('SERVICE_CATEGORY_NOT_FOUND', 404);
        } else {
          if (configRow.enabled !== true) throw new ServiceBookingRepositoryError('SERVICE_CATEGORY_DISABLED', 409);
          let normalized: ServiceCategoryConfig;
          try {
            normalized = normalizeServiceCategoryConfig(String(configRow.id), configRow.config);
          } catch (error) {
            const code = (error as { code?: string }).code || 'SERVICE_CATALOG_INVALID_CONFIG';
            throw new ServiceBookingRepositoryError(code, 400);
          }
          if (String(row.category_id || '') !== String(configRow.id)
              && !normalized.legacyCategoryIds.includes(String(row.category_id || ''))) {
            throw new ServiceBookingRepositoryError('SERVICE_CATEGORY_LISTING_MISMATCH', 409);
          }
          categoryConfigId = String(configRow.id);
          categoryConfigVersion = Number(configRow.version_number);
          configSnapshot = normalized;
          paymentEnabled = normalized.toggles.payment;
          if (!paymentEnabled) paymentMode = 'pay_after_service';
          assignmentMode = normalized.providerAssignment;
          const requestedDeliveryMode = safeText(input.deliveryMode, normalized.deliveryModes[0] || 'on_site');
          if (!normalized.deliveryModes.includes(requestedDeliveryMode as any)) {
            throw new ServiceBookingRepositoryError('SERVICE_DELIVERY_MODE_NOT_ALLOWED', 400);
          }
          deliveryMode = requestedDeliveryMode as ServiceBookingRecord['deliveryMode'];

          try {
            assertServiceBookingWindow(normalized, scheduledDate, timeSlot);
            const recurrenceInput = (input.recurrence && typeof input.recurrence === 'object')
              ? input.recurrence as Record<string, unknown>
              : null;
            const recurrence = normalizeServiceRecurrence(
              normalized,
              normalized.bookingType === 'recurring' && normalized.recurring.enabled
                ? recurrenceInput || { frequency: normalized.recurring.defaultFrequency }
                : recurrenceInput,
            );
            recurrenceFrequency = recurrence.frequency;
            recurrenceOccurrences = recurrence.occurrences;
            const priced = computeServiceBookingAmount(normalized, Number(row.price || 0), input.quantity);
            amount = priced.amount;
            quantity = priced.quantity;
            amountBasis = priced.basis;
            fieldValues = normalizeServiceBookingFieldValues(normalized, input.fieldValues);
            documents = normalizeServiceBookingDocuments(normalized, input.documents);
          } catch (error) {
            const code = (error as { code?: string }).code || 'SERVICE_CATALOG_INVALID_CONFIG';
            throw new ServiceBookingRepositoryError(code, 400);
          }

          if (isMedicineServiceCategory(categoryConfigId, normalized)) {
            // Provider credentials are deliberately not customer-readable via
            // RLS. The security-definer predicate answers only yes/no.
            const licence = await client.query(
              'select public.service_provider_has_license($1,$2) as licensed',
              [row.owner_id, categoryConfigId],
            );
            if (licence.rows[0]?.licensed !== true) {
              throw new ServiceBookingRepositoryError('LICENSED_PHARMACY_REQUIRED', 409);
            }
          }
        }
      }

      // Availability is checked against the provider's own schedule, blackout
      // dates and opening window before the row is attempted.
      await this.assertSlotWindow(client, listingId, scheduledDate, slotKey);

      try {
        const inserted = await client.query(
          `insert into public.service_bookings
            (idempotency_key, listing_id, customer_id, provider_id, category_id, subcategory,
             scheduled_date, time_slot, slot_key, service_address, address_notes, customer_phone, notes,
             status, payment_mode, payment_status, amount, amount_basis,
             category_config_id, category_config_version, config_snapshot, quantity,
             recurrence_frequency, recurrence_occurrences, payment_enabled, assignment_mode, delivery_mode)
           values ($1, $2, auth.uid(), $3, $4, $5, $6, $7, $15, $8, NULLIF($9, ''), $10, NULLIF($11, ''),
                   'requested', $12, 'due', $13, $14, $16, $17, $18::jsonb, $19, $20, $21, $22, $23, $24)
           returning id`,
          [
            idempotencyKey, listingId, row.owner_id, String(row.category_id || ''), String(row.subcategory || ''),
            scheduledDate, timeSlot, serviceAddress, addressNotes, customerPhone, notes,
            paymentMode, amount, amountBasis, slotKey,
            categoryConfigId, categoryConfigVersion,
            configSnapshot ? JSON.stringify(configSnapshot) : null,
            quantity, recurrenceFrequency, recurrenceOccurrences, paymentEnabled, assignmentMode, deliveryMode,
          ],
        );
        const bookingId = String(inserted.rows[0].id);
        if (configSnapshot) {
          await client.query(
            `insert into public.service_booking_field_values (booking_id, data)
             values ($1, $2::jsonb)
             on conflict (booking_id) do update set data = excluded.data, updated_at = now()`,
            [bookingId, JSON.stringify(fieldValues)],
          );
          for (const document of documents) {
            await client.query(
              `insert into public.service_booking_documents
                (booking_id, document_key, document_reference, file_name, mime_type, status, uploaded_by)
               values ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), 'pending', auth.uid())
               on conflict (booking_id, document_key) do update
                 set document_reference = excluded.document_reference,
                     file_name = excluded.file_name,
                     mime_type = excluded.mime_type,
                     status = 'pending', reviewed_by = null, reviewed_at = null, review_note = null,
                     updated_at = now()`,
              [bookingId, document.key, document.reference, document.fileName || '', document.mimeType || ''],
            );
          }
        }
        await this.appendEvent(client, bookingId, actor, null, 'requested', 'Service booking requested');
        const booking = await this.fetchBooking(client, bookingId);
        return { booking: await this.hydrateBooking(client, booking), idempotent: false };
      } catch (error) {
        if (isSlotConflict(error)) {
          throw new ServiceBookingRepositoryError('SERVICE_SLOT_ALREADY_BOOKED', 409);
        }
        if (isUniqueViolation(error, 'service_bookings_customer_idempotency')) {
          throw new ServiceBookingRepositoryError('DUPLICATE_BOOKING_REQUEST', 409);
        }
        const message = error instanceof Error ? error.message : String(error);
        const dynamic: Array<[string, number]> = [
          ['SERVICE_REQUIRED_DOCUMENTS_MISSING', 400],
          ['SERVICE_REQUIRED_FIELDS_MISSING', 400],
          ['MEDICINE_PRESCRIPTION_REQUIRED', 409],
          ['LICENSED_PHARMACY_REQUIRED', 409],
          ['SERVICE_CATEGORY_DISABLED', 409],
          ['PAYMENT_DISABLED_FOR_SERVICE', 409],
          ['SERVICE_BOOKING_CONFIG_IMMUTABLE', 409],
        ];
        for (const [code, status] of dynamic) {
          if (message.includes(code)) throw new ServiceBookingRepositoryError(code, status);
        }
        throw error;
      }
    });
  }

  async listForActor(actor: ProviderListingActor): Promise<ServiceBookingRecord[]> {
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const scope = actor.role === 'admin'
        ? 'true'
        : actor.role === 'provider'
          ? 'b.provider_id = auth.uid()'
          : 'b.customer_id = auth.uid()';
      const { rows } = await client.query(
        `select b.*, l.title as listing_title
           from public.service_bookings b
           join public.listings l on l.id = b.listing_id
          where ${scope}
          order by case b.status when 'requested' then 0 when 'accepted' then 1 when 'in_progress' then 2 else 3 end,
                   b.scheduled_date desc, b.created_at desc
          limit 500`,
      );
      return this.hydrateBookings(client, rows);
    });
  }

  async transition(
    actor: ProviderListingActor,
    bookingId: string,
    action: ServiceBookingAction,
    payload: Record<string, unknown> = {},
  ): Promise<{ booking: ServiceBookingRecord; idempotent: boolean }> {
    if (!UUID_PATTERN.test(bookingId)) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const { rows } = await client.query('select * from public.service_bookings where id = $1 for update', [bookingId]);
      const booking = rows[0];
      if (!booking) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);

      const isCustomer = booking.customer_id === actor.supabaseUserId;
      const isProvider = booking.provider_id === actor.supabaseUserId;
      const isAdmin = actor.role === 'admin';
      if (!isCustomer && !isProvider && !isAdmin) throw new ServiceBookingRepositoryError('BOOKING_FORBIDDEN', 403);

      let dynamicConfig: ServiceCategoryConfig | null = null;
      if (booking.config_snapshot && typeof booking.config_snapshot === 'object') {
        try {
          dynamicConfig = normalizeServiceCategoryConfig(String(booking.category_config_id || ''), booking.config_snapshot);
        } catch {
          dynamicConfig = null;
        }
      }

      if (action === 'reschedule' && dynamicConfig) {
        try {
          assertServiceBookingWindow(dynamicConfig, safeText(payload.scheduledDate), safeText(payload.timeSlot));
        } catch (error) {
          const code = (error as { code?: string }).code || 'SERVICE_INVALID_DATE';
          throw new ServiceBookingRepositoryError(code, 400);
        }
      }

      if (action === 'accept' && dynamicConfig) {
        if (dynamicConfig.approvalWorkflow.requiresAdminApproval && !isAdmin) {
          throw new ServiceBookingRepositoryError('ADMIN_APPROVAL_REQUIRED', 409);
        }
        if (isMedicineServiceCategory(String(booking.category_config_id || ''), dynamicConfig)) {
          const licence = await client.query(
            `select 1 from public.service_provider_credentials
              where provider_id = $1 and tenant_id = $2
                and credential_type = 'pharmacy_license' and status = 'verified'
                and (expires_on is null or expires_on >= current_date)
                and (category_id is null or category_id = $3)
              limit 1`,
            [booking.provider_id, this.tenantId, booking.category_config_id],
          );
          if (!licence.rows[0]) throw new ServiceBookingRepositoryError('LICENSED_PHARMACY_REQUIRED', 409);
        }
      }

      if (action === 'complete' && dynamicConfig) {
        const profile = await client.query(
          'select * from public.service_delivery_profiles where booking_id = $1 limit 1',
          [bookingId],
        );
        const deliveryProfile = profile.rows[0];
        if (isMedicineServiceCategory(String(booking.category_config_id || ''), dynamicConfig)) {
          if (!deliveryProfile || deliveryProfile.prescription_status !== 'verified') {
            throw new ServiceBookingRepositoryError('PRESCRIPTION_NOT_VERIFIED', 409);
          }
        }
        if (deliveryProfile?.delivery_confirmation_enabled && !deliveryProfile.delivery_confirmed_at) {
          throw new ServiceBookingRepositoryError('DELIVERY_CONFIRMATION_REQUIRED', 409);
        }
        if (dynamicConfig.approvalWorkflow.requiresDocumentVerification) {
          for (const requirement of dynamicConfig.documents) {
            if (!requirement.required || !requirement.verificationRequired) continue;
            const verified = await client.query(
              `select 1 from public.service_booking_documents
                where booking_id = $1 and document_key = $2 and status = 'verified' limit 1`,
              [bookingId, requirement.key],
            );
            if (!verified.rows[0]) throw new ServiceBookingRepositoryError('SERVICE_DOCUMENTS_NOT_VERIFIED', 409);
          }
        }
      }

      const targets: Record<ServiceBookingAction, ServiceBookingStatus> = {
        accept: 'accepted',
        reject: 'rejected',
        start: 'in_progress',
        complete: 'completed',
        cancel: 'cancelled',
        reschedule: booking.status as ServiceBookingStatus,
      };

      if (action === 'reschedule') {
        if (!isProvider && !isAdmin) throw new ServiceBookingRepositoryError('RESCHEDULE_PROVIDER_ONLY', 403);
        if (!LIVE_STATUSES.includes(booking.status)) throw new ServiceBookingRepositoryError('BOOKING_NOT_RESCHEDULABLE', 409);
        const scheduledDate = validateFutureDate(safeText(payload.scheduledDate));
        const timeSlot = safeText(payload.timeSlot);
        if (!timeSlot || timeSlot.length > 60) throw new ServiceBookingRepositoryError('INVALID_TIME_SLOT', 400);
        const slotKey = normalizeSlotKey(timeSlot);
        if (!slotKey) throw new ServiceBookingRepositoryError('INVALID_TIME_SLOT', 400);
        await this.assertSlotWindow(client, String(booking.listing_id), scheduledDate, slotKey);
        try {
          await client.query(
            `update public.service_bookings
                set scheduled_date = $2, time_slot = $3, slot_key = $4
              where id = $1`,
            [bookingId, scheduledDate, timeSlot, slotKey],
          );
        } catch (error) {
          if (isUniqueViolation(error, 'uniq_service_booking_active_slot')) {
            throw new ServiceBookingRepositoryError('SERVICE_SLOT_ALREADY_BOOKED', 409);
          }
          throw error;
        }
        await this.appendEvent(
          client, bookingId, actor, booking.status, booking.status,
          safeText(payload.note, `Rescheduled to ${scheduledDate} ${timeSlot}`).slice(0, 1000),
        );
        return { booking: await this.hydrateBooking(client, await this.fetchBooking(client, bookingId)), idempotent: false };
      }

      const target = targets[action];
      if (booking.status === target) {
        return { booking: await this.hydrateBooking(client, await this.fetchBooking(client, bookingId)), idempotent: true };
      }

      if (action === 'cancel') {
        if (booking.status === 'completed') throw new ServiceBookingRepositoryError('COMPLETED_BOOKING_CANNOT_BE_CANCELLED', 409);
        if (isCustomer && !['requested', 'accepted'].includes(booking.status)) {
          throw new ServiceBookingRepositoryError('CUSTOMER_CANCEL_WINDOW_CLOSED', 409);
        }
        if (isProvider && !['requested', 'accepted'].includes(booking.status)) {
          throw new ServiceBookingRepositoryError('PROVIDER_CANCEL_WINDOW_CLOSED', 409);
        }
      } else {
        if (!isProvider && !isAdmin) throw new ServiceBookingRepositoryError('PROVIDER_ACTION_REQUIRED', 403);
        const allowed: Record<string, string[]> = {
          accept: ['requested'],
          reject: ['requested'],
          start: ['accepted'],
          complete: ['in_progress'],
        };
        if (!allowed[action]?.includes(booking.status)) {
          throw new ServiceBookingRepositoryError('BOOKING_STATE_CONFLICT', 409);
        }
      }

      const reason = safeText(payload.reason).slice(0, 500);
      if ((action === 'reject' || action === 'cancel') && reason.length < 3) {
        throw new ServiceBookingRepositoryError('CANCELLATION_REASON_REQUIRED', 400);
      }

      const timestampColumn =
        action === 'accept' ? 'accepted_at'
          : action === 'start' ? 'started_at'
            : action === 'complete' ? 'completed_at'
              : action === 'cancel' || action === 'reject' ? 'cancelled_at'
                : null;

      try {
        await client.query(
          `update public.service_bookings
              set status = $2,
                  cancellation_reason = CASE WHEN $2 IN ('cancelled', 'rejected') THEN NULLIF($3, '') ELSE cancellation_reason END
                  ${timestampColumn ? `, ${timestampColumn} = now()` : ''}
            where id = $1`,
          [bookingId, target, reason],
        );
      } catch (error) {
        if (isSlotConflict(error)) {
          throw new ServiceBookingRepositoryError('SERVICE_SLOT_ALREADY_BOOKED', 409);
        }
        throw error;
      }
      await this.appendEvent(client, bookingId, actor, booking.status, target, reason || `Service booking ${action}`);
      return { booking: await this.hydrateBooking(client, await this.fetchBooking(client, bookingId)), idempotent: false };
    });
  }

  async confirmDelivery(actor: ProviderListingActor, bookingId: string): Promise<ServiceBookingRecord> {
    if (!UUID_PATTERN.test(bookingId)) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
    if (actor.role !== 'provider' && actor.role !== 'admin') {
      throw new ServiceBookingRepositoryError('PROVIDER_ACTION_REQUIRED', 403);
    }
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const { rows } = await client.query('select * from public.service_bookings where id = $1 for update', [bookingId]);
      if (!rows[0]) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
      if (rows[0].provider_id !== actor.supabaseUserId && actor.role !== 'admin') {
        throw new ServiceBookingRepositoryError('BOOKING_FORBIDDEN', 403);
      }
      try {
        await client.query('select public.confirm_service_delivery($1)', [bookingId]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const codes = ['PRESCRIPTION_NOT_VERIFIED', 'OTP_REQUIRED_FOR_CONFIRMATION', 'DELIVERY_CONFIRMATION_NOT_REQUIRED', 'TRACKING_NOT_ACTIVE'];
        for (const code of codes) {
          if (message.includes(code)) throw new ServiceBookingRepositoryError(code, 409);
        }
        throw error;
      }
      return this.hydrateBooking(client, await this.fetchBooking(client, bookingId));
    });
  }

  async deliveryTrackingSnapshot(actor: ProviderListingActor, bookingId: string): Promise<Record<string, unknown>> {
    if (!UUID_PATTERN.test(bookingId)) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const bookingResult = await client.query(
        `select b.id, b.booking_ref, b.status, b.customer_id, b.provider_id,
                b.helper_assigned_at, b.tracking_started_at, b.tracking_stopped_at,
                l.title as listing_title, category_version.config->>'name' as category_name
           from public.service_bookings b
           join public.listings l on l.id = b.listing_id
           left join public.service_category_configs category on category.id = b.category_config_id
           left join public.service_category_config_versions category_version on category_version.id = category.current_version_id
          where b.id = $1
          limit 1`,
        [bookingId],
      );
      const booking = bookingResult.rows[0];
      if (!booking) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
      const [profileResult, locationResult, eventResult] = await Promise.all([
        client.query(
          `select service_kind, category_id, tracking_enabled, live_map_enabled, otp_enabled,
                  delivery_confirmation_enabled, delivery_confirmed_at, prescription_status, recurrence_rule
             from public.service_delivery_profiles where booking_id = $1 limit 1`,
          [bookingId],
        ),
        client.query(
          `select latitude, longitude, accuracy_meters, captured_at
             from public.service_tracking_locations
            where booking_id = $1
            order by captured_at desc
            limit 1`,
          [bookingId],
        ),
        client.query(
          `select id, event_type, note, created_at
             from public.service_tracking_events
            where booking_id = $1
            order by created_at desc
            limit 20`,
          [bookingId],
        ),
      ]);
      const profile = profileResult.rows[0] || {};
      const location = locationResult.rows[0] || null;
      return {
        bookingId: String(booking.id),
        bookingRef: String(booking.booking_ref || ''),
        title: String(booking.listing_title || 'Delivery booking'),
        status: String(booking.status),
        customerId: String(booking.customer_id),
        providerId: String(booking.provider_id),
        helperAssignedAt: iso(booking.helper_assigned_at),
        trackingStartedAt: iso(booking.tracking_started_at),
        trackingStoppedAt: iso(booking.tracking_stopped_at),
        serviceKind: String(profile.service_kind || 'human_help'),
        categoryId: profile.category_id ? String(profile.category_id) : null,
        categoryName: booking.category_name ? String(booking.category_name) : null,
        trackingEnabled: profile.tracking_enabled !== false,
        liveMapEnabled: profile.live_map_enabled !== false,
        otpEnabled: profile.otp_enabled !== false,
        deliveryConfirmationEnabled: profile.delivery_confirmation_enabled === true,
        deliveryConfirmedAt: iso(profile.delivery_confirmed_at),
        prescriptionStatus: String(profile.prescription_status || 'not_required'),
        recurrenceRule: String(profile.recurrence_rule || 'none'),
        latestLocation: location ? {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          accuracyMeters: location.accuracy_meters === null ? null : Number(location.accuracy_meters),
          capturedAt: iso(location.captured_at),
        } : null,
        events: eventResult.rows.map((row) => ({
          id: Number(row.id),
          eventType: String(row.event_type || ''),
          note: row.note ?? null,
          createdAt: iso(row.created_at),
        })),
      };
    });
  }

  async publishTrackingLocation(
    actor: ProviderListingActor,
    bookingId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!UUID_PATTERN.test(bookingId)) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
    if (actor.role !== 'provider') throw new ServiceBookingRepositoryError('PROVIDER_ACTION_REQUIRED', 403);
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ServiceBookingRepositoryError('INVALID_LOCATION_COORDINATES', 400);
    }
    const accuracy = input.accuracyMeters === null || input.accuracyMeters === undefined
      ? null
      : Number(input.accuracyMeters);
    if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 5000)) {
      throw new ServiceBookingRepositoryError('INVALID_LOCATION_ACCURACY', 400);
    }
    const capturedAt = new Date(String(input.capturedAt || ''));
    if (Number.isNaN(capturedAt.getTime())) {
      throw new ServiceBookingRepositoryError('INVALID_LOCATION_TIME', 400);
    }
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      try {
        const result = await client.query(
          `insert into public.service_tracking_locations
            (booking_id, actor_id, actor_role, latitude, longitude, accuracy_meters, captured_at, source)
           values ($1, auth.uid(), 'helper', $2, $3, $4, $5, 'device_gps')
           returning id, latitude, longitude, accuracy_meters, captured_at`,
          [bookingId, latitude, longitude, accuracy, capturedAt.toISOString()],
        );
        return {
          id: Number(result.rows[0].id),
          latitude: Number(result.rows[0].latitude),
          longitude: Number(result.rows[0].longitude),
          accuracyMeters: result.rows[0].accuracy_meters === null ? null : Number(result.rows[0].accuracy_meters),
          capturedAt: iso(result.rows[0].captured_at),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('TRACKING_UPDATE_TOO_FREQUENT')) {
          throw new ServiceBookingRepositoryError('TRACKING_UPDATE_TOO_FREQUENT', 429);
        }
        if (message.includes('row-level security') || message.includes('42501')) {
          throw new ServiceBookingRepositoryError('TRACKING_NOT_ACTIVE', 409);
        }
        throw error;
      }
    });
  }

  async createDeliveryOtp(actor: ProviderListingActor, bookingId: string): Promise<string> {
    if (!UUID_PATTERN.test(bookingId)) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
    if (actor.role !== 'customer') throw new ServiceBookingRepositoryError('CUSTOMER_SESSION_REQUIRED', 403);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      try {
        const { rows } = await client.query('select public.create_delivery_otp($1) as code', [bookingId]);
        return String(rows[0]?.code || '');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const codes = ['OTP_DISABLED_FOR_SERVICE', 'PRESCRIPTION_NOT_VERIFIED', 'TRACKING_NOT_ACTIVE', 'FORBIDDEN', 'BOOKING_NOT_FOUND'];
        for (const code of codes) {
          if (message.includes(code)) throw new ServiceBookingRepositoryError(code, code === 'BOOKING_NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : 409);
        }
        throw error;
      }
    });
  }

  async verifyDeliveryOtp(actor: ProviderListingActor, bookingId: string, code: string): Promise<boolean> {
    if (!UUID_PATTERN.test(bookingId)) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
    if (actor.role !== 'provider' && actor.role !== 'admin') {
      throw new ServiceBookingRepositoryError('PROVIDER_ACTION_REQUIRED', 403);
    }
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      try {
        const { rows } = await client.query('select public.verify_delivery_otp($1,$2) as verified', [bookingId, code]);
        return rows[0]?.verified === true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const codes = ['OTP_NOT_FOUND', 'OTP_ALREADY_USED', 'OTP_EXPIRED', 'OTP_ATTEMPTS_EXCEEDED', 'OTP_INVALID', 'TRACKING_NOT_ACTIVE', 'FORBIDDEN', 'BOOKING_NOT_FOUND'];
        for (const code of codes) {
          if (message.includes(code)) throw new ServiceBookingRepositoryError(code, code === 'FORBIDDEN' ? 403 : code === 'BOOKING_NOT_FOUND' ? 404 : 409);
        }
        throw error;
      }
    });
  }

  async recordPaymentClaim(actor: ProviderListingActor, bookingId: string, input: Record<string, unknown>): Promise<ServicePaymentClaimRecord> {
    if (actor.role !== 'provider') throw new ServiceBookingRepositoryError('PROVIDER_SESSION_REQUIRED', 403);
    if (!UUID_PATTERN.test(bookingId)) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
    const method = safeText(input.method) as ServicePaymentClaimRecord['method'];
    if (!['cash', 'upi', 'razorpay'].includes(method)) throw new ServiceBookingRepositoryError('INVALID_PAYMENT_METHOD', 400);
    const evidenceNote = safeText(input.evidenceNote);
    if (evidenceNote.length < 5 || evidenceNote.length > 1000) throw new ServiceBookingRepositoryError('PAYMENT_EVIDENCE_REQUIRED', 400);
    const reference = safeText(input.reference);
    if (method !== 'cash' && reference.length < 3) throw new ServiceBookingRepositoryError('PAYMENT_REFERENCE_REQUIRED', 400);

    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const { rows } = await client.query('select * from public.service_bookings where id = $1 for update', [bookingId]);
      const booking = rows[0];
      if (!booking) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
      if (booking.provider_id !== actor.supabaseUserId) throw new ServiceBookingRepositoryError('BOOKING_FORBIDDEN', 403);
      if (booking.status !== 'completed') throw new ServiceBookingRepositoryError('BOOKING_NOT_COMPLETED', 409);
      if (booking.payment_enabled === false) throw new ServiceBookingRepositoryError('PAYMENT_DISABLED_FOR_SERVICE', 409);
      if (!['due', 'failed'].includes(booking.payment_status)) {
        throw new ServiceBookingRepositoryError('PAYMENT_ALREADY_RECORDED', 409);
      }
      try {
        const inserted = await client.query(
          `insert into public.service_payment_claims
            (booking_id, claimed_by, method, reference, evidence_note, amount, status)
           values ($1, auth.uid(), $2, NULLIF($3, ''), $4, $5, 'pending')
           returning *`,
          [bookingId, method, reference, evidenceNote, Number(booking.amount || 0)],
        );
        await client.query(`update public.service_bookings set payment_status = 'declared' where id = $1`, [bookingId]);
        await this.appendEvent(client, bookingId, actor, booking.status, booking.status, `Payment claim recorded (${method})`);
        const claim = inserted.rows[0];
        return toClaim({ ...claim, booking_ref: booking.booking_ref });
      } catch (error) {
        if (isUniqueViolation(error, 'uniq_service_payment_claim_pending')) {
          throw new ServiceBookingRepositoryError('PAYMENT_CLAIM_ALREADY_PENDING', 409);
        }
        throw error;
      }
    });
  }

  async listPaymentClaims(actor: ProviderListingActor): Promise<ServicePaymentClaimRecord[]> {
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const scope = actor.role === 'admin' ? 'true' : 'c.claimed_by = auth.uid()';
      const { rows } = await client.query(
        `select c.*, b.booking_ref
           from public.service_payment_claims c
           join public.service_bookings b on b.id = c.booking_id
          where ${scope}
          order by case c.status when 'pending' then 0 else 1 end, c.created_at desc
          limit 500`,
      );
      return rows.map(toClaim);
    });
  }

  async decidePaymentClaim(
    actor: ProviderListingActor,
    claimId: string,
    decision: 'approved' | 'rejected',
    reviewNote: string,
  ): Promise<{ claim: ServicePaymentClaimRecord; booking: ServiceBookingRecord }> {
    if (actor.role !== 'admin') throw new ServiceBookingRepositoryError('FORBIDDEN_ADMIN_REQUIRED', 403);
    if (!UUID_PATTERN.test(claimId)) throw new ServiceBookingRepositoryError('PAYMENT_CLAIM_NOT_FOUND', 404);
    if (!['approved', 'rejected'].includes(decision)) throw new ServiceBookingRepositoryError('INVALID_CLAIM_DECISION', 400);
    const note = safeText(reviewNote);
    if (note.length < 5) throw new ServiceBookingRepositoryError('AUDIT_REASON_REQUIRED', 400);

    return this.transaction(actor, async (client) => {
      const profile = await this.requireActiveProfile(client, actor);
      if (profile.role !== 'admin') throw new ServiceBookingRepositoryError('FORBIDDEN_ADMIN_REQUIRED', 403);
      const { rows } = await client.query('select * from public.service_payment_claims where id = $1 for update', [claimId]);
      const claim = rows[0];
      if (!claim) throw new ServiceBookingRepositoryError('PAYMENT_CLAIM_NOT_FOUND', 404);
      if (claim.status !== 'pending') {
        throw new ServiceBookingRepositoryError('PAYMENT_CLAIM_ALREADY_REVIEWED', 409);
      }
      const bookingResult = await client.query('select * from public.service_bookings where id = $1 for update', [claim.booking_id]);
      const booking = bookingResult.rows[0];
      if (!booking) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);

      await client.query(
        `update public.service_payment_claims
            set status = $2, reviewed_by = auth.uid(), reviewed_at = now(), review_note = $3
          where id = $1`,
        [claimId, decision, note.slice(0, 1000)],
      );
      await client.query(
        `update public.service_bookings set payment_status = $2 where id = $1`,
        [claim.booking_id, decision === 'approved' ? 'settled' : 'due'],
      );
      await this.appendEvent(
        client, claim.booking_id, actor, booking.status, booking.status,
        decision === 'approved' ? `Payment settlement approved: ${note}` : `Payment claim rejected: ${note}`,
      );
      const claimRow = await client.query(
        `select c.*, b.booking_ref from public.service_payment_claims c
           join public.service_bookings b on b.id = c.booking_id where c.id = $1`,
        [claimId],
      );
      return {
        claim: toClaim(claimRow.rows[0]),
        booking: await this.hydrateBooking(client, await this.fetchBooking(client, claim.booking_id)),
      };
    });
  }

  async addReview(actor: ProviderListingActor, bookingId: string, input: Record<string, unknown>): Promise<ServiceReviewRecord> {
    if (actor.role !== 'customer') throw new ServiceBookingRepositoryError('CUSTOMER_SESSION_REQUIRED', 403);
    if (!UUID_PATTERN.test(bookingId)) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
    const rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ServiceBookingRepositoryError('INVALID_RATING', 400);
    const comment = safeText(input.comment).slice(0, 2000);

    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const { rows } = await client.query('select * from public.service_bookings where id = $1 for update', [bookingId]);
      const booking = rows[0];
      if (!booking) throw new ServiceBookingRepositoryError('BOOKING_NOT_FOUND', 404);
      if (booking.customer_id !== actor.supabaseUserId) throw new ServiceBookingRepositoryError('BOOKING_FORBIDDEN', 403);
      if (booking.status !== 'completed') throw new ServiceBookingRepositoryError('REVIEW_REQUIRES_COMPLETED_BOOKING', 409);
      try {
        const inserted = await client.query(
          `insert into public.service_reviews
            (booking_id, listing_id, customer_id, provider_id, rating, comment)
           values ($1, $2, auth.uid(), $3, $4, NULLIF($5, ''))
           returning *`,
          [bookingId, booking.listing_id, booking.provider_id, rating, comment],
        );
        const review = inserted.rows[0];
        return {
          id: String(review.id),
          bookingId: String(review.booking_id),
          listingId: String(review.listing_id),
          rating: Number(review.rating),
          comment: review.comment ?? null,
          createdAt: iso(review.created_at) || '',
        };
      } catch (error) {
        if (isUniqueViolation(error, 'service_reviews_booking_id_key')) {
          throw new ServiceBookingRepositoryError('REVIEW_ALREADY_SUBMITTED', 409);
        }
        throw error;
      }
    });
  }

  async listPublishedReviews(listingId: string): Promise<ServiceReviewRecord[]> {
    return this.transaction(null, async (client) => {
      const { rows } = await client.query(
        `select id, booking_id, listing_id, rating, comment, created_at
           from public.service_reviews
          where listing_id = $1 and is_published = true
          order by created_at desc limit 100`,
        [listingId],
      );
      return rows.map((row) => ({
        id: String(row.id),
        bookingId: String(row.booking_id),
        listingId: String(row.listing_id),
        rating: Number(row.rating),
        comment: row.comment ?? null,
        createdAt: iso(row.created_at) || '',
      }));
    });
  }

  async earnings(actor: ProviderListingActor): Promise<ServiceEarningsSummary> {
    if (actor.role !== 'provider') throw new ServiceBookingRepositoryError('PROVIDER_SESSION_REQUIRED', 403);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor);
      const { rows } = await client.query(
        `select
           count(*)::int as completed_jobs,
           coalesce(sum(amount), 0) as gross_amount,
           coalesce(sum(amount) filter (where payment_status = 'settled'), 0) as settled_amount,
           coalesce(sum(amount) filter (where payment_status in ('due', 'declared')), 0) as outstanding_amount
         from public.service_bookings
        where provider_id = auth.uid() and status = 'completed'`,
      );
      const row = rows[0] || {};
      return {
        completedJobs: Number(row.completed_jobs || 0),
        grossAmount: Number(row.gross_amount || 0),
        settledAmount: Number(row.settled_amount || 0),
        outstandingAmount: Number(row.outstanding_amount || 0),
      };
    });
  }
}

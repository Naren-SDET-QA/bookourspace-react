import { type Pool, type PoolClient } from 'pg';
import type { ProviderListingActor } from './providerListingRepository';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { closeSharedPostgresPool, getSharedPostgresPool } from './postgresPool';

/**
 * Classes & Training enrollment repository.
 *
 * Seat inventory, duplicate protection, waitlist ordering, fee derivation and
 * the cancellation quote all execute inside PostgreSQL functions under a batch
 * row lock. The browser cannot send an amount, a seat number or a payment
 * status: only a batch id, a delivery mode and a payment *intent* are accepted.
 *
 * Every call runs inside a transaction as the `authenticated` role with
 * transaction-local JWT claims, so RLS is enforced in addition to the explicit
 * server-side checks.
 */

export class ClassEnrollmentError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message = code,
  ) {
    super(message);
    this.name = 'ClassEnrollmentError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELIVERY_MODES = new Set(['online', 'offline', 'hybrid', 'recorded']);
const FEE_UNITS = new Set(['hour', 'session', 'month', 'subject', 'batch', 'course', 'installment']);

/** PostgreSQL function failures are mapped to explicit HTTP contracts. */
const RPC_ERROR_STATUS: Record<string, number> = {
  AUTH_REQUIRED: 401,
  ACTIVE_PROFILE_REQUIRED: 403,
  INVALID_DELIVERY_MODE: 400,
  INVALID_PAYMENT_MODE: 400,
  INVALID_REQUEST_ID: 400,
  INVALID_REVIEW_DECISION: 400,
  PAYMENT_MODE_PRICE_MISMATCH: 400,
  FREE_BATCH_REQUIRES_FREE_PAYMENT_MODE: 400,
  ENROLLMENT_REQUEST_CONFLICT: 409,
  DUPLICATE_ENROLLMENT: 409,
  BATCH_FULL: 409,
  BATCH_NOT_AVAILABLE: 404,
  BATCH_NOT_FOUND: 404,
  BATCH_REVIEW_STATE_CONFLICT: 409,
  COURSE_NOT_APPROVED: 409,
  ENROLLMENT_NOT_FOUND: 404,
  ENROLLMENT_NOT_OWNED_BY_SESSION: 403,
  FORBIDDEN_ADMIN_REQUIRED: 403,
  ONLINE_PAYMENT_PROVIDER_NOT_CONFIGURED: 503,
};

function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapDatabaseError(error: unknown): ClassEnrollmentError {
  const code = String((error as any)?.code || '');
  const message = String((error as any)?.message || '');
  if (code === 'P0001') {
    const known = Object.keys(RPC_ERROR_STATUS).find((key) => message.includes(key));
    if (known) return new ClassEnrollmentError(known, RPC_ERROR_STATUS[known], message);
    return new ClassEnrollmentError('CLASS_ENROLLMENT_REJECTED', 409, message);
  }
  return new ClassEnrollmentError('CLASS_ENROLLMENT_DATABASE_ERROR', 500, message);
}

function toBatch(row: any) {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    title: String(row.title || ''),
    deliveryMode: String(row.delivery_mode),
    feeUnit: String(row.fee_unit),
    onlineFee: Number(row.online_fee ?? 0),
    offlineFee: Number(row.offline_fee ?? 0),
    capacity: Number(row.capacity ?? 0),
    waitlistCapacity: Number(row.waitlist_capacity ?? 0),
    confirmedCount: Number(row.confirmed_count ?? 0),
    waitlistCount: Number(row.waitlist_count ?? 0),
    seatsLeft: Number(row.seats_left ?? 0),
    waitlistLeft: Number(row.waitlist_left ?? 0),
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : null,
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
    daysOfWeek: String(row.days_of_week || ''),
    startTime: String(row.start_time || '').slice(0, 5),
    endTime: String(row.end_time || '').slice(0, 5),
    timezone: String(row.timezone || 'Asia/Kolkata'),
    durationLabel: String(row.duration_label || ''),
    area: String(row.area || ''),
    facultyName: String(row.faculty_name || ''),
    facultyExperience: String(row.faculty_experience || ''),
    holidays: Array.isArray(row.holidays) ? row.holidays : [],
    exams: Array.isArray(row.exams) ? row.exams : [],
    status: String(row.status),
    reviewNote: row.review_note == null ? null : String(row.review_note),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || ''),
  };
}

function toEnrollment(row: any) {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    listingId: String(row.listing_id),
    studentId: String(row.student_id),
    deliveryMode: String(row.delivery_mode),
    feeUnit: String(row.fee_unit),
    feeAmount: Number(row.fee_amount ?? 0),
    paymentMode: String(row.payment_mode),
    paymentStatus: String(row.payment_status),
    paymentReference: row.payment_reference == null ? null : String(row.payment_reference),
    status: String(row.status),
    seatSequence: row.seat_sequence == null ? null : Number(row.seat_sequence),
    waitlistPosition: row.waitlist_position == null ? null : Number(row.waitlist_position),
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    cancelReason: row.cancel_reason == null ? null : String(row.cancel_reason),
    refundPercent: Number(row.refund_percent ?? 0),
    refundAmount: Number(row.refund_amount ?? 0),
    refundPolicy: row.refund_policy == null ? null : String(row.refund_policy),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    courseTitle: row.course_title == null ? undefined : String(row.course_title),
    batchTitle: row.batch_title == null ? undefined : String(row.batch_title),
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : null,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
    studentName: row.student_name == null ? undefined : String(row.student_name),
    studentPhone: row.student_phone == null ? undefined : String(row.student_phone),
  };
}

export interface CreateBatchInput {
  requestId?: unknown;
  title?: unknown;
  deliveryMode?: unknown;
  feeUnit?: unknown;
  onlineFee?: unknown;
  offlineFee?: unknown;
  capacity?: unknown;
  waitlistCapacity?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  daysOfWeek?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  timezone?: unknown;
  durationLabel?: unknown;
  area?: unknown;
  facultyName?: unknown;
  facultyExperience?: unknown;
  holidays?: unknown;
  exams?: unknown;
}

export class ClassEnrollmentRepository {
  private readonly pool: Pool;

  constructor(connectionString: string, environment: NodeJS.ProcessEnv = process.env) {
    this.pool = getSharedPostgresPool(connectionString, environment);
  }

  /**
   * Same single-selector, loopback-only, production-refusing policy as the
   * listing repository: `BOS_LISTINGS_DATABASE_URL` owns the local database.
   */
  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): ClassEnrollmentRepository | null {
    const connectionString = String(environment.BOS_LISTINGS_DATABASE_URL || '').trim();
    if (String(environment.BOS_PG_URL || '').trim()) {
      throw new Error('BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL');
    }
    if (!connectionString) return null;
    assertPostgresConnectionTarget(connectionString, environment);
    return new ClassEnrollmentRepository(connectionString, environment);
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
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor?.supabaseUserId || '']);
      await client.query("select set_config('request.jwt.claim.role', $1, true)", [dbRole]);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(actor ? { sub: actor.supabaseUserId, role: 'authenticated', aal: 'aal1' } : { role: 'anon' }),
      ]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Keep the original failure; the connection is released below.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private requireIdentity(actor: ProviderListingActor | null): ProviderListingActor {
    if (!actor) throw new ClassEnrollmentError('UNAUTHORIZED_SESSION', 401);
    if (!actor.supabaseUserId || !UUID_PATTERN.test(actor.supabaseUserId)) {
      throw new ClassEnrollmentError(
        'VERIFIED_AUTH_ID_REQUIRED',
        403,
        'This session has no verified Supabase Auth UUID. Sign in again.',
      );
    }
    return actor;
  }

  /** Public: approved batches of an active course, with live seat counts. */
  async listPublicBatches(listingId: string) {
    if (!listingId || listingId.length > 160) {
      throw new ClassEnrollmentError('INVALID_LISTING_ID', 400);
    }
    return this.transaction(null, async (client) => {
      const { rows } = await client.query(
        `select b.*, a.confirmed_count, a.waitlist_count, a.seats_left, a.waitlist_left
           from public.class_batches b
           cross join lateral public.class_batch_availability(b.id) a
          where b.listing_id = $1 and b.status = 'active'
          order by b.start_date nulls last, b.start_time, b.id`,
        [listingId],
      );
      return rows.map(toBatch);
    });
  }

  /** Provider: create a batch. It is always created pending admin review. */
  async createBatch(actor: ProviderListingActor | null, listingId: string, input: CreateBatchInput) {
    const identity = this.requireIdentity(actor);
    if (!['provider', 'admin'].includes(identity.role)) {
      throw new ClassEnrollmentError('FORBIDDEN_PROVIDER_ROLE_REQUIRED', 403);
    }
    const title = safeText(input.title);
    const deliveryMode = safeText(input.deliveryMode).toLowerCase();
    const feeUnit = safeText(input.feeUnit, 'course').toLowerCase();
    const startTime = safeText(input.startTime);
    const endTime = safeText(input.endTime);
    const startDate = safeText(input.startDate) || null;
    const endDate = safeText(input.endDate) || null;
    const capacity = asNumber(input.capacity, 0);
    const waitlistCapacity = asNumber(input.waitlistCapacity, 0);
    const onlineFee = asNumber(input.onlineFee, 0);
    const offlineFee = asNumber(input.offlineFee, 0);

    if (title.length < 2 || title.length > 120) throw new ClassEnrollmentError('INVALID_BATCH_TITLE', 400);
    if (!DELIVERY_MODES.has(deliveryMode)) throw new ClassEnrollmentError('INVALID_DELIVERY_MODE', 400);
    if (!FEE_UNITS.has(feeUnit)) throw new ClassEnrollmentError('INVALID_FEE_UNIT', 400);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
      throw new ClassEnrollmentError('INVALID_BATCH_TIMING', 400);
    }
    if (endTime <= startTime) throw new ClassEnrollmentError('INVALID_BATCH_TIMING', 400);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
      throw new ClassEnrollmentError('INVALID_BATCH_CAPACITY', 400);
    }
    if (!Number.isInteger(waitlistCapacity) || waitlistCapacity < 0 || waitlistCapacity > 100000) {
      throw new ClassEnrollmentError('INVALID_WAITLIST_CAPACITY', 400);
    }
    for (const fee of [onlineFee, offlineFee]) {
      if (!Number.isFinite(fee) || fee < 0 || fee > 1_000_000_000) {
        throw new ClassEnrollmentError('INVALID_BATCH_FEE', 400);
      }
    }
    if (deliveryMode === 'online' && onlineFee <= 0 && offlineFee <= 0) {
      // A zero-price batch is legitimate (free/subsidised), but it must be
      // explicit so the enrollment screen can offer the free payment mode.
      // No rejection here; the enrollment function enforces the pairing.
    }
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new ClassEnrollmentError('INVALID_START_DATE', 400);
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new ClassEnrollmentError('INVALID_END_DATE', 400);
    if (startDate && endDate && endDate < startDate) throw new ClassEnrollmentError('INVALID_DATE_RANGE', 400);
    const holidays = Array.isArray(input.holidays) ? input.holidays.slice(0, 60) : [];
    const exams = Array.isArray(input.exams) ? input.exams.slice(0, 60) : [];

    return this.transaction(identity, async (client) => {
      const listing = await client.query(
        `select id, owner_id, entity_type, status from public.listings where id = $1 limit 1`,
        [listingId],
      );
      const row = listing.rows[0];
      if (!row) throw new ClassEnrollmentError('LISTING_NOT_FOUND', 404);
      if (identity.role !== 'admin' && String(row.owner_id) !== identity.supabaseUserId) {
        throw new ClassEnrollmentError(
          'FORBIDDEN_NOT_COURSE_OWNER',
          403,
          'A trainer can only create batches for their own course listing.',
        );
      }
      if (identity.role !== 'admin' && row.entity_type !== 'course') {
        throw new ClassEnrollmentError('COURSE_LISTING_REQUIRED', 409);
      }
      if (!['active', 'pending_approval'].includes(String(row.status))) {
        throw new ClassEnrollmentError('LISTING_NOT_OPEN_FOR_BATCHES', 409);
      }

      const inserted = await client.query(
        `insert into public.class_batches (
           listing_id, title, delivery_mode, fee_unit, online_fee, offline_fee,
           capacity, waitlist_capacity, start_date, end_date, days_of_week,
           start_time, end_time, timezone, duration_label, area,
           faculty_name, faculty_experience, holidays, exams, status
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
           $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20::jsonb, 'pending_approval'
         ) returning id`,
        [
          listingId,
          title,
          deliveryMode,
          feeUnit,
          onlineFee,
          offlineFee,
          capacity,
          waitlistCapacity,
          startDate,
          endDate,
          safeText(input.daysOfWeek).slice(0, 120),
          startTime,
          endTime,
          /^[A-Za-z_/+-]{3,64}$/.test(safeText(input.timezone)) ? safeText(input.timezone) : 'Asia/Kolkata',
          safeText(input.durationLabel).slice(0, 120),
          safeText(input.area).slice(0, 120),
          safeText(input.facultyName).slice(0, 120),
          safeText(input.facultyExperience).slice(0, 160),
          JSON.stringify(holidays),
          JSON.stringify(exams),
        ],
      );
      const availability = await client.query(
        `select b.*, a.confirmed_count, a.waitlist_count, a.seats_left, a.waitlist_left
           from public.class_batches b
           cross join lateral public.class_batch_availability(b.id) a
          where b.id = $1`,
        [inserted.rows[0].id],
      );
      return toBatch(availability.rows[0]);
    });
  }

  /** Provider: pause or archive an approved batch (never publish it). */
  async setOwnBatchStatus(actor: ProviderListingActor | null, batchId: string, status: string) {
    const identity = this.requireIdentity(actor);
    if (!['provider', 'admin'].includes(identity.role)) {
      throw new ClassEnrollmentError('FORBIDDEN_PROVIDER_ROLE_REQUIRED', 403);
    }
    if (!['paused', 'archived', 'pending_approval'].includes(status)) {
      throw new ClassEnrollmentError('INVALID_BATCH_STATUS', 400);
    }
    return this.transaction(identity, async (client) => {
      const updated = await client.query(
        `update public.class_batches
            set status = $2, updated_at = now()
          where id = $1 and status in ('pending_approval', 'active', 'paused')
          returning id`,
        [batchId, status],
      );
      if (updated.rowCount !== 1) throw new ClassEnrollmentError('BATCH_NOT_FOUND_OR_IMMUTABLE', 404);
      const { rows } = await client.query(
        `select b.*, a.confirmed_count, a.waitlist_count, a.seats_left, a.waitlist_left
           from public.class_batches b
           cross join lateral public.class_batch_availability(b.id) a
          where b.id = $1`,
        [batchId],
      );
      return toBatch(rows[0]);
    });
  }

  /** Admin: row-locked publish/reject. */
  async reviewBatch(
    actor: ProviderListingActor | null,
    batchId: string,
    decision: 'active' | 'rejected',
    reason: string,
  ) {
    const identity = this.requireIdentity(actor);
    if (identity.role !== 'admin') throw new ClassEnrollmentError('FORBIDDEN_ADMIN_REQUIRED', 403);
    return this.transaction(identity, async (client) => {
      try {
        const { rows } = await client.query(`select public.class_review_batch($1, $2, $3) as result`, [
          batchId,
          decision,
          safeText(reason).slice(0, 1000),
        ]);
        const result = rows[0]?.result || {};
        return { batch: toBatch(result.batch), idempotent: result.idempotent === true };
      } catch (error) {
        throw mapDatabaseError(error);
      }
    });
  }

  /** Student: transactional enrollment. Amount and seat come from the database. */
  async enroll(
    actor: ProviderListingActor | null,
    input: { batchId?: unknown; deliveryMode?: unknown; paymentMode?: unknown; requestId?: unknown },
  ) {
    const identity = this.requireIdentity(actor);
    if (identity.role !== 'customer') throw new ClassEnrollmentError('CUSTOMER_ROLE_REQUIRED', 403);
    const batchId = safeText(input.batchId);
    const deliveryMode = safeText(input.deliveryMode).toLowerCase();
    const paymentMode = safeText(input.paymentMode).toLowerCase();
    const requestId = safeText(input.requestId);
    if (!UUID_PATTERN.test(batchId)) throw new ClassEnrollmentError('INVALID_BATCH_ID', 400);
    if (!UUID_PATTERN.test(requestId)) throw new ClassEnrollmentError('INVALID_REQUEST_ID', 400);
    if (!['online', 'offline'].includes(deliveryMode)) throw new ClassEnrollmentError('INVALID_DELIVERY_MODE', 400);
    if (!['online', 'pay_at_institute', 'free'].includes(paymentMode)) {
      throw new ClassEnrollmentError('INVALID_PAYMENT_MODE', 400);
    }

    return this.transaction(identity, async (client) => {
      try {
        const { rows } = await client.query(`select public.class_enroll($1, $2, $3, $4) as result`, [
          batchId,
          deliveryMode,
          paymentMode,
          requestId,
        ]);
        const result = rows[0]?.result || {};
        return {
          enrollment: toEnrollment(result.enrollment),
          availability: result.availability || null,
          idempotent: result.idempotent === true,
        };
      } catch (error) {
        throw mapDatabaseError(error);
      }
    });
  }

  /** Student/trainer/admin: enrollment history for the signed-in actor. */
  async listForActor(actor: ProviderListingActor | null) {
    const identity = this.requireIdentity(actor);
    return this.transaction(identity, async (client) => {
      const scoped = identity.role === 'admin'
        ? `true`
        : `(e.student_id = auth.uid() or exists (
             select 1 from public.listings l where l.id = e.listing_id and l.owner_id = auth.uid()
           ))`;
      const { rows } = await client.query(
        `select e.*, b.title as batch_title, b.start_date, b.start_time, b.end_time,
                l.title as course_title,
                case when e.student_id <> auth.uid() then p.full_name end as student_name,
                case when e.student_id <> auth.uid() then p.phone end as student_phone
           from public.class_enrollments e
           join public.class_batches b on b.id = e.batch_id
           join public.listings l on l.id = e.listing_id
           left join public.profiles p on p.id = e.student_id
          where ${scoped}
          order by e.created_at desc
          limit 300`,
      );
      return rows.map(toEnrollment);
    });
  }

  /** Trainer/admin: batches with live availability, optionally filtered by status. */
  async listBatchesForActor(actor: ProviderListingActor | null, status?: string) {
    const identity = this.requireIdentity(actor);
    if (!['provider', 'admin'].includes(identity.role)) {
      throw new ClassEnrollmentError('FORBIDDEN_PROVIDER_ROLE_REQUIRED', 403);
    }
    if (status && !['pending_approval', 'active', 'paused', 'rejected', 'archived'].includes(status)) {
      throw new ClassEnrollmentError('INVALID_BATCH_STATUS_FILTER', 400);
    }
    return this.transaction(identity, async (client) => {
      const clauses: string[] = [];
      const values: unknown[] = [];
      if (identity.role !== 'admin') {
        clauses.push(`exists (
          select 1 from public.listings l where l.id = b.listing_id and l.owner_id = auth.uid()
        )`);
      }
      if (status) {
        values.push(status);
        clauses.push(`b.status = $${values.length}`);
      }
      const { rows } = await client.query(
        `select b.*, a.confirmed_count, a.waitlist_count, a.seats_left, a.waitlist_left,
                l.title as course_title
           from public.class_batches b
           join public.listings l on l.id = b.listing_id
           cross join lateral public.class_batch_availability(b.id) a
          where ${clauses.length ? clauses.join(' and ') : 'true'}
          order by case b.status when 'pending_approval' then 0 else 1 end,
                   b.created_at desc, b.id
          limit 300`,
        values,
      );
      return rows.map((row) => ({ ...toBatch(row), courseTitle: String(row.course_title || '') }));
    });
  }

  /** Cancellation always returns a server-computed policy quote. */
  async cancel(actor: ProviderListingActor | null, enrollmentId: string, reason: string) {
    const identity = this.requireIdentity(actor);
    if (!UUID_PATTERN.test(enrollmentId)) throw new ClassEnrollmentError('INVALID_ENROLLMENT_ID', 400);
    return this.transaction(identity, async (client) => {
      try {
        const { rows } = await client.query(`select public.class_cancel_enrollment($1, $2) as result`, [
          enrollmentId,
          safeText(reason).slice(0, 500),
        ]);
        const result = rows[0]?.result || {};
        return {
          enrollment: toEnrollment(result.enrollment),
          alreadyCancelled: result.alreadyCancelled === true,
          hoursUntilStart: result.hoursUntilStart ?? null,
          refundPercent: Number(result.refundPercent ?? 0),
          refundAmount: Number(result.refundAmount ?? 0),
          refundPolicy: result.refundPolicy ?? null,
          paymentSettled: result.paymentSettled === true,
          note: result.note ?? null,
        };
      } catch (error) {
        throw mapDatabaseError(error);
      }
    });
  }
}

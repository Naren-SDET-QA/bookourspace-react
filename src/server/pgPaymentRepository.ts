import type { Pool, PoolClient } from 'pg';
import type { ProviderListingActor } from './providerListingRepository';
import { closeSharedPostgresPool, getSharedPostgresPool } from './postgresPool';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { hasVerifiedSupabaseIdentity, type VerifiedAuthProvider } from './authIdentity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PgPaymentError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'PgPaymentError';
  }
}

export type PgPaymentActor = ProviderListingActor & { supabaseUserId: string; authProvider: VerifiedAuthProvider };

function asJson(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * PostgreSQL is the only authority for PG money. Every function below reads
 * the amount out of the database; no caller can pass a price.
 */
export class PgPaymentRepository {
  private readonly pool: Pool;

  constructor(connectionString: string, environment: NodeJS.ProcessEnv = process.env) {
    // One shared pool for the PG booking domain: the booking repository and
    // this repository talk to the same database.
    this.pool = getSharedPostgresPool(connectionString, environment);
  }

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): PgPaymentRepository | null {
    const connection = String(environment.BOS_LISTINGS_DATABASE_URL || '').trim();
    const legacy = String(environment.BOS_PG_URL || '').trim();
    if (legacy) throw new Error('BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL');
    if (!connection) return null;
    assertPostgresConnectionTarget(connection, environment);
    return new PgPaymentRepository(connection, environment);
  }

  async verifyConnection(): Promise<void> { await this.pool.query('select 1'); }
  /** The pool is shared, so it is released through the shared owner. */
  async close(): Promise<void> { await closeSharedPostgresPool(); }

  private async transaction<T>(actor: PgPaymentActor, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actor.supabaseUserId]);
      await client.query("select set_config('request.jwt.claim.role','authenticated',true)");
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: actor.supabaseUserId, role: 'authenticated', aal: 'aal1' }),
      ]);
      const result = await operation(client);
      await client.query('commit');
      return result;
    } catch (error) {
      try { await client.query('rollback'); } catch { /* keep the original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }

  private assertIdentity(actor: ProviderListingActor | null, roles: string[]): asserts actor is PgPaymentActor {
    if (!hasVerifiedSupabaseIdentity(actor)) {
      throw new PgPaymentError('VERIFIED_SUPABASE_IDENTITY_REQUIRED', 401);
    }
    if (!roles.includes(actor.role)) throw new PgPaymentError('FORBIDDEN_ROLE', 403);
  }

  private async requireActiveProfile(client: PoolClient, actor: PgPaymentActor, roles: string[]) {
    const { rows } = await client.query(
      'select role,account_status from public.profiles where id=auth.uid() limit 1',
    );
    if (!rows[0] || rows[0].account_status !== 'active') throw new PgPaymentError('ACTIVE_PROFILE_REQUIRED', 403);
    if (!roles.includes(rows[0].role)) throw new PgPaymentError('FORBIDDEN_ROLE', 403);
  }

  /** Expire stale UPI attempts so a reservation can be released again. */
  async sweepExpiredIntents(): Promise<void> {
    try {
      await this.pool.query('select public.sweep_expired_payment_intents()');
    } catch {
      // The sweep is best effort; it must never fail a customer request.
    }
  }

  /**
   * The amount a customer has to pay, read from the reservation row.
   * The browser never supplies this value.
   */
  async bookingTotalPaise(actor: ProviderListingActor | null, bookingId: string): Promise<number> {
    this.assertIdentity(actor, ['customer']);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer']);
      // Merchant destination and provider references are server configuration,
      // not trusted PostgREST arguments. This RPC is service-role-only; retain
      // the authenticated subject after the current profile check.
      await client.query('SET LOCAL ROLE service_role');
      await client.query("select set_config('request.jwt.claim.role','service_role',true)");
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: actor.supabaseUserId, role: 'service_role', aal: 'aal1' }),
      ]);
      const result = await client.query(
        `select b.total_paise, b.user_id
           from public.bookings b
          where b.id = $1 and b.payload->>'source' = 'pg_booking'`,
        [bookingId],
      );
      const row = result.rows[0];
      if (!row) throw new PgPaymentError('PG_BOOKING_NOT_FOUND', 404);
      if (row.user_id !== actor.supabaseUserId) throw new PgPaymentError('PG_BOOKING_NOT_OWNED', 403);
      const total = Number(row.total_paise || 0);
      if (total <= 0) throw new PgPaymentError('PG_AMOUNT_NOT_CONFIGURED', 409);
      return total;
    });
  }

  async createPaymentIntent(
    actor: ProviderListingActor | null,
    bookingId: string,
    input: {
      paymentMode: string;
      idempotencyKey: string;
      merchantVpa: string;
      merchantName: string;
      providerReference?: string;
    },
  ) {
    this.assertIdentity(actor, ['customer']);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    const mode = String(input.paymentMode || '').trim();
    if (mode !== 'upi' && mode !== 'pay_after_service' && mode !== 'razorpay') {
      throw new PgPaymentError('INVALID_PAYMENT_MODE', 400);
    }
    const key = String(input.idempotencyKey || '').trim();
    if (key.length < 8 || key.length > 128) throw new PgPaymentError('MISSING_IDEMPOTENCY_KEY', 400);
    if (mode === 'upi' && !String(input.merchantVpa || '').trim()) {
      throw new PgPaymentError('MERCHANT_VPA_NOT_CONFIGURED', 503);
    }
    if (mode === 'razorpay' && !String(input.providerReference || '').trim()) {
      throw new PgPaymentError('RAZORPAY_NOT_CONFIGURED', 503);
    }
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer']);
      // Payment destination and provider references come from server
      // configuration. This RPC is intentionally not executable by browser
      // roles; switch only after the current authenticated profile is checked.
      await client.query('SET LOCAL ROLE service_role');
      await client.query("select set_config('request.jwt.claim.role','service_role',true)");
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: actor.supabaseUserId, role: 'service_role', aal: 'aal1' }),
      ]);
      const result = await client.query(
        `select public.pg_create_payment_intent($1,$2,$3,$4,$5,$6) as result`,
        [
          bookingId,
          mode,
          key,
          String(input.merchantVpa || '').trim(),
          String(input.merchantName || 'BookOurSpace').trim(),
          String(input.providerReference || '').trim(),
        ],
      );
      return asJson(result.rows[0]?.result);
    });
  }

  async paymentState(actor: ProviderListingActor | null, bookingId: string) {
    this.assertIdentity(actor, ['customer', 'provider', 'admin']);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer', 'provider', 'admin']);
      const result = await client.query('select public.pg_booking_payment_state($1) as result', [bookingId]);
      return asJson(result.rows[0]?.result);
    });
  }

  async ownerAction(actor: ProviderListingActor | null, bookingId: string, action: string) {
    this.assertIdentity(actor, ['provider', 'admin']);
    const normalized = String(action || '').trim().toLowerCase();
    if (normalized !== 'check_in' && normalized !== 'check_out') {
      throw new PgPaymentError('INVALID_BOOKING_ACTION', 400);
    }
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['provider', 'admin']);
      const result = await client.query('select public.pg_owner_update_booking($1,$2) as result', [bookingId, normalized]);
      return asJson(result.rows[0]?.result);
    });
  }

  async cancelBooking(actor: ProviderListingActor | null, bookingId: string) {
    this.assertIdentity(actor, ['customer', 'provider', 'admin']);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer', 'provider', 'admin']);
      const result = await client.query('select public.pg_cancel_booking($1) as result', [bookingId]);
      return asJson(result.rows[0]?.result);
    });
  }

  async adminAdjust(actor: ProviderListingActor | null, bookingId: string, action: string, reason: string) {
    this.assertIdentity(actor, ['admin']);
    const normalized = String(action || '').trim().toLowerCase();
    if (!['cancel', 'check_in', 'check_out'].includes(normalized)) {
      throw new PgPaymentError('INVALID_BOOKING_ACTION', 400);
    }
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason || trimmedReason.length > 500) throw new PgPaymentError('ADJUSTMENT_REASON_REQUIRED', 400);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['admin']);
      const result = await client.query('select public.pg_admin_adjust_booking($1,$2,$3) as result', [
        bookingId,
        normalized,
        trimmedReason,
      ]);
      return asJson(result.rows[0]?.result);
    });
  }

  async auditTrail(actor: ProviderListingActor | null, bookingId: string) {
    this.assertIdentity(actor, ['customer', 'provider', 'admin']);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer', 'provider', 'admin']);
      const result = await client.query(
        `select e.event, e.detail, e.created_at
           from public.stay_audit_events e
          where e.detail->>'bookingId' = $1
          order by e.created_at desc
          limit 100`,
        [bookingId],
      );
      return result.rows.map((row) => ({
        event: row.event,
        detail: row.detail || {},
        createdAt: row.created_at,
      }));
    });
  }

  // ---------------------------------------------------------------------------
  // Administrator operations, disputes, claims and invoices
  // ---------------------------------------------------------------------------

  async adminOverview(actor: ProviderListingActor | null, limit = 100) {
    this.assertIdentity(actor, ['admin']);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['admin']);
      const result = await client.query('select public.pg_admin_booking_overview($1) as result', [
        Math.min(Math.max(Number(limit) || 100, 1), 500),
      ]);
      return asJson(result.rows[0]?.result);
    });
  }

  async waiveFee(actor: ProviderListingActor | null, bookingId: string, amountPaise: number, reason: string) {
    this.assertIdentity(actor, ['admin']);
    const trimmedReason = String(reason || '').trim();
    if (trimmedReason.length < 10 || trimmedReason.length > 500) {
      throw new PgPaymentError('ADJUSTMENT_REASON_REQUIRED', 400);
    }
    const amount = Number(amountPaise);
    if (!Number.isInteger(amount) || amount <= 0) throw new PgPaymentError('INVALID_WAIVER_AMOUNT', 400);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['admin']);
      const result = await client.query('select public.pg_admin_waive_fee($1,$2,$3) as result', [
        bookingId,
        amount,
        trimmedReason,
      ]);
      return asJson(result.rows[0]?.result);
    });
  }

  async approveRefund(actor: ProviderListingActor | null, bookingId: string, amountPaise: number, reason: string) {
    this.assertIdentity(actor, ['admin']);
    const trimmedReason = String(reason || '').trim();
    if (trimmedReason.length < 10 || trimmedReason.length > 500) {
      throw new PgPaymentError('ADJUSTMENT_REASON_REQUIRED', 400);
    }
    const amount = Number(amountPaise);
    if (!Number.isInteger(amount) || amount <= 0) throw new PgPaymentError('INVALID_REFUND_AMOUNT', 400);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['admin']);
      const result = await client.query('select public.pg_admin_approve_refund($1,$2,$3) as result', [
        bookingId,
        amount,
        trimmedReason,
      ]);
      return asJson(result.rows[0]?.result);
    });
  }

  async openDispute(
    actor: ProviderListingActor | null,
    bookingId: string,
    category: string,
    reason: string,
    evidence: unknown,
    amountPaise: number | null,
  ) {
    this.assertIdentity(actor, ['customer', 'provider', 'admin']);
    const trimmedReason = String(reason || '').trim();
    if (trimmedReason.length < 10 || trimmedReason.length > 2000) {
      throw new PgPaymentError('INVALID_DISPUTE_REASON', 400);
    }
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    const amount = amountPaise == null || amountPaise === ('' as unknown as number) ? null : Number(amountPaise);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer', 'provider', 'admin']);
      const result = await client.query(
        'select public.pg_open_dispute($1,$2,$3,$4::jsonb,$5) as result',
        [bookingId, String(category || ''), trimmedReason, JSON.stringify(evidence || []), amount],
      );
      return asJson(result.rows[0]?.result);
    });
  }

  async listDisputes(actor: ProviderListingActor | null, bookingId: string) {
    this.assertIdentity(actor, ['customer', 'provider', 'admin']);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer', 'provider', 'admin']);
      const result = await client.query(
        `select d.id, d.booking_id as "bookingId", d.category, d.reason, d.evidence,
                d."amount_in_dispute_paise" as "amountInDisputePaise", d.status, d.resolution,
                d."refund_approved_paise" as "refundApprovedPaise", d."opener_role" as "openerRole",
                d."resolved_at" as "resolvedAt", d."created_at" as "createdAt"
           from public.pg_booking_disputes d
          where d.booking_id = $1
          order by d.created_at desc`,
        [bookingId],
      );
      return result.rows;
    });
  }

  async reviewDispute(actor: ProviderListingActor | null, disputeId: string, note: string) {
    this.assertIdentity(actor, ['admin']);
    const trimmed = String(note || '').trim();
    if (trimmed.length < 5 || trimmed.length > 2000) throw new PgPaymentError('INVALID_DISPUTE_NOTE', 400);
    if (!UUID.test(disputeId)) throw new PgPaymentError('INVALID_DISPUTE_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['admin']);
      const result = await client.query('select public.pg_review_dispute($1,$2) as result', [disputeId, trimmed]);
      return asJson(result.rows[0]?.result);
    });
  }

  async resolveDispute(
    actor: ProviderListingActor | null,
    disputeId: string,
    resolution: string,
    refundPaise: number | null,
    reject: boolean,
  ) {
    this.assertIdentity(actor, ['admin']);
    const trimmed = String(resolution || '').trim();
    if (trimmed.length < 10 || trimmed.length > 2000) {
      throw new PgPaymentError('INVALID_DISPUTE_RESOLUTION', 400);
    }
    const amount = refundPaise == null ? null : Number(refundPaise);
    if (amount != null && (!Number.isInteger(amount) || amount < 0)) {
      throw new PgPaymentError('INVALID_REFUND_AMOUNT', 400);
    }
    if (!UUID.test(disputeId)) throw new PgPaymentError('INVALID_DISPUTE_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['admin']);
      const result = await client.query('select public.pg_resolve_dispute($1,$2,$3,$4) as result', [
        disputeId,
        trimmed,
        amount,
        Boolean(reject),
      ]);
      return asJson(result.rows[0]?.result);
    });
  }

  async submitPaymentClaim(
    actor: ProviderListingActor | null,
    bookingId: string,
    method: string,
    reference: string,
    note: string,
    amountPaise: number,
    evidence: unknown,
  ) {
    this.assertIdentity(actor, ['provider', 'admin']);
    const trimmedReference = String(reference || '').trim();
    if (trimmedReference.length < 4 || trimmedReference.length > 120) {
      throw new PgPaymentError('INVALID_CLAIM_REFERENCE', 400);
    }
    const amount = Number(amountPaise);
    if (!Number.isInteger(amount) || amount <= 0) throw new PgPaymentError('INVALID_CLAIM_AMOUNT', 400);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['provider', 'admin']);
      const result = await client.query(
        'select public.pg_submit_payment_claim($1,$2,$3,$4,$5,$6::jsonb) as result',
        [bookingId, String(method || ''), trimmedReference, String(note || ''), amount, JSON.stringify(evidence || [])],
      );
      return asJson(result.rows[0]?.result);
    });
  }

  async decidePaymentClaim(actor: ProviderListingActor | null, claimId: string, decision: string, note: string) {
    this.assertIdentity(actor, ['admin']);
    const trimmed = String(note || '').trim();
    if (trimmed.length < 5 || trimmed.length > 1000) {
      throw new PgPaymentError('INVALID_CLAIM_DECISION_NOTE', 400);
    }
    if (!UUID.test(claimId)) throw new PgPaymentError('INVALID_CLAIM_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['admin']);
      const result = await client.query('select public.pg_decide_payment_claim($1,$2,$3) as result', [
        claimId,
        String(decision || ''),
        trimmed,
      ]);
      return asJson(result.rows[0]?.result);
    });
  }

  async listClaims(actor: ProviderListingActor | null, bookingId: string) {
    this.assertIdentity(actor, ['customer', 'provider', 'admin']);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer', 'provider', 'admin']);
      const result = await client.query(
        `select c.id, c.booking_id as "bookingId", c.method, c.reference, c.note,
                c."amount_paise" as "amountPaise", c.evidence, c.status, c."decision_note" as "decisionNote",
                c."decided_at" as "decidedAt", c."created_at" as "createdAt"
           from public.pg_payment_claims c
          where c.booking_id = $1
            and ($2::uuid is null or exists (
              select 1 from public.bookings b join public.listings l on l.id=b.listing_id
               where b.id=c.booking_id and l.business_id=$2::uuid
            ))
          order by c.created_at desc`,
        [bookingId, actor?.businessId || null],
      );
      return result.rows;
    });
  }

  async issueInvoice(actor: ProviderListingActor | null, bookingId: string, kind: string, taxPercent: number) {
    this.assertIdentity(actor, ['customer', 'provider', 'admin']);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    // GST remains disabled until a verified supplier and tax configuration
    // are persisted. The database also rejects non-zero tax values.
    void taxPercent;
    const tax = 0;
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer', 'provider', 'admin']);
      const result = await client.query('select public.pg_issue_invoice($1,$2,$3::numeric) as result', [
        bookingId,
        String(kind || 'booking_invoice'),
        tax,
      ]);
      return asJson(result.rows[0]?.result);
    });
  }

  async listInvoices(actor: ProviderListingActor | null, bookingId: string) {
    this.assertIdentity(actor, ['customer', 'provider', 'admin']);
    if (!bookingId || bookingId.length > 160) throw new PgPaymentError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer', 'provider', 'admin']);
      const result = await client.query(
        `select i.invoice_number as "invoiceNumber", i.booking_id as "bookingId", i.kind, i.status,
                i."listing_title" as "listingTitle", i.currency, i."rent_paise" as "rentPaise",
                i."deposit_paise" as "depositPaise", i."tax_paise" as "taxPaise",
                i."tax_percent" as "taxPercent", i."tax_applied" as "taxApplied",
                i."total_paise" as "totalPaise", i."provider_paid_paise" as "providerPaidPaise",
                i."offline_collected_paise" as "offlineCollectedPaise", i."refund_paise" as "refundPaise",
                i.provider, i."provider_payment_id" as "providerPaymentId", i."issued_at" as "issuedAt"
           from public.pg_invoices i
          where i.booking_id = $1
            and ($2::uuid is null or exists (
              select 1 from public.bookings b join public.listings l on l.id=b.listing_id
               where b.id=i.booking_id and l.business_id=$2::uuid
            ))
          order by i.issued_at desc`,
        [bookingId, actor?.businessId || null],
      );
      return result.rows;
    });
  }

  /**
   * Newest administrator actions first. The audit table is append-only, so
   * ordering by the monotonic primary key is a stable ordering even when two
   * rows share a timestamp. `limit` is server-clamped and parameterised.
   */
  async adminAudit(actor: ProviderListingActor | null, bookingId?: string, limit = 100) {
    this.assertIdentity(actor, ['customer', 'provider', 'admin']);
    const capped = Math.min(Math.max(Number(limit) || 100, 1), 200);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer', 'provider', 'admin']);
      const result = bookingId
        ? await client.query(
          `select a.id, a."booking_id" as "bookingId", a.action, a.reason, a.detail,
                  a."actor_role" as "actorRole", a."created_at" as "createdAt"
             from public.pg_admin_audit a
            where a."booking_id" = $1
            order by a.id desc
            limit $2`,
          [bookingId, capped],
        )
        : await client.query(
          `select a.id, a."booking_id" as "bookingId", a.action, a.reason, a.detail,
                  a."actor_role" as "actorRole", a."created_at" as "createdAt"
             from public.pg_admin_audit a
            order by a.id desc
            limit $1`,
          [capped],
        );
      return result.rows;
    });
  }

  /**
   * Razorpay (Test Mode) settlement. The intent is resolved from the order
   * reference PostgreSQL stored, never from the webhook payload.
   */
  async settleRazorpayEvent(input: {
    eventId: string;
    orderId: string;
    eventType: string;
    providerReference: string;
    payloadAmountPaise: number;
    payloadHash: string;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ role: 'service_role' }),
      ]);
      const result = await client.query(
        'select public.pg_razorpay_settle_verified_payment($1,$2,$3,$4,$5,$6) as result',
        [
          input.eventId,
          input.orderId,
          input.eventType,
          input.providerReference,
          input.payloadAmountPaise,
          input.payloadHash,
        ],
      );
      await client.query('commit');
      return asJson(result.rows[0]?.result);
    } catch (error) {
      try { await client.query('rollback'); } catch { /* keep the original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Trusted provider settlement. It runs without a role switch because the
   * caller has already proved possession of the provider signature.
   */
  async settleProviderEvent(input: {
    eventId: string;
    intentId: string;
    bookingId: string;
    eventType: string;
    provider: string;
    providerReference: string;
    amountPaise: number;
    payloadHash: string;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // A pooled connection can carry an empty transaction-local JWT claim
      // GUC, which would break any cast of that claim to json.
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ role: 'service_role' }),
      ]);
      const result = await client.query('select public.pg_settle_verified_payment($1,$2,$3,$4,$5,$6,$7,$8) as result', [
        input.eventId,
        input.intentId,
        input.bookingId,
        input.eventType,
        input.provider,
        input.providerReference,
        input.amountPaise,
        input.payloadHash,
      ]);
      const settledIntent = await client.query(
        'select status from public.payment_intents where id = $1 and booking_id = $2',
        [input.intentId, input.bookingId],
      );
      if (!settledIntent.rows[0]) throw new PgPaymentError('PAYMENT_INTENT_NOT_FOUND', 404);
      const payload = asJson(result.rows[0]?.result);
      await client.query('commit');
      return { ...payload, intentStatus: String(settledIntent.rows[0].status) };
    } catch (error) {
      try { await client.query('rollback'); } catch { /* keep the original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }
}

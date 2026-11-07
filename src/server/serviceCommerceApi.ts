import crypto from 'crypto';
import type express from 'express';
import { types, type PoolClient } from 'pg';
import type { ProviderListingActor } from './providerListingRepository';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { logSafeError } from './safeLogging';
import { getSharedPostgresPool } from './postgresPool';

/**
 * Services commerce: real slot availability, provider schedule/profile and
 * server-verified UPI settlement.
 *
 * Settlement rules mirror the stay slice:
 *   - the amount is read from public.service_bookings, never from the client;
 *   - a payment becomes 'verified' only inside settle_service_payment() after
 *     an HMAC-signed provider callback;
 *   - sandbox settlement is unavailable in production and without a secret;
 *   - refunds are admin-authorized and recorded as signed provider events.
 */

types.setTypeParser(1082, (value: string) => value);

export interface ServiceCommerceDependencies {
  verifySession: (request: express.Request) => ProviderListingActor | null;
  env?: NodeJS.ProcessEnv;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(res: express.Response, status: number, error: string, message: string) {
  res.status(status).json({ ok: false, error, message });
}

function mapError(res: express.Response, error: any, fallback: string) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  if (message.includes('AUTH_REQUIRED')) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in to continue.');
  if (message.includes('BOOKING_FORBIDDEN')) return fail(res, 403, 'BOOKING_FORBIDDEN', 'This booking belongs to another account.');
  if (message.includes('MERCHANT_VPA_NOT_CONFIGURED')) return fail(res, 503, 'MERCHANT_VPA_NOT_CONFIGURED', 'The receiving UPI ID is not configured.');
  if (message.includes('PAYMENT_CLAIM_PENDING_REVIEW')) return fail(res, 409, 'PAYMENT_CLAIM_PENDING_REVIEW', 'A payment claim is already awaiting administrator review.');
  if (message.includes('PAYMENT_ALREADY_SETTLED')) return fail(res, 409, 'PAYMENT_ALREADY_SETTLED', 'This booking is already paid.');
  if (message.includes('BOOKING_NOT_PAYABLE')) return fail(res, 409, 'BOOKING_NOT_PAYABLE', 'This booking can no longer be paid online.');
  if (message.includes('PAYMENT_AMOUNT_MISMATCH')) return fail(res, 400, 'PAYMENT_AMOUNT_MISMATCH', 'The provider amount does not match this booking.');
  if (message.includes('PAYMENT_NOT_VERIFIED')) return fail(res, 409, 'PAYMENT_NOT_VERIFIED', 'Only a verified payment can be refunded.');
  if (message.includes('REFUND_EXCEEDS_PAYMENT')) return fail(res, 400, 'REFUND_EXCEEDS_PAYMENT', 'The refund is larger than the payment.');
  if (message.includes('SERVICE_LISTING_NOT_AVAILABLE')) return fail(res, 404, 'SERVICE_LISTING_NOT_AVAILABLE', 'This service is not available.');
  if (message.includes('BOOKING_NOT_FOUND')) return fail(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found.');
  if (code === 'P0002') return fail(res, 404, 'NOT_FOUND', 'The requested record does not exist.');
  if (code === '22023') return fail(res, 400, 'INVALID_REQUEST', message.replace(/^[A-Z_]+:?\s*/, ''));
  if (code === '42501') return fail(res, 403, 'FORBIDDEN', 'This action is not permitted for this account.');
  logSafeError('service-commerce', fallback, error);
  return fail(res, 500, fallback, 'The request could not be completed. Nothing was charged.');
}

export function registerServiceCommerceApi(app: express.Express, dependencies: ServiceCommerceDependencies): void {
  const env = dependencies.env || process.env;
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  if (connectionString) assertPostgresConnectionTarget(connectionString, env);
  if (!connectionString) {
    app.get('/api/services/listings/:id/availability', (_req, res) =>
      fail(res, 503, 'SERVICE_COMMERCE_UNAVAILABLE', 'Availability requires the PostgreSQL repository.'),
    );
    app.post('/api/services/payments/sandbox/webhook', (_req, res) =>
      fail(res, 503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'No trusted payment provider is configured.'),
    );
    return;
  }

  const sandboxSecret = String(env.BOS_PAYMENT_SANDBOX_SECRET || '').trim();
  const sandboxEnabled = env.BOS_PAYMENT_SANDBOX === '1' && env.NODE_ENV !== 'production' && sandboxSecret.length >= 16;
  const merchantVpa = String(env.BOS_SERVICES_UPI_VPA || '').trim();
  const merchantName = String(env.BOS_SERVICES_UPI_NAME || 'BookOurSpace Services').trim();

  const pool = getSharedPostgresPool(connectionString, env);

  async function withActor<T>(actor: ProviderListingActor | null, run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${actor ? 'authenticated' : 'anon'}`);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor?.supabaseUserId || '']);
      await client.query("select set_config('request.jwt.claim.role', $1, true)", [actor ? 'authenticated' : 'anon']);
      const out = await run(client);
      await client.query('COMMIT');
      return out;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* keep original */ }
      throw error;
    } finally {
      client.release();
    }
  }

  /** Provider callbacks are trusted process work, never an end-user session. */
  async function withProviderTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await run(client);
      await client.query('COMMIT');
      return out;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* keep original */ }
      throw error;
    } finally {
      client.release();
    }
  }

  function actorOf(req: express.Request): ProviderListingActor | null {
    const session = dependencies.verifySession(req);
    if (!session?.supabaseUserId || !UUID.test(String(session.supabaseUserId))) return null;
    if (session.authProvider !== 'google') return null;
    return session;
  }

  function sign(event: { eventId: string; intentId: string; eventType: string; amountPaise: number; providerPaymentId: string }): string {
    return crypto
      .createHmac('sha256', sandboxSecret)
      .update(`${event.eventId}|${event.intentId}|${event.eventType}|${event.amountPaise}|${event.providerPaymentId}`)
      .digest('hex');
  }

  function signatureMatches(provided: string, expected: string): boolean {
    if (!provided || !expected || provided.length !== expected.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
      return false;
    }
  }

  // Public: provider profile, service areas, hours and pricing basis.
  app.get('/api/services/listings/:id/profile', async (req, res) => {
    try {
      const profile = await withActor(null, async (client) => {
        const result = await client.query('select public.service_listing_profile($1) as payload', [String(req.params.id || '')]);
        return result.rows[0]?.payload || null;
      });
      if (!profile) return fail(res, 404, 'SERVICE_LISTING_NOT_AVAILABLE', 'This service is not available.');
      res.json({ ok: true, profile });
    } catch (error) {
      mapError(res, error, 'SERVICE_PROFILE_FAILED');
    }
  });

  // Public: real slots for a date range, excluding booked, blacked-out and off-days.
  app.get('/api/services/listings/:id/availability', async (req, res) => {
    const from = String(req.query.from || '');
    const to = String(req.query.to || from);
    if (!DATE.test(from) || !DATE.test(to)) {
      return fail(res, 400, 'INVALID_DATES', 'from/to must be YYYY-MM-DD.');
    }
    if (to < from) return fail(res, 400, 'INVALID_DATES', 'to must be on or after from.');
    try {
      const slots = await withActor(null, async (client) => {
        const result = await client.query(
          `select slot_date, to_char(slot_start, 'HH24:MI') as slot_start,
                  to_char(slot_end, 'HH24:MI') as slot_end, slot_label, slot_key, is_booked
             from public.service_listing_slots($1, $2::date, $3::date)`,
          [String(req.params.id || ''), from, to],
        );
        return result.rows.map((row: any) => ({
          date: String(row.slot_date).slice(0, 10),
          start: row.slot_start,
          end: row.slot_end,
          label: row.slot_label,
          slotKey: row.slot_key,
          isBooked: Boolean(row.is_booked),
        }));
      });
      res.json({ ok: true, listingId: req.params.id, from, to, slots, source: 'postgres' });
    } catch (error) {
      mapError(res, error, 'SERVICE_AVAILABILITY_FAILED');
    }
  });

  // Customer: server-priced UPI intent for an existing booking.
  app.post('/api/services/bookings/:id/payment-intent', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in with Google to pay for this booking.');
    if (actor.role !== 'customer') return fail(res, 403, 'CUSTOMER_SESSION_REQUIRED', 'Only the customer can pay for this booking.');
    if (!merchantVpa) return fail(res, 503, 'MERCHANT_VPA_NOT_CONFIGURED', 'Online payment is unavailable.');
    const bookingId = String(req.params.id || '');
    if (!UUID.test(bookingId)) return fail(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    if (idempotencyKey.length < 8) return fail(res, 400, 'INVALID_IDEMPOTENCY_KEY', 'An idempotency key is required.');
    try {
      const payload = await withActor(actor, async (client) => {
        const currentProfile = await client.query(
          'select role, account_status from public.profiles where id = auth.uid() limit 1',
        );
        if (currentProfile.rows[0]?.role !== 'customer' || currentProfile.rows[0]?.account_status !== 'active') {
          throw Object.assign(new Error('ACTIVE_CUSTOMER_REQUIRED'), { code: '42501' });
        }
        // The RPC carries server-configured merchant details. Elevate only
        // this statement after the request identity and current DB role were
        // verified above; keep the signed user subject for auth.uid().
        await client.query('SET LOCAL ROLE service_role');
        await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: actor.supabaseUserId, role: 'service_role' }),
        ]);
        const result = await client.query(
          'select public.create_service_payment_intent($1::uuid, $2, $3, $4) as payload',
          [bookingId, merchantVpa, merchantName, idempotencyKey],
        );
        return result.rows[0]?.payload;
      });
      res.status(payload?.replayed ? 200 : 201).json(payload);
    } catch (error) {
      mapError(res, error, 'SERVICE_PAYMENT_INTENT_FAILED');
    }
  });

  // Customer/provider/admin: authoritative intent status (RLS scoped).
  app.get('/api/services/payment-intents/:id', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in to view this payment.');
    try {
      const intent = await withActor(actor, async (client) => {
        const result = await client.query(
          `select id, booking_id, amount, status, provider_payment_id, verified_at,
                  refund_amount, expires_at
             from public.service_payment_intents where id = $1`,
          [String(req.params.id || '')],
        );
        return result.rows[0] || null;
      });
      if (!intent) return fail(res, 404, 'PAYMENT_INTENT_NOT_FOUND', 'No payment matches that reference.');
      res.json({
        ok: true,
        intentId: intent.id,
        bookingId: intent.booking_id,
        amount: Number(intent.amount),
        status: intent.status,
        providerPaymentId: intent.provider_payment_id,
        verifiedAt: intent.verified_at,
        refundAmount: intent.refund_amount === null ? null : Number(intent.refund_amount),
        expiresAt: intent.expires_at,
        paid: intent.status === 'verified' || intent.status === 'refunded',
      });
    } catch (error) {
      mapError(res, error, 'SERVICE_PAYMENT_LOOKUP_FAILED');
    }
  });

  // Provider: publish schedule, opening window and service areas.
  app.put('/api/services/provider/schedule', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in to manage your schedule.');
    if (actor.role !== 'provider') return fail(res, 403, 'PROVIDER_SESSION_REQUIRED', 'Only a provider can publish a schedule.');
    const body = req.body || {};
    const days = Array.isArray(body.workingDays) ? body.workingDays.map((value: unknown) => Number(value)) : [1, 2, 3, 4, 5, 6];
    if (!days.length || days.some((day: number) => !Number.isInteger(day) || day < 0 || day > 6)) {
      return fail(res, 400, 'INVALID_WORKING_DAYS', 'workingDays must be unique integers 0–6 (0 = Sunday).');
    }
    const dayStart = String(body.dayStart || '09:00');
    const dayEnd = String(body.dayEnd || '19:00');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dayStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dayEnd) || dayEnd <= dayStart) {
      return fail(res, 400, 'INVALID_OPENING_WINDOW', 'dayStart/dayEnd must be HH:MM with dayEnd after dayStart.');
    }
    const slotMinutes = Number(body.slotMinutes || 60);
    if (!Number.isInteger(slotMinutes) || slotMinutes < 30 || slotMinutes > 480) {
      return fail(res, 400, 'INVALID_SLOT_DURATION', 'slotMinutes must be between 30 and 480.');
    }
    const areas = Array.isArray(body.serviceAreas)
      ? body.serviceAreas.map((area: unknown) => String(area).trim()).filter(Boolean).slice(0, 20)
      : [];
    const radius = body.travelRadiusKm === null || body.travelRadiusKm === undefined ? null : Number(body.travelRadiusKm);
    if (radius !== null && (!Number.isInteger(radius) || radius < 0 || radius > 100)) {
      return fail(res, 400, 'INVALID_TRAVEL_RADIUS', 'travelRadiusKm must be between 0 and 100.');
    }
    try {
      const schedule = await withActor(actor, async (client) => {
        const result = await client.query(
          `insert into public.service_provider_schedules
            (provider_id, working_days, day_start, day_end, slot_minutes, service_areas, travel_radius_km, updated_at)
           values (auth.uid(), $1::smallint[], $2::time, $3::time, $4, $5::text[], $6, now())
           on conflict (provider_id) do update
             set working_days = excluded.working_days,
                 day_start = excluded.day_start,
                 day_end = excluded.day_end,
                 slot_minutes = excluded.slot_minutes,
                 service_areas = excluded.service_areas,
                 travel_radius_km = excluded.travel_radius_km,
                 updated_at = now()
           returning provider_id, working_days, to_char(day_start,'HH24:MI') as day_start,
                     to_char(day_end,'HH24:MI') as day_end, slot_minutes, service_areas, travel_radius_km`,
          [days, dayStart, dayEnd, slotMinutes, areas, radius],
        );
        return result.rows[0];
      });
      res.json({ ok: true, schedule });
    } catch (error) {
      mapError(res, error, 'SERVICE_SCHEDULE_FAILED');
    }
  });

  // Provider: block a specific date (holiday, travel, capacity).
  app.post('/api/services/provider/blackouts', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in to manage your calendar.');
    if (actor.role !== 'provider') return fail(res, 403, 'PROVIDER_SESSION_REQUIRED', 'Only a provider can block dates.');
    const date = String(req.body?.date || '');
    if (!DATE.test(date)) return fail(res, 400, 'INVALID_DATES', 'date must be YYYY-MM-DD.');
    try {
      await withActor(actor, async (client) => {
        await client.query(
          `insert into public.service_provider_blackouts (provider_id, blackout_date, reason)
           values (auth.uid(), $1::date, NULLIF($2, ''))
           on conflict (provider_id, blackout_date) do nothing`,
          [date, String(req.body?.reason || '').slice(0, 200)],
        );
      });
      res.status(201).json({ ok: true, date });
    } catch (error) {
      mapError(res, error, 'SERVICE_BLACKOUT_FAILED');
    }
  });

  // Signed provider callback (sandbox PSP). Fails closed everywhere else.
  app.post('/api/services/payments/sandbox/webhook', async (req, res) => {
    if (!sandboxEnabled) {
      return fail(res, 503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'No trusted payment provider is configured. No settlement was recorded.');
    }
    const body = req.body || {};
    const eventId = String(body.eventId || '').trim();
    const intentId = String(body.intentId || '').trim();
    const eventType = String(body.eventType || '').trim();
    const providerPaymentId = String(body.providerPaymentId || '').trim();
    const amountPaise = Number(body.amountPaise);
    if (!eventId || !intentId || !providerPaymentId) {
      return fail(res, 400, 'INVALID_PROVIDER_EVENT', 'eventId, intentId and providerPaymentId are required.');
    }
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      return fail(res, 400, 'INVALID_PROVIDER_EVENT', 'amountPaise must be a positive integer.');
    }
    if (!['payment.captured', 'payment.failed', 'refund.succeeded'].includes(eventType)) {
      return fail(res, 400, 'INVALID_PROVIDER_EVENT_TYPE', 'Unsupported provider event type.');
    }
    const expected = sign({ eventId, intentId, eventType, amountPaise, providerPaymentId });
    if (!signatureMatches(String(req.headers['x-bos-signature'] || ''), expected)) {
      return fail(res, 401, 'INVALID_PROVIDER_SIGNATURE', 'The provider signature did not verify. Nothing was settled.');
    }

    try {
      if (eventType === 'payment.failed') {
        await withProviderTransaction(async (client) => {
          await client.query(
            `update public.service_payment_intents set status = 'failed', updated_at = now()
              where id = $1 and status in ('created','pending')`,
            [intentId],
          );
        });
        return res.json({ ok: true, status: 'failed', settled: false });
      }
      if (eventType === 'refund.succeeded') {
        const payload = await withProviderTransaction(async (client) => {
          const result = await client.query(
            'select public.refund_service_payment($1, $2, $3, $4, $5) as payload',
            [eventId, intentId, amountPaise, providerPaymentId, expected],
          );
          return result.rows[0]?.payload;
        });
        return res.json({ ...payload, refunded: true });
      }
      const payload = await withProviderTransaction(async (client) => {
        const result = await client.query(
          'select public.settle_service_payment($1, $2, $3, $4, $5) as payload',
          [eventId, intentId, providerPaymentId, amountPaise, expected],
        );
        return result.rows[0]?.payload;
      });
      res.json({ ...payload, verified: true });
    } catch (error) {
      mapError(res, error, 'SERVICE_SETTLEMENT_FAILED');
    }
  });

  // Admin: refund a verified payment. Sandbox only; production needs a real PSP.
  app.post('/api/services/bookings/:id/refund', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in as an admin to refund.');
    if (actor.role !== 'admin') return fail(res, 403, 'ADMIN_REQUIRED', 'Only an active admin can issue a refund.');
    if (!sandboxEnabled) {
      return fail(res, 503, 'REFUND_PROVIDER_NOT_CONFIGURED', 'No trusted refund provider is configured. No refund was issued.');
    }
    const bookingId = String(req.params.id || '');
    if (!UUID.test(bookingId)) return fail(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    try {
      const prepared = await withActor(actor, async (client) => {
        const result = await client.query(
          `select i.id, i.amount, i.status, b.status as booking_status
             from public.service_payment_intents i
             join public.service_bookings b on b.id = i.booking_id
            where i.booking_id = $1
            order by i.created_at desc limit 1`,
          [bookingId],
        );
        return result.rows[0] || null;
      });
      if (!prepared) return fail(res, 404, 'PAYMENT_INTENT_NOT_FOUND', 'No online payment exists for this booking.');
      if (prepared.status !== 'verified') {
        return fail(res, 409, 'PAYMENT_NOT_VERIFIED', `Only a verified payment can be refunded (status: ${prepared.status}).`);
      }
      if (prepared.booking_status === 'completed') {
        return fail(res, 409, 'COMPLETED_JOB_REFUND_REQUIRES_PROVIDER', 'A completed job needs provider-approved reconciliation.');
      }
      const refundPaise = Math.round(Number(prepared.amount) * 100);
      const eventId = `sandbox-svc-refund-${crypto.randomUUID()}`;
      const providerRefundId = `rfnd_${crypto.randomUUID().replace(/-/g, '')}`;
      const signature = sign({ eventId, intentId: prepared.id, eventType: 'refund.succeeded', amountPaise: refundPaise, providerPaymentId: providerRefundId });
      const payload = await withProviderTransaction(async (client) => {
        const result = await client.query(
          'select public.refund_service_payment($1, $2, $3, $4, $5) as payload',
          [eventId, prepared.id, refundPaise, providerRefundId, signature],
        );
        return result.rows[0]?.payload;
      });
      res.json({ ...payload, provider: 'upi_sandbox', note: 'Sandbox refund recorded with a signed provider event. No live money moved.' });
    } catch (error) {
      mapError(res, error, 'SERVICE_REFUND_FAILED');
    }
  });
}

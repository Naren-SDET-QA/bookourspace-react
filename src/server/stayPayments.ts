import crypto from 'crypto';
import type express from 'express';
import { Pool, types, type PoolClient } from 'pg';

// SQL DATE (OID 1082) is a calendar date, not an instant. Letting node-postgres
// turn it into a JS Date shifts it across timezones and made refund windows
// unparseable. Keep the exact 'YYYY-MM-DD' text instead.
types.setTypeParser(1082, (value: string) => value);

/**
 * Stay checkout, UPI payment intents, pay-after-service, settlement and refunds.
 *
 * Money rules:
 *  - Every amount is computed by PostgreSQL from public.stay_room_types.
 *    A client-supplied amount is never used.
 *  - `payment_intents.status = 'verified'` can only be reached through
 *    public.settle_stay_payment(), called after an HMAC-signed provider event.
 *  - Sandbox settlement is available only when BOS_PAYMENT_SANDBOX=1, the
 *    process is not production, and BOS_PAYMENT_SANDBOX_SECRET is configured.
 *    Without it every settlement/refund route fails closed with 503.
 *  - Pay after service reserves inventory but keeps payment_status='pay_later'.
 *    It never reports money as received.
 */

export interface StayPaymentDeps {
  verifySession: (req: express.Request) => any | null;
  env?: NodeJS.ProcessEnv;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Actor = { supabaseUserId: string; role: 'customer' | 'provider' | 'admin' };

function fail(res: express.Response, status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  res.status(status).json({ ok: false, error, message, ...extra });
}

function mapDbError(res: express.Response, error: any, fallback: string) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  if (message.includes('AUTH_REQUIRED')) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in to continue.');
  if (message.includes('ROOM_TYPE_NOT_FOUND')) return fail(res, 404, 'ROOM_TYPE_NOT_FOUND', 'That room type is not published for this stay.');
  if (message.includes('INSUFFICIENT_AVAILABILITY') || message.includes('SEAT_TAKEN_BY_ANOTHER_GUEST')) {
    return fail(res, 409, 'NO_UNITS_AVAILABLE', 'Those dates were just taken. Pick different dates or another room.');
  }
  if (code === '23P01' || code === '40001' || code === '23505') {
    return fail(res, 409, 'NO_UNITS_AVAILABLE', 'Those dates were just taken. Pick different dates or another room.');
  }
  if (message.includes('MODULE_BOOKING_DISABLED')) {
    return fail(res, 409, 'MODULE_BOOKING_DISABLED', 'Online booking is disabled for this module.');
  }
  if (message.includes('MERCHANT_VPA_NOT_CONFIGURED')) {
    return fail(res, 503, 'MERCHANT_VPA_NOT_CONFIGURED', 'The receiving UPI ID is not configured. Payment is unavailable.');
  }
  if (code === '22023') {
    // Keep the specific, machine-readable reason (for example
    // PAYMENT_AMOUNT_MISMATCH) instead of collapsing every rejection into one
    // opaque code. The human message is unchanged.
    const specific = /^[A-Z][A-Z_]{3,}/.exec(message)?.[0];
    return fail(res, 400, specific || 'INVALID_REQUEST', message.replace(/^[A-Z_]+:?\s*/, ''));
  }
  if (code === '42501') return fail(res, 403, 'FORBIDDEN', 'This action is not permitted for this account.');
  if (code === 'P0002') return fail(res, 404, 'NOT_FOUND', 'The requested record does not exist.');
  console.error(`[stay-payments] ${fallback}:`, error);
  return fail(res, 500, fallback, 'The request could not be completed. Nothing was charged.');
}

export function registerStayPayments(app: express.Express, deps: StayPaymentDeps): void {
  const env = deps.env || process.env;
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  const sandboxSecret = String(env.BOS_PAYMENT_SANDBOX_SECRET || '').trim();
  const sandboxEnabled =
    env.BOS_PAYMENT_SANDBOX === '1' && env.NODE_ENV !== 'production' && sandboxSecret.length >= 16;
  const merchantVpa = String(env.BOS_UPI_MERCHANT_VPA || '').trim();
  const merchantName = String(env.BOS_UPI_MERCHANT_NAME || 'BookOurSpace').trim();

  const unavailable = (res: express.Response) =>
    fail(res, 503, 'STAY_PAYMENTS_UNAVAILABLE', 'Stay checkout requires the PostgreSQL repository.');

  if (!connectionString) {
    app.get('/api/payments/capabilities', (_req, res) =>
      res.json({ ok: true, upi: false, payAfterService: false, sandbox: false, database: false }),
    );
    app.post('/api/stays/checkout', (_req, res) => unavailable(res));
    app.get('/api/stays/:listingId/quote', (_req, res) => unavailable(res));
    return;
  }

  const pool = new Pool({ connectionString, max: 8 });

  async function withActor<T>(actor: Actor | null, run: (client: PoolClient) => Promise<T>): Promise<T> {
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
      try { await client.query('ROLLBACK'); } catch { /* keep original error */ }
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
      try { await client.query('ROLLBACK'); } catch { /* keep original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  function actorOf(req: express.Request): Actor | null {
    const session = deps.verifySession(req);
    if (!session?.supabaseUserId || !UUID.test(String(session.supabaseUserId))) return null;
    const role = session.role === 'admin' || session.role === 'provider' ? session.role : 'customer';
    return { supabaseUserId: String(session.supabaseUserId), role };
  }

  function signCanonical(event: { eventId: string; intentId: string; eventType: string; amountPaise: number; providerPaymentId: string }) {
    return crypto.createHmac('sha256', sandboxSecret).update(
      `${event.eventId}|${event.intentId}|${event.eventType}|${event.amountPaise}|${event.providerPaymentId}`,
      'utf-8',
    ).digest('hex');
  }

  function verifySignature(provided: string, expected: string): boolean {
    if (!provided || !expected || provided.length !== expected.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(provided, 'utf-8'), Buffer.from(expected, 'utf-8'));
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Capabilities: the UI renders UPI only when the server can honour it
  // ---------------------------------------------------------------------------
  app.get('/api/payments/capabilities', (_req, res) => {
    res.json({
      ok: true,
      database: true,
      upi: Boolean(merchantVpa),
      payAfterService: true,
      sandbox: sandboxEnabled,
      merchantVpa: merchantVpa || null,
      settlementVerification: sandboxEnabled ? 'signed_sandbox_psp' : 'unavailable',
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Public quote: price always comes from the database
  // ---------------------------------------------------------------------------
  app.get('/api/stays/:listingId/quote', async (req, res) => {
    const listingId = String(req.params.listingId || '');
    const roomTypeId = String(req.query.roomTypeId || '');
    const checkIn = String(req.query.checkIn || '');
    const checkOut = String(req.query.checkOut || '');
    const units = Math.min(5, Math.max(1, Number(req.query.units) || 1));
    if (!UUID.test(roomTypeId)) return fail(res, 400, 'INVALID_ROOM_TYPE', 'roomTypeId must be a UUID.');
    if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) {
      return fail(res, 400, 'INVALID_DATES', 'checkIn/checkOut must be YYYY-MM-DD with checkOut after checkIn.');
    }
    try {
      const quote = await withActor(null, async (client) => {
        const result = await client.query(
          `select rt.id as room_type_id, rt.name, rt.base_price_paise,
                  (($3::date - $2::date))::int as nights,
                  (($3::date - $2::date) * rt.base_price_paise * $4::int)::bigint as total_paise,
                  (select count(*)::int from public.stay_availability(rt.id, $2::date, $3::date)) as available_units
             from public.stay_room_types rt
             join public.stay_properties p on p.id = rt.property_id
            where rt.id = $1 and p.listing_id = $5 and rt.is_active and p.is_active`,
          [roomTypeId, checkIn, checkOut, units, listingId],
        );
        return result.rows[0] || null;
      });
      if (!quote) return fail(res, 404, 'ROOM_TYPE_NOT_FOUND', 'That room type is not published for this stay.');
      res.json({
        ok: true,
        listingId,
        roomTypeId: quote.room_type_id,
        roomType: quote.name,
        nights: Number(quote.nights),
        units,
        basePricePaise: Number(quote.base_price_paise),
        totalPaise: Number(quote.total_paise),
        availableUnits: Number(quote.available_units),
        checkIn,
        checkOut,
        serverComputed: true,
      });
    } catch (error) {
      mapDbError(res, error, 'QUOTE_FAILED');
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Checkout: hold inventory + booking + intent in one transaction
  // ---------------------------------------------------------------------------
  app.post('/api/stays/checkout', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in with a verified account to book a stay.');
    const body = req.body || {};
    const listingId = String(body.listingId || '');
    const roomTypeId = String(body.roomTypeId || '');
    const checkIn = String(body.checkIn || '');
    const checkOut = String(body.checkOut || '');
    const units = Math.min(5, Math.max(1, Number(body.units) || 1));
    const mode = body.paymentMode === 'pay_after_service' ? 'pay_after_service' : 'upi';
    const idempotencyKey = String(body.idempotencyKey || req.headers['x-idempotency-key'] || '').trim();

    if (!listingId) return fail(res, 400, 'MISSING_LISTING', 'listingId is required.');
    if (!UUID.test(roomTypeId)) return fail(res, 400, 'INVALID_ROOM_TYPE', 'roomTypeId must be a UUID.');
    if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) {
      return fail(res, 400, 'INVALID_DATES', 'checkIn/checkOut must be YYYY-MM-DD with checkOut after checkIn.');
    }
    if (idempotencyKey.length < 8) {
      return fail(res, 400, 'MISSING_IDEMPOTENCY_KEY', 'An idempotency key is required to prevent duplicate bookings.');
    }
    // Pay-after-service takes no online payment, so it must not depend on a
    // configured UPI receiver. Only the online (UPI) path requires one.
    if (mode === 'upi' && !merchantVpa) {
      return fail(res, 503, 'MERCHANT_VPA_NOT_CONFIGURED', 'The receiving UPI ID is not configured. Payment is unavailable.');
    }
    if (mode === 'upi' && !sandboxEnabled && env.NODE_ENV === 'production') {
      return fail(res, 503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Online payment verification is unavailable.');
    }

    try {
      const result = await withActor(actor, async (client) => {
        const query = await client.query(
          `select public.create_stay_checkout($1,$2,$3::date,$4::date,$5,$6,$7,$8,$9,$10::jsonb) as payload`,
          [
            listingId, roomTypeId, checkIn, checkOut, units, mode, idempotencyKey,
            merchantVpa, merchantName,
            JSON.stringify({ name: body.guestName || '', phone: body.guestPhone || '' }),
          ],
        );
        return query.rows[0]?.payload;
      });
      res.status(result?.replayed ? 200 : 201).json(result);
    } catch (error) {
      mapDbError(res, error, 'STAY_CHECKOUT_FAILED');
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Intent status (owner or admin only, enforced by RLS)
  // ---------------------------------------------------------------------------
  app.get('/api/payments/intents/:intentId', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in to view a payment.');
    try {
      const intent = await withActor(actor, async (client) => {
        const result = await client.query(
          `select id, booking_id, status, payment_mode, amount_paise, currency,
                  provider, provider_payment_id, verified_at, refund_paise, expires_at
             from public.payment_intents where id = $1`,
          [String(req.params.intentId || '')],
        );
        return result.rows[0] || null;
      });
      if (!intent) return fail(res, 404, 'PAYMENT_INTENT_NOT_FOUND', 'No payment matches that reference.');
      res.json({
        ok: true,
        intentId: intent.id,
        bookingId: intent.booking_id,
        status: intent.status,
        paymentMode: intent.payment_mode,
        amountPaise: Number(intent.amount_paise),
        currency: intent.currency,
        provider: intent.provider,
        providerPaymentId: intent.provider_payment_id,
        verifiedAt: intent.verified_at,
        refundPaise: intent.refund_paise === null ? null : Number(intent.refund_paise),
        expiresAt: intent.expires_at,
        paid: intent.status === 'verified' || intent.status === 'refunded',
      });
    } catch (error) {
      mapDbError(res, error, 'PAYMENT_INTENT_LOOKUP_FAILED');
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Signed provider callback (sandbox PSP)
  //
  // The signature covers the fields that move money. A browser cannot mint it
  // because BOS_PAYMENT_SANDBOX_SECRET never leaves the server.
  // ---------------------------------------------------------------------------
  app.post('/api/payments/sandbox/psp-webhook', async (req, res) => {
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
    if (!['payment.captured', 'payment.failed', 'refund.succeeded'].includes(eventType)) {
      return fail(res, 400, 'INVALID_PROVIDER_EVENT_TYPE', 'Unsupported provider event type.');
    }
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      return fail(res, 400, 'INVALID_PROVIDER_EVENT', 'amountPaise must be a positive integer.');
    }
    const expected = signCanonical({ eventId, intentId, eventType, amountPaise, providerPaymentId });
    if (!verifySignature(String(req.headers['x-bos-signature'] || ''), expected)) {
      return fail(res, 401, 'INVALID_PROVIDER_SIGNATURE', 'The provider signature did not verify. Nothing was settled.');
    }

    try {
      if (eventType === 'payment.failed') {
        const outcome = await withProviderTransaction(async (client) => {
          // Record the provider event first so that a repeated failure
          // callback is an auditable replay instead of a silent no-op.
          const recorded = await client.query(
            `insert into public.payment_provider_events
               (event_id, provider, intent_id, event_type, payload_sha256, amount_paise, processed_at)
             values ($1,'upi_sandbox',$2,'payment.failed',$3,$4, now())
             on conflict (event_id) do nothing
             returning event_id`,
            [eventId, intentId, expected, amountPaise],
          );
          const result = await client.query(
            `update public.payment_intents set status = 'failed', updated_at = now()
              where id = $1 and status in ('created','pending') returning id`,
            [intentId],
          );
          return { settled: result.rowCount === 1, replayed: recorded.rowCount === 0 };
        });
        return res.json({ ok: true, status: outcome.settled ? 'failed' : 'unchanged', settled: false, replayed: outcome.replayed });
      }

      if (eventType === 'refund.succeeded') {
        const result = await withProviderTransaction(async (client) => {
          const query = await client.query(
            `select public.refund_stay_payment($1,$2,$3,$4,$5) as payload`,
            [eventId, intentId, amountPaise, providerPaymentId, expected],
          );
          return query.rows[0]?.payload;
        });
        return res.json({ ...result, refunded: true });
      }

      const result = await withProviderTransaction(async (client) => {
        const query = await client.query(
          `select public.settle_stay_payment($1,$2,$3,$4,$5) as payload`,
          [eventId, intentId, providerPaymentId, amountPaise, expected],
        );
        return query.rows[0]?.payload;
      });
      res.json({ ...result, verified: true });
    } catch (error) {
      mapDbError(res, error, 'PROVIDER_SETTLEMENT_FAILED');
    }
  });

  // ---------------------------------------------------------------------------
  // 6. Admin refund. Sandbox only; production requires a real provider.
  // ---------------------------------------------------------------------------
  app.post('/api/payments/intents/:intentId/refund', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in as an admin to refund.');
    if (actor.role !== 'admin') return fail(res, 403, 'ADMIN_REQUIRED', 'Only an active admin can issue a refund.');
    if (!sandboxEnabled) {
      return fail(res, 503, 'REFUND_PROVIDER_NOT_CONFIGURED', 'No trusted refund provider is configured. No refund was issued.');
    }
    const intentId = String(req.params.intentId || '');
    try {
      const prepared = await withProviderTransaction(async (client) => {
        const result = await client.query(
          `select pi.id, pi.amount_paise, pi.status, b.check_in
             from public.payment_intents pi
             left join public.bookings b on b.id = pi.booking_id
            where pi.id = $1 for update of pi`,
          [intentId],
        );
        return result.rows[0] || null;
      });
      if (!prepared) return fail(res, 404, 'PAYMENT_INTENT_NOT_FOUND', 'No payment matches that reference.');
      if (prepared.status !== 'verified') {
        return fail(res, 409, 'PAYMENT_NOT_VERIFIED', `Only a verified payment can be refunded (status: ${prepared.status}).`);
      }
      const checkInIso = String(prepared.check_in || '').slice(0, 10);
      const checkInMs = /^\d{4}-\d{2}-\d{2}$/.test(checkInIso)
        ? Date.parse(`${checkInIso}T12:00:00+05:30`)
        : NaN;
      const hours = Number.isFinite(checkInMs) ? (checkInMs - Date.now()) / 3_600_000 : 0;
      const amount = Number(prepared.amount_paise);
      const refundPaise = hours >= 48 ? amount : hours >= 24 ? Math.round(amount / 2) : 0;
      if (refundPaise <= 0) {
        return fail(res, 409, 'NO_REFUND_DUE', 'The cancellation window for a refund has passed. No money was moved.');
      }
      const eventId = `sandbox-refund-${crypto.randomUUID()}`;
      const providerRefundId = `rfnd_${crypto.randomUUID().replace(/-/g, '')}`;
      const signature = signCanonical({ eventId, intentId, eventType: 'refund.succeeded', amountPaise: refundPaise, providerPaymentId: providerRefundId });
      const result = await withProviderTransaction(async (client) => {
        const query = await client.query(
          `select public.refund_stay_payment($1,$2,$3,$4,$5) as payload`,
          [eventId, intentId, refundPaise, providerRefundId, signature],
        );
        return query.rows[0]?.payload;
      });
      res.json({ ...result, provider: 'upi_sandbox', note: 'Sandbox refund recorded with a signed provider event. No live money moved.' });
    } catch (error) {
      mapDbError(res, error, 'REFUND_FAILED');
    }
  });
}

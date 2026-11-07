import crypto from 'crypto';
import type express from 'express';
import { types, type PoolClient } from 'pg';
import { validateGuestDetails } from '../lib/stayGuestValidation';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';
import { stayListingUnbookableReason, stayPayload } from '../lib/stayListingGate';
import {
  StayRazorpayError,
  createStayRazorpayOrder,
  createStayRazorpayUpiQr,
  fetchStayRazorpayPayment,
  refundStayRazorpayPayment,
  stayPaymentSandboxEnabled,
  stayRazorpayIsTestKey,
  stayRazorpayKeysConfigured,
  stayRazorpayReady,
  stayRazorpayWebhookConfigured,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from './stayRazorpay';

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

type Actor = { supabaseUserId: string; role: 'customer' | 'provider' | 'admin'; email: string };

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
  if (message.includes('STAY_NOT_PUBLICLY_BOOKABLE') || message.includes('STAY_DEMO_NOT_BOOKABLE') || message.includes('STAY_NOT_APPROVED')) {
    const code = message.includes('DEMO') ? 'STAY_DEMO_NOT_BOOKABLE' : 'STAY_NOT_APPROVED';
    return fail(res, 409, code, code === 'STAY_DEMO_NOT_BOOKABLE'
      ? 'Demo hotels cannot accept real bookings.'
      : 'This hotel is not approved and available for booking.');
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
  // Payment provider/database exceptions can contain request metadata. Keep
  // logs useful for operations without serializing provider payloads, SQL, or
  // connection configuration.
  const safeCode = /^[A-Z0-9]{5}$/.test(code) ? code : 'NO_CODE';
  const safeConstraint = /^[a-zA-Z0-9_]{1,80}$/.test(String(error?.constraint || ''))
    ? String(error.constraint)
    : '';
  const safeRoutine = /^[a-zA-Z0-9_]{1,80}$/.test(String(error?.routine || ''))
    ? String(error.routine)
    : '';
  const safeInputTypeError = code === '22P02'
    ? (/^invalid input syntax for type [a-z ]+/i.exec(message)?.[0] || 'invalid input syntax')
    : '';
  const safeContext = /PL\/pgSQL function ([a-zA-Z0-9_.]+) line (\d+)/.exec(String(error?.where || ''));
  console.error(`[stay-payments] ${fallback} code=${safeCode}${safeConstraint ? ` constraint=${safeConstraint}` : ''}${safeRoutine ? ` routine=${safeRoutine}` : ''}${safeInputTypeError ? ` detail=${safeInputTypeError}` : ''}${safeContext ? ` context=${safeContext[1]}:${safeContext[2]}` : ''}`);
  return fail(res, 500, fallback, 'The request could not be completed. Nothing was charged.');
}

export function registerStayPayments(app: express.Express, deps: StayPaymentDeps): void {
  const env = deps.env || process.env;
  // Demo inventory is bookable end to end only under an explicit local preview.
  const allowDemoBooking = env.NODE_ENV !== 'production' && env.BOS_STAY_ALLOW_DEMO_BOOKING === '1';
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  if (connectionString) assertPostgresConnectionTarget(connectionString, env);
  const sandboxSecret = String(env.BOS_PAYMENT_SANDBOX_SECRET || '').trim();
  const sandboxEnabled = stayPaymentSandboxEnabled(env);
  // UPI-only local sandbox: enables the QR/intent demo without turning real
  // Razorpay test orders into sandbox orders.
  const upiSandboxEnabled = String(env.BOS_UPI_SANDBOX || '') === '1'
    && env.NODE_ENV !== 'production'
    && sandboxSecret.length >= 16;
  const localUpiSandbox = sandboxEnabled || upiSandboxEnabled;
  const razorpayReady = stayRazorpayReady(env);
  const razorpayKeyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const razorpayWebhookSecret = String(env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  const merchantVpa = String(env.BOS_UPI_MERCHANT_VPA || '').trim();
  const merchantName = String(env.BOS_UPI_MERCHANT_NAME || 'BookOurSpace').trim();
  // UPI QR codes need either the local sandbox VPA or an account whose Razorpay
  // plan has QR Codes enabled (explicit opt-in). Razorpay Checkout still offers
  // UPI as a payment method, which is reported separately as upiViaCheckout.
  const upiQrEnabled = localUpiSandbox
    ? Boolean(merchantVpa.includes('@'))
    : String(env.BOS_UPI_QR_ENABLED || '') === '1';
  const upiQrEnv = localUpiSandbox ? { ...env, BOS_PAYMENT_SANDBOX: '1' } : env;
  const verifiedUpi = upiQrEnabled;

  const unavailable = (res: express.Response) =>
    fail(res, 503, 'STAY_PAYMENTS_UNAVAILABLE', 'Stay checkout requires the PostgreSQL repository.');

  if (!connectionString) {
    app.get('/api/payments/capabilities', (_req, res) =>
      res.json({
        ok: true, upi: false, upiQr: false, upiSandbox: false, upiViaCheckout: false, razorpay: false, payAfterService: false, sandbox: false, database: false,
        razorpayConfigured: false, razorpayKeyId: null, razorpayTestMode: false, settlementVerification: 'unavailable',
      }),
    );
    app.post('/api/stays/checkout', (_req, res) => unavailable(res));
    app.get('/api/stays/:listingId/quote', (_req, res) => unavailable(res));
    return;
  }

  const pool = getSharedPostgresPool(connectionString, env);

  async function withActor<T>(actor: Actor | null, run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${actor ? 'authenticated' : 'anon'}`);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor?.supabaseUserId || '']);
      await client.query("select set_config('request.jwt.claim.role', $1, true)", [actor ? 'authenticated' : 'anon']);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ ...(actor?.supabaseUserId ? { sub: actor.supabaseUserId } : {}), role: actor ? 'authenticated' : 'anon' }),
      ]);
      if (allowDemoBooking) {
        await client.query("select set_config('bos.allow_demo_booking', 'on', true)");
      }
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
      // The callback was independently authenticated (sandbox HMAC or
      // Razorpay signature) before this trusted server-only transaction.
      // Set the same claims Supabase PostgREST provides so triggers and
      // SECURITY DEFINER functions see a valid service-role context.
      await client.query('SET LOCAL ROLE service_role');
      if (allowDemoBooking) {
        await client.query("select set_config('bos.allow_demo_booking', 'on', true)");
      }
      await client.query("select set_config('request.jwt.claim.sub', '', true)");
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      await client.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
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
    if (!session?.supabaseUserId || session.authProvider !== 'google' || !UUID.test(String(session.supabaseUserId))) return null;
    const role = session.role === 'admin' || session.role === 'provider' ? session.role : 'customer';
    return { supabaseUserId: String(session.supabaseUserId), role, email: String(session.email || '').trim().toLowerCase() };
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
      upi: verifiedUpi,
      upiQr: upiQrEnabled,
      upiSandbox: upiSandboxEnabled,
      upiViaCheckout: razorpayReady,
      razorpay: razorpayReady,
      razorpayConfigured: stayRazorpayKeysConfigured(env),
      razorpayKeyId: razorpayReady ? razorpayKeyId : null,
      razorpayTestMode: razorpayReady && stayRazorpayIsTestKey(env),
      payAfterService: true,
      sandbox: localUpiSandbox,
      merchantVpa: merchantVpa || null,
      settlementVerification: razorpayReady
        ? (localUpiSandbox ? 'signed_sandbox_or_razorpay'
          : stayRazorpayWebhookConfigured(env) ? 'razorpay_webhook'
          : 'razorpay_checkout_fetch')
        : localUpiSandbox ? 'signed_sandbox_psp' : 'unavailable',
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
      const demoClause = allowDemoBooking ? '' : "and coalesce(l.payload->>'demo','false') <> 'true'";
      const quote = await withActor(null, async (client) => {
        const result = await client.query(
          `select rt.id as room_type_id, rt.name, rt.base_price_paise,
                  q.nights, q.units, q.subtotal_paise, q.cleaning_fee_paise,
                  q.service_fee_paise, q.tax_percent, q.taxes_paise, q.total_paise,
                  (select count(*)::int from public.stay_availability(rt.id, $2::date, $3::date)) as available_units
             from public.stay_room_types rt
             join public.stay_properties p on p.id = rt.property_id
             cross join lateral public.stay_price_quote(rt.id, $2::date, $3::date, $4::int) q
             join public.listings l on l.id = p.listing_id
            where rt.id = $1 and p.listing_id = $5 and rt.is_active and p.is_active
              and l.status = 'active'
              ${demoClause}
              and coalesce(l.payload->>'stayLifecycle','approved') not in ('draft','submitted','changes_requested','rejected','suspended')`,
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
        subtotalPaise: Number(quote.subtotal_paise),
        cleaningFeePaise: Number(quote.cleaning_fee_paise || 0),
        serviceFeePaise: Number(quote.service_fee_paise || 0),
        taxPercent: Number(quote.tax_percent || 0),
        taxesPaise: Number(quote.taxes_paise || 0),
        // The server total already includes cleaning, service fee and taxes.
        totalPaise: Number(quote.total_paise),
        totalWithTaxesPaise: Number(quote.total_paise),
        taxesSettledAtProperty: false,
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
    const requestedMode = String(body.paymentMode || 'upi');
    const mode = requestedMode === 'pay_after_service'
      ? 'pay_after_service'
      : requestedMode === 'razorpay' ? 'razorpay' : 'upi';
    const idempotencyKey = String(body.idempotencyKey || req.headers['x-idempotency-key'] || '').trim();

    if (!listingId) return fail(res, 400, 'MISSING_LISTING', 'listingId is required.');
    if (!UUID.test(roomTypeId)) return fail(res, 400, 'INVALID_ROOM_TYPE', 'roomTypeId must be a UUID.');
    if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) {
      return fail(res, 400, 'INVALID_DATES', 'checkIn/checkOut must be YYYY-MM-DD with checkOut after checkIn.');
    }
    if (idempotencyKey.length < 8) {
      return fail(res, 400, 'MISSING_IDEMPOTENCY_KEY', 'An idempotency key is required to prevent duplicate bookings.');
    }
    const guest = validateGuestDetails(body.guestName, body.guestEmail || actor.email, body.guestPhone);
    if (!guest.ok) {
      return fail(res, 400, 'INVALID_GUEST_DETAILS', guest.message);
    }
    if (!actor.email || guest.email !== actor.email) {
      return fail(res, 403, 'GUEST_EMAIL_MISMATCH', 'Use the email address from your signed-in Google account.');
    }
    const requestedGuests = Number(body.guests ?? 1);
    if (!Number.isInteger(requestedGuests) || requestedGuests < 1 || requestedGuests > 20) {
      return fail(res, 400, 'INVALID_GUEST_COUNT', 'Guest count must be between 1 and 20.');
    }
    const guestAddress = String(body.guestAddress || '').trim();
    if (guestAddress.length > 250) return fail(res, 400, 'INVALID_GUEST_ADDRESS', 'Address must be 250 characters or fewer.');
    if (mode === 'razorpay' && !razorpayReady) {
      return fail(res, 503, 'RAZORPAY_NOT_CONFIGURED', 'Razorpay Checkout is not configured. Choose UPI or pay at the property.');
    }
    if (mode === 'upi' && !verifiedUpi && !razorpayReady) {
      return fail(res, 503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Verified UPI is unavailable. Choose Razorpay or pay at the property.');
    }
    if (mode === 'upi' && !razorpayReady && !merchantVpa.includes('@')) {
      return fail(res, 503, 'MERCHANT_VPA_NOT_CONFIGURED', 'The receiving UPI ID is not configured. Payment is unavailable.');
    }

    try {
      const gate = await withActor(actor, async (client) => {
        const result = await client.query(
          `select l.status, l.payload, p.is_active, l.is_verified, l.verified_by,
                  coalesce(owner.verified, false) as owner_verified
             from public.listings l
             join public.stay_properties p on p.listing_id = l.id
             left join public.public_provider_profile_projection owner on owner.id = p.owner_user_id
            where l.id = $1
            limit 1`,
          [listingId],
        );
        return result.rows[0] || null;
      });
      if (!gate) return fail(res, 404, 'LISTING_NOT_FOUND', 'That stay is not available.');
      const reason = stayListingUnbookableReason({
        listingStatus: String(gate.status || ''),
        listingVerified: gate.is_verified === true && Boolean(gate.verified_by),
        ownerVerified: gate.owner_verified === true,
        propertyActive: gate.is_active === true,
        payload: stayPayload(gate.payload),
        allowDemoBooking,
      });
      if (reason) {
        const code = reason || 'STAY_NOT_APPROVED';
        return fail(
          res,
          409,
          code,
          code === 'STAY_DEMO_NOT_BOOKABLE'
            ? 'Demo hotels cannot accept real bookings.'
            : 'This hotel is not approved, active and available for booking.',
        );
      }

      let providerOrderId: string | null = null;
      let upiUriOverride: string | null = null;
      let qrImageUrl: string | null = null;
      // The stored payment mode can differ from the requested one when UPI QR
      // is unavailable: the client is handed a Razorpay order instead, and the
      // Razorpay Checkout UI offers UPI alongside cards and wallets.
      let effectiveMode: typeof mode = mode;
      let fallbackFromUpi = false;
      if (mode === 'razorpay' || (mode === 'upi' && razorpayReady && !sandboxEnabled)) {
        const quote = await withActor(null, async (client) => {
          const result = await client.query(
            `select q.total_paise
               from public.stay_room_types rt
               join public.stay_properties p on p.id = rt.property_id
               cross join lateral public.stay_price_quote(rt.id, $2::date, $3::date, $4::int) q
              join public.listings l on l.id = p.listing_id
              join public.public_provider_profile_projection host on host.id = p.owner_user_id and host.verified is true
              where rt.id = $1 and p.listing_id = $5 and rt.is_active and p.is_active
                and l.status = 'active' and l.is_verified is true and l.verified_by is not null
                and l.payload->>'stayLifecycle' = 'approved'
                and (coalesce(l.payload->>'demo','false') <> 'true' or $6::boolean)`,
            [roomTypeId, checkIn, checkOut, units, listingId, allowDemoBooking],
          );
          return result.rows[0] || null;
        });
        const amountPaise = Number(quote?.total_paise);
        if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
          return fail(res, 404, 'ROOM_TYPE_NOT_FOUND', 'That room type is not published for this stay.');
        }
        const orderReceipt = `stay_${idempotencyKey}`.slice(0, 40);
        if (mode === 'razorpay') {
          const order = await createStayRazorpayOrder(env, amountPaise, orderReceipt);
          providerOrderId = order.orderId;
        } else if (upiQrEnabled) {
          try {
            const qr = await createStayRazorpayUpiQr(
              upiQrEnv, amountPaise, `BookOurSpace stay ${listingId.slice(0, 18)}`, merchantVpa, merchantName, idempotencyKey,
            );
            providerOrderId = qr.qrId;
            upiUriOverride = qr.upiUri;
            qrImageUrl = qr.imageUrl;
          } catch (error) {
            if (!(error instanceof StayRazorpayError) || !razorpayReady) throw error;
            // The merchant account rejected QR creation. Fall back to Razorpay
            // Checkout so UPI remains payable instead of failing the booking.
            const order = await createStayRazorpayOrder(env, amountPaise, orderReceipt);
            providerOrderId = order.orderId;
            effectiveMode = 'razorpay';
            fallbackFromUpi = true;
          }
        } else {
          // QR is not enabled for this account; use Razorpay Checkout (UPI is
          // one of its payment methods).
          const order = await createStayRazorpayOrder(env, amountPaise, orderReceipt);
          providerOrderId = order.orderId;
          effectiveMode = 'razorpay';
          fallbackFromUpi = true;
        }
      }

      const result = await withActor(actor, async (client) => {
        const currentProfile = await client.query(
          'select role, account_status from public.profiles where id = auth.uid() limit 1',
        );
        if (currentProfile.rows[0]?.role !== 'customer' || currentProfile.rows[0]?.account_status !== 'active') {
          throw Object.assign(new Error('ACTIVE_CUSTOMER_REQUIRED'), { code: '42501' });
        }
        // create_stay_checkout receives only server-configured payment
        // details. Customer identity remains bound to auth.uid() while this
        // single transaction uses the service-only RPC grant.
        await client.query('SET LOCAL ROLE service_role');
        await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: actor.supabaseUserId, role: 'service_role' }),
        ]);
        const query = await client.query(
          `select public.create_stay_checkout($1,$2,$3::date,$4::date,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13) as payload`,
          [
            listingId, roomTypeId, checkIn, checkOut, units, effectiveMode, idempotencyKey,
            merchantVpa, merchantName,
            JSON.stringify({ name: guest.name, phone: guest.phone }),
            providerOrderId, upiUriOverride, qrImageUrl,
          ],
        );
        const payload = query.rows[0]?.payload;
        if (payload?.ok !== false && payload?.bookingId) {
          // Guest contact data is guarded by the authenticated booking owner
          // RPC. Return to that role after the server-only checkout RPC, while
          // keeping auth.uid() bound to the verified Google subject.
          await client.query('SET LOCAL ROLE authenticated');
          await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
          await client.query('select set_config(\'request.jwt.claims\', $1, true)', [
            JSON.stringify({ sub: actor.supabaseUserId, role: 'authenticated' }),
          ]);
          await client.query(
            'select public.attach_stay_booking_guest_details($1,$2,$3,$4)',
            [String(payload.bookingId), guest.email, requestedGuests, guestAddress || null],
          );
        }
        return payload;
      });
      res.status(result?.replayed ? 200 : 201).json({
        ...result,
        razorpayKeyId: effectiveMode === 'razorpay' && razorpayReady ? razorpayKeyId : null,
        ...(fallbackFromUpi ? { fallbackFromUpi: true } : {}),
      });
    } catch (error) {
      if (error instanceof StayRazorpayError) {
        return fail(res, error.status, error.code, error.message);
      }
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
    if (!localUpiSandbox) {
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
              where id = $1 and status in ('created','pending') returning id, booking_id`,
            [intentId],
          );
          const bookingId = result.rows[0]?.booking_id;
          if (bookingId) {
            await client.query(
              `update public.stay_allocations
                  set status = 'released', updated_at = now()
                where booking_id = $1 and status in ('held','confirmed')`,
              [bookingId],
            );
            await client.query(
              `update public.bookings
                  set payment_status = 'failed', status = 'cancelled', cancelled_at = now()
                where id = $1 and payment_status <> 'verified'`,
              [bookingId],
            );
            await client.query(
              `insert into public.notifications (recipient_user_id, title, message, notif_type, link_id)
               select user_id, 'Payment failed',
                      'The provider reported this payment as failed. No booking was confirmed and the room was released.',
                      'stay_payment', id
                 from public.bookings where id = $1`,
              [bookingId],
            );
          }
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

  async function applyStayProviderEvent(input: {
    eventId: string;
    eventType: string;
    provider: string;
    intentId?: string | null;
    orderId?: string | null;
    providerPaymentId: string;
    amountPaise: number;
    payloadHash: string;
  }) {
    return withProviderTransaction(async (client) => {
      const query = await client.query(
        `select public.settle_stay_provider_event($1,$2,$3,$4,$5,$6,$7,$8) as payload`,
        [
          input.eventId, input.eventType, input.provider,
          input.intentId || null, input.orderId || null,
          input.providerPaymentId, input.amountPaise, input.payloadHash,
        ],
      );
      return query.rows[0]?.payload;
    });
  }

  function parseRazorpayEvent(body: any): {
    event: string;
    eventType: string;
    orderId: string;
    paymentId: string;
    amountPaise: number;
  } | { ignored: true; event: string } {
    const event = String(body?.event || '').trim();
    const payment = body?.payload?.payment?.entity || {};
    const refund = body?.payload?.refund?.entity || {};
    const qr = body?.payload?.qr_code?.entity || {};
    if (event === 'payment.captured' || event === 'qr_code.credited') {
      const paymentId = String(payment.id || '').trim();
      const orderId = String(payment.order_id || qr.id || '').trim();
      return {
        event,
        eventType: 'payment.captured',
        orderId,
        paymentId,
        amountPaise: Number(payment.amount),
      };
    }
    if (event === 'payment.failed') {
      return {
        event,
        eventType: 'payment.failed',
        orderId: String(payment.order_id || qr.id || '').trim(),
        paymentId: String(payment.id || '').trim(),
        amountPaise: Number(payment.amount),
      };
    }
    if (event === 'refund.processed') {
      return {
        event,
        eventType: 'refund.succeeded',
        orderId: String(payment.order_id || '').trim(),
        paymentId: String(refund.payment_id || payment.id || '').trim(),
        amountPaise: Number(refund.amount || payment.amount),
      };
    }
    return { ignored: true, event };
  }

  // ---------------------------------------------------------------------------
  // 6. Razorpay Checkout + UPI QR webhooks (raw-body HMAC).
  // ---------------------------------------------------------------------------
  app.post('/api/stays/payments/razorpay/webhook', async (req, res) => {
    if (!stayRazorpayWebhookConfigured(env) && !sandboxEnabled) {
      return fail(res, 503, 'RAZORPAY_WEBHOOK_NOT_CONFIGURED', 'No Razorpay webhook secret is configured. Nothing was settled.');
    }
    const rawBody = Buffer.isBuffer((req as any).rawBody)
      ? ((req as any).rawBody as Buffer)
      : Buffer.from(JSON.stringify(req.body ?? {}), 'utf-8');
    const secret = stayRazorpayWebhookConfigured(env) ? razorpayWebhookSecret : sandboxSecret;
    if (!verifyRazorpayWebhookSignature(rawBody, String(req.headers['x-razorpay-signature'] || ''), secret)) {
      return fail(res, 401, 'INVALID_WEBHOOK_SIGNATURE', 'The Razorpay signature did not verify. Nothing was settled.');
    }
    const parsed = parseRazorpayEvent(req.body);
    if ('ignored' in parsed) {
      return res.status(202).json({ ok: true, ignored: true, event: parsed.event });
    }
    if (!parsed.paymentId || !Number.isInteger(parsed.amountPaise) || parsed.amountPaise <= 0) {
      return fail(res, 400, 'INVALID_PROVIDER_EVENT', 'The Razorpay payload is missing a payment reference or amount.');
    }
    const eventId = `razorpay:stay:${parsed.event}:${parsed.paymentId}`;
    try {
      const result = await applyStayProviderEvent({
        eventId,
        eventType: parsed.eventType,
        provider: 'razorpay',
        orderId: parsed.orderId || null,
        providerPaymentId: parsed.paymentId,
        amountPaise: parsed.amountPaise,
        payloadHash: crypto.createHmac('sha256', secret).update(rawBody).digest('hex'),
      });
      res.json({ ok: true, ...result, verified: parsed.eventType === 'payment.captured' && result?.status === 'verified' });
    } catch (error) {
      mapDbError(res, error, 'PROVIDER_SETTLEMENT_FAILED');
    }
  });

  // Checkout.js handler: verify HMAC, then fetch the payment from Razorpay
  // (or accept a labelled sandbox payment) before settling PostgreSQL.
  app.post('/api/stays/payments/razorpay/verify', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in to confirm a payment.');
    if (!razorpayReady) {
      return fail(res, 503, 'RAZORPAY_NOT_CONFIGURED', 'Razorpay verification is unavailable.');
    }
    const intentId = String(req.body?.intentId || '').trim();
    const orderId = String(req.body?.razorpayOrderId || '').trim();
    const paymentId = String(req.body?.razorpayPaymentId || '').trim();
    const signature = String(req.body?.razorpaySignature || '').trim();
    if (!intentId || !orderId || !paymentId || !signature) {
      return fail(res, 400, 'INVALID_CHECKOUT_PAYLOAD', 'intentId, razorpayOrderId, razorpayPaymentId and razorpaySignature are required.');
    }
    const keySecret = String(env.RAZORPAY_KEY_SECRET || '').trim();
    if (!verifyRazorpayCheckoutSignature(orderId, paymentId, signature, keySecret)) {
      return fail(res, 401, 'INVALID_CHECKOUT_SIGNATURE', 'The Razorpay checkout signature did not verify. Nothing was settled.');
    }
    try {
      const owned = await withActor(actor, async (client) => {
        const result = await client.query(
          `select pi.id, pi.amount_paise, pi.provider_order_id, pi.status
             from public.payment_intents pi
            where pi.id = $1 and pi.user_id = $2`,
          [intentId, actor.supabaseUserId],
        );
        return result.rows[0] || null;
      });
      if (!owned) return fail(res, 404, 'PAYMENT_INTENT_NOT_FOUND', 'No payment matches that reference.');
      if (String(owned.provider_order_id || '') !== orderId) {
        return fail(res, 409, 'RAZORPAY_ORDER_MISMATCH', 'That Razorpay order does not belong to this stay payment.');
      }
      let capturedAmount = Number(owned.amount_paise);
      if (sandboxEnabled && (orderId.startsWith('order_sandbox_') || paymentId.startsWith('pay_sandbox_'))) {
        if (Number(owned.amount_paise) <= 0) {
          return fail(res, 409, 'PAYMENT_AMOUNT_MISMATCH', 'The sandbox payment amount did not match the stay quote.');
        }
      } else {
        const payment = await fetchStayRazorpayPayment(env, paymentId);
        if (payment.status !== 'captured') {
          return fail(res, 409, 'PAYMENT_NOT_CAPTURED', `Razorpay reports status ${payment.status}. Nothing was settled.`);
        }
        if (payment.orderId && payment.orderId !== orderId) {
          return fail(res, 409, 'RAZORPAY_ORDER_MISMATCH', 'The captured payment belongs to a different order.');
        }
        if (payment.amount !== Number(owned.amount_paise)) {
          return fail(res, 400, 'PAYMENT_AMOUNT_MISMATCH', 'The captured amount does not match the stay quote.');
        }
        capturedAmount = payment.amount;
      }
      const result = await applyStayProviderEvent({
        eventId: `razorpay:stay:checkout:${paymentId}`,
        eventType: 'payment.captured',
        provider: 'razorpay',
        intentId,
        orderId,
        providerPaymentId: paymentId,
        amountPaise: capturedAmount,
        payloadHash: signature,
      });
      res.json({ ok: true, verified: result?.status === 'verified', ...result });
    } catch (error) {
      if (error instanceof StayRazorpayError) {
        return fail(res, error.status, error.code, error.message);
      }
      mapDbError(res, error, 'RAZORPAY_VERIFY_FAILED');
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Admin refund. Sandbox HMAC or Razorpay refund API + ledger write.
  // ---------------------------------------------------------------------------
  app.post('/api/payments/intents/:intentId/refund', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return fail(res, 401, 'AUTH_REQUIRED', 'Sign in as an admin to refund.');
    if (actor.role !== 'admin') return fail(res, 403, 'ADMIN_REQUIRED', 'Only an active admin can issue a refund.');
    if (!sandboxEnabled && !razorpayReady) {
      return fail(res, 503, 'REFUND_PROVIDER_NOT_CONFIGURED', 'No trusted refund provider is configured. No refund was issued.');
    }
    const intentId = String(req.params.intentId || '');
    try {
      const prepared = await withProviderTransaction(async (client) => {
        const result = await client.query(
          `select pi.id, pi.amount_paise, pi.status, pi.provider, pi.provider_payment_id, b.check_in
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
      const razorpayIntent = String(prepared.provider || '') === 'razorpay';
      if (razorpayIntent && !sandboxEnabled && !prepared.provider_payment_id) {
        return fail(res, 409, 'PAYMENT_REFERENCE_MISSING', 'This stay payment has no provider payment id to refund.');
      }
      if (razorpayIntent && !sandboxEnabled) {
        const refund = await refundStayRazorpayPayment(env, String(prepared.provider_payment_id), refundPaise);
        const result = await applyStayProviderEvent({
          eventId: `razorpay:stay:refund:${refund.refundId}`,
          eventType: 'refund.succeeded',
          provider: 'razorpay',
          intentId,
          providerPaymentId: String(prepared.provider_payment_id),
          amountPaise: refundPaise,
          payloadHash: refund.refundId,
        });
        return res.json({ ...result, provider: 'razorpay', providerRefundId: refund.refundId });
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
      res.json({ ...result, provider: razorpayIntent ? 'razorpay_sandbox' : 'upi_sandbox', note: 'Sandbox refund recorded with a signed provider event. No live money moved.' });
    } catch (error) {
      if (error instanceof StayRazorpayError) {
        return fail(res, error.status, error.code, error.message);
      }
      mapDbError(res, error, 'REFUND_FAILED');
    }
  });
}

import crypto from 'node:crypto';
import type express from 'express';
import { type PoolClient } from 'pg';
import { validateGuestDetails } from '../lib/stayGuestValidation';
import { stayListingUnbookableReason, stayPayload } from '../lib/stayListingGate';
import { issueBookingQr } from './bookingQr';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';

/**
 * Stay availability, hold, booking and cancellation API.
 *
 * All inventory mutations go through the SECURITY DEFINER RPCs created by the
 * stay-inventory migrations. Double allocation is prevented by the database
 * exclusion constraint, not by application checks. Cancellation returns a
 * server-computed refund quote only — no refund is fabricated.
 */

export interface StayApiDeps {
  verifySession: (req: express.Request) => any | null;
  env?: NodeJS.ProcessEnv;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function bad(res: express.Response, status: number, error: string, message: string) {
  res.status(status).json({ ok: false, error, message });
}

export function registerStayApi(app: express.Express, deps: StayApiDeps): void {
  const env = deps.env || process.env;
  // Demo inventory can be booked end to end only in an explicit local preview.
  // Production never enables this, so demo rows stay unbookable there.
  const allowDemoBooking = env.NODE_ENV !== 'production' && env.BOS_STAY_ALLOW_DEMO_BOOKING === '1';
  const razorpayKeyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  if (connectionString) assertPostgresConnectionTarget(connectionString, env);

  if (!connectionString) {
    const unavailable = (_req: express.Request, res: express.Response) =>
      bad(res, 503, 'STAY_INVENTORY_UNAVAILABLE', 'Stay inventory requires the PostgreSQL repository.');
    app.get('/api/stays/:listingId/availability', unavailable);
    app.post('/api/stays/holds', unavailable);
    return;
  }

  const pool = getSharedPostgresPool(connectionString, env);

  async function withActor<T>(
    actor: { supabaseUserId: string; role: string } | null,
    run: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${actor ? 'authenticated' : 'anon'}`);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor?.supabaseUserId || '']);
      await client.query("select set_config('request.jwt.claim.role', $1, true)", [actor ? 'authenticated' : 'anon']);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(actor
          ? { sub: actor.supabaseUserId, role: 'authenticated' }
          : { role: 'anon' }),
      ]);
      if (allowDemoBooking) {
        await client.query("select set_config('bos.allow_demo_booking', 'on', true)");
      }
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

  /**
   * Trusted server transaction. Used only where the database function is
   * service_role-only by design (payment verification, cancellation). Every
   * caller below still authorizes the acting session explicitly; the database
   * re-checks ownership in the same transaction.
   */
  async function withServer<T>(run: (client: PoolClient) => Promise<T>, actorId = ''): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId]);
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ ...(actorId ? { sub: actorId } : {}), role: 'service_role' }),
      ]);
      if (allowDemoBooking) {
        await client.query("select set_config('bos.allow_demo_booking', 'on', true)");
      }
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

  function actorOf(req: express.Request) {
    const session = deps.verifySession(req);
    if (!session?.supabaseUserId || session.authProvider !== 'google' || !UUID.test(String(session.supabaseUserId))) return null;
    return {
      supabaseUserId: String(session.supabaseUserId),
      role: String(session.role || 'customer'),
      email: String(session.email || '').trim().toLowerCase(),
    };
  }

  const STAY_FAVORITE_PREFIX = 'stay:';

  function stayFavoriteKey(listingId: string): string {
    const id = String(listingId || '').trim();
    if (!id || id.length > 120) return '';
    return id.startsWith(STAY_FAVORITE_PREFIX) ? id : `${STAY_FAVORITE_PREFIX}${id}`;
  }

  app.get('/api/stays/wishlists', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to sync wishlists across devices.');
    try {
      const ids = await withActor(actor, async (client) => {
        const result = await client.query(
          `select listing_id from public.user_favorites
            where user_id = $1 and listing_id like $2
            order by created_at desc
            limit 80`,
          [actor.supabaseUserId, `${STAY_FAVORITE_PREFIX}%`],
        );
        return result.rows.map((row: { listing_id: string }) => String(row.listing_id).slice(STAY_FAVORITE_PREFIX.length));
      });
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ ok: true, listingIds: ids, source: 'user_favorites' });
    } catch (error: any) {
      bad(res, 500, 'WISHLIST_FAILED', error?.message || 'Wishlists could not be loaded.');
    }
  });

  app.put('/api/stays/wishlists/:listingId', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to save stays to your account.');
    const key = stayFavoriteKey(String(req.params.listingId || ''));
    if (!key) return bad(res, 400, 'INVALID_LISTING', 'A stay listing id is required.');
    try {
      await withActor(actor, async (client) => {
        await client.query(
          `insert into public.user_favorites (user_id, listing_id)
           values ($1, $2)
           on conflict (user_id, listing_id) do nothing`,
          [actor.supabaseUserId, key],
        );
      });
      res.json({ ok: true, listingId: stayFavoriteKey(String(req.params.listingId || '')).slice(STAY_FAVORITE_PREFIX.length), saved: true });
    } catch (error: any) {
      bad(res, 500, 'WISHLIST_SAVE_FAILED', error?.message || 'That stay could not be saved.');
    }
  });

  app.delete('/api/stays/wishlists/:listingId', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to change your account wishlist.');
    const key = stayFavoriteKey(String(req.params.listingId || ''));
    if (!key) return bad(res, 400, 'INVALID_LISTING', 'A stay listing id is required.');
    try {
      await withActor(actor, async (client) => {
        await client.query(
          `delete from public.user_favorites where user_id = $1 and listing_id = $2`,
          [actor.supabaseUserId, key],
        );
      });
      res.json({ ok: true, listingId: String(req.params.listingId || ''), saved: false });
    } catch (error: any) {
      bad(res, 500, 'WISHLIST_DELETE_FAILED', error?.message || 'That stay could not be removed.');
    }
  });

  async function roomTypesForListing(client: PoolClient, listingId: string) {
    const result = await client.query(
      `select rt.id, rt.name, rt.base_price_paise, rt.max_adults, rt.max_children, rt.amenities
       from public.stay_room_types rt
       join public.stay_properties p on p.id = rt.property_id
       join public.listings l on l.id = p.listing_id
       join public.public_provider_profile_projection host on host.id = p.owner_user_id and host.verified is true
       where p.listing_id = $1 and rt.is_active and p.is_active and l.status = 'active'
         and l.is_verified is true and l.verified_by is not null
         and (coalesce(l.payload->>'demo','false') <> 'true' or $2::boolean)
         and l.payload->>'stayLifecycle' = 'approved'
       order by rt.name`,
      [listingId, allowDemoBooking],
    );
    return result.rows;
  }

  // Public discovery can fall back to the PostgreSQL listing feed when the
  // browser has no Supabase client. In that mode the generic listing projection
  // intentionally contains no stay inventory, so expose only active, public
  // room types through the same anon/RLS-compatible actor used by availability.
  app.get('/api/stays/:listingId/room-types', async (req, res) => {
    const listingId = String(req.params.listingId || '').trim();
    if (!listingId) return bad(res, 400, 'LISTING_ID_REQUIRED', 'A stay listing id is required.');
    try {
      const roomTypes = await withActor(null, async (client) => roomTypesForListing(client, listingId));
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({ ok: true, listingId, roomTypes });
    } catch (error: any) {
      bad(res, 500, 'STAY_ROOM_TYPES_UNAVAILABLE', error?.message || 'Stay room types could not be loaded.');
    }
  });

  // 1. Availability per room type for a date range.
  app.get('/api/stays/:listingId/availability', async (req, res) => {
    const listingId = String(req.params.listingId || '');
    const checkIn = String(req.query.checkIn || '');
    const checkOut = String(req.query.checkOut || '');
    if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) {
      return bad(res, 400, 'INVALID_DATES', 'checkIn/checkOut must be YYYY-MM-DD and checkOut must be after checkIn.');
    }
    try {
      const roomTypes = await withActor(actorOf(req), async (client) => {
        const types = await roomTypesForListing(client, listingId);
        const out: any[] = [];
        for (const type of types) {
          const units = await client.query(
            `select count(*)::int as total,
                    (select count(*)::int from public.stay_availability($1, $2, $3)) as available
             from public.stay_units u
             where u.room_type_id = $1 and u.is_active`,
            [type.id, checkIn, checkOut],
          );
          out.push({
            roomTypeId: type.id,
            name: type.name,
            basePricePaise: Number(type.base_price_paise),
            maxAdults: Number(type.max_adults),
            totalUnits: Number(units.rows[0]?.total || 0),
            availableUnits: Number(units.rows[0]?.available || 0),
          });
        }
        return out;
      });
      res.json({ ok: true, listingId, checkIn, checkOut, roomTypes });
    } catch (error: any) {
      bad(res, 500, 'STAY_AVAILABILITY_FAILED', error?.message || 'Availability lookup failed.');
    }
  });

  // 2. Hold units for a room type (database-guarded against double allocation).
  app.post('/api/stays/:listingId/holds', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to hold a room.');
    const listingId = String(req.params.listingId || '');
    const checkIn = String(req.body?.checkIn || '');
    const checkOut = String(req.body?.checkOut || '');
    const roomTypeId = String(req.body?.roomTypeId || '');
    const units = Math.min(5, Math.max(1, Number(req.body?.units) || 1));
    if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) {
      return bad(res, 400, 'INVALID_DATES', 'checkIn/checkOut must be YYYY-MM-DD and checkOut must be after checkIn.');
    }
    if (!UUID.test(roomTypeId)) return bad(res, 400, 'INVALID_ROOM_TYPE', 'roomTypeId must be a UUID.');
    try {
      const result = await withActor(actor, async (client) => {
        // The security-boundary migration makes the hold RPC server-only.
        // Verify and lock the signed actor's current profile under authenticated
        // RLS first, then switch only this transaction to service_role for the
        // approved RPC. Holding the row lock prevents a concurrent demotion
        // between authorization and hold creation.
        const currentProfile = await client.query(
          'select role, account_status from public.profiles where id = auth.uid() for share',
        );
        // Any active account may hold a room; providers book as guests too.
        if (!['customer', 'provider', 'admin'].includes(String(currentProfile.rows[0]?.role || '')) || currentProfile.rows[0]?.account_status !== 'active') {
          throw Object.assign(new Error('ACTIVE_ACCOUNT_REQUIRED'), { code: '42501' });
        }
        const owned = await client.query(
          `select 1 from public.stay_room_types rt
           join public.stay_properties p on p.id = rt.property_id
           join public.listings l on l.id = p.listing_id
           join public.public_provider_profile_projection host on host.id = p.owner_user_id and host.verified is true
           where rt.id = $1 and p.listing_id = $2 and rt.is_active and p.is_active
             and l.status = 'active' and l.is_verified is true and l.verified_by is not null
             and l.payload->>'stayLifecycle' = 'approved'
             and (coalesce(l.payload->>'demo','false') <> 'true' or $3::boolean)`,
          [roomTypeId, listingId, allowDemoBooking],
        );
        if (owned.rowCount === 0) return { error: 'ROOM_TYPE_NOT_FOUND' as const };
        // This RPC is service_role-only after migration 65. The request has
        // already passed signed Google-session verification, active-customer
        // checks and listing visibility checks in this transaction. Preserve
        // the verified subject for auth.uid() while elevating only the hold.
        await client.query('SET LOCAL ROLE service_role');
        await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: actor.supabaseUserId, role: 'service_role' }),
        ]);
        const held = await client.query(
          `select allocation_id, unit_id, hold_token, expires_at
           from public.stay_hold_units($1, $2, $3, $4, 15)`,
          [roomTypeId, checkIn, checkOut, units],
        );
        if (held.rowCount === 0) return { error: 'NO_UNITS_AVAILABLE' as const };
        return { held: held.rows };
      });
      if ('error' in result) {
        if (result.error === 'ROOM_TYPE_NOT_FOUND') return bad(res, 404, String(result.error), 'Room type not found for this listing.');
        return bad(res, 409, String(result.error), 'No room of this type is available for those dates.');
      }
      res.status(201).json({
        ok: true,
        holds: result.held.map((row: any) => ({
          allocationId: row.allocation_id,
          unitId: row.unit_id,
          holdToken: row.hold_token,
          expiresAt: row.expires_at,
        })),
      });
    } catch (error: any) {
      if (error?.message === 'ACTIVE_CUSTOMER_REQUIRED' || error?.message === 'ACTIVE_ACCOUNT_REQUIRED') {
        return bad(res, 403, 'ACTIVE_ACCOUNT_REQUIRED', 'An active account is required to hold a room.');
      }
      if (error?.code === 'P0001' || error?.code === '23P01' || error?.code === '40001') {
        return bad(res, 409, 'NO_UNITS_AVAILABLE', 'That room was just taken for those dates.');
      }
      const code = /^[0-9A-Z]{5}$/.test(String(error?.code || '')) ? String(error.code) : 'NO_CODE';
      console.error('[stay-api] hold failed', code);
      bad(res, 500, 'STAY_HOLD_FAILED', 'The room could not be held. Please retry.');
    }
  });

  // 3. Confirm a hold into a booking. Inventory is only consumed for a booking
  //    whose payment the server has already verified.
  app.post('/api/stays/holds/:token/confirm', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to confirm a booking.');
    const token = String(req.params.token || '');
    const bookingId = String(req.body?.bookingId || '');
    if (!UUID.test(token)) return bad(res, 400, 'INVALID_HOLD_TOKEN', 'hold token must be a UUID.');
    if (!bookingId) return bad(res, 400, 'BOOKING_ID_REQUIRED', 'bookingId of a verified booking is required.');
    try {
      const result = await withServer(async (client) => {
        // The RPC proves hold ownership, booking ownership, a verified payment
        // and that the booking's listing owns the held unit — all in one
        // transaction with the hold row locked.
        const confirmed = await client.query(
          `select public.stay_confirm_booking_for_actor($1, $2, $3) as result`,
          [token, bookingId, actor.supabaseUserId],
        );
        if (Number(confirmed.rows[0]?.result) !== 1) return { error: 'HOLD_EXPIRED' as const };
        const after = await client.query(
          `select booking_id, total_paise from public.stay_allocations where hold_token = $1`,
          [token],
        );
        return {
          bookingId: after.rows[0]?.booking_id || bookingId,
          totalPaise: Number(after.rows[0]?.total_paise || 0),
          replayed: false,
        };
      }, actor.supabaseUserId);
      if ('error' in result) {
        return bad(res, 409, String(result.error), 'The hold expired. Start a new hold.');
      }
      res.status(201).json({ ok: true, ...result });
    } catch (error: any) {
      const message = String(error?.message || '');
      if (error?.code === '42501') {
        if (message.includes('NOT_OWNED_BY_ACTOR')) {
          return bad(res, 403, 'FORBIDDEN', 'That hold or booking belongs to a different account.');
        }
        return bad(res, 409, 'PAYMENT_NOT_VERIFIED', 'BOOKING_NOT_PAID: inventory needs a verified payment.');
      }
      if (error?.code === '22023') {
        return bad(res, 409, 'BOOKING_LISTING_MISMATCH', 'That booking is not for this property.');
      }
      if (error?.code === 'P0002' || error?.code === 'P0001') {
        return bad(res, 409, 'HOLD_EXPIRED', 'The hold expired. Start a new hold.');
      }
      bad(res, 500, 'STAY_CONFIRM_FAILED', error?.message || 'Confirmation failed.');
    }
  });

  // 4. Release a hold.
  app.post('/api/stays/holds/:token/release', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to release a hold.');
    const token = String(req.params.token || '');
    if (!UUID.test(token)) return bad(res, 400, 'INVALID_HOLD_TOKEN', 'hold token must be a UUID.');
    try {
      const released = await withActor(actor, async (client) => {
        const result = await client.query(`select public.stay_release_hold($1) as result`, [token]);
        return Number(result.rows[0]?.result || 0);
      });
      if (released !== 1) return bad(res, 404, 'HOLD_NOT_FOUND', 'No active hold for this account.');
      res.json({ ok: true });
    } catch (error: any) {
      bad(res, 500, 'STAY_RELEASE_FAILED', error?.message || 'Release failed.');
    }
  });

  // 5. Cancel a confirmed booking — releases the allocation and returns a refund quote.
  app.post('/api/stays/bookings/:bookingId/cancel', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to cancel a booking.');
    const bookingId = String(req.params.bookingId || '');
    try {
      // One trusted transaction performs authorization (guest / property owner /
      // active admin), releases held and confirmed allocations, cancels the
      // booking and returns the refund quote. service_role has no direct table
      // grants; the SECURITY DEFINER function owns the write.
      const result = await withServer(async (client) => {
        const cancelled = await client.query(
          `select public.stay_cancel_booking($1, $2) as result`,
          [bookingId, actor.supabaseUserId],
        );
        return cancelled.rows[0]?.result ?? { ok: false, error: 'BOOKING_NOT_FOUND' };
      }, actor.supabaseUserId);
      if (result?.ok !== true) {
        if (result?.error === 'BOOKING_NOT_FOUND') {
          return bad(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found.');
        }
        return bad(res, 403, 'FORBIDDEN', 'This account cannot cancel that booking.');
      }
      res.json({
        ok: true,
        released: result.released === true,
        refundPaise: Number(result.refundPaise || 0),
        refundPolicy: String(result.refundPolicy),
        note: 'Refund quote only. Settlement must be confirmed by the payment provider.',
      });
    } catch (error: any) {
      bad(res, 500, 'STAY_CANCEL_FAILED', error?.message || 'Cancellation failed.');
    }
  });

  // 6b. Request to book. Inventory is held, no payment is taken, and the host
  //     must approve before any payment intent exists.
  app.post('/api/stays/requests', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in with a verified account to request this stay.');
    const body = req.body || {};
    const listingId = String(body.listingId || '');
    const roomTypeId = String(body.roomTypeId || '');
    const checkIn = String(body.checkIn || '');
    const checkOut = String(body.checkOut || '');
    const units = Math.min(5, Math.max(1, Number(body.units) || 1));
    const mode = body.paymentMode === 'pay_after_service'
      ? 'pay_after_service'
      : body.paymentMode === 'razorpay' ? 'razorpay' : 'upi';
    const idempotencyKey = String(body.idempotencyKey || req.headers['x-idempotency-key'] || '').trim();
    if (!listingId) return bad(res, 400, 'MISSING_LISTING', 'listingId is required.');
    if (!UUID.test(roomTypeId)) return bad(res, 400, 'INVALID_ROOM_TYPE', 'roomTypeId must be a UUID.');
    if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) {
      return bad(res, 400, 'INVALID_DATES', 'checkIn/checkOut must be YYYY-MM-DD and checkOut must be after checkIn.');
    }
    if (idempotencyKey.length < 8) return bad(res, 400, 'MISSING_IDEMPOTENCY_KEY', 'An idempotency key is required.');
    const guest = validateGuestDetails(body.guestName, body.guestEmail || actor.email, body.guestPhone);
    if (!guest.ok) return bad(res, 400, 'INVALID_GUEST_DETAILS', guest.message);
    if (!actor.email || guest.email !== actor.email) {
      return bad(res, 403, 'GUEST_EMAIL_MISMATCH', 'Use the email address from your signed-in Google account.');
    }
    const requestedGuests = Number(body.guests ?? 1);
    if (!Number.isInteger(requestedGuests) || requestedGuests < 1 || requestedGuests > 20) {
      return bad(res, 400, 'INVALID_GUEST_COUNT', 'Guest count must be between 1 and 20.');
    }
    const guestAddress = String(body.guestAddress || '').trim();
    if (guestAddress.length > 250) return bad(res, 400, 'INVALID_GUEST_ADDRESS', 'Address must be 250 characters or fewer.');
    try {
      const result = await withActor(actor, async (client) => {
        const gate = await client.query(
          `select l.status, l.payload, p.is_active, l.is_verified, l.verified_by,
                  (owner.role = 'provider' and owner.account_status = 'active' and owner.verified is true) as owner_verified
             from public.listings l
             join public.stay_properties p on p.listing_id = l.id
             join public.profiles owner on owner.id = p.owner_user_id and owner.id = l.owner_id
            where l.id = $1 limit 1`,
          [listingId],
        );
        const row = gate.rows[0];
        const reason = stayListingUnbookableReason({
          listingStatus: String(row?.status || ''),
          listingVerified: row?.is_verified === true && Boolean(row?.verified_by),
          ownerVerified: row?.owner_verified === true,
          propertyActive: row?.is_active === true,
          payload: stayPayload(row?.payload),
          allowDemoBooking,
        });
        if (!row || reason) {
          throw Object.assign(new Error(reason || 'STAY_NOT_APPROVED'), { statusCode: 409 });
        }
        const query = await client.query(
          `select public.create_stay_request($1,$2,$3::date,$4::date,$5,$6,$7,$8::jsonb,$9) as payload`,
          [
            listingId, roomTypeId, checkIn, checkOut, units, mode, idempotencyKey,
            JSON.stringify({ name: guest.name, phone: guest.phone }),
            Math.min(168, Math.max(1, Number(body.expiryHours) || 24)),
          ],
        );
        const payload = query.rows[0]?.payload;
        if (payload?.ok !== false && payload?.bookingId) {
          await client.query(
            'select public.attach_stay_booking_guest_details($1,$2,$3,$4)',
            [String(payload.bookingId), guest.email, requestedGuests, guestAddress || null],
          );
        }
        return payload;
      });
      if (result?.ok === false) return bad(res, 409, String(result.error || 'REQUEST_FAILED'), 'The request could not be created.');
      res.status(result?.replayed ? 200 : 201).json(result);
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.includes('STAY_DEMO_NOT_BOOKABLE')) return bad(res, 409, 'STAY_DEMO_NOT_BOOKABLE', 'Demo hotels cannot accept real bookings.');
      if (message.includes('STAY_NOT_APPROVED') || message.includes('STAY_NOT_ACTIVE') || message.includes('STAY_NOT_PUBLICLY_BOOKABLE')) {
        return bad(res, 409, 'STAY_NOT_APPROVED', 'This hotel is not approved, active and available for booking.');
      }
      if (message.includes('INSTANT_BOOK_REQUIRED')) return bad(res, 409, 'INSTANT_BOOK_REQUIRED', 'This stay accepts instant booking; use checkout instead.');
      if (message.includes('INSUFFICIENT_AVAILABILITY') || error?.code === '23P01') {
        return bad(res, 409, 'NO_UNITS_AVAILABLE', 'Those dates were just taken. Pick different dates or another room.');
      }
      if (message.includes('CHECK_IN_IN_PAST')) return bad(res, 400, 'CHECK_IN_IN_PAST', 'Check-in cannot be before today.');
      bad(res, 500, 'STAY_REQUEST_FAILED', message || 'The request could not be created.');
    }
  });

  // 6c. Customer self check-in/checkout. The booking owner acts; the server
  //     re-validates dates, payment state and ownership inside one transaction.
  for (const [route, action] of [['self-check-in', 'checked_in'], ['self-check-out', 'completed']] as const) {
    app.post(`/api/stays/bookings/:bookingId/${route}`, async (req, res) => {
      const actor = actorOf(req);
      if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to manage your stay.');
      const bookingId = String(req.params.bookingId || '');
      try {
        const outcome = await withServer(async (client) => {
          await client.query('select public.sweep_stay_requests()');
          const found = await client.query(
            `select b.*, p.owner_user_id
               from public.bookings b
               join public.stay_properties p on p.listing_id = b.listing_id
              where b.id = $1 and b.user_id = $2
              for update of b`,
            [bookingId, actor.supabaseUserId],
          );
          const booking = found.rows[0];
          if (!booking) return { error: 'BOOKING_NOT_FOUND' as const };
          const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
          if (action === 'checked_in') {
            if (booking.status !== 'confirmed') return { error: 'INVALID_STATE' as const };
            if (booking.check_in && today < String(booking.check_in).slice(0, 10)) return { error: 'TOO_EARLY' as const };
            if (!['verified', 'pay_later', 'collected_offline'].includes(String(booking.payment_status))) {
              return { error: 'PAYMENT_NOT_READY' as const };
            }
            await client.query(
              `update public.bookings set status = 'checked_in',
                  payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{checkedInAt}', to_jsonb(now()::text))
                where id = $1`,
              [bookingId],
            );
            await client.query(
              `insert into public.notifications (recipient_user_id, title, message, notif_type, link_id)
               values ($1, 'Guest checked in', 'A guest completed self check-in for their stay.', 'stay_booking', $2)`,
              [booking.owner_user_id, bookingId],
            );
            return { ok: true as const, status: 'checked_in' };
          }
          if (booking.status !== 'checked_in') return { error: 'INVALID_STATE' as const };
          await client.query(
            `update public.bookings set status = 'completed',
                payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{checkedOutAt}', to_jsonb(now()::text))
              where id = $1`,
            [bookingId],
          );
          await client.query(
            `insert into public.notifications (recipient_user_id, title, message, notif_type, link_id)
             values ($1, 'Guest checked out', 'A guest completed self checkout. Their review is now available.', 'stay_booking', $2)`,
            [booking.owner_user_id, bookingId],
          );
          return { ok: true as const, status: 'completed' };
        }, actor.supabaseUserId);
        if ('error' in outcome) {
          if (outcome.error === 'BOOKING_NOT_FOUND') return bad(res, 404, 'BOOKING_NOT_FOUND', 'Booking not found.');
          if (outcome.error === 'TOO_EARLY') return bad(res, 409, 'TOO_EARLY', 'Check-in is not open yet.');
          if (outcome.error === 'PAYMENT_NOT_READY') return bad(res, 409, 'PAYMENT_NOT_READY', 'Wait for the provider to verify the online payment.');
          return bad(res, 409, 'INVALID_STATE', 'That action is not allowed in the current booking state.');
        }
        res.json(outcome);
      } catch (error: any) {
        bad(res, 500, 'SELF_CHECKIN_FAILED', error?.message || 'The booking could not be updated.');
      }
    });
  }

  // 7. Post-stay review. One review per completed booking, enforced by a
  //    partial unique index in the database.
  // Server-issued QR token for a confirmed/paid booking. The guest sees the
  // token in My Trips and on the receipt; the host verifies it before check-in.
  app.get('/api/stays/bookings/:bookingId/qr', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to view your booking QR.');
    const bookingId = String(req.params.bookingId || '');
    if (!bookingId || bookingId.length > 80) return bad(res, 400, 'INVALID_BOOKING_ID', 'A booking id is required.');
    try {
      const booking = await withActor(actor, async (client) => {
        const result = await client.query(
          `select id, check_out, status, payment_status from public.bookings where id=$1 and user_id=$2 limit 1`,
          [bookingId, actor.supabaseUserId],
        );
        return result.rows[0] || null;
      });
      if (!booking) return bad(res, 404, 'BOOKING_NOT_FOUND', 'That booking is not yours.');
      const qr = issueBookingQr(bookingId, booking.check_out ? String(booking.check_out).slice(0, 10) : null, env);
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ ok: true, bookingId, token: qr.token, expiresAt: qr.expiresAt, status: booking.status, paymentStatus: booking.payment_status });
    } catch (error: any) {
      bad(res, 500, 'BOOKING_QR_FAILED', error?.message || 'The booking QR could not be issued.');
    }
  });

  // Authoritative receipt snapshot for PDF/print/share and the success screen.
  app.get('/api/stays/bookings/:bookingId/receipt', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to view your receipt.');
    const bookingId = String(req.params.bookingId || '');
    if (!bookingId || bookingId.length > 80) return bad(res, 400, 'INVALID_BOOKING_ID', 'A booking id is required.');
    try {
      const data = await withActor(actor, async (client) => {
        const result = await client.query(
          `select b.id, b.status, b.payment_status, b.payment_mode, b.customer_name, b.customer_phone,
                  b.check_in::text as check_in, b.check_out::text as check_out, b.created_at,
                  b.total_paise, b.room_type_id, b.payment_utr,
                  p.name as property_name, p.address, p.city, p.area, p.cancellation_policy,
                  gc.guest_email, gc.guest_count, gc.guest_address,
                  rt.name as room_type_name, rt.base_price_paise,
                  pi.provider, pi.provider_payment_id, pi.provider_order_id, pi.verified_at, pi.status as intent_status, pi.refund_paise,
                  (select count(*)::int from public.stay_allocations a
                    where a.booking_id=b.id and a.guest_user_id=b.user_id and a.status <> 'released') as units
             from public.bookings b
             join public.stay_properties p on p.listing_id=b.listing_id
             left join public.stay_booking_guest_contacts gc on gc.booking_id=b.id and gc.guest_user_id=b.user_id
             left join public.stay_room_types rt on rt.id=b.room_type_id
             left join lateral (
               select provider, provider_payment_id, provider_order_id, verified_at, status, refund_paise
                 from public.payment_intents where booking_id=b.id
                order by created_at desc limit 1
             ) pi on true
            where b.id=$1 and b.user_id=$2 limit 1`,
          [bookingId, actor.supabaseUserId],
        );
        const row = result.rows[0];
        if (!row) return null;
        let quote: any = null;
        if (row.room_type_id && row.check_in && row.check_out) {
          const units = Math.max(1, Number(row.units) || 1);
          const q = await client.query(
            `select * from public.stay_price_quote($1,$2::date,$3::date,$4)`,
            [row.room_type_id, row.check_in, row.check_out, units],
          );
          quote = q.rows[0] || null;
        }
        return { row, quote };
      });
      if (!data) return bad(res, 404, 'BOOKING_NOT_FOUND', 'That booking is not yours.');
      const { row, quote } = data;
      const total = Number(row.total_paise || quote?.total_paise || 0);
      const breakdownMatches = Boolean(quote && Number(quote.total_paise) === total);
      const paid = ['verified', 'collected_offline'].includes(String(row.payment_status));
      const refunded = row.payment_status === 'refunded';
      const reference = row.provider_payment_id || row.provider_order_id || row.payment_utr || null;
      const qr = issueBookingQr(bookingId, row.check_out, env);
      const taxesPaise = Number(quote?.taxes_paise || 0);
      const taxPercent = Number(quote?.tax_percent || 0);
      const gstin = String(env.BOS_GSTIN || '').trim().toUpperCase();
      const gstLegalName = String(env.BOS_GST_LEGAL_NAME || '').trim();
      const placeOfSupply = String(env.BOS_GST_PLACE_OF_SUPPLY || '').trim();
      const supplierAddress = String(env.BOS_GST_SUPPLIER_ADDRESS || '').trim();
      const sacCode = String(env.BOS_GST_SAC_CODE || '').trim();
      const igst = String(env.BOS_GST_IGST || '').trim() === '1';
      const half = Math.floor(taxesPaise / 2);
      const year = new Date().getFullYear();
      const invoiceReady = String(env.BOS_GST_SUPPLIER_VERIFIED || '') === '1'
        && String(env.BOS_GST_TAX_RULES_VERIFIED || '') === '1'
        && String(env.BOS_GST_INVOICE_REQUIREMENTS_VERIFIED || '') === '1'
        && /^[0-9A-Z]{15}$/.test(gstin)
        && gstLegalName.length >= 2 && supplierAddress.length >= 8 && Boolean(row.guest_address)
        && placeOfSupply.length >= 2
        && /^\d{6}$/.test(sacCode);
      const taxInvoice = invoiceReady && paid && !refunded && taxesPaise > 0;
      const invoiceNumber = taxInvoice ? `BOS/STAY/${year}/${String(bookingId).replace(/-/g, '').slice(0, 10).toUpperCase()}` : undefined;
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({
        ok: true,
        receipt: {
          bookingId,
          status: row.status,
          paymentStatus: row.payment_status,
          paymentMode: row.payment_mode,
          paid: paid && !refunded,
          refunded,
          refundPaise: Number(row.refund_paise || 0),
          duePaise: refunded || paid ? 0 : total,
          paidPaise: refunded ? 0 : paid ? total : 0,
          totalPaise: total,
          createdAt: row.created_at,
          checkIn: row.check_in,
          checkOut: row.check_out,
          guestName: row.customer_name,
          guestEmail: row.guest_email || '',
          guestPhone: row.customer_phone,
          guests: Math.max(1, Number(row.guest_count) || 1),
          cancellationPolicy: row.cancellation_policy || 'moderate',
          guestAddress: taxInvoice ? row.guest_address : undefined,
          hotelName: row.property_name,
          address: [row.address, row.area, row.city].filter(Boolean).join(', '),
          roomType: row.room_type_name || 'Room',
          units: Math.max(1, Number(row.units) || 1),
          nights: Number(quote?.nights || 0),
          basePricePaise: Number(quote?.base_price_paise || row.base_price_paise || 0),
          subtotalPaise: Number(quote?.subtotal_paise || total),
          cleaningFeePaise: Number(quote?.cleaning_fee_paise || 0),
          serviceFeePaise: Number(quote?.service_fee_paise || 0),
          taxesPaise,
          taxPercent,
          discountPaise: 0,
          breakdownExact: breakdownMatches,
          paymentReference: reference,
          provider: row.provider || null,
          verifiedAt: row.verified_at || null,
          issuedAt: new Date().toISOString(),
          invoiceNumber,
          gstin: taxInvoice ? gstin : '',
          gstLegalName: taxInvoice ? gstLegalName : '',
          gstSupplierAddress: taxInvoice ? supplierAddress : '',
          placeOfSupply: taxInvoice ? placeOfSupply : '',
          sacCode: taxInvoice ? sacCode : '',
          taxInvoice,
          cgstPaise: taxInvoice && !igst ? half : 0,
          sgstPaise: taxInvoice && !igst ? taxesPaise - half : 0,
          igstPaise: taxInvoice && igst ? taxesPaise : 0,
        },
        qrToken: qr.token,
        qrExpiresAt: qr.expiresAt,
      });
    } catch (error: any) {
      bad(res, 500, 'RECEIPT_FAILED', error?.message || 'The receipt could not be generated.');
    }
  });

  app.post('/api/stays/bookings/:bookingId/review', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to review your stay.');
    const bookingId = String(req.params.bookingId || '').trim();
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || '').trim();
    if (!bookingId) return bad(res, 400, 'BOOKING_REQUIRED', 'A booking id is required.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return bad(res, 400, 'INVALID_RATING', 'Choose a rating between 1 and 5.');
    }
    if (comment.length < 10 || comment.length > 2000) {
      return bad(res, 400, 'INVALID_COMMENT', 'Write between 10 and 2000 characters.');
    }
    try {
      const result = await withServer(async (client) => {
        const booking = await client.query(
          `select b.id, b.user_id, b.listing_id, b.status, b.customer_name
             from public.bookings b
            where b.id = $1 and b.user_id = $2
            for update`,
          [bookingId, actor.supabaseUserId],
        );
        const row = booking.rows[0];
        if (!row) return { error: 'BOOKING_NOT_FOUND' as const };
        if (String(row.status) !== 'completed') {
          return { error: 'STAY_NOT_COMPLETED' as const };
        }
        const existing = await client.query(
          `select 1 from public.reviews where listing_id = $1 and payload ->> 'bookingId' = $2 limit 1`,
          [row.listing_id, bookingId],
        );
        if (existing.rowCount) return { error: 'ALREADY_REVIEWED' as const };
        const id = `rev-${crypto.randomUUID()}`;
        await client.query(
          `insert into public.reviews (id, user_id, listing_id, customer_name, rating, comment, payload)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            id,
            actor.supabaseUserId,
            row.listing_id,
            String(row.customer_name || 'Guest'),
            rating,
            comment,
            JSON.stringify({ bookingId, kind: 'stay' }),
          ],
        );
        return { ok: true as const, reviewId: id };
      }, actor.supabaseUserId);
      if ('error' in result) {
        const map: Record<string, [number, string, string]> = {
          BOOKING_NOT_FOUND: [404, 'BOOKING_NOT_FOUND', 'That booking is not yours.'],
          STAY_NOT_COMPLETED: [409, 'STAY_NOT_COMPLETED', 'You can review this stay after checkout is completed.'],
          ALREADY_REVIEWED: [409, 'ALREADY_REVIEWED', 'You have already reviewed this stay.'],
        };
        const [status, code, message] = map[String(result.error)] || [400, 'STAY_REVIEW_FAILED', 'The review could not be saved.'];
        return bad(res, status, code, message);
      }
      res.status(201).json(result);
    } catch (error: any) {
      if (error?.code === '23505') return bad(res, 409, 'ALREADY_REVIEWED', 'You have already reviewed this stay.');
      bad(res, 500, 'STAY_REVIEW_FAILED', 'The review could not be saved.');
    }
  });

  // 6. My stay bookings.
  app.get('/api/stays/bookings', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to view your bookings.');
    try {
      // Keep booking history inside the verified guest's RLS scope. The guest
      // allocation policy deliberately includes released/cancelled rows, while
      // the related property/unit reads remain limited by their own policies.
      const rows = await withActor(actor, async (client) => {
        const result = await client.query(
          `select a.booking_id, coalesce(b.status, a.status) as status, a.total_paise,
                  coalesce(b.check_in::text, lower(a.stay_dates)::text) as check_in,
                  coalesce(b.check_out::text, upper(a.stay_dates)::text) as check_out,
                  p.name as property_name, rt.name as room_type,
                  p.listing_id, p.address, p.check_in_time, p.check_out_time,
                  p.cancellation_policy, p.cancellation_free_hours,
                  b.payment_status, b.payment_mode, b.created_at,
                  b.request_expires_at, b.responded_at,
                  pi.id as payment_intent_id, pi.status as intent_status,
                  pi.upi_uri, pi.expires_at as intent_expires_at,
                  pi.provider_order_id, pi.qr_image_url, pi.provider,
                  exists (
                    select 1 from public.reviews r
                     where r.listing_id = p.listing_id
                       and r.payload ->> 'bookingId' = a.booking_id
                  ) as reviewed
           from public.stay_allocations a
           join public.stay_units u on u.id = a.unit_id
           join public.stay_room_types rt on rt.id = u.room_type_id
           join public.stay_properties p on p.id = rt.property_id
           left join public.bookings b on b.id = a.booking_id
           left join lateral (
             select id, status, upi_uri, expires_at, provider_order_id, qr_image_url, provider
               from public.payment_intents
              where booking_id = a.booking_id
              order by created_at desc limit 1
           ) pi on true
           where a.guest_user_id = $1 and a.booking_id is not null
           order by lower(a.stay_dates) desc
           limit 100`,
          [actor.supabaseUserId],
        );
        return result.rows;
      });
      res.json({
        ok: true,
        bookings: rows.map((row: any) => ({
          bookingId: row.booking_id,
          status: row.status,
          totalPaise: Number(row.total_paise),
          checkIn: String(row.check_in || '').slice(0, 10),
          checkOut: String(row.check_out || '').slice(0, 10),
          propertyName: row.property_name,
          roomType: row.room_type,
          listingId: row.listing_id,
          propertyAddress: row.address || '',
          checkInTime: row.check_in_time ? String(row.check_in_time).slice(0, 5) : '',
          checkOutTime: row.check_out_time ? String(row.check_out_time).slice(0, 5) : '',
          cancellationPolicy: row.cancellation_policy || 'moderate',
          cancellationFreeHours: Number(row.cancellation_free_hours || 0),
          paymentStatus: row.payment_status || 'unknown',
          paymentMode: row.payment_mode || '',
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
          reviewed: row.reviewed === true,
          canReview: String(row.status) === 'completed' && row.reviewed !== true,
          requestExpiresAt: row.request_expires_at instanceof Date ? row.request_expires_at.toISOString() : String(row.request_expires_at || ''),
          respondedAt: row.responded_at instanceof Date ? row.responded_at.toISOString() : String(row.responded_at || ''),
          paymentIntentId: row.payment_intent_id || null,
          intentStatus: row.intent_status || null,
          upiUri: row.upi_uri || null,
          qrImageUrl: row.qr_image_url || null,
          razorpayOrderId: row.payment_mode === 'razorpay' ? (row.provider_order_id || null) : null,
          razorpayKeyId: row.payment_mode === 'razorpay' && razorpayKeyId ? razorpayKeyId : null,
          intentExpiresAt: row.intent_expires_at instanceof Date ? row.intent_expires_at.toISOString() : String(row.intent_expires_at || ''),
          canCancelRequest: ['pending_approval', 'approved'].includes(String(row.status)),
          canSelfCheckIn: String(row.status) === 'confirmed',
          canSelfCheckOut: String(row.status) === 'checked_in',
          paymentDue: String(row.status) === 'approved' && ['created', 'pending'].includes(String(row.intent_status || '')),
        })),
      });
    } catch (error: any) {
      bad(res, 500, 'STAY_BOOKINGS_FAILED', error?.message || 'Booking lookup failed.');
    }
  });
}

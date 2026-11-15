import type express from 'express';
import { Pool, type PoolClient } from 'pg';

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
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();

  if (!connectionString) {
    const unavailable = (_req: express.Request, res: express.Response) =>
      bad(res, 503, 'STAY_INVENTORY_UNAVAILABLE', 'Stay inventory requires the PostgreSQL repository.');
    app.get('/api/stays/:listingId/availability', unavailable);
    app.post('/api/stays/holds', unavailable);
    return;
  }

  const pool = new Pool({ connectionString, max: 8 });

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
  async function withServer<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
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
    if (!session?.supabaseUserId || !UUID.test(String(session.supabaseUserId))) return null;
    return { supabaseUserId: String(session.supabaseUserId), role: String(session.role || 'customer') };
  }

  async function roomTypesForListing(client: PoolClient, listingId: string) {
    const result = await client.query(
      `select rt.id, rt.name, rt.base_price_paise, rt.max_adults, rt.max_children, rt.amenities
       from public.stay_room_types rt
       join public.stay_properties p on p.id = rt.property_id
       join public.listings l on l.id = p.listing_id
       where p.listing_id = $1 and rt.is_active and p.is_active and l.status = 'active'
       order by rt.name`,
      [listingId],
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
        const owned = await client.query(
          `select 1 from public.stay_room_types rt
           join public.stay_properties p on p.id = rt.property_id
           where rt.id = $1 and p.listing_id = $2 and rt.is_active`,
          [roomTypeId, listingId],
        );
        if (owned.rowCount === 0) return { error: 'ROOM_TYPE_NOT_FOUND' as const };
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
      if (error?.code === 'P0001' || error?.code === '23P01') {
        return bad(res, 409, 'NO_UNITS_AVAILABLE', 'That room was just taken for those dates.');
      }
      bad(res, 500, 'STAY_HOLD_FAILED', error?.message || 'Hold failed.');
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
      });
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
      });
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

  // 6. My stay bookings.
  app.get('/api/stays/bookings', async (req, res) => {
    const actor = actorOf(req);
    if (!actor) return bad(res, 401, 'AUTH_REQUIRED', 'Sign in to view your bookings.');
    try {
      const rows = await withActor(actor, async (client) => {
        const result = await client.query(
          `select a.booking_id, a.status, a.total_paise, lower(a.stay_dates) as check_in,
                  upper(a.stay_dates) as check_out, p.name as property_name, rt.name as room_type
           from public.stay_allocations a
           join public.stay_units u on u.id = a.unit_id
           join public.stay_room_types rt on rt.id = u.room_type_id
           join public.stay_properties p on p.id = rt.property_id
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
          checkIn: row.check_in,
          checkOut: row.check_out,
          propertyName: row.property_name,
          roomType: row.room_type,
        })),
      });
    } catch (error: any) {
      bad(res, 500, 'STAY_BOOKINGS_FAILED', error?.message || 'Booking lookup failed.');
    }
  });
}

import { logSafeError } from './safeLogging';
import crypto from 'node:crypto';
import type express from 'express';
import { type PoolClient } from 'pg';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';
import { verifyBookingQr } from './bookingQr';
import {
  StayRazorpayError,
  createStayRazorpayOrder,
  createStayRazorpayUpiQr,
  stayPaymentSandboxEnabled,
  stayRazorpayReady,
} from './stayRazorpay';
import { stayLifecycleOf, stayPayload, staySubmitMissing } from '../lib/stayListingGate';
import { isPersistableListingImageSource } from '../lib/media/signedStorageUrl';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PROPERTY_TYPES = new Set(['hotel', 'resort', 'homestay', 'apartment', 'villa', 'guesthouse', 'guest_house', 'house', 'flat', 'lodge', 'temple_stay']);
const PLACE_TYPES = new Set(['entire_home', 'private_room', 'shared_room']);
const CANCELLATION_POLICIES = new Set(['flexible', 'moderate', 'strict', 'non_refundable']);
const text = (value: unknown, max: number, fallback = '') => typeof value === 'string' ? value.trim().slice(0, max) : fallback;
const int = (value: unknown, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw Object.assign(new Error('INVALID_INPUT'), { statusCode: 400 });
  return parsed;
};
const bad = (res: express.Response, status: number, error: string, message?: string) => res.status(status).json({ ok: false, error, ...(message ? { message } : {}) });

/**
 * Persist only durable image references. A signed Storage URL carries a token
 * that is regenerated per viewer and per session; storing it would leave the
 * listing with an expired photo after the token's short TTL and would also
 * leak a signed grant into the database. Original HTTPS photos and canonical
 * public Storage references are re-signed safely at render time.
 */
export function persistableStayImages(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item: unknown) => text(item, 600))
    .filter((item: string) => isPersistableListingImageSource(item))
    .slice(0, 16);
}

export interface StayHostApiDeps {
  verifySession: (request: express.Request) => any | null;
  env?: NodeJS.ProcessEnv;
}

/** Host inventory API. Identity is read from a verified session; current role,
 * active status, listing ownership and row access are rechecked in PostgreSQL. */
export function registerStayHostApi(app: express.Express, deps: StayHostApiDeps): void {
  const env = deps.env || process.env;
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  if (connectionString) assertPostgresConnectionTarget(connectionString, env);
  if (!connectionString) {
    const unavailable = (_req: express.Request, res: express.Response) => bad(res, 503, 'STAY_HOST_DATABASE_UNAVAILABLE');
    app.get('/api/stays/host/listings', unavailable);
    app.get('/api/stays/host/listings/:listingId', unavailable);
    app.post('/api/stays/host/onboard', unavailable);
    app.post('/api/stays/host/listings/:listingId/submit', unavailable);
    app.put('/api/stays/host/listings/:listingId/documents', unavailable);
    app.put('/api/stays/host/properties', unavailable);
    app.post('/api/stays/host/room-types', unavailable);
    app.post('/api/stays/host/units', unavailable);
    app.post('/api/stays/host/blocks', unavailable);
    app.get('/api/stays/host/bookings', unavailable);
    app.put('/api/stays/host/media-order', unavailable);
    return;
  }

  const pool = getSharedPostgresPool(connectionString, env);
  async function withActor<T>(actorId: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE authenticated');
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId]);
      await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actorId, role: 'authenticated' }),
      ]);
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }
  function actorOf(req: express.Request, res: express.Response): string | null {
    const actor = deps.verifySession(req);
    const id = String(actor?.supabaseUserId || '');
    if (!UUID.test(id)) { bad(res, actor ? 403 : 401, actor ? 'VERIFIED_DATABASE_ID_REQUIRED' : 'AUTH_REQUIRED'); return null; }
    return id;
  }
  async function requireHost(client: PoolClient, actorId: string, allowCustomerOwner = false) {
    const { rows } = await client.query(
      `select role, account_status from public.profiles where id = $1 limit 1`, [actorId],
    );
    if (rows[0]?.account_status !== 'active') {
      throw Object.assign(new Error('ACTIVE_PROVIDER_REQUIRED'), { statusCode: 403 });
    }
    if (['provider', 'admin'].includes(String(rows[0]?.role))) return rows[0];
    if (allowCustomerOwner && rows[0]?.role === 'customer') {
      const owned = await client.query(
        `select 1 from public.listings
          where owner_id = $1 and public.live_edit_listing_module(category_id, entity_type) = 'hotel_stay'
          limit 1`,
        [actorId],
      );
      if (owned.rows[0]) return rows[0];
    }
    throw Object.assign(new Error('ACTIVE_PROVIDER_REQUIRED'), { statusCode: 403 });
  }
  async function requireOwnedStayListing(client: PoolClient, actorId: string, listingId: string) {
    const result = await client.query(
      `select id, title, status, payload from public.listings
        where id = $1 and owner_id = $2
          and public.live_edit_listing_module(category_id, entity_type) = 'hotel_stay'
          and status in ('active', 'pending_approval', 'rejected', 'expired')
        limit 1`, [listingId, actorId],
    );
    if (!result.rows[0]) throw Object.assign(new Error('OWNED_STAY_LISTING_REQUIRED'), { statusCode: 404 });
    return result.rows[0];
  }
  const reportError = (res: express.Response, error: any) => {
    const status = Number(error?.statusCode);
    if (status >= 400 && status < 500) { bad(res, status, String(error.message), error?.detail ? String(error.detail) : undefined); return; }
    const message = String(error?.message || '');
    if (message.includes('STAY_PROFILE_INCOMPLETE') || message.includes('STAY_PHOTOS_REQUIRED') || message.includes('STAY_VERIFICATION_DOCS_REQUIRED') || message.includes('STAY_NOT_SUBMITTABLE')) {
      bad(res, 400, 'STAY_PROFILE_INCOMPLETE', 'Add hotel details, photos, rooms, units and verification documents before submitting.');
      return;
    }
    if (error?.code === '23P01' || error?.code === '23505') { bad(res, 409, 'INVENTORY_CONFLICT'); return; }
    if (error?.code === '40001') { bad(res, 409, 'NO_UNITS_AVAILABLE'); return; }
    if (error?.code === '42501') { logSafeError('stay-host', 'forbidden', error); bad(res, 403, 'INVENTORY_FORBIDDEN'); return; }
    if (error?.code === '42P01' || error?.code === '42703') { logSafeError('stay-host', 'schema', error); bad(res, 503, 'STAY_HOST_SCHEMA_NOT_READY'); return; }
    logSafeError('stay-host', 'request', error);
    bad(res, 500, 'STAY_HOST_REQUEST_FAILED');
  };
  const handle = (fn: (req: express.Request, res: express.Response, actorId: string, client: PoolClient) => Promise<unknown>) =>
    async (req: express.Request, res: express.Response) => {
      const actorId = actorOf(req, res); if (!actorId) return;
      try { await withActor(actorId, async client => { await requireHost(client, actorId, true); await fn(req, res, actorId, client); }); }
      catch (error: any) { reportError(res, error); }
    };
  // A mutation response is observable by another request as soon as it is
  // sent. For routes whose result is immediately used to read inventory, send
  // only after the transaction commits so callers never race the COMMIT.
  const handleCommitted = (fn: (req: express.Request, actorId: string, client: PoolClient) => Promise<{ status?: number; body: unknown }>) =>
    async (req: express.Request, res: express.Response) => {
      const actorId = actorOf(req, res); if (!actorId) return;
      try {
        const result = await withActor(actorId, async client => {
          await requireHost(client, actorId, true);
          return fn(req, actorId, client);
        });
        res.status(result.status ?? 200).json(result.body);
      } catch (error: any) { reportError(res, error); }
    };

  // Onboarding creates the draft the next screen reads, so the 201 is sent
  // only after COMMIT. A customer may onboard, so requireHost is not applied.
  app.post('/api/stays/host/onboard', async (req, res) => {
    const actorId = actorOf(req, res); if (!actorId) return;
    try {
      const created = await withActor(actorId, async (client) => {
        const profile = await client.query(
          `select role, account_status from public.profiles where id = $1 limit 1`, [actorId],
        );
        if (profile.rows[0]?.account_status !== 'active' || !['customer', 'provider', 'admin'].includes(String(profile.rows[0]?.role))) {
          throw Object.assign(new Error('ACTIVE_PROFILE_REQUIRED'), { statusCode: 403 });
        }
        const body = req.body || {};
        const title = text(body.title || body.name, 160);
        const name = text(body.name || body.title, 160);
        const city = text(body.city, 120);
        if (!title || !name || !city) throw Object.assign(new Error('PROPERTY_NAME_AND_CITY_REQUIRED'), { statusCode: 400 });
        const result = await client.query(
          `select public.create_stay_owner_draft($1,$2,$3,$4,$5,$6) as payload`,
          [title, name, city, text(body.propertyType, 40) || 'hotel', text(body.area, 120) || null, text(body.address, 400) || null],
        );
        return { status: 201, body: { ok: true, ...result.rows[0]?.payload } };
      });
      res.status(created.status).json(created.body);
    } catch (error: any) {
      const message = String(error?.message || '');
      if (error?.statusCode) return bad(res, Number(error.statusCode), message);
      if (message.includes('STAY_NAME_AND_CITY_REQUIRED') || message.includes('INVALID_PROPERTY_OPTIONS')) {
        return bad(res, 400, 'PROPERTY_NAME_AND_CITY_REQUIRED');
      }
      if (error?.code === '42501') return bad(res, 403, 'INVENTORY_FORBIDDEN');
      if (error?.code === '42P01' || error?.code === '42703') return bad(res, 503, 'STAY_HOST_SCHEMA_NOT_READY');
      logSafeError('stay-host', 'onboard', error);
      bad(res, 500, 'STAY_HOST_REQUEST_FAILED');
    }
  });

  app.get('/api/stays/host/listings', handle(async (_req, res, actorId, client) => {
    const { rows } = await client.query(
      `select l.id as listing_id, l.title, l.status, l.payload,
              p.id as property_id, p.name, p.city, p.area, p.property_type, p.is_active
         from public.listings l
         left join public.stay_properties p on p.listing_id = l.id and p.owner_user_id = l.owner_id
        where l.owner_id = $1 and public.live_edit_listing_module(l.category_id, l.entity_type) = 'hotel_stay'
          and l.status in ('active', 'pending_approval', 'rejected', 'expired')
        order by l.updated_at desc, l.id`, [actorId],
    );
    res.json({ ok: true, listings: rows });
  }));

  app.get('/api/stays/host/listings/:listingId', handle(async (req, res, actorId, client) => {
    const listingId = text(req.params.listingId, 128);
    const listing = await requireOwnedStayListing(client, actorId, listingId);
    const property = await client.query('select * from public.stay_properties where listing_id = $1 and owner_user_id = $2 limit 1', [listingId, actorId]);
    const rooms = property.rows[0] ? await client.query(
      `select rt.*, coalesce(json_agg(json_build_object('id', u.id, 'label', u.label, 'floor', u.floor, 'isActive', u.is_active)
          order by u.label) filter (where u.id is not null), '[]'::json) as units
         from public.stay_room_types rt left join public.stay_units u on u.room_type_id = rt.id
        where rt.property_id = $1 group by rt.id order by rt.created_at, rt.name`, [property.rows[0].id],
    ) : { rows: [] };
    const blocks = property.rows[0] ? await client.query(
      `select b.id, b.unit_id, lower(b.stay_dates)::text as starts_on,
              upper(b.stay_dates)::text as ends_on, b.reason
         from public.stay_blocks b join public.stay_units u on u.id = b.unit_id
         join public.stay_room_types rt on rt.id = u.room_type_id
        where rt.property_id = $1 order by lower(b.stay_dates)`, [property.rows[0].id],
    ) : { rows: [] };
    const media = await client.query(
      `select id, 'storage://' || bucket_id || '/' || object_path as reference, display_order, alt_text, caption
         from public.media_assets where owner_id=$1 and parent_type='provider_listing' and parent_id=$2
          and module_key in ('stays', 'hotel_stay') and bucket_id='bos-public-media' and privacy='public' and processing_status='ready'
        order by display_order, created_at, id limit 20`, [actorId, listingId],
    );
    const payload = stayPayload(listing.payload);
    res.json({
      ok: true,
      listing: {
        ...listing,
        stayLifecycle: stayLifecycleOf(payload),
        demo: payload.demo === true,
        review: payload.review || null,
        verificationDocuments: Array.isArray(payload.verificationDocuments) ? payload.verificationDocuments : [],
        gstin: typeof payload.gstin === 'string' ? payload.gstin : '',
        legalName: typeof payload.legalName === 'string' ? payload.legalName : '',
      },
      property: property.rows[0] || null,
      roomTypes: rooms.rows,
      blocks: blocks.rows,
      media: media.rows,
    });
  }));

  app.post('/api/stays/host/listings/:listingId/submit', handleCommitted(async (req, actorId, client) => {
    const listingId = text(req.params.listingId, 128);
    const listing = await requireOwnedStayListing(client, actorId, listingId);
    const property = await client.query(
      'select * from public.stay_properties where listing_id = $1 and owner_user_id = $2 limit 1',
      [listingId, actorId],
    );
    const rooms = property.rows[0] ? await client.query(
      `select count(*)::int as rooms,
              (select count(*)::int from public.stay_units u join public.stay_room_types rt on rt.id = u.room_type_id
                where rt.property_id = $1 and u.is_active) as units
         from public.stay_room_types where property_id = $1 and is_active`,
      [property.rows[0].id],
    ) : { rows: [{ rooms: 0, units: 0 }] };
    const payload = stayPayload(listing.payload);
    const missing = staySubmitMissing({
      name: property.rows[0]?.name,
      city: property.rows[0]?.city,
      basePricePaise: Number(property.rows[0]?.base_price_paise || 0),
      images: payload.images,
      roomCount: Number(rooms.rows[0]?.rooms || 0),
      unitCount: Number(rooms.rows[0]?.units || 0),
      documents: payload.verificationDocuments,
    });
    if (missing.length) throw Object.assign(new Error('STAY_PROFILE_INCOMPLETE'), { statusCode: 400, detail: `Missing: ${missing.join(', ')}` });
    const result = await client.query(`select public.submit_stay_listing_for_review($1) as payload`, [listingId]);
    return { body: { ok: true, ...result.rows[0]?.payload } };
  }));

  app.put('/api/stays/host/listings/:listingId/documents', handleCommitted(async (req, actorId, client) => {
    const listingId = text(req.params.listingId, 128);
    const listing = await requireOwnedStayListing(client, actorId, listingId);
    const body = req.body || {};
    const documents = Array.isArray(body.documents) ? body.documents.slice(0, 12).map((doc: any) => ({
      kind: text(doc?.kind, 40),
      reference: text(doc?.reference, 600),
      fileName: text(doc?.fileName, 160),
    })).filter((doc: { kind: string; reference: string }) => doc.kind && doc.reference) : [];
    const images = persistableStayImages(body.images);
    const gstin = text(body.gstin, 15);
    const legalName = text(body.legalName, 160);
    const policies = text(body.policies, 4000);
    const existing = stayPayload(listing.payload);
    const result = await client.query(
      `select public.save_stay_listing_documents($1, $2::jsonb) as payload`,
      [listingId, JSON.stringify({
        verificationDocuments: documents,
        images: images || (Array.isArray(existing.images) ? existing.images : []),
        gstin,
        legalName,
        policies,
      })],
    );
    if (!result.rows[0]?.payload) throw Object.assign(new Error('OWNED_STAY_LISTING_REQUIRED'), { statusCode: 404 });
    return { body: { ok: true, listing: { id: listingId, payload: result.rows[0].payload } } };
  }));

  app.put('/api/stays/host/properties', handleCommitted(async (req, actorId, client) => {
    const body = req.body || {};
    const listingId = text(body.listingId, 128);
    const listing = await requireOwnedStayListing(client, actorId, listingId);
    const approved = listing.status === 'active' && stayLifecycleOf(stayPayload(listing.payload)) === 'approved';
    const isActive = approved && body.isActive !== false;
    const name = text(body.name, 160);
    const city = text(body.city, 120);
    if (!name || !city) throw Object.assign(new Error('PROPERTY_NAME_AND_CITY_REQUIRED'), { statusCode: 400 });
    const propertyType = String(body.propertyType || 'hotel');
    const placeType = String(body.placeType || 'entire_home');
    const policy = body.cancellationPolicy === undefined ? null : String(body.cancellationPolicy || 'moderate');
    if (!PROPERTY_TYPES.has(propertyType) || !PLACE_TYPES.has(placeType) || (policy !== null && !CANCELLATION_POLICIES.has(policy))) throw Object.assign(new Error('INVALID_PROPERTY_OPTIONS'), { statusCode: 400 });
    const taxPercent = body.taxPercent === undefined || body.taxPercent === null || body.taxPercent === ''
      ? null
      : Math.min(100, Math.max(0, Number(body.taxPercent)));
    const amenities = Array.isArray(body.amenities) ? body.amenities.map((item: unknown) => text(item, 60)).filter(Boolean).slice(0, 40) : [];
    const languages = Array.isArray(body.hostLanguages) ? body.hostLanguages.map((item: unknown) => text(item, 40)).filter(Boolean).slice(0, 20) : [];
    const accessibility = Array.isArray(body.accessibility) ? body.accessibility.map((item: unknown) => text(item, 60)).filter(Boolean).slice(0, 30) : [];
    const price = int(body.basePricePaise ?? 0, 0, 100_000_000);
    const bedrooms = int(body.bedrooms ?? 0, 0, 100);
    const beds = int(body.beds ?? 0, 0, 200);
    const maxGuests = int(body.maxGuests ?? 0, 0, 500);
    const bathrooms = Number(body.bathrooms ?? 0);
    if (!Number.isFinite(bathrooms) || bathrooms < 0 || bathrooms > 100) throw Object.assign(new Error('INVALID_BATHROOM_COUNT'), { statusCode: 400 });
    const result = await client.query(
      `insert into public.stay_properties
         (listing_id, owner_user_id, name, property_type, place_type, city, area, address,
          latitude, longitude, check_in_time, check_out_time, base_price_paise, tax_percent,
          description, amenities, bedrooms, beds, bathrooms, max_guests, instant_book,
          self_check_in, pets_allowed, host_languages, accessibility, cancellation_policy,
          cancellation_free_hours, cleaning_fee_paise, service_fee_bps, is_active)
       values ($1,$2,$3,$4,$5,$6,
         coalesce($7, (select area from public.stay_properties where listing_id=$1)),
         coalesce($8, (select address from public.stay_properties where listing_id=$1)),
         coalesce($9, (select latitude from public.stay_properties where listing_id=$1)),
         coalesce($10, (select longitude from public.stay_properties where listing_id=$1)),
         $11,$12,$13,
         coalesce($14, (select tax_percent from public.stay_properties where listing_id=$1), 12),
         $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
         coalesce($26, (select cancellation_policy from public.stay_properties where listing_id=$1), 'moderate'),
         $27,$28,$29,$30)
       on conflict (listing_id) do update set
         name=excluded.name, property_type=excluded.property_type, place_type=excluded.place_type,
         city=excluded.city, area=excluded.area, address=excluded.address, latitude=excluded.latitude,
         longitude=excluded.longitude, check_in_time=excluded.check_in_time, check_out_time=excluded.check_out_time,
         base_price_paise=excluded.base_price_paise, tax_percent=excluded.tax_percent,
         description=excluded.description, amenities=excluded.amenities, bedrooms=excluded.bedrooms,
         beds=excluded.beds, bathrooms=excluded.bathrooms, max_guests=excluded.max_guests,
         instant_book=excluded.instant_book, self_check_in=excluded.self_check_in,
         pets_allowed=excluded.pets_allowed, host_languages=excluded.host_languages,
         accessibility=excluded.accessibility, cancellation_policy=excluded.cancellation_policy,
         cancellation_free_hours=excluded.cancellation_free_hours,
         cleaning_fee_paise=excluded.cleaning_fee_paise, service_fee_bps=excluded.service_fee_bps,
         is_active=excluded.is_active,
         updated_at=now()
       where public.stay_properties.owner_user_id = $2 returning *`,
      [listingId, actorId, name, propertyType, placeType, city, text(body.area, 120) || null,
        text(body.address, 400) || null, body.latitude ?? null, body.longitude ?? null,
        text(body.checkInTime, 5, '14:00'), text(body.checkOutTime, 5, '11:00'), price,
        taxPercent,
        text(body.description, 5000) || null, amenities, bedrooms, beds, bathrooms, maxGuests,
        body.instantBook === true, body.selfCheckIn === true, body.petsAllowed === true,
        languages, accessibility, policy, int(body.cancellationFreeHours ?? 48, 0, 720),
        int(body.cleaningFeePaise ?? 0, 0, 100_000_000),
        int(body.serviceFeeBps ?? 0, 0, 3000),
        isActive],
    );
    if (!result.rows[0]) throw Object.assign(new Error('PROPERTY_OWNERSHIP_REQUIRED'), { statusCode: 403 });
    return { body: { ok: true, property: result.rows[0] } };
  }));

  // Room types and units are written by the same screen that then reads them
  // back, so both answer only after COMMIT (same reason as /blocks).
  app.post('/api/stays/host/room-types', handleCommitted(async (req, actorId, client) => {
    const body = req.body || {};
    const propertyId = text(body.propertyId, 40);
    if (!UUID.test(propertyId)) throw Object.assign(new Error('INVALID_PROPERTY_ID'), { statusCode: 400 });
    const room = { name: text(body.name, 120), adults: int(body.maxAdults ?? 2, 1, 100), children: int(body.maxChildren ?? 0, 0, 100), price: int(body.basePricePaise, 0, 100_000_000), bedrooms: int(body.bedrooms ?? 1, 0, 100), beds: int(body.beds ?? 1, 0, 200), bathrooms: Number(body.bathrooms ?? 1) };
    if (!room.name || !Number.isFinite(room.bathrooms) || room.bathrooms < 0 || room.bathrooms > 100) throw Object.assign(new Error('INVALID_ROOM_TYPE'), { statusCode: 400 });
    const amenities = Array.isArray(body.amenities) ? body.amenities.map((item: unknown) => text(item, 60)).filter(Boolean).slice(0, 40) : [];
    const roomId = text(body.roomTypeId, 40);
    let result;
    if (roomId) {
      if (!UUID.test(roomId)) throw Object.assign(new Error('INVALID_ROOM_TYPE_ID'), { statusCode: 400 });
      result = await client.query(
        `update public.stay_room_types rt set name=$3,max_adults=$4,max_children=$5,base_price_paise=$6,
           amenities=$7,bedrooms=$8,beds=$9,bathrooms=$10,is_active=$11
         from public.stay_properties p where rt.property_id=p.id and p.owner_user_id=$1 and p.id=$2 and rt.id=$12 returning rt.*`,
        [actorId, propertyId, room.name, room.adults, room.children, room.price, amenities,
          room.bedrooms, room.beds, room.bathrooms, body.isActive !== false, roomId],
      );
    } else {
      result = await client.query(
        `insert into public.stay_room_types (property_id,name,max_adults,max_children,base_price_paise,amenities,bedrooms,beds,bathrooms)
         select p.id,$3,$4,$5,$6,$7,$8,$9,$10 from public.stay_properties p where p.id=$2 and p.owner_user_id=$1 returning *`,
        [actorId, propertyId, room.name, room.adults, room.children, room.price, amenities,
          room.bedrooms, room.beds, room.bathrooms],
      );
    }
    if (!result.rows[0]) throw Object.assign(new Error('OWNED_PROPERTY_REQUIRED'), { statusCode: 404 });
    return { status: roomId ? 200 : 201, body: { ok: true, roomType: result.rows[0] } };
  }));

  app.post('/api/stays/host/units', handleCommitted(async (req, actorId, client) => {
    const body = req.body || {};
    const roomTypeId = text(body.roomTypeId, 40);
    if (!UUID.test(roomTypeId)) throw Object.assign(new Error('INVALID_ROOM_TYPE_ID'), { statusCode: 400 });
    const label = text(body.label, 80);
    if (!label) throw Object.assign(new Error('UNIT_LABEL_REQUIRED'), { statusCode: 400 });
    if (body.unitId) {
      if (!UUID.test(String(body.unitId))) throw Object.assign(new Error('INVALID_UNIT_ID'), { statusCode: 400 });
      const result = await client.query(
        `update public.stay_units u set label=$4,floor=$5,is_active=$6 from public.stay_room_types rt
          join public.stay_properties p on p.id=rt.property_id
         where u.room_type_id=rt.id and p.owner_user_id=$1 and rt.id=$2 and u.id=$3 returning u.*`,
        [actorId, roomTypeId, body.unitId, label, text(body.floor, 40) || null, body.isActive !== false],
      );
      if (!result.rows[0]) throw Object.assign(new Error('OWNED_ROOM_TYPE_REQUIRED'), { statusCode: 404 });
      return { body: { ok: true, unit: result.rows[0] } };
    }
    const result = await client.query(
      `insert into public.stay_units(room_type_id,label,floor)
       select rt.id,$3,$4 from public.stay_room_types rt join public.stay_properties p on p.id=rt.property_id
        where rt.id=$2 and p.owner_user_id=$1 returning *`,
      [actorId, roomTypeId, label, text(body.floor, 40) || null],
    );
    if (!result.rows[0]) throw Object.assign(new Error('OWNED_ROOM_TYPE_REQUIRED'), { statusCode: 404 });
    return { status: 201, body: { ok: true, unit: result.rows[0] } };
  }));

  app.post('/api/stays/host/blocks', handleCommitted(async (req, actorId, client) => {
    const body = req.body || {};
    const unitId = text(body.unitId, 40);
    if (!UUID.test(unitId)) throw Object.assign(new Error('INVALID_UNIT_ID'), { statusCode: 400 });
    const startsOn = text(body.startsOn, 10); const endsOn = text(body.endsOn, 10);
    if (!DATE.test(startsOn) || !DATE.test(endsOn) || endsOn <= startsOn) throw Object.assign(new Error('INVALID_DATE_RANGE'), { statusCode: 400 });
    if (body.blockId) {
      if (!UUID.test(String(body.blockId))) throw Object.assign(new Error('INVALID_BLOCK_ID'), { statusCode: 400 });
      const result = await client.query(
        `update public.stay_blocks b set stay_dates=daterange($4::date,$5::date,'[)'), reason=$6, is_active=$7
          from public.stay_units u join public.stay_room_types rt on rt.id=u.room_type_id
          join public.stay_properties p on p.id=rt.property_id
         where p.owner_user_id=$1 and b.unit_id=u.id and b.unit_id=$2 and b.id=$3 returning b.*`,
        [actorId, unitId, body.blockId, startsOn, endsOn, text(body.reason, 500) || null, body.isActive !== false],
      );
      if (!result.rows[0]) throw Object.assign(new Error('OWNED_BLOCK_REQUIRED'), { statusCode: 404 });
      return { body: { ok: true, block: result.rows[0] } };
    }
    const result = await client.query(
      `insert into public.stay_blocks(unit_id,stay_dates,reason,created_by)
       select u.id,daterange($3::date,$4::date,'[)'),$5,$1 from public.stay_units u
       join public.stay_room_types rt on rt.id=u.room_type_id join public.stay_properties p on p.id=rt.property_id
       where p.owner_user_id=$1 and u.id=$2 returning *`,
      [actorId, unitId, startsOn, endsOn, text(body.reason, 500) || null],
    );
    if (!result.rows[0]) throw Object.assign(new Error('OWNED_UNIT_REQUIRED'), { statusCode: 404 });
    return { status: 201, body: { ok: true, block: result.rows[0] } };
  }));

  // Bookings are not owner-readable under the guest-only RLS policy, so the
  // trusted server path re-checks ownership in SQL before returning any row.
  const withServer = async <T>(run: (client: PoolClient) => Promise<T>, actorId = ''): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId]);
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ ...(UUID.test(actorId) ? { sub: actorId } : {}), role: 'service_role' }),
      ]);
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original */ }
      throw error;
    } finally { client.release(); }
  };

  app.get('/api/stays/host/bookings', handle(async (_req, res, actorId) => {
    const rows = await withServer(async (client) => {
      await client.query('select public.sweep_stay_requests()');
      const result = await client.query(
        `select b.id as booking_id, b.status, b.payment_status, b.payment_mode, b.total_paise,
                b.check_in, b.check_out, b.created_at, b.customer_name, b.customer_phone,
                p.listing_id, p.name as property_name, rt.name as room_type, u.label as unit_label
           from public.bookings b
           join public.stay_properties p on p.listing_id = b.listing_id
           left join public.stay_allocations a on a.booking_id = b.id
           left join public.stay_units u on u.id = a.unit_id
           left join public.stay_room_types rt on rt.id = u.room_type_id
          where p.owner_user_id = $1
          order by b.created_at desc limit 250`,
        [actorId],
      );
      return result.rows;
    }, actorId);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, bookings: rows });
  }));

  // A host scans the guest's server-issued booking QR. The HMAC binds the token
  // to the booking; the database state and ownership checks authorize check-in.
  // A token cannot be replayed after check-in.
  app.post('/api/stays/host/bookings/scan', handle(async (req, res, actorId) => {
    const token = text(req.body?.token, 500);
    if (!token) return bad(res, 400, 'QR_TOKEN_REQUIRED');
    const qr = verifyBookingQr(token, env);
    if (!qr) return bad(res, 400, 'QR_INVALID', 'This booking QR is invalid or expired.');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const row = await withServer(async (client) => {
      const result = await client.query(
        `select b.id, b.status, b.check_in::text as check_in, b.customer_name,
                p.name as property_name, p.owner_user_id
           from public.bookings b
           join public.stay_properties p on p.listing_id = b.listing_id
          where b.id = $1 and p.owner_user_id = $2 limit 1`,
        [qr.b, actorId],
      );
      return result.rows[0] || null;
    }, actorId);
    if (!row) return bad(res, 404, 'BOOKING_NOT_FOUND', 'That booking does not belong to one of your stays.');
    if (row.status === 'checked_in') return bad(res, 409, 'ALREADY_CHECKED_IN', 'This booking has already been checked in. The QR cannot be replayed.');
    if (row.status !== 'confirmed') return bad(res, 409, 'INVALID_STATE', 'Only a confirmed booking can be checked in.');
    if (row.check_in && today < String(row.check_in).slice(0, 10)) return bad(res, 409, 'TOO_EARLY', 'Check-in is not open for this booking yet.');
    const updated = await withServer(async (client) => {
      const result = await client.query(
        `update public.bookings set status='checked_in',
            payload = jsonb_set(jsonb_set(coalesce(payload,'{}'::jsonb), '{checkedInAt}', to_jsonb(now()::text)), '{qrVerifiedAt}', to_jsonb(now()::text))
          where id=$1 and status='confirmed' returning id, status`,
        [qr.b],
      );
      return result.rows[0] || null;
    }, actorId);
    if (!updated) return bad(res, 409, 'ALREADY_CHECKED_IN', 'This booking changed state before the scan could complete.');
    res.json({ ok: true, bookingId: updated.id, status: updated.status, propertyName: row.property_name, customerName: row.customer_name, checkIn: row.check_in });
  }));

  app.post('/api/stays/host/bookings/:bookingId/action', handle(async (req, res, actorId, client) => {
    const bookingId = text(req.params.bookingId, 120);
    const action = text(req.body?.action, 40);
    if (!bookingId) return bad(res, 400, 'BOOKING_REQUIRED');
    if (!['check_in', 'check_out', 'collect_payment', 'approve_online', 'cancel', 'approve_request', 'reject_request'].includes(action)) {
      return bad(res, 400, 'INVALID_BOOKING_ACTION');
    }
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const allowOwnerApproval = String(deps.env?.BOS_ALLOW_OWNER_MANUAL_SETTLEMENT || '') === '1';
    const actorProfile = await client.query(`select role from public.profiles where id = $1 limit 1`, [actorId]);
    const actorIsAdmin = actorProfile.rows[0]?.role === 'admin';
    const outcome = await withServer(async (client) => {
      const found = await client.query(
        `select b.*, p.owner_user_id, a.id as allocation_id, a.status as allocation_status,
                a.hold_token, a.expires_at
           from public.bookings b
           join public.stay_properties p on p.listing_id = b.listing_id
           left join public.stay_allocations a on a.booking_id = b.id
          where b.id = $1 and (p.owner_user_id = $2 or $3::boolean)
          for update of b`,
        [bookingId, actorId, actorIsAdmin],
      );
      const booking = found.rows[0];
      if (!booking) return { error: 'FORBIDDEN' as const };
      await client.query('select public.sweep_stay_requests()');

      if (action === 'approve_request' || action === 'reject_request') {
        if (booking.status !== 'pending_approval') return { error: 'NOT_PENDING' as const };
        if (booking.request_expires_at && new Date(booking.request_expires_at).getTime() <= Date.now()) {
          return { error: 'REQUEST_EXPIRED' as const };
        }
        if (action === 'reject_request') {
          await client.query(`update public.bookings set status='rejected', responded_at=now(), payment_status='not_due' where id=$1`, [bookingId]);
          await client.query(`update public.stay_allocations set status='released', updated_at=now() where booking_id=$1 and status in ('held','confirmed')`, [bookingId]);
          await client.query(
            `insert into public.notifications (recipient_user_id, title, message, notif_type, link_id)
             values ($1, 'Stay request declined', 'The host could not accept these dates. No money was collected.', 'stay_request', $2)`,
            [booking.user_id, bookingId],
          );
          return { ok: true, status: 'rejected' };
        }
        if (booking.payment_mode === 'pay_after_service') {
          const confirmedUnit = await client.query(`update public.stay_allocations set status='confirmed', expires_at=null, updated_at=now() where booking_id=$1 and status='held' returning id`, [bookingId]);
          if (!confirmedUnit.rowCount) return { error: 'REQUEST_EXPIRED' as const };
          await client.query(`update public.bookings set status='confirmed', payment_status='pay_later', responded_at=now(), request_expires_at=null where id=$1`, [bookingId]);
          await client.query(
            `insert into public.notifications (recipient_user_id, title, message, notif_type, link_id)
             values ($1, 'Stay request approved', 'The host approved your stay. Pay at the property after your stay.', 'stay_request', $2)`,
            [booking.user_id, bookingId],
          );
          return { ok: true, status: 'confirmed', paymentStatus: 'pay_later' };
        }
        if (booking.payment_mode === 'razorpay') {
          if (!stayRazorpayReady(env)) return { error: 'RAZORPAY_NOT_CONFIGURED' as const };
          let orderId = '';
          try {
            const order = await createStayRazorpayOrder(env, Number(booking.total_paise), `stay_req_${String(bookingId).slice(0, 24)}`);
            orderId = order.orderId;
          } catch (error) {
            if (error instanceof StayRazorpayError) return { error: error.code as typeof error.code };
            throw error;
          }
          const intentId = `pi_${crypto.randomUUID().replace(/-/g, '')}`;
          const intentExpires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
          await client.query(
            `insert into public.payment_intents
               (id, user_id, purpose, listing_id, room_type_id, booking_id, amount_paise,
                payment_mode, provider, status, idempotency_key, expires_at, provider_order_id)
             values ($1,$2,'stay_booking',$3,$4,$5,$6,'razorpay','razorpay','pending',$7,$8,$9)`,
            [intentId, booking.user_id, booking.listing_id, booking.room_type_id, bookingId,
              booking.total_paise, `request-${bookingId}-${Date.now()}`, intentExpires, orderId],
          );
          const extended = await client.query(
            `update public.stay_allocations set expires_at=$2::timestamptz, updated_at=now()
              where booking_id=$1 and status='held' returning id`,
            [bookingId, intentExpires],
          );
          if (!extended.rowCount) return { error: 'REQUEST_EXPIRED' as const };
          await client.query(
            `update public.bookings set status='approved', payment_status='pending_verification',
                responded_at=now(), request_expires_at=$2::timestamptz where id=$1`,
            [bookingId, intentExpires],
          );
          await client.query(
            `insert into public.notifications (recipient_user_id, title, message, notif_type, link_id)
             values ($1, 'Stay request approved — payment due',
                     'The host approved your dates. Complete Razorpay Checkout before the payment window closes.',
                     'stay_request', $2)`,
            [booking.user_id, bookingId],
          );
          return { ok: true, status: 'approved', paymentStatus: 'pending_verification', intentId, razorpayOrderId: orderId, expiresAt: intentExpires };
        }
        const sandboxEnabled = stayPaymentSandboxEnabled(env);
        const razorpayReady = stayRazorpayReady(env);
        if (!sandboxEnabled && !razorpayReady) {
          return { error: 'PAYMENT_PROVIDER_NOT_CONFIGURED' as const };
        }
        const vpa = String(deps.env?.BOS_UPI_MERCHANT_VPA || '').trim();
        const merchantName = String(deps.env?.BOS_UPI_MERCHANT_NAME || 'BookOurSpace').trim();
        if (sandboxEnabled && (!vpa || !vpa.includes('@'))) return { error: 'MERCHANT_VPA_NOT_CONFIGURED' as const };
        const existing = await client.query(
          `select id, status, upi_uri, expires_at, provider_order_id, qr_image_url
             from public.payment_intents where booking_id=$1 and payment_mode='upi' order by created_at desc limit 1`,
          [bookingId],
        );
        let intentId = existing.rows[0]?.id;
        let upiUri = existing.rows[0]?.upi_uri || null;
        let qrImageUrl = existing.rows[0]?.qr_image_url || null;
        let intentExpires = existing.rows[0]?.expires_at;
        const reusable = existing.rows[0]
          && ['created', 'pending'].includes(String(existing.rows[0].status))
          && existing.rows[0].expires_at
          && new Date(existing.rows[0].expires_at).getTime() > Date.now();
        if (!reusable) {
          intentId = `pi_${crypto.randomUUID().replace(/-/g, '')}`;
          intentExpires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
          if (!sandboxEnabled && razorpayReady) {
            let qr: { qrId: string; upiUri: string | null; imageUrl: string | null };
            try {
              qr = await createStayRazorpayUpiQr(
                env,
                Number(booking.total_paise),
                `BookOurSpace stay ${String(bookingId).slice(0, 18)}`,
                vpa,
                merchantName,
                `request-${bookingId}`,
              );
            } catch (error) {
              if (error instanceof StayRazorpayError) return { error: error.code as typeof error.code };
              throw error;
            }
            upiUri = qr.upiUri;
            qrImageUrl = qr.imageUrl;
            await client.query(
              `insert into public.payment_intents
                 (id, user_id, purpose, listing_id, room_type_id, booking_id, amount_paise,
                  merchant_vpa, upi_uri, payment_mode, provider, status, idempotency_key,
                  expires_at, provider_order_id, qr_image_url)
               values ($1,$2,'stay_booking',$3,$4,$5,$6,$7,$8,'upi','razorpay','pending',$9,$10,$11,$12)`,
              [intentId, booking.user_id, booking.listing_id, booking.room_type_id, bookingId,
                booking.total_paise, vpa.includes('@') ? vpa : null, upiUri,
                `request-${bookingId}-${Date.now()}`, intentExpires, qr.qrId, qrImageUrl],
            );
          } else {
            upiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(merchantName)}&am=${(Number(booking.total_paise) / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`BookOurSpace stay ${String(bookingId).slice(0, 18)}`)}&tr=${encodeURIComponent(intentId)}`;
            qrImageUrl = null;
            await client.query(
              `insert into public.payment_intents
                 (id, user_id, purpose, listing_id, room_type_id, booking_id, amount_paise,
                  merchant_vpa, upi_uri, payment_mode, status, idempotency_key, expires_at)
               values ($1,$2,'stay_booking',$3,$4,$5,$6,$7,$8,'upi','pending',$9,$10)`,
              [intentId, booking.user_id, booking.listing_id, booking.room_type_id, bookingId,
                booking.total_paise, vpa, upiUri, `request-${bookingId}-${Date.now()}`, intentExpires],
            );
          }
        }
        const extended = await client.query(
          `update public.stay_allocations set expires_at=$2::timestamptz, updated_at=now()
            where booking_id=$1 and status='held' returning id`,
          [bookingId, intentExpires],
        );
        if (!extended.rowCount) return { error: 'REQUEST_EXPIRED' as const };
        await client.query(
          `update public.bookings set status='approved', payment_status='pending_verification',
              responded_at=now(), request_expires_at=$2::timestamptz where id=$1`,
          [bookingId, intentExpires],
        );
        await client.query(
          `insert into public.notifications (recipient_user_id, title, message, notif_type, link_id)
           values ($1, 'Stay request approved — payment due',
                   'The host approved your dates. Complete the UPI payment before the payment window closes.',
                   'stay_request', $2)`,
          [booking.user_id, bookingId],
        );
        return { ok: true, status: 'approved', paymentStatus: 'pending_verification', intentId, upiUri, qrImageUrl, expiresAt: intentExpires };
      }

      if (action === 'cancel') {
        const cancelled = await client.query(`select public.stay_cancel_booking($1, $2) as result`, [bookingId, actorId]);
        return { ok: true, cancellation: cancelled.rows[0]?.result };
      }
      if (action === 'check_in') {
        if (booking.status !== 'confirmed') return { error: 'INVALID_STATE' as const };
        if (booking.check_in && today < String(booking.check_in).slice(0, 10)) return { error: 'TOO_EARLY' as const };
        await client.query(
          `update public.bookings set status = 'checked_in',
              payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{checkedInAt}', to_jsonb(now()::text))
            where id = $1`, [bookingId],
        );
        return { ok: true, status: 'checked_in' };
      }
      if (action === 'check_out') {
        if (booking.status !== 'checked_in') return { error: 'INVALID_STATE' as const };
        await client.query(
          `update public.bookings set status = 'completed',
              payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{checkedOutAt}', to_jsonb(now()::text))
            where id = $1`, [bookingId],
        );
        return { ok: true, status: 'completed' };
      }
      if (action === 'collect_payment') {
        if (booking.payment_mode !== 'pay_after_service') return { error: 'INVALID_MODE' as const };
        if (['verified', 'collected_offline'].includes(String(booking.payment_status))) return { error: 'ALREADY_PAID' as const };
        await client.query(
          `update public.bookings set payment_status = 'collected_offline',
              payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{paymentCollectedAt}', to_jsonb(now()::text))
            where id = $1`, [bookingId],
        );
        return { ok: true, paymentStatus: 'collected_offline' };
      }
      // Local/admin manual settlement only. Production money moves via Razorpay
      // webhook or Checkout verify — never a host/admin click.
      if (String(env.NODE_ENV) === 'production') return { error: 'SIMULATED_SETTLEMENT_FORBIDDEN' as const };
      if (!actorIsAdmin && !allowOwnerApproval) return { error: 'MANUAL_APPROVAL_FORBIDDEN' as const };
      if (booking.payment_mode !== 'upi' || booking.payment_status !== 'pending_verification') return { error: 'INVALID_STATE' as const };
      const intent = await client.query(
        `select * from public.payment_intents where booking_id = $1 and payment_mode = 'upi'
          and status in ('created','pending') for update`, [bookingId],
      );
      const intentRow = intent.rows[0];
      if (!intentRow) return { error: 'INTENT_NOT_FOUND' as const };
      if (Number(intentRow.amount_paise) !== Number(booking.total_paise)) return { error: 'AMOUNT_MISMATCH' as const };
      const eventId = `manual-${crypto.randomUUID()}`;
      const payloadHash = crypto.createHash('sha256').update(`${eventId}|${intentRow.id}|${intentRow.amount_paise}|${actorId}`).digest('hex');
      await client.query(
        `insert into public.payment_provider_events
           (event_id, provider, intent_id, event_type, payload_sha256, amount_paise, processed_at)
         values ($1, 'manual_approval', $2, 'payment.captured', $3, $4, now())`,
        [eventId, intentRow.id, payloadHash, intentRow.amount_paise],
      );
      await client.query(
        `update public.payment_intents set status = 'verified', provider = 'manual_approval',
            verified_at = now(), provider_payment_id = $2, updated_at = now() where id = $1`,
        [intentRow.id, eventId],
      );
      await client.query(
        `update public.bookings set payment_status = 'verified',
            payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{manualSettlement}',
              jsonb_build_object('eventId', $2::text, 'actor', $3::text, 'approvedAt', now()::text))
          where id = $1`, [bookingId, eventId, actorId],
      );
      const allocation = await client.query(
        `select id, status, hold_token, expires_at from public.stay_allocations
          where booking_id = $1 order by created_at desc limit 1 for update`, [bookingId],
      );
      const alloc = allocation.rows[0];
      if (!alloc) return { error: 'ALLOCATION_MISSING' as const };
      if (alloc.status === 'held') {
        if (!alloc.expires_at || new Date(alloc.expires_at).getTime() <= Date.now()) {
          throw Object.assign(new Error('HOLD_EXPIRED'), { statusCode: 409 });
        }
        await client.query(`select public.stay_confirm_booking_for_actor($1, $2, $3)`, [alloc.hold_token, bookingId, String(booking.user_id)]);
      }
      return { ok: true, paymentStatus: 'verified', eventId };
    }, actorId);
    if ('error' in outcome) {
      const map: Record<string, [number, string]> = {
        FORBIDDEN: [403, 'FORBIDDEN'],
        INVALID_STATE: [409, 'INVALID_STATE'],
        TOO_EARLY: [409, 'TOO_EARLY'],
        INVALID_MODE: [409, 'INVALID_MODE'],
        ALREADY_PAID: [409, 'ALREADY_PAID'],
        MANUAL_APPROVAL_FORBIDDEN: [403, 'MANUAL_APPROVAL_FORBIDDEN'],
        INTENT_NOT_FOUND: [409, 'INTENT_NOT_FOUND'],
        AMOUNT_MISMATCH: [409, 'AMOUNT_MISMATCH'],
        ALLOCATION_MISSING: [409, 'ALLOCATION_MISSING'],
        NOT_PENDING: [409, 'NOT_PENDING'],
        REQUEST_EXPIRED: [409, 'REQUEST_EXPIRED'],
        MERCHANT_VPA_NOT_CONFIGURED: [503, 'MERCHANT_VPA_NOT_CONFIGURED'],
        PAYMENT_PROVIDER_NOT_CONFIGURED: [503, 'PAYMENT_PROVIDER_NOT_CONFIGURED'],
        RAZORPAY_NOT_CONFIGURED: [503, 'RAZORPAY_NOT_CONFIGURED'],
        RAZORPAY_UNREACHABLE: [502, 'RAZORPAY_UNREACHABLE'],
        RAZORPAY_ORDER_FAILED: [502, 'RAZORPAY_ORDER_FAILED'],
        RAZORPAY_UPI_QR_FAILED: [502, 'RAZORPAY_UPI_QR_FAILED'],
        SIMULATED_SETTLEMENT_FORBIDDEN: [403, 'SIMULATED_SETTLEMENT_FORBIDDEN'],
      };
      const [status, code] = map[String(outcome.error)] || [400, 'BOOKING_ACTION_FAILED'];
      return bad(res, status, code);
    }
    res.json(outcome);
  }));

  app.put('/api/stays/host/media-order', handleCommitted(async (req, actorId, client) => {
    const listingId = text(req.body?.listingId, 128);
    await requireOwnedStayListing(client, actorId, listingId);
    const ids = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.map((id: unknown) => String(id)) : [];
    if (ids.length > 20 || ids.some((id: string) => !UUID.test(id)) || new Set(ids).size !== ids.length) throw Object.assign(new Error('INVALID_MEDIA_ORDER'), { statusCode: 400 });
    const owned = await client.query(
      `select id, 'storage://' || bucket_id || '/' || object_path as reference from public.media_assets
        where id = any($1::uuid[]) and owner_id=$2 and module_key in ('stays', 'hotel_stay') and parent_type='provider_listing'
          and parent_id=$3 and bucket_id='bos-public-media' and privacy='public' and processing_status='ready'`,
      [ids, actorId, listingId],
    );
    if (owned.rowCount !== ids.length) throw Object.assign(new Error('OWNED_READY_MEDIA_REQUIRED'), { statusCode: 403 });
    for (let index = 0; index < ids.length; index += 1) {
      const changed = await client.query(
        `update public.media_assets set display_order=$3 where id=$1 and owner_id=$2 and parent_id=$4 and processing_status='ready'`,
        [ids[index], actorId, index, listingId],
      );
      if (changed.rowCount !== 1) throw Object.assign(new Error('MEDIA_ORDER_UPDATE_FORBIDDEN'), { statusCode: 403 });
    }
    const referenceById = new Map(owned.rows.map(row => [row.id, row.reference]));
    const images = ids.map((id: string) => referenceById.get(id));
    const listing = await client.query(
      `update public.listings set payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{images}',$2::jsonb,true),updated_at=now()
        where id=$1 and owner_id=$3 returning id`, [listingId, JSON.stringify(images), actorId],
    );
    if (!listing.rowCount) throw Object.assign(new Error('LISTING_UPDATE_FORBIDDEN'), { statusCode: 403 });
    return { body: { ok: true, images } };
  }));
}

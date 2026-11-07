import type express from 'express';
import { types, type Pool, type PoolClient } from 'pg';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';
import {
  istTodayIso,
  parseStaySearchQuery,
  type StaySearchQuery,
} from './staySearchQuery';
import { isRenderableListingImageSource } from '../lib/media/signedStorageUrl';

/**
 * Public Stay discovery API.
 *
 * One SQL statement produces the page, the total count and every facet the UI
 * renders. Filters map to indexed columns added by migration 20261105170000,
 * so the count is always the count of the rows the user can actually see.
 *
 * Reads run as `anon` under the same RLS policies as the browser, so this
 * endpoint cannot expose an inactive property or an unapproved listing.
 */

types.setTypeParser(1082, (value: string) => value);

export interface StaySearchApiDeps {
  verifySession: (req: express.Request) => any | null;
  env?: NodeJS.ProcessEnv;
  /** Startup-validated application pool; injectable for isolated tests. */
  pool?: Pool;
}

const MAX_CALENDAR_NIGHTS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function bad(res: express.Response, status: number, error: string, message: string) {
  res.status(status).json({ ok: false, error, message });
}

function safeImages(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const row = payload as Record<string, unknown>;
  const candidates = [
    ...(Array.isArray(row.images) ? row.images : []),
    ...(typeof row.imageUrl === 'string' ? [row.imageUrl] : []),
  ];
  return [...new Set(candidates.filter(isRenderableListingImageSource))].slice(0, 6);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type SqlParam = string | number | boolean | string[] | null;
const TRANSIENT_DATABASE_CODES = new Set([
  '08000', '08003', '08006', '57P01', '53300',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN',
]);

export function registerStaySearchApi(app: express.Express, deps: StaySearchApiDeps): void {
  const env = deps.env || process.env;
  // Demo stays are bookable only under the explicit local preview opt-in.
  const allowDemoBooking = env.NODE_ENV !== 'production' && env.BOS_STAY_ALLOW_DEMO_BOOKING === '1';
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  if (connectionString) assertPostgresConnectionTarget(connectionString, env);

  if (!connectionString) {
    const unavailable = (_req: express.Request, res: express.Response) =>
      bad(res, 503, 'STAY_SEARCH_UNAVAILABLE', 'Stay search requires the PostgreSQL repository.');
    app.get('/api/stays/search', unavailable);
    app.get('/api/stays/:listingId/calendar', unavailable);
    app.get('/api/stays/:listingId/reviews', unavailable);
    return;
  }

  const pool = deps.pool || getSharedPostgresPool(connectionString, env);

  async function withActor<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let client: PoolClient | undefined;
      let failure: any;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE anon');
        await client.query("select set_config('request.jwt.claim.sub', '', true)");
        await client.query("select set_config('request.jwt.claim.role', 'anon', true)");
        await client.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
        const out = await run(client);
        await client.query('COMMIT');
        return out;
      } catch (error: any) {
        failure = error;
        if (client) {
          try { await client.query('ROLLBACK'); } catch { /* preserve original */ }
        }
        if (attempt < 2 && TRANSIENT_DATABASE_CODES.has(String(error?.code || ''))) {
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
          continue;
        }
        throw error;
      } finally {
        if (client) {
          const discard = ['08000', '08003', '08006', '57P01', 'ECONNRESET', 'EPIPE'].includes(String(failure?.code || ''));
          client.release(discard ? failure : undefined);
        }
      }
    }
    throw new Error('STAY_SEARCH_RETRY_EXHAUSTED');
  }

  async function hotelsModuleEnabled(client: PoolClient): Promise<boolean> {
    const result = await client.query(
      `select is_enabled from public.platform_module_flags where module_key = 'hotels'`,
    );
    return result.rows.length === 1 && result.rows[0]?.is_enabled === true;
  }

  app.get('/api/stays/search', async (req, res) => {
    const parsed = parseStaySearchQuery(req.query as Record<string, unknown>, istTodayIso());
    if (!parsed.ok) return bad(res, 400, parsed.error, parsed.message);
    const query = parsed.query;

    try {
      const result = await withActor(async (client) => {
        if (!(await hotelsModuleEnabled(client))) {
          return { moduleDisabled: true as const };
        }
        // Database rows are authoritative. Demo inventory is excluded by
        // default in every environment and can appear only through an explicit
        // local preview opt-in; a repository error never selects fixtures.
        const excludeDemo = env.NODE_ENV === 'production' || env.BOS_STAY_INCLUDE_DEMO !== '1';
        return { page: await runSearch(client, query, { excludeDemo }), excludeDemo };
      });
      if ('moduleDisabled' in result) {
        return bad(res, 409, 'MODULE_DISABLED', 'Hotels & Stays is currently switched off.');
      }
      const rows = result.page.rows;
      const total = result.page.total;
      res.setHeader('Cache-Control', 'public, max-age=15');
      res.json({
        ok: true,
        source: 'postgresql',
        generatedAt: new Date().toISOString(),
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasMore: (query.page + 1) * query.pageSize < total,
        nights: query.nights,
        destination: query.destination,
        fixtures: !result.excludeDemo,
        liveInventory: result.excludeDemo,
        items: rows.map((row: any) => {
          const images = safeImages(row.payload);
          return {
            id: String(row.id),
            listingId: String(row.listing_id),
            name: String(row.name || row.listing_title || 'Stay'),
            demo: Boolean(row.payload && row.payload.demo === true),
            demoBookable: allowDemoBooking,
            localTestFixture: Boolean(row.payload && row.payload.localTestFixture === true),
            propertyType: String(row.property_type || 'hotel'),
            placeType: String(row.place_type || 'entire_home'),
            city: String(row.city || ''),
            area: String(row.area || ''),
            address: String(row.address || ''),
            description: String(row.description || ''),
            latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
            longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
            checkInTime: String(row.check_in_time || ''),
            checkOutTime: String(row.check_out_time || ''),
            taxPercent: numberOrZero(row.tax_percent),
            cleaningFeePaise: numberOrZero(row.cleaning_fee_paise),
            serviceFeeBps: numberOrZero(row.service_fee_bps),
            amenities: stringArray(row.amenities),
            accessibility: stringArray(row.accessibility_keys),
            hostLanguages: stringArray(row.language_keys),
            hostId: row.host_id ? String(row.host_id) : '',
            hostName: row.host_name ? String(row.host_name) : '',
            hostAvatarUrl: row.host_avatar_url ? String(row.host_avatar_url) : '',
            instantBook: row.instant_book === true,
            selfCheckIn: row.self_check_in === true,
            petsAllowed: row.pets_allowed === true,
            guestFavourite: row.guest_favourite === true,
            luxeVerified: row.luxe_verified === true,
            bedrooms: numberOrZero(row.bedrooms),
            beds: numberOrZero(row.beds),
            bathrooms: numberOrZero(row.bathrooms),
            maxGuests: numberOrZero(row.max_guests),
            cancellationPolicy: String(row.cancellation_policy || 'moderate'),
            cancellationFreeHours: numberOrZero(row.cancellation_free_hours),
            priceFromPaise: numberOrZero(row.nightly_price_paise),
            listingPriceAmount: row.listing_price === null || row.listing_price === undefined
              ? null
              : Number(row.listing_price),
            listingPriceUnit: row.price_unit ? String(row.price_unit) : '',
            rating: numberOrZero(row.rating),
            reviewCount: numberOrZero(row.review_count),
            availableUnits: row.available_units === null || row.available_units === undefined
              ? null
              : Number(row.available_units),
            minAvailablePricePaise: row.min_available_price_paise === null || row.min_available_price_paise === undefined
              ? null
              : Number(row.min_available_price_paise),
            images,
            roomTypes: Array.isArray(row.room_types) ? row.room_types.map((room: any) => ({
              id: String(room.id),
              name: String(room.name || ''),
              maxAdults: numberOrZero(room.maxAdults),
              maxChildren: numberOrZero(room.maxChildren),
              basePricePaise: numberOrZero(room.basePricePaise),
              amenities: stringArray(room.amenities),
              bedrooms: numberOrZero(room.bedrooms),
              beds: numberOrZero(room.beds),
              bathrooms: numberOrZero(room.bathrooms),
            })) : [],
          };
        }),
      });
    } catch (error: any) {
      const message = String(error?.message || '');
      if (/column .* does not exist/i.test(message)) {
        return bad(res, 503, 'STAY_SEARCH_SCHEMA_OUTDATED', 'Stay filters need the latest database migration. No listings are shown until it is applied.');
      }
      const errorCode = String(error?.code || 'UNKNOWN').replace(/[^A-Z0-9_]/gi, '').slice(0, 24) || 'UNKNOWN';
      // PostgreSQL's parameter-index diagnostic is useful for resolving type
      // inference errors while staying safe to log (no SQL, parameters, or URL).
      const parameterDiagnostic = String(error?.message || '').match(/parameter \$\d+/i)?.[0] || '';
      const positionDiagnostic = /^\d+$/.test(String(error?.position || '')) ? `position ${error.position}` : '';
      console.error('[stay-search] PostgreSQL query failed', errorCode, parameterDiagnostic, positionDiagnostic);
      if (TRANSIENT_DATABASE_CODES.has(String(error?.code || ''))) {
        return bad(res, 503, 'STAY_SEARCH_DATABASE_UNAVAILABLE', 'Stay search is temporarily unavailable. Please try again.');
      }
      bad(res, 500, 'STAY_SEARCH_FAILED', 'Stay search could not be completed.');
    }
  });

  app.get('/api/stays/hosts/:hostId', async (req, res) => {
    const hostId = String(req.params.hostId || '').trim().toLowerCase();
    if (!UUID.test(hostId)) return bad(res, 400, 'INVALID_HOST_ID', 'That host could not be resolved.');
    try {
      const payload = await withActor(async (client) => {
        const host = await client.query(
          `select pp.id, pp.full_name, pp.avatar_url, pp.city, pp.verified,
                  coalesce((
                    select array_agg(distinct lang)
                      from public.stay_properties sp, unnest(sp.host_languages) lang
                     where sp.owner_user_id = pp.id and sp.is_active
                  ), '{}'::text[]) as host_languages,
                  (select count(*)::int from public.stay_properties sp
                    where sp.owner_user_id = pp.id and sp.is_active) as active_stays,
                  (select round(avg(r.rating)::numeric, 2)::float
                     from public.reviews r
                     join public.stay_properties sp on sp.listing_id = r.listing_id
                    where sp.owner_user_id = pp.id) as rating,
                  (select count(*)::int
                     from public.reviews r
                     join public.stay_properties sp on sp.listing_id = r.listing_id
                    where sp.owner_user_id = pp.id) as review_count
             from public.public_provider_profile_projection pp
            where pp.id = $1 and pp.verified is true
            limit 1`,
          [hostId],
        );
        if (!host.rows[0]) return { missing: true as const };
        const listings = await client.query(
          `select l.id as listing_id, sp.name, sp.property_type, sp.place_type, sp.city, sp.area,
                  sp.base_price_paise, sp.guest_favourite, l.payload
             from public.stay_properties sp
             join public.listings l on l.id = sp.listing_id
            where sp.owner_user_id = $1 and sp.is_active and l.status = 'active'
              and l.is_verified is true and l.verified_by is not null
              and l.payload->>'stayLifecycle' = 'approved'
              and coalesce(l.payload->>'demo','false') <> 'true'
              and exists (
                select 1 from public.public_provider_profile_projection owner
                 where owner.id = sp.owner_user_id and owner.verified is true
              )
            order by sp.guest_favourite desc, sp.created_at desc
            limit 12`,
          [hostId],
        );
        return { missing: false as const, host: host.rows[0], listings: listings.rows };
      });
      if (payload.missing) return bad(res, 404, 'HOST_NOT_FOUND', 'That host profile is not public.');
      const row: any = payload.host;
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json({
        ok: true,
        host: {
          id: String(row.id),
          name: String(row.full_name || 'BookOurSpace host'),
          avatarUrl: String(row.avatar_url || ''),
          city: String(row.city || ''),
          verified: row.verified === true,
          languages: Array.isArray(row.host_languages) ? row.host_languages : [],
          activeStays: Number(row.active_stays || 0),
          rating: numberOrZero(row.rating),
          reviewCount: Number(row.review_count || 0),
        },
        listings: payload.listings.map((listing: any) => ({
          listingId: String(listing.listing_id),
          name: String(listing.name || 'Stay'),
          propertyType: String(listing.property_type || 'hotel'),
          placeType: String(listing.place_type || 'entire_home'),
          city: String(listing.city || ''),
          area: String(listing.area || ''),
          priceFromPaise: Number(listing.base_price_paise || 0),
          guestFavourite: listing.guest_favourite === true,
          images: safeImages(listing.payload),
        })),
      });
    } catch {
      bad(res, 500, 'HOST_PROFILE_FAILED', 'The host profile could not be loaded.');
    }
  });

  app.get('/api/stays/:listingId/calendar', async (req, res) => {
    const listingId = String(req.params.listingId || '').trim();
    if (!listingId || listingId.length > 200) return bad(res, 400, 'LISTING_ID_REQUIRED', 'A stay listing id is required.');
    const today = istTodayIso();
    const from = String(req.query.from || today);
    const to = String(req.query.to || '');
    if (!DATE.test(from)) return bad(res, 400, 'INVALID_FROM', 'from must be YYYY-MM-DD.');
    const defaultTo = new Date(Date.parse(`${from}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10);
    const resolvedTo = DATE.test(to) ? to : defaultTo;
    const nights = Math.round((Date.parse(`${resolvedTo}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
    if (!Number.isFinite(nights) || nights <= 0) {
      return bad(res, 400, 'INVALID_RANGE', 'to must be after from.');
    }
    if (nights > MAX_CALENDAR_NIGHTS) {
      return bad(res, 400, 'RANGE_TOO_LARGE', `The calendar can show at most ${MAX_CALENDAR_NIGHTS} nights.`);
    }
    try {
      const rows = await withActor(async (client) => {
        const result = await client.query(
          `select night, free_units, total_units, min_price_paise
             from public.stay_night_calendar($1, $2::date, $3::date)`,
          [listingId, from, resolvedTo],
        );
        return result.rows;
      });
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({
        ok: true,
        listingId,
        from,
        to: resolvedTo,
        nights: rows.map((row: any) => ({
          date: String(row.night).slice(0, 10),
          availableUnits: Number(row.free_units),
          totalUnits: Number(row.total_units),
          minPricePaise: row.min_price_paise === null ? null : Number(row.min_price_paise),
        })),
      });
    } catch (error: any) {
      if (error?.code === 'P0002') return bad(res, 404, 'LISTING_NOT_FOUND', 'That stay is not available.');
      bad(res, 500, 'STAY_CALENDAR_FAILED', 'The availability calendar could not be loaded.');
    }
  });

  app.get('/api/stays/:listingId/reviews', async (req, res) => {
    const listingId = String(req.params.listingId || '').trim();
    if (!listingId || listingId.length > 200) return bad(res, 400, 'LISTING_ID_REQUIRED', 'A stay listing id is required.');
    const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 8));
    try {
      const payload = await withActor(async (client) => {
        const listing = await client.query(
          `select id from public.listings where id = $1 and status = 'active' limit 1`,
          [listingId],
        );
        if (listing.rowCount === 0) return { missing: true as const };
        const summary = await client.query(
          `select coalesce(round(avg(rating)::numeric, 2), 0)::float as rating,
                  count(*)::int as review_count
             from public.reviews where listing_id = $1`,
          [listingId],
        );
        const rows = await client.query(
          `select id, customer_name, rating, comment, created_at, payload
             from public.reviews
            where listing_id = $1
            order by created_at desc
            limit $2`,
          [listingId, limit],
        );
        return { missing: false as const, summary: summary.rows[0], rows: rows.rows };
      });
      if (payload.missing) return bad(res, 404, 'LISTING_NOT_FOUND', 'That stay is not available.');
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json({
        ok: true,
        listingId,
        rating: numberOrZero(payload.summary?.rating),
        reviewCount: numberOrZero(payload.summary?.review_count),
        reviews: (payload.rows || []).map((row: any) => ({
          id: String(row.id),
          author: String(row.customer_name || 'Guest'),
          rating: numberOrZero(row.rating),
          comment: String(row.comment || ''),
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
          hostReply: typeof row.payload?.hostReply === 'string' ? row.payload.hostReply : '',
        })),
      });
    } catch {
      bad(res, 500, 'STAY_REVIEWS_FAILED', 'Reviews could not be loaded.');
    }
  });
}

/* --------------------------------- SQL ----------------------------------- */

async function runSearch(
  client: import('pg').PoolClient,
  query: StaySearchQuery,
  options: { excludeDemo: boolean } = { excludeDemo: true },
): Promise<{ total: number; rows: any[] }> {
  const values: SqlParam[] = [];
  const param = (value: SqlParam): string => {
    values.push(value);
    return `$${values.length}`;
  };

  // Put PostgreSQL's type on each bound placeholder at its declaration. A
  // guest parameter is used in both `$n is null` and integer comparisons;
  // without this cast PostgreSQL can reject the statement with SQLSTATE 42P08
  // because the NULL test supplies no type context.
  const checkIn = query.checkIn ? `${param(query.checkIn)}::date` : 'null::date';
  const checkOut = query.checkOut ? `${param(query.checkOut)}::date` : 'null::date';
  const guests = query.guests === null ? 'null::int' : `${param(query.guests)}::int`;

  // `stay_availability` is the same SECURITY DEFINER routine the checkout uses,
  // so the badge in the list and the server-side hold agree. It also sweeps
  // expired holds, which a direct read as `anon` could not do.
  const availability = query.checkIn && query.checkOut
    ? `
      left join lateral (
        select coalesce(sum(free_units), 0)::int as available_units,
               min(case when free_units > 0 then base_price_paise end)::int as min_available_price_paise
          from (
            select rt.base_price_paise,
                   (select count(*) from public.stay_availability(rt.id, ${checkIn}, ${checkOut})) as free_units
              from public.stay_room_types rt
             where rt.property_id = p.id
               and rt.is_active
               and (${guests} is null or (rt.max_adults + rt.max_children) >= ${guests})
          ) room_free
      ) av on true`
    : `
      left join lateral (select null::int as available_units, null::int as min_available_price_paise) av on true`;

  const clauses: string[] = [];
  if (query.hostId) {
    clauses.push(`p.owner_user_id = ${param(query.hostId)}::uuid`);
  }
  if (query.destination) {
    const pattern = `%${query.destination.toLowerCase()}%`;
    const placeholder = param(pattern);
    clauses.push(`(
      lower(p.city) like ${placeholder}
      or lower(coalesce(p.area, '')) like ${placeholder}
      or lower(coalesce(p.address, '')) like ${placeholder}
      or lower(p.name) like ${placeholder}
    )`);
  }
  if (query.placeTypes.length) {
    clauses.push(`p.place_type = any(${param(query.placeTypes)}::text[])`);
  }
  if (query.propertyTypes.length) {
    // `guesthouse` and `guest_house` are one user-facing type.
    const types = query.propertyTypes.includes('guest_house')
      ? [...new Set([...query.propertyTypes, 'guesthouse'])]
      : query.propertyTypes;
    clauses.push(`p.property_type = any(${param(types)}::text[])`);
  }
  if (query.amenities.length) {
    const keys = param(query.amenities);
    clauses.push(`(
      public.stay_amenity_keys(p.amenities) @> ${keys}::text[]
      or exists (
        select 1 from public.stay_room_types rt2
         where rt2.property_id = p.id
           and rt2.is_active
           and public.stay_amenity_keys(rt2.amenities) @> ${keys}::text[]
      )
    )`);
  }
  if (query.accessibility.length) {
    clauses.push(`public.stay_accessibility_keys(p.accessibility) @> ${param(query.accessibility)}::text[]`);
  }
  if (query.languages.length) {
    clauses.push(`public.stay_language_keys(p.host_languages) && ${param(query.languages)}::text[]`);
  }
  if (query.instantBook) clauses.push('p.instant_book is true');
  if (query.selfCheckIn) clauses.push('p.self_check_in is true');
  if (query.petsAllowed) clauses.push('p.pets_allowed is true');
  if (query.guestFavourite) clauses.push('p.guest_favourite is true');
  if (query.luxeVerified) clauses.push('p.luxe_verified is true');
  if (query.bedrooms) clauses.push(`greatest(p.bedrooms, coalesce(stats.max_bedrooms, 0)) >= ${param(query.bedrooms)}`);
  if (query.beds) clauses.push(`greatest(p.beds, coalesce(stats.max_beds, 0)) >= ${param(query.beds)}`);
  if (query.bathrooms) clauses.push(`greatest(p.bathrooms, coalesce(stats.max_bathrooms, 0)) >= ${param(query.bathrooms)}`);
  if (query.guests !== null) {
    clauses.push(`(
      coalesce(stats.max_guests, 0) >= ${guests}
      or p.max_guests >= ${guests}
      or (coalesce(stats.room_count, 0) = 0 and p.max_guests = 0)
    )`);
  }
  if (query.minPrice !== null || query.maxPrice !== null) {
    const basis = query.priceBasis === 'total' ? Math.max(1, query.nights || 1) : 1;
    if (query.minPrice !== null) {
      clauses.push(`(coalesce(stats.min_price_paise, p.base_price_paise) * ${basis}) >= ${param(query.minPrice * 100)}`);
    }
    if (query.maxPrice !== null) {
      clauses.push(`(coalesce(stats.min_price_paise, p.base_price_paise) * ${basis}) <= ${param(query.maxPrice * 100)}`);
    }
  }
  if (query.checkIn && query.checkOut && !query.includeUnavailable) {
    clauses.push('coalesce(av.available_units, 0) > 0');
  }
  if (query.listingIds.length) {
    clauses.push(`p.listing_id = any(${param(query.listingIds)}::text[])`);
  }
  if (options.excludeDemo) {
    clauses.push(`coalesce(l.payload->>'demo', 'false') <> 'true'`);
  }

  const orderBy = query.sort === 'price_asc'
    ? 'nightly_price_paise asc nulls last, name asc'
    : query.sort === 'price_desc'
      ? 'nightly_price_paise desc nulls last, name asc'
      : query.sort === 'rating'
        ? 'rating desc nulls last, review_count desc, name asc'
        : 'guest_favourite desc, rating desc nulls last, nightly_price_paise asc nulls last, name asc';

  const sql = `
    with base as (
      select
        p.id, p.listing_id, p.name, p.property_type, p.place_type, p.city, p.area, p.address,
        p.description, p.latitude, p.longitude, p.check_in_time, p.check_out_time, p.tax_percent,
        p.bedrooms, p.beds, p.bathrooms, p.max_guests, p.instant_book, p.self_check_in,
        p.pets_allowed, p.guest_favourite, p.luxe_verified, p.host_languages, p.accessibility,
        p.cancellation_policy, p.cancellation_free_hours, p.amenities,
        p.cleaning_fee_paise, p.service_fee_bps, p.owner_user_id as host_id,
        public.stay_accessibility_keys(p.accessibility) as accessibility_keys,
        public.stay_language_keys(p.host_languages) as language_keys,
        l.title as listing_title, l.price as listing_price, l.price_unit, l.payload,
        host.full_name as host_name, host.avatar_url as host_avatar_url,
        stats.min_price_paise, stats.room_count, stats.room_types,
        stats.max_guests, stats.max_bedrooms, stats.max_beds, stats.max_bathrooms,
        coalesce(stats.min_price_paise, p.base_price_paise) as nightly_price_paise,
        av.available_units, av.min_available_price_paise,
        rev.rating, rev.review_count
      from public.stay_properties p
      join public.listings l on l.id = p.listing_id and l.status = 'active' and p.is_active is true
        and l.is_verified is true and l.verified_by is not null
        and l.payload->>'stayLifecycle' = 'approved'
      join public.public_provider_profile_projection host on host.id = p.owner_user_id and host.verified is true
      left join lateral (
        select
          min(rt.base_price_paise) as min_price_paise,
          max(rt.max_adults + rt.max_children) as max_guests,
          max(rt.bedrooms) as max_bedrooms,
          max(rt.beds) as max_beds,
          max(rt.bathrooms) as max_bathrooms,
          count(*)::int as room_count,
          json_agg(json_build_object(
            'id', rt.id,
            'name', rt.name,
            'maxAdults', rt.max_adults,
            'maxChildren', rt.max_children,
            'availableUnits', case
              when ${checkIn} is not null and ${checkOut} is not null
                and (${guests} is null or (rt.max_adults + rt.max_children) >= ${guests})
              then (select count(*)::int from public.stay_availability(rt.id, ${checkIn}, ${checkOut}))
              else null
            end,
            'basePricePaise', rt.base_price_paise,
            'amenities', rt.amenities,
            'bedrooms', rt.bedrooms,
            'beds', rt.beds,
            'bathrooms', rt.bathrooms
          ) order by rt.base_price_paise) as room_types
        from public.stay_room_types rt
        where rt.property_id = p.id and rt.is_active
      ) stats on true
      ${availability}
      left join lateral (
        select round(avg(r.rating)::numeric, 2)::float as rating, count(*)::int as review_count
        from public.reviews r
        where r.listing_id = p.listing_id
      ) rev on true
      where p.is_active
      ${clauses.length ? `and ${clauses.join('\n      and ')}` : ''}
    )
    select
      (select count(*)::int from base) as total,
      (
        select coalesce(json_agg(page), '[]'::json)
        from (
          select * from base
          order by ${orderBy}
          limit ${param(query.pageSize)} offset ${param(query.page * query.pageSize)}
        ) page
      ) as rows
  `;

  const result = await client.query(sql, values);
  const row = result.rows[0] || { total: 0, rows: [] };
  return {
    total: Number(row.total || 0),
    rows: Array.isArray(row.rows) ? row.rows : [],
  };
}

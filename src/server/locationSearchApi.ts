import type { Express, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';

export interface LocationSearchApiDeps {
  env?: NodeJS.ProcessEnv;
  pool?: Pool;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

type CatalogLocation = {
  id: number;
  name: string;
  district: string;
  state: string;
  state_code?: string;
  location_type?: string;
  kind?: string;
  mandal?: string;
  pincode?: string | null;
  latitude: number | null;
  longitude: number | null;
  is_popular?: boolean;
  aliases: string[];
  source?: string;
};

const SUGGESTION_LIMIT = 10;

type CacheEntry = { expiresAt: number; value: unknown };
const PAGE_SIZE = 20;

function labelOf(location: { name: string; district?: string; state: string }): string {
  return location.name === location.district ? `${location.name}, ${location.state}` : `${location.name}, ${location.district || location.name}, ${location.state}`;
}

const MAX_OFFSET = 10_000;
const MAX_CACHE_ITEMS = 64;
const CATALOG_CACHE_MS = 60_000;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_MIN_INTERVAL_MS = 1000;
const NOMINATIM_CACHE_MS = 30 * 60 * 1000;
const externalRequestTimes = new Map<string, number[]>();
const externalSessions = new Map<string, { ip: string; expiresAt: number }>();
const nominatimCache = new Map<string, { hits: unknown[]; expiresAt: number }>();
let nominatimLastAt = 0;

function safeJson(res: Response, status: number, code: string) {
  res.status(status).json({ ok: false, error: code });
}

function queryText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

export function locationTsQuery(value: string): string {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('en-IN');
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  return tokens.slice(0, 5).filter((token) => token.length >= 2).map((token) => `${token}:*`).join(' & ');
}

function boundedInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

function locationDto(row: CatalogLocation) {
  const kind = String(row.kind || row.location_type || 'city');
  const lat = row.latitude == null ? null : Number(row.latitude);
  const lng = row.longitude == null ? null : Number(row.longitude);
  const pincode = row.pincode ? String(row.pincode) : null;
  const mandal = String(row.mandal || '');
  return {
    id: row.id,
    name: row.name,
    district: row.district,
    state: row.state,
    stateCode: row.state_code || '',
    type: kind,
    kind,
    mandal,
    pincode,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    popular: Boolean(row.is_popular),
    aliases: row.aliases || [],
    label: kind === 'pincode' && pincode
      ? `${row.name} · PIN ${pincode}, ${row.state}`
      : mandal && kind === 'village'
        ? `${row.name}, ${mandal}, ${row.district}, ${row.state}`
        : labelOf({ name: row.name, district: row.district || row.name, state: row.state }),
    source: row.source || 'directory',
  };
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 120) : '';
}

function allowExternalRequest(ip: string, now: number): boolean {
  const recent = (externalRequestTimes.get(ip) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 12) return false;
  recent.push(now);
  externalRequestTimes.set(ip, recent);
  if (externalRequestTimes.size > 5_000) {
    for (const [key, values] of externalRequestTimes) {
      if (!values.some((time) => now - time < 60_000)) externalRequestTimes.delete(key);
    }
  }
  return true;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function componentName(components: any[], wanted: string): string | null {
  const match = components.find((component) => Array.isArray(component.types) && component.types.includes(wanted));
  return typeof match?.longText === 'string' ? match.longText : null;
}

export function registerLocationSearchApi(app: Express, deps: LocationSearchApiDeps = {}): void {
  const env = deps.env || process.env;
  const now = deps.now || Date.now;
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  if (connectionString) assertPostgresConnectionTarget(connectionString, env);
  const pool = deps.pool || (connectionString ? getSharedPostgresPool(connectionString, env) : null);
  const cache = new Map<string, CacheEntry>();
  const googleApiKey = String(env.GOOGLE_MAPS_PLACES_API_KEY || '').trim();
  const googleTermsReady = env.BOS_GOOGLE_MAPS_TERMS_READY === 'true';
  const fetchImpl = deps.fetchImpl || fetch;

  const geocodeIndia = async (query: string): Promise<ReturnType<typeof locationDto>[]> => {
    const key = query.trim().toLowerCase();
    const cachedGeo = nominatimCache.get(key);
    if (cachedGeo && cachedGeo.expiresAt > now()) return cachedGeo.hits as ReturnType<typeof locationDto>[];
    if (cachedGeo) nominatimCache.delete(key);
    if (now() - nominatimLastAt < NOMINATIM_MIN_INTERVAL_MS) return [];
    nominatimLastAt = now();
    const url = new URL(NOMINATIM_URL);
    if (/^[1-9][0-9]{5}$/.test(query.trim())) {
      url.searchParams.set('postalcode', query.trim());
      url.searchParams.set('country', 'India');
    } else {
      url.searchParams.set('q', `${query}, India`);
    }
    url.searchParams.set('countrycodes', 'in');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '5');
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BookOurSpace/1.0 (india-location-search; nominatim-fallback)',
        },
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) return [];
      const payload = await response.json();
      if (!Array.isArray(payload)) return [];
      const hits = payload.flatMap((entry: any, index: number) => {
        const address = entry?.address && typeof entry.address === 'object' ? entry.address : {};
        const countryCode = String(address.country_code || '').toLowerCase();
        if (countryCode && countryCode !== 'in') return [];
        const name = String(entry.display_name || '').split(',')[0]?.trim();
        const lat = Number(entry.lat);
        const lng = Number(entry.lon);
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
        const state = String(address.state || address.region || 'India').trim();
        const district = String(address.state_district || address.county || address.city_district || name).trim();
        const pincode = String(address.postcode || '').trim();
        return [locationDto({
          id: -1 - index,
          name,
          district,
          state,
          state_code: '',
          location_type: 'city',
          kind: 'city',
          mandal: '',
          pincode: /^[1-9][0-9]{5}$/.test(pincode) ? pincode : null,
          latitude: lat,
          longitude: lng,
          is_popular: false,
          aliases: [],
          source: 'geocode',
        })];
      }).slice(0, SUGGESTION_LIMIT);
      nominatimCache.set(key, { hits, expiresAt: now() + NOMINATIM_CACHE_MS });
      while (nominatimCache.size > MAX_CACHE_ITEMS) nominatimCache.delete(nominatimCache.keys().next().value!);
      return hits;
    } catch {
      return [];
    }
  };

  const withServiceRole = async <T>(run: (client: PoolClient) => Promise<T>, timeoutMs = 700): Promise<T> => {
    if (!pool) throw new Error('LOCATION_DATABASE_UNAVAILABLE');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query("select set_config('statement_timeout', $1, true)", [`${timeoutMs}ms`]);
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  };


  const cached = async <T>(key: string, load: () => Promise<T>): Promise<{ value: T; hit: boolean }> => {
    const t = now();
    const item = cache.get(key);
    if (item && item.expiresAt > t) {
      cache.delete(key);
      cache.set(key, item);
      return { value: item.value as T, hit: true };
    }
    if (item) cache.delete(key);
    const value = await load();
    cache.set(key, { expiresAt: t + CATALOG_CACHE_MS, value });
    while (cache.size > MAX_CACHE_ITEMS) cache.delete(cache.keys().next().value!);
    return { value, hit: false };
  };

  const unavailable = (_req: Request, res: Response) => safeJson(res, 503, 'LOCATION_CATALOG_UNAVAILABLE');
  const catalogRoute = (path: string, keyOf: (req: Request) => string, load: (req: Request) => Promise<unknown>) => {
    const handler = async (req: Request, res: Response) => {
      if (!pool) return unavailable(req, res);
      const key = `${path}:${keyOf(req)}`;
      try {
        const result = await cached(key, () => load(req));
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
        res.setHeader('X-Location-Cache', result.hit ? 'HIT' : 'MISS');
        res.json(result.value);
      } catch (error) {
        if (env.NODE_ENV === 'test') console.error('[location-search-test-error]', error);
        safeJson(res, 503, 'LOCATION_CATALOG_UNAVAILABLE');
      }
    };
    app.get(path, handler);
  };

  catalogRoute('/api/locations/popular', () => 'v1', async () => {
    const rows = await withServiceRole(async (client) => (await client.query<CatalogLocation>(
      `select id, name, district, state, state_code, location_type, latitude, longitude, is_popular, aliases
         from public.india_locations where is_popular order by normalized_name, id limit 8`,
    )).rows);
    return { ok: true, locations: rows.map(locationDto) };
  });

  catalogRoute('/api/locations/states', () => 'v1', async () => {
    const result = await withServiceRole((client) => client.query(
      `select state as name, state_code as code, count(distinct normalized_district)::integer as district_count
         from public.india_locations group by state, state_code order by lower(state), state_code`,
    ));
    return { ok: true, states: result.rows.map((row) => ({ name: row.name, code: row.code, districts: Number(row.district_count) })) };
  });

  catalogRoute('/api/locations/districts', (req) => normalizeName(req.query.state).toLocaleLowerCase('en-IN'), async (req) => {
    const state = normalizeName(req.query.state);
    if (!state) return { ok: false, error: 'STATE_REQUIRED', districts: [] };
    const result = await withServiceRole((client) => client.query(
      `select district as name, count(*)::integer as location_count
         from public.india_locations where normalized_state = lower($1)
        group by district, normalized_district order by normalized_district`, [state],
    ));
    return { ok: true, districts: result.rows.map((row) => ({ name: row.name, locations: Number(row.location_count) })) };
  });

  catalogRoute('/api/locations/search', (req) => JSON.stringify([
    queryText(req.query.q).toLocaleLowerCase('en-IN'), normalizeName(req.query.state).toLocaleLowerCase('en-IN'),
    normalizeName(req.query.district).toLocaleLowerCase('en-IN'), boundedInt(req.query.offset, 0, MAX_OFFSET),
  ]), async (req) => {
    const q = queryText(req.query.q);
    const tsQuery = locationTsQuery(q);
    const state = normalizeName(req.query.state);
    const district = normalizeName(req.query.district);
    const offset = boundedInt(req.query.offset, 0, MAX_OFFSET);
    const suggestionMode = Boolean(q) && !state && !district && offset === 0;

    if (suggestionMode) {
      try {
        const ranked = await withServiceRole(async (client) => (await client.query(
          `select id, kind, name, state, district, mandal, pincode, lat as latitude, lng as longitude, aliases
             from public.search_india_locations($1, $2)`,
          [q, SUGGESTION_LIMIT],
        )).rows, 1500);
      if (ranked.length > 0) {
          return {
            ok: true,
            locations: ranked.map((row) => locationDto({
              id: Number(row.id),
              name: String(row.name),
              district: String(row.district || ''),
              state: String(row.state || ''),
              kind: String(row.kind || 'city'),
              location_type: String(row.kind || 'city'),
              mandal: String(row.mandal || ''),
              pincode: row.pincode ? String(row.pincode) : null,
              latitude: row.latitude == null ? null : Number(row.latitude),
              longitude: row.longitude == null ? null : Number(row.longitude),
              aliases: Array.isArray(row.aliases) ? row.aliases : [],
              source: 'directory',
            })),
            nextOffset: null,
          };
        }
      } catch {
        /* Use the indexed local catalog; external search is an explicit user action. */
      }
    }

    if (!tsQuery && !state && !district) return { ok: true, locations: [], nextOffset: null };

    const pageLimit = suggestionMode ? SUGGESTION_LIMIT : PAGE_SIZE;
    const result = await withServiceRole((client) => client.query<CatalogLocation>(
      `select id, name, district, state, state_code, location_type, kind, mandal, pincode,
              latitude, longitude, is_popular, aliases, source
         from public.india_locations
        where ($1::text = '' or search_document @@ to_tsquery('simple', $1))
          and ($2::text = '' or normalized_state = lower($2))
          and ($3::text = '' or normalized_district = lower($3))
        order by case when $4::text <> '' and normalized_name like $4 || '%' then 0 else 1 end,
                 ts_rank_cd(search_document, nullif($1, '')::tsquery) desc nulls last,
                 normalized_name, id
        limit $5 offset $6`,
      [tsQuery, state, district, q.toLocaleLowerCase('en-IN'), pageLimit + 1, offset],
    ), suggestionMode ? 1500 : 700);
    const hasMore = result.rows.length > pageLimit;
    const rows = result.rows.slice(0, pageLimit).map((row) => locationDto({ ...row, source: row.source || 'directory' }));
    if (suggestionMode && rows.length === 0) {
      return { ok: true, locations: await geocodeIndia(q), nextOffset: null };
    }
    return { ok: true, locations: rows, nextOffset: hasMore ? offset + pageLimit : null };
  });

  app.post('/api/locations/nearest', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const lat = Number(req.body?.latitude);
    const lng = Number(req.body?.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return safeJson(res, 400, 'LOCATION_COORDINATES_INVALID');
    }
    if (!pool) return unavailable(req, res);
    try {
      const candidates = await withServiceRole(async (client) => (await client.query<CatalogLocation>(
        `select id, name, district, state, state_code, location_type, latitude, longitude, is_popular, aliases
           from public.india_locations order by coordinates <-> point($1, $2) limit 20`, [lng, lat],
      )).rows);
      const nearest = candidates.map((row) => ({ row, distance: haversineKm(lat, lng, Number(row.latitude), Number(row.longitude)) }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (!nearest) return safeJson(res, 404, 'LOCATION_CATALOG_EMPTY');
      // Coordinates are used only for this lookup and are not logged or cached.
      return res.json({ ok: true, location: locationDto(nearest.row) });
    } catch {
      return safeJson(res, 503, 'LOCATION_CATALOG_UNAVAILABLE');
    }
  });

  app.post('/api/locations/external/autocomplete', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const input = normalizeName(req.body?.input);
    const sessionToken = String(req.body?.sessionToken || '');
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown').slice(0, 100);
    if (input.length < 3 || input.length > 120 || !/^[0-9a-f-]{36}$/i.test(sessionToken)) return safeJson(res, 400, 'EXTERNAL_LOCATION_QUERY_INVALID');
    if (!allowExternalRequest(ip, now())) return safeJson(res, 429, 'EXTERNAL_LOCATION_RATE_LIMITED');
    if (!googleApiKey || !googleTermsReady) return safeJson(res, 503, 'EXTERNAL_LOCATION_PROVIDER_NOT_CONFIGURED');
    try {
      const response = await fetchImpl('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googleApiKey,
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
        },
        body: JSON.stringify({ input, includedRegionCodes: ['in'], languageCode: 'en', sessionToken }),
        signal: AbortSignal.timeout(4_000),
      });
      if (!response.ok) return safeJson(res, 502, 'EXTERNAL_LOCATION_LOOKUP_FAILED');
      const payload = await response.json() as any;
      const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
      const places = suggestions.flatMap((entry: any) => {
        const item = entry?.placePrediction;
        const placeId = typeof item?.placeId === 'string' ? item.placeId : '';
        const text = typeof item?.text?.text === 'string' ? item.text.text : '';
        const mainText = typeof item?.structuredFormat?.mainText?.text === 'string' ? item.structuredFormat.mainText.text : text;
        const secondaryText = typeof item?.structuredFormat?.secondaryText?.text === 'string' ? item.structuredFormat.secondaryText.text : '';
        return placeId && text ? [{ placeId, text, mainText, secondaryText }] : [];
      }).slice(0, 5);
      externalSessions.set(sessionToken, { ip, expiresAt: now() + 5 * 60_000 });
      while (externalSessions.size > 2_000) externalSessions.delete(externalSessions.keys().next().value!);
      return res.json({ ok: true, provider: 'google_maps', places });
    } catch {
      return safeJson(res, 502, 'EXTERNAL_LOCATION_LOOKUP_FAILED');
    }
  });

  app.post('/api/locations/external/resolve', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const placeId = String(req.body?.placeId || '').trim();
    const sessionToken = String(req.body?.sessionToken || '');
    if (!/^[A-Za-z0-9_-]{5,200}$/.test(placeId) || !/^[0-9a-f-]{36}$/i.test(sessionToken)) return safeJson(res, 400, 'EXTERNAL_LOCATION_PLACE_INVALID');
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown').slice(0, 100);
    if (!allowExternalRequest(ip, now())) return safeJson(res, 429, 'EXTERNAL_LOCATION_RATE_LIMITED');
    const session = externalSessions.get(sessionToken);
    if (!session || session.ip !== ip || session.expiresAt <= now()) return safeJson(res, 400, 'EXTERNAL_LOCATION_SESSION_INVALID');
    externalSessions.delete(sessionToken);
    if (!googleApiKey || !googleTermsReady) return safeJson(res, 503, 'EXTERNAL_LOCATION_PROVIDER_NOT_CONFIGURED');
    try {
      const response = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`, {
        headers: {
          'X-Goog-Api-Key': googleApiKey,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents',
        },
        signal: AbortSignal.timeout(4_000),
      });
      if (!response.ok) return safeJson(res, 502, 'EXTERNAL_LOCATION_LOOKUP_FAILED');
      const place = await response.json() as any;
      const latitude = Number(place?.location?.latitude);
      const longitude = Number(place?.location?.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return safeJson(res, 502, 'EXTERNAL_LOCATION_RESULT_INVALID');
      }
      const components = Array.isArray(place?.addressComponents) ? place.addressComponents : [];
      const locality = componentName(components, 'locality') || componentName(components, 'sublocality_level_1') || place?.displayName?.text || '';
      const district = componentName(components, 'administrative_area_level_2') || locality;
      const state = componentName(components, 'administrative_area_level_1') || 'India';
      // Google Maps content is ephemeral here: no server/browser cache, recent
      // history, or durable app storage. The client must show Google Maps attribution.
      return res.json({
        ok: true,
        provider: 'google_maps',
        location: {
          city: locality,
          area: district,
          state,
          label: String(place?.formattedAddress || locality),
          lat: latitude,
          lng: longitude,
          placeId: String(place?.id || placeId),
          source: 'external',
        },
      });
    } catch {
      return safeJson(res, 502, 'EXTERNAL_LOCATION_LOOKUP_FAILED');
    }
  });
}

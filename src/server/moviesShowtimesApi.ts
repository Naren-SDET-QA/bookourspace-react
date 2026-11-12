import type express from 'express';
import type { Pool } from 'pg';

type SessionClaims = {
  userId?: string;
  supabaseUserId?: string;
  role?: 'customer' | 'provider' | 'admin';
};

type Deps = {
  pool?: Pool;
  verifySession: (req: express.Request) => SessionClaims | null;
  env: NodeJS.ProcessEnv;
};

const TIME_PATTERN = /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM)$/i;

function text(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

function showtimes(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const times = value.map((item) => String(item || '').trim()).filter(Boolean);
  if (times.length === 0 || times.length > 20) return null;
  if (times.some((time) => !TIME_PATTERN.test(time))) return null;
  return times;
}

export type MovieSchemaCapabilities = { approvalStatus: boolean; state: boolean };

const CAPABILITY_CACHE = new WeakMap<Pool, Promise<MovieSchemaCapabilities>>();

/**
 * The Movies state/approval columns arrive with
 * 20261112330000_movies_state_approval.sql. Until that migration is applied the
 * read path must not filter on columns that do not exist, or a public showtimes
 * request fails with 42703.
 */
export function movieSchemaCapabilities(pool: Pool): Promise<MovieSchemaCapabilities> {
  const cached = CAPABILITY_CACHE.get(pool);
  if (cached) return cached;
  const pending = pool
    .query(
      `select
          bool_or(column_name = 'approval_status') as approval_status,
          bool_or(column_name = 'state') as state
         from information_schema.columns
        where table_schema = 'public' and table_name = 'cinema_screens'
          and column_name in ('approval_status', 'state')`,
    )
    .then(({ rows }) => ({
      approvalStatus: rows[0]?.approval_status === true,
      state: rows[0]?.state === true,
    }))
    .catch(() => ({ approvalStatus: false, state: false }));
  CAPABILITY_CACHE.set(pool, pending);
  return pending;
}

export function buildShowtimeFilters(
  capabilities: MovieSchemaCapabilities,
  options: {
    includeHidden: boolean;
    state?: string | null;
    city?: string | null;
    area?: string | null;
    pincode?: string | null;
    providerUserId?: string | null;
  },
): { clauses: string[]; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (!options.includeHidden) {
    if (capabilities.approvalStatus) clauses.push("approval_status = 'approved'");
    clauses.push('is_visible is true');
    clauses.push("btrim(coalesce(movie_title, '')) <> ''");
    clauses.push("btrim(coalesce(cinema_title, '')) <> ''");
    clauses.push('show_date = current_date');
    clauses.push('jsonb_array_length(showtimes) > 0');
  }
  if (capabilities.state && options.state && options.state !== 'All states') {
    values.push(options.state);
    clauses.push(`state = $${values.length}`);
  }
  if (options.city && options.city.toLowerCase() !== 'all cities' && options.city.toLowerCase() !== 'all locations') {
    values.push(options.city);
    clauses.push(`lower(city) = lower($${values.length})`);
  }
  if (options.includeHidden && options.providerUserId) {
    values.push(options.providerUserId);
    clauses.push(`cinema_listing_id in (select id from public.listings where owner_id = $${values.length}::uuid)`);
  }
  if (options.area) {
    values.push(`%${options.area}%`);
    clauses.push(`area ilike $${values.length}`);
  }
  if (options.pincode) {
    values.push(options.pincode);
    clauses.push(`pincode = $${values.length}`);
  }
  return { clauses, values };
}

function mapRow(row: Record<string, any>, capabilities: MovieSchemaCapabilities = { approvalStatus: true, state: true }) {
  return {
    id: String(row.id),
    screenId: String(row.id),
    cinemaListingId: row.cinema_listing_id,
    cinemaTitle: row.cinema_title,
    cinemaName: row.cinema_title,
    movieTitle: row.movie_title || null,
    movieId: row.movie_id || null,
    showDate: row.show_date ? String(row.show_date).slice(0, 10) : null,
    screenName: row.screen_name,
    city: row.city || null,
    state: capabilities.state ? row.state || null : null,
    area: row.area || null,
    pincode: row.pincode || null,
    showtimes: Array.isArray(row.showtimes) ? row.showtimes : [],
    format: row.format,
    soundSystem: row.sound_system,
    isVisible: row.is_visible === true,
    approvalStatus: row.approval_status || (capabilities.approvalStatus ? 'pending' : 'approved'),
    updatedAt: row.updated_at,
    syncedAt: row.showtimes_synced_at || null,
    source: row.showtime_source || null,
  };
}

export function registerMoviesShowtimesApi(app: express.Express, deps: Deps): void {
  const unavailable = (res: express.Response) =>
    res.status(503).json({ ok: false, error: 'MOVIES_SHOWTIMES_UNAVAILABLE', message: 'Showtimes require the PostgreSQL cinema repository.' });

  app.get('/api/movies/showtimes', async (req, res) => {
    if (!deps.pool) return unavailable(res);
    const claims = deps.verifySession(req);
    const isAdmin = claims?.role === 'admin';
    const includeHidden = (isAdmin || claims?.role === 'provider') && String(req.query.includeHidden || '') === '1';
    const capabilities = await movieSchemaCapabilities(deps.pool);
    const { clauses, values } = buildShowtimeFilters(capabilities, {
      includeHidden,
      state: text(req.query.state, 40),
      city: text(req.query.city, 80),
      area: text(req.query.area, 120),
      pincode: text(req.query.pin, 10),
      providerUserId: includeHidden && claims?.role === 'provider'
        ? claims.supabaseUserId || claims.userId || ''
        : null,
    });
    try {
      const { rows } = await deps.pool.query(
        `select * from public.cinema_screens
          ${clauses.length ? `where ${clauses.join(' and ')}` : ''}
          order by movie_title nulls last, cinema_title asc, screen_name asc, id asc`,
        values,
      );
      const screens = rows.map((row) => mapRow(row, capabilities));
      const movies = Array.from(new Set(screens.map((screen) => screen.movieTitle).filter(Boolean) as string[]));
      const lastUpdated = rows.reduce<string | null>((latest, row) => {
        const value = row.updated_at ? new Date(row.updated_at).toISOString() : null;
        return value && (!latest || value > latest) ? value : latest;
      }, null);
      res.setHeader('cache-control', 'no-store');
      res.json({ ok: true, screens, movies, count: screens.length, lastUpdated, checkedAt: new Date().toISOString() });
    } catch {
      unavailable(res);
    }
  });

  app.put('/api/movies/showtimes/:screenId', async (req, res) => {
    if (!deps.pool) return unavailable(res);
    const claims = deps.verifySession(req);
    if (!claims) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
    if (claims.role !== 'admin' && claims.role !== 'provider') {
      return res.status(403).json({ ok: false, error: 'ADMIN_OR_THEATRE_OWNER_REQUIRED' });
    }
    const writeCapabilities = await movieSchemaCapabilities(deps.pool);
    if (!writeCapabilities.approvalStatus || !writeCapabilities.state) {
      return res.status(503).json({
        ok: false,
        error: 'MOVIES_APPROVAL_MIGRATION_REQUIRED',
        message: 'The Movies state and approval migration must be applied before showtimes can be edited.',
      });
    }
    const screenId = String(req.params.screenId || '').trim();
    if (!screenId) return res.status(400).json({ ok: false, error: 'SCREEN_ID_REQUIRED' });
    const businessId = String(req.header('x-business-id') || '').trim();
    if (claims.role === 'provider' && businessId) {
      const scoped = await deps.pool.query(
        `select 1 from public.cinema_screens s join public.listings l on l.id=s.cinema_listing_id
          where s.id=$1 and l.owner_id=$2 and l.business_id=$3 limit 1`,
        [screenId, claims.supabaseUserId || claims.userId, businessId],
      );
      if (scoped.rowCount === 0) return res.status(403).json({ ok: false, error: 'SCREEN_BUSINESS_ACCESS_DENIED' });
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const nextShowtimes = body.showtimes === undefined ? null : showtimes(body.showtimes);
    if (body.showtimes === undefined || !nextShowtimes) {
      return res.status(400).json({ ok: false, error: 'INVALID_SHOWTIMES', message: 'At least one 12-hour showtime such as 10:30 AM is required.' });
    }
    const nextMovieTitle = text(body.movieTitle, 160);
    if (!nextMovieTitle) {
      return res.status(400).json({ ok: false, error: 'MOVIE_TITLE_REQUIRED', message: 'A real movie title is required.' });
    }
    const nextShowDate = text(body.showDate, 10);
    if (!nextShowDate || !/^\d{4}-\d{2}-\d{2}$/.test(nextShowDate) || Number.isNaN(Date.parse(nextShowDate))) {
      return res.status(400).json({ ok: false, error: 'SHOW_DATE_REQUIRED', message: 'A valid show date (YYYY-MM-DD) is required.' });
    }
    const isVisible = typeof body.isVisible === 'boolean' ? body.isVisible : null;
    try {
      let existingApproval = 'pending';
      if (claims.role === 'provider') {
        const current = await deps.pool.query('select approval_status from public.cinema_screens where id=$1 limit 1', [screenId]);
        existingApproval = String(current.rows[0]?.approval_status || 'pending');
      }
      if (claims.role === 'provider') {
        const owner = await deps.pool.query(
          `select 1 from public.live_edit_cinema_screen_owners where screen_id = $1 and owner_user_id = $2
           union
           select 1 from public.listings l join public.cinema_screens s on s.cinema_listing_id = l.id
            where s.id = $1 and l.owner_id = $2
           limit 1`,
          [screenId, claims.userId],
        );
        if (owner.rowCount === 0) {
          return res.status(403).json({ ok: false, error: 'SCREEN_OWNER_REQUIRED', message: 'Only this theatre owner can edit its showtimes.' });
        }
      }
      const { rows } = await deps.pool.query(
        `update public.cinema_screens set
           movie_title = $2,
           movie_id = coalesce($3, movie_id),
           city = coalesce($4, city),
           area = coalesce($5, area),
           pincode = coalesce($6, pincode),
           state = coalesce($9, state),
           show_date = $7::date,
           showtimes = $8::jsonb,
           is_visible = case when $10 then coalesce($9, is_visible) else false end,
           showtime_source = 'manual',
           updated_at = now()
         where id = $1
         returning *`,
        [
          screenId,
          nextMovieTitle,
          text(body.movieId, 160),
          text(body.city, 80),
          text(body.area, 120),
          text(body.pincode, 10),
          nextShowDate,
          JSON.stringify(nextShowtimes),
          text(body.state, 40),
          claims.role === 'admin' || (existingApproval === 'approved' && isVisible !== false),
        ],
      );
      if (!rows[0]) return res.status(404).json({ ok: false, error: 'SCREEN_NOT_FOUND' });
      res.json({ ok: true, screen: mapRow(rows[0]) });
    } catch {
      res.status(500).json({ ok: false, error: 'SHOWTIME_UPDATE_FAILED' });
    }
  });

  app.patch('/api/admin/movies/theatres/:screenId/approval', async (req, res) => {
    if (!deps.pool) return unavailable(res);
    const claims = deps.verifySession(req);
    if (claims?.role !== 'admin') return res.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
    const approvalCapabilities = await movieSchemaCapabilities(deps.pool);
    if (!approvalCapabilities.approvalStatus) {
      return res.status(503).json({
        ok: false,
        error: 'MOVIES_APPROVAL_MIGRATION_REQUIRED',
        message: 'The Movies state and approval migration must be applied before approvals can be recorded.',
      });
    }
    const status = String(req.body?.status || '');
    if (!['pending','approved','disabled'].includes(status)) return res.status(400).json({ ok: false, error: 'INVALID_APPROVAL_STATUS' });
    try {
      const { rows } = await deps.pool.query(
        `update public.cinema_screens set approval_status=$2, is_visible=($2='approved'), updated_at=now() where id=$1 returning *`,
        [String(req.params.screenId || ''), status],
      );
      if (!rows[0]) return res.status(404).json({ ok: false, error: 'SCREEN_NOT_FOUND' });
      res.json({ ok: true, screen: mapRow(rows[0]) });
    } catch { res.status(500).json({ ok: false, error: 'APPROVAL_UPDATE_FAILED' }); }
  });

  app.post('/api/movies/showtimes/sync', async (req, res) => {
    if (!deps.pool) return unavailable(res);
    const claims = deps.verifySession(req);
    if (claims?.role !== 'admin') return res.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
    const syncCapabilities = await movieSchemaCapabilities(deps.pool);
    if (!syncCapabilities.approvalStatus || !syncCapabilities.state) {
      return res.status(503).json({
        ok: false,
        error: 'MOVIES_APPROVAL_MIGRATION_REQUIRED',
        message: 'The Movies state and approval migration must be applied before showtimes can be synced.',
      });
    }
    const expected = String(deps.env.BOS_MOVIES_SYNC_TOKEN || '').trim();
    if (expected.length < 16) {
      return res.status(503).json({
        ok: false,
        error: 'MOVIES_SYNC_NOT_CONFIGURED',
        message: 'Daily showtime sync is not configured. Set an authorized sync token and provider before enabling it.',
      });
    }
    const provided = String(req.headers['x-bos-sync-token'] || '').trim();
    if (provided !== expected) return res.status(401).json({ ok: false, error: 'INVALID_SYNC_TOKEN' });
    const screens = Array.isArray(req.body?.screens) ? req.body.screens : [];
    if (screens.length === 0 || screens.length > 500) {
      return res.status(400).json({ ok: false, error: 'INVALID_SYNC_PAYLOAD' });
    }
    let applied = 0;
    try {
      for (const raw of screens) {
        const id = text(raw?.screenId ?? raw?.id, 160);
        const cinemaListingId = text(raw?.cinemaListingId, 160);
        const cinemaTitle = text(raw?.cinemaTitle, 160);
        const screenName = text(raw?.screenName, 160);
        const times = showtimes(raw?.showtimes);
        const movieTitle = text(raw?.movieTitle, 160);
        const showDate = text(raw?.showDate, 10);
        if (!id || !cinemaListingId || !cinemaTitle || !screenName || !times || !movieTitle || !showDate || !/^\d{4}-\d{2}-\d{2}$/.test(showDate)) continue;
        await deps.pool.query(
          `insert into public.cinema_screens
             (id, cinema_listing_id, cinema_title, screen_name, movie_title, movie_id, city, state, area, pincode, show_date, showtimes, is_visible, approval_status, showtime_source, showtimes_synced_at, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$13,$8,$9,$10::date,$11::jsonb,coalesce($12,true),'approved','authorized_sync',now(),now())
           on conflict (id) do update set
             movie_title = excluded.movie_title,
             movie_id = excluded.movie_id,
             city = excluded.city,
             area = excluded.area,
             pincode = excluded.pincode,
             state = excluded.state,
             show_date = excluded.show_date,
             approval_status = 'approved',
             showtimes = excluded.showtimes,
             is_visible = excluded.is_visible,
             showtime_source = 'authorized_sync',
             showtimes_synced_at = now(),
             updated_at = now()`,
          [
            id, cinemaListingId, cinemaTitle, screenName,
            movieTitle, text(raw?.movieId, 160),
            text(raw?.city, 80), text(raw?.area, 120), text(raw?.pincode, 10),
            showDate, JSON.stringify(times), text(raw?.state, 40),
            typeof raw?.isVisible === 'boolean' ? raw.isVisible : true,
          ],
        );
        applied += 1;
      }
      res.json({ ok: true, applied, rejected: screens.length - applied });
    } catch {
      res.status(500).json({ ok: false, error: 'MOVIES_SYNC_FAILED' });
    }
  });
}

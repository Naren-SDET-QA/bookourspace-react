import type express from 'express';
import { type PoolClient } from 'pg';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['approve', 'reject', 'request_changes', 'suspend', 'reactivate']);

export interface StayAdminApiDeps {
  verifySession: (request: express.Request) => any | null;
  env?: NodeJS.ProcessEnv;
}

function bad(res: express.Response, status: number, error: string, message?: string) {
  res.status(status).json({ ok: false, error, ...(message ? { message } : {}) });
}

export function registerStayAdminApi(app: express.Express, deps: StayAdminApiDeps): void {
  const env = deps.env || process.env;
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  if (connectionString) assertPostgresConnectionTarget(connectionString, env);
  if (!connectionString) {
    const unavailable = (_req: express.Request, res: express.Response) => bad(res, 503, 'STAY_ADMIN_DATABASE_UNAVAILABLE');
    app.get('/api/stays/admin/listings', unavailable);
    app.get('/api/stays/admin/listings/:listingId/audit', unavailable);
    app.post('/api/stays/admin/listings/:listingId/review', unavailable);
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
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async function withServer<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Listings-database owner connection. Do not SET ROLE authenticated:
      // profiles.is_super_admin is not granted to that role, and Super Admin
      // review must write verification columns owners cannot touch.
      await client.query("select set_config('request.jwt.claim.sub', '', true)");
      await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original */ }
      throw error;
    } finally {
      client.release();
    }
  }

  function actorOf(req: express.Request, res: express.Response): string | null {
    const actor = deps.verifySession(req);
    const id = String(actor?.supabaseUserId || '');
    if (!UUID.test(id)) {
      bad(res, actor ? 403 : 401, actor ? 'VERIFIED_DATABASE_ID_REQUIRED' : 'AUTH_REQUIRED');
      return null;
    }
    return id;
  }

  async function requireAdmin(client: PoolClient, actorId: string) {
    const { rows } = await client.query(
      `select role, account_status from public.profiles where id = $1 limit 1`,
      [actorId],
    );
    if (rows[0]?.role !== 'admin' || rows[0]?.account_status !== 'active') {
      throw Object.assign(new Error('ACTIVE_ADMIN_REQUIRED'), { statusCode: 403 });
    }
    const superRow = await withServer(async (server) => {
      const result = await server.query(
        `select coalesce(is_super_admin, false) as is_super_admin from public.profiles where id = $1 limit 1`,
        [actorId],
      );
      return result.rows[0];
    });
    return { superAdmin: superRow?.is_super_admin === true };
  }

  const handle = (fn: (req: express.Request, res: express.Response, actorId: string, client: PoolClient) => Promise<unknown>) =>
    async (req: express.Request, res: express.Response) => {
      const actorId = actorOf(req, res);
      if (!actorId) return;
      try {
        await withActor(actorId, async (client) => {
          await requireAdmin(client, actorId);
          await fn(req, res, actorId, client);
        });
      } catch (error: any) {
        const status = Number(error?.statusCode);
        if (status >= 400 && status < 500) { bad(res, status, String(error.message)); return; }
        const message = String(error?.message || '');
        if (message.includes('SUPER_ADMIN_REQUIRED') || message.includes('STAY_SELF_APPROVAL_FORBIDDEN')) {
          bad(res, 403, message.includes('SELF') ? 'STAY_SELF_APPROVAL_FORBIDDEN' : 'SUPER_ADMIN_REQUIRED',
            message.includes('SELF')
              ? 'A Super Admin cannot approve a hotel they own.'
              : 'Only an active Super Admin can review hotel listings.');
          return;
        }
        if (message.includes('REVIEW_REASON_REQUIRED')) {
          bad(res, 400, 'REVIEW_REASON_REQUIRED', 'Reject, request-changes and suspend require a written reason.');
          return;
        }
        if (message.includes('STAY_NOT_SUBMITTABLE') || message.includes('STAY_NOT_ACTIVE') || message.includes('STAY_NOT_SUSPENDED')) {
          bad(res, 409, 'STAY_REVIEW_STATE_CONFLICT', 'That review action is not valid for the current listing state.');
          return;
        }
        if (error?.code === 'P0002') { bad(res, 404, 'STAY_LISTING_NOT_FOUND'); return; }
        if (error?.code === '42501') { bad(res, 403, 'STAY_REVIEW_FORBIDDEN', message); return; }
        console.error('[stay-admin] request failed', error?.code || 'NO_CODE', error?.message || '');
        bad(res, 500, 'STAY_ADMIN_REQUEST_FAILED');
      }
    };

  app.get('/api/stays/admin/listings', handle(async (req, res, actorId, client) => {
    const status = String(req.query.status || '').trim();
    const rows = await withServer(async (server) => {
      const params: unknown[] = [];
      let extra = '';
      if (status === 'queue') {
        extra = `and (
          coalesce(l.payload->>'stayLifecycle','draft') in ('submitted','changes_requested')
          or l.status = 'pending_approval'
        )`;
      } else if (status === 'suspended') {
        extra = `and (coalesce(l.payload->>'stayLifecycle','') = 'suspended' or l.status = 'expired')`;
      } else if (status === 'active') {
        extra = `and l.status = 'active'`;
      }
      const result = await server.query(
        `select l.id as listing_id, l.title, l.status, l.payload, l.owner_id, l.updated_at, l.is_verified,
                p.id as property_id, p.name, p.city, p.area, p.property_type, p.is_active, p.base_price_paise,
                owner.full_name as owner_name, owner.email as owner_email, owner.role as owner_role
           from public.listings l
           join public.stay_properties p on p.listing_id = l.id
           left join public.profiles owner on owner.id = l.owner_id
          where public.live_edit_listing_module(l.category_id, l.entity_type) = 'hotel_stay'
            ${extra}
          order by
            case coalesce(l.payload->>'stayLifecycle','')
              when 'submitted' then 0
              when 'changes_requested' then 1
              when 'draft' then 2
              when 'suspended' then 3
              else 4
            end,
            l.updated_at desc
          limit 200`,
        params,
      );
      return result.rows;
    });
    void actorId;
    void client;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, listings: rows });
  }));

  app.get('/api/stays/admin/listings/:listingId/audit', handle(async (req, res, _actorId, client) => {
    const listingId = String(req.params.listingId || '').trim();
    const { rows } = await client.query(
      `select id, action, reason, actor_user_id, actor_role, from_status, to_status,
              from_lifecycle, to_lifecycle, payload, created_at
         from public.stay_listing_review_events
        where listing_id = $1
        order by created_at desc
        limit 100`,
      [listingId],
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, listingId, events: rows });
  }));

  app.post('/api/stays/admin/listings/:listingId/review', handle(async (req, res, actorId, client) => {
    const admin = await requireAdmin(client, actorId);
    if (!admin.superAdmin) {
      throw Object.assign(new Error('SUPER_ADMIN_REQUIRED'), { statusCode: 403 });
    }
    const listingId = String(req.params.listingId || '').trim();
    const action = String(req.body?.action || '').trim();
    const reason = String(req.body?.reason || '').trim();
    const demo = req.body?.demo;
    if (!ACTIONS.has(action)) return bad(res, 400, 'INVALID_REVIEW_ACTION');
    if (['reject', 'request_changes', 'suspend'].includes(action) && reason.trim().length < 8) {
      return bad(res, 400, 'REVIEW_REASON_REQUIRED', 'Reject, request-changes and suspend require a written reason.');
    }
    const payload = await withServer(async (server) => {
      const found = await server.query(
        `select l.id, l.owner_id, l.status, l.payload, l.category_id, l.entity_type
           from public.listings l where l.id = $1 for update`,
        [listingId],
      );
      const listing = found.rows[0];
      if (!listing) throw Object.assign(new Error('STAY_LISTING_NOT_FOUND'), { statusCode: 404, code: 'P0002' });
      if (String(listing.owner_id) === actorId) {
        throw Object.assign(new Error('STAY_SELF_APPROVAL_FORBIDDEN'), { statusCode: 403 });
      }
      const life = String(listing.payload?.stayLifecycle || 'draft');
      let nextStatus = listing.status;
      let nextLife = life;
      let active = false;
      if (action === 'approve') {
        if (!['submitted', 'changes_requested', 'pending_approval'].includes(life) && listing.status !== 'pending_approval') {
          throw Object.assign(new Error('STAY_NOT_SUBMITTABLE'), { statusCode: 409 });
        }
        nextStatus = 'active'; nextLife = 'approved'; active = true;
      } else if (action === 'reject') {
        nextStatus = 'rejected'; nextLife = 'rejected';
      } else if (action === 'request_changes') {
        nextStatus = 'pending_approval'; nextLife = 'changes_requested';
      } else if (action === 'suspend') {
        nextStatus = 'expired'; nextLife = 'suspended';
      } else if (action === 'reactivate') {
        if (life !== 'suspended' && listing.status !== 'expired') {
          throw Object.assign(new Error('STAY_NOT_SUSPENDED'), { statusCode: 409 });
        }
        nextStatus = 'active'; nextLife = 'approved'; active = true;
      }
      const nextDemo = typeof demo === 'boolean' ? demo : listing.payload?.demo === true;
      const nextPayload = {
        ...(listing.payload && typeof listing.payload === 'object' ? listing.payload : {}),
        stayLifecycle: nextLife,
        demo: nextDemo,
        review: { action, reason, at: new Date().toISOString(), by: actorId },
      };
      const publish = action === 'approve' || action === 'reactivate';
      await server.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId]);
      await server.query("select set_config('bos.review_transition', 'on', true)");
      await server.query("select set_config('bos.stay_lifecycle_transition', 'on', true)");
      await server.query(
        `update public.listings
            set status = $2,
                payload = $3::jsonb,
                is_verified = $4,
                verified_at = case when $4 then now() else verified_at end,
                verified_by = case when $4 then $5::uuid else verified_by end,
                updated_at = now()
          where id = $1`,
        [listingId, nextStatus, JSON.stringify(nextPayload), publish, actorId],
      );
      await server.query(
        `update public.stay_properties set is_active = $2, updated_at = now() where listing_id = $1`,
        [listingId, active],
      );
      if (publish) {
        await server.query(
          `update public.profiles
              set role = case when role = 'customer' then 'provider' else role end,
                  verified = true,
                  updated_at = now()
            where id = $1 and account_status = 'active'`,
          [listing.owner_id],
        );
      }
      if (action === 'approve') {
        await server.query(
          `update public.provider_registration_requests
              set status = 'approved', reviewed_by = $2, reviewed_at = now(),
                  review_note = nullif($3, ''), updated_at = now()
            where user_id = $1 and provider_type = 'hotel_stay' and status = 'pending'`,
          [listing.owner_id, actorId, reason],
        );
      }
      await server.query(
        `insert into public.stay_listing_review_events
           (listing_id, action, reason, actor_user_id, actor_role, from_status, to_status, from_lifecycle, to_lifecycle, payload)
         values ($1,$2,$3,$4,'admin',$5,$6,$7,$8,'{}'::jsonb)`,
        [listingId, action, reason || null, actorId, listing.status, nextStatus, life, nextLife],
      );
      return {
        listingId, action, status: nextStatus, stayLifecycle: nextLife, propertyActive: active, ownerId: listing.owner_id,
      };
    });
    res.json({ ok: true, ...payload });
  }));
}

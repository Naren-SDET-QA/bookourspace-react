import type express from 'express';
import type { PoolClient } from 'pg';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';
import { logSafeError } from './safeLogging';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ProviderOperationsApiDeps { verifySession: (request: express.Request) => any | null; env?: NodeJS.ProcessEnv; }

const unavailable = (_request: express.Request, response: express.Response) => response.status(503).json({ ok: false, error: 'PROVIDER_PORTAL_DATABASE_UNAVAILABLE' });

export function registerProviderOperationsApi(app: express.Express, deps: ProviderOperationsApiDeps): void {
  const env = deps.env || process.env;
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  if (connectionString) assertPostgresConnectionTarget(connectionString, env);
  if (!connectionString) { app.get('/api/provider-portal/overview', unavailable); return; }
  const pool = getSharedPostgresPool(connectionString, env);

  async function withActor<T>(actorId: string, businessId: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE authenticated');
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId]);
      await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { try { await client.query('ROLLBACK'); } catch { /* preserve original */ } throw error; }
    finally { client.release(); }
  }

  app.get('/api/provider-portal/overview', async (request, response) => {
    const session = deps.verifySession(request);
    const actorId = String(session?.supabaseUserId || '');
    const businessId = String(request.header('x-business-id') || '').trim();
    if (!UUID.test(actorId)) return response.status(session ? 403 : 401).json({ ok: false, error: session ? 'VERIFIED_DATABASE_ID_REQUIRED' : 'AUTH_REQUIRED' });
    try {
      const result = await withActor(actorId, businessId, async client => {
        const profile = await client.query(`select role, account_status, full_name from public.profiles where id = $1 limit 1`, [actorId]);
        const actor = profile.rows[0];
        if (!actor || actor.account_status !== 'active' || !['provider', 'admin'].includes(String(actor.role))) throw Object.assign(new Error('ACTIVE_PROVIDER_REQUIRED'), { statusCode: 403 });

        const properties = await client.query(`
          select p.id, p.name, p.city, p.property_type, p.is_active,
                 count(distinct rt.id)::int as room_types, count(distinct u.id)::int as units
            from public.stay_properties p
            left join public.stay_room_types rt on rt.property_id = p.id and rt.is_active
            left join public.stay_units u on u.room_type_id = rt.id and u.is_active
           where ($1 = 'admin' or (p.owner_user_id = $2 and ($3::uuid is null or p.business_id=$3::uuid)))
           group by p.id order by p.updated_at desc limit 100`, [actor.role, actorId, businessId]);
        const stayMetrics = await client.query(`
          with scoped_units as (
            select u.id from public.stay_units u
            join public.stay_room_types rt on rt.id = u.room_type_id
            join public.stay_properties p on p.id = rt.property_id
            where u.is_active and ($1 = 'admin' or (p.owner_user_id = $2 and ($3::uuid is null or p.business_id=$3::uuid)))
          ), scoped_allocations as (
            select a.* from public.stay_allocations a join scoped_units u on u.id = a.unit_id
            where a.status = 'confirmed' and a.stay_dates @> current_date
          ), scoped_bookings as (
            select b.* from public.bookings b join public.listings l on l.id = b.listing_id
            where ($1 = 'admin' or (l.owner_id = $2 and ($3::uuid is null or l.business_id=$3::uuid)))
              and (b.id like 'stay-%' or coalesce(b.payload->>'source','') in ('stay_checkout','stay_request','pg_booking'))
              and b.created_at >= date_trunc('month', now())
          )
          select
            (select count(*)::int from public.stay_properties p where ($1 = 'admin' or (p.owner_user_id = $2 and ($3::uuid is null or p.business_id=$3::uuid)))) as properties,
            (select count(*)::int from public.stay_room_types rt join public.stay_properties p on p.id=rt.property_id where rt.is_active and ($1 = 'admin' or p.owner_user_id = $2)) as room_types,
            (select count(*)::int from scoped_units) as units,
            (select count(*)::int from scoped_allocations) as occupied_units,
            coalesce((select sum(coalesce(b.amount,0)) from scoped_bookings b where b.status in ('confirmed','completed')),0)::numeric as revenue,
            (select count(*)::int from scoped_bookings where status in ('confirmed','completed')) as booking_count`, [actor.role, actorId, businessId]);
        const stayBookings = await client.query(`
          select b.id, b.listing_title, b.customer_name, b.status,
                 coalesce(nullif(b.payload->>'checkIn',''), nullif(b.payload->>'moveIn',''), nullif(b.scheduled_date,'')) as starts_on,
                 coalesce(nullif(b.payload->>'checkOut',''), nullif(b.payload->>'moveOut','')) as ends_on,
                 coalesce(b.amount,0)::numeric as amount, nullif(b.payload->>'paymentStatus','') as payment_status
            from public.bookings b join public.listings l on l.id = b.listing_id
           where ($1 = 'admin' or (l.owner_id = $2 and ($3::uuid is null or l.business_id=$3::uuid)))
             and (b.id like 'stay-%' or coalesce(b.payload->>'source','') in ('stay_checkout','stay_request','pg_booking'))
           order by b.created_at desc limit 25`, [actor.role, actorId, businessId]);

        const serviceMetrics = await client.query(`
          select
            (select count(*)::int from public.listings l where lower(l.entity_type)='service' and l.status='active' and ($1='admin' or l.owner_id=$2)) as listings,
            count(*) filter (where sb.status='requested')::int as requested,
            count(*) filter (where sb.status in ('accepted','in_progress'))::int as active_jobs,
            count(*) filter (where sb.status='completed')::int as completed,
            coalesce(sum(sb.amount) filter (where sb.payment_status='settled'),0)::numeric as settled_revenue
           from public.service_bookings sb
          where ($1='admin' or (sb.provider_id=$2 and ($3::uuid is null or sb.business_id=$3::uuid)))`, [actor.role, actorId, businessId]);
        const serviceBookings = await client.query(`
          select sb.id, sb.booking_ref, coalesce(l.title,'Service booking') as listing_title, sb.status,
                 sb.scheduled_date, sb.time_slot, sb.amount, sb.payment_status
            from public.service_bookings sb left join public.listings l on l.id=sb.listing_id
           where ($1='admin' or (sb.provider_id=$2 and ($3::uuid is null or sb.business_id=$3::uuid)))
           order by sb.scheduled_date asc, sb.created_at desc limit 25`, [actor.role, actorId, businessId]);
        const claims = await client.query(`select count(*)::int as pending from public.service_payment_claims c join public.service_bookings b on b.id=c.booking_id where c.status='pending' and ($1='admin' or (b.provider_id=$2 and ($3::uuid is null or b.business_id=$3::uuid)))`, [actor.role, actorId, businessId]);
        const sm = serviceMetrics.rows[0] || {};
        const st = stayMetrics.rows[0] || {};
        const units = Number(st.units || 0);
        const occupied = Number(st.occupied_units || 0);
        const revenue = Number(st.revenue || 0);
        const bookingCount = Number(st.booking_count || 0);
        return {
          ok: true, source: 'postgres', fetchedAt: new Date().toISOString(), actor: { role: String(actor.role), name: actor.full_name || null },
          stays: { metrics: { properties: Number(st.properties || 0), roomTypes: Number(st.room_types || 0), units, occupiedUnits: occupied, occupancyPct: units ? Math.round((occupied / units) * 1000) / 10 : null, revenue, adr: bookingCount ? Math.round((revenue / bookingCount) * 100) / 100 : null, revpar: units ? Math.round((revenue / units) * 100) / 100 : null }, properties: properties.rows.map(row => ({ id: String(row.id), name: String(row.name), city: String(row.city), propertyType: String(row.property_type), isActive: Boolean(row.is_active), roomTypes: Number(row.room_types || 0), units: Number(row.units || 0) })), bookings: stayBookings.rows.map(row => ({ id: String(row.id), listingTitle: String(row.listing_title || ''), guestName: String(row.customer_name || ''), status: String(row.status || ''), startsOn: row.starts_on ? String(row.starts_on) : null, endsOn: row.ends_on ? String(row.ends_on) : null, amount: Number(row.amount || 0), paymentStatus: row.payment_status ? String(row.payment_status) : null })) },
          services: { metrics: { listings: Number(sm.listings || 0), requested: Number(sm.requested || 0), activeJobs: Number(sm.active_jobs || 0), completed: Number(sm.completed || 0), settledRevenue: Number(sm.settled_revenue || 0), pendingClaims: Number(claims.rows[0]?.pending || 0) }, bookings: serviceBookings.rows.map(row => ({ id: String(row.id), bookingRef: String(row.booking_ref), listingTitle: String(row.listing_title), status: String(row.status), scheduledDate: String(row.scheduled_date), timeSlot: String(row.time_slot), amount: Number(row.amount || 0), paymentStatus: String(row.payment_status) })) },
        };
      });
      response.setHeader('Cache-Control', 'no-store');
      response.json(result);
    } catch (error: any) {
      if (Number(error?.statusCode) === 403) return response.status(403).json({ ok: false, error: 'ACTIVE_PROVIDER_REQUIRED' });
      if (error?.code === '42P01' || error?.code === '42703') return response.status(503).json({ ok: false, error: 'PROVIDER_PORTAL_SCHEMA_NOT_READY' });
      logSafeError('provider-portal', 'overview', error);
      response.status(500).json({ ok: false, error: 'PROVIDER_PORTAL_OVERVIEW_FAILED' });
    }
  });
}

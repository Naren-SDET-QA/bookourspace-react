import type express from 'express';
import type { PoolClient } from 'pg';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';
import { logSafeError } from './safeLogging';
import { isLocationStale, normalizeOtpCode, validateLocationInput } from './serviceDispatchSecurity';
import { sendServiceStartOtpEmail } from './resendTransactionalEmails';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bad = (res: express.Response, status: number, error: string) => res.status(status).json({ ok: false, error });
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export interface ServiceDispatchApiDeps { verifySession: (request: express.Request) => any | null; env?: NodeJS.ProcessEnv; }

export function registerServiceDispatchApi(app: express.Express, deps: ServiceDispatchApiDeps): void {
  const env = deps.env || process.env;
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  if (connectionString) assertPostgresConnectionTarget(connectionString, env);
  const unavailable = (_request: express.Request, response: express.Response) => bad(response, 503, 'SERVICE_DISPATCH_DATABASE_UNAVAILABLE');
  if (!connectionString) { app.get('/api/services/workers', unavailable); return; }
  const pool = getSharedPostgresPool(connectionString, env);
  async function withActor<T>(actorId: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try { await client.query('BEGIN'); await client.query('SET LOCAL ROLE authenticated'); await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actorId]); await client.query("select set_config('request.jwt.claim.role','authenticated',true)"); const result = await run(client); await client.query('COMMIT'); return result; }
    catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; } finally { client.release(); }
  }
  const actor = (request: express.Request, response: express.Response) => { const session = deps.verifySession(request); const id = String(session?.supabaseUserId || ''); if (!UUID.test(id)) { bad(response, session ? 403 : 401, session ? 'VERIFIED_DATABASE_ID_REQUIRED' : 'AUTH_REQUIRED'); return null; } return id; };
  const handle = (run: (client: PoolClient, actorId: string, request: express.Request) => Promise<unknown>) => async (request: express.Request, response: express.Response) => {
    const actorId = actor(request, response); if (!actorId) return;
    try { const result = await withActor(actorId, client => run(client, actorId, request)); response.json({ ok: true, ...result as object }); }
    catch (error: any) { if (error?.code === '23P01' || error?.code === '23505') return bad(response, 409, 'WORKER_ASSIGNMENT_CONFLICT'); if (error?.code === '42P01' || error?.code === '42703') return bad(response, 503, 'SERVICE_DISPATCH_SCHEMA_NOT_READY'); if (Number(error?.statusCode) >= 400) return bad(response, Number(error.statusCode), String(error.message)); logSafeError('service-dispatch', request.path, error); bad(response, 500, 'SERVICE_DISPATCH_FAILED'); }
  };

  app.get('/api/services/workers', handle(async (client, actorId, request) => {
    const profile = await client.query(`select role, account_status from public.profiles where id=$1`, [actorId]);
    if (profile.rows[0]?.account_status !== 'active' || !['provider','admin'].includes(String(profile.rows[0]?.role))) throw Object.assign(new Error('ACTIVE_PROVIDER_REQUIRED'), { statusCode: 403 });
    const rows = await client.query(`select id, full_name, phone, service_categories, service_areas, availability, status, approved_at from public.service_workers where provider_id=$1 or $2='admin' order by created_at desc`, [actorId, profile.rows[0].role]);
    return { workers: rows.rows };
  }));
  app.post('/api/services/workers', handle(async (client, actorId, request) => {
    const profile = await client.query(`select role, account_status from public.profiles where id=$1`, [actorId]);
    if (profile.rows[0]?.account_status !== 'active' || !['provider','admin'].includes(String(profile.rows[0]?.role))) throw Object.assign(new Error('ACTIVE_PROVIDER_REQUIRED'), { statusCode: 403 });
    const name = text(request.body?.fullName, 120); const phone = text(request.body?.phone, 24); if (name.length < 2 || phone.length < 7) throw Object.assign(new Error('WORKER_NAME_AND_PHONE_REQUIRED'), { statusCode: 400 });
    const row = await client.query(`insert into public.service_workers(provider_id,full_name,phone,service_categories,service_areas) values($1,$2,$3,$4,$5) returning id,full_name,phone,status,created_at`, [actorId, name, phone, Array.isArray(request.body?.serviceCategories) ? request.body.serviceCategories.slice(0,20) : [], Array.isArray(request.body?.serviceAreas) ? request.body.serviceAreas.slice(0,20) : []]);
    return { worker: row.rows[0] };
  }));
  app.post('/api/services/bookings/:id/assign-worker', handle(async (client, actorId, request) => {
    const bookingId = text(request.params.id, 64); const workerId = text(request.body?.workerId, 64); const startsAt = new Date(String(request.body?.startsAt || '')); const endsAt = new Date(String(request.body?.endsAt || ''));
    if (!UUID.test(bookingId) || !UUID.test(workerId) || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) throw Object.assign(new Error('INVALID_ASSIGNMENT_WINDOW'), { statusCode: 400 });
    const booking = await client.query(`select id, provider_id, status from public.service_bookings where id=$1 for update`, [bookingId]); if (!booking.rows[0] || (booking.rows[0].provider_id !== actorId)) throw Object.assign(new Error('SERVICE_BOOKING_FORBIDDEN'), { statusCode: 403 });
    const worker = await client.query(`select id from public.service_workers where id=$1 and provider_id=$2 and status='approved'`, [workerId, actorId]); if (!worker.rows[0]) throw Object.assign(new Error('APPROVED_WORKER_REQUIRED'), { statusCode: 400 });
    await client.query(`insert into public.service_worker_assignments(booking_id,worker_id,job_window,assigned_by) values($1,$2,tstzrange($3,$4,'[)'),$5)`, [bookingId, workerId, startsAt.toISOString(), endsAt.toISOString(), actorId]);
    const updated = await client.query(`update public.service_bookings set worker_id=$2, assigned_at=now(), status=case when status='accepted' then 'assigned' else status end where id=$1 returning id,status,worker_id,assigned_at`, [bookingId, workerId]);
    return { booking: updated.rows[0] };
  }));
  app.post('/api/services/bookings/:id/start-otp', handle(async (client, _actorId, request) => {
    const bookingId = text(request.params.id, 64);
    const row = await client.query(`select public.issue_service_job_otp($1,'start') as payload`, [bookingId]);
    const otp = row.rows[0]?.payload;
    let emailBackup: unknown = null;
    if (request.body?.emailBackup === true && otp?.code) {
      const recipient = await client.query(`select p.email from public.service_bookings b join public.profiles p on p.id=b.customer_id where b.id=$1 limit 1`, [bookingId]);
      const email = String(recipient.rows[0]?.email || '').trim();
      if (email) emailBackup = await sendServiceStartOtpEmail({ recipient: email, code: String(otp.code), bookingId }, { env });
    }
    return { otp, emailBackup };
  }));
  app.post('/api/services/bookings/:id/verify-start-otp', handle(async (client, _actorId, request) => { const row = await client.query(`select public.verify_service_job_otp($1,'start',$2) as payload`, [text(request.params.id, 64), normalizeOtpCode(request.body?.code)]); return { result: row.rows[0]?.payload }; }));
  app.post('/api/services/bookings/:id/location', handle(async (client, actorId, request) => {
    let location: ReturnType<typeof validateLocationInput>; try { location = validateLocationInput(request.body || {}); } catch (error) { throw Object.assign(error instanceof Error ? error : new Error('INVALID_LOCATION'), { statusCode: 400 }); }
    const { latitude, longitude, accuracyM: accuracy } = location;
    const bookingId = text(request.params.id, 64); const booking = await client.query(`select id, provider_id, worker_id, status from public.service_bookings where id=$1 and provider_id=$2 for update`, [bookingId, actorId]); if (!booking.rows[0] || !booking.rows[0].worker_id || !['travelling','arrived','started','in_progress'].includes(booking.rows[0].status)) throw Object.assign(new Error('TRACKING_NOT_ACTIVE'), { statusCode: 409 });
    await client.query(`insert into public.service_job_locations(booking_id,worker_id,latitude,longitude,accuracy_m) values($1,$2,$3,$4,$5)`, [bookingId, booking.rows[0].worker_id, latitude, longitude, accuracy]);
    await client.query(`insert into public.service_job_tracking_sessions(booking_id,worker_id,consent_granted_at,last_seen_at) values($1,$2,now(),now()) on conflict(booking_id) do update set last_seen_at=now(), stopped_at=null, stop_reason=null`, [bookingId, booking.rows[0].worker_id]);
    return { accepted: true, recordedAt: new Date().toISOString() };
  }));
  app.get('/api/services/bookings/:id/location', handle(async (client, actorId, request) => {
    const bookingId = text(request.params.id, 64); const access = await client.query(`select id, customer_id, provider_id from public.service_bookings where id=$1 and (customer_id=$2 or provider_id=$2 or exists(select 1 from public.profiles p where p.id=$2 and p.role='admin'))`, [bookingId, actorId]); if (!access.rows[0]) throw Object.assign(new Error('SERVICE_BOOKING_FORBIDDEN'), { statusCode: 403 });
    const row = await client.query(`select l.latitude,l.longitude,l.accuracy_m,l.recorded_at,s.stopped_at from public.service_job_locations l left join public.service_job_tracking_sessions s on s.booking_id=l.booking_id where l.booking_id=$1 order by l.recorded_at desc limit 1`, [bookingId]); const latest = row.rows[0]; const stale = isLocationStale(latest?.recorded_at, Date.now(), 15*60*1000, latest?.stopped_at); return { location: stale ? null : latest, stale };
  }));
  app.post('/api/services/bookings/:id/tracking/stop', handle(async (client, actorId, request) => { const bookingId = text(request.params.id, 64); const result = await client.query(`update public.service_job_tracking_sessions s set stopped_at=now(), stop_reason=$3 where s.booking_id=$1 and exists(select 1 from public.service_bookings b where b.id=s.booking_id and b.provider_id=$2) returning booking_id,stopped_at`, [bookingId, actorId, text(request.body?.reason, 120) || 'job_closed']); return { tracking: result.rows[0] || null }; }));
}

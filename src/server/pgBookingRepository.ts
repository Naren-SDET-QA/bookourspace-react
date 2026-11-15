import type { Pool, PoolClient } from 'pg';
import { closeSharedPostgresPool, getSharedPostgresPool } from './postgresPool';
import type { ProviderListingActor } from './providerListingRepository';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PgBookingError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'PgBookingError';
  }
}

export type PgActor = ProviderListingActor & { supabaseUserId: string; authProvider: 'google' };

function safeDate(value: unknown): string {
  const date = typeof value === 'string' ? value : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new PgBookingError('INVALID_MOVE_IN_DATE', 400);
  }
  return date;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export class PgBookingRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    // One shared pool for the PG booking domain: this repository and the PG
    // payment repository talk to the same database.
    this.pool = getSharedPostgresPool(connectionString);
  }

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): PgBookingRepository | null {
    const connection = String(environment.BOS_LISTINGS_DATABASE_URL || '').trim();
    const legacy = String(environment.BOS_PG_URL || '').trim();
    if (legacy && !connection) throw new Error('BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL');
    if (legacy && connection && legacy !== connection) throw new Error('BOS_LISTINGS_DATABASE_URL_CONFLICT');
    if (legacy) throw new Error('BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL');
    if (!connection) return null;
    if (environment.NODE_ENV === 'production') throw new Error('PG_BOOKINGS_POSTGRES_REPOSITORY_LOCAL_ONLY');
    return new PgBookingRepository(connection);
  }

  async verifyConnection(): Promise<void> { await this.pool.query('select 1'); }
  /** The pool is shared, so it is released through the shared owner. */
  async close(): Promise<void> { await closeSharedPostgresPool(); }

  private async transaction<T>(actor: PgActor | null, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const role = actor ? 'authenticated' : 'anon';
      await client.query(`set local role ${role}`);
      const claims = actor ? { sub: actor.supabaseUserId, role: 'authenticated', aal: 'aal1' } : { role: 'anon' };
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actor?.supabaseUserId || '']);
      await client.query("select set_config('request.jwt.claim.role',$1,true)", [role]);
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
      const result = await operation(client);
      await client.query('commit');
      return result;
    } catch (error) {
      try { await client.query('rollback'); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  private assertIdentity(actor: ProviderListingActor | null, roles: string[]): asserts actor is PgActor {
    if (!actor || !actor.supabaseUserId || !UUID.test(actor.supabaseUserId) || actor.authProvider !== 'google') {
      throw new PgBookingError('VERIFIED_GOOGLE_IDENTITY_REQUIRED', 401);
    }
    if (!roles.includes(actor.role)) throw new PgBookingError('FORBIDDEN_ROLE', 403);
  }

  async inventory(listingId: string, moveIn: unknown, monthsValue: unknown, actor: ProviderListingActor | null) {
    const moveInDate = safeDate(moveIn);
    const months = Number(monthsValue);
    if (!Number.isInteger(months) || months < 1 || months > 12) throw new PgBookingError('INVALID_LEASE_MONTHS', 400);
    const moveOutDate = await this.transaction(actor as PgActor | null, async (client) => {
      const result = await client.query(
        `select current_date as today, ($1::date + make_interval(months => $2))::date as move_out,
                exists(select 1 from public.platform_module_flags where module_key='pg' and is_enabled and allow_online_booking) as enabled`,
        [moveInDate, months],
      );
      if (!result.rows[0]?.enabled) throw new PgBookingError('PG_BOOKING_DISABLED', 409);
      if (moveInDate < String(result.rows[0]?.today).slice(0, 10)) throw new PgBookingError('INVALID_MOVE_IN_DATE', 400);
      return String(result.rows[0]?.move_out || '').slice(0, 10);
    });
    return this.transaction(actor as PgActor | null, async (client) => {
      const property = await client.query(
        `select p.id,p.owner_user_id,p.property_type,p.is_active,l.title,l.status,l.category_id
           from public.stay_properties p join public.listings l on l.id=p.listing_id
          where p.listing_id=$1 and p.property_type='pg_hostel' and p.is_active and l.status='active'
            and (l.category_id like 'pg-%' or l.category_id='cat-26')`, [listingId],
      );
      if (!property.rowCount) return { listingId, moveIn: moveInDate, moveOut: moveOutDate, roomTypes: [] };
      const isOwner = actor?.supabaseUserId === property.rows[0].owner_user_id;
      const types = await client.query(
        `select rt.id,rt.name,rt.max_adults,rt.monthly_rent_paise,rt.security_deposit_paise,
                rt.amenities,
                (select count(*)::int from public.stay_units u where u.room_type_id=rt.id and u.is_active) as total_beds,
                (select count(*)::int from public.stay_availability(rt.id,$2::date,$3::date)) as available_beds,
                case when $4::boolean then coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'label',u.label) order by u.label)
                  from public.stay_units u where u.room_type_id=rt.id and u.is_active),'[]'::jsonb) else '[]'::jsonb end as beds
           from public.stay_room_types rt where rt.property_id=$1 and rt.is_active order by rt.name`,
        [property.rows[0].id, moveInDate, moveOutDate, isOwner || actor?.role === 'admin'],
      );
      return { listingId, moveIn: moveInDate, moveOut: moveOutDate, roomTypes: types.rows.map((row) => ({
        roomTypeId: row.id, name: row.name, occupancyPerBed: Number(row.max_adults),
        monthlyRentPaise: Number(row.monthly_rent_paise || 0), securityDepositPaise: Number(row.security_deposit_paise || 0),
        totalBeds: Number(row.total_beds), availableBeds: Number(row.available_beds), amenities: row.amenities || [], beds: row.beds || [],
      })) };
    });
  }

  async upsertInventory(actor: ProviderListingActor | null, listingId: string, input: Record<string, unknown>) {
    this.assertIdentity(actor, ['provider', 'admin']);
    const name = typeof input.roomName === 'string' ? input.roomName.trim() : '';
    const rent = Number(input.monthlyRentRupees);
    const deposit = Number(input.securityDepositRupees ?? 0);
    const occupancy = Number(input.occupancyPerBed ?? 1);
    const labels = Array.isArray(input.bedLabels) ? input.bedLabels.map((x) => String(x).trim()) : [];
    const amenities = Array.isArray(input.amenities) ? input.amenities.map((x) => String(x).trim()).filter(Boolean).slice(0, 30) : [];
    if (!name || name.length > 100 || !Number.isFinite(rent) || rent <= 0 || rent > 1000000
      || !Number.isFinite(deposit) || deposit < 0 || deposit > 5000000 || !Number.isInteger(occupancy)
      || labels.length < 1 || labels.length > 100 || labels.some((label) => !label || label.length > 40)) {
      throw new PgBookingError('INVALID_PG_INVENTORY', 400);
    }
    const roomTypeId = input.roomTypeId == null || input.roomTypeId === '' ? null : String(input.roomTypeId);
    if (roomTypeId && !UUID.test(roomTypeId)) throw new PgBookingError('INVALID_ROOM_TYPE_ID', 400);
    const result = await this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['provider', 'admin']);
      const response = await client.query(
        `select public.pg_owner_upsert_inventory($1,$2,$3,$4,$5,$6,$7::text[],$8::text[]) as result`,
        [listingId, roomTypeId, name, Math.round(rent * 100), Math.round(deposit * 100), occupancy, labels, amenities],
      );
      return jsonRecord(response.rows[0]?.result);
    });
    return result;
  }

  async createBooking(actor: ProviderListingActor | null, input: Record<string, unknown>) {
    this.assertIdentity(actor, ['customer']);
    const listingId = typeof input.listingId === 'string' ? input.listingId.trim() : '';
    const roomTypeId = typeof input.roomTypeId === 'string' ? input.roomTypeId : '';
    const moveIn = safeDate(input.moveIn);
    const months = Number(input.months);
    const beds = Number(input.beds);
    const occupants = Number(input.occupants);
    const key = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!listingId || listingId.length > 160 || !UUID.test(roomTypeId) || !Number.isInteger(months)
      || !Number.isInteger(beds) || !Number.isInteger(occupants) || key.length < 8 || key.length > 128) {
      throw new PgBookingError('INVALID_PG_BOOKING', 400);
    }
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer']);
      const result = await client.query(
        `select public.pg_create_booking($1,$2,$3::date,$4,$5,$6,$7) as result`,
        [listingId, roomTypeId, moveIn, months, beds, occupants, key],
      );
      return jsonRecord(result.rows[0]?.result);
    });
  }

  async listBookings(actor: ProviderListingActor | null) {
    this.assertIdentity(actor, ['customer', 'provider', 'admin']);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer', 'provider', 'admin']);
      const result = await client.query(
        `select b.id,b.listing_id,b.listing_title,b.provider_id,b.user_id,b.status,b.payment_status,
                b.payment_mode,b.amount,b.total_paise,b.check_in,b.check_out,b.units,b.cancelled_at,
                b.created_at,b.payload,l.owner_id
           from public.bookings b left join public.listings l on l.id=b.listing_id
          where b.payload->>'source'='pg_booking'
            and (b.user_id=auth.uid() or l.owner_id=auth.uid() or public.is_admin())
          order by b.created_at desc limit 100`,
      );
      return result.rows.map((row) => ({
        bookingId: row.id, listingId: row.listing_id, listingTitle: row.listing_title, status: row.status,
        paymentStatus: row.payment_status, paymentMode: row.payment_mode, moveIn: row.check_in,
        moveOut: row.check_out, beds: Number(row.units), amount: Number(row.amount), totalDuePaise: Number(row.total_paise),
        rentPaise: Number(row.payload?.rentPaise || 0), depositPaise: Number(row.payload?.depositPaise || 0),
        cancelledAt: row.cancelled_at, createdAt: row.created_at,
        party: row.user_id === actor.supabaseUserId ? 'customer' : 'owner',
      }));
    });
  }

  async cancelBooking(actor: ProviderListingActor | null, bookingId: string) {
    this.assertIdentity(actor, ['customer']);
    if (!bookingId || bookingId.length > 160) throw new PgBookingError('INVALID_BOOKING_ID', 400);
    return this.transaction(actor, async (client) => {
      await this.requireActiveProfile(client, actor, ['customer']);
      const result = await client.query('select public.pg_cancel_booking($1) as result', [bookingId]);
      return jsonRecord(result.rows[0]?.result);
    });
  }

  private async requireActiveProfile(client: PoolClient, actor: PgActor, roles: string[]) {
    const { rows } = await client.query(
      `select role,account_status from public.profiles where id=auth.uid() limit 1`,
    );
    if (!rows[0] || rows[0].account_status !== 'active') throw new PgBookingError('ACTIVE_PROFILE_REQUIRED', 403);
    if (!roles.includes(rows[0].role)) throw new PgBookingError('FORBIDDEN_ROLE', 403);
  }
}

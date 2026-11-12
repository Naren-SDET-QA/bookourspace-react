import { type Pool, type PoolClient } from 'pg';
import type { ProviderListingActor } from './providerListingRepository';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { closeSharedPostgresPool, getSharedPostgresPool } from './postgresPool';
import { hasVerifiedSupabaseIdentity, type VerifiedAuthProvider } from './authIdentity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class VenueBookingError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'VenueBookingError';
  }
}

export type VenueActor = ProviderListingActor & { supabaseUserId: string; authProvider: VerifiedAuthProvider };

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

export class VenueBookingRepository {
  private readonly pool: Pool;

  constructor(connectionString: string, environment: NodeJS.ProcessEnv = process.env) {
    assertPostgresConnectionTarget(connectionString, environment);
    this.pool = getSharedPostgresPool(connectionString, environment);
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): VenueBookingRepository | null {
    const url = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
    if (!url) return null;
    assertPostgresConnectionTarget(url, env);
    return new VenueBookingRepository(url, env);
  }

  async verifyConnection() { await this.pool.query('select 1'); }
  async close() { await closeSharedPostgresPool(); }

  private assertActor(actor: ProviderListingActor | null, roles: string[]): asserts actor is VenueActor {
    if (!hasVerifiedSupabaseIdentity(actor)) {
      throw new VenueBookingError('VERIFIED_SUPABASE_IDENTITY_REQUIRED', 401);
    }
    if (!roles.includes(actor.role)) throw new VenueBookingError('FORBIDDEN_ROLE', 403);
  }

  private async transaction<T>(actor: VenueActor | null, run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const role = actor ? 'authenticated' : 'anon';
      await client.query(`set local role ${role}`);
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actor?.supabaseUserId || '']);
      await client.query("select set_config('request.jwt.claim.role',$1,true)", [role]);
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(actor ? { sub: actor.supabaseUserId, role } : { role })]);
      const result = await run(client);
      await client.query('commit');
      return result;
    } catch (error) {
      try { await client.query('rollback'); } catch { /* preserve the original error */ }
      throw error;
    } finally { client.release(); }
  }

  private async trustedTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('begin'); const value = await run(client); await client.query('commit'); return value; }
    catch (error) { try { await client.query('rollback'); } catch { /* preserve */ } throw error; }
    finally { client.release(); }
  }

  async quote(listingId: string, startsAt: string, endsAt: string, slotType: string, guests: number, addons: string[], actor: ProviderListingActor | null) {
    return this.transaction(actor as VenueActor | null, async (client) => {
      const { rows } = await client.query('select public.venue_quote($1,$2::timestamptz,$3::timestamptz,$4,$5,$6::text[]) as quote',
        [listingId, startsAt, endsAt, slotType, guests, addons]);
      return record(rows[0]?.quote);
    });
  }

  async calendar(listingId: string, from: string, to: string, actor: ProviderListingActor | null) {
    return this.transaction(actor as VenueActor | null, async (client) => {
      const result = await client.query('select lower(busy_period) as starts_at, upper(busy_period) as ends_at, busy_type from public.venue_public_calendar($1,$2::timestamptz,$3::timestamptz)', [listingId, from, to]);
      return result.rows.map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at, kind: row.busy_type }));
    });
  }

  async settings(listingId: string, actor: ProviderListingActor | null) {
    return this.transaction(actor as VenueActor | null, async (client) => {
      const result = await client.query('select * from public.venue_booking_settings where listing_id=$1', [listingId]);
      if (!result.rowCount) throw new VenueBookingError('VENUE_INVENTORY_NOT_CONFIGURED', 404);
      const row = result.rows[0];
      return {
        listingId: row.listing_id, timeZone: row.time_zone, bookingEnabled: row.booking_enabled,
        requiresOwnerApproval: row.requires_owner_approval, capacity: row.capacity,
        hourlyRatePaise: Number(row.hourly_rate_paise), halfDayRatePaise: Number(row.half_day_rate_paise),
        fullDayRatePaise: Number(row.full_day_rate_paise), perGuestRatePaise: Number(row.per_guest_rate_paise),
        includedGuests: row.included_guests, depositPaise: Number(row.deposit_paise), taxPercent: Number(row.tax_percent),
        setupBufferMinutes: row.setup_buffer_minutes, cleanupBufferMinutes: row.cleanup_buffer_minutes,
        advanceBookingDays: row.advance_booking_days, minimumAdvanceMinutes: row.minimum_advance_minutes,
        addonRates: row.addon_rates, cancellationPolicy: row.cancellation_policy,
      };
    });
  }

  async listCategories(includeInactive = false, actor: ProviderListingActor | null = null) {
    if (includeInactive) this.assertActor(actor, ['admin']);
    const read = async (client: PoolClient) => {
      const result = await client.query(
        `select category_id,label,emoji,subcategories,active,sort_order,updated_at
           from public.venue_categories
          where ($1::boolean or active is true)
          order by sort_order,label`,
        [includeInactive],
      );
      return result.rows.map((row) => ({ id: row.category_id, label: row.label, emoji: row.emoji,
        subcategories: row.subcategories || [], active: row.active, sortOrder: row.sort_order, updatedAt: row.updated_at }));
    };

    // The anonymous RLS policy references admin helpers whose EXECUTE grants
    // are intentionally revoked from anon. Public taxonomy contains no private
    // fields, so use the trusted server connection and explicitly expose only
    // active rows. Inactive taxonomy remains an authenticated admin read below.
    if (!includeInactive) return this.trustedTransaction(read);
    return this.transaction(actor as VenueActor, read);
  }

  async saveCategory(actor: ProviderListingActor | null, id: string, input: Record<string, unknown>) {
    this.assertActor(actor, ['admin']);
    const label=String(input.label||'').trim(); const emoji=String(input.emoji||'🏛️').trim();
    const subcategories=Array.isArray(input.subcategories)?input.subcategories.map(x=>String(x).trim()):[];
    const sortOrder=Number(input.sortOrder??100); const active=input.active!==false;
    if (!/^venue-[a-z0-9-]{2,60}$/.test(id)||label.length<2||label.length>100||emoji.length>16
      ||subcategories.length>100||!Number.isInteger(sortOrder)||sortOrder<0
      ||subcategories.some(x=>x.length<2||x.length>100)) throw new VenueBookingError('INVALID_VENUE_CATEGORY',400);
    return this.transaction(actor, async (client) => {
      const result=await client.query('select public.venue_admin_save_category($1,$2,$3,$4::text[],$5,$6) as category',
        [id,label,emoji,subcategories,active,sortOrder]);
      const row=record(result.rows[0]?.category);
      return {id:row.category_id,label:row.label,emoji:row.emoji,subcategories:row.subcategories||[],active:row.active,sortOrder:row.sort_order,updatedAt:row.updated_at};
    });
  }

  async saveSettings(actor: ProviderListingActor | null, listingId: string, input: Record<string, unknown>) {
    this.assertActor(actor, ['provider', 'admin']);
    const n = (key: string, fallback = 0) => Number(input[key] ?? fallback);
    const paise = (key: string) => Math.round(n(key) * 100);
    const addons = record(input.addons);
    if (!Number.isInteger(n('capacity')) || n('capacity') < 1 || n('capacity') > 100000
      || ![n('hourlyRate'), n('halfDayRate'), n('fullDayRate'), n('perGuestRate'), n('deposit')].every((v) => Number.isFinite(v) && v >= 0)
      || n('taxPercent') < 0 || n('taxPercent') > 100) throw new VenueBookingError('INVALID_VENUE_SETTINGS', 400);
    const cleanAddons: Record<string, { label: string; pricePaise: number }> = {};
    for (const [key, value] of Object.entries(addons)) {
      const item = record(value);
      const label = String(item.label || '').trim(); const amount = Number(item.priceRupees);
      if (!/^[a-z0-9_-]{1,40}$/i.test(key) || !label || label.length > 80 || !Number.isFinite(amount) || amount < 0 || amount > 10000000) {
        throw new VenueBookingError('INVALID_VENUE_ADDON', 400);
      }
      cleanAddons[key] = { label, pricePaise: Math.round(amount * 100) };
    }
    return this.transaction(actor, async (client) => {
      const timeZone=String(input.timeZone||'Asia/Kolkata');
      const zone=await client.query('select 1 from pg_timezone_names where name=$1',[timeZone]);
      if(!zone.rowCount) throw new VenueBookingError('INVALID_VENUE_TIME_ZONE',400);
      const result = await client.query(
        'select public.venue_owner_save_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17) as settings',
        [listingId,n('capacity'),paise('hourlyRate'),paise('halfDayRate'),paise('fullDayRate'),paise('perGuestRate'),
          n('includedGuests'),paise('deposit'),n('taxPercent'),n('setupBufferMinutes'),n('cleanupBufferMinutes'),
          n('advanceBookingDays',365),n('minimumAdvanceMinutes',120),input.requiresOwnerApproval !== false,
          JSON.stringify(cleanAddons),JSON.stringify(record(input.cancellationPolicy)),input.bookingEnabled === true],
      );
      const timezoneUpdate=await client.query('update public.venue_booking_settings set time_zone=$2,updated_at=now() where listing_id=$1 returning listing_id',[listingId,timeZone]);
      if(!timezoneUpdate.rowCount) throw new VenueBookingError('VENUE_INVENTORY_NOT_CONFIGURED',409);
      return record(result.rows[0]?.settings);
    });
  }

  async addBlock(actor: ProviderListingActor | null, listingId: string, startsAt: string, endsAt: string, reason = '') {
    this.assertActor(actor, ['provider','admin']);
    return this.transaction(actor, async (client) => {
      const result = await client.query('select public.venue_owner_add_block($1,$2::timestamptz,$3::timestamptz,$4) as block', [listingId,startsAt,endsAt,reason]);
      return record(result.rows[0]?.block);
    });
  }

  async listBlocks(actor: ProviderListingActor | null, listingId: string) {
    this.assertActor(actor, ['provider','admin']);
    return this.transaction(actor, async (client) => {
      const result = await client.query('select id,lower(blocked_period) starts_at,upper(blocked_period) ends_at,reason,created_at from public.venue_blocks where listing_id=$1 order by lower(blocked_period) limit 500', [listingId]);
      return result.rows.map((row) => ({ id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, reason: row.reason, createdAt: row.created_at }));
    });
  }

  async deleteBlock(actor: ProviderListingActor | null, listingId: string, blockId: string) {
    this.assertActor(actor, ['provider','admin']);
    return this.transaction(actor, async (client) => {
      const result = await client.query('delete from public.venue_blocks where listing_id=$1 and id=$2 returning id', [listingId,blockId]);
      return result.rowCount === 1;
    });
  }

  async addSeasonalRate(actor: ProviderListingActor | null, listingId: string, input: Record<string, unknown>) {
    this.assertActor(actor, ['provider','admin']);
    const id = input.id ? String(input.id) : null;
    const deleting = input.delete === true;
    const start = String(input.startDate || ''); const end = String(input.endDate || '');
    const rate = Number(input.rateRupees);
    if (!deleting && (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end <= start || !Number.isFinite(rate) || rate < 0)) {
      throw new VenueBookingError('INVALID_SEASONAL_RATE', 400);
    }
    return this.transaction(actor, async (client) => {
      const result = await client.query('select public.venue_owner_manage_seasonal_rate($1,$2,$3::daterange,$4,$5,$6) as result',
        [listingId,id, deleting ? null : `[${start},${end})`, String(input.slotType || ''), Math.round(rate*100), deleting]);
      return record(result.rows[0]?.result);
    });
  }

  async createBooking(actor: ProviderListingActor | null, input: Record<string, unknown>) {
    this.assertActor(actor, ['customer']);
    const listingId = String(input.listingId || '').trim();
    const startsAt = String(input.startsAt || ''); const endsAt = String(input.endsAt || '');
    const slotType = String(input.slotType || ''); const guests = Number(input.guests);
    const addons = Array.isArray(input.addons) ? [...new Set(input.addons.map(String))].slice(0,20) : [];
    const paymentMode = String(input.paymentMode || 'pay_at_venue');
    const idempotencyKey = String(input.idempotencyKey || '');
    if (!listingId || listingId.length > 160 || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt))
      || !Number.isInteger(guests) || !UUID.test(idempotencyKey)) throw new VenueBookingError('INVALID_VENUE_BOOKING', 400);
    return this.transaction(actor, async (client) => {
      const result = await client.query('select public.venue_create_booking($1,$2::timestamptz,$3::timestamptz,$4,$5,$6::text[],$7,$8::uuid) as booking',
        [listingId,startsAt,endsAt,slotType,guests,addons,paymentMode,idempotencyKey]);
      return record(result.rows[0]?.booking);
    });
  }

  async listBookings(actor: ProviderListingActor | null, scope: 'mine'|'owner'|'admin') {
    this.assertActor(actor, ['customer','provider','admin']);
    if (scope==='owner' && !['provider','admin'].includes(actor.role)) throw new VenueBookingError('PROVIDER_ROLE_REQUIRED',403);
    if (scope==='admin' && actor.role!=='admin') throw new VenueBookingError('ADMIN_REQUIRED',403);
    return this.transaction(actor, async (client) => {
      const result = await client.query(
        `select b.*,l.title as listing_title,l.payload->'location' as location,s.time_zone as venue_time_zone,
                (select coalesce(jsonb_agg(jsonb_build_object('actorRole',e.actor_role,'action',e.action,'reason',e.reason,'details',e.details,'createdAt',e.created_at) order by e.created_at desc),'[]'::jsonb)
                   from public.venue_booking_events e where e.booking_id=b.id) as audit_events,
                (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'reason',d.reason,'status',d.status,'openedByRole',d.opener_role,'resolution',d.resolution,'resolvedAt',d.resolved_at,'createdAt',d.created_at) order by d.created_at desc),'[]'::jsonb)
                   from public.venue_booking_disputes d where d.booking_id=b.id) as disputes
           from public.venue_bookings b join public.listings l on l.id=b.listing_id
           join public.venue_booking_settings s on s.listing_id=b.listing_id
          where ($1='mine' and b.customer_user_id=auth.uid()) or ($1='owner' and b.owner_user_id=auth.uid()) or ($1='admin' and public.is_admin())
          order by b.starts_at desc limit 200`, [scope],
      );
      return result.rows.map((row) => ({
        id:row.id, bookingRef:row.booking_ref, listingId:row.listing_id, listingTitle:row.listing_title,
        startsAt:row.starts_at, endsAt:row.ends_at, slotType:row.slot_type, guests:row.guest_count,
        status:row.status, paymentMode:row.payment_mode, paymentStatus:row.payment_status,
        totalPaise:Number(row.total_paise), depositPaise:Number(row.deposit_paise), refundPaise:Number(row.refund_paise),
        priceBreakdown:row.price_breakdown, reason:row.cancellation_reason, customerUserId:row.customer_user_id,
        ownerUserId:row.owner_user_id, createdAt:row.created_at,
        timeZone:row.venue_time_zone,
        auditEvents:row.audit_events, disputes:row.disputes,
      }));
    });
  }

  async action(actor: ProviderListingActor | null, bookingId: string, action: string, reason = '') {
    this.assertActor(actor, ['customer','provider','admin']);
    if (!UUID.test(bookingId)) throw new VenueBookingError('INVALID_BOOKING_ID',400);
    return this.transaction(actor, async (client) => {
      const result = await client.query('select public.venue_booking_action($1::uuid,$2,$3) as booking', [bookingId,action,reason]);
      return record(result.rows[0]?.booking);
    });
  }

  async openDispute(actor: ProviderListingActor | null, bookingId: string, reason: string) {
    this.assertActor(actor, ['customer','provider','admin']);
    const trimmed=String(reason||'').trim();
    if(!UUID.test(bookingId) || trimmed.length<10 || trimmed.length>2000) throw new VenueBookingError('INVALID_DISPUTE_REASON',400);
    return this.transaction(actor, async (client) => {
      const result=await client.query('select public.venue_open_dispute($1::uuid,$2) as dispute',[bookingId,trimmed]);
      return record(result.rows[0]?.dispute);
    });
  }

  async resolveDispute(actor: ProviderListingActor | null, disputeId: string, resolution: string) {
    this.assertActor(actor, ['admin']);
    const trimmed=String(resolution||'').trim();
    if(!UUID.test(disputeId) || trimmed.length<10 || trimmed.length>2000) throw new VenueBookingError('INVALID_DISPUTE_RESOLUTION',400);
    return this.transaction(actor, async (client) => {
      const result=await client.query('select public.venue_resolve_dispute($1::uuid,$2) as dispute',[disputeId,trimmed]);
      return record(result.rows[0]?.dispute);
    });
  }

  async reschedule(actor: ProviderListingActor | null, bookingId: string, startsAt: string, endsAt: string, slotType: string) {
    this.assertActor(actor, ['provider','admin']);
    if (!UUID.test(bookingId) || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt)<=Date.parse(startsAt)) {
      throw new VenueBookingError('INVALID_VENUE_RESCHEDULE',400);
    }
    return this.transaction(actor, async (client) => {
      const result = await client.query('select public.venue_owner_reschedule_booking($1::uuid,$2::timestamptz,$3::timestamptz,$4) as booking', [bookingId,startsAt,endsAt,slotType]);
      return record(result.rows[0]?.booking);
    });
  }

  async customerBooking(actor: ProviderListingActor | null, bookingId: string) {
    this.assertActor(actor, ['customer']);
    return this.transaction(actor, async (client) => {
      const result = await client.query('select * from public.venue_bookings where id=$1 and customer_user_id=auth.uid()', [bookingId]);
      return result.rows[0] || null;
    });
  }

  async insertPaymentIntent(actor: ProviderListingActor | null, bookingId: string, provider: string, orderId: string | null) {
    this.assertActor(actor,['customer']);
    if(!UUID.test(bookingId)) throw new VenueBookingError('INVALID_BOOKING_ID',400);
    return this.trustedTransaction(async (client) => {
      const booking = await client.query('select * from public.venue_bookings where id=$1 and customer_user_id=$2 for update', [bookingId,actor.supabaseUserId]);
      if (!booking.rowCount || booking.rows[0].status!=='pending_payment' || new Date(booking.rows[0].hold_expires_at).getTime()<=Date.now()) throw new VenueBookingError('VENUE_BOOKING_HOLD_EXPIRED',409);
      const paymentMode=String(booking.rows[0].payment_mode||'');
      const expectedProvider=paymentMode==='razorpay'?'razorpay':paymentMode==='upi'?'upi_webhook':null;
      if(!expectedProvider || !['sandbox',expectedProvider].includes(provider)) throw new VenueBookingError('VENUE_PAYMENT_PROVIDER_MISMATCH',409);
      const exists = await client.query('select * from public.venue_payment_intents where booking_id=$1 and provider=$2', [bookingId,provider]);
      if (exists.rowCount) return exists.rows[0];
      const result = await client.query(
        `insert into public.venue_payment_intents(booking_id,customer_user_id,provider,provider_order_id,amount_paise,status,expires_at)
         values($1,$2,$3,$4,$5,'created',$6) returning *`,
        [bookingId,actor.supabaseUserId,provider,orderId,booking.rows[0].total_paise,booking.rows[0].hold_expires_at],
      );
      return result.rows[0];
    });
  }

  async settlePayment(input: { eventId: string; intentId: string; bookingId: string; eventType: string; providerReference: string; amountPaise: number; payloadHash: string }) {
    return this.trustedTransaction(async (client) => {
      const result = await client.query('select public.venue_settle_verified_payment($1,$2::uuid,$3::uuid,$4,$5,$6,$7) as result',
        [input.eventId,input.intentId,input.bookingId,input.eventType,input.providerReference,input.amountPaise,input.payloadHash]);
      return record(result.rows[0]?.result);
    });
  }
}

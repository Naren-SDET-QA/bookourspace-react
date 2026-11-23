import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { VenueBookingRepository } from '../src/server/venueBookingRepository.ts';
import { registerVenueBookingsApi } from '../src/server/venueBookingsApi.ts';

/**
 * Regression coverage for the Function Halls authorization layer.
 *
 * The fixtures are the mix the pre-fix guard could not handle: two listings in
 * different approved businesses, one legacy listing with no business, and one
 * booking. The pre-fix `assertListingBusiness` compared a booking, dispute,
 * category or nil UUID against `listings.id`, denied public/customer paths for
 * merely carrying `x-business-id`, and left `listBlocks` to RLS alone. Eight of
 * the ten subtests below fail against that behaviour; all ten pass against the
 * resolver, including the row-scope and restart checks.
 */
const dbUrl = process.env.BOS_LISTINGS_DATABASE_URL;
const pid = process.pid;
const ids = Object.fromEntries(['ownerA', 'ownerB', 'customer', 'admin'].map((name) => [name, randomUUID()]));
const businesses = { a: randomUUID(), b: randomUUID() };
const listingA = `venue-biz-a-${pid}`;
const listingB = `venue-biz-b-${pid}`;
const listingLegacy = `venue-biz-legacy-${pid}`;
const categoryId = `venue-biz-cat-${pid}`;

test('Function Halls authorization is resolved against the resource each method acts on', { skip: !dbUrl }, async (t) => {
  const pool = new Pool({ connectionString: dbUrl });
  let repo = new VenueBookingRepository(dbUrl);
  let server;
  let base = '';
  const actors = {
    ownerA: { role: 'provider', authProvider: 'google', supabaseUserId: ids.ownerA },
    ownerB: { role: 'provider', authProvider: 'google', supabaseUserId: ids.ownerB },
    customer: { role: 'customer', authProvider: 'google', supabaseUserId: ids.customer },
    admin: { role: 'admin', authProvider: 'google', supabaseUserId: ids.admin },
  };
  let bookingId = '';
  let disputeId = '';
  const startHttp = async () => {
    const app = express();
    app.use(express.json());
    registerVenueBookingsApi(app, {
      repository: repo,
      verifySession: (req) => actors[String(req.headers.authorization || '').replace('Bearer ', '')] || null,
      env: { NODE_ENV: 'test', BOS_VENUE_PAYMENT_SANDBOX: '1', BOS_VENUE_PAYMENT_SANDBOX_SECRET: 'venue-business-isolation-secret' },
    });
    const instance = await new Promise((resolve) => {
      const started = app.listen(0, '127.0.0.1', () => resolve(started));
    });
    base = `http://127.0.0.1:${instance.address().port}`;
    return instance;
  };
  const call = (path, actor, method = 'GET', body, businessId) =>
    fetch(base + path, {
      method,
      headers: {
        authorization: `Bearer ${actor}`,
        'content-type': 'application/json',
        ...(businessId ? { 'x-business-id': businessId } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const settingsBody = (extra = {}) => ({
    capacity: 200, hourlyRate: 2500, halfDayRate: 10000, fullDayRate: 18000, perGuestRate: 25,
    includedGuests: 100, deposit: 1000, taxPercent: 5, setupBufferMinutes: 30, cleanupBufferMinutes: 30,
    advanceBookingDays: 365, minimumAdvanceMinutes: 0, timeZone: 'Asia/Kolkata',
    requiresOwnerApproval: true, bookingEnabled: true, addons: {}, ...extra,
  });

  try {
    for (const [name, id] of Object.entries(ids)) {
      await pool.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3) on conflict(id) do nothing',
        [id, `venue-biz-${name}-${pid}@example.test`, JSON.stringify({})]);
      await pool.query("update public.profiles set role=$2,account_status='active' where id=$1",
        [id, name === 'ownerA' || name === 'ownerB' ? 'provider' : name === 'admin' ? 'admin' : 'customer']);
    }
    for (const [key, owner, name] of [['a', ids.ownerA, 'A'], ['b', ids.ownerB, 'B']]) {
      await pool.query(
        `insert into public.businesses(id,business_ref,name,module_type,owner_user_id,approval_status,is_enabled)
         values($1,$2,$3,'venues',$4,'approved',true)`,
        [businesses[key], `venue-biz-${key}-${pid}`, `Function Hall Business ${name} ${pid}`, owner],
      );
    }
    const insertListing = async (id, owner, businessId) => {
      await pool.query(
        `insert into public.listings(id,owner_id,title,category_id,subcategory,entity_type,price,price_unit,status,payload,business_id)
         values($1,$2,$3,'venues','Function Hall','venue',1,'per event','active','{}'::jsonb,$4)`,
        [id, owner, `Function Hall ${id}`, businessId],
      );
    };
    await insertListing(listingA, ids.ownerA, businesses.a);
    await insertListing(listingB, ids.ownerB, businesses.b);
    await insertListing(listingLegacy, ids.ownerA, null);
    server = await startHttp();

    await t.test('listing-scoped methods succeed for the owning business', async () => {
      assert.equal((await call(`/api/provider/venues/${listingA}/booking-settings`, 'ownerA', 'PUT', settingsBody(), businesses.a)).status, 200);
      assert.equal((await call(`/api/venues/${listingA}/booking-settings`, 'ownerA', 'GET', undefined, businesses.a)).status, 200);
      const blockResponse = await call(`/api/provider/venues/${listingA}/blocks`, 'ownerA', 'POST',
        { startsAt: '2027-06-03T09:00:00.000Z', endsAt: '2027-06-03T13:00:00.000Z', reason: 'maintenance' }, businesses.a);
      assert.equal(blockResponse.status, 201);
      const block = (await blockResponse.json()).block;
      assert.equal((await call(`/api/provider/venues/${listingA}/blocks`, 'ownerA', 'GET', undefined, businesses.a)).status, 200);
      assert.equal((await call(`/api/provider/venues/${listingA}/blocks/${block.id}`, 'ownerA', 'DELETE', undefined, businesses.a)).status, 200);
      assert.equal((await call(`/api/provider/venues/${listingA}/seasonal-rate`, 'ownerA', 'PUT',
        { startDate: '2027-07-01', endDate: '2027-07-05', rateRupees: 3000, slotType: 'hourly' }, businesses.a)).status, 200);
      assert.equal((await call(`/api/provider/venues/${listingB}/booking-settings`, 'ownerB', 'PUT', settingsBody(), businesses.b)).status, 200,
        'the other business configures its own hall');
    });

    await t.test('a customer booking is created without any business context', async () => {
      const created = await call('/api/venue-bookings', 'customer', 'POST', {
        listingId: listingA, startsAt: '2027-06-10T10:00:00.000Z', endsAt: '2027-06-10T12:00:00.000Z',
        slotType: 'hourly', guests: 40, addons: [], paymentMode: 'pay_at_venue',
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
      });
      assert.equal(created.status, 201);
      bookingId = (await created.json()).booking.id;
      assert.ok(bookingId, 'the booking id is a UUID, never a listing id');
    });

    await t.test('customer and taxonomy paths are authorized without a business scope', async () => {
      const pending = await call('/api/venue-bookings', 'customer', 'POST', {
        listingId: listingA, startsAt: '2027-06-14T10:00:00.000Z', endsAt: '2027-06-14T12:00:00.000Z',
        slotType: 'hourly', guests: 40, addons: [], paymentMode: 'pay_at_venue',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      }, businesses.b);
      assert.equal(pending.status, 201, 'a customer carrying a stale business header can still book');
      assert.equal((await call(`/api/admin/venues/categories/${categoryId}`, 'customer', 'PUT',
        { label: 'Forbidden Category' }, businesses.a)).status, 403, 'a customer still cannot write taxonomy');
      assert.equal((await call(`/api/admin/venues/categories/${categoryId}`, 'admin', 'PUT',
        { label: 'Isolation Test Category', emoji: '🧪', subcategories: ['Hall'], active: true, sortOrder: 900 },
        businesses.a)).status, 200, 'a venue-... category id is never looked up as a listing id');
      const context = await repo.notificationContext({ ...actors.customer, businessId: businesses.b }, bookingId);
      assert.equal(context.bookingId, bookingId, 'the customer party gets a notification context');
      const own = await repo.customerBooking({ ...actors.customer, businessId: businesses.b }, bookingId);
      assert.equal(String(own.id), bookingId, 'a customer reads their own booking with a stale header');
    });

    await t.test('public discovery is never denied for carrying a business header', async () => {
      // A provider browsing the marketplace sees other businesses' halls; the
      // header identifies their own workspace, not a scope for public reads.
      assert.equal((await call(`/api/venues/${listingB}/booking-settings`, 'ownerA', 'GET', undefined, businesses.a)).status, 200,
        'booking-settings of another business listing is a public read');
      assert.equal((await call(`/api/venues/${listingB}/quote`, 'ownerA', 'POST',
        { startsAt: '2027-06-01T10:00:00.000Z', endsAt: '2027-06-01T12:00:00.000Z', slotType: 'hourly', guests: 50, addons: [] },
        businesses.a)).status, 200, 'a quote for another business listing is a public read');
      assert.equal((await call(`/api/venues/${listingB}/calendar?from=2027-06-01T00:00:00.000Z&to=2027-06-02T00:00:00.000Z`,
        'ownerA', 'GET', undefined, businesses.a)).status, 200, 'a calendar for another business listing is a public read');
      assert.equal((await call(`/api/venues/${listingA}/booking-settings`, 'customer', 'GET', undefined, businesses.b)).status, 200,
        'a customer carrying a business header can read booking terms');
    });

    await t.test('cross-business access is denied for every listing-scoped method', async () => {
      assert.equal((await call(`/api/provider/venues/${listingA}/booking-settings`, 'ownerB', 'PUT', settingsBody(), businesses.b)).status, 403,
        'another business cannot change these booking settings');
      assert.equal((await call(`/api/provider/venues/${listingA}/blocks`, 'ownerB', 'GET', undefined, businesses.b)).status, 403,
        'listBlocks is business-scoped, not RLS-only');
      assert.equal((await call(`/api/provider/venues/${listingA}/blocks`, 'ownerB', 'POST',
        { startsAt: '2027-06-04T09:00:00.000Z', endsAt: '2027-06-04T13:00:00.000Z' }, businesses.b)).status, 403);
      assert.equal((await call(`/api/provider/venues/${listingA}/seasonal-rate`, 'ownerB', 'PUT',
        { startDate: '2027-07-01', endDate: '2027-07-05', rateRupees: 3000, slotType: 'hourly' }, businesses.b)).status, 403);
      assert.equal((await call(`/api/provider/venues/${listingA}/blocks`, 'ownerA', 'GET', undefined, businesses.b)).status, 403,
        'a real provider cannot select a business that is not theirs');
      assert.equal((await call(`/api/provider/venues/${listingA}/blocks`, 'ownerA', 'GET', undefined, randomUUID())).status, 403,
        'a forged business selection is refused');
    });

    await t.test('a provider without a business selection is authorized from memberships', async () => {
      assert.equal((await call(`/api/provider/venues/${listingA}/blocks`, 'ownerA')).status, 200,
        'the owning business is derived server-side, never silently skipped');
      assert.equal((await call(`/api/provider/venues/${listingA}/blocks`, 'ownerB')).status, 403,
        'a provider without a selection cannot reach another business listing');
      assert.equal((await call(`/api/provider/venues/${listingLegacy}/booking-settings`, 'ownerA', 'PUT', settingsBody())).status, 200,
        'a pre-business listing stays reachable for its own owner');
      assert.equal((await call(`/api/provider/venues/${listingLegacy}/booking-settings`, 'ownerB', 'PUT', settingsBody())).status, 403,
        'a pre-business listing is not reachable for anyone else');
    });

    await t.test('booking-scoped methods resolve the booking to its listing', async () => {
      assert.equal((await call(`/api/venue-bookings/${bookingId}/actions`, 'ownerB', 'POST', { action: 'accept' }, businesses.b)).status, 403,
        'another business cannot act on the booking');
      assert.equal((await call(`/api/venue-bookings/${bookingId}/actions`, 'ownerB', 'POST', { action: 'accept' })).status, 403);
      assert.equal((await call(`/api/provider/venue-bookings/${bookingId}/reschedule`, 'ownerB', 'PATCH',
        { startsAt: '2027-06-11T10:00:00.000Z', endsAt: '2027-06-11T12:00:00.000Z', slotType: 'hourly' }, businesses.b)).status, 403);
      assert.equal((await call(`/api/provider/venue-bookings/${bookingId}/reschedule`, 'ownerA', 'PATCH',
        { startsAt: '2027-06-11T10:00:00.000Z', endsAt: '2027-06-11T12:00:00.000Z', slotType: 'hourly' }, businesses.a)).status, 200,
        'the owning provider reschedules their own booking');
      assert.equal((await call(`/api/venue-bookings/${bookingId}/actions`, 'ownerA', 'POST', { action: 'accept' }, businesses.a)).status, 200,
        'the owning provider accepts their own booking');
      const opened = await call(`/api/venue-bookings/${bookingId}/disputes`, 'ownerA', 'POST',
        { reason: 'Provider opened a dispute about this reservation' }, businesses.a);
      assert.equal(opened.status, 201, 'a provider dispute is resolved through its booking');
      disputeId = (await opened.json()).dispute.id;
      assert.equal((await call(`/api/venue-bookings/${bookingId}/disputes`, 'ownerB', 'POST',
        { reason: 'Another business must not join this dispute' }, businesses.b)).status, 403);
    });

    await t.test('owner scope lists bookings without treating them as a listing id', async () => {
      const scoped = await call('/api/venue-bookings?scope=owner', 'ownerA', 'GET', undefined, businesses.a);
      assert.equal(scoped.status, 200);
      assert.equal((await scoped.json()).bookings.length, 2, 'both of this provider bookings are listed');
      assert.equal((await call('/api/venue-bookings?scope=owner', 'ownerA')).status, 200);
      assert.equal((await call('/api/venue-bookings?scope=owner', 'ownerA', 'GET', undefined, randomUUID())).status, 403,
        'a forged business selection is refused for owner scope');
      const other = await call('/api/venue-bookings?scope=owner', 'ownerB', 'GET', undefined, businesses.b);
      assert.equal(other.status, 200);
      assert.equal((await other.json()).bookings.length, 0, 'tenants never see each other bookings');
    });

    await t.test('admin authorization is global, not business-scoped', async () => {
      assert.equal((await call('/api/venue-bookings?scope=admin', 'admin', 'GET', undefined, businesses.a)).status, 200,
        'admin scope is not narrowed by a business header');
      assert.equal((await call(`/api/admin/venue-disputes/${disputeId}/resolve`, 'ownerA', 'POST',
        { resolution: 'Providers may not resolve disputes' }, businesses.a)).status, 403);
      assert.equal((await call(`/api/admin/venue-disputes/${disputeId}/resolve`, 'admin', 'POST',
        { resolution: 'Refund verified by the operations team.' }, businesses.b)).status, 200,
        'an admin resolves a dispute whatever business they last selected');
      const context = await repo.notificationContext({ ...actors.ownerA, businessId: businesses.a }, bookingId);
      assert.equal(context.bookingId, bookingId, 'the provider party gets a notification context');
      await assert.rejects(
        () => repo.notificationContext({ ...actors.ownerB, businessId: businesses.b }, bookingId),
        (error) => error.code === 'VENUE_BOOKING_NOT_FOUND' && error.status === 404,
        'a non-party provider is refused and the error reaches the caller',
      );
    });

    await t.test('authorization results are stable across a repository and server restart', async () => {
      await new Promise((resolve) => server.close(resolve));
      server = null;
      await repo.close();
      repo = new VenueBookingRepository(dbUrl);
      server = await startHttp();
      assert.equal((await call(`/api/provider/venues/${listingA}/blocks`, 'ownerB', 'GET', undefined, businesses.b)).status, 403);
      assert.equal((await call(`/api/provider/venues/${listingA}/blocks`, 'ownerA', 'GET', undefined, businesses.a)).status, 200);
      assert.equal((await call(`/api/venues/${listingB}/booking-settings`, 'ownerA', 'GET', undefined, businesses.a)).status, 200);
      const scoped = await call('/api/venue-bookings?scope=owner', 'ownerA', 'GET', undefined, businesses.a);
      assert.equal((await scoped.json()).bookings.length, 2, 'both of this provider bookings are listed');
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await repo.close().catch(() => {});
    const listings = [listingA, listingB, listingLegacy];
    await pool.query('delete from public.venue_booking_disputes where booking_id in (select id from public.venue_bookings where listing_id = any($1::text[]))', [listings]).catch(() => {});
    await pool.query('delete from public.venue_booking_events where booking_id in (select id from public.venue_bookings where listing_id = any($1::text[]))', [listings]).catch(() => {});
    await pool.query('delete from public.venue_payment_intents where booking_id in (select id from public.venue_bookings where listing_id = any($1::text[]))', [listings]).catch(() => {});
    await pool.query('delete from public.venue_bookings where listing_id = any($1::text[])', [listings]).catch(() => {});
    await pool.query('delete from public.venue_seasonal_rates where listing_id = any($1::text[])', [listings]).catch(() => {});
    await pool.query('delete from public.venue_blocks where listing_id = any($1::text[])', [listings]).catch(() => {});
    await pool.query('delete from public.venue_booking_settings where listing_id = any($1::text[])', [listings]).catch(() => {});
    await pool.query('delete from public.venue_category_events where category_id=$1', [categoryId]).catch(() => {});
    await pool.query('delete from public.venue_categories where category_id=$1', [categoryId]).catch(() => {});
    await pool.query('delete from public.listings where id = any($1::text[])', [listings]).catch(() => {});
    await pool.query('delete from public.businesses where id = any($1::uuid[])', [[businesses.a, businesses.b]]).catch(() => {});
    for (const id of Object.values(ids)) {
      await pool.query('delete from public.profiles where id=$1', [id]).catch(() => {});
      await pool.query('delete from auth.users where id=$1', [id]).catch(() => {});
    }
    await pool.end();
  }
});

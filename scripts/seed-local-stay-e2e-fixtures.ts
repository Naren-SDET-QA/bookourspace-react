/**
 * Adds explicitly labeled, bookable Stay E2E fixtures to the disposable local
 * BookOurSpace PostgreSQL database. It never targets hosted or production DBs.
 * Run with BOS_LOCAL_STAY_E2E_SEED=true and the canonical local connection.
 */
import { Client } from 'pg';
import {
  assertLocalStayE2EFixtureTarget,
  LOCAL_STAY_E2E_ADMIN_ID,
  LOCAL_STAY_E2E_FIXTURES,
  LOCAL_STAY_E2E_HOST_ID,
} from '../src/server/localStayE2EFixtures';

const connectionString = String(process.env.BOS_LISTINGS_DATABASE_URL || '').trim();
try {
  assertLocalStayE2EFixtureTarget(connectionString);
} catch (error) {
  console.error(`[stay-e2e-fixtures] ${error instanceof Error ? error.message : 'LOCAL_STAY_E2E_PREFLIGHT_FAILED'}`);
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const identity = await client.query(
      `select current_database() as database_name,
              case when inet_server_addr() <<= inet '127.0.0.0/8' or inet_server_addr() = inet '::1'
                then true else false end as loopback_server`,
    );
    if (identity.rows[0]?.database_name !== 'bookourspace_dev' || identity.rows[0]?.loopback_server !== true) {
      throw new Error('LOCAL_STAY_E2E_DATABASE_IDENTITY_MISMATCH');
    }

    await client.query('BEGIN');
    const priorAdmin = await client.query(
      `select role, account_status, is_super_admin from public.profiles where id=$1`,
      [LOCAL_STAY_E2E_ADMIN_ID],
    );
    if (priorAdmin.rowCount && (
      priorAdmin.rows[0].role !== 'admin'
      || priorAdmin.rows[0].account_status !== 'active'
      || priorAdmin.rows[0].is_super_admin !== true
    )) {
      throw new Error('LOCAL_STAY_E2E_ADMIN_ID_CONFLICT');
    }
    await client.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, 'local.e2e.admin@bookourspace.invalid', '{"full_name":"Local E2E Admin"}'::jsonb)
       on conflict (id) do nothing`,
      [LOCAL_STAY_E2E_ADMIN_ID],
    );
    if (!priorAdmin.rowCount) {
      await client.query(
        `update public.profiles
            set email='local.e2e.admin@bookourspace.invalid', full_name='Local E2E Admin',
                role='admin', account_status='active', verified=true, is_super_admin=true
          where id=$1`,
        [LOCAL_STAY_E2E_ADMIN_ID],
      );
    }
    const [host, admin] = await Promise.all([
      client.query(`select role, account_status, verified from public.profiles where id=$1`, [LOCAL_STAY_E2E_HOST_ID]),
      client.query(`select role, account_status, is_super_admin from public.profiles where id=$1`, [LOCAL_STAY_E2E_ADMIN_ID]),
    ]);
    if (host.rows[0]?.role !== 'provider' || host.rows[0]?.account_status !== 'active' || host.rows[0]?.verified !== true) {
      throw new Error('LOCAL_STAY_E2E_HOST_PROFILE_UNAVAILABLE');
    }
    if (admin.rows[0]?.role !== 'admin' || admin.rows[0]?.account_status !== 'active' || admin.rows[0]?.is_super_admin !== true) {
      throw new Error('LOCAL_STAY_E2E_ADMIN_PROFILE_UNAVAILABLE');
    }

    // Evaluate protected listing lifecycle writes as the explicit local test
    // admin. This is a fixture bootstrap, not an HTTP/admin-session bypass.
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [LOCAL_STAY_E2E_ADMIN_ID]);
    await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
    await client.query(
      `select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: LOCAL_STAY_E2E_ADMIN_ID, role: 'authenticated' })],
    );

    let created = 0;
    for (const fixture of LOCAL_STAY_E2E_FIXTURES) {
      const existing = await client.query(
        `select l.owner_id, l.payload->>'localTestFixture' as is_fixture,
                p.listing_id is not null as has_property
           from public.listings l left join public.stay_properties p on p.listing_id=l.id
          where l.id=$1 for update of l`,
        [fixture.listingId],
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (String(row.owner_id) !== LOCAL_STAY_E2E_HOST_ID || row.is_fixture !== 'true' || row.has_property !== true) {
          throw new Error(`LOCAL_STAY_E2E_FIXTURE_ID_CONFLICT:${fixture.listingId}`);
        }
        continue;
      }

      await client.query(
        `insert into public.listings
           (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit,
            status, payload, is_verified, verified_by, verified_at)
         values ($1,$2,$3,'hotel_stay',$4,'stay',$5,'/night','active',$6::jsonb,true,$7,now())`,
        [fixture.listingId, LOCAL_STAY_E2E_HOST_ID, fixture.title, fixture.propertyType,
          fixture.pricePaise / 100, JSON.stringify({
            description: 'Synthetic local-only listing for stay booking E2E. No real property is represented.',
            location: { city: fixture.city, area: fixture.area },
            amenities: fixture.amenities,
            images: [],
            localTestFixture: true,
            demo: false,
            stayLifecycle: 'approved',
          }), LOCAL_STAY_E2E_ADMIN_ID],
      );
      const property = await client.query(
        `insert into public.stay_properties
           (listing_id, owner_user_id, name, property_type, city, area, address,
            base_price_paise, tax_percent, cleaning_fee_paise, service_fee_bps, description,
            amenities, bedrooms, beds, bathrooms, max_guests, instant_book,
            cancellation_policy, cancellation_free_hours, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,0,0,0,$9,$10::text[],1,1,1,$11,true,'flexible',24,true)
         returning id`,
        [fixture.listingId, LOCAL_STAY_E2E_HOST_ID, fixture.title, fixture.propertyType,
          fixture.city, fixture.area, `${fixture.area}, ${fixture.city}`, fixture.pricePaise,
          'Synthetic local-only stay fixture for booking flow tests.', fixture.amenities, fixture.maxGuests],
      );
      const room = await client.query(
        `insert into public.stay_room_types
           (property_id, name, max_adults, max_children, base_price_paise, amenities, bedrooms, beds, bathrooms)
         values ($1,'LOCAL TEST ROOM',$2,1,$3,$4::text[],1,1,1) returning id`,
        [property.rows[0].id, fixture.maxGuests, fixture.pricePaise, fixture.amenities],
      );
      await client.query(
        `insert into public.stay_units (room_type_id, label) values ($1,'LOCAL-TEST-1'),($1,'LOCAL-TEST-2')`,
        [room.rows[0].id],
      );
      created += 1;
    }

    await client.query('COMMIT');
    console.log(`[stay-e2e-fixtures] ready: ${LOCAL_STAY_E2E_FIXTURES.length} local-only properties (${created} added).`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve the original error */ }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[stay-e2e-fixtures] ${error instanceof Error ? error.message : 'SEED_FAILED'}`);
  process.exit(1);
});

/**
 * Local DEV only. Seeds one assigned GPS booking between the demo customer and
 * demo services provider so customer/provider tracking screens can be opened.
 * Never talks to hosted Mumbai.
 */
import { Client } from 'pg';

const connectionString = String(process.env.BOS_LISTINGS_DATABASE_URL || '').trim();
if (!connectionString) {
  console.error('BOS_LISTINGS_DATABASE_URL is required.');
  process.exit(1);
}

const PROVIDER_ID = 'a11a0000-1111-4111-8111-000000000006';
const CUSTOMER_ID = 'a11a0000-1111-4111-8111-000000000002';
const LISTING_ID = 'demo-gps-water-can';
const BOOKING_ID = 'c0a11e00-1111-4111-8111-000000000101';

const configSnapshot = {
  schemaVersion: 1,
  name: 'Water Can Delivery',
  description: '20L water can home delivery with live GPS',
  icon: 'droplet',
  imageUrl: '',
  accentColor: '#0284c7',
  deliveryKind: 'water_delivery',
  bookingType: 'on_demand',
  providerAssignment: 'customer_selects',
  deliveryModes: ['home_delivery'],
  pricing: { mode: 'fixed', amount: 90, currency: 'INR', unit: 'per can', quantityEnabled: true, minQuantity: 1, maxQuantity: 10 },
  recurring: { enabled: false, frequencies: ['weekly'], defaultFrequency: 'weekly', maxOccurrences: 12 },
  toggles: {
    gpsTracking: true,
    liveMap: true,
    customerOtp: true,
    prescriptionVerification: false,
    documentVerification: false,
    payment: true,
    deliveryConfirmation: true,
  },
  fields: [],
  documents: [],
  approvalWorkflow: { requiresProviderAcceptance: true, requiresDocumentVerification: false, requiresAdminApproval: false },
  validation: { minLeadTimeMinutes: 0, maxAdvanceDays: 30, requiresServiceAddress: true, requiresPhone: true, notesRequired: false },
  legacyCategoryIds: [],
  requiresLicensedPharmacy: false,
};

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    const provider = await client.query(`select id, role from public.profiles where id = $1`, [PROVIDER_ID]);
    const customer = await client.query(`select id, role from public.profiles where id = $1`, [CUSTOMER_ID]);
    if (!provider.rows[0] || !customer.rows[0]) {
      throw new Error('Demo profiles missing. Start npm run dev:local once so seed-stays-demo can create them.');
    }

    const business = await client.query(
      `select id from public.businesses where owner_user_id = $1 and module_type = 'services' limit 1`,
      [PROVIDER_ID],
    );
    const businessId = business.rows[0]?.id || null;

    await client.query(
      `insert into public.listings
         (id, owner_id, business_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload, is_verified)
       values ($1, $2, $3, 'Live GPS Water Can', 'water_delivery', '20L can', 'service', 90, 'per can', 'active',
               '{"sectionType":"services"}'::jsonb, true)
       on conflict (id) do update set
         owner_id = excluded.owner_id,
         business_id = coalesce(excluded.business_id, public.listings.business_id),
         status = 'active',
         title = excluded.title`,
      [LISTING_ID, PROVIDER_ID, businessId],
    );

    await client.query(
      `insert into public.service_bookings
         (id, idempotency_key, listing_id, customer_id, provider_id, category_id, subcategory,
          scheduled_date, time_slot, slot_key, service_address, customer_phone, notes,
          status, payment_mode, payment_status, amount, amount_basis, quantity,
          assignment_mode, delivery_mode, config_snapshot, helper_assigned_at, accepted_at)
       values ($1, 'aaaaaaaa-1111-4111-8111-000000000101', $2, $3, $4, 'water_delivery', '20L can',
               current_date + 1, '10:00', '10:00', 'Plot 12, Hitech City, Madhapur, Hyderabad', '9000000002',
               'Local GPS engine review booking',
               'accepted', 'pay_after_service', 'due', 90, 'per can', 1,
               'customer_selects', 'home_delivery', $5::jsonb, now(), now())
       on conflict (id) do update set
         status = 'accepted',
         helper_assigned_at = coalesce(public.service_bookings.helper_assigned_at, now()),
         tracking_stopped_at = null,
         config_snapshot = excluded.config_snapshot`,
      [BOOKING_ID, LISTING_ID, CUSTOMER_ID, PROVIDER_ID, JSON.stringify(configSnapshot)],
    );

    await client.query(
      `update public.service_bookings
          set tracking_started_at = now(), tracking_stopped_at = null
        where id = $1`,
      [BOOKING_ID],
    );
    await client.query(
      `update public.service_delivery_profiles
          set tracking_enabled = true,
              live_map_enabled = true,
              otp_enabled = true,
              destination_latitude = 17.4483,
              destination_longitude = 78.3915,
              assignee_kind = 'provider',
              assignee_id = $2,
              assignee_label = 'BookOurSpace Demo Services',
              vehicle_label = 'Water can tempo · TS 09 AB 4421',
              journey_status = 'en_route',
              updated_at = now()
        where booking_id = $1`,
      [BOOKING_ID, PROVIDER_ID],
    );
    await client.query(
      `insert into public.service_tracking_locations
         (booking_id, actor_id, actor_role, latitude, longitude, accuracy_meters, speed_mps, captured_at, source)
       values ($1, $2, 'helper', 17.4401, 78.3489, 18, 5.5, now(), 'device_gps')`,
      [BOOKING_ID, PROVIDER_ID],
    );

    await client.query('COMMIT');
    const row = await client.query(
      `select b.booking_ref, b.status, p.tracking_enabled, p.assignee_label, p.vehicle_label
         from public.service_bookings b
         join public.service_delivery_profiles p on p.booking_id = b.id
        where b.id = $1`,
      [BOOKING_ID],
    );
    console.log('[gps-seed]', row.rows[0]);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

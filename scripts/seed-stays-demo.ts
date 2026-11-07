/**
 * Development-only stay inventory bootstrap.
 *
 * It converts the existing hardcoded Airbnb-style catalog into real rows in a
 * throwaway local PostgreSQL database so every filter, detail page, calendar
 * and booking action can be exercised locally. Nothing here runs in production
 * and no image is copied or uploaded: listings keep their existing CDN URLs.
 */
import { Client } from 'pg';
import { airbnbListings, type AirbnbListing } from '../src/data/airbnbIndiaData';

const connectionString = String(process.env.BOS_LISTINGS_DATABASE_URL || '').trim();
if (!connectionString) {
  console.error('BOS_LISTINGS_DATABASE_URL is required.');
  process.exit(1);
}

const HOST_ID = 'a11a0000-1111-4111-8111-000000000001';
const CUSTOMER_IDS = [
  'a11a0000-1111-4111-8111-000000000002',
  'a11a0000-1111-4111-8111-000000000003',
  'a11a0000-1111-4111-8111-000000000004',
];

const CITY_COORDINATES: Record<string, [number, number]> = {
  Kerala: [10.8505, 76.2711],
  Goa: [15.2993, 74.124],
  Rajasthan: [27.0238, 74.2179],
  'Himachal Pradesh': [31.1048, 77.1734],
  Maharashtra: [19.7515, 75.7139],
  Karnataka: [15.3173, 75.7139],
  Uttarakhand: [30.0668, 79.0193],
  Coorg: [12.3375, 75.8069],
  Puducherry: [11.9416, 79.8083],
  'Tamil Nadu': [11.1271, 78.6569],
  Andaman: [11.7401, 92.6586],
};

function coordinatesForCity(city: string): [number, number] {
  return CITY_COORDINATES[city] || [20.5937, 78.9629];
}

function splitLocation(location: string): { city: string; area: string } {
  const parts = location.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { area: parts[0], city: parts[1] };
  return { area: '', city: parts[0] || 'India' };
}

function propertyTypeOf(listing: AirbnbListing, index: number): string {
  // Guarantee every shared Stay category has at least one sample property.
  if (index === 5) return 'resort';
  if (index === 7) return 'guest_house';
  const type = listing.type.toLowerCase();
  if (type.includes('cottage') || type.includes('farm')) return 'resort';
  if (type.includes('villa') || type.includes('cottage') || type.includes('castle')) return 'villa';
  if (type.includes('apartment')) return 'apartment';
  if (type.includes('resort')) return 'resort';
  if (type.includes('hotel')) return 'hotel';
  if (type.includes('houseboat') || type.includes('cabin') || type.includes('tiny')) return 'lodge';
  if (type.includes('farm') || type.includes('private room')) return 'homestay';
  if (type.includes('house')) return 'house';
  return 'apartment';
}

function placeTypeOf(listing: AirbnbListing): string {
  const type = listing.type.toLowerCase();
  if (type.includes('shared')) return 'shared_room';
  if (type.includes('private room') || type.includes('room')) return 'private_room';
  return 'entire_home';
}

function languagesOf(index: number, host: string): string[] {
  const pools = [
    ['English'],
    ['English', 'Hindi'],
    ['English', 'Kannada'],
    ['English', 'Tamil'],
    ['English', 'Telugu'],
    ['English', 'French'],
    ['English', 'Marathi'],
    ['Hindi'],
  ];
  return pools[index % pools.length];
}

function accessibilityOf(index: number): string[] {
  if (index % 5 === 0) return ['Step-free entrance', 'Accessible parking', 'Grab bars'];
  if (index % 3 === 0) return ['Step-free entrance'];
  if (index % 7 === 0) return ['Wide entrance', 'Shower chair'];
  return [];
}

function reviewRatings(listing: AirbnbListing, count: number): number[] {
  const target = Math.max(1, Math.min(5, Math.round(listing.rating)));
  if (target >= 5) {
    return Array.from({ length: count }, (_, index) => (index === count - 1 && listing.rating < 5 ? 4 : 5));
  }
  return Array.from({ length: count }, (_, index) => (index % 3 === 0 ? target + 1 : target)).map((value) => Math.min(5, value));
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const existing = await client.query(`select count(*)::int as count from public.stay_properties`);
    if (Number(existing.rows[0].count) > 0) {
      console.log(`[stays-demo] ${existing.rows[0].count} stay properties already exist; keeping them.`);
      return;
    }

    await client.query('BEGIN');
    // Guest display names must pass the same booking-contact validator the
    // checkout enforces (letters, spaces, apostrophes and hyphens only), so the
    // prefilled name on "Confirm and pay" is never rejected out of the box.
    const guestNames = ['Demo Guest One', 'Demo Guest Two', 'Demo Guest Three'];
    for (const [index, id] of CUSTOMER_IDS.entries()) {
      await client.query(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ($1, $2, '{}'::jsonb) on conflict (id) do nothing`,
        [id, `demo.guest.${index + 1}@bookourspace.local`],
      );
      await client.query(
        `update public.profiles set full_name = $2, role = 'customer', account_status = 'active'
          where id = $1`,
        [id, guestNames[index] || 'Demo Guest'],
      );
    }
    await client.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, 'demo.host@bookourspace.local', '{}'::jsonb) on conflict (id) do nothing`,
      [HOST_ID],
    );
    await client.query(
      `update public.profiles set full_name = 'BookOurSpace Demo Hosts', role = 'provider',
          account_status = 'active', city = 'Goa', verified = true
        where id = $1`,
      [HOST_ID],
    );

    for (const [index, listing] of airbnbListings.entries()) {
      const listingId = `demo-${listing.id}`;
      const { city, area } = splitLocation(listing.location);
      const propertyType = propertyTypeOf(listing, index);
      const placeType = placeTypeOf(listing);
      const pricePaise = Math.round(listing.pricePerNight * 100);
      const instantBook = index % 2 === 0;
      const selfCheckIn = index % 3 !== 0;
      const petsAllowed = listing.amenities.some((amenity) => /pet/i.test(amenity));
      const guestFavourite = listing.superhost || listing.rating >= 4.9;
      const luxeVerified = listing.category === 'luxe' || (listing.superhost && listing.pricePerNight >= 15000);
      const languages = languagesOf(index, listing.host);
      const accessibility = accessibilityOf(index);
      const taxPercent = 12;
      const cleaningFeePaise = index % 4 === 0 ? 50000 : 0;
      const serviceFeeBps = index % 3 === 0 ? 300 : 0;

      await client.query(
        `insert into public.listings
           (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
         values ($1, $2, $3, 'stay-hotel', $4, 'stay', $5, '/night', 'active', $6::jsonb)
         on conflict (id) do nothing`,
        [
          listingId,
          HOST_ID,
          listing.title,
          listing.type,
          listing.pricePerNight,
          JSON.stringify({
            description: listing.description,
            location: { city, area },
            images: listing.images,
            amenities: listing.amenities,
            provider: { name: listing.host },
            demo: true,
            stayLifecycle: 'approved',
          }),
        ],
      );

      await client.query(
        `insert into public.stay_properties
           (listing_id, owner_user_id, name, property_type, place_type, city, area, address,
            base_price_paise, tax_percent, cleaning_fee_paise, service_fee_bps, description,
            amenities, bedrooms, beds, bathrooms, max_guests, instant_book, self_check_in,
            pets_allowed, guest_favourite, luxe_verified, host_languages, accessibility,
            cancellation_policy, cancellation_free_hours, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::text[],$15,$16,$17,$18,
                 $19,$20,$21,$22,$23,$24::text[],$25::text[],$26,$27,true)`,
        [
          listingId, HOST_ID, listing.title, propertyType, placeType, city, area,
          `${area ? `${area}, ` : ''}${city}`, pricePaise, taxPercent,
          cleaningFeePaise, serviceFeeBps, listing.description, listing.amenities,
          listing.bedrooms, listing.beds, listing.baths, listing.guests,
          instantBook, selfCheckIn, petsAllowed, guestFavourite, luxeVerified,
          languages, accessibility,
          index % 5 === 0 ? 'flexible' : index % 4 === 0 ? 'strict' : 'moderate',
          index % 5 === 0 ? 24 : index % 4 === 0 ? 168 : 48,
        ],
      );

      const room = await client.query(
        `insert into public.stay_room_types
           (property_id, name, max_adults, max_children, base_price_paise, amenities,
            bedrooms, beds, bathrooms, is_active)
         select p.id, $2, $3, 2, $4, $5::text[], $6, $7, $8, true
           from public.stay_properties p where p.listing_id = $1
         returning id`,
        [
          listingId, `${listing.type} · ${listing.host}`, listing.guests, pricePaise,
          listing.amenities, listing.bedrooms, listing.beds, listing.baths,
        ],
      );
      const roomId = room.rows[0].id;
      for (const label of ['A', 'B']) {
        await client.query(
          `insert into public.stay_units (room_type_id, label) values ($1, $2)`,
          [roomId, label],
        );
      }

      const count = Math.min(12, Math.max(3, listing.reviewCount));
      const ratings = reviewRatings(listing, count);
      for (let reviewIndex = 0; reviewIndex < ratings.length; reviewIndex += 1) {
        await client.query(
          `insert into public.reviews (id, user_id, listing_id, customer_name, rating, comment, payload)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb)
           on conflict (id) do nothing`,
          [
            `demo-review-${listing.id}-${reviewIndex}`,
            CUSTOMER_IDS[reviewIndex % CUSTOMER_IDS.length],
            listingId,
            ['Aarav', 'Meera', 'Kabir', 'Ananya', 'Rhea'][reviewIndex % 5],
            ratings[reviewIndex],
            reviewIndex === 0
              ? `${listing.title} matched the photos and the host was responsive.`
              : 'Exactly as described. Would stay again.',
            JSON.stringify({ demo: true }),
          ],
        );
      }
    }

    await client.query('COMMIT');
    const counts = await client.query(
      `select (select count(*) from public.stay_properties) as properties,
              (select count(*) from public.stay_room_types) as rooms,
              (select count(*) from public.stay_units) as units,
              (select count(*) from public.reviews where payload ? 'demo') as reviews`,
    );
    console.log('[stays-demo] seeded', counts.rows[0]);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[stays-demo] seed failed', error);
  process.exit(1);
});

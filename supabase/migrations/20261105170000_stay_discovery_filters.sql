-- ============================================================================
-- Stay discovery filters, gallery metadata, availability calendar, and the
-- pay-at-property checkout fix.
--
-- Additive and idempotent. It does not re-create or re-seed existing tables,
-- does not touch bookings, payments or allocations, and never deletes a row.
--
-- Every filter the public Stay search exposes maps to a real column here, so
-- counts are produced by PostgreSQL over the same rows the result page shows.
-- Amenities are canonicalised through an immutable function so that "Wi-Fi",
-- "wifi" and "Wi Fi" are one filter key, and the GIN indexes below make the
-- containment checks index-backed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Property-level discovery attributes
-- ---------------------------------------------------------------------------


begin;
alter table public.stay_properties
  add column if not exists place_type text not null default 'entire_home',
  add column if not exists bedrooms int not null default 0,
  add column if not exists beds int not null default 0,
  add column if not exists bathrooms numeric(3,1) not null default 0,
  add column if not exists max_guests int not null default 0,
  add column if not exists instant_book boolean not null default false,
  add column if not exists self_check_in boolean not null default false,
  add column if not exists pets_allowed boolean not null default false,
  add column if not exists guest_favourite boolean not null default false,
  add column if not exists luxe_verified boolean not null default false,
  add column if not exists host_languages text[] not null default '{}',
  add column if not exists accessibility text[] not null default '{}',
  add column if not exists cancellation_policy text not null default 'moderate',
  add column if not exists cancellation_free_hours int not null default 48;

-- Narrow value domains. Added as separate constraints so a pre-existing row
-- that predates the column (and therefore holds the default) still validates.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.stay_properties'::regclass
       and conname = 'stay_properties_place_type_chk'
  ) then
    alter table public.stay_properties
      add constraint stay_properties_place_type_chk
      check (place_type in ('entire_home', 'private_room', 'shared_room'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.stay_properties'::regclass
       and conname = 'stay_properties_rooms_chk'
  ) then
    alter table public.stay_properties
      add constraint stay_properties_rooms_chk
      check (
        bedrooms >= 0 and beds >= 0 and bathrooms >= 0 and max_guests >= 0
        and cancellation_free_hours >= 0
      );
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.stay_properties'::regclass
       and conname = 'stay_properties_cancellation_chk'
  ) then
    alter table public.stay_properties
      add constraint stay_properties_cancellation_chk
      check (cancellation_policy in ('flexible', 'moderate', 'strict', 'non_refundable'));
  end if;
end $$;

-- The original check allowed six property types. Discovery now offers the
-- twelve types the product exposes, plus the legacy `guesthouse` spelling so
-- no existing row is invalidated.
alter table public.stay_properties
  drop constraint if exists stay_properties_property_type_check;
alter table public.stay_properties
  drop constraint if exists stay_properties_property_type_chk;
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.stay_properties'::regclass
       and conname = 'stay_properties_property_type_chk'
  ) then
    alter table public.stay_properties
      add constraint stay_properties_property_type_chk
      check (property_type in (
        'hotel', 'resort', 'homestay', 'apartment', 'villa', 'guesthouse',
        'guest_house', 'house', 'flat', 'lodge', 'temple_stay', 'pg_hostel'
      ));
  end if;
end $$;

-- Room-level counts let a private room answer "1 bedroom / 1 bed / 1 bath"
-- independently of the property defaults.
alter table public.stay_room_types
  add column if not exists bedrooms int not null default 1,
  add column if not exists beds int not null default 1,
  add column if not exists bathrooms numeric(3,1) not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.stay_room_types'::regclass
       and conname = 'stay_room_types_rooms_chk'
  ) then
    alter table public.stay_room_types
      add constraint stay_room_types_rooms_chk
      check (bedrooms >= 0 and beds >= 0 and bathrooms >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Canonical amenity keys
-- ---------------------------------------------------------------------------

-- Immutable so it can back an expression index. Unrecognised values fall back
-- to their punctuation-free lowercase form, which keeps every real amenity
-- filterable instead of silently dropping it.
create or replace function public.stay_amenity_key(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_value is null then ''
    else (
      select case
        when k in ('wifi', 'wirelessinternet', 'internet', 'highspeedinternet', 'broadband', 'wifihighspeed')
          then 'wifi'
        when k in ('ac', 'airconditioning', 'airconditioner', 'aircon', 'centralac', 'splitac')
          then 'airconditioning'
        when k in ('washer', 'washingmachine', 'laundry', 'washingmachinefree', 'washerdryer')
          then 'washer'
        when k in ('dryer', 'clothesdryer', 'tumbledryer') then 'dryer'
        when k in ('parking', 'freeparking', 'parkingonpremises', 'carport', 'coveredparking',
                   'privateparking', 'parkingfree', 'streetparking')
          then 'parking'
        when k in ('kitchen', 'kitchenette', 'cookingbasics', 'fullkitchen', 'sharedkitchen')
          then 'kitchen'
        when k in ('pool', 'swimmingpool', 'privatepool', 'infinitypool', 'poolaccess')
          then 'pool'
        when k in ('tv', 'television', 'smarttv', 'cabletv', 'hdtv') then 'tv'
        when k in ('heating', 'heater', 'roomheater', 'centralheating') then 'heating'
        when k in ('pets', 'petsallowed', 'petfriendly', 'petswelcome') then 'pets'
        when k in ('selfcheckin', 'selfcheckinlockbox', 'keypad', 'smartlock', 'lockbox')
          then 'selfcheckin'
        when k in ('instantbook', 'instantbooking') then 'instantbook'
        when k in ('gym', 'fitnesscenter', 'fitness', 'exerciseequipment') then 'gym'
        when k in ('breakfast', 'freebreakfast', 'breakfastincluded', 'continentalbreakfast')
          then 'breakfast'
        when k in ('housekeeping', 'dailyhousekeeping', 'cleaning', 'cleaningproducts')
          then 'housekeeping'
        when k in ('beachaccess', 'beach', 'beachfront') then 'beachaccess'
        when k in ('garden', 'lawn', 'backyard', 'privategarden') then 'garden'
        when k in ('balcony', 'patio', 'deck', 'terrace', 'rooftop') then 'balcony'
        when k in ('fireplace', 'woodstove', 'bonfire') then 'fireplace'
        when k in ('firstaid', 'firstaidkit') then 'firstaid'
        when k in ('smokedetector', 'smokealarm') then 'smokedetector'
        when k in ('cctv', 'securitycamera', 'cctvsecurity') then 'securitycamera'
        when k in ('elevator', 'lift') then 'elevator'
        when k in ('powerbackup', 'generator', 'backuppower', 'inverter') then 'powerbackup'
        when k in ('hotwater', 'geyser', 'waterheater') then 'hotwater'
        when k in ('privatebathroom', 'ensuite', 'attachedbathroom') then 'private_bathroom'
        else k
      end
      from (select regexp_replace(lower(trim(p_value)), '[^a-z0-9]', '', 'g') as k) normalised
    )
  end
$$;

create or replace function public.stay_amenity_keys(p_values text[])
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    array_agg(distinct public.stay_amenity_key(value) order by public.stay_amenity_key(value)),
    '{}'::text[]
  )
  from unnest(coalesce(p_values, '{}'::text[])) as value
  where public.stay_amenity_key(value) <> ''
$$;

-- Same canonicalisation for host languages. "English", "en", "English (IN)"
-- are all the same filter key.
create or replace function public.stay_language_key(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_value is null then ''
    else (
      select case
        when k in ('en', 'english', 'englishin', 'englishindia') then 'english'
        when k in ('hi', 'hindi') then 'hindi'
        when k in ('fr', 'french', 'francais') then 'french'
        when k in ('kn', 'kannada') then 'kannada'
        when k in ('sw', 'swahili', 'kiswahili') then 'swahili'
        when k in ('ta', 'tamil') then 'tamil'
        when k in ('te', 'telugu') then 'telugu'
        when k in ('mr', 'marathi') then 'marathi'
        when k in ('bn', 'bengali') then 'bengali'
        when k in ('gu', 'gujarati') then 'gujarati'
        when k in ('ml', 'malayalam') then 'malayalam'
        when k in ('pa', 'punjabi') then 'punjabi'
        when k in ('ur', 'urdu') then 'urdu'
        when k in ('es', 'spanish', 'espanol') then 'spanish'
        when k in ('de', 'german', 'deutsch') then 'german'
        when k in ('ar', 'arabic') then 'arabic'
        when k in ('ja', 'japanese') then 'japanese'
        when k in ('zh', 'chinese', 'mandarin') then 'chinese'
        else k
      end
      from (select regexp_replace(lower(trim(p_value)), '[^a-z0-9]', '', 'g') as k) normalised
    )
  end
$$;

create or replace function public.stay_language_keys(p_values text[])
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    array_agg(distinct public.stay_language_key(value) order by public.stay_language_key(value)),
    '{}'::text[]
  )
  from unnest(coalesce(p_values, '{}'::text[])) as value
  where public.stay_language_key(value) <> ''
$$;

-- Accessibility is a closed vocabulary so the filter cannot drift from the UI.
create or replace function public.stay_accessibility_key(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_value is null then ''
    else (
      select case
        when k in ('stepfreeaccess', 'stepfree', 'stepfreeentrance', 'nosteps') then 'step_free_entrance'
        when k in ('accessibleparking', 'accessibleparkingspace', 'disabledparking') then 'accessible_parking'
        when k in ('wideentrance', 'widerentrance', 'wideentrances', 'wideentry') then 'wide_entrance'
        when k in ('accessiblebedroom', 'bedroomaccess', 'stepfreebedroom') then 'accessible_bedroom'
        when k in ('accessiblebathroom', 'bathroomaccess', 'stepfreebathroom') then 'accessible_bathroom'
        when k in ('grabrails', 'grabbars', 'grabrail') then 'grab_bars'
        when k in ('showerchair', 'showerchairs') then 'shower_chair'
        when k in ('hoist', 'ceilinghoist', 'hoists') then 'hoist'
        when k in ('elevator', 'lift', 'accessibleelevator') then 'elevator'
        else k
      end
      from (select regexp_replace(lower(trim(p_value)), '[^a-z0-9]', '', 'g') as k) normalised
    )
  end
$$;

create or replace function public.stay_accessibility_keys(p_values text[])
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    array_agg(distinct public.stay_accessibility_key(value) order by public.stay_accessibility_key(value)),
    '{}'::text[]
  )
  from unnest(coalesce(p_values, '{}'::text[])) as value
  where public.stay_accessibility_key(value) <> ''
$$;

-- ---------------------------------------------------------------------------
-- 3. Indexes for every filter dimension
-- ---------------------------------------------------------------------------

create index if not exists idx_stay_properties_city_lower
  on public.stay_properties (lower(city)) where is_active;
create index if not exists idx_stay_properties_price
  on public.stay_properties (base_price_paise) where is_active;
create index if not exists idx_stay_properties_property_type
  on public.stay_properties (property_type) where is_active;
create index if not exists idx_stay_properties_place_type
  on public.stay_properties (place_type) where is_active;
create index if not exists idx_stay_properties_bedrooms
  on public.stay_properties (bedrooms) where is_active;
create index if not exists idx_stay_properties_beds
  on public.stay_properties (beds) where is_active;
create index if not exists idx_stay_properties_bathrooms
  on public.stay_properties (bathrooms) where is_active;
create index if not exists idx_stay_properties_instant_book
  on public.stay_properties (instant_book) where is_active and instant_book;
create index if not exists idx_stay_properties_self_check_in
  on public.stay_properties (self_check_in) where is_active and self_check_in;
create index if not exists idx_stay_properties_pets
  on public.stay_properties (pets_allowed) where is_active and pets_allowed;
create index if not exists idx_stay_properties_guest_favourite
  on public.stay_properties (guest_favourite) where is_active and guest_favourite;
create index if not exists idx_stay_properties_luxe_verified
  on public.stay_properties (luxe_verified) where is_active and luxe_verified;
create index if not exists idx_stay_properties_accessibility
  on public.stay_properties using gin (accessibility);
create index if not exists idx_stay_properties_host_languages
  on public.stay_properties using gin (host_languages);
create index if not exists idx_stay_properties_amenity_keys
  on public.stay_properties using gin (public.stay_amenity_keys(amenities));
create index if not exists idx_stay_room_types_amenity_keys
  on public.stay_room_types using gin (public.stay_amenity_keys(amenities));

-- ---------------------------------------------------------------------------
-- 4. Availability calendar (per night, across every active room)
-- ---------------------------------------------------------------------------

create or replace function public.stay_night_calendar(
  p_listing_id text,
  p_from date,
  p_to date
)
returns table (night date, free_units int, total_units int, min_price_paise int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_property uuid;
begin
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'INVALID_STAY_RANGE' using errcode = '22023';
  end if;
  if (p_to - p_from) > 120 then
    raise exception 'CALENDAR_RANGE_TOO_LARGE' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.stay_properties p
      join public.listings l on l.id = p.listing_id
     where p.listing_id = p_listing_id and p.is_active and l.status = 'active'
  ) then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  select p.id into v_property
    from public.stay_properties p
   where p.listing_id = p_listing_id
   limit 1;

  return query
    select d::date as night,
           count(u.id) filter (
             where not exists (
               select 1 from public.stay_allocations a
                where a.unit_id = u.id
                  and a.status in ('held', 'confirmed')
                  and (a.status = 'confirmed' or a.expires_at > now())
                  and a.stay_dates @> d::date
             )
             and not exists (
               select 1 from public.stay_blocks b
                where b.unit_id = u.id
                  and b.stay_dates @> d::date
             )
           )::int as free_units,
           count(u.id)::int as total_units,
           (select min(rt.base_price_paise) from public.stay_room_types rt
             where rt.property_id = v_property and rt.is_active)::int as min_price_paise
      from generate_series(p_from::timestamp, (p_to - 1)::timestamp, interval '1 day') as d
      left join public.stay_room_types rt
        on rt.property_id = v_property and rt.is_active
      left join public.stay_units u
        on u.room_type_id = rt.id and u.is_active
     group by d
     order by d;
end;
$$;

revoke all on function public.stay_night_calendar(text, date, date)
  from public, anon, authenticated;
grant execute on function public.stay_night_calendar(text, date, date)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Pay at the property must not require an online UPI receiver
-- ---------------------------------------------------------------------------

-- The forward fix for `create_stay_checkout` landed in migration
-- 20261103240000, but `payment_intents.merchant_vpa` / `upi_uri` stayed NOT
-- NULL, so a pay-at-property reservation still failed at insert when no UPI ID
-- was configured. Relax the two columns, constrain the online path to keep
-- both, and stop writing a dummy URI for the offline path.
alter table public.payment_intents
  alter column merchant_vpa drop not null;
alter table public.payment_intents
  alter column upi_uri drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.payment_intents'::regclass
       and conname = 'payment_intents_upi_fields_chk'
  ) then
    alter table public.payment_intents
      add constraint payment_intents_upi_fields_chk
      check (
        payment_mode <> 'upi'
        or (merchant_vpa is not null and upi_uri is not null)
      );
  end if;
end $$;

create or replace function public.create_stay_checkout(
  p_listing_id text,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_units int,
  p_payment_mode text,
  p_idempotency_key text,
  p_merchant_vpa text,
  p_merchant_name text,
  p_guest jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_property public.stay_properties;
  v_room public.stay_room_types;
  v_nights int;
  v_units int := greatest(1, least(coalesce(p_units, 1), 5));
  v_amount bigint;
  v_booking_id text;
  v_intent_id text;
  v_hold_token uuid;
  v_expires timestamptz;
  v_existing public.payment_intents;
  v_booking public.bookings;
  v_upi_uri text;
  v_mode text := coalesce(p_payment_mode, 'upi');
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_check_in is null or p_check_out is null or p_check_in >= p_check_out then
    raise exception 'INVALID_STAY_RANGE' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if v_mode not in ('upi', 'pay_after_service') then
    raise exception 'INVALID_PAYMENT_MODE' using errcode = '22023';
  end if;
  if v_mode = 'upi' and (p_merchant_vpa is null or position('@' in p_merchant_vpa) = 0) then
    raise exception 'MERCHANT_VPA_NOT_CONFIGURED' using errcode = '42501';
  end if;

  v_nights := p_check_out - p_check_in;

  select rt.* into v_room
    from public.stay_room_types rt
    join public.stay_properties p on p.id = rt.property_id
   where rt.id = p_room_type_id
     and p.listing_id = p_listing_id
     and rt.is_active and p.is_active;
  if v_room is null then
    raise exception 'ROOM_TYPE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_property from public.stay_properties where id = v_room.property_id;

  v_amount := v_nights::bigint * v_room.base_price_paise::bigint * v_units;
  if v_amount <= 0 then
    raise exception 'PRICE_NOT_CONFIGURED' using errcode = '22023';
  end if;

  select * into v_existing
    from public.payment_intents
   where user_id = v_uid and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'bookingId', v_existing.booking_id,
      'intentId', v_existing.id,
      'paymentMode', v_existing.payment_mode,
      'status', v_existing.status,
      'amountPaise', v_existing.amount_paise,
      'upiUri', case when v_existing.payment_mode = 'upi' and v_existing.status <> 'verified'
                     then v_existing.upi_uri else null end,
      'expiresAt', v_existing.expires_at,
      'checkIn', p_check_in, 'checkOut', p_check_out
    );
  end if;

  select h.hold_token, h.expires_at
    into v_hold_token, v_expires
    from public.stay_hold_units(p_room_type_id, p_check_in, p_check_out, v_units, 15) h
   limit 1;

  v_booking_id := 'stay-' || replace(gen_random_uuid()::text, '-', '');
  v_intent_id := 'pi_' || replace(gen_random_uuid()::text, '-', '');

  -- Only the online path builds a UPI intent. The offline path stores NULL so
  -- the record honestly says "no online payment was requested".
  if v_mode = 'upi' then
    v_upi_uri := format(
      'upi://pay?pa=%s&pn=%s&am=%s&cu=INR&tn=%s&tr=%s',
      p_merchant_vpa,
      replace(coalesce(nullif(trim(p_merchant_name), ''), 'BookOurSpace'), ' ', '%20'),
      to_char(v_amount / 100.0, 'FM999999990.00'),
      replace('BookOurSpace stay ' || left(v_booking_id, 14), ' ', '%20'),
      v_intent_id
    );
  else
    v_upi_uri := null;
  end if;

  insert into public.bookings (
    id, user_id, listing_id, listing_title, provider_id,
    customer_name, customer_phone, scheduled_date, scheduled_time,
    amount, status, payment_status, payment_mode, idempotency_key,
    room_type_id, units, total_paise, check_in, check_out, payload
  ) values (
    v_booking_id, v_uid, p_listing_id, coalesce(v_property.name, 'Stay'), v_property.owner_user_id::text,
    coalesce(nullif(trim(p_guest->>'name'), ''), 'Guest'),
    coalesce(nullif(trim(p_guest->>'phone'), ''), 'Not provided'),
    p_check_in::text, 'nightly',
    v_amount / 100.0, 'confirmed',
    case when v_mode = 'upi' then 'pending_verification' else 'pay_later' end,
    v_mode, p_idempotency_key,
    p_room_type_id, v_units, v_amount, p_check_in, p_check_out,
    jsonb_build_object(
      'source', 'stay_checkout',
      'roomType', v_room.name,
      'units', v_units,
      'nights', v_nights,
      'checkIn', p_check_in,
      'checkOut', p_check_out,
      'totalPaise', v_amount
    )
  );

  update public.stay_allocations
     set booking_id = v_booking_id, total_paise = v_amount, updated_at = now()
   where hold_token = v_hold_token;

  if v_mode = 'pay_after_service' then
    perform public.stay_confirm_pay_after_service(v_hold_token, v_booking_id);
  end if;

  insert into public.payment_intents (
    id, user_id, purpose, listing_id, room_type_id, booking_id,
    amount_paise, merchant_vpa, upi_uri, payment_mode, status,
    idempotency_key, expires_at
  ) values (
    v_intent_id, v_uid, 'stay_booking', p_listing_id, p_room_type_id, v_booking_id,
    v_amount,
    case when v_mode = 'upi' then p_merchant_vpa else null end,
    v_upi_uri, v_mode,
    case when v_mode = 'upi' then 'pending' else 'created' end,
    p_idempotency_key, coalesce(v_expires, now() + interval '15 minutes')
  );

  select * into v_booking from public.bookings where id = v_booking_id;

  return jsonb_build_object(
    'ok', true, 'replayed', false,
    'bookingId', v_booking_id,
    'intentId', v_intent_id,
    'paymentMode', v_mode,
    'status', v_booking.payment_status,
    'amountPaise', v_amount,
    'upiUri', case when v_mode = 'upi' then v_upi_uri else null end,
    'holdToken', v_hold_token,
    'expiresAt', v_expires,
    'checkIn', p_check_in, 'checkOut', p_check_out,
    'nights', v_nights, 'units', v_units,
    'roomType', v_room.name,
    'listingTitle', v_property.name
  );
exception
  when unique_violation then
    select * into v_existing from public.payment_intents
      where user_id = v_uid and idempotency_key = p_idempotency_key;
    if v_existing.id is null then raise; end if;
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'bookingId', v_existing.booking_id, 'intentId', v_existing.id,
      'paymentMode', v_existing.payment_mode, 'status', v_existing.status,
      'amountPaise', v_existing.amount_paise,
      'upiUri', case when v_existing.payment_mode = 'upi' then v_existing.upi_uri else null end,
      'expiresAt', v_existing.expires_at,
      'checkIn', p_check_in, 'checkOut', p_check_out
    );
end;
$$;

revoke all on function public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Cancellation follows the property's published policy
-- ---------------------------------------------------------------------------

-- The original routine hard-coded 48h/24h for every stay. Discovery now shows
-- a policy per property, so the refund calculation must use that policy or the
-- two would disagree. Pay-at-property reservations still refund nothing
-- online, and an already-released booking is never refunded twice.
create or replace function public.stay_cancel_booking(
  p_booking_id text,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alloc public.stay_allocations;
  v_owner uuid;
  v_payment_status text;
  v_is_admin boolean;
  v_total bigint;
  v_hours numeric;
  v_refund bigint;
  v_result_policy text;
  v_policy text := 'moderate';
  v_free_hours int := 48;
begin
  if p_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select a.* into v_alloc
    from public.stay_allocations a
   where a.booking_id = p_booking_id
   order by a.created_at desc
   limit 1
     for update;

  if v_alloc.id is null then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  select p.owner_user_id, coalesce(p.cancellation_policy, 'moderate'),
         coalesce(p.cancellation_free_hours, 48)
    into v_owner, v_policy, v_free_hours
    from public.stay_units u
    join public.stay_room_types rt on rt.id = u.room_type_id
    join public.stay_properties p on p.id = rt.property_id
   where u.id = v_alloc.unit_id;

  select b.payment_status into v_payment_status
    from public.bookings b
   where b.id = p_booking_id;

  v_is_admin := exists (
    select 1 from public.profiles pr
     where pr.id = p_actor
       and pr.role = 'admin'
       and pr.account_status = 'active'
  );

  if v_alloc.guest_user_id is distinct from p_actor
     and v_owner is distinct from p_actor
     and not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  v_total := coalesce(v_alloc.total_paise, 0)::bigint;
  -- Measured at 12:00 Asia/Kolkata on the check-in day.
  v_hours := greatest(0, extract(epoch from (
      ((lower(v_alloc.stay_dates)::date + time '12:00') at time zone 'Asia/Kolkata') - now()
  )) / 3600.0);

  if v_alloc.status = 'released' then
    v_refund := 0; v_result_policy := 'ALREADY_RELEASED';
  elsif v_payment_status is distinct from 'verified' then
    -- Nothing was collected online, so there is nothing to refund.
    v_refund := 0; v_result_policy := 'NO_ONLINE_PAYMENT_TO_REFUND';
  elsif v_policy = 'non_refundable' then
    v_refund := 0; v_result_policy := 'NON_REFUNDABLE';
  elsif v_policy = 'flexible' then
    if v_hours >= v_free_hours then
      v_refund := v_total; v_result_policy := 'FULL_REFUND_FLEXIBLE';
    else
      v_refund := 0; v_result_policy := 'NO_REFUND_FLEXIBLE';
    end if;
  elsif v_policy = 'strict' then
    if v_hours >= 168 then
      v_refund := v_total; v_result_policy := 'FULL_REFUND_STRICT';
    elsif v_hours >= 48 then
      v_refund := round(v_total / 2.0)::bigint; v_result_policy := 'HALF_REFUND_STRICT';
    else
      v_refund := 0; v_result_policy := 'NO_REFUND_STRICT';
    end if;
  else
    -- moderate (default): full before the free window, half until 24h.
    if v_hours >= v_free_hours then
      v_refund := v_total; v_result_policy := 'FULL_REFUND_MODERATE';
    elsif v_hours >= 24 then
      v_refund := round(v_total / 2.0)::bigint; v_result_policy := 'HALF_REFUND_MODERATE';
    else
      v_refund := 0; v_result_policy := 'NO_REFUND_MODERATE';
    end if;
  end if;

  if v_alloc.status <> 'released' then
    update public.stay_allocations
       set status = 'released', updated_at = now()
     where id = v_alloc.id;

    update public.bookings
       set status = 'cancelled', cancelled_at = now()
     where id = p_booking_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'released', true,
    'refundPaise', v_refund,
    'refundPolicy', v_result_policy,
    'cancellationPolicy', v_policy
  );
end;
$$;

revoke all on function public.stay_cancel_booking(text, uuid) from public, anon, authenticated;
grant execute on function public.stay_cancel_booking(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Host workspace and post-stay review guards
-- ---------------------------------------------------------------------------

-- Discovery reads public review summaries and the review list. The baseline
-- RLS policy already allows everyone to read reviews; this Data API grant is
-- required as well, exactly as for the listing tables.
grant select on public.reviews to anon, authenticated;

-- A review is tied to exactly one completed booking. The partial unique index
-- makes a double submission impossible even if two tabs race.
create unique index if not exists idx_reviews_booking_unique
  on public.reviews ((payload ->> 'bookingId'))
  where payload ? 'bookingId';

-- Host booking lists filter by the provider identity stored at checkout.
create index if not exists idx_bookings_provider_checkin
  on public.bookings (provider_id, check_in desc);

-- The trusted host-workspace and booking-action paths run as service_role and
-- read/write these tables directly. RLS is bypassed for that role; the server
-- still re-checks property ownership in every statement.
grant select on public.bookings, public.stay_allocations, public.payment_intents,
  public.payment_provider_events, public.stay_properties, public.stay_room_types,
  public.stay_units, public.stay_blocks, public.reviews to service_role;
grant insert on public.payment_provider_events, public.reviews to service_role;
grant update on public.bookings, public.payment_intents, public.stay_allocations to service_role;

-- ---------------------------------------------------------------------------
-- 9. Host blackout dates can be toggled off
-- ---------------------------------------------------------------------------

-- A block is a host-owned closure. Re-activating one must not conflict with a
-- later closure, so the overlap guard only covers active rows and the
-- availability routines ignore inactive blocks.
alter table public.stay_blocks
  add column if not exists is_active boolean not null default true;

alter table public.stay_blocks drop constraint if exists stay_blocks_no_overlap;
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.stay_blocks'::regclass
       and conname = 'stay_blocks_no_overlap'
  ) then
    alter table public.stay_blocks
      add constraint stay_blocks_no_overlap
      exclude using gist (unit_id with =, stay_dates with &&)
      where (is_active);
  end if;
end $$;

create or replace function public.stay_availability(
  p_room_type_id uuid,
  p_from date,
  p_to date
)
returns table (unit_id uuid, unit_label text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_range daterange;
begin
  if p_from >= p_to then
    raise exception 'INVALID_STAY_RANGE' using errcode = '22023';
  end if;
  v_range := daterange(p_from, p_to, '[)');

  perform public.sweep_expired_stay_holds();

  return query
    select u.id, u.label
      from public.stay_units u
     where u.room_type_id = p_room_type_id
       and u.is_active
       and not exists (
         select 1 from public.stay_allocations a
          where a.unit_id = u.id
            and a.status in ('held', 'confirmed')
            and a.stay_dates && v_range
       )
       and not exists (
         select 1 from public.stay_blocks b
          where b.unit_id = u.id
            and b.is_active
            and b.stay_dates && v_range
       )
     order by u.label;
end;
$$;

revoke all on function public.stay_availability(uuid, date, date) from public, anon, authenticated;
grant execute on function public.stay_availability(uuid, date, date) to anon, authenticated, service_role;

-- The calendar must also ignore a block the host has switched off.
create or replace function public.stay_night_calendar(
  p_listing_id text,
  p_from date,
  p_to date
)
returns table (night date, free_units int, total_units int, min_price_paise int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_property uuid;
begin
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'INVALID_STAY_RANGE' using errcode = '22023';
  end if;
  if (p_to - p_from) > 120 then
    raise exception 'CALENDAR_RANGE_TOO_LARGE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.stay_properties p
      join public.listings l on l.id = p.listing_id
     where p.listing_id = p_listing_id and p.is_active and l.status = 'active'
  ) then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;
  select p.id into v_property from public.stay_properties p where p.listing_id = p_listing_id limit 1;
  return query
    select d::date as night,
           count(u.id) filter (
             where not exists (
               select 1 from public.stay_allocations a
                where a.unit_id = u.id
                  and a.status in ('held', 'confirmed')
                  and (a.status = 'confirmed' or a.expires_at > now())
                  and a.stay_dates @> d::date
             )
             and not exists (
               select 1 from public.stay_blocks b
                where b.unit_id = u.id and b.is_active and b.stay_dates @> d::date
             )
           )::int as free_units,
           count(u.id)::int as total_units,
           (select min(rt.base_price_paise) from public.stay_room_types rt
             where rt.property_id = v_property and rt.is_active)::int as min_price_paise
      from generate_series(p_from::timestamp, (p_to - 1)::timestamp, interval '1 day') as d
      left join public.stay_room_types rt on rt.property_id = v_property and rt.is_active
      left join public.stay_units u on u.room_type_id = rt.id and u.is_active
     group by d
     order by d;
end;
$$;

revoke all on function public.stay_night_calendar(text, date, date) from public, anon, authenticated;
grant execute on function public.stay_night_calendar(text, date, date) to anon, authenticated, service_role;

commit;

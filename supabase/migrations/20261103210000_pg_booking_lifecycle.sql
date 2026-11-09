-- PG/hostel monthly inventory and pay-later reservation workflow.
-- Additive only: shares stay_properties/room_types/units/allocations and
-- public.bookings while keeping hotel payment RPCs and state machines intact.

alter table public.stay_properties drop constraint if exists stay_properties_property_type_check;
alter table public.stay_properties add constraint stay_properties_property_type_check
  check (property_type in ('hotel','resort','homestay','apartment','villa','guesthouse','pg_hostel'));

alter table public.stay_room_types add column if not exists monthly_rent_paise bigint;
alter table public.stay_room_types add column if not exists security_deposit_paise bigint not null default 0;
alter table public.bookings add column if not exists updated_at timestamptz not null default now();
do $$ begin
  if not exists(select 1 from pg_constraint where conname='stay_room_types_pg_rent_check') then
    alter table public.stay_room_types add constraint stay_room_types_pg_rent_check
      check (monthly_rent_paise is null or monthly_rent_paise > 0);
  end if;
  if not exists(select 1 from pg_constraint where conname='stay_room_types_pg_deposit_check') then
    alter table public.stay_room_types add constraint stay_room_types_pg_deposit_check
      check (security_deposit_paise >= 0);
  end if;
end $$;

create index if not exists idx_stay_properties_pg_listing
  on public.stay_properties (listing_id) where property_type = 'pg_hostel' and is_active;
create index if not exists idx_stay_units_active_room
  on public.stay_units (room_type_id, label) where is_active;

-- The trusted server session supplies auth.uid() as transaction-local claims.
-- SECURITY DEFINER is narrowly scoped and repeats the active profile, role,
-- module, listing ownership and PG-category checks in the database.
create or replace function public.pg_owner_upsert_inventory(
  p_listing_id text,
  p_room_type_id uuid,
  p_room_name text,
  p_monthly_rent_paise bigint,
  p_security_deposit_paise bigint,
  p_occupancy_per_bed integer,
  p_bed_labels text[],
  p_amenities text[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_listing public.listings;
  v_property public.stay_properties;
  v_room public.stay_room_types;
  v_label_count integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_profile from public.profiles where id = v_uid for share;
  if v_profile.id is null or v_profile.account_status <> 'active' then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  if v_profile.role not in ('provider','admin') then
    raise exception 'PROVIDER_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.platform_module_flags where module_key='pg' and is_enabled and allow_online_booking) then
    raise exception 'PG_BOOKING_DISABLED' using errcode = '42501';
  end if;
  select * into v_listing from public.listings where id = p_listing_id for update;
  -- Owners may prepare beds while their listing is pending review. Customer
  -- feed, availability and booking paths below still require status='active'.
  if v_listing.id is null or v_listing.status not in ('pending_approval','pending','active')
     or not (v_listing.category_id like 'pg-%' or v_listing.category_id = 'cat-26') then
    raise exception 'REVIEWABLE_PG_LISTING_REQUIRED' using errcode = '42501';
  end if;
  if v_profile.role <> 'admin' and v_listing.owner_id <> v_uid then
    raise exception 'LISTING_NOT_OWNED' using errcode = '42501';
  end if;
  if coalesce(trim(p_room_name),'') = '' or p_monthly_rent_paise is null or p_monthly_rent_paise <= 0
     or p_security_deposit_paise is null or p_security_deposit_paise < 0
     or p_occupancy_per_bed is null or p_occupancy_per_bed < 1 or p_occupancy_per_bed > 4 then
    raise exception 'INVALID_PG_INVENTORY' using errcode = '22023';
  end if;
  if p_bed_labels is null or cardinality(p_bed_labels) < 1 or cardinality(p_bed_labels) > 100 then
    raise exception 'INVALID_BED_COUNT' using errcode = '22023';
  end if;
  select count(*) into v_label_count from (select distinct trim(x) x from unnest(p_bed_labels) x where trim(x) <> '') labels;
  if v_label_count <> cardinality(p_bed_labels) then raise exception 'INVALID_BED_LABELS' using errcode = '22023'; end if;

  insert into public.stay_properties (listing_id, owner_user_id, name, property_type, city, area, base_price_paise, is_active)
  values (v_listing.id, v_listing.owner_id, v_listing.title, 'pg_hostel',
          coalesce(nullif(v_listing.payload->>'city',''), nullif(v_listing.payload->>'location',''), 'Location not provided'),
          nullif(v_listing.payload->>'area',''), 0, true)
  on conflict (listing_id) do update set
    name = excluded.name, owner_user_id = excluded.owner_user_id,
    property_type = 'pg_hostel', is_active = true, updated_at = now()
  returning * into v_property;

  if p_room_type_id is not null then
    select * into v_room from public.stay_room_types where id=p_room_type_id and property_id=v_property.id for update;
    if v_room.id is null then raise exception 'ROOM_TYPE_NOT_OWNED' using errcode = '42501'; end if;
    update public.stay_room_types set name=trim(p_room_name), max_adults=p_occupancy_per_bed,
      max_children=0, monthly_rent_paise=p_monthly_rent_paise,
      security_deposit_paise=p_security_deposit_paise, amenities=coalesce(p_amenities,'{}'), is_active=true
    where id=v_room.id returning * into v_room;
  else
    insert into public.stay_room_types (property_id,name,max_adults,max_children,base_price_paise,monthly_rent_paise,security_deposit_paise,amenities,is_active)
    values (v_property.id, trim(p_room_name), p_occupancy_per_bed, 0, 0,
            p_monthly_rent_paise, p_security_deposit_paise, coalesce(p_amenities,'{}'), true)
    returning * into v_room;
  end if;

  if exists (
    select 1 from public.stay_units u
    where u.room_type_id=v_room.id and u.is_active and not (u.label = any(p_bed_labels))
      and exists (select 1 from public.stay_allocations a where a.unit_id=u.id and a.status in ('held','confirmed'))
  ) then raise exception 'PG_INVENTORY_BEDS_RESERVED' using errcode = '23514'; end if;

  insert into public.stay_units (room_type_id,label,is_active)
  select v_room.id, trim(label), true from unnest(p_bed_labels) label
  on conflict (room_type_id,label) do update set is_active=true;

  update public.stay_units u set is_active=false
   where u.room_type_id=v_room.id and u.is_active and not (u.label = any(p_bed_labels));
  return jsonb_build_object('propertyId',v_property.id,'roomTypeId',v_room.id,
    'name',v_room.name,'monthlyRentPaise',v_room.monthly_rent_paise,
    'securityDepositPaise',v_room.security_deposit_paise,'occupancyPerBed',v_room.max_adults,
    'bedLabels',to_jsonb(p_bed_labels),'active',v_room.is_active);
end $$;

create or replace function public.pg_create_booking(
  p_listing_id text,
  p_room_type_id uuid,
  p_move_in date,
  p_months integer,
  p_beds integer,
  p_occupants integer,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_listing public.listings;
  v_property public.stay_properties;
  v_room public.stay_room_types;
  v_end date;
  v_unit_ids uuid[];
  v_booking_id text;
  v_key text;
  v_amount bigint;
  v_rent bigint;
  v_deposit bigint;
  v_existing public.bookings;
  v_expected jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_profile from public.profiles where id=v_uid for share;
  if v_profile.id is null or v_profile.account_status <> 'active' or v_profile.role <> 'customer' then
    raise exception 'ACTIVE_CUSTOMER_REQUIRED' using errcode='42501';
  end if;
  if not exists(select 1 from public.platform_module_flags where module_key='pg' and is_enabled and allow_online_booking) then
    raise exception 'PG_BOOKING_DISABLED' using errcode='42501';
  end if;
  if p_move_in is null or p_move_in < current_date or p_months is null or p_months < 1 or p_months > 12
     or p_beds is null or p_beds < 1 or p_beds > 10 or p_occupants is null or p_occupants < 1 then
    raise exception 'INVALID_PG_BOOKING' using errcode='22023';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 128 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023';
  end if;
  v_key := 'pg:' || v_uid::text || ':' || trim(p_idempotency_key);
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  v_end := (p_move_in + make_interval(months => p_months))::date;
  v_expected := jsonb_build_object('source','pg_booking','roomTypeId',p_room_type_id,
    'moveIn',p_move_in,'moveOut',v_end,'months',p_months,'beds',p_beds,'occupants',p_occupants);

  select * into v_existing from public.bookings where idempotency_key=v_key;
  if v_existing.id is not null then
    if v_existing.user_id <> v_uid or v_existing.listing_id <> p_listing_id
       or (v_existing.payload - 'rentPaise' - 'depositPaise' - 'totalDuePaise' - 'ownerApprovalRequired') <> v_expected then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('bookingId',v_existing.id,'status',v_existing.status,'replayed',true,
      'moveIn',v_existing.check_in,'moveOut',v_existing.check_out,'totalDuePaise',v_existing.total_paise,
      'paymentStatus',v_existing.payment_status);
  end if;

  select * into v_listing from public.listings where id=p_listing_id and status='active'
    and (category_id like 'pg-%' or category_id='cat-26') for share;
  if v_listing.id is null then raise exception 'PG_LISTING_NOT_AVAILABLE' using errcode='P0002'; end if;
  select * into v_property from public.stay_properties where listing_id=p_listing_id and property_type='pg_hostel' and is_active for share;
  select * into v_room from public.stay_room_types where id=p_room_type_id and property_id=v_property.id and is_active for share;
  if v_property.id is null or v_room.id is null or v_room.monthly_rent_paise is null then
    raise exception 'PG_INVENTORY_NOT_CONFIGURED' using errcode='P0002';
  end if;
  if p_occupants > p_beds * v_room.max_adults then raise exception 'OCCUPANCY_LIMIT_EXCEEDED' using errcode='22023'; end if;
  v_rent := v_room.monthly_rent_paise * p_months * p_beds;
  v_deposit := v_room.security_deposit_paise * p_beds;
  v_amount := v_rent + v_deposit;
  if v_amount > 2000000000 then raise exception 'PG_AMOUNT_LIMIT_EXCEEDED' using errcode='22003'; end if;

  select array_agg(chosen.id order by chosen.label) into v_unit_ids from (
    select u.id,u.label from public.stay_units u
    where u.room_type_id=v_room.id and u.is_active
      and not exists(select 1 from public.stay_allocations a where a.unit_id=u.id and a.status in ('held','confirmed') and a.stay_dates && daterange(p_move_in,v_end,'[)'))
      and not exists(select 1 from public.stay_blocks b where b.unit_id=u.id and b.stay_dates && daterange(p_move_in,v_end,'[)'))
    order by u.label for update of u skip locked limit p_beds
  ) chosen;
  if coalesce(cardinality(v_unit_ids),0) < p_beds then raise exception 'PG_INSUFFICIENT_BEDS' using errcode='P0001'; end if;

  v_booking_id := 'pg-' || replace(gen_random_uuid()::text,'-','');
  insert into public.bookings(id,user_id,listing_id,listing_title,provider_id,customer_name,customer_phone,
    scheduled_date,scheduled_time,amount,status,payment_status,payment_mode,idempotency_key,
    room_type_id,units,total_paise,check_in,check_out,payload)
  values(v_booking_id,v_uid,v_listing.id,v_listing.title,v_listing.owner_id::text,
    coalesce(nullif(v_profile.full_name,''),'Customer'),coalesce(v_profile.phone,'Not provided'),
    p_move_in::text,'move-in',v_amount/100.0,'confirmed','pay_later','pay_later',v_key,
    v_room.id,p_beds,v_amount,p_move_in,v_end,
    v_expected || jsonb_build_object('rentPaise',v_rent,'depositPaise',v_deposit,'totalDuePaise',v_amount,
      'ownerApprovalRequired',true));
  insert into public.stay_allocations(unit_id,booking_id,status,stay_dates,guest_user_id,expires_at,total_paise)
  select unnest(v_unit_ids),v_booking_id,'confirmed',daterange(p_move_in,v_end,'[)'),v_uid,null,v_amount;
  return jsonb_build_object('bookingId',v_booking_id,'status','confirmed','replayed',false,
    'moveIn',p_move_in,'moveOut',v_end,'months',p_months,'beds',p_beds,'occupants',p_occupants,
    'rentPaise',v_rent,'depositPaise',v_deposit,'totalDuePaise',v_amount,'paymentStatus','pay_later');
exception
  when exclusion_violation then raise exception 'PG_INSUFFICIENT_BEDS' using errcode='P0001';
end $$;

create or replace function public.pg_cancel_booking(p_booking_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_uid uuid:=auth.uid(); v_booking public.bookings;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform 1 from public.profiles where id=v_uid and account_status='active' for share;
  if not found then raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode='42501'; end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if v_booking.id is null or v_booking.payload->>'source' <> 'pg_booking' then raise exception 'PG_BOOKING_NOT_FOUND' using errcode='P0002'; end if;
  if v_booking.user_id <> v_uid then raise exception 'PG_BOOKING_NOT_OWNED' using errcode='42501'; end if;
  if v_booking.status <> 'confirmed' then raise exception 'PG_BOOKING_NOT_CANCELLABLE' using errcode='22023'; end if;
  if v_booking.check_in <= current_date then raise exception 'PG_CANCELLATION_CLOSED' using errcode='22023'; end if;
  update public.bookings set status='cancelled',cancelled_at=now(),updated_at=now() where id=v_booking.id;
  update public.stay_allocations set status='released',updated_at=now()
   where booking_id=v_booking.id and status='confirmed';
  return jsonb_build_object('bookingId',v_booking.id,'status','cancelled','refundPaise',0,
    'paymentStatus',v_booking.payment_status);
end $$;

revoke all on function public.pg_owner_upsert_inventory(text,uuid,text,bigint,bigint,integer,text[],text[]) from public, anon;
revoke all on function public.pg_create_booking(text,uuid,date,integer,integer,integer,text) from public, anon;
revoke all on function public.pg_cancel_booking(text) from public, anon;
grant execute on function public.pg_owner_upsert_inventory(text,uuid,text,bigint,bigint,integer,text[],text[]) to authenticated;
grant execute on function public.pg_create_booking(text,uuid,date,integer,integer,integer,text) to authenticated;
grant execute on function public.pg_cancel_booking(text) to authenticated;

drop policy if exists "PG booking parties read bookings" on public.bookings;
create policy "PG booking parties read bookings" on public.bookings for select to authenticated
using (
  (payload->>'source'='pg_booking' and user_id=auth.uid())
  or (payload->>'source'='pg_booking' and exists(select 1 from public.listings l where l.id=bookings.listing_id and l.owner_id=auth.uid()))
  or (payload->>'source'='pg_booking' and public.is_admin())
);

-- Data API / authenticated DB roles need the table-level privilege as well as
-- the policies above. All booking mutations remain RPC-only in this flow.
grant select on public.bookings to authenticated;

create index if not exists idx_pg_bookings_customer_dates
  on public.bookings(user_id, check_in desc) where payload->>'source'='pg_booking';

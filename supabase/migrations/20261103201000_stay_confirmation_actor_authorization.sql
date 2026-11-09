-- =============================================================================
-- Stay confirmation and cancellation authorization.
--
-- stay_confirm_booking() (migration 20261101000002) is service_role only and
-- proves only that the booking is paid. It cannot tell which guest owns the
-- hold, so the API must never call it with an unvalidated booking id.
--
-- stay_confirm_booking_for_actor() additionally proves, inside the same
-- transaction and row locks:
--   * the hold belongs to the acting guest,
--   * the hold is live,
--   * the booking is paid, exists, and belongs to the same guest,
--   * the booking's listing is the listing that owns the held unit.
--
-- stay_cancel_booking() does the whole cancellation in one SECURITY DEFINER
-- transaction: authorization (guest / property owner / active admin), release
-- of held *and* confirmed allocations, booking cancellation, and the refund
-- quote. service_role has no direct table grants, so this also keeps the
-- trusted server path least-privilege.
-- =============================================================================

create or replace function public.stay_confirm_booking_for_actor(
  p_hold_token uuid,
  p_booking_id text,
  p_actor uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_alloc public.stay_allocations;
  v_booking public.bookings;
  v_listing_id text;
begin
  if p_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_alloc
    from public.stay_allocations
   where hold_token = p_hold_token
     for update;

  if v_alloc.id is null then
    raise exception 'HOLD_EXPIRED_OR_MISSING' using errcode = 'P0002';
  end if;
  if v_alloc.guest_user_id is distinct from p_actor then
    raise exception 'HOLD_NOT_OWNED_BY_ACTOR' using errcode = '42501';
  end if;
  if v_alloc.status <> 'held' or v_alloc.expires_at is null or v_alloc.expires_at <= now() then
    raise exception 'HOLD_EXPIRED_OR_MISSING' using errcode = 'P0002';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.payment_status <> 'verified' then
    raise exception 'BOOKING_NOT_PAID' using errcode = '42501';
  end if;
  if v_booking.user_id is distinct from p_actor then
    raise exception 'BOOKING_NOT_OWNED_BY_ACTOR' using errcode = '42501';
  end if;

  select p.listing_id into v_listing_id
    from public.stay_units u
    join public.stay_room_types rt on rt.id = u.room_type_id
    join public.stay_properties p on p.id = rt.property_id
   where u.id = v_alloc.unit_id
     and p.listing_id = v_booking.listing_id;
  if v_listing_id is null then
    raise exception 'BOOKING_LISTING_MISMATCH' using errcode = '22023';
  end if;

  update public.stay_allocations
     set status = 'confirmed',
         booking_id = p_booking_id,
         expires_at = null,
         updated_at = now()
   where id = v_alloc.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.stay_confirm_booking_for_actor(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.stay_confirm_booking_for_actor(uuid, text, uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- Cancellation: one transaction, authorization enforced here, never by claim.
-- -----------------------------------------------------------------------------
create or replace function public.stay_cancel_booking(
  p_booking_id text,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alloc public.stay_allocations;
  v_owner uuid;
  v_payment_status text;
  v_is_admin boolean;
  v_total bigint;
  v_hours numeric;
  v_refund bigint;
  v_policy text;
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

  select p.owner_user_id into v_owner
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
  -- Refund policy is measured at 12:00 Asia/Kolkata on the check-in day.
  v_hours := greatest(0, extract(epoch from (
      ((lower(v_alloc.stay_dates)::date + time '12:00') at time zone 'Asia/Kolkata') - now()
  )) / 3600.0);

  if v_alloc.status = 'released' then
    v_refund := 0; v_policy := 'ALREADY_RELEASED';
  elsif v_payment_status is distinct from 'verified' then
    -- Pay-at-property obligation: nothing was collected online to refund.
    v_refund := 0; v_policy := 'NO_ONLINE_PAYMENT_TO_REFUND';
  elsif v_hours >= 48 then
    v_refund := v_total; v_policy := 'FULL_REFUND_48H';
  elsif v_hours >= 24 then
    v_refund := round(v_total / 2.0)::bigint; v_policy := 'HALF_REFUND_24H';
  else
    v_refund := 0; v_policy := 'NO_REFUND_UNDER_24H';
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
    'refundPolicy', v_policy
  );
end;
$$;

revoke all on function public.stay_cancel_booking(text, uuid) from public, anon, authenticated;
grant execute on function public.stay_cancel_booking(text, uuid) to service_role;

-- Owner-aware hold cancellation (the original only allowed guest/admin).
create or replace function public.stay_cancel_allocation(p_hold_token uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with released as (
    update public.stay_allocations a
       set status = 'released', updated_at = now()
     where a.hold_token = p_hold_token
       and a.status in ('held', 'confirmed')
       and (
         a.guest_user_id = auth.uid()
         or auth.role() = 'service_role'
         or public.is_admin()
         or exists (
           select 1
             from public.stay_units u
             join public.stay_room_types rt on rt.id = u.room_type_id
             join public.stay_properties p on p.id = rt.property_id
            where u.id = a.unit_id
              and p.owner_user_id = auth.uid()
         )
       )
    returning 1
  )
  select count(*)::int into v_count from released;
  return v_count;
end;
$$;

revoke all on function public.stay_cancel_allocation(uuid) from public, anon;
grant execute on function public.stay_cancel_allocation(uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Hold gating follows the listing's own module. PGs and hostels must be gated
-- by the 'pg' module, not required to enable 'hotels' as well.
-- -----------------------------------------------------------------------------
create or replace function public.stay_hold_units(
  p_room_type_id uuid,
  p_from date,
  p_to date,
  p_units int,
  p_hold_minutes int default 10
)
returns table (allocation_id uuid, unit_id uuid, hold_token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module public.platform_module_flags;
  v_property public.stay_properties;
  v_module_key text;
  v_free uuid[];
  v_range daterange;
  v_expires timestamptz := now() + make_interval(mins => greatest(1, least(p_hold_minutes, 30)));
  v_token uuid := gen_random_uuid();
begin
  if p_from >= p_to then
    raise exception 'INVALID_STAY_RANGE' using errcode = '22023';
  end if;
  if p_units is null or p_units < 1 then
    raise exception 'INVALID_UNIT_COUNT' using errcode = '22023';
  end if;

  v_range := daterange(p_from, p_to, '[)');

  select p.* into v_property
    from public.stay_room_types rt
    join public.stay_properties p on p.id = rt.property_id
   where rt.id = p_room_type_id and rt.is_active and p.is_active
     for share;

  if v_property is null then
    raise exception 'ROOM_TYPE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select case
           when l.category_id like 'pg-%'
             or l.category_id = 'pg_hostels'
             or l.subcategory ilike '%hostel%'
             or l.subcategory ilike '%pg%'
           then 'pg'
           else 'hotels'
         end
    into v_module_key
    from public.listings l
   where l.id = v_property.listing_id;
  v_module_key := coalesce(v_module_key, 'hotels');

  select * into v_module
    from public.platform_module_flags
   where module_key = v_module_key;
  if v_module is null or not v_module.is_enabled or not v_module.allow_online_booking then
    raise exception 'MODULE_BOOKING_DISABLED: %', v_module_key using errcode = '42501';
  end if;

  perform public.sweep_expired_stay_holds();

  select array_agg(s.unit_id) into v_free
    from public.stay_availability(p_room_type_id, p_from, p_to) s;

  if v_free is null or cardinality(v_free) < p_units then
    raise exception 'INSUFFICIENT_AVAILABILITY: requested % unit(s), % free',
      p_units, coalesce(cardinality(v_free), 0)
      using errcode = 'P0001';
  end if;

  perform 1 from public.stay_units where id = any (v_free[1:p_units]) for update;

  return query
    insert into public.stay_allocations
      (unit_id, status, stay_dates, guest_user_id, hold_token, expires_at, total_paise)
    select u, 'held', v_range, auth.uid(), v_token, v_expires,
           (p_to - p_from) * (
             select rt.base_price_paise from public.stay_room_types rt where rt.id = p_room_type_id
           )
      from unnest(v_free[1:p_units]) as u
    returning stay_allocations.id, stay_allocations.unit_id,
              stay_allocations.hold_token, stay_allocations.expires_at;
exception
  when exclusion_violation then
    raise exception 'SEAT_TAKEN_BY_ANOTHER_GUEST: inventory changed while holding'
      using errcode = '40001';
end;
$$;

revoke all on function public.stay_hold_units(uuid, date, date, int, int) from public;
grant execute on function public.stay_hold_units(uuid, date, date, int, int)
  to authenticated, service_role;

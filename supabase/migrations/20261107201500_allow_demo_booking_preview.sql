-- Local-preview opt-in for demo stay bookings.
--
-- Demo listings are illustrative inventory. They stay unbookable unless the
-- local server explicitly opts in with the transaction-local setting
-- bos.allow_demo_booking=on (driven by BOS_STAY_ALLOW_DEMO_BOOKING=1 outside
-- production). Production never sets that setting, so its behaviour is
-- unchanged: demo rows cannot be held, confirmed or paid.
--
-- The app layer performs the same check (stayListingGate) and the client only
-- offers booking when the search response reports demoBookable=true.

begin;

create or replace function public.stay_listing_is_publicly_bookable(p_listing_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_payload jsonb;
  v_active boolean;
  v_listing_verified boolean;
  v_verified_by uuid;
  v_owner_verified boolean;
  v_has_active_inventory boolean;
  v_life text;
begin
  if p_listing_id is null or btrim(p_listing_id) = '' then
    return false;
  end if;
  select l.status, coalesce(l.payload, '{}'::jsonb), p.is_active,
         l.is_verified, l.verified_by,
         (owner.role = 'provider' and owner.account_status = 'active' and owner.verified is true),
         exists (
           select 1 from public.stay_room_types rt
           join public.stay_units u on u.room_type_id = rt.id
           where rt.property_id = p.id and rt.is_active and u.is_active
         )
    into v_status, v_payload, v_active,
         v_listing_verified, v_verified_by, v_owner_verified, v_has_active_inventory
    from public.listings l
    join public.stay_properties p on p.listing_id = l.id
    join public.profiles owner on owner.id = p.owner_user_id and owner.id = l.owner_id
   where l.id = p_listing_id
   limit 1;
  if v_status is null then
    return false;
  end if;
  if coalesce(v_payload->>'demo', 'false') = 'true'
     and coalesce(current_setting('bos.allow_demo_booking', true), 'off') <> 'on' then
    return false;
  end if;
  if v_listing_verified is not true or v_verified_by is null or v_owner_verified is not true then
    return false;
  end if;
  if v_status is distinct from 'active' or v_active is not true then
    return false;
  end if;
  v_life := nullif(btrim(v_payload->>'stayLifecycle'), '');
  if v_life is distinct from 'approved' then
    return false;
  end if;
  if v_has_active_inventory is not true then
    return false;
  end if;
  if coalesce(v_payload #>> '{availability,status}', 'available') = 'sold_out' then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.stay_listing_is_publicly_bookable(text) from public, anon;
grant execute on function public.stay_listing_is_publicly_bookable(text) to anon, authenticated, service_role;

commit;

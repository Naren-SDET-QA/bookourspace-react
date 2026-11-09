-- Local candidate only. Hotel owner draft/submit + Super Admin review for
-- Hotels & Stays. Do not apply to a hosted project without a separately
-- approved migration plan.
--
-- Public search already requires listings.status = 'active'. Checkout did not.
-- This migration refuses real bookings unless the listing is approved, the
-- property is active, inventory is available, and payload.demo is not true.

begin;

create table if not exists public.stay_listing_review_events (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.listings(id) on delete restrict,
  action text not null check (action in (
    'create_draft', 'save_draft', 'submit', 'approve', 'reject',
    'request_changes', 'suspend', 'reactivate', 'material_change'
  )),
  reason text,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null,
  from_status text,
  to_status text,
  from_lifecycle text,
  to_lifecycle text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists stay_listing_review_events_listing_recent
  on public.stay_listing_review_events (listing_id, created_at desc);

alter table public.stay_listing_review_events enable row level security;
revoke all on table public.stay_listing_review_events from public, anon, authenticated;
grant select on table public.stay_listing_review_events to authenticated;

drop policy if exists "Owners and admins read stay review audit" on public.stay_listing_review_events;
create policy "Owners and admins read stay review audit"
  on public.stay_listing_review_events for select to authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = stay_listing_review_events.listing_id
         and l.owner_id = auth.uid()
         and public.is_active_user()
    )
    or exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin' and p.account_status = 'active'
    )
  );

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
  if coalesce(v_payload->>'demo', 'false') = 'true' then
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

create or replace function public.stay_assert_listing_bookable(p_listing_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.stay_listing_is_publicly_bookable(p_listing_id) then
    raise exception 'STAY_NOT_PUBLICLY_BOOKABLE' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.stay_assert_listing_bookable(text) from public, anon;
grant execute on function public.stay_assert_listing_bookable(text) to authenticated, service_role;

create or replace function public.guard_stay_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.payload->>'source', '') in ('stay_checkout', 'stay_request') then
    if not public.stay_listing_is_publicly_bookable(new.listing_id) then
      raise exception 'STAY_NOT_PUBLICLY_BOOKABLE' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_stay_booking_insert on public.bookings;
create trigger trg_guard_stay_booking_insert
  before insert on public.bookings
  for each row execute function public.guard_stay_booking_insert();

create or replace function public.guard_stay_listing_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_super boolean := false;
  v_transition text := coalesce(current_setting('bos.stay_lifecycle_transition', true), '');
  v_material text := coalesce(current_setting('bos.stay_material_change', true), '');
  v_old_life text;
  v_new_life text;
begin
  if auth.uid() is not null then
    select coalesce(profile.is_super_admin, false) into v_super
      from public.profiles profile
     where profile.id = auth.uid() and profile.account_status = 'active';
  end if;
  v_old_life := coalesce(nullif(btrim(coalesce(old.payload, '{}'::jsonb)->>'stayLifecycle'), ''), '');
  v_new_life := coalesce(nullif(btrim(coalesce(new.payload, '{}'::jsonb)->>'stayLifecycle'), ''), '');
  if tg_op = 'INSERT' then
    if coalesce(new.payload->>'demo', 'false') = 'true' and not v_super and v_transition <> 'on' then
      raise exception 'STAY_DEMO_SUPER_ADMIN_ONLY' using errcode = '42501';
    end if;
    if v_new_life not in ('', 'draft') and not v_super and v_transition <> 'on' then
      raise exception 'STAY_LIFECYCLE_PROTECTED' using errcode = '42501';
    end if;
    return new;
  end if;
  if coalesce(new.payload->>'demo', 'false') is distinct from coalesce(old.payload->>'demo', 'false')
     and not v_super
     and v_transition <> 'on' then
    raise exception 'STAY_DEMO_SUPER_ADMIN_ONLY' using errcode = '42501';
  end if;
  if v_new_life is distinct from v_old_life
     and not v_super
     and v_transition <> 'on'
     and v_material <> 'on' then
    raise exception 'STAY_LIFECYCLE_PROTECTED' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_stay_listing_lifecycle on public.listings;
create trigger trg_guard_stay_listing_lifecycle
  before insert or update on public.listings
  for each row execute function public.guard_stay_listing_lifecycle();

create or replace function public.stay_mark_material_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings;
  v_material boolean := false;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if tg_table_name = 'stay_properties' then
    -- Identity, location, tax identity and cancellation terms require
    -- re-verification. Nightly price, units and calendar stay owner-managed.
    v_material := (new.name, new.city, new.area, new.address, new.tax_percent,
                   new.cancellation_policy)
              is distinct from
                  (old.name, old.city, old.area, old.address, old.tax_percent,
                   old.cancellation_policy);
    select * into v_listing from public.listings where id = new.listing_id;
  elsif tg_table_name = 'stay_room_types' then
    v_material := (new.max_adults, new.max_children, new.bedrooms)
              is distinct from
                  (old.max_adults, old.max_children, old.bedrooms);
    select l.* into v_listing
      from public.listings l
      join public.stay_properties p on p.listing_id = l.id
     where p.id = new.property_id;
  else
    return new;
  end if;
  if not v_material or v_listing.id is null then
    return new;
  end if;
  if v_listing.status = 'active'
     and coalesce(v_listing.payload->>'stayLifecycle', 'approved') = 'approved'
     and coalesce(v_listing.payload->>'demo', 'false') <> 'true' then
    perform set_config('bos.stay_material_change', 'on', true);
    -- The listings guard requires its reviewed-transition flag for any
    -- provider-initiated publication transition. This update is performed by
    -- the security-definer material-change trigger, not by the browser.
    perform set_config('bos.review_transition', 'on', true);
    update public.listings
       set status = 'pending_approval',
           payload = coalesce(payload, '{}'::jsonb)
                     || jsonb_build_object('stayLifecycle', 'changes_requested'),
           updated_at = now()
     where id = v_listing.id;
    insert into public.stay_listing_review_events (
      listing_id, action, reason, actor_user_id, actor_role,
      from_status, to_status, from_lifecycle, to_lifecycle, payload
    ) values (
      v_listing.id, 'material_change', 'Material inventory change requires Super Admin re-verification.',
      coalesce(auth.uid(), v_listing.owner_id), 'provider',
      v_listing.status, 'pending_approval', 'approved', 'changes_requested',
      jsonb_build_object('table', tg_table_name)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stay_property_material_change on public.stay_properties;
create trigger trg_stay_property_material_change
  after update on public.stay_properties
  for each row execute function public.stay_mark_material_change();

drop trigger if exists trg_stay_room_material_change on public.stay_room_types;
create trigger trg_stay_room_material_change
  after update on public.stay_room_types
  for each row execute function public.stay_mark_material_change();

create or replace function public.record_stay_review_event(
  p_listing_id text,
  p_action text,
  p_reason text,
  p_from_status text,
  p_to_status text,
  p_from_life text,
  p_to_life text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := 'session';
begin
  if v_actor is null then
    return;
  end if;
  insert into public.stay_listing_review_events (
    listing_id, action, reason, actor_user_id, actor_role,
    from_status, to_status, from_lifecycle, to_lifecycle, payload
  ) values (
    p_listing_id, p_action, nullif(btrim(coalesce(p_reason, '')), ''),
    v_actor, v_role, p_from_status, p_to_status, p_from_life, p_to_life,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.record_stay_review_event(text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.create_stay_owner_draft(
  p_title text,
  p_name text,
  p_city text,
  p_property_type text default 'hotel',
  p_area text default null,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_profile public.profiles;
  v_listing_id text;
  v_property_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_type text := coalesce(nullif(btrim(coalesce(p_property_type, '')), ''), 'hotel');
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null or v_profile.account_status is distinct from 'active'
     or v_profile.role not in ('customer', 'provider', 'admin') then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  if v_title is null or char_length(v_title) < 2 or v_name is null or v_city is null then
    raise exception 'STAY_NAME_AND_CITY_REQUIRED' using errcode = '22023';
  end if;
  if v_type not in ('hotel', 'resort', 'homestay', 'apartment', 'villa', 'guesthouse', 'guest_house', 'house', 'flat', 'lodge', 'temple_stay') then
    raise exception 'INVALID_PROPERTY_OPTIONS' using errcode = '22023';
  end if;

  v_listing_id := 'stay-' || replace(gen_random_uuid()::text, '-', '');

  if v_profile.role = 'customer' then
    insert into public.provider_registration_requests (
      user_id, request_id, provider_type, business_name, contact_phone, city, area, status
    )
    select v_uid, gen_random_uuid(), 'hotel_stay', v_name,
           coalesce(nullif(btrim(v_profile.phone), ''), 'pending'),
           v_city, coalesce(nullif(btrim(coalesce(p_area, '')), ''), v_city), 'pending'
     where not exists (
       select 1 from public.provider_registration_requests r
        where r.user_id = v_uid and r.provider_type = 'hotel_stay' and r.status in ('pending', 'approved')
     );
  end if;

  -- Listing write triggers require provider/admin. The owner is still recorded
  -- on the row; auth.uid() is restored before the audit event.
  perform set_config('request.jwt.claim.sub', '', true);
  if v_claims ? 'sub' then
    perform set_config('request.jwt.claims', (v_claims - 'sub')::text, true);
  end if;

  insert into public.listings (
    id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload
  ) values (
    v_listing_id, v_uid, v_title, 'hotels', coalesce(v_type, 'hotel'), 'stay', 0, 'per night',
    'pending_approval',
    jsonb_build_object(
      'stayLifecycle', 'draft',
      'demo', false,
      'description', '',
      'images', '[]'::jsonb,
      'verificationDocuments', '[]'::jsonb,
      'location', jsonb_build_object('city', v_city, 'area', coalesce(p_area, ''))
    )
  );

  insert into public.stay_properties (
    listing_id, owner_user_id, name, property_type, city, area, address, is_active, base_price_paise, tax_percent
  ) values (
    v_listing_id, v_uid, v_name, v_type, v_city,
    nullif(btrim(coalesce(p_area, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    false, 0, 12
  ) returning id into v_property_id;

  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  if v_claims ? 'sub' then
    perform set_config('request.jwt.claims', v_claims::text, true);
  end if;

  perform public.record_stay_review_event(
    v_listing_id, 'create_draft', null, null, 'pending_approval', null, 'draft',
    jsonb_build_object('propertyId', v_property_id)
  );

  return jsonb_build_object('ok', true, 'listingId', v_listing_id, 'propertyId', v_property_id, 'status', 'pending_approval', 'stayLifecycle', 'draft');
end;
$$;

revoke all on function public.create_stay_owner_draft(text, text, text, text, text, text) from public, anon;
grant execute on function public.create_stay_owner_draft(text, text, text, text, text, text) to authenticated;

create or replace function public.submit_stay_listing_for_review(p_listing_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_listing public.listings;
  v_property public.stay_properties;
  v_rooms int;
  v_units int;
  v_docs jsonb;
  v_images jsonb;
  v_life text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_listing from public.listings where id = p_listing_id and owner_id = v_uid for update;
  if v_listing.id is null then
    raise exception 'OWNED_STAY_LISTING_REQUIRED' using errcode = 'P0002';
  end if;
  if public.live_edit_listing_module(v_listing.category_id, v_listing.entity_type) is distinct from 'hotel_stay' then
    raise exception 'OWNED_STAY_LISTING_REQUIRED' using errcode = 'P0002';
  end if;
  v_life := coalesce(nullif(btrim(v_listing.payload->>'stayLifecycle'), ''), 'draft');
  if v_life not in ('draft', 'changes_requested') then
    raise exception 'STAY_NOT_SUBMITTABLE' using errcode = '22023';
  end if;
  select * into v_property from public.stay_properties where listing_id = p_listing_id and owner_user_id = v_uid;
  if v_property.id is null or char_length(btrim(v_property.name)) < 2 or char_length(btrim(v_property.city)) < 2 then
    raise exception 'STAY_PROFILE_INCOMPLETE' using errcode = '22023';
  end if;
  if coalesce(v_property.base_price_paise, 0) <= 0 then
    raise exception 'STAY_PROFILE_INCOMPLETE' using errcode = '22023';
  end if;
  select count(*)::int into v_rooms from public.stay_room_types where property_id = v_property.id and is_active;
  select count(*)::int into v_units
    from public.stay_units u
    join public.stay_room_types rt on rt.id = u.room_type_id
   where rt.property_id = v_property.id and u.is_active;
  if v_rooms < 1 or v_units < 1 then
    raise exception 'STAY_PROFILE_INCOMPLETE' using errcode = '22023';
  end if;
  v_images := coalesce(v_listing.payload->'images', '[]'::jsonb);
  if jsonb_typeof(v_images) <> 'array' or jsonb_array_length(v_images) < 1 then
    raise exception 'STAY_PHOTOS_REQUIRED' using errcode = '22023';
  end if;
  v_docs := coalesce(v_listing.payload->'verificationDocuments', '[]'::jsonb);
  if jsonb_typeof(v_docs) <> 'array'
     or not exists (select 1 from jsonb_array_elements(v_docs) d where d->>'kind' = 'gst_certificate')
     or not exists (select 1 from jsonb_array_elements(v_docs) d where d->>'kind' = 'property_ownership')
     or not exists (select 1 from jsonb_array_elements(v_docs) d where d->>'kind' = 'government_id') then
    raise exception 'STAY_VERIFICATION_DOCS_REQUIRED' using errcode = '22023';
  end if;

  perform set_config('bos.stay_lifecycle_transition', 'on', true);
  perform set_config('request.jwt.claim.sub', '', true);
  if v_claims ? 'sub' then
    perform set_config('request.jwt.claims', (v_claims - 'sub')::text, true);
  end if;
  update public.listings
     set status = 'pending_approval',
         payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('stayLifecycle', 'submitted'),
         updated_at = now()
   where id = p_listing_id;
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  if v_claims ? 'sub' then
    perform set_config('request.jwt.claims', v_claims::text, true);
  end if;

  perform public.record_stay_review_event(
    p_listing_id, 'submit', 'Owner submitted the property for Super Admin review.',
    v_listing.status, 'pending_approval', v_life, 'submitted', '{}'::jsonb
  );

  return jsonb_build_object('ok', true, 'listingId', p_listing_id, 'status', 'pending_approval', 'stayLifecycle', 'submitted');
end;
$$;

revoke all on function public.submit_stay_listing_for_review(text) from public, anon;
grant execute on function public.submit_stay_listing_for_review(text) to authenticated;

create or replace function public.save_stay_listing_documents(
  p_listing_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_listing public.listings;
  v_next jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_listing from public.listings where id = p_listing_id and owner_id = v_uid for update;
  if v_listing.id is null then
    raise exception 'OWNED_STAY_LISTING_REQUIRED' using errcode = 'P0002';
  end if;
  v_next := coalesce(v_listing.payload, '{}'::jsonb);
  if jsonb_exists(p_payload, 'verificationDocuments') then
    v_next := v_next || jsonb_build_object('verificationDocuments', p_payload->'verificationDocuments');
  end if;
  if jsonb_exists(p_payload, 'images') then
    v_next := v_next || jsonb_build_object('images', p_payload->'images');
  end if;
  if jsonb_exists(p_payload, 'gstin') then
    v_next := v_next || jsonb_build_object('gstin', p_payload->'gstin');
  end if;
  if jsonb_exists(p_payload, 'legalName') then
    v_next := v_next || jsonb_build_object('legalName', p_payload->'legalName');
  end if;
  if jsonb_exists(p_payload, 'policies') then
    v_next := v_next || jsonb_build_object('policies', p_payload->'policies');
  end if;
  v_next := v_next || jsonb_build_object(
    'stayLifecycle', coalesce(v_listing.payload->>'stayLifecycle', 'draft'),
    'demo', coalesce((v_listing.payload->>'demo') = 'true', false)
  );
  perform set_config('request.jwt.claim.sub', '', true);
  if v_claims ? 'sub' then
    perform set_config('request.jwt.claims', (v_claims - 'sub')::text, true);
  end if;
  update public.listings set payload = v_next, updated_at = now() where id = p_listing_id;
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  if v_claims ? 'sub' then
    perform set_config('request.jwt.claims', v_claims::text, true);
  end if;
  return jsonb_build_object('ok', true, 'listingId', p_listing_id, 'payload', v_next);
end;
$$;

revoke all on function public.save_stay_listing_documents(text, jsonb) from public, anon;
grant execute on function public.save_stay_listing_documents(text, jsonb) to authenticated;

create or replace function public.review_stay_listing(
  p_listing_id text,
  p_action text,
  p_reason text default '',
  p_demo boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_actor public.profiles;
  v_owner_profile public.profiles;
  v_listing public.listings;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_life text;
  v_next_status text;
  v_next_life text;
  v_active boolean;
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into v_actor
    from public.profiles
   where id = v_uid
     and role = 'admin'
     and is_super_admin is true
     and account_status = 'active'
   for update;
  if v_actor.id is null then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if v_action not in ('approve', 'reject', 'request_changes', 'suspend', 'reactivate') then
    raise exception 'INVALID_REVIEW_ACTION' using errcode = '22023';
  end if;
  if v_action in ('reject', 'request_changes', 'suspend') and char_length(v_reason) < 8 then
    raise exception 'REVIEW_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if v_listing.id is null
     or public.live_edit_listing_module(v_listing.category_id, v_listing.entity_type) is distinct from 'hotel_stay' then
    raise exception 'STAY_LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_listing.owner_id = v_uid then
    raise exception 'STAY_SELF_APPROVAL_FORBIDDEN' using errcode = '42501';
  end if;

  if v_action in ('approve', 'reactivate') then
    select * into v_owner_profile
      from public.profiles
     where id = v_listing.owner_id
       and account_status = 'active'
     for update;
    if v_owner_profile.id is null then
      raise exception 'STAY_OWNER_INACTIVE' using errcode = '42501';
    end if;
  end if;

  v_life := coalesce(nullif(btrim(v_listing.payload->>'stayLifecycle'), ''), 'draft');
  v_next_status := v_listing.status;
  v_next_life := v_life;
  v_active := false;

  if v_action = 'approve' then
    if v_life not in ('submitted', 'changes_requested', 'approved') and v_listing.status <> 'pending_approval' then
      raise exception 'STAY_NOT_SUBMITTABLE' using errcode = '22023';
    end if;
    v_next_status := 'active';
    v_next_life := 'approved';
    v_active := true;
  elsif v_action = 'reject' then
    v_next_status := 'rejected';
    v_next_life := 'rejected';
  elsif v_action = 'request_changes' then
    v_next_status := 'pending_approval';
    v_next_life := 'changes_requested';
  elsif v_action = 'suspend' then
    if v_listing.status is distinct from 'active' and v_life is distinct from 'approved' then
      raise exception 'STAY_NOT_ACTIVE' using errcode = '22023';
    end if;
    v_next_status := 'expired';
    v_next_life := 'suspended';
  elsif v_action = 'reactivate' then
    if v_life is distinct from 'suspended' and v_listing.status is distinct from 'expired' then
      raise exception 'STAY_NOT_SUSPENDED' using errcode = '22023';
    end if;
    v_next_status := 'active';
    v_next_life := 'approved';
    v_active := true;
  end if;

  perform set_config('bos.review_transition', 'on', true);
  perform set_config('bos.stay_lifecycle_transition', 'on', true);
  perform set_config('request.jwt.claim.sub', '', true);
  if v_claims ? 'sub' then
    perform set_config('request.jwt.claims', (v_claims - 'sub')::text, true);
  end if;

  update public.listings
     set status = v_next_status,
         is_verified = (v_action = 'approve' or (v_action = 'reactivate')),
         verified_at = case when v_action in ('approve', 'reactivate') then now() else verified_at end,
         verified_by = case when v_action in ('approve', 'reactivate') then v_uid else verified_by end,
         payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
           'stayLifecycle', v_next_life,
           'demo', case when p_demo is null then coalesce((payload->>'demo') = 'true', false) else p_demo end,
           'review', jsonb_build_object(
             'action', v_action,
             'reason', v_reason,
             'at', now(),
             'by', v_uid
           )
         ),
         updated_at = now()
   where id = p_listing_id;

  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  if v_claims ? 'sub' then
    perform set_config('request.jwt.claims', v_claims::text, true);
  end if;

  update public.stay_properties
     set is_active = v_active, updated_at = now()
   where listing_id = p_listing_id;

  -- Approval is the explicit provider-verification event. A new Google
  -- customer becomes a verified provider only after the Super Admin review;
  -- existing Admin roles are preserved. Each profile change is durably audited.
  if v_action = 'approve' then
    if v_owner_profile.role = 'customer' then
      update public.profiles
         set role = 'provider', updated_at = now()
       where id = v_owner_profile.id;
      insert into public.user_access_audit_events (
        actor_user_id, target_user_id, action, previous_role, new_role,
        previous_account_status, new_account_status, previous_verified,
        new_verified, reason
      ) values (
        v_uid, v_owner_profile.id, 'set_provider', v_owner_profile.role, 'provider',
        v_owner_profile.account_status, v_owner_profile.account_status,
        v_owner_profile.verified, v_owner_profile.verified,
        'Stay property approved by Super Admin.'
      );
      v_owner_profile.role := 'provider';
    end if;
    if v_owner_profile.verified is distinct from true then
      update public.profiles
         set verified = true, updated_at = now()
       where id = v_owner_profile.id;
      insert into public.user_access_audit_events (
        actor_user_id, target_user_id, action, previous_role, new_role,
        previous_account_status, new_account_status, previous_verified,
        new_verified, reason
      ) values (
        v_uid, v_owner_profile.id, 'verify', v_owner_profile.role, v_owner_profile.role,
        v_owner_profile.account_status, v_owner_profile.account_status,
        v_owner_profile.verified, true,
        'Stay property approved by Super Admin.'
      );
    end if;
  end if;

  perform set_config('request.jwt.claim.sub', v_uid::text, true);

  v_owner := v_listing.owner_id;
  if v_action = 'approve' then
    update public.provider_registration_requests
       set status = 'approved', reviewed_by = v_uid, reviewed_at = now(),
           review_note = nullif(v_reason, ''), updated_at = now()
     where user_id = v_owner and provider_type = 'hotel_stay' and status = 'pending';
  end if;

  perform public.record_stay_review_event(
    p_listing_id, v_action, v_reason, v_listing.status, v_next_status, v_life, v_next_life,
    jsonb_build_object('demo', coalesce(p_demo, (v_listing.payload->>'demo') = 'true'), 'ownerId', v_owner)
  );

  return jsonb_build_object(
    'ok', true, 'listingId', p_listing_id, 'action', v_action,
    'status', v_next_status, 'stayLifecycle', v_next_life, 'propertyActive', v_active,
    'ownerId', v_owner
  );
end;
$$;

revoke all on function public.review_stay_listing(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.review_stay_listing(text, text, text, boolean) to service_role;

-- Trigger-only SECURITY DEFINER functions must not be callable by API roles.
revoke all on function public.guard_stay_booking_insert() from public, anon, authenticated;
revoke all on function public.guard_stay_listing_lifecycle() from public, anon, authenticated;
revoke all on function public.stay_mark_material_change() from public, anon, authenticated;

commit;

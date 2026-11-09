-- ============================================================================
-- Live Edit backend security layer
--
-- Adds the server-side (PostgreSQL) half of Live Edit:
--   * admin content assignments (module / category / listing scoped)
--   * cinema screen ownership
--   * append-only, server-attributed Live Edit audit events
--   * a listing write guard that enforces ownership, assignments, protected
--     fields, publication transitions and core payload validation even for
--     clients that bypass the Express API and talk to PostgREST directly
--   * a listing audit trigger that makes the audit row part of the same
--     transaction as the listing update (a failed audit aborts the save)
--
-- All checks derive the actor from auth.uid(); no client-supplied role,
-- assignment or verification flag is trusted. Super Admin authority is read
-- fresh on every write through public.is_current_user_super_admin().
--
-- Idempotent. Applied only to disposable/local databases in this task; the
-- hosted project is not touched.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Admin content assignments
-- ---------------------------------------------------------------------------
create table if not exists public.live_edit_admin_assignments (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null check (module_id in (
    'pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies'
  )),
  category_id text,
  listing_id text,
  assigned_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (category_id is null or char_length(btrim(category_id)) between 1 and 80),
  check (listing_id is null or char_length(btrim(listing_id)) between 1 and 160)
);

create index if not exists live_edit_assignments_admin_module
  on public.live_edit_admin_assignments (admin_user_id, module_id);
create index if not exists live_edit_assignments_assigned_by
  on public.live_edit_admin_assignments (assigned_by);
create unique index if not exists live_edit_assignments_unique
  on public.live_edit_admin_assignments (
    admin_user_id,
    module_id,
    coalesce(category_id, ''),
    coalesce(listing_id, '')
  );

alter table public.live_edit_admin_assignments enable row level security;
revoke all on public.live_edit_admin_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.live_edit_admin_assignments to authenticated;

drop policy if exists "Admins read their own Live Edit assignments" on public.live_edit_admin_assignments;
create policy "Admins read their own Live Edit assignments"
  on public.live_edit_admin_assignments for select to authenticated
  using (
    admin_user_id = (select auth.uid())
    or public.is_current_user_super_admin()
  );

drop policy if exists "Super Admin manages Live Edit assignments" on public.live_edit_admin_assignments;
create policy "Super Admin manages Live Edit assignments"
  on public.live_edit_admin_assignments for all to authenticated
  using (public.is_current_user_super_admin())
  with check (public.is_current_user_super_admin());

-- ---------------------------------------------------------------------------
-- 2. Cinema screen ownership
-- ---------------------------------------------------------------------------
create table if not exists public.live_edit_cinema_screen_owners (
  screen_id text primary key,
  listing_id text,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(screen_id)) between 1 and 160),
  check (listing_id is null or char_length(btrim(listing_id)) between 1 and 160)
);

create index if not exists live_edit_cinema_owner_user
  on public.live_edit_cinema_screen_owners (owner_user_id);
create index if not exists live_edit_cinema_owner_listing
  on public.live_edit_cinema_screen_owners (listing_id);

alter table public.live_edit_cinema_screen_owners enable row level security;
revoke all on public.live_edit_cinema_screen_owners from public, anon, authenticated;
grant select, insert, update, delete on public.live_edit_cinema_screen_owners to authenticated;

drop policy if exists "Owners and admins read cinema screen ownership" on public.live_edit_cinema_screen_owners;
create policy "Owners and admins read cinema screen ownership"
  on public.live_edit_cinema_screen_owners for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    or public.is_admin()
  );

drop policy if exists "Super Admin manages cinema screen ownership" on public.live_edit_cinema_screen_owners;
create policy "Super Admin manages cinema screen ownership"
  on public.live_edit_cinema_screen_owners for all to authenticated
  using (public.is_current_user_super_admin())
  with check (public.is_current_user_super_admin());

-- ---------------------------------------------------------------------------
-- 3. Append-only Live Edit audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.live_edit_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null check (actor_role in ('provider', 'admin', 'super_admin')),
  module text not null check (module in (
    'pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies', 'unknown'
  )),
  category_id text,
  listing_id text not null,
  listing_title text not null default '',
  action text not null check (action in (
    'listing.update', 'cinema_screen.update', 'cinema_screen.create',
    'cinema_screen.owner_assigned', 'cinema_screen.owner_revoked'
  )),
  changed_fields text[] not null check (cardinality(changed_fields) > 0),
  summary text not null check (char_length(summary) between 1 and 500),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  source text not null default 'server',
  occurred_at timestamptz not null default now()
);

create index if not exists live_edit_audit_listing_recent
  on public.live_edit_audit_events (listing_id, occurred_at desc);
create index if not exists live_edit_audit_actor_recent
  on public.live_edit_audit_events (actor_user_id, occurred_at desc);
create index if not exists live_edit_audit_module_recent
  on public.live_edit_audit_events (module, occurred_at desc);

alter table public.live_edit_audit_events enable row level security;
revoke all on public.live_edit_audit_events from public, anon, authenticated;
grant select on public.live_edit_audit_events to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Authorization helpers
-- ---------------------------------------------------------------------------
create or replace function public.live_edit_listing_module(
  p_category_id text,
  p_entity_type text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_category_id is null then null
    when p_category_id in ('pg', 'pg_hostels', 'pg-hostels') then 'pg_hostels'
    when p_category_id like 'pg-%' then 'pg_hostels'
    when p_category_id in ('classes', 'class', 'course', 'courses') then 'classes'
    when p_category_id like 'class-%' then 'classes'
    when p_category_id in ('venues', 'venue', 'halls') then 'venues'
    when p_category_id like 'venue-%' then 'venues'
    when p_category_id in ('services', 'service') then 'services'
    when p_category_id like 'cat-%' or p_category_id like 'srv-%' then 'services'
    when p_category_id in ('hotels', 'hotel', 'hotel_stay', 'stays') then 'hotel_stay'
    when p_category_id like 'hotel-%' then 'hotel_stay'
    when p_category_id in ('movies', 'movie', 'cinema') then 'movies'
    when p_category_id like 'movie-%' then 'movies'
    when lower(coalesce(p_entity_type, '')) = 'course' then 'classes'
    when lower(coalesce(p_entity_type, '')) = 'venue' then 'venues'
    when lower(coalesce(p_entity_type, '')) = 'service' then 'services'
    when lower(coalesce(p_entity_type, '')) = 'movie' then 'movies'
    when lower(coalesce(p_entity_type, '')) = 'stay' then 'hotel_stay'
    else null
  end
$$;
revoke all on function public.live_edit_listing_module(text, text) from public, anon;
grant execute on function public.live_edit_listing_module(text, text) to authenticated, service_role;

create or replace function public.live_edit_admin_can_edit(
  p_module text,
  p_category_id text,
  p_listing_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    and (
      private.is_current_user_super_admin()
      or exists (
        select 1
          from public.live_edit_admin_assignments assignment
         where assignment.admin_user_id = (select auth.uid())
           and assignment.module_id = p_module
           and (assignment.listing_id is null or assignment.listing_id = p_listing_id)
           and (assignment.category_id is null or assignment.category_id = p_category_id)
      )
      or exists (
        select 1
          from public.listings listing
         where listing.id = p_listing_id
           and listing.owner_id = (select auth.uid())
      )
    )
$$;
revoke all on function public.live_edit_admin_can_edit(text, text, text) from public, anon;
grant execute on function public.live_edit_admin_can_edit(text, text, text) to authenticated, service_role;

create or replace function public.live_edit_cinema_actor_can_edit(
  p_screen_id text,
  p_listing_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when profile.is_super_admin then true
        when profile.role = 'admin' then exists (
          select 1
            from public.live_edit_admin_assignments assignment
           where assignment.admin_user_id = profile.id
             and assignment.module_id = 'movies'
             and (assignment.category_id is null or assignment.category_id in ('movie-screens', 'movies'))
             and (
               assignment.listing_id is null
               or assignment.listing_id = p_screen_id
               or assignment.listing_id = p_listing_id
             )
        )
        when profile.role = 'provider' then exists (
          select 1
            from public.live_edit_cinema_screen_owners owner
           where owner.owner_user_id = profile.id
             and (
               owner.screen_id = p_screen_id
               or (p_listing_id is not null and owner.listing_id = p_listing_id)
             )
        )
        else false
      end
        from public.profiles profile
       where profile.id = (select auth.uid())
         and profile.account_status = 'active'
    ),
    false
  )
$$;
revoke all on function public.live_edit_cinema_actor_can_edit(text, text) from public, anon;
grant execute on function public.live_edit_cinema_actor_can_edit(text, text) to authenticated, service_role;

drop policy if exists "Live Edit audit read authorized" on public.live_edit_audit_events;
create policy "Live Edit audit read authorized"
  on public.live_edit_audit_events for select to authenticated
  using (
    actor_user_id = (select auth.uid())
    or public.is_current_user_super_admin()
    or (
      public.is_admin()
      and public.live_edit_admin_can_edit(module, category_id, listing_id)
    )
    or exists (
      select 1 from public.listings listing
      where listing.id = live_edit_audit_events.listing_id
        and listing.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.live_edit_cinema_screen_owners owner
      where owner.screen_id = live_edit_audit_events.listing_id
        and owner.owner_user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Internal audit writer + append-only guard
-- ---------------------------------------------------------------------------
create or replace function private.record_live_edit_audit_event(
  p_actor_user_id uuid,
  p_actor_role text,
  p_module text,
  p_category_id text,
  p_listing_id text,
  p_listing_title text,
  p_action text,
  p_changed_fields text[],
  p_before jsonb,
  p_after jsonb,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.live_edit_audit_events
    (actor_user_id, actor_role, module, category_id, listing_id, listing_title,
     action, changed_fields, summary, before_state, after_state, source)
  values
    (p_actor_user_id, p_actor_role, p_module, p_category_id, p_listing_id,
     left(coalesce(p_listing_title, ''), 200), p_action, p_changed_fields,
     left(p_actor_role || ' ' || p_action || ' for ' || p_module || '/' || p_listing_id
          || ': ' || array_to_string(p_changed_fields, ', '), 500),
     p_before, p_after, p_source)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.record_live_edit_audit_event(uuid, text, text, text, text, text, text, text[], jsonb, jsonb, text)
  from public, anon, authenticated;

create or replace function private.reject_live_edit_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'LIVE_EDIT_AUDIT_APPEND_ONLY' using errcode = '42501';
end;
$$;
revoke all on function private.reject_live_edit_audit_mutation() from public, anon, authenticated, service_role;

drop trigger if exists live_edit_audit_append_only on public.live_edit_audit_events;
create trigger live_edit_audit_append_only
  before update or delete on public.live_edit_audit_events
  for each row execute function private.reject_live_edit_audit_mutation();

drop trigger if exists live_edit_audit_no_truncate on public.live_edit_audit_events;
create trigger live_edit_audit_no_truncate
  before truncate on public.live_edit_audit_events
  for each statement execute function private.reject_live_edit_audit_mutation();

-- ---------------------------------------------------------------------------
-- 6. Listing audit trigger (same transaction as the listing write)
-- ---------------------------------------------------------------------------
create or replace function private.capture_live_edit_listing_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_module text;
  v_changed text[] := array[]::text[];
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_old_payload jsonb := coalesce(old.payload, '{}'::jsonb);
  v_new_payload jsonb := coalesce(new.payload, '{}'::jsonb);
  v_key text;
  v_source text := 'server_listing_trigger';
begin
  if v_actor is null then
    return new;
  end if;

  select case when profile.is_super_admin then 'super_admin' else profile.role end
    into v_role
    from public.profiles profile
   where profile.id = v_actor
     and profile.account_status = 'active';
  if v_role is null or v_role not in ('provider', 'admin', 'super_admin') then
    return new;
  end if;

  v_module := coalesce(
    public.live_edit_listing_module(new.category_id, new.entity_type),
    'unknown'
  );

  if new.title is distinct from old.title then
    v_changed := array_append(v_changed, 'title');
    v_before := v_before || jsonb_build_object('title', old.title);
    v_after := v_after || jsonb_build_object('title', new.title);
  end if;
  if new.category_id is distinct from old.category_id then
    v_changed := array_append(v_changed, 'categoryId');
    v_before := v_before || jsonb_build_object('categoryId', old.category_id);
    v_after := v_after || jsonb_build_object('categoryId', new.category_id);
  end if;
  if new.subcategory is distinct from old.subcategory then
    v_changed := array_append(v_changed, 'subcategory');
    v_before := v_before || jsonb_build_object('subcategory', old.subcategory);
    v_after := v_after || jsonb_build_object('subcategory', new.subcategory);
  end if;
  if new.entity_type is distinct from old.entity_type then
    v_changed := array_append(v_changed, 'entityType');
    v_before := v_before || jsonb_build_object('entityType', old.entity_type);
    v_after := v_after || jsonb_build_object('entityType', new.entity_type);
  end if;
  if new.price is distinct from old.price then
    v_changed := array_append(v_changed, 'price');
    v_before := v_before || jsonb_build_object('price', old.price);
    v_after := v_after || jsonb_build_object('price', new.price);
  end if;
  if new.price_unit is distinct from old.price_unit then
    v_changed := array_append(v_changed, 'priceUnit');
    v_before := v_before || jsonb_build_object('priceUnit', old.price_unit);
    v_after := v_after || jsonb_build_object('priceUnit', new.price_unit);
  end if;
  if new.status is distinct from old.status then
    v_changed := array_append(v_changed, 'status');
    v_before := v_before || jsonb_build_object('status', old.status);
    v_after := v_after || jsonb_build_object('status', new.status);
  end if;
  if new.is_verified is distinct from old.is_verified then
    v_changed := array_append(v_changed, 'isVerified');
    v_before := v_before || jsonb_build_object('isVerified', old.is_verified);
    v_after := v_after || jsonb_build_object('isVerified', new.is_verified);
  end if;
  if new.provider_availability_status is distinct from old.provider_availability_status then
    v_changed := array_append(v_changed, 'providerAvailabilityStatus');
    v_before := v_before || jsonb_build_object('providerAvailabilityStatus', old.provider_availability_status);
    v_after := v_after || jsonb_build_object('providerAvailabilityStatus', new.provider_availability_status);
  end if;
  if new.owner_id is distinct from old.owner_id then
    v_changed := array_append(v_changed, 'ownerId');
    v_before := v_before || jsonb_build_object('ownerId', old.owner_id);
    v_after := v_after || jsonb_build_object('ownerId', new.owner_id);
  end if;
  if (v_old_payload -> 'description') is distinct from (v_new_payload -> 'description') then
    v_changed := array_append(v_changed, 'description');
    v_before := v_before || jsonb_build_object('description', v_old_payload -> 'description');
    v_after := v_after || jsonb_build_object('description', v_new_payload -> 'description');
  end if;
  if (v_old_payload -> 'images') is distinct from (v_new_payload -> 'images') then
    v_changed := array_append(v_changed, 'images');
    v_before := v_before || jsonb_build_object('images', v_old_payload -> 'images');
    v_after := v_after || jsonb_build_object('images', v_new_payload -> 'images');
  end if;
  if (v_old_payload -> 'facilities') is distinct from (v_new_payload -> 'facilities') then
    v_changed := array_append(v_changed, 'facilities');
    v_before := v_before || jsonb_build_object('facilities', v_old_payload -> 'facilities');
    v_after := v_after || jsonb_build_object('facilities', v_new_payload -> 'facilities');
  end if;
  if (v_old_payload -> 'availability') is distinct from (v_new_payload -> 'availability') then
    v_changed := array_append(v_changed, 'availability');
    v_before := v_before || jsonb_build_object('availability', v_old_payload -> 'availability');
    v_after := v_after || jsonb_build_object('availability', v_new_payload -> 'availability');
  end if;
  if (v_old_payload -> 'isFeatured') is distinct from (v_new_payload -> 'isFeatured') then
    v_changed := array_append(v_changed, 'isFeatured');
    v_before := v_before || jsonb_build_object('isFeatured', v_old_payload -> 'isFeatured');
    v_after := v_after || jsonb_build_object('isFeatured', v_new_payload -> 'isFeatured');
  end if;

  for v_key in
    select jsonb_object_keys(
      coalesce(v_old_payload -> 'customFieldValues', '{}'::jsonb)
      || coalesce(v_new_payload -> 'customFieldValues', '{}'::jsonb)
    )
  loop
    if (v_old_payload -> 'customFieldValues' -> v_key)
       is distinct from
       (v_new_payload -> 'customFieldValues' -> v_key) then
      v_changed := array_append(v_changed, 'details.' || v_key);
      v_before := v_before || jsonb_build_object(
        'details.' || v_key, v_old_payload -> 'customFieldValues' -> v_key
      );
      v_after := v_after || jsonb_build_object(
        'details.' || v_key, v_new_payload -> 'customFieldValues' -> v_key
      );
    end if;
  end loop;

  if cardinality(v_changed) = 0 then
    return new;
  end if;

  perform private.record_live_edit_audit_event(
    v_actor,
    v_role,
    v_module,
    new.category_id,
    new.id,
    new.title,
    'listing.update',
    v_changed,
    v_before,
    v_after,
    v_source
  );
  return new;
end;
$$;
revoke all on function private.capture_live_edit_listing_audit() from public, anon, authenticated, service_role;

drop trigger if exists live_edit_listing_audit on public.listings;
create trigger live_edit_listing_audit
  after update on public.listings
  for each row execute function private.capture_live_edit_listing_audit();

-- ---------------------------------------------------------------------------
-- 7. Listing write guard (authorization + protected fields + core validation)
-- ---------------------------------------------------------------------------
create or replace function public.guard_live_edit_listing_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_super boolean := false;
  v_old_module text;
  v_new_module text;
  v_review text := coalesce(current_setting('bos.review_transition', true), '');
  v_payload jsonb := coalesce(new.payload, '{}'::jsonb);
  v_old_payload jsonb := case when tg_op = 'UPDATE' then coalesce(old.payload, '{}'::jsonb) else '{}'::jsonb end;
  v_images jsonb;
  v_facilities jsonb;
  v_availability jsonb;
  v_custom jsonb;
begin
  -- Service-role/maintenance writes have no end-user identity. They are not a
  -- client path; column constraints and the verification trigger still apply.
  if v_actor is null then
    return new;
  end if;

  select
    case when profile.is_super_admin then 'super_admin' else profile.role end,
    coalesce(profile.is_super_admin, false)
    into v_role, v_super
    from public.profiles profile
   where profile.id = v_actor
     and profile.account_status = 'active';

  if v_role is null or v_role not in ('provider', 'admin', 'super_admin') then
    raise exception 'LIVE_EDIT_ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  -- Core listing columns.
  if new.price is null
     or new.price < 0
     or new.price > 1000000000
     or new.price <> round(new.price, 2) then
    raise exception 'INVALID_LISTING_PRICE' using errcode = '22023';
  end if;
  if char_length(btrim(new.title)) < 2 or char_length(btrim(new.title)) > 160 then
    raise exception 'INVALID_LISTING_FIELDS' using errcode = '22023';
  end if;
  if char_length(btrim(new.category_id)) < 1 or char_length(btrim(new.category_id)) > 80
     or char_length(btrim(new.subcategory)) < 1 or char_length(btrim(new.subcategory)) > 80
     or char_length(btrim(new.entity_type)) < 1 or char_length(btrim(new.entity_type)) > 40
     or char_length(btrim(new.price_unit)) < 1 or char_length(btrim(new.price_unit)) > 40 then
    raise exception 'INVALID_LISTING_FIELDS' using errcode = '22023';
  end if;
  if new.status not in ('pending_approval', 'active', 'rejected', 'expired', 'archived') then
    raise exception 'INVALID_LISTING_STATUS' using errcode = '22023';
  end if;

  -- Payload shape and content that the UI is allowed to edit.
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'INVALID_LISTING_FIELDS' using errcode = '22023';
  end if;
  if char_length(coalesce(v_payload ->> 'description', '')) > 5000 then
    raise exception 'INVALID_LISTING_FIELDS' using errcode = '22023';
  end if;

  v_images := v_payload -> 'images';
  if v_images is not null and jsonb_typeof(v_images) <> 'null' then
    if jsonb_typeof(v_images) <> 'array' or jsonb_array_length(v_images) > 16 then
      raise exception 'INVALID_LISTING_FIELDS' using errcode = '22023';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(v_images) entry
       where jsonb_typeof(entry) <> 'string'
          or char_length(entry #>> '{}') > 600
          or (entry #>> '{}') !~ '^https://'
    ) then
      raise exception 'INVALID_LISTING_IMAGES' using errcode = '22023';
    end if;
  end if;

  v_facilities := v_payload -> 'facilities';
  if v_facilities is not null and jsonb_typeof(v_facilities) <> 'null' then
    if jsonb_typeof(v_facilities) <> 'array' or jsonb_array_length(v_facilities) > 30 then
      raise exception 'INVALID_LISTING_FIELDS' using errcode = '22023';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(v_facilities) entry
       where jsonb_typeof(entry) <> 'string'
          or char_length(entry #>> '{}') > 60
    ) then
      raise exception 'INVALID_LISTING_FACILITIES' using errcode = '22023';
    end if;
  end if;

  v_availability := v_payload -> 'availability';
  if v_availability is not null and jsonb_typeof(v_availability) <> 'null' then
    if jsonb_typeof(v_availability) <> 'object'
       or coalesce(v_availability ->> 'status', 'not_reported')
          not in ('available', 'limited', 'sold_out', 'not_reported')
       or char_length(coalesce(v_availability ->> 'note', '')) > 300 then
      raise exception 'INVALID_LISTING_AVAILABILITY' using errcode = '22023';
    end if;
    if coalesce(v_availability ->> 'nextAvailableFrom', '') <> ''
       and (v_availability ->> 'nextAvailableFrom') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'INVALID_LISTING_AVAILABILITY' using errcode = '22023';
    end if;
    -- jsonb_exists avoids plpgsql treating the jsonb ? operator as a parameter placeholder (SQLSTATE 42601).
    if jsonb_exists(v_availability, 'unitsAvailable')
       and jsonb_typeof(v_availability -> 'unitsAvailable') <> 'null' then
      if jsonb_typeof(v_availability -> 'unitsAvailable') <> 'number'
         or (v_availability ->> 'unitsAvailable')::numeric < 0
         or (v_availability ->> 'unitsAvailable')::numeric > 1000000
         or (v_availability ->> 'unitsAvailable')::numeric <> floor((v_availability ->> 'unitsAvailable')::numeric) then
        raise exception 'INVALID_LISTING_AVAILABILITY' using errcode = '22023';
      end if;
    end if;
  end if;

  v_custom := v_payload -> 'customFieldValues';
  if v_custom is not null and jsonb_typeof(v_custom) <> 'null' then
    if jsonb_typeof(v_custom) <> 'object' then
      raise exception 'INVALID_LISTING_FIELDS' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_each(v_custom) entry
       where jsonb_typeof(entry.value) not in ('string', 'number', 'boolean', 'null')
    ) then
      raise exception 'INVALID_LISTING_FIELDS' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_each_text(v_custom) entry
       where char_length(entry.value) > 1000
    ) then
      raise exception 'INVALID_LISTING_FIELDS' using errcode = '22023';
    end if;
  end if;

  v_new_module := public.live_edit_listing_module(new.category_id, new.entity_type);
  if tg_op = 'UPDATE' then
    v_old_module := public.live_edit_listing_module(old.category_id, old.entity_type);
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending_approval' and not v_super then
      raise exception 'LISTING_PUBLICATION_ADMIN_ONLY' using errcode = '42501';
    end if;
    if (new.is_verified or new.verified_at is not null or new.verified_by is not null)
       and not v_super then
      raise exception 'LISTING_VERIFICATION_ADMIN_ONLY' using errcode = '42501';
    end if;
    if coalesce(v_payload -> 'isFeatured', 'false'::jsonb) <> 'false'::jsonb
       and not v_super then
      raise exception 'LISTING_FEATURED_SUPER_ADMIN_ONLY' using errcode = '42501';
    end if;
    if v_role = 'provider' and new.owner_id <> v_actor then
      raise exception 'FORBIDDEN_NOT_LISTING_OWNER' using errcode = '42501';
    end if;
    if v_role = 'admin' and not v_super then
      if not public.live_edit_admin_can_edit(v_new_module, new.category_id, new.id) then
        raise exception 'LISTING_ASSIGNMENT_REQUIRED' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE ownership and assignment.
  if new.owner_id is distinct from old.owner_id and not v_super then
    raise exception 'LISTING_OWNER_CHANGE_SUPER_ADMIN_ONLY' using errcode = '42501';
  end if;

  if v_role = 'provider' then
    if old.owner_id <> v_actor then
      raise exception 'FORBIDDEN_NOT_LISTING_OWNER' using errcode = '42501';
    end if;
    if v_old_module is distinct from v_new_module then
      raise exception 'LISTING_MODULE_CHANGE_FORBIDDEN' using errcode = '42501';
    end if;
    if new.status is distinct from old.status
       and new.status not in ('pending_approval', 'archived') then
      raise exception 'LISTING_PUBLICATION_ADMIN_ONLY' using errcode = '42501';
    end if;
  end if;

  if v_role = 'admin' and not v_super then
    if not public.live_edit_admin_can_edit(v_old_module, old.category_id, old.id) then
      raise exception 'LISTING_ASSIGNMENT_REQUIRED' using errcode = '42501';
    end if;
    if v_new_module is distinct from v_old_module
       or new.category_id is distinct from old.category_id then
      if not public.live_edit_admin_can_edit(v_new_module, new.category_id, old.id) then
        raise exception 'LISTING_ASSIGNMENT_REQUIRED' using errcode = '42501';
      end if;
    end if;
  end if;

  -- Protected fields. Super Admin authority is re-read on every write by the
  -- helper functions; a stale JWT claim cannot grant any of these.
  if (new.is_verified, new.verified_at, new.verified_by)
       is distinct from (old.is_verified, old.verified_at, old.verified_by)
     and not v_super then
    raise exception 'LISTING_VERIFICATION_ADMIN_ONLY' using errcode = '42501';
  end if;
  if new.provider_availability_status is distinct from old.provider_availability_status
     and not v_super
     and not (v_role = 'provider' and old.owner_id = v_actor) then
    raise exception 'LISTING_MODERATION_SUPER_ADMIN_ONLY' using errcode = '42501';
  end if;
  if coalesce(v_payload -> 'isFeatured', 'false'::jsonb)
       is distinct from coalesce(v_old_payload -> 'isFeatured', 'false'::jsonb)
     and not v_super then
    raise exception 'LISTING_FEATURED_SUPER_ADMIN_ONLY' using errcode = '42501';
  end if;

  -- Publication transitions: providers cannot publish; non-super admins must
  -- use the reviewed API path (which sets bos.review_transition inside its
  -- transaction). Super Admin is platform-wide by design.
  if new.status is distinct from old.status
     and new.status in ('active', 'rejected', 'pending_approval')
     and not v_super
     and v_review <> 'on' then
    raise exception 'LISTING_REVIEW_ENDPOINT_REQUIRED' using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function public.guard_live_edit_listing_write() from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_live_edit_listing_write on public.listings;
create trigger trg_guard_live_edit_listing_write
  before insert or update on public.listings
  for each row execute function public.guard_live_edit_listing_write();

alter table public.listings
  drop constraint if exists listings_price_range_check;
alter table public.listings
  add constraint listings_price_range_check
  check (price >= 0 and price <= 1000000000)
  not valid;

-- ---------------------------------------------------------------------------
-- 8. Cinema audit writer (server calls it inside a DB transaction)
-- ---------------------------------------------------------------------------
create or replace function public.record_live_edit_cinema_audit(
  p_screen_id text,
  p_listing_id text,
  p_cinema_name text,
  p_changed_fields text[],
  p_before jsonb,
  p_after jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'LIVE_EDIT_UNAUTHENTICATED' using errcode = '42501';
  end if;
  -- Only the server repository transaction sets this GUC. A normal PostgREST
  -- caller cannot execute set_config, so it cannot forge a cinema audit event.
  if coalesce(current_setting('bos.live_edit_server', true), '') <> 'on' then
    raise exception 'LIVE_EDIT_SERVER_CONTEXT_REQUIRED' using errcode = '42501';
  end if;
  if p_screen_id is null
     or char_length(btrim(p_screen_id)) < 1
     or char_length(p_screen_id) > 160
     or char_length(coalesce(p_listing_id, '')) > 160 then
    raise exception 'INVALID_CINEMA_SCREEN_ID' using errcode = '22023';
  end if;
  if p_changed_fields is null or cardinality(p_changed_fields) = 0 then
    raise exception 'LIVE_EDIT_AUDIT_WITHOUT_CHANGES' using errcode = '22023';
  end if;
  if char_length(coalesce(p_before::text, '')) > 200000
     or char_length(coalesce(p_after::text, '')) > 200000 then
    raise exception 'INVALID_CINEMA_AUDIT_PAYLOAD' using errcode = '22023';
  end if;

  select case when profile.is_super_admin then 'super_admin' else profile.role end
    into v_role
    from public.profiles profile
   where profile.id = v_actor
     and profile.account_status = 'active';
  if v_role is null or v_role not in ('provider', 'admin', 'super_admin') then
    raise exception 'LIVE_EDIT_ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  if not public.live_edit_cinema_actor_can_edit(p_screen_id, p_listing_id) then
    raise exception 'FORBIDDEN_CINEMA_SCREEN' using errcode = '42501';
  end if;

  select private.record_live_edit_audit_event(
    v_actor,
    v_role,
    'movies',
    'movie-screens',
    p_screen_id,
    p_cinema_name,
    'cinema_screen.update',
    p_changed_fields,
    coalesce(p_before, '{}'::jsonb),
    coalesce(p_after, '{}'::jsonb),
    'server_cinema_api'
  )
  into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_live_edit_cinema_audit(text, text, text, text[], jsonb, jsonb)
  from public, anon;
grant execute on function public.record_live_edit_cinema_audit(text, text, text, text[], jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Transactional PostgreSQL cinema screens
--
-- The baseline already has public.cinema_screens (id, cinema_listing_id,
-- cinema_title, format, sound_system, ...). We extend it rather than create a
-- second table: add ownership/concurrency fields, replace the broad
-- "any provider/admin can manage every screen" policy, seed the discovery
-- screens, and enforce/audit writes with triggers.
-- ---------------------------------------------------------------------------
alter table public.cinema_screens
  add column if not exists fnb_delivery_enabled boolean not null default false,
  add column if not exists seat_tiers jsonb not null default '[]'::jsonb,
  add column if not exists row_version bigint not null default 1;

create index if not exists cinema_screens_listing_idx
  on public.cinema_screens (cinema_listing_id);
create index if not exists cinema_screens_updated_idx
  on public.cinema_screens (updated_at desc);

alter table public.cinema_screens enable row level security;
revoke all on public.cinema_screens from public, anon, authenticated;
grant select on public.cinema_screens to anon, authenticated;
grant insert, update on public.cinema_screens to authenticated;

drop policy if exists "Providers and admins can manage cinema screens" on public.cinema_screens;
drop policy if exists "Cinema screens are viewable by everyone" on public.cinema_screens;
drop policy if exists "Cinema screens are public discovery data" on public.cinema_screens;
create policy "Cinema screens are public discovery data"
  on public.cinema_screens for select to anon, authenticated
  using (true);

drop policy if exists "Owners and assigned admins insert cinema screens" on public.cinema_screens;
create policy "Owners and assigned admins insert cinema screens"
  on public.cinema_screens for insert to authenticated
  with check (public.live_edit_cinema_actor_can_edit(id, cinema_listing_id));

drop policy if exists "Owners and assigned admins update cinema screens" on public.cinema_screens;
create policy "Owners and assigned admins update cinema screens"
  on public.cinema_screens for update to authenticated
  using (public.live_edit_cinema_actor_can_edit(id, cinema_listing_id))
  with check (public.live_edit_cinema_actor_can_edit(id, cinema_listing_id));

-- Seed the discovery screens once. No owner is assigned here, so providers stay
-- fail-closed until a Super Admin assigns ownership.
insert into public.cinema_screens
  (id, cinema_listing_id, cinema_title, area, screen_name, format, sound_system,
   total_seats, tiers, seat_tiers, wheelchair_seats, showtimes, cancellation_allowed,
   cancellation_cutoff_minutes, refund_percent, convenience_fee_per_seat, gst_percent,
   fnb_delivery_enabled, row_version, updated_at)
values
  ('scr-amb-1', 'movie-hyd-1', 'AMB Cinemas Gachibowli', 'Hyderabad',
   'Screen 1 · Barco Flagship Laser & VIP M-Lounge', 'Barco 4K RGB Laser', 'Dolby Atmos 64-Ch', 80,
   '[{"name":"VIP M-Lounge Recliner","rows":["A","B"],"price":375},{"name":"Prime Executive 4K","rows":["C","D","E","F"],"price":250},{"name":"Classic Balcony","rows":["G","H"],"price":188}]'::jsonb,
   '[{"id":"recliner","name":"VIP M-Lounge Recliner","priceMultiplier":1.5,"rows":["A","B"],"seatsPerRow":8},{"id":"prime","name":"Prime Executive 4K","priceMultiplier":1.0,"rows":["C","D","E","F"],"seatsPerRow":10},{"id":"classic","name":"Classic Balcony","priceMultiplier":0.75,"rows":["G","H"],"seatsPerRow":10}]'::jsonb,
   '["A1","A8"]'::jsonb, '["10:30 AM","01:45 PM","04:50 PM","07:55 PM","10:55 PM"]'::jsonb,
   true, 120, 80, 28, 18, true, 1, '2026-10-30T08:00:00Z'::timestamptz),
  ('scr-prasads-pcx', 'movie-hyd-2', 'Prasads Multiplex PCX', 'Hyderabad',
   'PCX Giant Screen (64ft x 101ft Dual 4K)', 'Dual Christie 4K 3D', 'QSC Dolby Atmos', 80,
   '[{"name":"PCX Lounger Pod","rows":["A","B"],"price":375},{"name":"PCX Prime Eye-Level","rows":["C","D","E","F"],"price":250},{"name":"Classic Orchestra","rows":["G","H"],"price":188}]'::jsonb,
   '[{"id":"recliner","name":"PCX Lounger Pod","priceMultiplier":1.5,"rows":["A","B"],"seatsPerRow":8},{"id":"prime","name":"PCX Prime Eye-Level","priceMultiplier":1.0,"rows":["C","D","E","F"],"seatsPerRow":10},{"id":"classic","name":"Classic Orchestra","priceMultiplier":0.75,"rows":["G","H"],"seatsPerRow":10}]'::jsonb,
   '["A1","A8"]'::jsonb, '["08:15 AM","11:30 AM","02:45 PM","06:15 PM","09:45 PM"]'::jsonb,
   true, 180, 75, 28, 18, true, 1, '2026-10-30T08:00:00Z'::timestamptz),
  ('scr-aaa-epiq', 'movie-hyd-3', 'AAA Cinemas Ameerpet', 'Hyderabad',
   'Screen 1 · EPIQ Giant Format & LED Lounge', 'EPIQ 4K Laser', 'Dolby Atmos Immersive', 80,
   '[{"name":"Sky Lounge Recliner","rows":["A","B"],"price":375},{"name":"EPIQ Prime Gold","rows":["C","D","E","F"],"price":250},{"name":"Executive Silver","rows":["G","H"],"price":188}]'::jsonb,
   '[{"id":"recliner","name":"Sky Lounge Recliner","priceMultiplier":1.5,"rows":["A","B"],"seatsPerRow":8},{"id":"prime","name":"EPIQ Prime Gold","priceMultiplier":1.0,"rows":["C","D","E","F"],"seatsPerRow":10},{"id":"classic","name":"Executive Silver","priceMultiplier":0.75,"rows":["G","H"],"seatsPerRow":10}]'::jsonb,
   '["A1","A8"]'::jsonb, '["10:00 AM","01:15 PM","04:30 PM","07:45 PM","10:45 PM"]'::jsonb,
   true, 120, 80, 28, 18, true, 1, '2026-10-30T08:00:00Z'::timestamptz),
  ('scr-sudarshan-35mm', 'movie-hyd-4', 'Sudarshan 35MM Cinemas', 'Hyderabad',
   'Main Auditorium · 4K RGB Laser Mass Hub', '4K RGB Laser', 'Dolby Atmos Thunder', 80,
   '[{"name":"Upper Balcony Dress Circle","rows":["A","B"],"price":350},{"name":"Royal Balcony","rows":["C","D","E","F"],"price":250},{"name":"First Class Stall","rows":["G","H"],"price":188}]'::jsonb,
   '[{"id":"recliner","name":"Upper Balcony Dress Circle","priceMultiplier":1.4,"rows":["A","B"],"seatsPerRow":8},{"id":"prime","name":"Royal Balcony","priceMultiplier":1.0,"rows":["C","D","E","F"],"seatsPerRow":10},{"id":"classic","name":"First Class Stall","priceMultiplier":0.75,"rows":["G","H"],"seatsPerRow":10}]'::jsonb,
   '["A1","A8"]'::jsonb, '["11:00 AM","02:15 PM","06:00 PM","09:30 PM"]'::jsonb,
   true, 60, 85, 28, 18, false, 1, '2026-10-30T08:00:00Z'::timestamptz),
  ('scr-binge-private', 'movie-hyd-5', 'Binge Celebration Theatres', 'Hyderabad',
   'Private Luxury Pod · 135" 4K Dolby Atmos', '135" 4K Cinema Screen', 'Dolby Atmos 7.1.4', 80,
   '[{"name":"Private VIP Celebration Pod","rows":["A","B"],"price":300},{"name":"Luxury Lounge Sofa","rows":["C","D","E","F"],"price":250},{"name":"Companion Seating","rows":["G","H"],"price":212}]'::jsonb,
   '[{"id":"recliner","name":"Private VIP Celebration Pod","priceMultiplier":1.2,"rows":["A","B"],"seatsPerRow":8},{"id":"prime","name":"Luxury Lounge Sofa","priceMultiplier":1.0,"rows":["C","D","E","F"],"seatsPerRow":10},{"id":"classic","name":"Companion Seating","priceMultiplier":0.85,"rows":["G","H"],"seatsPerRow":10}]'::jsonb,
   '["A1","A8"]'::jsonb, '["10:00 AM","01:30 PM","05:00 PM","08:30 PM"]'::jsonb,
   true, 240, 90, 28, 18, true, 1, '2026-10-30T08:00:00Z'::timestamptz)
on conflict (id) do nothing;

create or replace function public.guard_cinema_screen_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_super boolean := false;
begin
  if v_actor is null then
    return new;
  end if;

  select case when profile.is_super_admin then 'super_admin' else profile.role end,
         coalesce(profile.is_super_admin, false)
    into v_role, v_super
    from public.profiles profile
   where profile.id = v_actor
     and profile.account_status = 'active';
  if v_role is null or v_role not in ('provider', 'admin', 'super_admin') then
    raise exception 'LIVE_EDIT_ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  if new.id is null or char_length(btrim(new.id)) < 1 or char_length(new.id) > 160
     or new.cinema_listing_id is null
     or char_length(btrim(new.cinema_listing_id)) < 1
     or char_length(new.cinema_listing_id) > 160
     or char_length(btrim(new.cinema_title)) < 1 or char_length(new.cinema_title) > 120
     or char_length(btrim(new.screen_name)) < 1 or char_length(new.screen_name) > 120
     or char_length(coalesce(new.format, '')) > 80
     or char_length(coalesce(new.sound_system, '')) > 80 then
    raise exception 'INVALID_CINEMA_FIELDS' using errcode = '22023';
  end if;
  if new.cancellation_cutoff_minutes < 0 or new.cancellation_cutoff_minutes > 1440
     or new.refund_percent < 0 or new.refund_percent > 100
     or new.convenience_fee_per_seat < 0 or new.convenience_fee_per_seat > 10000
     or new.gst_percent < 0 or new.gst_percent > 50
     or new.total_seats < 1 or new.total_seats > 100000 then
    raise exception 'INVALID_CINEMA_FIELDS' using errcode = '22023';
  end if;
  if jsonb_typeof(new.showtimes) <> 'array'
     or jsonb_array_length(new.showtimes) < 1
     or jsonb_array_length(new.showtimes) > 30 then
    raise exception 'INVALID_CINEMA_FIELDS' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.showtimes) entry
     where jsonb_typeof(entry) <> 'string'
        or (entry #>> '{}') !~ '^([01]{0,1}[0-9]|2[0-3]):[0-5][0-9]( {0,1}(AM|PM)){0,1}$'
  ) then
    raise exception 'INVALID_CINEMA_FIELDS' using errcode = '22023';
  end if;
  if jsonb_typeof(new.wheelchair_seats) <> 'array' or jsonb_array_length(new.wheelchair_seats) > 50 then
    raise exception 'INVALID_CINEMA_FIELDS' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.wheelchair_seats) entry
     where jsonb_typeof(entry) <> 'string' or (entry #>> '{}') !~ '^[A-Z]{1,3}[0-9]{1,3}$'
  ) then
    raise exception 'INVALID_CINEMA_FIELDS' using errcode = '22023';
  end if;
  if jsonb_typeof(new.tiers) <> 'array'
     or jsonb_array_length(new.tiers) < 1
     or jsonb_array_length(new.tiers) > 10 then
    raise exception 'INVALID_CINEMA_FIELDS' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.tiers) tier
     where jsonb_typeof(tier) <> 'object'
        or jsonb_typeof(tier -> 'name') <> 'string'
        or char_length(tier ->> 'name') < 1
        or char_length(tier ->> 'name') > 40
        or jsonb_typeof(tier -> 'price') <> 'number'
        or (tier ->> 'price')::numeric < 0
        or (tier ->> 'price')::numeric > 1000000
        or jsonb_typeof(tier -> 'rows') <> 'array'
  ) then
    raise exception 'INVALID_CINEMA_FIELDS' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.id <> old.id and not v_super then
      raise exception 'CINEMA_SCREEN_ID_IMMUTABLE' using errcode = '42501';
    end if;
    if v_role = 'provider' and new.cinema_listing_id <> old.cinema_listing_id then
      raise exception 'CINEMA_LISTING_CHANGE_FORBIDDEN' using errcode = '42501';
    end if;
    if not public.live_edit_cinema_actor_can_edit(old.id, old.cinema_listing_id) then
      raise exception 'FORBIDDEN_CINEMA_SCREEN' using errcode = '42501';
    end if;
  end if;
  if not public.live_edit_cinema_actor_can_edit(new.id, new.cinema_listing_id) then
    raise exception 'FORBIDDEN_CINEMA_SCREEN' using errcode = '42501';
  end if;

  new.updated_at := now();
  new.row_version := case when tg_op = 'UPDATE' then old.row_version + 1 else 1 end;
  return new;
end;
$$;
revoke all on function public.guard_cinema_screen_write() from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_cinema_screen_write on public.cinema_screens;
create trigger trg_guard_cinema_screen_write
  before insert or update on public.cinema_screens
  for each row execute function public.guard_cinema_screen_write();

create or replace function private.capture_cinema_screen_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_changed text[] := array[]::text[];
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_action text;
begin
  if v_actor is null then
    return new;
  end if;
  select case when profile.is_super_admin then 'super_admin' else profile.role end
    into v_role
    from public.profiles profile
   where profile.id = v_actor and profile.account_status = 'active';
  if v_role is null or v_role not in ('provider', 'admin', 'super_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'cinema_screen.create';
    v_changed := array[
      'title', 'subcategory', 'listingId', 'details.format', 'details.soundSystem',
      'details.showtimes', 'details.cancellationCutoffMinutes', 'details.refundPercent',
      'details.tierPricing', 'details.fnbDeliveryEnabled', 'details.wheelchairSeats'
    ];
    v_after := jsonb_build_object(
      'title', new.cinema_title,
      'subcategory', new.screen_name,
      'listingId', new.cinema_listing_id,
      'details.format', new.format,
      'details.soundSystem', new.sound_system,
      'details.showtimes', new.showtimes,
      'details.cancellationCutoffMinutes', new.cancellation_cutoff_minutes,
      'details.refundPercent', new.refund_percent,
      'details.tierPricing', new.tiers,
      'details.fnbDeliveryEnabled', new.fnb_delivery_enabled,
      'details.wheelchairSeats', new.wheelchair_seats
    );
  else
    v_action := 'cinema_screen.update';
    if new.cinema_title is distinct from old.cinema_title then
      v_changed := array_append(v_changed, 'title');
      v_before := v_before || jsonb_build_object('title', old.cinema_title);
      v_after := v_after || jsonb_build_object('title', new.cinema_title);
    end if;
    if new.screen_name is distinct from old.screen_name then
      v_changed := array_append(v_changed, 'subcategory');
      v_before := v_before || jsonb_build_object('subcategory', old.screen_name);
      v_after := v_after || jsonb_build_object('subcategory', new.screen_name);
    end if;
    if new.cinema_listing_id is distinct from old.cinema_listing_id then
      v_changed := array_append(v_changed, 'listingId');
      v_before := v_before || jsonb_build_object('listingId', old.cinema_listing_id);
      v_after := v_after || jsonb_build_object('listingId', new.cinema_listing_id);
    end if;
    if new.format is distinct from old.format then
      v_changed := array_append(v_changed, 'details.format');
      v_before := v_before || jsonb_build_object('details.format', old.format);
      v_after := v_after || jsonb_build_object('details.format', new.format);
    end if;
    if new.sound_system is distinct from old.sound_system then
      v_changed := array_append(v_changed, 'details.soundSystem');
      v_before := v_before || jsonb_build_object('details.soundSystem', old.sound_system);
      v_after := v_after || jsonb_build_object('details.soundSystem', new.sound_system);
    end if;
    if new.showtimes is distinct from old.showtimes then
      v_changed := array_append(v_changed, 'details.showtimes');
      v_before := v_before || jsonb_build_object('details.showtimes', old.showtimes);
      v_after := v_after || jsonb_build_object('details.showtimes', new.showtimes);
    end if;
    if new.cancellation_cutoff_minutes is distinct from old.cancellation_cutoff_minutes then
      v_changed := array_append(v_changed, 'details.cancellationCutoffMinutes');
      v_before := v_before || jsonb_build_object('details.cancellationCutoffMinutes', old.cancellation_cutoff_minutes);
      v_after := v_after || jsonb_build_object('details.cancellationCutoffMinutes', new.cancellation_cutoff_minutes);
    end if;
    if new.refund_percent is distinct from old.refund_percent then
      v_changed := array_append(v_changed, 'details.refundPercent');
      v_before := v_before || jsonb_build_object('details.refundPercent', old.refund_percent);
      v_after := v_after || jsonb_build_object('details.refundPercent', new.refund_percent);
    end if;
    if new.tiers is distinct from old.tiers then
      v_changed := array_append(v_changed, 'details.tierPricing');
      v_before := v_before || jsonb_build_object('details.tierPricing', old.tiers);
      v_after := v_after || jsonb_build_object('details.tierPricing', new.tiers);
    end if;
    if new.fnb_delivery_enabled is distinct from old.fnb_delivery_enabled then
      v_changed := array_append(v_changed, 'details.fnbDeliveryEnabled');
      v_before := v_before || jsonb_build_object('details.fnbDeliveryEnabled', old.fnb_delivery_enabled);
      v_after := v_after || jsonb_build_object('details.fnbDeliveryEnabled', new.fnb_delivery_enabled);
    end if;
    if new.wheelchair_seats is distinct from old.wheelchair_seats then
      v_changed := array_append(v_changed, 'details.wheelchairSeats');
      v_before := v_before || jsonb_build_object('details.wheelchairSeats', old.wheelchair_seats);
      v_after := v_after || jsonb_build_object('details.wheelchairSeats', new.wheelchair_seats);
    end if;
  end if;

  if cardinality(v_changed) = 0 then
    return new;
  end if;

  perform private.record_live_edit_audit_event(
    v_actor,
    v_role,
    'movies',
    'movie-screens',
    new.id,
    new.cinema_title,
    v_action,
    v_changed,
    v_before,
    v_after,
    'server_cinema_trigger'
  );
  return new;
end;
$$;
revoke all on function private.capture_cinema_screen_audit() from public, anon, authenticated, service_role;

drop trigger if exists live_edit_cinema_screen_audit on public.cinema_screens;
create trigger live_edit_cinema_screen_audit
  after insert or update on public.cinema_screens
  for each row execute function private.capture_cinema_screen_audit();

-- Verified cinema ownership assignment: only a fresh Super Admin may write the
-- owner table, the owner must be an active provider, and listing_id is derived
-- from the screen row rather than trusted from the caller.
create or replace function public.guard_cinema_owner_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_listing text;
begin
  if v_actor is null then
    return new;
  end if;
  if not public.is_current_user_super_admin() then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.screen_id <> old.screen_id then
    raise exception 'CINEMA_SCREEN_ID_IMMUTABLE' using errcode = '42501';
  end if;
  select screen.cinema_listing_id into v_listing
    from public.cinema_screens screen
   where screen.id = new.screen_id;
  if v_listing is null then
    raise exception 'CINEMA_SCREEN_NOT_FOUND' using errcode = '23503';
  end if;
  new.listing_id := v_listing;
  if not exists (
    select 1 from public.profiles provider
     where provider.id = new.owner_user_id
       and provider.role = 'provider'
       and provider.account_status = 'active'
  ) then
    raise exception 'ACTIVE_PROVIDER_REQUIRED' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_cinema_owner_write() from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_cinema_owner_write on public.live_edit_cinema_screen_owners;
create trigger trg_guard_cinema_owner_write
  before insert or update on public.live_edit_cinema_screen_owners
  for each row execute function public.guard_cinema_owner_write();

create or replace function private.capture_cinema_owner_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_screen text;
  v_title text;
  v_action text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    return coalesce(new, old);
  end if;
  select case when profile.is_super_admin then 'super_admin' else profile.role end
    into v_role
    from public.profiles profile
   where profile.id = v_actor and profile.account_status = 'active';
  if v_role is null or v_role not in ('provider', 'admin', 'super_admin') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_action := 'cinema_screen.owner_revoked';
    v_screen := old.screen_id;
    v_before := jsonb_build_object('ownerUserId', old.owner_user_id);
  else
    v_action := 'cinema_screen.owner_assigned';
    v_screen := new.screen_id;
    v_after := jsonb_build_object('ownerUserId', new.owner_user_id);
    if tg_op = 'UPDATE' then
      v_before := jsonb_build_object('ownerUserId', old.owner_user_id);
    end if;
  end if;

  select screen.cinema_title into v_title
    from public.cinema_screens screen
   where screen.id = v_screen;

  perform private.record_live_edit_audit_event(
    v_actor,
    v_role,
    'movies',
    'movie-screens',
    v_screen,
    coalesce(v_title, v_screen),
    v_action,
    array['ownerUserId'],
    v_before,
    v_after,
    'server_cinema_owner_trigger'
  );
  return coalesce(new, old);
end;
$$;
revoke all on function private.capture_cinema_owner_audit() from public, anon, authenticated, service_role;

drop trigger if exists live_edit_cinema_owner_audit on public.live_edit_cinema_screen_owners;
create trigger live_edit_cinema_owner_audit
  after insert or update or delete on public.live_edit_cinema_screen_owners
  for each row execute function private.capture_cinema_owner_audit();

alter table public.live_edit_cinema_screen_owners
  drop constraint if exists live_edit_cinema_owner_screen_fkey;
alter table public.live_edit_cinema_screen_owners
  add constraint live_edit_cinema_owner_screen_fkey
  foreign key (screen_id) references public.cinema_screens(id)
  on delete cascade
  not valid;

commit;

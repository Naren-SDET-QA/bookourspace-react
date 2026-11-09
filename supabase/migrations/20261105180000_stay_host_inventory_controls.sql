-- Local candidate only. Enables hosts to restore calendar availability and
-- reorder their own finalized listing media. Do not apply to a hosted project
-- without a separately approved migration plan.


begin;
alter table public.stay_blocks
  add column if not exists is_active boolean not null default true;

drop policy if exists "Active owners/admins read stay blocks" on public.stay_blocks;
create policy "Active owners/admins read stay blocks"
  on public.stay_blocks for select to authenticated
  using (exists (
    select 1 from public.stay_units u
    join public.stay_room_types rt on rt.id = u.room_type_id
    join public.stay_properties p on p.id = rt.property_id
    where u.id = stay_blocks.unit_id
      and ((p.owner_user_id = auth.uid() and public.is_active_user())
        or (public.is_admin() and exists (
          select 1 from public.profiles ap where ap.id = auth.uid()
            and ap.role = 'admin' and ap.account_status = 'active'
        )))
  ));

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
  v_range := pg_catalog.daterange(p_from, p_to, '[)');
  perform public.sweep_expired_stay_holds();
  return query
    select u.id, u.label
      from public.stay_units u
     where u.room_type_id = p_room_type_id
       and u.is_active
       and not exists (
         select 1 from public.stay_allocations a
          where a.unit_id = u.id
            and a.status in ('held','confirmed')
            and a.stay_dates && v_range
       )
       and not exists (
         select 1 from public.stay_blocks b
          where b.unit_id = u.id and b.is_active and b.stay_dates && v_range
       )
     order by u.label;
end;
$$;

-- Availability is intentionally callable by the storefront. It returns only
-- free unit identifiers/labels and resolves every relation/function explicitly.
revoke all on function public.stay_availability(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.stay_availability(uuid, date, date) to anon, authenticated, service_role;

-- Storage publication remains governed by 20261105160000. Owners may only
-- change ordering and accessibility text on their own ready listing media.
grant update (display_order, alt_text, caption) on public.media_assets to authenticated;
drop policy if exists "Owners reorder ready listing media" on public.media_assets;
create policy "Owners reorder ready listing media"
  on public.media_assets for update to authenticated
  using (
    owner_id = auth.uid()
    and processing_status = 'ready'
    and parent_type = 'provider_listing'
    and exists (
      select 1 from public.listings l
       where l.id = media_assets.parent_id and l.owner_id = auth.uid()
         and public.live_edit_listing_module(l.category_id, l.entity_type) = 'hotel_stay'
    )
  )
  with check (
    owner_id = auth.uid()
    and processing_status = 'ready'
    and parent_type = 'provider_listing'
    and display_order between 0 and 1000
    and exists (
      select 1 from public.listings l
       where l.id = media_assets.parent_id and l.owner_id = auth.uid()
         and public.live_edit_listing_module(l.category_id, l.entity_type) = 'hotel_stay'
    )
  );

-- Validated storage:// listing refs are accepted only when they resolve to
-- ready public media owned by this listing owner; ordinary image URLs remain
-- HTTPS-only. This retains the existing mutation guard and audit behavior.
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
          or (
            (entry #>> '{}') !~ '^https://'
            and not (
              (entry #>> '{}') ~ '^storage://bos-public-media/'
              and exists (
                select 1 from public.media_assets asset
                 where asset.owner_id = new.owner_id
                   and asset.parent_id = new.id
                   and asset.parent_type = 'provider_listing'
                   and asset.bucket_id = 'bos-public-media'
                   and asset.privacy = 'public'
                   and asset.processing_status = 'ready'
                   and ('storage://' || asset.bucket_id || '/' || asset.object_path) = entry #>> '{}'
              )
            )
          )
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

commit;

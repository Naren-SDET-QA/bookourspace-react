-- Production hardening for the Hotels & Stays admin transaction.
--
-- The original RPC used a narrower regular expression than the canonical
-- live-edit module resolver. Reusing the resolver keeps the admin write path
-- aligned with public stay discovery, including the legacy "hotel_stay" id and
-- all current "hotel-*" category ids.
begin;

create or replace function public.admin_upsert_stay_inventory(
  p_listing_id text,
  p_owner_id uuid,
  p_listing jsonb,
  p_property jsonb,
  p_room_types jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_property_id uuid;
  v_room jsonb;
  v_unit jsonb;
  v_room_id uuid;
  v_unit_id uuid;
  v_room_ids jsonb := '[]'::jsonb;
  v_unit_ids jsonb := '[]'::jsonb;
  v_listing_status text;
  v_title text;
  v_category text;
  v_subcategory text;
  v_entity_type text;
  v_listing_price numeric;
  v_price_unit text;
  v_name text;
  v_city text;
  v_property_type text;
  v_room_name text;
  v_label text;
  v_units jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.account_status = 'active'
  ) then
    raise exception 'ACTIVE_ADMIN_REQUIRED';
  end if;
  if p_listing_id is null or p_listing_id <> btrim(p_listing_id)
     or length(btrim(p_listing_id)) < 4 or length(p_listing_id) > 120
     or p_owner_id is null
     or pg_catalog.jsonb_typeof(p_listing) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_property) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_room_types) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_room_types) > 50
     or pg_catalog.octet_length(p_listing::text) + pg_catalog.octet_length(p_property::text)
        + pg_catalog.octet_length(p_room_types::text) > 250000 then
    raise exception 'INVALID_STAY_PAYLOAD';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_owner_id and p.role = 'provider' and p.account_status = 'active'
  ) then
    raise exception 'ACTIVE_PROVIDER_REQUIRED';
  end if;

  v_title := nullif(btrim(p_listing->>'title'), '');
  v_category := nullif(btrim(p_listing->>'category_id'), '');
  v_subcategory := nullif(btrim(p_listing->>'subcategory'), '');
  v_entity_type := 'property';
  v_price_unit := coalesce(nullif(btrim(p_listing->>'price_unit'), ''), 'per night');
  v_listing_price := coalesce(nullif(p_listing->>'price', '')::numeric, 0);
  v_listing_status := coalesce(nullif(p_listing->>'status', ''), 'pending_approval');
  v_name := nullif(btrim(p_property->>'name'), '');
  v_city := nullif(btrim(p_property->>'city'), '');
  v_property_type := coalesce(nullif(p_property->>'property_type', ''), 'hotel');

  if v_title is null or v_category is null or v_subcategory is null
     or (v_category not in ('hotel_stay','hotels','hotel','stays','stay') and public.live_edit_listing_module(v_category, v_entity_type) is distinct from 'hotel_stay')
     or v_listing_price < 0
     or v_listing_price::text in ('NaN', 'Infinity', '-Infinity')
     or v_listing_status not in ('pending_approval', 'active', 'expired')
     or v_name is null or v_city is null
     or v_property_type not in ('hotel','resort','homestay','apartment','villa','guesthouse')
     or coalesce(nullif(p_property->>'base_price_paise', '')::integer, 0) < 0
     or coalesce(nullif(p_property->>'tax_percent', '')::numeric, 12) < 0 then
    raise exception 'INVALID_STAY_FIELDS';
  end if;

  perform 1 from public.listings l where l.id = p_listing_id for update;
  insert into public.listings (
    id, owner_id, title, category_id, subcategory, entity_type, price,
    price_unit, status, payload, updated_at
  ) values (
    p_listing_id, p_owner_id, v_title, v_category, v_subcategory, v_entity_type,
    v_listing_price, v_price_unit, v_listing_status,
    coalesce((select l.payload from public.listings l where l.id = p_listing_id), '{}'::jsonb)
      || coalesce(p_listing->'payload', '{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        'id', p_listing_id, 'title', v_title, 'categoryId', v_category,
        'subcategory', v_subcategory, 'entityType', v_entity_type,
        'price', v_listing_price, 'priceUnit', v_price_unit,
        'providerId', p_owner_id, 'status', v_listing_status
      ),
    pg_catalog.now()
  ) on conflict (id) do update set
    owner_id = excluded.owner_id,
    title = excluded.title,
    category_id = excluded.category_id,
    subcategory = excluded.subcategory,
    entity_type = excluded.entity_type,
    price = excluded.price,
    price_unit = excluded.price_unit,
    status = excluded.status,
    payload = excluded.payload,
    updated_at = excluded.updated_at;

  select p.id into v_property_id
  from public.stay_properties p where p.listing_id = p_listing_id for update;
  if v_property_id is null then v_property_id := pg_catalog.gen_random_uuid(); end if;

  insert into public.stay_properties (
    id, listing_id, owner_user_id, name, property_type, city, area, address,
    latitude, longitude, check_in_time, check_out_time, base_price_paise,
    tax_percent, description, amenities, is_active, updated_at
  ) values (
    v_property_id, p_listing_id, p_owner_id, v_name, v_property_type, v_city,
    nullif(btrim(p_property->>'area'), ''), nullif(btrim(p_property->>'address'), ''),
    nullif(p_property->>'latitude', '')::numeric,
    nullif(p_property->>'longitude', '')::numeric,
    coalesce(nullif(p_property->>'check_in_time', '')::time, time '14:00'),
    coalesce(nullif(p_property->>'check_out_time', '')::time, time '11:00'),
    coalesce(nullif(p_property->>'base_price_paise', '')::integer, 0),
    coalesce(nullif(p_property->>'tax_percent', '')::numeric, 12),
    nullif(btrim(p_property->>'description'), ''),
    coalesce(array(select pg_catalog.jsonb_array_elements_text(p_property->'amenities')), '{}'::text[]),
    coalesce((p_property->>'is_active')::boolean, true), pg_catalog.now()
  ) on conflict (listing_id) do update set
    owner_user_id = excluded.owner_user_id,
    name = excluded.name,
    property_type = excluded.property_type,
    city = excluded.city,
    area = excluded.area,
    address = excluded.address,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    check_in_time = excluded.check_in_time,
    check_out_time = excluded.check_out_time,
    base_price_paise = excluded.base_price_paise,
    tax_percent = excluded.tax_percent,
    description = excluded.description,
    amenities = excluded.amenities,
    is_active = excluded.is_active,
    updated_at = pg_catalog.now()
  returning id into v_property_id;

  for v_room in select value from pg_catalog.jsonb_array_elements(p_room_types)
  loop
    v_room_name := nullif(btrim(v_room->>'name'), '');
    if v_room_name is null
       or coalesce(nullif(v_room->>'max_adults', '')::integer, 2) not between 1 and 50
       or coalesce(nullif(v_room->>'max_children', '')::integer, 0) not between 0 and 50
       or coalesce(nullif(v_room->>'base_price_paise', '')::integer, -1) < 0 then
      raise exception 'INVALID_STAY_ROOM_TYPE';
    end if;
    v_room_id := coalesce(nullif(v_room->>'id', '')::uuid, pg_catalog.gen_random_uuid());
    if v_room->>'id' is not null and not exists (
      select 1 from public.stay_room_types rt where rt.id = v_room_id and rt.property_id = v_property_id
    ) then raise exception 'ROOM_TYPE_NOT_FOUND_FOR_PROPERTY'; end if;
    insert into public.stay_room_types (
      id, property_id, name, max_adults, max_children, base_price_paise, amenities, is_active
    ) values (
      v_room_id, v_property_id, v_room_name,
      coalesce(nullif(v_room->>'max_adults', '')::integer, 2),
      coalesce(nullif(v_room->>'max_children', '')::integer, 0),
      (v_room->>'base_price_paise')::integer,
      coalesce(array(select pg_catalog.jsonb_array_elements_text(v_room->'amenities')), '{}'::text[]),
      coalesce((v_room->>'is_active')::boolean, true)
    ) on conflict (id) do update set
      name = excluded.name, max_adults = excluded.max_adults,
      max_children = excluded.max_children, base_price_paise = excluded.base_price_paise,
      amenities = excluded.amenities, is_active = excluded.is_active
    returning id into v_room_id;
    v_room_ids := v_room_ids || pg_catalog.jsonb_build_array(v_room_id);

    v_units := coalesce(v_room->'units', '[]'::jsonb);
    if pg_catalog.jsonb_typeof(v_units) <> 'array'
       or pg_catalog.jsonb_array_length(v_units) > 200 then
      raise exception 'INVALID_STAY_UNITS';
    end if;
    for v_unit in select value from pg_catalog.jsonb_array_elements(v_units)
    loop
      v_label := nullif(btrim(v_unit->>'label'), '');
      if v_label is null then raise exception 'INVALID_STAY_UNIT_LABEL'; end if;
      v_unit_id := coalesce(nullif(v_unit->>'id', '')::uuid, pg_catalog.gen_random_uuid());
      if v_unit->>'id' is not null and not exists (
        select 1 from public.stay_units u where u.id = v_unit_id and u.room_type_id = v_room_id
      ) then raise exception 'UNIT_NOT_FOUND_FOR_ROOM_TYPE'; end if;
      insert into public.stay_units (id, room_type_id, label, floor, is_active)
      values (
        v_unit_id, v_room_id, v_label, nullif(btrim(v_unit->>'floor'), ''),
        coalesce((v_unit->>'is_active')::boolean, true)
      ) on conflict (id) do update set
        label = excluded.label, floor = excluded.floor, is_active = excluded.is_active
      returning id into v_unit_id;
      v_unit_ids := v_unit_ids || pg_catalog.jsonb_build_array(v_unit_id);
    end loop;
  end loop;

  if v_listing_status = 'active' and not exists (
    select 1 from public.stay_room_types rt
    join public.stay_units u on u.room_type_id = rt.id
    where rt.property_id = v_property_id and rt.is_active and u.is_active
  ) then raise exception 'ACTIVE_STAY_REQUIRES_ACTIVE_INVENTORY'; end if;

  insert into public.stay_audit_events (event, detail, actor)
  values (
    'admin_inventory_saved',
    pg_catalog.jsonb_build_object(
      'listing_id', p_listing_id, 'property_id', v_property_id,
      'room_type_ids', v_room_ids, 'unit_ids', v_unit_ids,
      'listing_status', v_listing_status
    ),
    auth.uid()
  );

  return pg_catalog.jsonb_build_object(
    'listing_id', p_listing_id, 'property_id', v_property_id,
    'room_type_ids', v_room_ids, 'unit_ids', v_unit_ids,
    'status', v_listing_status
  );
end;
$$;

revoke all on function public.admin_upsert_stay_inventory(text, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.admin_upsert_stay_inventory(text, uuid, jsonb, jsonb, jsonb) to authenticated;

-- Keep the paginated admin inventory query efficient without changing data.
create index if not exists stay_properties_admin_updated_at_idx
  on public.stay_properties (updated_at desc);

commit;

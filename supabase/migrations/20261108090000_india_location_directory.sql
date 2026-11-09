begin;

create extension if not exists pg_trgm;

alter table public.india_locations add column if not exists mandal text not null default '';
alter table public.india_locations add column if not exists pincode text;
alter table public.india_locations add column if not exists kind text;
alter table public.india_locations add column if not exists source text not null default 'catalog';

update public.india_locations
   set kind = location_type
 where kind is null;

alter table public.india_locations alter column kind set default 'city';
alter table public.india_locations alter column kind set not null;

alter table public.india_locations alter column latitude drop not null;
alter table public.india_locations alter column longitude drop not null;

alter table public.india_locations drop constraint if exists india_locations_location_type_check;
alter table public.india_locations add constraint india_locations_location_type_check
  check (location_type in ('state', 'district', 'mandal', 'city', 'town', 'village', 'pincode'));

alter table public.india_locations drop constraint if exists india_locations_kind_check;
alter table public.india_locations add constraint india_locations_kind_check
  check (kind in ('state', 'district', 'mandal', 'city', 'town', 'village', 'pincode'));

alter table public.india_locations drop constraint if exists india_locations_normalized_name_normalized_district_normalized_state_key;
alter table public.india_locations drop constraint if exists india_locations_normalized_name_normalized_district_normali_key;

create unique index if not exists india_locations_identity_idx
  on public.india_locations (kind, normalized_name, normalized_state, normalized_district, mandal, coalesce(pincode, ''));

create index if not exists india_locations_pincode_idx
  on public.india_locations (pincode)
  where pincode is not null;

create index if not exists india_locations_name_trgm_idx
  on public.india_locations using gin (normalized_name gin_trgm_ops);

create index if not exists idx_india_locations_coordinates_gist
  on public.india_locations using gist (coordinates);

comment on table public.india_locations is
  'India-wide marketplace location directory. Curated cities plus Local Government Directory names (GODL-India). Clients search through search_india_locations.';

create or replace function public.search_india_locations(q text, max_rows integer default 10)
returns table (
  id bigint,
  kind text,
  name text,
  state text,
  district text,
  mandal text,
  pincode text,
  lat double precision,
  lng double precision,
  aliases text[],
  rank integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  needle text := lower(btrim(coalesce(q, '')));
  pin text := null;
  row_limit integer := 10;
begin
  if needle = '' then
    return;
  end if;
  if max_rows is not null and max_rows > 0 then
    row_limit := least(max_rows, 10);
  end if;
  if needle ~ '^[1-9][0-9]{5}$' then
    pin := needle;
  end if;

  if pin is not null then
    return query
      select l.id, l.kind, l.name, l.state, l.district, l.mandal, l.pincode, l.latitude, l.longitude, l.aliases, 0
        from public.india_locations l
       where l.pincode = pin
       order by case l.kind when 'pincode' then 0 when 'city' then 1 when 'town' then 2 else 3 end, l.name
       limit row_limit;
    if found then
      return;
    end if;
    return query
      select l.id, l.kind, l.name, l.state, l.district, l.mandal, l.pincode, l.latitude, l.longitude, l.aliases, 1
        from public.india_locations l
       where l.pincode = left(pin, 3)
          or l.pincode like left(pin, 3) || '%'
       order by case when l.pincode = left(pin, 3) then 0 else 1 end,
                case l.kind when 'city' then 0 when 'pincode' then 1 else 2 end,
                l.name
       limit row_limit;
    return;
  end if;

  return query
    select l.id, l.kind, l.name, l.state, l.district, l.mandal, l.pincode, l.latitude, l.longitude, l.aliases,
           case
             when l.normalized_name = needle then 0
             when exists (select 1 from unnest(coalesce(l.aliases, '{}'::text[])) a where lower(a) = needle) then 1
             when l.kind in ('city', 'town') then 2
             when l.kind = 'village' then 3
             when l.kind in ('district', 'mandal') then 4
             else 5
           end
      from public.india_locations l
     where l.normalized_name = needle
        or l.normalized_name like needle || '%'
        or exists (select 1 from unnest(coalesce(l.aliases, '{}'::text[])) a where lower(a) = needle)
     order by 11,
              case l.kind when 'city' then 0 when 'town' then 1 when 'district' then 2 when 'pincode' then 3 else 4 end,
              l.name
     limit row_limit;
  if found then
    return;
  end if;

  return query
    select l.id, l.kind, l.name, l.state, l.district, l.mandal, l.pincode, l.latitude, l.longitude, l.aliases, 6
      from public.india_locations l
     where l.normalized_state = needle
        or l.normalized_district = needle
        or lower(l.mandal) = needle
     order by case l.kind when 'state' then 0 when 'district' then 1 when 'city' then 2 when 'town' then 3 else 4 end, l.name
     limit row_limit;
  if found then
    return;
  end if;

  return query
    select l.id, l.kind, l.name, l.state, l.district, l.mandal, l.pincode, l.latitude, l.longitude, l.aliases, 7
      from public.india_locations l
     where l.normalized_name like '%' || needle || '%'
     order by case l.kind when 'city' then 0 when 'town' then 1 else 2 end, l.name
     limit row_limit;
  if found then
    return;
  end if;

  if char_length(needle) >= 3 then
    return query
      select l.id, l.kind, l.name, l.state, l.district, l.mandal, l.pincode, l.latitude, l.longitude, l.aliases, 8
        from public.india_locations l
       where l.normalized_name OPERATOR(public.%) needle
       order by public.similarity(l.normalized_name, needle) desc, l.name
       limit row_limit;
  end if;
end;
$$;

revoke all on function public.search_india_locations(text, integer) from public, anon, authenticated;
grant execute on function public.search_india_locations(text, integer) to service_role;

commit;

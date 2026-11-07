-- Admin-managed venue taxonomy and IANA time zone support.
-- The venue inventory remains in the existing booking tables/RPCs.
alter table public.venue_booking_settings
  drop constraint if exists venue_booking_settings_time_zone_check;
create or replace function public.venue_check_booking_timezone() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from pg_timezone_names where name=new.time_zone) then
    raise exception 'INVALID_VENUE_TIME_ZONE' using errcode='22023';
  end if;
  return new;
end $$;
drop trigger if exists venue_booking_timezone_valid on public.venue_booking_settings;
create trigger venue_booking_timezone_valid before insert or update of time_zone on public.venue_booking_settings
  for each row execute function public.venue_check_booking_timezone();

create table if not exists public.venue_categories (
  category_id text primary key check (category_id ~ '^venue-[a-z0-9-]{2,60}$'),
  label text not null check (length(btrim(label)) between 2 and 100),
  emoji text not null default '🏛️' check (length(emoji) <= 16),
  subcategories text[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.venue_categories enable row level security;
revoke all on public.venue_categories from public, anon, authenticated;
grant select on public.venue_categories to anon, authenticated;
drop policy if exists "Read active venue categories" on public.venue_categories;
create policy "Read active venue categories" on public.venue_categories
  for select to anon, authenticated using (active or (public.is_admin() and public.is_active_user()));

create table if not exists public.venue_category_events (
  id uuid primary key default gen_random_uuid(),
  category_id text not null,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (action in ('created','updated','disabled')),
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.venue_category_events enable row level security;
revoke all on public.venue_category_events from public, anon, authenticated;
grant select on public.venue_category_events to authenticated;
drop policy if exists "Admins read venue category audit" on public.venue_category_events;
create policy "Admins read venue category audit" on public.venue_category_events
  for select to authenticated using (public.is_admin() and public.is_active_user());

insert into public.venue_categories(category_id,label,emoji,subcategories,sort_order)
values
 ('venue-marriage','Marriage & Functions','💍',array['Marriage halls','Wedding venues','Reception halls','Convention halls','Banquet halls','Community halls','Birthday party halls'],10),
 ('venue-govt','Government & Municipal Halls','🏛️',array['Government meeting halls','Municipal halls','Panchayat halls','Public community halls'],20),
 ('venue-political','Political Meetings','📢',array['Political meeting halls','Party conference halls','Election campaign halls','Public gathering grounds'],30),
 ('venue-corporate','Corporate & Business','💼',array['Meeting rooms','Conference halls','Boardrooms','Seminar halls','Training rooms'],40),
 ('venue-education','Education & Training','🎓',array['Auditoriums','Lecture halls','Training rooms'],50),
 ('venue-religious','Religious & Cultural','🛕',array['Religious halls','Cultural halls'],60),
 ('venue-birthday','Birthday & Party Venues','🎉',array['Birthday halls','Party venues','Banquet halls'],70),
 ('venue-sports','Sports & Playgrounds','🏟️',array['Open grounds','Playgrounds','Sports venues'],80),
 ('venue-exhibition','Convention & Exhibition Centers','🎪',array['Convention centers','Exhibition halls','Convention halls'],90),
 ('venue-medical','Community & Welfare Halls','🏥',array['Community halls','Medical camp halls'],100),
 ('venue-community','Community & Farmhouse Venues','🌿',array['Community halls','Farmhouses','Open grounds'],110),
 ('venue-special','Special-Purpose Venues','🎬',array['Auditoriums','Open grounds','Event studios'],120),
 ('venue-function','Function Halls','🎊',array['Function halls','Marriage halls','Banquet halls'],130),
 ('venue-convention','Convention Centers','🏢',array['Convention centers','Conference halls','Exhibition halls'],140),
 ('venue-auditorium','Auditoriums','🎭',array['Auditoriums','Performance halls'],150),
 ('venue-meeting','Meeting Rooms','🪑',array['Meeting rooms','Boardrooms','Interview rooms'],160),
 ('venue-conference','Conference Halls','🗣️',array['Conference halls','Seminar halls','Training halls'],170),
 ('venue-open-ground','Open Grounds','🌳',array['Open grounds','Public gathering grounds'],180),
 ('venue-playground','Playgrounds','⚽',array['Playgrounds','Sports grounds','Cricket grounds'],190),
 ('venue-farmhouse','Farmhouses','🏡',array['Farmhouses','Lawn venues','Poolside venues'],200)
on conflict(category_id) do nothing;

create or replace function public.venue_admin_save_category(
  p_category_id text, p_label text, p_emoji text, p_subcategories text[], p_active boolean, p_sort_order integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_before jsonb; v_after jsonb; v_uid uuid := auth.uid(); v_action text;
begin
  if v_uid is null or not exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin' and p.account_status='active') then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_category_id !~ '^venue-[a-z0-9-]{2,60}$' or length(btrim(p_label)) not between 2 and 100
     or length(coalesce(p_emoji,'')) > 16 or p_sort_order < 0
     or coalesce(cardinality(p_subcategories),0) > 100
     or exists(select 1 from unnest(coalesce(p_subcategories,'{}')) s where length(btrim(s)) not between 2 and 100) then
    raise exception 'INVALID_VENUE_CATEGORY' using errcode='22023';
  end if;
  select to_jsonb(c) into v_before from public.venue_categories c where c.category_id=p_category_id for update;
  insert into public.venue_categories(category_id,label,emoji,subcategories,active,sort_order,updated_at,updated_by)
  values(p_category_id,btrim(p_label),coalesce(nullif(btrim(p_emoji),''),'🏛️'),coalesce(p_subcategories,'{}'),coalesce(p_active,true),p_sort_order,now(),v_uid)
  on conflict(category_id) do update set label=excluded.label,emoji=excluded.emoji,subcategories=excluded.subcategories,
    active=excluded.active,sort_order=excluded.sort_order,updated_at=now(),updated_by=v_uid;
  select to_jsonb(c) into v_after from public.venue_categories c where c.category_id=p_category_id;
  v_action:=case when v_before is null then 'created' when coalesce((v_before->>'active')::boolean,true) and not coalesce(p_active,true) then 'disabled' else 'updated' end;
  insert into public.venue_category_events(category_id,actor_user_id,action,before_state,after_state)
    values(p_category_id,v_uid,v_action,v_before,v_after);
  return v_after;
end $$;
revoke all on function public.venue_admin_save_category(text,text,text,text[],boolean,integer) from public,anon;
grant execute on function public.venue_admin_save_category(text,text,text,text[],boolean,integer) to authenticated;

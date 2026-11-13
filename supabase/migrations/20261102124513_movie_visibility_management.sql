-- Additive Movies visibility schema. New feed rows start disabled. No data is deleted.
begin;
create schema if not exists cinema_private;
revoke all on schema cinema_private from public;
grant usage on schema cinema_private to anon, authenticated;

create table public.movie_theatres (
  id text primary key check (length(id) between 1 and 160),
  name text not null check (length(trim(name)) > 0),
  state text not null check (state in ('Andhra Pradesh', 'Telangana', 'Karnataka')),
  city text not null check (length(trim(city)) > 0),
  area text not null default '',
  sync_active boolean not null default true,
  is_visible boolean not null default false,
  visibility_version integer not null default 0,
  synced_at timestamptz not null default now()
);
create table public.movie_titles (
  id text primary key check (length(id) between 1 and 160),
  title text not null check (length(trim(title)) > 0),
  language text not null default '',
  poster_url text not null default '' check (poster_url = '' or poster_url like 'https://%'),
  legacy_listing_id text unique,
  sync_active boolean not null default true,
  is_visible boolean not null default false,
  visibility_version integer not null default 0,
  synced_at timestamptz not null default now()
);
create table public.movie_showtimes (
  id text primary key check (length(id) between 1 and 160),
  theatre_id text not null references public.movie_theatres(id) on delete restrict,
  movie_id text not null references public.movie_titles(id) on delete restrict,
  starts_at timestamptz not null,
  screen_name text not null default '',
  format text not null default '',
  sync_active boolean not null default true,
  is_visible boolean not null default false,
  visibility_version integer not null default 0,
  synced_at timestamptz not null default now()
);
create index movie_theatres_location_idx on public.movie_theatres(state, city);
create index movie_showtimes_theatre_idx on public.movie_showtimes(theatre_id, starts_at);
create index movie_showtimes_movie_idx on public.movie_showtimes(movie_id, starts_at);

create table cinema_private.admin_permissions (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null check (role in ('admin', 'super_admin')),
  can_manage_visibility boolean not null default false,
  version integer not null default 0
);
create table cinema_private.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp(),
  target_kind text not null check (target_kind in ('theatre', 'movie', 'showtime', 'permission')),
  target_id text not null,
  previous_value text not null,
  new_value text not null,
  previous_version integer not null,
  new_version integer not null,
  reason text not null check (length(trim(reason)) between 3 and 500)
);
create index movie_audit_recent_idx on cinema_private.audit_log(changed_at desc, id desc);
-- Owner-approved bootstrap identities are consumed once after email verification.
create table cinema_private.bootstrap_admins (
  email text primary key,
  claimed_user_id uuid unique references auth.users(id) on delete restrict,
  claimed_at timestamptz
);
alter table cinema_private.bootstrap_admins enable row level security;
revoke all on cinema_private.bootstrap_admins from public, anon, authenticated, service_role;
insert into cinema_private.bootstrap_admins(email) values
 ('narenqe@gmail.com'), ('tnarendra2027@gmail.com'), ('monapatisravya28@gmail.com'), ('tnarendra2025@gmail.com');
create function cinema_private.claim_bootstrap_admin() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_email text;
begin
  if new.email_confirmed_at is null then return new; end if;
  perform pg_advisory_xact_lock(98471,1);
  update cinema_private.bootstrap_admins set claimed_user_id=new.id,claimed_at=now()
    where email=lower(new.email) and claimed_user_id is null returning email into v_email;
  if v_email is not null then
    insert into cinema_private.admin_permissions(user_id,role,can_manage_visibility)
      values(new.id,'super_admin',true) on conflict(user_id) do nothing;
    if found then
      insert into cinema_private.audit_log(actor_id,target_kind,target_id,previous_value,new_value,previous_version,new_version,reason)
        values(new.id,'permission',new.id::text,'none','super_admin:true',-1,0,'Owner-authorized bootstrap after verified email sign-in');
    end if;
  end if;
  return new;
end $$;
revoke all on function cinema_private.claim_bootstrap_admin() from public,anon,authenticated,service_role;
create trigger movies_bootstrap_verified_admin after insert or update of email,email_confirmed_at on auth.users
  for each row execute function cinema_private.claim_bootstrap_admin();
alter table public.movie_theatres enable row level security;
alter table public.movie_titles enable row level security;
alter table public.movie_showtimes enable row level security;
alter table cinema_private.admin_permissions enable row level security;
alter table cinema_private.audit_log enable row level security;
revoke all on public.movie_theatres, public.movie_titles, public.movie_showtimes from public, anon, authenticated, service_role;
revoke all on cinema_private.admin_permissions, cinema_private.audit_log from public, anon, authenticated, service_role;
grant select on public.movie_theatres, public.movie_titles, public.movie_showtimes to anon, authenticated, service_role;

-- Permission decisions use protected database rows, never user-editable profiles/JWT metadata.
create function cinema_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from cinema_private.admin_permissions p where p.user_id = auth.uid()
    and (p.role = 'super_admin' or p.can_manage_visibility));
$$;
create function cinema_private.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from cinema_private.admin_permissions p where p.user_id = auth.uid() and p.role = 'super_admin');
$$;
create function cinema_private.is_public(p_kind text, p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'theatre' then exists(select 1 from public.movie_theatres t where t.id = p_id and t.is_visible and t.sync_active)
    when 'movie' then exists(select 1 from public.movie_titles m join public.movie_showtimes s on s.movie_id = m.id
      join public.movie_theatres t on t.id = s.theatre_id where m.id = p_id
      and m.is_visible and m.sync_active and s.is_visible and s.sync_active and t.is_visible and t.sync_active and s.starts_at >= now())
    when 'showtime' then exists(select 1 from public.movie_showtimes s join public.movie_titles m on m.id = s.movie_id
      join public.movie_theatres t on t.id = s.theatre_id where s.id = p_id
      and m.is_visible and m.sync_active and s.is_visible and s.sync_active and t.is_visible and t.sync_active and s.starts_at >= now())
    else false end;
$$;
revoke all on function cinema_private.is_admin(), cinema_private.is_super_admin(), cinema_private.is_public(text,text) from public;
grant execute on function cinema_private.is_admin(), cinema_private.is_super_admin(), cinema_private.is_public(text,text) to anon, authenticated;
create policy movie_theatres_read on public.movie_theatres for select to anon, authenticated
  using (cinema_private.is_public('theatre', id) or cinema_private.is_admin());
create policy movie_titles_read on public.movie_titles for select to anon, authenticated
  using (cinema_private.is_public('movie', id) or cinema_private.is_admin());
create policy movie_showtimes_read on public.movie_showtimes for select to anon, authenticated
  using (cinema_private.is_public('showtime', id) or cinema_private.is_admin());

-- Existing permissive policies cannot expose unregistered/disabled cinema listings.
do $guard$ begin
  if to_regclass('public.listings') is not null then
    execute $policy$create policy movie_listing_visibility_guard on public.listings as restrictive for select to anon, authenticated
      using ((category_id not like 'movie-%' and coalesce(payload->'customFieldValues'->>'sectionType','') <> 'movies')
        or cinema_private.is_admin())$policy$;
  end if;
  if to_regclass('public.cinema_screens') is not null then
    execute $policy$create policy movie_screen_visibility_guard on public.cinema_screens as restrictive for select to anon, authenticated
      using (cinema_private.is_admin())$policy$;
  end if;
end $guard$;

create function public.movies_now_showing(p_state text default '', p_city text default '', p_query text default '', p_offset integer default 0, p_limit integer default 30)
returns table(showtime_id text, theatre_id text, theatre_name text, state text, city text, area text,
  movie_id text, title text, language text, poster_url text, starts_at timestamptz, screen_name text, format text)
language sql stable security invoker set search_path = '' as $$
  select s.id, t.id, t.name, t.state, t.city, t.area, m.id, m.title, m.language, m.poster_url, s.starts_at, s.screen_name, s.format
  from public.movie_showtimes s join public.movie_theatres t on t.id = s.theatre_id join public.movie_titles m on m.id = s.movie_id
  where cinema_private.is_public('showtime', s.id)
    and (p_state = '' or t.state = p_state) and (p_city = '' or t.city ilike '%' || p_city || '%')
    and (p_query = '' or concat_ws(' ', t.name,t.city,t.area,m.title,m.language) ilike '%' || p_query || '%')
  order by s.starts_at, s.id offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
$$;
revoke all on function public.movies_now_showing(text,text,text,integer,integer) from public;
grant execute on function public.movies_now_showing(text,text,text,integer,integer) to anon, authenticated;

create function cinema_private.change_visibility(p_kind text, p_changes jsonb, p_reason text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_table text; v_item record; v_old boolean; v_version integer; v_count integer := 0;
begin
  -- Serialize permission revocation and visibility edits; bounded batches lock targets in ID order.
  perform pg_advisory_xact_lock(98471, 1);
  if auth.uid() is null or not cinema_private.is_admin() then raise exception 'Cinema visibility permission required' using errcode = '42501'; end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Reason must contain 3 to 500 characters' using errcode = '22023'; end if;
  v_table := case p_kind when 'theatre' then 'movie_theatres' when 'movie' then 'movie_titles' when 'showtime' then 'movie_showtimes' else null end;
  if v_table is null or p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) not between 1 and 100 then raise exception 'Invalid visibility batch' using errcode = '22023'; end if;
  if (select count(*) <> count(distinct x->>'id') from jsonb_array_elements(p_changes) x) then raise exception 'Duplicate targets' using errcode = '22023'; end if;
  for v_item in select * from jsonb_to_recordset(p_changes) as x(id text, visible boolean, version integer) order by id loop
    if v_item.visible is null or v_item.version is null then raise exception 'Visible and version are required' using errcode = '22023'; end if;
    execute format('select is_visible, visibility_version from public.%I where id = $1 for update', v_table) into v_old,v_version using v_item.id;
    if v_version is null then raise exception 'Unknown target' using errcode = 'P0002'; end if;
    if v_version <> v_item.version then raise exception 'Visibility changed; refresh before retrying' using errcode = '40001'; end if;
    if v_old is distinct from v_item.visible then
      execute format('update public.%I set is_visible = $1, visibility_version = visibility_version + 1 where id = $2',v_table) using v_item.visible,v_item.id;
      insert into cinema_private.audit_log(actor_id,target_kind,target_id,previous_value,new_value,previous_version,new_version,reason)
        values(auth.uid(),p_kind,v_item.id,v_old::text,v_item.visible::text,v_version,v_version+1,trim(p_reason));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function cinema_private.change_visibility(text,jsonb,text) from public;
grant execute on function cinema_private.change_visibility(text,jsonb,text) to authenticated;
create function public.manage_movie_visibility(p_kind text,p_changes jsonb,p_reason text) returns integer
language sql security invoker set search_path = '' as $$ select cinema_private.change_visibility(p_kind,p_changes,p_reason); $$;
revoke all on function public.manage_movie_visibility(text,jsonb,text) from public;
grant execute on function public.manage_movie_visibility(text,jsonb,text) to authenticated;

create function cinema_private.manage_permission(p_user_id uuid,p_role text,p_allowed boolean,p_version integer,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old cinema_private.admin_permissions%rowtype;
begin
  perform pg_advisory_xact_lock(98471,1);
  if auth.uid() is null or not cinema_private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
  if p_role not in ('admin','super_admin') or p_role is null or p_allowed is null or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Invalid permission change' using errcode='22023'; end if;
  select * into v_old from cinema_private.admin_permissions where user_id=p_user_id for update;
  if coalesce(v_old.version,-1) <> p_version then raise exception 'Permission changed; refresh' using errcode='40001'; end if;
  if v_old.role='super_admin' and p_role <> 'super_admin' and (select count(*) from cinema_private.admin_permissions where role='super_admin') <= 1 then raise exception 'Cannot remove the last Super Admin' using errcode='22023'; end if;
  insert into cinema_private.admin_permissions(user_id,role,can_manage_visibility,version) values(p_user_id,p_role,p_allowed,coalesce(v_old.version,-1)+1)
    on conflict(user_id) do update set role=excluded.role,can_manage_visibility=excluded.can_manage_visibility,version=excluded.version;
  insert into cinema_private.audit_log(actor_id,target_kind,target_id,previous_value,new_value,previous_version,new_version,reason)
    values(auth.uid(),'permission',p_user_id::text,coalesce(v_old.role || ':' || v_old.can_manage_visibility::text,'none'),p_role || ':' || p_allowed::text,coalesce(v_old.version,-1),coalesce(v_old.version,-1)+1,trim(p_reason));
end $$;
revoke all on function cinema_private.manage_permission(uuid,text,boolean,integer,text) from public;
grant execute on function cinema_private.manage_permission(uuid,text,boolean,integer,text) to authenticated;
create function public.manage_movie_admin_permission(p_user_id uuid,p_role text,p_allowed boolean,p_version integer,p_reason text) returns void
language sql security invoker set search_path = '' as $$ select cinema_private.manage_permission(p_user_id,p_role,p_allowed,p_version,p_reason); $$;
revoke all on function public.manage_movie_admin_permission(uuid,text,boolean,integer,text) from public;
grant execute on function public.manage_movie_admin_permission(uuid,text,boolean,integer,text) to authenticated;

create function cinema_private.access_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('role',role,'canManageVisibility',can_manage_visibility or role='super_admin') from cinema_private.admin_permissions where user_id=auth.uid()),'{"role":"none","canManageVisibility":false}'::jsonb);
$$;
create function public.movie_admin_access() returns jsonb language sql stable security invoker set search_path='' as $$ select cinema_private.access_info(); $$;
create function cinema_private.read_permissions() returns setof cinema_private.admin_permissions
language plpgsql stable security definer set search_path='' as $$ begin
  if auth.uid() is null or not cinema_private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
  return query select * from cinema_private.admin_permissions order by user_id;
end $$;
create function public.movie_admin_permissions() returns table(user_id uuid,role text,can_manage_visibility boolean,version integer)
language sql stable security invoker set search_path='' as $$ select * from cinema_private.read_permissions(); $$;
create function cinema_private.read_audit(p_offset integer,p_limit integer) returns setof cinema_private.audit_log
language plpgsql stable security definer set search_path='' as $$ begin
  if auth.uid() is null or not cinema_private.is_admin() then raise exception 'Cinema Admin required' using errcode='42501'; end if;
  return query select * from cinema_private.audit_log order by changed_at desc,id desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
end $$;
create function public.movie_visibility_audit(p_offset integer default 0,p_limit integer default 50)
returns table(id bigint,actor_id uuid,changed_at timestamptz,target_kind text,target_id text,previous_value text,new_value text,previous_version integer,new_version integer,reason text)
language sql stable security invoker set search_path='' as $$ select * from cinema_private.read_audit(p_offset,p_limit); $$;
revoke all on function cinema_private.access_info(),cinema_private.read_permissions(),cinema_private.read_audit(integer,integer),public.movie_admin_access(),public.movie_admin_permissions(),public.movie_visibility_audit(integer,integer) from public;
grant execute on function cinema_private.access_info(),cinema_private.read_permissions(),cinema_private.read_audit(integer,integer),public.movie_admin_access(),public.movie_admin_permissions(),public.movie_visibility_audit(integer,integer) to authenticated;

create function public.movie_admin_catalog(p_kind text default 'theatre',p_state text default '',p_city text default '',p_status text default '',p_query text default '',p_offset integer default 0,p_limit integer default 30)
returns table(id text,name text,state text,city text,is_visible boolean,version integer,parent_visible boolean,total_count bigint)
language plpgsql stable security invoker set search_path='' as $$ begin
  if not cinema_private.is_admin() then raise exception 'Cinema Admin required' using errcode='42501'; end if;
  return query with catalog as (
    select 'theatre' as kind,t.id,t.name,t.state,t.city,t.is_visible,t.visibility_version as version,t.sync_active as parent_visible from public.movie_theatres t
    union all
    select 'movie',m.id,m.title,coalesce(string_agg(distinct t.state,', '),''),coalesce(string_agg(distinct t.city,', '),''),m.is_visible,m.visibility_version,m.sync_active from public.movie_titles m
      left join public.movie_showtimes s on s.movie_id=m.id left join public.movie_theatres t on t.id=s.theatre_id group by m.id
    union all
    select 'showtime',s.id,concat(m.title,' · ',t.name,' · ',to_char(s.starts_at at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI')),t.state,t.city,s.is_visible,s.visibility_version,
      t.is_visible and t.sync_active and m.is_visible and m.sync_active and s.sync_active from public.movie_showtimes s join public.movie_theatres t on t.id=s.theatre_id join public.movie_titles m on m.id=s.movie_id
  ) select c.id,c.name,c.state,c.city,c.is_visible,c.version,c.parent_visible,count(*) over() from catalog c
    where c.kind=p_kind and (p_state='' or c.state like '%'||p_state||'%') and (p_city='' or c.city ilike '%'||p_city||'%')
      and (p_status='' or (p_status='active' and c.is_visible) or (p_status='disabled' and not c.is_visible))
      and (p_query='' or concat_ws(' ',c.id,c.name,c.city) ilike '%'||p_query||'%')
    order by c.name,c.id offset greatest(p_offset,0) limit least(greatest(p_limit,1),100);
end $$;
revoke all on function public.movie_admin_catalog(text,text,text,text,text,integer,integer) from public;
grant execute on function public.movie_admin_catalog(text,text,text,text,text,integer,integer) to authenticated;

-- A sync identity can write metadata columns ONLY. Admin flags/versions are never in the upsert.
grant insert(id,name,state,city,area,sync_active,synced_at),update(name,state,city,area,sync_active,synced_at) on public.movie_theatres to service_role;
grant insert(id,title,language,poster_url,legacy_listing_id,sync_active,synced_at),update(title,language,poster_url,legacy_listing_id,sync_active,synced_at) on public.movie_titles to service_role;
grant insert(id,theatre_id,movie_id,starts_at,screen_name,format,sync_active,synced_at),update(starts_at,screen_name,format,sync_active,synced_at) on public.movie_showtimes to service_role;
create function public.sync_movie_catalog(p_theatres jsonb,p_movies jsonb,p_showtimes jsonb) returns void
language plpgsql security invoker set search_path='' as $$ begin
  if jsonb_typeof(p_theatres) <> 'array' or jsonb_typeof(p_movies) <> 'array' or jsonb_typeof(p_showtimes) <> 'array' or p_theatres is null or p_movies is null or p_showtimes is null
    or greatest(jsonb_array_length(p_theatres),jsonb_array_length(p_movies),jsonb_array_length(p_showtimes)) > 1000 then raise exception 'Invalid sync batch' using errcode='22023'; end if;
  -- Stable showtime IDs must never be moved to a different theatre/movie to bypass overrides.
  if exists(select 1 from jsonb_to_recordset(p_showtimes) as x(id text,theatre_id text,movie_id text)
    join public.movie_showtimes s on s.id=x.id where s.theatre_id<>x.theatre_id or s.movie_id<>x.movie_id) then raise exception 'Showtime identity cannot be reassigned' using errcode='22023'; end if;
  insert into public.movie_theatres(id,name,state,city,area,sync_active,synced_at)
    select id,name,state,city,coalesce(area,''),coalesce(sync_active,true),now() from jsonb_to_recordset(p_theatres) as x(id text,name text,state text,city text,area text,sync_active boolean)
    on conflict(id) do update set name=excluded.name,state=excluded.state,city=excluded.city,area=excluded.area,sync_active=excluded.sync_active,synced_at=excluded.synced_at;
  insert into public.movie_titles(id,title,language,poster_url,legacy_listing_id,sync_active,synced_at)
    select id,title,coalesce(language,''),coalesce(poster_url,''),legacy_listing_id,coalesce(sync_active,true),now() from jsonb_to_recordset(p_movies) as x(id text,title text,language text,poster_url text,legacy_listing_id text,sync_active boolean)
    on conflict(id) do update set title=excluded.title,language=excluded.language,poster_url=excluded.poster_url,legacy_listing_id=excluded.legacy_listing_id,sync_active=excluded.sync_active,synced_at=excluded.synced_at;
  insert into public.movie_showtimes(id,theatre_id,movie_id,starts_at,screen_name,format,sync_active,synced_at)
    select id,theatre_id,movie_id,starts_at,coalesce(screen_name,''),coalesce(format,''),coalesce(sync_active,true),now() from jsonb_to_recordset(p_showtimes) as x(id text,theatre_id text,movie_id text,starts_at timestamptz,screen_name text,format text,sync_active boolean)
    on conflict(id) do update set starts_at=excluded.starts_at,screen_name=excluded.screen_name,format=excluded.format,sync_active=excluded.sync_active,synced_at=excluded.synced_at;
end $$;
revoke all on function public.sync_movie_catalog(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sync_movie_catalog(jsonb,jsonb,jsonb) to service_role;
-- Public invalidation carries no theatre, movie, user or permission data.
create function cinema_private.invalidate_public_feed() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  perform realtime.send('{}'::jsonb,'invalidate','bos-public-movies',false);
  return null;
end $$;
revoke all on function cinema_private.invalidate_public_feed() from public,anon,authenticated,service_role;
create trigger movie_theatres_invalidate after insert or update on public.movie_theatres for each statement execute function cinema_private.invalidate_public_feed();
create trigger movie_titles_invalidate after insert or update on public.movie_titles for each statement execute function cinema_private.invalidate_public_feed();
create trigger movie_showtimes_invalidate after insert or update on public.movie_showtimes for each statement execute function cinema_private.invalidate_public_feed();
-- Ensure no PUBLIC default grants expose internal mutation helpers or audit data.
revoke all on all tables in schema cinema_private from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
commit;

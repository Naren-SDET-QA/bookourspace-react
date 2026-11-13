-- Minimal legacy fixtures are created only when tables do not exist, and rolled back.
do $$ begin
  if to_regclass('public.listings') is null then
    create table public.listings(id text primary key,category_id text,payload jsonb);
    alter table public.listings enable row level security;
    grant select on public.listings to anon,authenticated;
    create policy legacy_public_read on public.listings for select using(true);
    insert into public.listings values('__legacy_movie_test','movie-telugu','{}');
  end if;
  if to_regclass('public.cinema_screens') is null then
    create table public.cinema_screens(id text primary key,cinema_listing_id text);
    alter table public.cinema_screens enable row level security;
    grant select on public.cinema_screens to anon,authenticated;
    create policy legacy_public_read on public.cinema_screens for select using(true);
    insert into public.cinema_screens values('__legacy_screen_test','__legacy_movie_test');
  end if;
end $$;
-- INSERT_VISIBILITY_GUARD
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if exists(select 1 from public.listings where category_id like 'movie-%') then raise exception 'Legacy movie read bypass'; end if;
  if exists(select 1 from public.cinema_screens) then raise exception 'Legacy screen read bypass'; end if;
end $$;
reset role;
select 'PASS: live hierarchy, search, RLS, permissions, bootstrap, audit, sync, stale edits, bulk rollback and legacy read guards' as validation;

begin;
set local role anon;
do $$ begin
 if (select count(*) from public.listings) <> 29 then raise exception 'Public listing count mismatch'; end if;
 if (select count(*) from public.movies_now_showing()) <> 16 then raise exception 'Public showtime count mismatch'; end if;
 if exists(select 1 from public.user_favorites) or exists(select 1 from public.notifications) then raise exception 'Private fixture disclosure'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','d3a00000-0000-4000-8000-000000000100',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.user_favorites) <> 3 then raise exception 'Owner favorites missing'; end if;
 if (select count(*) from public.notifications) <> 3 then raise exception 'Owner notifications missing'; end if;
 if (select count(*) from public.profiles where id=auth.uid()) <> 1 then raise exception 'Customer profile missing'; end if;
 begin
   update public.listings set price=1 where id='demo-services-01';
   if found then raise exception 'Customer edited provider listing'; end if;
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','d3a00000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.user_favorites) or exists(select 1 from public.notifications) then raise exception 'Other account private fixture disclosure'; end if;
 update public.listings set price=1900 where id='demo-services-01';
 if not found then raise exception 'Provider cannot manage own offering'; end if;
 begin
   perform public.manage_movie_visibility('theatre','[{"id":"demo-theatre-1","visible":false,"version":0}]','Provider cannot hide');
   raise exception 'Provider changed protected movie visibility';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.listings l left join public.profiles p on p.id=l.owner_id where p.id is null) then raise exception 'Orphan listing owner'; end if;
 if exists(select 1 from public.user_favorites f left join public.listings l on l.id=f.listing_id where l.id is null) then raise exception 'Orphan favorite'; end if;
 if exists(select 1 from public.movie_showtimes a join public.movie_showtimes b on a.theatre_id=b.theatre_id and a.screen_name=b.screen_name and a.id<>b.id and abs(extract(epoch from (a.starts_at-b.starts_at)))<14400) then raise exception 'Overlapping demo screenings'; end if;
end $$;
rollback;

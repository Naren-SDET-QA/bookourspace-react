-- Read-only inspection of the linked project. No fixtures, role grants or changes.
begin read only;
select json_build_object(
  'database_bytes', pg_database_size(current_database()),
  'tables', (select json_agg(t) from (
    select schemaname,tablename,rowsecurity from pg_tables
    where schemaname in ('public','cinema_private') order by schemaname,tablename
  ) t),
  'movie_theatres', (select count(*) from public.movie_theatres),
  'movie_titles', (select count(*) from public.movie_titles),
  'movie_showtimes', (select count(*) from public.movie_showtimes),
  'auth_users', (select count(*) from auth.users),
  'movies_admin_permissions', (select count(*) from cinema_private.admin_permissions),
  'marketplace_profiles', to_regclass('public.profiles') is not null,
  'marketplace_listings', to_regclass('public.listings') is not null,
  'marketplace_bookings', to_regclass('public.bookings') is not null,
  'policies', (select json_agg(p) from (
    select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
    where schemaname in ('public','cinema_private') order by schemaname,tablename,policyname
  ) p),
  'movie_constraints', (select json_agg(c) from (
    select conrelid::regclass::text as table_name,conname,pg_get_constraintdef(oid) as definition
    from pg_constraint where conrelid in ('public.movie_theatres'::regclass,'public.movie_titles'::regclass,'public.movie_showtimes'::regclass)
  ) c)
) as audit;
commit;

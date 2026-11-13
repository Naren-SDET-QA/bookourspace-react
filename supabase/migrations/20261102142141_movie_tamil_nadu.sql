-- Forward-only: Chennai can participate in the same protected movie catalog.
-- No existing rows or visibility/permission settings are changed.
begin;
alter table public.movie_theatres drop constraint movie_theatres_state_check;
alter table public.movie_theatres add constraint movie_theatres_state_check
  check (state in ('Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu'));
commit;

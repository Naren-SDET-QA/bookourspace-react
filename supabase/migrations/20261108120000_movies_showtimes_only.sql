-- Movies become a showtimes-only directory: movies -> theatres -> real
-- showtimes by city/area/PIN. Booking, seats and payments remain implemented
-- in the application but are no longer exposed for the Movies module.
begin;

alter table public.cinema_screens
  add column if not exists movie_title text,
  add column if not exists movie_id text,
  add column if not exists city text,
  add column if not exists pincode text,
  add column if not exists is_visible boolean not null default true,
  add column if not exists showtime_source text,
  add column if not exists showtimes_synced_at timestamptz;

create index if not exists cinema_screens_public_lookup
  on public.cinema_screens (is_visible, city, area, pincode);

commit;

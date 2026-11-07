-- Public showtimes must be complete and current: real movie title, theatre,
-- show date and at least one timing. Incomplete or expired rows stay in the
-- table for admin repair but are excluded from public discovery.
begin;

alter table public.cinema_screens
  add column if not exists show_date date;

create index if not exists cinema_screens_public_show_date
  on public.cinema_screens (show_date, city, area, pincode)
  where is_visible;

commit;

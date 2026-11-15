-- Movies are a showtimes-only directory. State is limited to the launch
-- service area; existing rows are unverified fixtures and must be approved by
-- a Super Admin before they can appear publicly.
alter table public.cinema_screens add column if not exists state text;
alter table public.cinema_screens drop constraint if exists cinema_screens_state_check;
alter table public.cinema_screens add constraint cinema_screens_state_check
  check (state is null or state in ('Andhra Pradesh','Telangana','Karnataka'));
alter table public.cinema_screens add column if not exists approval_status text not null default 'pending';
alter table public.cinema_screens drop constraint if exists cinema_screens_approval_status_check;
alter table public.cinema_screens add constraint cinema_screens_approval_status_check
  check (approval_status in ('pending','approved','disabled'));
update public.cinema_screens set approval_status='pending', is_visible=false where approval_status='pending';
create index if not exists cinema_screens_public_state on public.cinema_screens(approval_status,state,is_visible,show_date);

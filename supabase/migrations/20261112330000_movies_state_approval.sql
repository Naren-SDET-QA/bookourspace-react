-- Movies are a showtimes-only directory. State accepts all Indian states and
-- union territories. New rows start pending and need an explicit Super Admin
-- approval, but screens that are already published stay published: the
-- approval workflow must not black out a live directory as a side effect of
-- applying the migration.
alter table public.cinema_screens add column if not exists state text;
alter table public.cinema_screens drop constraint if exists cinema_screens_state_check;
alter table public.cinema_screens add constraint cinema_screens_state_check
  check (state is null or state in (
    'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
    'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
    'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
    'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
    'Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands',
    'Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi',
    'Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'
  ));
alter table public.cinema_screens add column if not exists approval_status text not null default 'pending';
alter table public.cinema_screens drop constraint if exists cinema_screens_approval_status_check;
alter table public.cinema_screens add constraint cinema_screens_approval_status_check
  check (approval_status in ('pending','approved','disabled'));
update public.cinema_screens
   set approval_status = case when is_visible then 'approved' else 'pending' end
 where approval_status = 'pending';
create index if not exists cinema_screens_public_state on public.cinema_screens(approval_status,state,is_visible,show_date);

-- Private guest contact snapshot for Stay bookings. Local/prepared only until
-- separately reviewed and approved for a hosted project.

begin;

create table if not exists public.stay_booking_guest_contacts (
  booking_id text primary key references public.bookings(id) on delete cascade,
  guest_user_id uuid not null references auth.users(id) on delete cascade,
  guest_email text not null check (guest_email = lower(btrim(guest_email))),
  guest_count smallint not null check (guest_count between 1 and 20),
  guest_address text check (guest_address is null or length(guest_address) <= 250),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stay_booking_guest_contacts enable row level security;
revoke all on table public.stay_booking_guest_contacts from public, anon, authenticated;
grant select on table public.stay_booking_guest_contacts to authenticated;
grant all on table public.stay_booking_guest_contacts to service_role;

drop policy if exists stay_booking_guest_contacts_owner_read on public.stay_booking_guest_contacts;
create policy stay_booking_guest_contacts_owner_read
  on public.stay_booking_guest_contacts
  for select to authenticated
  using (guest_user_id = auth.uid());

create or replace function public.attach_stay_booking_guest_details(
  p_booking_id text,
  p_guest_email text,
  p_guest_count integer,
  p_guest_address text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_guest_email, '')));
  v_profile_email text;
  v_max_guests integer;
  v_address text := nullif(btrim(coalesce(p_guest_address, '')), '');
  v_rows integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_booking_id is null or p_booking_id !~ '^stay-[a-f0-9]{32}$' then
    raise exception 'INVALID_STAY_BOOKING' using errcode = '22023';
  end if;
  if p_guest_count is null or p_guest_count < 1 or p_guest_count > 20 then
    raise exception 'INVALID_GUEST_COUNT' using errcode = '22023';
  end if;
  if v_address is not null and length(v_address) > 250 then
    raise exception 'INVALID_GUEST_ADDRESS' using errcode = '22023';
  end if;

  select lower(btrim(p.email)) into v_profile_email
    from public.profiles p
   where p.id = v_user_id;
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
     or v_profile_email is null or v_email <> v_profile_email then
    raise exception 'GUEST_EMAIL_MUST_MATCH_GOOGLE_PROFILE' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.bookings b
     where b.id = p_booking_id and b.user_id = v_user_id
       and b.id like 'stay-%'
       and coalesce(b.payload->>'source', '') in ('stay_checkout', 'stay_request')
  ) then
    raise exception 'BOOKING_NOT_OWNED' using errcode = '42501';
  end if;

  select greatest(1, (rt.max_adults + rt.max_children) * b.units)
    into v_max_guests
    from public.bookings b
    join public.stay_room_types rt on rt.id = b.room_type_id
   where b.id = p_booking_id and b.user_id = v_user_id;
  if v_max_guests is null or p_guest_count > v_max_guests then
    raise exception 'GUEST_COUNT_EXCEEDS_ROOM_CAPACITY' using errcode = '22023';
  end if;

  insert into public.stay_booking_guest_contacts (
    booking_id, guest_user_id, guest_email, guest_count, guest_address
  ) values (
    p_booking_id, v_user_id, v_email, p_guest_count, v_address
  )
  on conflict (booking_id) do update
    set guest_email = excluded.guest_email,
        guest_count = excluded.guest_count,
        guest_address = excluded.guest_address,
        updated_at = now()
    where public.stay_booking_guest_contacts.guest_user_id = v_user_id;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'BOOKING_CONTACT_NOT_OWNED' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.attach_stay_booking_guest_details(text, text, integer, text) from public, anon;
grant execute on function public.attach_stay_booking_guest_details(text, text, integer, text) to authenticated;

commit;

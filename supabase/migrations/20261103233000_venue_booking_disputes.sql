-- Disputes for venue reservations.
--
-- A booking party (customer or venue owner) can open one dispute per booking.
-- Only an active administrator can resolve it. Neither table is writable from
-- the browser: mutation goes through the actor-checking functions below and
-- every transition is appended to venue_booking_events.

create table if not exists public.venue_booking_disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.venue_bookings(id) on delete restrict,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  opener_role text not null check (opener_role in ('customer','provider','admin')),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  status text not null default 'open' check (status in ('open','resolved')),
  resolution text,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'open' and resolution is null and resolved_by is null and resolved_at is null)
    or
    (status = 'resolved'
      and length(btrim(coalesce(resolution,''))) between 10 and 2000
      and resolved_by is not null and resolved_at is not null)
  )
);

create unique index if not exists uniq_venue_booking_open_dispute
  on public.venue_booking_disputes(booking_id) where status = 'open';
create index if not exists idx_venue_booking_disputes_booking
  on public.venue_booking_disputes(booking_id, created_at desc);

alter table public.venue_booking_disputes enable row level security;

revoke all on public.venue_booking_disputes from public, anon, authenticated;
grant select on public.venue_booking_disputes to authenticated;

drop policy if exists "Venue booking parties read disputes" on public.venue_booking_disputes;
create policy "Venue booking parties read disputes"
  on public.venue_booking_disputes for select to authenticated
  using (
    exists (
      select 1 from public.venue_bookings b
      where b.id = booking_id
        and (b.customer_user_id = (select auth.uid())
          or b.owner_user_id = (select auth.uid())
          or public.venue_is_active_admin())
    )
  );

create or replace function public.venue_open_dispute(p_booking_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_booking public.venue_bookings;
  v_reason text := btrim(coalesce(p_reason,''));
  v_row public.venue_booking_disputes;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if length(v_reason) < 10 or length(v_reason) > 2000 then
    raise exception 'INVALID_DISPUTE_REASON' using errcode='22023';
  end if;
  select * into v_profile from public.profiles where id=v_uid and account_status='active' for share;
  if v_profile.id is null or v_profile.role not in ('customer','provider','admin') then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode='42501';
  end if;
  select * into v_booking from public.venue_bookings where id=p_booking_id for update;
  if v_booking.id is null then raise exception 'VENUE_BOOKING_NOT_FOUND' using errcode='P0002'; end if;
  if v_profile.role='customer' and v_booking.customer_user_id<>v_uid then
    raise exception 'VENUE_DISPUTE_FORBIDDEN' using errcode='42501';
  end if;
  if v_profile.role='provider' and v_booking.owner_user_id<>v_uid then
    raise exception 'VENUE_DISPUTE_FORBIDDEN' using errcode='42501';
  end if;
  if v_booking.status not in ('confirmed','completed','cancelled') then
    raise exception 'VENUE_BOOKING_NOT_DISPUTABLE' using errcode='22023';
  end if;
  if exists (select 1 from public.venue_booking_disputes d where d.booking_id=p_booking_id and d.status='open') then
    raise exception 'VENUE_DISPUTE_ALREADY_OPEN' using errcode='23505';
  end if;
  insert into public.venue_booking_disputes(booking_id,opened_by,opener_role,reason)
    values(p_booking_id,v_uid,v_profile.role,v_reason)
    returning * into v_row;
  insert into public.venue_booking_events(booking_id,actor_user_id,actor_role,action,reason,details)
    values(p_booking_id,v_uid,v_profile.role,'dispute_opened',v_reason,
      jsonb_build_object('disputeId',v_row.id));
  return to_jsonb(v_row);
end $$;

create or replace function public.venue_resolve_dispute(p_dispute_id uuid, p_resolution text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_dispute public.venue_booking_disputes;
  v_resolution text := btrim(coalesce(p_resolution,''));
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_profile from public.profiles where id=v_uid and account_status='active' for share;
  if v_profile.id is null or v_profile.role<>'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  if length(v_resolution) < 10 or length(v_resolution) > 2000 then
    raise exception 'INVALID_DISPUTE_RESOLUTION' using errcode='22023';
  end if;
  select * into v_dispute from public.venue_booking_disputes where id=p_dispute_id for update;
  if v_dispute.id is null then raise exception 'VENUE_DISPUTE_NOT_FOUND' using errcode='P0002'; end if;
  if v_dispute.status<>'open' then raise exception 'VENUE_DISPUTE_ALREADY_RESOLVED' using errcode='22023'; end if;
  update public.venue_booking_disputes
    set status='resolved',resolution=v_resolution,resolved_by=v_uid,resolved_at=now()
    where id=p_dispute_id returning * into v_dispute;
  insert into public.venue_booking_events(booking_id,actor_user_id,actor_role,action,reason,details)
    values(v_dispute.booking_id,v_uid,'admin','dispute_resolved',v_resolution,
      jsonb_build_object('disputeId',v_dispute.id));
  return to_jsonb(v_dispute);
end $$;

revoke all on function public.venue_open_dispute(uuid,text) from public, anon;
grant execute on function public.venue_open_dispute(uuid,text) to authenticated;
revoke all on function public.venue_resolve_dispute(uuid,text) from public, anon;
grant execute on function public.venue_resolve_dispute(uuid,text) to authenticated;

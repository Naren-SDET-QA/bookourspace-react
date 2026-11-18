-- Booking-scoped public tracking links and WhatsApp delivery log.
-- Local DEV only until hosted apply is approved. Additive. Does not rewrite
-- existing GPS tables or expose coordinates in the token.

begin;

alter table public.service_delivery_profiles
  add column if not exists whatsapp_opt_in boolean not null default false;

alter table public.service_gps_policy
  add column if not exists max_active_sessions integer
    check (max_active_sessions is null or max_active_sessions between 1 and 20000),
  add column if not exists min_update_interval_seconds integer not null default 10
    check (min_update_interval_seconds between 5 and 60);

create table if not exists public.service_tracking_links (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.service_bookings(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  whatsapp_opt_in boolean not null default false,
  confirmation_sent_at timestamptz,
  on_the_way_sent_at timestamptz
);

create index if not exists idx_service_tracking_links_hash
  on public.service_tracking_links (token_hash);

create table if not exists public.service_tracking_notifications (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  event_type text not null check (event_type in ('booking_confirmed', 'provider_on_the_way')),
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  status text not null check (status in ('skipped', 'sent', 'failed')),
  error_code text,
  provider_message_id text,
  tracking_url text,
  created_at timestamptz not null default now(),
  unique (booking_id, event_type, channel)
);

create index if not exists idx_service_tracking_notifications_booking
  on public.service_tracking_notifications (booking_id, created_at desc);

create index if not exists idx_service_tracking_locations_received_at
  on public.service_tracking_locations (received_at desc);

alter table public.service_tracking_links enable row level security;
alter table public.service_tracking_links force row level security;
alter table public.service_tracking_notifications enable row level security;
alter table public.service_tracking_notifications force row level security;

drop policy if exists "Customer or provider read own tracking link metadata" on public.service_tracking_links;
create policy "Customer or provider read own tracking link metadata"
  on public.service_tracking_links for select to authenticated
  using (
    exists (
      select 1 from public.service_bookings b
      where b.id = service_tracking_links.booking_id
        and (
          b.customer_id = (select auth.uid())
          or b.provider_id = (select auth.uid())
          or public.is_admin()
        )
    )
  );

revoke all on table public.service_tracking_links from public, anon, authenticated;
revoke all on table public.service_tracking_notifications from public, anon, authenticated;
grant select on table public.service_tracking_links to authenticated;
grant all on table public.service_tracking_links to service_role;
grant all on table public.service_tracking_notifications to service_role;

create or replace function public.issue_service_tracking_link(
  p_booking_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_whatsapp_opt_in boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.service_bookings%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'TRACKING_TOKEN_INVALID' using errcode = '22023';
  end if;
  select * into v_booking from public.service_bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.customer_id <> v_actor and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_booking.status in ('completed', 'cancelled', 'rejected') then
    raise exception 'TRACKING_LINK_CLOSED' using errcode = 'P0001';
  end if;

  update public.service_delivery_profiles
     set whatsapp_opt_in = coalesce(p_whatsapp_opt_in, whatsapp_opt_in),
         updated_at = now()
   where booking_id = p_booking_id;

  insert into public.service_tracking_links (
    booking_id, token_hash, created_by, expires_at, whatsapp_opt_in, revoked_at
  ) values (
    p_booking_id, p_token_hash, v_actor, p_expires_at, coalesce(p_whatsapp_opt_in, false), null
  )
  on conflict (booking_id) do update
    set token_hash = excluded.token_hash,
        created_by = excluded.created_by,
        created_at = now(),
        expires_at = excluded.expires_at,
        revoked_at = null,
        last_used_at = null,
        whatsapp_opt_in = excluded.whatsapp_opt_in,
        confirmation_sent_at = public.service_tracking_links.confirmation_sent_at,
        on_the_way_sent_at = public.service_tracking_links.on_the_way_sent_at;

  return jsonb_build_object(
    'ok', true,
    'bookingId', p_booking_id,
    'expiresAt', p_expires_at,
    'whatsappOptIn', coalesce(p_whatsapp_opt_in, false)
  );
end;
$$;

create or replace function public.resolve_service_tracking_link(p_token_hash text)
returns table (
  booking_id uuid,
  booking_ref text,
  status text,
  expires_at timestamptz,
  revoked_at timestamptz,
  whatsapp_opt_in boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  return query
    select b.id, b.booking_ref, b.status::text, l.expires_at, l.revoked_at, l.whatsapp_opt_in
      from public.service_tracking_links l
      join public.service_bookings b on b.id = l.booking_id
     where l.token_hash = p_token_hash
     limit 1;
end;
$$;

create or replace function public.mark_tracking_link_used(p_token_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.service_tracking_links
     set last_used_at = now()
   where token_hash = p_token_hash
     and revoked_at is null
     and expires_at > now();
end;
$$;

create or replace function public.mark_tracking_whatsapp_sent(
  p_booking_id uuid,
  p_event text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if p_event = 'booking_confirmed' then
    update public.service_tracking_links
       set confirmation_sent_at = coalesce(confirmation_sent_at, now())
     where booking_id = p_booking_id
       and confirmation_sent_at is null;
    get diagnostics v_updated = row_count;
  elsif p_event = 'provider_on_the_way' then
    update public.service_tracking_links
       set on_the_way_sent_at = coalesce(on_the_way_sent_at, now())
     where booking_id = p_booking_id
       and on_the_way_sent_at is null;
    get diagnostics v_updated = row_count;
  else
    return false;
  end if;
  return v_updated > 0;
end;
$$;

create or replace function public.gps_active_session_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.service_bookings b
   where b.status in ('accepted', 'assigned', 'travelling', 'arrived', 'started', 'in_progress')
     and b.tracking_started_at is not null
     and (b.tracking_stopped_at is null or b.tracking_started_at > b.tracking_stopped_at);
$$;

create or replace function public.purge_old_service_tracking_locations(p_retain interval default interval '24 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.service_tracking_locations
   where received_at < now() - p_retain
     and id not in (
       select distinct on (booking_id) id
         from public.service_tracking_locations
        order by booking_id, captured_at desc
     );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.issue_service_tracking_link(uuid, text, timestamptz, boolean) from public, anon;
grant execute on function public.issue_service_tracking_link(uuid, text, timestamptz, boolean) to authenticated, service_role;
revoke all on function public.resolve_service_tracking_link(text) from public, anon, authenticated;
grant execute on function public.resolve_service_tracking_link(text) to service_role;
revoke all on function public.mark_tracking_link_used(text) from public, anon, authenticated;
grant execute on function public.mark_tracking_link_used(text) to service_role;
revoke all on function public.mark_tracking_whatsapp_sent(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_tracking_whatsapp_sent(uuid, text) to service_role;
revoke all on function public.gps_active_session_count() from public, anon;
grant execute on function public.gps_active_session_count() to authenticated, service_role;
revoke all on function public.purge_old_service_tracking_locations(interval) from public, anon, authenticated;
grant execute on function public.purge_old_service_tracking_locations(interval) to service_role;

commit;

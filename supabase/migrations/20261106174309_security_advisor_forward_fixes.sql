-- Forward-only security corrections based on the 2026-11-06 Mumbai advisor
-- review. This file is intentionally after the current 10 local candidates so
-- the stay approval helper and guest-contact schema exist before this layer.
-- Never apply it to a hosted project without separate approval.

begin;

-- These RPCs intentionally provide narrowly-scoped public discovery data.
-- Keep SECURITY DEFINER only where RLS-hidden inventory must be read, but use
-- an empty search_path and schema-qualified objects to prevent name shadowing.
alter function public.provider_contact_details(text) set search_path = '';
alter function public.service_listing_slots(text, date, date) set search_path = '';
alter function public.venue_public_calendar(text, timestamptz, timestamptz) set search_path = '';
alter function public.venue_quote(text, timestamptz, timestamptz, text, integer, text[]) set search_path = '';

-- Seat counts are public only for an active batch on an active course. Owners
-- and active admins may still inspect their own/private batches. The query is
-- scoped to one batch instead of aggregating every student's enrollment rows.
create or replace function public.class_batch_availability(p_batch_id uuid)
returns table (
  capacity integer,
  confirmed_count integer,
  waitlist_count integer,
  seats_left integer,
  waitlist_left integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.capacity,
         coalesce(confirmed.confirmed_count, 0)::integer,
         coalesce(waitlisted.waitlist_count, 0)::integer,
         greatest(b.capacity - coalesce(confirmed.confirmed_count, 0), 0)::integer,
         greatest(b.waitlist_capacity - coalesce(waitlisted.waitlist_count, 0), 0)::integer
    from public.class_batches b
    join public.listings l on l.id = b.listing_id
    left join lateral (
      select count(*)::integer as confirmed_count
        from public.class_enrollments e
       where e.batch_id = b.id and e.status = 'confirmed'
    ) confirmed on true
    left join lateral (
      select count(*)::integer as waitlist_count
        from public.class_enrollments e
       where e.batch_id = b.id and e.status = 'waitlisted'
    ) waitlisted on true
   where b.id = p_batch_id
     and (
       (b.status = 'active' and l.status = 'active' and lower(l.entity_type) = 'course')
       or exists (
         select 1
           from public.profiles actor
          where actor.id = auth.uid()
            and actor.account_status = 'active'
            and (actor.id = l.owner_id or actor.role = 'admin')
       )
     );
$$;

-- CREATE OR REPLACE resets function configuration, so pin the class RPC after
-- its replacement body has been installed.
alter function public.class_batch_availability(uuid) set search_path = '';

-- Keep the public service profile projection on the explicitly approved view.
-- Reading public_provider_profiles avoids exposing the full profile table via
-- SECURITY DEFINER while preserving the provider name already approved for
-- customer discovery.
create or replace function public.service_listing_profile(p_listing_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'listingId', l.id,
    'title', l.title,
    'providerName', coalesce(p.full_name, ''),
    'categoryId', l.category_id,
    'subcategory', l.subcategory,
    'price', l.price,
    'priceUnit', l.price_unit,
    'serviceAreas', coalesce(s.service_areas, '{}'::text[]),
    'travelRadiusKm', s.travel_radius_km,
    'workingDays', coalesce(s.working_days, '{0,1,2,3,4,5,6}'::smallint[]),
    'dayStart', coalesce(pg_catalog.to_char(s.day_start, 'HH24:MI'), '06:00'),
    'dayEnd', coalesce(pg_catalog.to_char(s.day_end, 'HH24:MI'), '23:00'),
    'slotMinutes', coalesce(s.slot_minutes, 60),
    'scheduleConfigured', s.provider_id is not null
  )
    from public.listings l
    left join public.public_provider_profiles p on p.id = l.owner_id
    left join public.service_provider_schedules s on s.provider_id = l.owner_id
   where l.id = p_listing_id
     and l.status = 'active'
     and lower(l.entity_type) = 'service';
$$;

-- A provider's public contact is only disclosed for that provider's active
-- listing, and only when the existing owner consent, module switch, per-channel
-- publication and channel verification gates all pass.
create or replace function public.provider_contact_details(p_listing_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.provider_contact_settings;
  v_module public.platform_module_flags;
  v_result jsonb := jsonb_build_object('available', false);
begin
  if p_listing_id is null or length(btrim(p_listing_id)) = 0 then
    return v_result;
  end if;

  select * into v_row
    from public.provider_contact_settings
   where listing_id = p_listing_id;
  if v_row is null or v_row.consent_recorded_at is null then
    return v_result;
  end if;

  if not exists (
    select 1 from public.listings l
     where l.id = p_listing_id
       and l.owner_id = v_row.owner_user_id
       and l.status = 'active'
  ) then
    return v_result;
  end if;

  select * into v_module
    from public.platform_module_flags
   where module_key = v_row.module_key;
  if v_module is null or not v_module.is_enabled or not v_module.allow_contact_owner then
    return v_result;
  end if;

  return jsonb_build_object(
    'available', true,
    'phone', case when v_row.publish_phone and v_row.business_phone_verified_at is not null
                  then v_row.business_phone end,
    'whatsapp', case when v_row.publish_whatsapp and v_row.whatsapp_verified_at is not null
                     then v_row.whatsapp_number end,
    'disclaimer',
      'Bookings made outside BookOurSpace are not automatically confirmed by the platform.'
  );
end;
$$;

-- Availability is a read operation: it must not let an anonymous caller sweep
-- expired holds for the entire platform. Expired holds are treated as free in
-- this result and remain available for the normal booking cleanup path.
-- Private inventory stays visible to its active owner/admin only.
create or replace function public.stay_availability(
  p_room_type_id uuid,
  p_from date,
  p_to date
)
returns table (unit_id uuid, unit_label text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_listing_id text;
  v_can_read_private boolean := false;
begin
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'INVALID_STAY_RANGE' using errcode = '22023';
  end if;
  if p_to - p_from > 120 then
    raise exception 'STAY_RANGE_TOO_WIDE' using errcode = '22023';
  end if;

  select l.id, (
    auth.uid() is not null and exists (
      select 1
        from public.profiles actor
       where actor.id = auth.uid()
         and actor.account_status = 'active'
         and (actor.id = l.owner_id or actor.role = 'admin')
    )
  )
    into v_listing_id, v_can_read_private
    from public.stay_room_types rt
    join public.stay_properties property on property.id = rt.property_id
    join public.listings l on l.id = property.listing_id
   where rt.id = p_room_type_id;

  if v_listing_id is null then
    return;
  end if;
  if not v_can_read_private and not public.stay_listing_is_publicly_bookable(v_listing_id) then
    return;
  end if;

  return query
    select u.id, u.label
      from public.stay_units u
     where u.room_type_id = p_room_type_id
       and u.is_active
       and not exists (
         select 1 from public.stay_allocations a
          where a.unit_id = u.id
            and (
              a.status = 'confirmed'
              or (a.status = 'held' and a.expires_at > now())
            )
            and a.stay_dates && daterange(p_from, p_to, '[)')
       )
       and not exists (
         select 1 from public.stay_blocks b
          where b.unit_id = u.id
            and b.is_active
            and b.stay_dates && daterange(p_from, p_to, '[)')
       )
     order by u.label;
end;
$$;

-- The function bodies are unchanged for the remaining discovery APIs;
-- explicitly preserve their observed caller matrix after removing PostgreSQL's
-- implicit PUBLIC EXECUTE. Do not add service_role to class or venue RPCs that
-- did not have that grant in the read-only audit.
revoke all on function public.class_batch_availability(uuid) from public;
grant execute on function public.class_batch_availability(uuid) to anon, authenticated;
revoke all on function public.provider_contact_details(text) from public;
grant execute on function public.provider_contact_details(text) to anon, authenticated;
revoke all on function public.service_listing_profile(text) from public;
grant execute on function public.service_listing_profile(text) to anon, authenticated, service_role;
revoke all on function public.service_listing_slots(text, date, date) from public;
grant execute on function public.service_listing_slots(text, date, date) to anon, authenticated, service_role;
revoke all on function public.stay_availability(uuid, date, date) from public;
grant execute on function public.stay_availability(uuid, date, date) to anon, authenticated, service_role;
revoke all on function public.venue_public_calendar(text, timestamptz, timestamptz) from public;
grant execute on function public.venue_public_calendar(text, timestamptz, timestamptz) to anon, authenticated;
revoke all on function public.venue_quote(text, timestamptz, timestamptz, text, integer, text[]) from public;
grant execute on function public.venue_quote(text, timestamptz, timestamptz, text, integer, text[]) to anon, authenticated;

-- These audit/event tables are deliberately not directly exposed to anon or
-- authenticated users. RLS with zero policies is deny-all; do not add a broad
-- policy to silence an advisor. Trusted definer functions write the events.
revoke all on table public.user_access_audit_events from public, anon, authenticated;
revoke truncate, trigger, references on table public.user_access_audit_events from service_role;

revoke all on table public.venue_payment_events from public, anon, authenticated;
revoke update, delete, truncate, trigger, references on table public.venue_payment_events from service_role;
grant select, insert on table public.venue_payment_events to service_role;

-- Payment provider events are financial audit history. Make the event ledger
-- append-only even for service_role and the table owner. Ordinary retries use
-- INSERT ... ON CONFLICT DO NOTHING and are unaffected.
create or replace function private.reject_venue_payment_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'VENUE_PAYMENT_EVENTS_APPEND_ONLY' using errcode = '42501';
end;
$$;
revoke all on function private.reject_venue_payment_event_mutation() from public, anon, authenticated, service_role;

drop trigger if exists venue_payment_events_append_only_row on public.venue_payment_events;
create trigger venue_payment_events_append_only_row
  before update or delete on public.venue_payment_events
  for each row execute function private.reject_venue_payment_event_mutation();

drop trigger if exists venue_payment_events_append_only_truncate on public.venue_payment_events;
create trigger venue_payment_events_append_only_truncate
  before truncate on public.venue_payment_events
  for each statement execute function private.reject_venue_payment_event_mutation();

-- Supabase's advisor found 56 public policies whose direct auth.uid() calls
-- are evaluated per row. Wrapping them in a scalar subquery allows PostgreSQL
-- to evaluate the stable identity once per statement. Policy roles and boolean
-- predicates remain identical; already-wrapped policies are left untouched.
do $$
declare
  policy_record record;
  protected_using text;
  protected_check text;
  rewritten_using text;
  rewritten_check text;
  alter_sql text;
begin
  for policy_record in
    select schemaname, tablename, policyname, qual, with_check
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and position('auth.uid()' in coalesce(qual, '') || ' ' || coalesce(with_check, '')) > 0
       and position('auth.uid()' in regexp_replace(
         coalesce(qual, '') || ' ' || coalesce(with_check, ''),
         '\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\s*\)', '', 'gi')) > 0
     order by tablename, policyname
  loop
    protected_using := case when policy_record.qual is null then null
      else regexp_replace(policy_record.qual,
        '\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\s*\)',
        '__BOS_CACHED_AUTH_UID__', 'gi') end;
    protected_check := case when policy_record.with_check is null then null
      else regexp_replace(policy_record.with_check,
        '\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\s*\)',
        '__BOS_CACHED_AUTH_UID__', 'gi') end;
    rewritten_using := case when protected_using is null then null
      else replace(protected_using, 'auth.uid()', '(select auth.uid())') end;
    rewritten_check := case when protected_check is null then null
      else replace(protected_check, 'auth.uid()', '(select auth.uid())') end;
    rewritten_using := case when rewritten_using is null then null
      else replace(rewritten_using, '__BOS_CACHED_AUTH_UID__', '(select auth.uid())') end;
    rewritten_check := case when rewritten_check is null then null
      else replace(rewritten_check, '__BOS_CACHED_AUTH_UID__', '(select auth.uid())') end;

    alter_sql := format('alter policy %I on %I.%I',
      policy_record.policyname, policy_record.schemaname, policy_record.tablename);
    if rewritten_using is not null then
      alter_sql := alter_sql || format(' using (%s)', rewritten_using);
    end if;
    if rewritten_check is not null then
      alter_sql := alter_sql || format(' with check (%s)', rewritten_check);
    end if;
    execute alter_sql;
  end loop;
end;
$$;

commit;

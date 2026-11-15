-- Forward-only local hardening for authenticated-callable SECURITY DEFINER
-- RPCs. Do not apply to a hosted project without separate approval.

begin;

-- Keep the trusted schemas ahead of public and put pg_temp explicitly last.
-- This prevents a caller-created temporary relation from shadowing an
-- unqualified relation inside an elevated function. Public/auth/storage are
-- not CREATE-writable by anon or authenticated on the verified project.
set local search_path = pg_catalog;

-- Keep the foreign-key access paths for new media/audit/guest-contact tables
-- covered after the complete migration chain. These are additive indexes and
-- do not rewrite or remove existing rows or constraints.
create index if not exists idx_media_asset_publication_audit_actor
  on public.media_asset_publication_audit (actor_id);
create index if not exists idx_media_asset_publication_audit_asset
  on public.media_asset_publication_audit (media_asset_id);
create index if not exists idx_media_asset_publications_published_by
  on public.media_asset_publications (published_by);
create index if not exists idx_stay_booking_guest_contacts_guest
  on public.stay_booking_guest_contacts (guest_user_id);
create index if not exists idx_stay_listing_review_events_actor
  on public.stay_listing_review_events (actor_user_id);

do $migration$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and not coalesce(p.proconfig @> array['search_path=""'], false)
  loop
    execute format(
      'alter function %s set search_path to pg_catalog, auth, storage, public, pg_temp',
      v_function
    );
  end loop;
end;
$migration$;

-- These RPCs accept trusted server configuration or persist audit/booking
-- state based on signed server context. Authenticated users must reach them
-- through the server API, which verifies Google identity, current profile and
-- ownership before using its service-role database transaction.
revoke all on function public.create_booking_atomic(
  text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,text[],text,text,text
) from public, anon, authenticated;
grant execute on function public.create_booking_atomic(
  text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,text[],text,text,text
) to service_role;

revoke all on function public.create_service_payment_intent(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.create_service_payment_intent(uuid,text,text,text)
  to service_role;

revoke all on function public.create_stay_checkout(
  text,uuid,date,date,integer,text,text,text,text,jsonb,text,text,text
) from public, anon, authenticated;
grant execute on function public.create_stay_checkout(
  text,uuid,date,date,integer,text,text,text,text,jsonb,text,text,text
) to service_role;

revoke all on function public.pg_create_payment_intent(text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.pg_create_payment_intent(text,text,text,text,text,text)
  to service_role;

revoke all on function public.stay_hold_units(uuid,date,date,integer,integer)
  from public, anon, authenticated;
grant execute on function public.stay_hold_units(uuid,date,date,integer,integer)
  to service_role;

-- A hold token is returned to its guest, so it cannot authorize releasing a
-- confirmed allocation independently of the booking cancellation workflow.
revoke all on function public.stay_cancel_allocation(uuid)
  from public, anon, authenticated;
grant execute on function public.stay_cancel_allocation(uuid)
  to service_role;

revoke all on function public.record_live_edit_cinema_audit(text,text,text,text[],jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.record_live_edit_cinema_audit(text,text,text,text[],jsonb,jsonb)
  to service_role;

-- Media readiness depends on trusted server-side byte inspection; client-side
-- Storage metadata is not sufficient evidence that an uploaded object is safe.
revoke all on function public.finalize_media_asset(uuid) from public, anon, authenticated;
grant execute on function public.finalize_media_asset(uuid) to service_role;

-- A checkout row cannot be created for a merely active draft. The shared
-- predicate requires a verified active owner, approved listing and inventory.
create or replace function public.enforce_stay_checkout_publicability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.payload->>'source' = 'stay_checkout' then
    perform public.stay_assert_listing_bookable(new.listing_id);
  end if;
  return new;
end;
$function$;
revoke all on function public.enforce_stay_checkout_publicability() from public, anon, authenticated;
drop trigger if exists enforce_stay_checkout_publicability on public.bookings;
create trigger enforce_stay_checkout_publicability
before insert or update of listing_id, payload on public.bookings
for each row execute function public.enforce_stay_checkout_publicability();

-- Until verified supplier identity and tax configuration exist, no caller may
-- create or mutate a PG invoice with GST values. Tax-free booking documents
-- and payment receipts remain available with tax_applied=false.
create or replace function public.reject_unverified_pg_invoice_tax()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if coalesce(new.tax_paise, 0) > 0
     or coalesce(new.tax_percent, 0) > 0
     or coalesce(new.tax_applied, false) then
    raise exception 'GST_CONFIGURATION_NOT_VERIFIED' using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function public.reject_unverified_pg_invoice_tax() from public, anon, authenticated;
drop trigger if exists reject_unverified_pg_invoice_tax on public.pg_invoices;
create trigger reject_unverified_pg_invoice_tax
before insert or update of tax_paise, tax_percent, tax_applied on public.pg_invoices
for each row execute function public.reject_unverified_pg_invoice_tax();

-- RPC ACLs alone are insufficient for privileged actions exposed through
-- SECURITY DEFINER functions. The existing HTTP handlers require a
-- Super Admin scope for fee waivers, refund approvals, payment-claim approval,
-- and dispute refunds; enforce the same boundary at the durable audit write
-- so a direct authenticated RPC cannot bypass the server route.
create or replace function public.enforce_pg_financial_action_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.action in ('fee_waived', 'refund_approved', 'payment_claim_approved')
     or (new.action = 'dispute_resolved'
         and coalesce((new.detail->>'refundApprovedPaise')::bigint, 0) > 0) then
    if not exists (
      select 1 from public.profiles p
       where p.id = new.actor and p.role = 'admin'
         and p.account_status = 'active' and p.is_super_admin is true
    ) then
      raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.enforce_pg_financial_action_super_admin() from public, anon, authenticated;
drop trigger if exists enforce_pg_financial_action_super_admin on public.pg_admin_audit;
create trigger enforce_pg_financial_action_super_admin
before insert on public.pg_admin_audit
for each row execute function public.enforce_pg_financial_action_super_admin();

-- Cancellation is an authenticated actor action, so it must also require a
-- current active profile. An old JWT with no active profile must not be able
-- to mutate a class enrollment or obtain a refund quote after suspension or
-- account closure.
create or replace function public.class_cancel_enrollment(
  p_enrollment_id uuid,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_row public.class_enrollments%rowtype;
  v_batch public.class_batches%rowtype;
  v_owner uuid;
  v_start timestamptz;
  v_hours numeric;
  v_percent integer;
  v_policy text;
  v_refund numeric(12, 2);
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if not public.is_active_user() then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_row from public.class_enrollments where id = p_enrollment_id for update;
  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select l.owner_id into v_owner from public.listings l where l.id = v_row.listing_id;
  if v_row.student_id <> v_actor and v_owner is distinct from v_actor and not public.is_admin() then
    raise exception 'ENROLLMENT_NOT_OWNED_BY_SESSION' using errcode = 'P0001';
  end if;

  if v_row.status = 'cancelled' then
    return jsonb_build_object(
      'enrollment', to_jsonb(v_row), 'alreadyCancelled', true,
      'refundPercent', v_row.refund_percent, 'refundAmount', v_row.refund_amount,
      'refundPolicy', v_row.refund_policy
    );
  end if;

  select * into v_batch from public.class_batches where id = v_row.batch_id;
  v_start := case when v_batch.start_date is null then null
    else ((v_batch.start_date + v_batch.start_time) at time zone coalesce(v_batch.timezone, 'Asia/Kolkata')) end;
  if v_start is null then
    v_hours := null; v_percent := 100; v_policy := 'NO_SCHEDULED_START_FULL_RELEASE';
  else
    v_hours := round((extract(epoch from (v_start - pg_catalog.now())) / 3600)::numeric, 2);
    if v_hours >= 48 then v_percent := 100; v_policy := 'FREE_CANCELLATION_48H';
    elsif v_hours >= 24 then v_percent := 75; v_policy := 'STANDARD_CANCELLATION_24H';
    elsif v_hours > 0 then v_percent := 50; v_policy := 'LATE_CANCELLATION_UNDER_24H';
    else v_percent := 0; v_policy := 'CANCELLATION_WINDOW_CLOSED'; end if;
  end if;

  if v_row.payment_status = 'verified' then
    v_refund := round(v_row.fee_amount * v_percent / 100, 2);
  else
    v_refund := 0;
  end if;

  update public.class_enrollments
     set status = 'cancelled', cancelled_at = pg_catalog.now(),
         cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         refund_percent = v_percent, refund_amount = v_refund, refund_policy = v_policy,
         seat_sequence = null, waitlist_position = null, updated_at = pg_catalog.now()
   where id = p_enrollment_id returning * into v_row;

  return jsonb_build_object(
    'enrollment', to_jsonb(v_row), 'alreadyCancelled', false, 'hoursUntilStart', v_hours,
    'refundPercent', v_percent, 'refundAmount', v_refund, 'refundPolicy', v_policy,
    'paymentSettled', v_row.payment_status = 'verified',
    'note', case when v_row.payment_status = 'verified'
      then 'Refund quote only. Settlement must be confirmed by the payment provider.'
      else 'No money was captured for this enrollment; the obligation is released.' end
  );
end;
$function$;

-- Close the cross-owner seasonal-rate UUID collision. The previous upsert
-- trusted a caller-provided id on conflict and updated that row without
-- checking that it belonged to the requested listing.
create or replace function public.venue_owner_manage_seasonal_rate(
  p_listing_id text,
  p_id uuid,
  p_dates daterange,
  p_slot text,
  p_rate bigint,
  p_delete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_settings public.venue_booking_settings%rowtype;
  v_row public.venue_seasonal_rates%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile
    from public.profiles
   where id = v_uid and account_status = 'active'
   for share;

  if v_profile.id is null or v_profile.role not in ('provider', 'admin') then
    raise exception 'LISTING_NOT_OWNED' using errcode = '42501';
  end if;

  select s.* into v_settings
    from public.venue_booking_settings s
    join public.listings l on l.id = s.listing_id and l.owner_id = s.owner_user_id
   where s.listing_id = p_listing_id
     and l.entity_type = 'venue'
     and (v_profile.role = 'admin' or l.owner_id = v_uid)
   for share of s, l;

  if v_settings.listing_id is null then
    raise exception 'LISTING_NOT_OWNED' using errcode = '42501';
  end if;

  if p_delete then
    delete from public.venue_seasonal_rates
     where id = p_id
       and listing_id = p_listing_id
       and owner_user_id = v_settings.owner_user_id
    returning * into v_row;
    if not found then
      raise exception 'SEASONAL_RATE_NOT_FOUND' using errcode = 'P0002';
    end if;
  else
    if p_dates is null or isempty(p_dates)
       or p_slot not in ('hourly', 'half_day', 'full_day', 'multi_day')
       or p_rate is null or p_rate < 0 then
      raise exception 'INVALID_SEASONAL_RATE' using errcode = '22023';
    end if;

    insert into public.venue_seasonal_rates(id, listing_id, owner_user_id, dates, slot_type, rate_paise)
    values (coalesce(p_id, pg_catalog.gen_random_uuid()), p_listing_id,
            v_settings.owner_user_id, p_dates, p_slot, p_rate)
    on conflict (id) do update
       set dates = excluded.dates,
           slot_type = excluded.slot_type,
           rate_paise = excluded.rate_paise
     where public.venue_seasonal_rates.listing_id = excluded.listing_id
       and public.venue_seasonal_rates.owner_user_id = excluded.owner_user_id
    returning * into v_row;

    if not found then
      raise exception 'SEASONAL_RATE_ID_CONFLICT' using errcode = '23505';
    end if;
  end if;

  return pg_catalog.to_jsonb(v_row);
end;
$function$;

commit;

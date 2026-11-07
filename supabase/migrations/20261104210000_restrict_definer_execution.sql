-- Restricted execution permissions for SECURITY DEFINER functions.
--
-- PostgreSQL grants EXECUTE on every new function to PUBLIC. On an isolated
-- cluster after the full migration chain, 17 SECURITY DEFINER functions were
-- executable by anon, including trigger-only functions and the two booking
-- writers:
--
--   public.create_booking_atomic        anon + PUBLIC
--   public.hold_movie_seats_atomic      anon + PUBLIC
--   public.handle_new_user              anon + PUBLIC  (trigger only)
--   public.is_active_user               anon + PUBLIC
--   public.is_admin                     anon + PUBLIC
--   public.log_stay_allocation_change   anon + PUBLIC  (trigger only)
--   public.enforce_movie_booking_approval anon + PUBLIC (trigger only)
--   public.pg_sync_booking_payment_status anon + PUBLIC (trigger only)
--   public.pg_admin_audit_immutable     anon + PUBLIC  (trigger only)
--   public.venue_is_active_admin        anon
--
-- hold_movie_seats_atomic is SECURITY DEFINER and makes no auth check, so an
-- unauthenticated caller could hold arbitrary cinema seats. Trigger functions
-- do not need EXECUTE at runtime (the trigger runs as the table owner), so
-- their public grant is pure attack surface.
--
-- Deliberately left executable by anon: the read-only catalogue helpers that
-- the anonymous storefront uses today (venue_quote, stay_availability,
-- venue_public_calendar, class_batch_availability, service_listing_slots,
-- service_listing_profile, provider_contact_details). Changing those is a
-- product decision, not a migration detail, and is reported separately.
--
-- Idempotent: revoke/grant are absolute, not incremental.

begin;

do $$
declare
  internal_function text;
begin
  foreach internal_function in array array[
    'create_booking_atomic',
    'hold_movie_seats_atomic',
    'handle_new_user',
    'log_stay_allocation_change',
    'enforce_movie_booking_approval',
    'pg_sync_booking_payment_status',
    'pg_admin_audit_immutable',
    'venue_is_active_admin',
    'is_admin',
    'is_active_user'
  ]
  loop
    execute format(
      'revoke all on function %s from public, anon',
      (select p.oid::regprocedure
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = internal_function
        order by p.oid
        limit 1)
    );
    execute format(
      'grant execute on function %s to authenticated, service_role',
      (select p.oid::regprocedure
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = internal_function
        order by p.oid
        limit 1)
    );
  end loop;
end $$;

-- Trigger-only functions need no role grant at all.
revoke all on function public.handle_new_user() from authenticated, service_role;
revoke all on function public.log_stay_allocation_change() from authenticated, service_role;
revoke all on function public.enforce_movie_booking_approval() from authenticated, service_role;
revoke all on function public.pg_sync_booking_payment_status() from authenticated, service_role;
revoke all on function public.pg_admin_audit_immutable() from authenticated, service_role;

-- public.payment_verifications.intent_id is TEXT UNIQUE with no foreign key to
-- public.payment_intents(id) (also TEXT), so a verification row can point at a
-- settlement intent that never existed. Both columns are TEXT, so the link is
-- expressible without a type change.
--
-- Added NOT VALID so the migration cannot fail on pre-existing orphan rows in a
-- live database; it still rejects every new orphan. Validation is a separate,
-- explicitly scheduled step once orphans are reconciled — see the audit report.
alter table public.payment_verifications
  drop constraint if exists payment_verifications_intent_id_fkey;
alter table public.payment_verifications
  add constraint payment_verifications_intent_id_fkey
  foreign key (intent_id) references public.payment_intents(id)
  on delete restrict
  not valid;

commit;

-- Local rollback for the independent business ownership work.
-- Run only against a local disposable database. This intentionally removes the
-- business-scoped columns and policies; it never runs against hosted Supabase.
begin;
drop policy if exists "Business listings are publicly readable or business-scoped" on public.listings;
drop policy if exists "Business owners and managers create listings" on public.listings;
drop policy if exists "Business owners and managers update listings" on public.listings;
drop policy if exists "Business owners and managers delete listings" on public.listings;
drop policy if exists "Business members read service bookings" on public.service_bookings;
drop policy if exists "Business members update service bookings" on public.service_bookings;
drop policy if exists "Customer or business members read bookings" on public.bookings;
drop policy if exists "Customer or business members update bookings" on public.bookings;
drop policy if exists "Business members read stay properties" on public.stay_properties;
drop policy if exists "Active properties are publicly readable" on public.stay_properties;
drop policy if exists "Business owners/managers write stay properties" on public.stay_properties;
drop policy if exists "Business owners/managers update stay properties" on public.stay_properties;
drop policy if exists "Business members read venue bookings" on public.venue_bookings;
drop policy if exists "Customers and business finance read payment intents" on public.payment_intents;
drop policy if exists "Customers and business finance read service payment intents" on public.service_payment_intents;
drop policy if exists "Customers and business finance read venue payment intents" on public.venue_payment_intents;
drop policy if exists "Customers and business finance read invoices" on public.pg_invoices;
drop policy if exists "Customers and business members read enquiries" on public.enquiries;
drop policy if exists "Business members update enquiries" on public.enquiries;
drop policy if exists "Business members read contact settings" on public.provider_contact_settings;
drop policy if exists "Business owners manage contact settings" on public.provider_contact_settings;
drop policy if exists "Customers and business finance read payment claims" on public.pg_payment_claims;
drop policy if exists "Customers and business finance read service payment claims" on public.service_payment_claims;
drop trigger if exists trg_business_transfer_audit on public.business_ownership_transfers;
drop table if exists public.business_ownership_transfers;

drop trigger if exists trg_business_audit on public.businesses;
drop trigger if exists trg_business_member_audit on public.business_members;
drop trigger if exists trg_business_access_audit on public.business_module_access;
drop trigger if exists trg_guard_business_privileged_changes on public.businesses;
drop trigger if exists trg_business_owner_membership on public.businesses;

drop policy if exists "institute_select" on public.institutes;
drop policy if exists "institute_update" on public.institutes;
alter table public.institutes drop column if exists business_id;
alter table public.listings drop column if exists business_id;
alter table public.bookings drop column if exists business_id;
alter table public.service_bookings drop column if exists business_id;
alter table public.stay_properties drop column if exists business_id;
alter table public.venue_bookings drop column if exists business_id;
alter table public.payment_intents drop column if exists business_id;
alter table public.pg_invoices drop column if exists business_id;
alter table public.pg_payment_claims drop column if exists business_id;
alter table public.service_payment_intents drop column if exists business_id;
alter table public.service_payment_claims drop column if exists business_id;
alter table public.venue_payment_intents drop column if exists business_id;
alter table public.provider_contact_settings drop column if exists business_id;
alter table public.enquiries drop column if exists business_id;
alter table public.reviews drop column if exists business_id;
alter table public.media_assets drop column if exists business_id;
alter table public.service_provider_blackouts drop column if exists business_id;
alter table public.service_provider_schedules drop column if exists business_id;
alter table public.service_provider_credentials drop column if exists business_id;
alter table public.provider_registration_requests drop column if exists business_id;

drop table if exists public.business_backfill_review;
drop table if exists public.business_audit_events;
drop table if exists public.business_invitations;
drop table if exists public.business_module_access;
drop table if exists public.business_members;
drop table if exists public.businesses;

drop function if exists public.business_publicly_available(uuid);
drop function if exists public.can_access_business_module(uuid,text[]);
drop function if exists public.business_module_enabled(uuid,text);
drop function if exists public.business_module_for_listing(text,text);
drop function if exists public.ensure_business_owner_membership();
drop function if exists public.guard_business_privileged_changes();
drop function if exists public.record_business_audit();
drop function if exists public.can_access_business(uuid,text[]);
drop function if exists public.is_business_member(uuid,text[]);
drop function if exists public.business_role(uuid);

commit;

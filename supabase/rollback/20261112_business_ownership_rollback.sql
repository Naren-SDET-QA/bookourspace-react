-- ============================================================================
-- Business ownership rollback / recovery
-- ----------------------------------------------------------------------------
-- PURPOSE
--   Undo the *access* effects of the business-ownership migrations
--   (20261112010000 .. 20261112050000 plus the legacy fallback and strict
--   assignment follow-ups 20261112140000 .. 20261112300000) while KEEPING every
--   row that already exists.
--
--   The previous version of this file only DROPPED objects. It removed the
--   business columns, tables and helpers but never recreated the 24 legacy RLS
--   policies that phases 3 and 4 delete, so after a rollback customers lost
--   access to their own bookings, public stay discovery returned nothing, and
--   providers lost their listings. This file fixes that.
--
-- WHAT IT DOES
--   1. Drops the business-scoped policies that replaced the legacy ones on the
--      13 pre-existing tables.
--   2. Recreates the 24 legacy policies exactly as they existed on the hosted
--      project before the ownership block was applied (captured read-only from
--      pg_policies on 2026-11-12, project obkfgxjzlscungkhbyvq).
--   3. Detaches the write-time business enforcement (listing/record triggers and
--      the NOT NULL on listings.business_id) so legacy inserts that do not send
--      business context work again.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * It never deletes a business, membership, module grant, audit event,
--     ownership transfer or business_id value. All business data survives, so
--     the ownership block can be re-applied later without loss.
--   * It does not touch the new business_* tables, the institute workspace or
--     the provider-portal tables. Those are independent features; their own
--     policies stay in place and their data is untouched.
--   * It does not restore the pre-phase-1 provider_type constraint on
--     provider_registration_requests (widening a check constraint is not an
--     access risk, and no data is lost by leaving it widened).
--
-- HOW TO RUN (after explicit approval; this is a schema change)
--   1. Take a verified backup first:
--        supabase db dump --db-url "$URL" -f backup_pre_rollback.sql
--      and confirm it restores into a scratch database.
--   2. Confirm the target project ref with supabase/tests/lib/bos_target_guard.sh
--      (BOS_APPROVED_REF=obkfgxjzlscungkhbyvq).
--   3. Execute atomically. Do NOT run this file with a plain `psql -f`:
--        psql -1 -v ON_ERROR_STOP=1 "$URL" -f supabase/rollback/20261112_business_ownership_rollback.sql
--      `-1` wraps every statement in one transaction, so a failure leaves the
--      project exactly as it was.
--   4. Verify with the queries at the bottom of this file.
--
-- DATA-SAFE ORDER
--   Policies are dropped and recreated before the triggers are detached, so no
--   window exists in which rows are writable but unreadable. Every statement is
--   `if exists` / `drop ... if exists`, so the file is re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop the business-scoped policies that replaced the legacy ones.
--    (Business tables keep their own policies.)
-- ---------------------------------------------------------------------------
drop policy if exists "Business listings are publicly readable or business-scoped" on public.listings;
drop policy if exists "Business listings for authenticated users" on public.listings;
drop policy if exists "Public active listings" on public.listings;
drop policy if exists "Business owners and managers create listings" on public.listings;
drop policy if exists "Business owners and managers update listings" on public.listings;
drop policy if exists "Business owners and managers delete listings" on public.listings;

drop policy if exists "Customer or business members read bookings" on public.bookings;
drop policy if exists "Customer or business members update bookings" on public.bookings;

drop policy if exists "Business members read service bookings" on public.service_bookings;
drop policy if exists "Business members update service bookings" on public.service_bookings;

drop policy if exists "Business members read venue bookings" on public.venue_bookings;

drop policy if exists "Business members read stay properties" on public.stay_properties;
drop policy if exists "Business owners/managers write stay properties" on public.stay_properties;
drop policy if exists "Business owners/managers update stay properties" on public.stay_properties;
drop policy if exists "Active properties are publicly readable" on public.stay_properties;

drop policy if exists "Customers and business finance read payment intents" on public.payment_intents;
drop policy if exists "Customers and business finance read service payment intents" on public.service_payment_intents;
drop policy if exists "Customers and business finance read venue payment intents" on public.venue_payment_intents;

drop policy if exists "Customers and business finance read invoices" on public.pg_invoices;
drop policy if exists "Customers and business finance read payment claims" on public.pg_payment_claims;
drop policy if exists "Customers and business finance read service payment claims" on public.service_payment_claims;

drop policy if exists "Customers and business members read enquiries" on public.enquiries;
drop policy if exists "Business members update enquiries" on public.enquiries;

drop policy if exists "Business members read contact settings" on public.provider_contact_settings;
drop policy if exists "Business owners manage contact settings" on public.provider_contact_settings;

-- ---------------------------------------------------------------------------
-- 2. Restore the 24 legacy policies (verbatim definitions from the hosted
--    project on 2026-11-12, before the ownership block).
-- ---------------------------------------------------------------------------
-- bookings (5)
drop policy if exists "Authenticated users can view their own bookings" on public.bookings;
create policy "Authenticated users can view their own bookings" on public.bookings as permissive for select to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "Authenticated users can update their own bookings" on public.bookings;
create policy "Authenticated users can update their own bookings" on public.bookings as permissive for update to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "PG booking parties read bookings" on public.bookings;
create policy "PG booking parties read bookings" on public.bookings as permissive for select to authenticated using (((((payload ->> 'source'::text) = 'pg_booking'::text) AND (user_id = ( SELECT auth.uid() AS uid))) OR (((payload ->> 'source'::text) = 'pg_booking'::text) AND (EXISTS ( SELECT 1    FROM listings l   WHERE ((l.id = bookings.listing_id) AND (l.owner_id = ( SELECT auth.uid() AS uid)))))) OR (((payload ->> 'source'::text) = 'pg_booking'::text) AND is_admin())));
drop policy if exists "Providers and admins can update booking status" on public.bookings;
create policy "Providers and admins can update booking status" on public.bookings as permissive for update to authenticated using (((provider_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1    FROM listings l   WHERE ((l.id = bookings.listing_id) AND (l.owner_id = ( SELECT auth.uid() AS uid))))) OR is_admin())) with check (((provider_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1    FROM listings l   WHERE ((l.id = bookings.listing_id) AND (l.owner_id = ( SELECT auth.uid() AS uid))))) OR is_admin()));
drop policy if exists "Providers can view bookings for their listings" on public.bookings;
create policy "Providers can view bookings for their listings" on public.bookings as permissive for select to authenticated using (((provider_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1    FROM listings l   WHERE ((l.id = bookings.listing_id) AND (l.owner_id = ( SELECT auth.uid() AS uid))))) OR is_admin()));

-- listings (4)
drop policy if exists "Active listings are viewable by everyone, owners view own" on public.listings;
create policy "Active listings are viewable by everyone, owners view own" on public.listings as permissive for select to public using (((status = 'active'::text) OR (( SELECT auth.uid() AS uid) = owner_id)));
drop policy if exists "Authenticated users can create their own listings" on public.listings;
create policy "Authenticated users can create their own listings" on public.listings as permissive for insert to authenticated with check (((( SELECT auth.uid() AS uid) = owner_id) AND is_active_user()));
drop policy if exists "Owners can update their own listings" on public.listings;
create policy "Owners can update their own listings" on public.listings as permissive for update to authenticated using ((((( SELECT auth.uid() AS uid) = owner_id) AND is_active_user()) OR (is_admin() AND (EXISTS ( SELECT 1    FROM profiles p   WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.account_status = 'active'::text))))))) with check ((((( SELECT auth.uid() AS uid) = owner_id) AND is_active_user()) OR (is_admin() AND (EXISTS ( SELECT 1    FROM profiles p   WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.account_status = 'active'::text)))))));
drop policy if exists "Owners can delete their own listings" on public.listings;
create policy "Owners can delete their own listings" on public.listings as permissive for delete to authenticated using ((((( SELECT auth.uid() AS uid) = owner_id) AND is_active_user()) OR (is_admin() AND (EXISTS ( SELECT 1    FROM profiles p   WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text) AND (p.account_status = 'active'::text)))))));

-- service_bookings (2)
drop policy if exists "Booking parties and admins read service bookings" on public.service_bookings;
create policy "Booking parties and admins read service bookings" on public.service_bookings as permissive for select to authenticated using (((customer_id = ( SELECT auth.uid() AS uid)) OR (provider_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
drop policy if exists "Booking parties and admins update service bookings" on public.service_bookings;
create policy "Booking parties and admins update service bookings" on public.service_bookings as permissive for update to authenticated using ((((customer_id = ( SELECT auth.uid() AS uid)) OR (provider_id = ( SELECT auth.uid() AS uid)) OR is_admin()) AND is_active_user())) with check ((((customer_id = ( SELECT auth.uid() AS uid)) OR (provider_id = ( SELECT auth.uid() AS uid)) OR is_admin()) AND is_active_user()));

-- stay_properties (4)
drop policy if exists "Active properties are publicly readable" on public.stay_properties;
create policy "Active properties are publicly readable" on public.stay_properties as permissive for select to anon, authenticated using (is_active);
drop policy if exists "Active owners/admins insert stay properties" on public.stay_properties;
create policy "Active owners/admins insert stay properties" on public.stay_properties as permissive for insert to authenticated with check ((((owner_user_id = ( SELECT auth.uid() AS uid)) AND is_active_user()) OR (is_admin() AND (EXISTS ( SELECT 1    FROM profiles admin_profile   WHERE ((admin_profile.id = ( SELECT auth.uid() AS uid)) AND (admin_profile.role = 'admin'::text) AND (admin_profile.account_status = 'active'::text)))))));
drop policy if exists "Active owners/admins update stay properties" on public.stay_properties;
create policy "Active owners/admins update stay properties" on public.stay_properties as permissive for update to authenticated using ((((owner_user_id = ( SELECT auth.uid() AS uid)) AND is_active_user()) OR (is_admin() AND (EXISTS ( SELECT 1    FROM profiles admin_profile   WHERE ((admin_profile.id = ( SELECT auth.uid() AS uid)) AND (admin_profile.role = 'admin'::text) AND (admin_profile.account_status = 'active'::text))))))) with check ((((owner_user_id = ( SELECT auth.uid() AS uid)) AND is_active_user()) OR (is_admin() AND (EXISTS ( SELECT 1    FROM profiles admin_profile   WHERE ((admin_profile.id = ( SELECT auth.uid() AS uid)) AND (admin_profile.role = 'admin'::text) AND (admin_profile.account_status = 'active'::text)))))));
drop policy if exists "Owners and active admins read all stay properties" on public.stay_properties;
create policy "Owners and active admins read all stay properties" on public.stay_properties as permissive for select to authenticated using ((((owner_user_id = ( SELECT auth.uid() AS uid)) AND is_active_user()) OR (is_admin() AND (EXISTS ( SELECT 1    FROM profiles admin_profile   WHERE ((admin_profile.id = ( SELECT auth.uid() AS uid)) AND (admin_profile.role = 'admin'::text) AND (admin_profile.account_status = 'active'::text)))))));

-- venue_bookings (1)
drop policy if exists "Venue booking parties read bookings" on public.venue_bookings;
create policy "Venue booking parties read bookings" on public.venue_bookings as permissive for select to authenticated using (((customer_user_id = ( SELECT auth.uid() AS uid)) OR (owner_user_id = ( SELECT auth.uid() AS uid)) OR venue_is_active_admin()));

-- payment intents (3)
drop policy if exists "Owners and admins read payment intents" on public.payment_intents;
create policy "Owners and admins read payment intents" on public.payment_intents as permissive for select to authenticated using (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
drop policy if exists "Booking parties read service payment intents" on public.service_payment_intents;
create policy "Booking parties read service payment intents" on public.service_payment_intents as permissive for select to authenticated using (((customer_id = ( SELECT auth.uid() AS uid)) OR is_admin() OR (EXISTS ( SELECT 1    FROM service_bookings b   WHERE ((b.id = service_payment_intents.booking_id) AND (b.provider_id = ( SELECT auth.uid() AS uid)))))));
drop policy if exists "Venue booking parties read payment intents" on public.venue_payment_intents;
create policy "Venue booking parties read payment intents" on public.venue_payment_intents as permissive for select to authenticated using (((customer_user_id = ( SELECT auth.uid() AS uid)) OR venue_is_active_admin() OR (EXISTS ( SELECT 1    FROM venue_bookings b   WHERE ((b.id = venue_payment_intents.booking_id) AND (b.owner_user_id = ( SELECT auth.uid() AS uid)))))));

-- invoices and claims (3)
drop policy if exists "PG booking parties read invoices" on public.pg_invoices;
create policy "PG booking parties read invoices" on public.pg_invoices as permissive for select to authenticated using ((pg_booking_actor_role(booking_id) IS NOT NULL));
drop policy if exists "PG booking parties read payment claims" on public.pg_payment_claims;
create policy "PG booking parties read payment claims" on public.pg_payment_claims as permissive for select to authenticated using ((pg_booking_actor_role(booking_id) IS NOT NULL));
drop policy if exists "Booking parties and admins read payment claims" on public.service_payment_claims;
create policy "Booking parties and admins read payment claims" on public.service_payment_claims as permissive for select to authenticated using ((is_admin() OR (claimed_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1    FROM service_bookings b   WHERE ((b.id = service_payment_claims.booking_id) AND (b.customer_id = ( SELECT auth.uid() AS uid)))))));

-- enquiries (1)
drop policy if exists "Providers and admins can view enquiries for their listings" on public.enquiries;
create policy "Providers and admins can view enquiries for their listings" on public.enquiries as permissive for select to authenticated using (((EXISTS ( SELECT 1    FROM listings l   WHERE ((l.id = enquiries.listing_id) AND (l.owner_id = ( SELECT auth.uid() AS uid))))) OR is_admin()));

-- provider contact settings (1)
drop policy if exists "Owners manage their contact settings" on public.provider_contact_settings;
create policy "Owners manage their contact settings" on public.provider_contact_settings as permissive for all to authenticated using (((owner_user_id = ( SELECT auth.uid() AS uid)) OR is_admin())) with check (((owner_user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));

-- ---------------------------------------------------------------------------
-- 3. Detach write-time business enforcement so legacy inserts keep working.
--    Columns and values stay in place; only the automatic assignment stops.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_ensure_listing_business on public.listings;

do $$
declare
  t text;
begin
  foreach t in array array[
    'bookings', 'service_bookings', 'venue_bookings', 'stay_properties',
    'payment_intents', 'service_payment_intents', 'venue_payment_intents',
    'service_payment_claims', 'pg_payment_claims', 'pg_invoices'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_ensure_record_business on public.%I', t);
    end if;
  end loop;
end
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'listings'
       and column_name = 'business_id' and is_nullable = 'NO'
  ) then
    alter table public.listings alter column business_id drop not null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Verification (run after the transaction commits)
-- ---------------------------------------------------------------------------
-- Expect 0: no business-scoped policy name may remain on the legacy tables.
--   select tablename, policyname from pg_policies
--    where schemaname = 'public'
--      and (policyname like 'Business %' or policyname like 'Customers and business %'
--           or policyname in ('Customer or business members read bookings',
--                             'Customer or business members update bookings',
--                             'Public active listings'));
--
-- Expect the 24 legacy names back:
--   select count(*) from pg_policies
--    where schemaname = 'public' and tablename in
--      ('listings','bookings','service_bookings','stay_properties','venue_bookings',
--       'payment_intents','service_payment_intents','venue_payment_intents',
--       'pg_invoices','enquiries','provider_contact_settings','pg_payment_claims',
--       'service_payment_claims');
--
-- Expect listings.business_id nullable again:
--   select is_nullable from information_schema.columns
--    where table_schema='public' and table_name='listings' and column_name='business_id';
--
-- Expect no data loss:
--   select count(*) from public.businesses;          -- unchanged by this file
--   select count(*) from public.listings where business_id is not null;

-- ---------------------------------------------------------------------------
-- 5. OPTIONAL, DESTRUCTIVE teardown - NOT part of the recovery. Leave disabled
--    unless you have decided to abandon the ownership model permanently AND
--    have a verified backup. Archiving first is strongly recommended:
--
--      copy (select * from public.businesses) to '/tmp/businesses.csv' csv header;
--      copy (select * from public.business_members) to '/tmp/business_members.csv' csv header;
--      copy (select * from public.business_audit_events) to '/tmp/business_audit_events.csv' csv header;
--      copy (select * from public.business_ownership_transfers) to '/tmp/business_ownership_transfers.csv' csv header;
--
--    then:
--      -- alter table public.listings drop column if exists business_id;
--      -- alter table public.bookings drop column if exists business_id;
--      -- ... (18 columns)
--      -- drop table if exists public.business_member_access, public.business_ownership_transfers,
--      --   public.business_backfill_review, public.business_audit_events,
--      --   public.business_module_access, public.business_invitations,
--      --   public.business_members, public.businesses cascade;
-- ---------------------------------------------------------------------------

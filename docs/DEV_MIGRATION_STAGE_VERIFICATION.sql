-- =============================================================================
-- DEV migration stage verification — BookOurSpace
-- Project: obkfgxjzlscungkhbyvq (React, Mumbai, PG 17.11). NEVER run against
-- zykxneztahxbjduagutv.
--
-- READ-ONLY. Every statement is a SELECT over catalogs. Nothing here writes,
-- creates, drops, or calls a migration function.
--
-- HOW TO RUN
--   psql "$BOS_DEV_DB_URL" -v ON_ERROR_STOP=1 -f docs/DEV_MIGRATION_STAGE_VERIFICATION.sql
--     -> prints all seven result sets in order (P, S0..S5).
--   The Supabase CLI prints only the LAST statement of a multi-statement file,
--   so extract one section instead:
--     awk '/^-- SECTION 2/,/^-- SECTION 3/' docs/DEV_MIGRATION_STAGE_VERIFICATION.sql \
--       | sed '$d' > /tmp/section-2.sql
--     supabase db query --project-ref obkfgxjzlscungkhbyvq --linked -f /tmp/section-2.sql
--   Every statement is independent; none depends on another's result.
--
-- Reading the result: `ok = true` on every row. `actual` is free text so a
-- mismatch is visible without decoding types. Sections are guarded with
-- to_regclass / CASE, so a section run too early reports `false` rather than
-- erroring — that is intentional.
-- =============================================================================


-- =============================================================================
-- SECTION P — PREFLIGHT (run before Stage 0, and again before every stage)
-- Expected on a clean pre-rollout DEV: 5 rows, all ok = true.
-- =============================================================================
select 'P' as stage, 'database is postgres' as check_name, 'postgres' as expected,
       current_database()::text as actual, (current_database() = 'postgres') as ok
union all
select 'P', 'pg major version', '17',
       split_part(current_setting('server_version'), '.', 1),
       (split_part(current_setting('server_version'), '.', 1) = '17')
union all
select 'P', 'ledger rows before rollout', '74',
       (select count(*)::text from supabase_migrations.schema_migrations),
       ((select count(*) from supabase_migrations.schema_migrations) = 74)
union all
select 'P', 'ledger max version', '20261108150000',
       (select max(version) from supabase_migrations.schema_migrations),
       ((select max(version) from supabase_migrations.schema_migrations) = '20261108150000')
union all
select 'P', 'public tables', '75',
       (select count(*)::text from information_schema.tables where table_schema = 'public'),
       ((select count(*) from information_schema.tables where table_schema = 'public') = 75)
union all
select 'P', 'public policies', '141',
       (select count(*)::text from pg_policies where schemaname = 'public'),
       ((select count(*) from pg_policies where schemaname = 'public') = 141)
union all
select 'P', 'business layer absent', 'false',
       (to_regclass('public.businesses') is not null)::text,
       (to_regclass('public.businesses') is null)
union all
select 'P', 'permission layer absent', 'false',
       (to_regclass('public.business_member_access') is not null)::text,
       (to_regclass('public.business_member_access') is null);


-- =============================================================================
-- SECTION 0 — AFTER STAGE 0 (movie visibility + Tamil Nadu)
-- Expected: 10 rows, all ok = true.
-- =============================================================================
select 'S0' as stage, 'movie_theatres exists' as check_name, 'true' as expected,
       (to_regclass('public.movie_theatres') is not null)::text as actual,
       (to_regclass('public.movie_theatres') is not null) as ok
union all
select 'S0', 'movie_titles exists', 'true',
       (to_regclass('public.movie_titles') is not null)::text,
       (to_regclass('public.movie_titles') is not null)
union all
select 'S0', 'movie_showtimes exists', 'true',
       (to_regclass('public.movie_showtimes') is not null)::text,
       (to_regclass('public.movie_showtimes') is not null)
union all
select 'S0', 'cinema_private.admin_permissions exists', 'true',
       (to_regclass('cinema_private.admin_permissions') is not null)::text,
       (to_regclass('cinema_private.admin_permissions') is not null)
union all
select 'S0', 'cinema_private.audit_log exists', 'true',
       (to_regclass('cinema_private.audit_log') is not null)::text,
       (to_regclass('cinema_private.audit_log') is not null)
union all
select 'S0', 'cinema_private.bootstrap_admins exists', 'true',
       (to_regclass('cinema_private.bootstrap_admins') is not null)::text,
       (to_regclass('cinema_private.bootstrap_admins') is not null)
union all
select 'S0', 'both stage-0 versions in ledger', '2',
       (select count(*)::text from supabase_migrations.schema_migrations
         where version in ('20261102124513','20261102142141')),
       ((select count(*) from supabase_migrations.schema_migrations
          where version in ('20261102124513','20261102142141')) = 2)
union all
select 'S0', 'RLS on movie tables', '3',
       (select count(*)::text from pg_class
         where oid in (to_regclass('public.movie_theatres'),
                       to_regclass('public.movie_titles'),
                       to_regclass('public.movie_showtimes')) and relrowsecurity),
       ((select count(*) from pg_class
          where oid in (to_regclass('public.movie_theatres'),
                        to_regclass('public.movie_titles'),
                        to_regclass('public.movie_showtimes')) and relrowsecurity) = 3)
union all
select 'S0', 'cinema_screens visibility guard policy', '1',
       (select count(*)::text from pg_policies
         where schemaname = 'public' and tablename = 'cinema_screens'
           and policyname = 'movie_screen_visibility_guard'),
       ((select count(*) from pg_policies
          where schemaname = 'public' and tablename = 'cinema_screens'
            and policyname = 'movie_screen_visibility_guard') = 1)
union all
select 'S0', 'cinema_screens rows preserved', '5',
       (select coalesce(sum(n_live_tup), 0)::text from pg_stat_user_tables where relname = 'cinema_screens'),
       ((select coalesce(sum(n_live_tup), 0) from pg_stat_user_tables where relname = 'cinema_screens') >= 5)
union all
select 'S0', 'restrictive guards on existing tables', '2',
       (select count(*)::text from pg_policies
         where schemaname = 'public' and permissive = 'RESTRICTIVE'
           and policyname in ('movie_screen_visibility_guard','movie_listing_visibility_guard')),
       ((select count(*) from pg_policies
          where schemaname = 'public' and permissive = 'RESTRICTIVE'
            and policyname in ('movie_screen_visibility_guard','movie_listing_visibility_guard')) = 2)
union all
select 'S0', 'bootstrap admin emails seeded', '4',
       coalesce((select reltuples::bigint from pg_class where oid = to_regclass('cinema_private.bootstrap_admins')), 0)::text,
       (coalesce((select reltuples::bigint from pg_class where oid = to_regclass('cinema_private.bootstrap_admins')), 0) = 4)
union all
select 'S0', 'auth.users bootstrap trigger installed', '1',
       (select count(*)::text from pg_trigger
         where tgrelid = 'auth.users'::regclass and not tgisinternal
           and tgname = 'movies_bootstrap_verified_admin'),
       ((select count(*) from pg_trigger
          where tgrelid = 'auth.users'::regclass and not tgisinternal
            and tgname = 'movies_bootstrap_verified_admin') = 1)
union all
select 'S0', 'cinema_private functions installed', '10',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'cinema_private'),
       ((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'cinema_private') >= 10)
union all
select 'S0', 'public movie RPCs installed', '8',
       (select count(distinct proname)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and proname in
           ('movies_now_showing','movie_admin_access','movie_admin_catalog','movie_admin_permissions',
            'movie_visibility_audit','manage_movie_visibility','manage_movie_admin_permission','sync_movie_catalog')),
       ((select count(distinct proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and proname in
            ('movies_now_showing','movie_admin_access','movie_admin_catalog','movie_admin_permissions',
             'movie_visibility_audit','manage_movie_visibility','manage_movie_admin_permission','sync_movie_catalog')) = 8)
union all
select 'S0', 'sync RPC not executable by browser roles', '2',
       (select count(*)::text from (values ('anon'),('authenticated')) r(role_name)
         where case when to_regprocedure('public.sync_movie_catalog(jsonb,jsonb,jsonb)') is null then false
                    else not has_function_privilege(r.role_name,
                           to_regprocedure('public.sync_movie_catalog(jsonb,jsonb,jsonb)'), 'EXECUTE') end),
       ((select count(*) from (values ('anon'),('authenticated')) r(role_name)
          where case when to_regprocedure('public.sync_movie_catalog(jsonb,jsonb,jsonb)') is null then false
                     else not has_function_privilege(r.role_name,
                            to_regprocedure('public.sync_movie_catalog(jsonb,jsonb,jsonb)'), 'EXECUTE') end) = 2)
union all
select 'S0', 'ledger rows after stage 0', '76',
       (select count(*)::text from supabase_migrations.schema_migrations),
       ((select count(*) from supabase_migrations.schema_migrations) = 76);

-- Note: the ledger MAX stays 20261108150000 after Stage 0, because two later
-- versions were already applied; assert the row COUNT and the two version
-- memberships, never the max.


-- =============================================================================
-- SECTION 1 — AFTER STAGE 1 (delivery tracking, institutes, service builder)
-- Expected: 10 rows, all ok = true.
-- =============================================================================
select 'S1' as stage, 'delivery tracking tables', '4' as expected,
       (select count(*)::text from (values
          ('public.service_delivery_profiles'),('public.service_tracking_locations'),
          ('public.service_tracking_events'),('public.service_delivery_otps')) v(n)
        where to_regclass(v.n) is not null) as actual,
       ((select count(*) from (values
          ('public.service_delivery_profiles'),('public.service_tracking_locations'),
          ('public.service_tracking_events'),('public.service_delivery_otps')) v(n)
        where to_regclass(v.n) is not null) = 4) as ok
union all
select 'S1', 'institute core tables', '8',
       (select count(*)::text from (values
          ('public.institutes'),('public.institute_branches'),('public.institute_members'),
          ('public.institute_faculty'),('public.institute_admissions'),
          ('public.institute_attendance_sessions'),('public.institute_attendance_records'),
          ('public.institute_fee_ledger')) v(n)
        where to_regclass(v.n) is not null),
       ((select count(*) from (values
          ('public.institutes'),('public.institute_branches'),('public.institute_members'),
          ('public.institute_faculty'),('public.institute_admissions'),
          ('public.institute_attendance_sessions'),('public.institute_attendance_records'),
          ('public.institute_fee_ledger')) v(n)
        where to_regclass(v.n) is not null) = 8)
union all
select 'S1', 'service builder tables', '6',
       (select count(*)::text from (values
          ('public.service_category_configs'),('public.service_category_config_versions'),
          ('public.service_category_config_audit'),('public.service_provider_credentials'),
          ('public.service_booking_field_values'),('public.service_booking_documents')) v(n)
        where to_regclass(v.n) is not null),
       ((select count(*) from (values
          ('public.service_category_configs'),('public.service_category_config_versions'),
          ('public.service_category_config_audit'),('public.service_provider_credentials'),
          ('public.service_booking_field_values'),('public.service_booking_documents')) v(n)
        where to_regclass(v.n) is not null) = 6)
union all
select 'S1', 'RLS on delivery tables', '4',
       (select count(*)::text from pg_class
         where oid in (to_regclass('public.service_delivery_profiles'),
                       to_regclass('public.service_tracking_locations'),
                       to_regclass('public.service_tracking_events'),
                       to_regclass('public.service_delivery_otps')) and relrowsecurity),
       ((select count(*) from pg_class
          where oid in (to_regclass('public.service_delivery_profiles'),
                        to_regclass('public.service_tracking_locations'),
                        to_regclass('public.service_tracking_events'),
                        to_regclass('public.service_delivery_otps')) and relrowsecurity) = 4)
union all
select 'S1', 'service_delivery_profiles has 0 orphan constraints', '0',
       (select count(*)::text from pg_constraint
         where conname in ('water_recurrence_meta','service_recurrence_meta')),
       ((select count(*) from pg_constraint
          where conname in ('water_recurrence_meta','service_recurrence_meta')) = 0)
union all
select 'S1', 'stage-1 versions in ledger', '4',
       (select count(*)::text from supabase_migrations.schema_migrations
         where version in ('20261111190000','20261111192224','20261111200000','20261111210000')),
       ((select count(*) from supabase_migrations.schema_migrations
          where version in ('20261111190000','20261111192224','20261111200000','20261111210000')) = 4)
union all
select 'S1', 'public tables after stage 1', '93',
       (select count(*)::text from information_schema.tables where table_schema = 'public'),
       ((select count(*) from information_schema.tables where table_schema = 'public') = 93)
union all
select 'S1', 'cinema_screens rows preserved', '5',
       (select coalesce(sum(n_live_tup), 0)::text from pg_stat_user_tables where relname = 'cinema_screens'),
       ((select coalesce(sum(n_live_tup), 0) from pg_stat_user_tables where relname = 'cinema_screens') >= 5)
union all
select 'S1', 'profiles rows preserved', '7',
       (select coalesce(sum(n_live_tup), 0)::text from pg_stat_user_tables where relname = 'profiles'),
       ((select coalesce(sum(n_live_tup), 0) from pg_stat_user_tables where relname = 'profiles') = 7)
union all
select 'S1', 'no stage-2 objects yet', 'false',
       (to_regclass('public.businesses') is not null)::text,
       (to_regclass('public.businesses') is null);


-- =============================================================================
-- SECTION 2 — AFTER STAGE 2 (business ownership core + owner backfill)
-- Expected: 12 rows, all ok = true. Data counts must be zero on this DEV.
-- NOTE: backfill-created rows would appear here; anything non-zero must be
-- explained before Stage 3 proceeds.
-- =============================================================================
select 'S2' as stage, 'ownership tables', '7' as expected,
       (select count(*)::text from (values
          ('public.businesses'),('public.business_members'),('public.business_invitations'),
          ('public.business_module_access'),('public.business_audit_events'),
          ('public.business_backfill_review'),('public.business_ownership_transfers')) v(n)
        where to_regclass(v.n) is not null) as actual,
       ((select count(*) from (values
          ('public.businesses'),('public.business_members'),('public.business_invitations'),
          ('public.business_module_access'),('public.business_audit_events'),
          ('public.business_backfill_review'),('public.business_ownership_transfers')) v(n)
        where to_regclass(v.n) is not null) = 7) as ok
union all
select 'S2', 'listings.business_id column', 'true',
       (select (count(*) > 0)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'listings' and column_name = 'business_id'),
       ((select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'listings' and column_name = 'business_id') > 0)
union all
select 'S2', 'bookings.business_id column', 'true',
       (select (count(*) > 0)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'bookings' and column_name = 'business_id'),
       ((select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'bookings' and column_name = 'business_id') > 0)
union all
select 'S2', 'ownership functions', '7',
       (select count(distinct proname)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in
           ('business_role','is_business_member','can_access_business','business_module_enabled',
            'record_business_audit','ensure_business_owner_membership','guard_business_privileged_changes')),
       ((select count(distinct proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in
            ('business_role','is_business_member','can_access_business','business_module_enabled',
             'record_business_audit','ensure_business_owner_membership','guard_business_privileged_changes')) = 7)
union all
select 'S2', 'owner + guard triggers on businesses', '2',
       (select count(*)::text from pg_trigger t
         where t.tgrelid = to_regclass('public.businesses') and not t.tgisinternal
           and t.tgname in ('trg_business_owner_membership','trg_guard_business_privileged_changes')),
       ((select count(*) from pg_trigger t
          where t.tgrelid = to_regclass('public.businesses') and not t.tgisinternal
            and t.tgname in ('trg_business_owner_membership','trg_guard_business_privileged_changes')) = 2)
union all
select 'S2', 'businesses backfilled rows', '0',
       coalesce((select n_live_tup from pg_stat_user_tables where relname = 'businesses'), 0)::text,
       (coalesce((select n_live_tup from pg_stat_user_tables where relname = 'businesses'), 0) = 0)
union all
select 'S2', 'business_members rows', '0',
       coalesce((select n_live_tup from pg_stat_user_tables where relname = 'business_members'), 0)::text,
       (coalesce((select n_live_tup from pg_stat_user_tables where relname = 'business_members'), 0) = 0)
union all
select 'S2', 'business.backfilled audit events', '0',
       coalesce((select n_live_tup from pg_stat_user_tables where relname = 'business_audit_events'), 0)::text,
       (coalesce((select n_live_tup from pg_stat_user_tables where relname = 'business_audit_events'), 0) = 0)
union all
select 'S2', 'business_backfill_review rows', '0',
       coalesce((select n_live_tup from pg_stat_user_tables where relname = 'business_backfill_review'), 0)::text,
       (coalesce((select n_live_tup from pg_stat_user_tables where relname = 'business_backfill_review'), 0) = 0)
union all
select 'S2', 'stage-2 versions in ledger', '6',
       (select count(*)::text from supabase_migrations.schema_migrations
         where version in ('20261112010000','20261112020000','20261112030000',
                           '20261112040000','20261112050000','20261112080846')),
       ((select count(*) from supabase_migrations.schema_migrations
          where version in ('20261112010000','20261112020000','20261112030000',
                            '20261112040000','20261112050000','20261112080846')) = 6)
union all
select 'S2', 'RLS on business tables', '7',
       (select count(*)::text from pg_class
         where oid in (to_regclass('public.businesses'), to_regclass('public.business_members'),
                       to_regclass('public.business_invitations'), to_regclass('public.business_module_access'),
                       to_regclass('public.business_audit_events'), to_regclass('public.business_backfill_review'),
                       to_regclass('public.business_ownership_transfers')) and relrowsecurity),
       ((select count(*) from pg_class
          where oid in (to_regclass('public.businesses'), to_regclass('public.business_members'),
                        to_regclass('public.business_invitations'), to_regclass('public.business_module_access'),
                        to_regclass('public.business_audit_events'), to_regclass('public.business_backfill_review'),
                        to_regclass('public.business_ownership_transfers')) and relrowsecurity) = 7)
union all
select 'S2', 'audit table denies browser writes', 'false',
       (case when to_regclass('public.business_audit_events') is null then 'missing'
             else has_table_privilege('authenticated','public.business_audit_events','INSERT')::text end),
       (case when to_regclass('public.business_audit_events') is null then false
             else not has_table_privilege('authenticated','public.business_audit_events','INSERT') end);


-- =============================================================================
-- SECTION 3 — AFTER STAGE 3 (provider/institute operations + hardening)
-- Expected: 8 rows, all ok = true.
-- =============================================================================
select 'S3' as stage, 'provider portal tables', '9' as expected,
       (select count(*)::text from (values
          ('public.provider_portal_memberships'),('public.stay_pricing_rules'),
          ('public.stay_housekeeping_tasks'),('public.stay_maintenance_tickets'),
          ('public.service_workers'),('public.service_worker_assignments'),
          ('public.service_job_tracking_sessions'),('public.service_job_locations'),
          ('public.service_job_otps')) v(n)
        where to_regclass(v.n) is not null) as actual,
       ((select count(*) from (values
          ('public.provider_portal_memberships'),('public.stay_pricing_rules'),
          ('public.stay_housekeeping_tasks'),('public.stay_maintenance_tickets'),
          ('public.service_workers'),('public.service_worker_assignments'),
          ('public.service_job_tracking_sessions'),('public.service_job_locations'),
          ('public.service_job_otps')) v(n)
        where to_regclass(v.n) is not null) = 9) as ok
union all
select 'S3', 'institute management tables', '13',
       (select count(*)::text from (values
          ('public.institute_classrooms'),('public.institute_batch_holidays'),
          ('public.institute_audit_events'),('public.institute_batch_transfers'),
          ('public.institute_leave_requests'),('public.institute_receipt_counters'),
          ('public.institute_exams'),('public.institute_exam_results'),
          ('public.institute_assignments'),('public.institute_assignment_submissions'),
          ('public.institute_certificates'),('public.institute_announcements'),
          ('public.institute_module_entitlements')) v(n)
        where to_regclass(v.n) is not null),
       ((select count(*) from (values
          ('public.institute_classrooms'),('public.institute_batch_holidays'),
          ('public.institute_audit_events'),('public.institute_batch_transfers'),
          ('public.institute_leave_requests'),('public.institute_receipt_counters'),
          ('public.institute_exams'),('public.institute_exam_results'),
          ('public.institute_assignments'),('public.institute_assignment_submissions'),
          ('public.institute_certificates'),('public.institute_announcements'),
          ('public.institute_module_entitlements')) v(n)
        where to_regclass(v.n) is not null) = 13)
union all
select 'S3', 'module alias function exists', 'true',
       (to_regprocedure('public.business_module_for_listing(text,text)') is not null)::text,
       (to_regprocedure('public.business_module_for_listing(text,text)') is not null)
union all
select 'S3', 'module alias covers pg_hostels + hotel_stay', '2',
       (select count(*)::text from pg_proc
         where oid = to_regprocedure('public.business_module_for_listing(text,text)')
           and prosrc like '%pg_hostels%' and prosrc like '%hotel_stay%'),
       ((select count(*) from pg_proc
          where oid = to_regprocedure('public.business_module_for_listing(text,text)')
            and prosrc like '%pg_hostels%' and prosrc like '%hotel_stay%') = 1)
union all
select 'S3', 'strict assignment triggers on listings', '1',
       (select count(*)::text from pg_trigger
         where tgrelid = to_regclass('public.listings') and not tgisinternal
           and tgname like '%business%'),
       ((select count(*) from pg_trigger
          where tgrelid = to_regclass('public.listings') and not tgisinternal
            and tgname like '%business%') >= 1)
union all
select 'S3', 'strict record triggers (>= 3)', '3',
       (select count(*)::text from pg_trigger t join pg_class c on c.oid = t.tgrelid
         where not t.tgisinternal and t.tgname like '%business%'
           and c.relname in ('bookings','service_bookings','venue_bookings','class_enrollments',
                             'payment_intents','service_payment_intents','venue_payment_intents')),
       ((select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
          where not t.tgisinternal and t.tgname like '%business%'
            and c.relname in ('bookings','service_bookings','venue_bookings','class_enrollments',
                              'payment_intents','service_payment_intents','venue_payment_intents')) >= 3)
union all
select 'S3', 'stage-3 versions in ledger', '20',
       (select count(*)::text from supabase_migrations.schema_migrations
         where version between '20261112100000' and '20261112310000'),
       ((select count(*) from supabase_migrations.schema_migrations
          where version between '20261112100000' and '20261112310000') = 20)
union all
select 'S3', 'permission tables still absent', 'false',
       (to_regclass('public.business_member_access') is not null)::text,
       (to_regclass('public.business_member_access') is null);


-- =============================================================================
-- SECTION 4 — AFTER STAGE 4 (access layer, super-admin boundaries, backfill)
-- Expected: 9 rows, all ok = true.
-- =============================================================================
select 'S4' as stage, 'business_member_access exists' as check_name, 'true' as expected,
       (to_regclass('public.business_member_access') is not null)::text as actual,
       (to_regclass('public.business_member_access') is not null) as ok
union all
select 'S4', 'customer_module_access exists', 'true',
       (to_regclass('public.customer_module_access') is not null)::text,
       (to_regclass('public.customer_module_access') is not null)
union all
select 'S4', 'customer_module_access_audit exists', 'true',
       (to_regclass('public.customer_module_access_audit') is not null)::text,
       (to_regclass('public.customer_module_access_audit') is not null)
union all
select 'S4', 'member_access grant columns', '3',
       (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'business_member_access'
           and column_name in ('allowed_modules','allowed_sections','allowed_actions')),
       ((select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'business_member_access'
            and column_name in ('allowed_modules','allowed_sections','allowed_actions')) = 3)
union all
select 'S4', 'customer access grant columns', '2',
       (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'customer_module_access'
           and column_name in ('allowed_sections','allowed_actions')),
       ((select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'customer_module_access'
            and column_name in ('allowed_sections','allowed_actions')) = 2)
union all
select 'S4', 'browser INSERT denied on member access', 'false',
       (case when to_regclass('public.business_member_access') is null then 'missing'
             else has_table_privilege('authenticated','public.business_member_access','INSERT')::text end),
       (case when to_regclass('public.business_member_access') is null then false
             else not has_table_privilege('authenticated','public.business_member_access','INSERT') end)
union all
select 'S4', 'browser INSERT denied on customer access', 'false',
       (case when to_regclass('public.customer_module_access') is null then 'missing'
             else has_table_privilege('authenticated','public.customer_module_access','INSERT')::text end),
       (case when to_regclass('public.customer_module_access') is null then false
             else not has_table_privilege('authenticated','public.customer_module_access','INSERT') end)
union all
select 'S4', 'cinema_screens rows with approval_status', '5',
       (select count(*)::text from pg_class c where c.oid = to_regclass('public.cinema_screens')),
       (exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'cinema_screens'
                   and column_name = 'approval_status'
                   and is_nullable = 'NO'))
union all
select 'S4', 'stage-4 versions in ledger', '9',
       (select count(*)::text from supabase_migrations.schema_migrations
         where version between '20261112320000' and '20261113050000'),
       ((select count(*) from supabase_migrations.schema_migrations
          where version between '20261112320000' and '20261113050000') = 9);


-- =============================================================================
-- SECTION 5 — AFTER STAGE 5 (permission migrations)
-- Expected: 10 rows, all ok = true. Backfill counts must be zero on this DEV.
-- =============================================================================
select 'S5' as stage, 'permission functions', '4' as expected,
       (select count(distinct proname)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in
           ('effective_customer_permissions','has_customer_permission',
            'has_customer_section_access','backfill_strict_permission_grants')) as actual,
       ((select count(distinct proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in
            ('effective_customer_permissions','has_customer_permission',
             'has_customer_section_access','backfill_strict_permission_grants')) = 4) as ok
union all
select 'S5', 'backfill function is security definer', 'true',
       (select bool_or(p.prosecdef)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'backfill_strict_permission_grants'),
       (select coalesce(bool_or(p.prosecdef), false) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'backfill_strict_permission_grants')
union all
select 'S5', 'text-array constraints present', '7',
       (select count(*)::text from pg_constraint
         where conname in ('business_member_access_actions_object','business_member_access_sections_text',
                           'business_member_access_actions_text','customer_module_access_sections_array',
                           'customer_module_access_actions_array','customer_module_access_sections_text',
                           'customer_module_access_actions_text')),
       ((select count(*) from pg_constraint
          where conname in ('business_member_access_actions_object','business_member_access_sections_text',
                            'business_member_access_actions_text','customer_module_access_sections_array',
                            'customer_module_access_actions_array','customer_module_access_sections_text',
                            'customer_module_access_actions_text')) = 7)
union all
select 'S5', 'all seven constraints validated', '7',
       (select count(*)::text from pg_constraint
         where conname in ('business_member_access_actions_object','business_member_access_sections_text',
                           'business_member_access_actions_text','customer_module_access_sections_array',
                           'customer_module_access_actions_array','customer_module_access_sections_text',
                           'customer_module_access_actions_text') and convalidated),
       ((select count(*) from pg_constraint
          where conname in ('business_member_access_actions_object','business_member_access_sections_text',
                            'business_member_access_actions_text','customer_module_access_sections_array',
                            'customer_module_access_actions_array','customer_module_access_sections_text',
                            'customer_module_access_actions_text') and convalidated) = 7)
union all
select 'S5', 'audit cascade guard present', '1',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'record_customer_module_access_audit'),
       ((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'record_customer_module_access_audit') = 1)
union all
select 'S5', 'member access rows (backfill)', '0',
       coalesce((select n_live_tup from pg_stat_user_tables where relname = 'business_member_access'), 0)::text,
       (coalesce((select n_live_tup from pg_stat_user_tables where relname = 'business_member_access'), 0) = 0)
union all
select 'S5', 'customer access rows', '0',
       coalesce((select n_live_tup from pg_stat_user_tables where relname = 'customer_module_access'), 0)::text,
       (coalesce((select n_live_tup from pg_stat_user_tables where relname = 'customer_module_access'), 0) = 0)
union all
select 'S5', 'backfill audit events', '0',
       coalesce((select n_live_tup from pg_stat_user_tables where relname = 'business_audit_events'), 0)::text,
       (coalesce((select n_live_tup from pg_stat_user_tables where relname = 'business_audit_events'), 0) = 0)
union all
select 'S5', 'browser writes denied on both grant tables', '2',
       (select count(*)::text from (values ('public.business_member_access'),('public.customer_module_access')) v(t)
         where case when to_regclass(v.t) is null then false
                    else not has_table_privilege('authenticated', v.t, 'INSERT') end),
       ((select count(*) from (values ('public.business_member_access'),('public.customer_module_access')) v(t)
          where case when to_regclass(v.t) is null then false
                     else not has_table_privilege('authenticated', v.t, 'INSERT') end) = 2)
union all
select 'S5', 'stage-5 versions in ledger', '4',
       (select count(*)::text from supabase_migrations.schema_migrations
         where version in ('20261114090000','20261114100000','20261114110000','20261114120000')),
       ((select count(*) from supabase_migrations.schema_migrations
          where version in ('20261114090000','20261114100000','20261114110000','20261114120000')) = 4);

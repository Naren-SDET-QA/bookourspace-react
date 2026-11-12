# Business Ownership Rollback Plan (Local)

1. Stop the local app and take a new `pg_dump -Fc` backup.
2. Verify the target is the local database only (`127.0.0.1:55440/bookourspace_dev`). Never run this against hosted Supabase.
3. Run `supabase/rollback/20261112_business_ownership_rollback.sql` inside the transaction provided; it drops business-scoped policies, triggers, functions, `business_id` columns and the business tables.
4. Reapply the legacy provider/owner policies from `supabase/schema_and_rls.sql` and the migrations that follow it if the rollback is being used to return to the pre-Phase-1 schema.
5. Restart the app and verify public listings, PG bookings, services, stays, venues and movies still load.
6. Verify the two provider review rows and all original listings/bookings/payments counts are unchanged after restore.
7. Delete the local `_dev_migrations` rows for phases 2 and 3 only if the database is being rebuilt from scratch; Phase 1 and 2/3 are one logical feature and should normally be rolled back together.

Rollback does **not** delete original profiles, listings, bookings, payments or media. It only removes the new business ownership layer.


## Phase 4–5 additions

The rollback also drops invoice/enquiry/contact/payment-claim policies and the `business_ownership_transfers` table. A cloned-database rollback test passed with original profile/listing counts preserved.


## Target port note

The target rollback also drops the Institute business column and restores the prior institute RLS policies. Legacy null-business compatibility policies must be dropped before the business tables/functions. A fresh-clone rollback should be run after taking a new backup.

# Business ownership rollback runbook

Recovery procedure for the business-ownership migration block
(`20261112010000` … `20261112300000`). Companion to
`supabase/rollback/20261112_business_ownership_rollback.sql`.

Read this before running anything against a hosted project. Nothing in this
runbook is automatic: applying or reverting schema changes requires explicit
owner approval.

## What "rollback" means here

The block has two very different halves:

| Half | Reverting it | Data at risk |
| --- | --- | --- |
| **Access** — 24 legacy RLS policies removed by phases 3 and 4, write-time business triggers, `listings.business_id NOT NULL` | Fully scripted in `20261112_business_ownership_rollback.sql` | None |
| **Model** — `businesses`, `business_members`, `business_*`, `business_id` columns | Not scripted. Optional, destructive, documented as section 5 of the SQL file | Business rows, memberships, audit history, `business_id` values |

The recovery script reverts the access half only. Every business row, membership,
module grant, audit event and `business_id` value is preserved, so the block can
be re-applied later without data loss. That is the recommended path: restoring
access is cheap, re-creating business data is not.

## Preconditions

1. Written approval from the project owner for this specific change.
2. Target confirmed as `obkfgxjzlscungkhbyvq` through
   `supabase/tests/lib/bos_target_guard.sh` (`BOS_APPROVED_REF`).
3. Verified backup, and a restore test into a scratch database:
   `supabase db dump --db-url "$URL" -f backup_pre_rollback.sql`.
4. Migration checksums still match: `node supabase/tests/migration_manifest.mjs`
   must print PASS.
5. A quiet window: the script locks policy definitions and briefly rewrites the
   trigger set on twelve tables.

## Procedure

```bash
# 1. Prove the target
BOS_APPROVED_REF=obkfgxjzlscungkhbyvq bash supabase/tests/lib/bos_target_guard.sh

# 2. Verify integrity of what you are about to revert from
node supabase/tests/migration_manifest.mjs

# 3. Take the backup and restore-test it before touching the project
supabase db dump --db-url "$URL" -f backup_pre_rollback.sql

# 4. Revert access atomically. -1 is mandatory: the file has no inner
#    BEGIN/COMMIT, so this flag is what makes the change all-or-nothing.
psql -1 -v ON_ERROR_STOP=1 "$URL" \
  -f supabase/rollback/20261112_business_ownership_rollback.sql
```

Do not run the file with a bare `psql -f`, and do not paste it into a console in
pieces: a half-applied policy swap is an outage on the booking and listing reads.

## Verification

Run the queries in section 4 of the SQL file. Expected results:

| Check | Expected |
| --- | --- |
| Legacy policies restored | 24 |
| Business-scoped policy names left on the 13 tables | 0 |
| `listings.business_id` nullable | `YES` |
| `count(*) from public.businesses` | unchanged from before the rollback |
| `count(*) from public.listings where business_id is not null` | unchanged |

Behavioural smoke test on the restored state: a customer reads their own
bookings, a provider reads bookings for their listings and their own listings,
anonymous visitors see active listings, and stay discovery returns active
properties again.

## What the script does not cover

* `institutes.business_id`, `institute_members.business_id` and the institute
  RLS written by `20261112140000` / `20261112270000`. The institute workspace is
  a new feature with no pre-migration state to return to; its data and policies
  stay as they are and keep working because the business helper functions
  survive the rollback.
* Provider-portal tables (`provider_portal_memberships`, `stay_pricing_rules`,
  `stay_housekeeping_tasks`, `stay_maintenance_tickets`, `service_workers`).
  Independent feature, untouched.
* Section 5 of the SQL file (dropping the 18 `business_id` columns and the eight
  business tables). Destructive and disabled; use it only when abandoning the
  ownership model permanently, after archiving the tables to CSV.

## Re-applying after a rollback

The ownership migrations are idempotent (`if not exists`, `drop … if exists`,
deterministic `business_ref` values), so the normal path is simply to re-run them
in order after the cause of the rollback is fixed. New listings created while the
rollback was in force have `business_id = NULL`; `20261112230000` reassigns them
before it enforces `NOT NULL`, so no manual backfill is needed.

## Evidence this procedure was rehearsed

The script was executed against the local development database inside an explicit
transaction and rolled back (no committed change). Result of that rehearsal:
24 legacy policies present, 0 business-scoped policy names remaining on the 13
tables, `listings.business_id` nullable, 54 business rows untouched.

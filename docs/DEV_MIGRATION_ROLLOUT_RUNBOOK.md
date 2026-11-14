# DEV Migration Rollout Runbook — BookOurSpace

Target: **`obkfgxjzlscungkhbyvq`** (`React`, Mumbai `ap-south-1`, PostgreSQL 17.11)
Never touch: `zykxneztahxbjduagutv` (wrong database), `ezrxykyocgbolpaebnqx` (stale Stockholm).

Status of this document: **preflight only**. Nothing in it has been executed. Each stage needs its own written approval before an operator runs it.

---

## 1. Verified baseline (re-validated at preflight)

| Check | Value | Source |
|---|---|---|
| Project ref | `obkfgxjzlscungkhbyvq`, org `xmdplhsezwoxmoxkciow`, region South Asia (Mumbai) | `supabase projects list` |
| PostgreSQL | 17.11, database `postgres` | `current_setting('server_version')` |
| Ledger rows / max | **74** / **`20261108150000`** | `supabase migration list --project-ref obkfgxjzlscungkhbyvq` |
| Unapplied | **45** | same |
| Public tables | 75 | `information_schema.tables` |
| Policies | 141 | `pg_policies` |
| `businesses`, `business_member_access`, `customer_module_access`, `movie_theatres`, `cinema_private.*` | all absent | `to_regclass` |
| Data volume | profiles 7, listings 0, bookings 0, stay/venue/service/class rows 0, cinema_screens 5, one super-admin | counts |
| Repo | branch `dev`, HEAD `980cb6e`, tree clean apart from the five provider-redesign files and `e2e-artifacts/` | `git status` |

The 45 unapplied versions are a contiguous tail (`20261111190000` → `20261114120000`) plus a two-version hole at `20261102124513`, `20261102142141`. No remote-only versions exist; DEV is otherwise a clean prefix of the repository.

## 2. Preconditions (all must be true before Stage 0)

1. **Written approval for the stage**, recorded in the change ticket (see §7).
2. **Operator DB access**: a Postgres connection string for DEV supplied via `BOS_DEV_DB_URL` (env or password manager). The Freebuff Supabase integration cannot do this — it returns 403 for this project; the CLI session (`supabase` logged in as org `xmdplhsezwoxmoxkciow`) can read.
3. **No credentials in the repo.** Do not write the URL, password or service-role key into any file, commit, log or chat.
4. **Verified backup** from §4, less than 2 hours old, restore-tested.
5. **Deployment freeze** in effect per §8.
6. `psql` ≥ 16 available locally; `supabase` CLI available for read-only verification.

## 3. Transaction and timeout mechanism

Two file shapes exist in the 45; both must be applied atomically.

- **Self-transactional files** (contain `begin; … commit;`): 14 of 45 — `20261102124513`, `20261102142141`, `20261111200000`, `20261111210000`, `20261112080846`, `20261112260000`, `20261113000000`, `20261113010000`, `20261113040000`, `20261113050000`, `20261114090000`, `20261114100000`, `20261114110000`, `20261114120000`. Run them **without** `--single-transaction`; the file owns its transaction and a failure rolls back on disconnect.
- **All other files**: run with `psql --single-transaction`.

Never pass `--single-transaction` to a file with its own `begin;`/`commit;` — the inner `COMMIT` would end the outer transaction and the remainder would autocommit.

```bash
# Run from the repository root. Export these in the operator shell only.
export BOS_DEV_DB_URL='postgresql://postgres@db.obkfgxjzlscungkhbyvq.supabase.co:5432/postgres?sslmode=require'
export PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s'

apply() {
  local f="supabase/migrations/$1"
  [ -f "$f" ] || { echo "MISSING FILE: $f" >&2; return 1; }
  if grep -qiE '^[[:space:]]*begin;' "$f"; then
    echo "== $1 (self-transactional)"
    psql "$BOS_DEV_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
  else
    echo "== $1 (wrapped)"
    psql "$BOS_DEV_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$f"
  fi
}

apply_stage() { for v in "$@"; do apply "$v" || { echo "STOP: failed at $v"; return 1; }; done; }
```

Timeout semantics: `lock_timeout=5s` aborts rather than queueing behind a long transaction; `statement_timeout=120s` bounds each statement. Both are session settings supplied through `PGOPTIONS`, so they apply to every statement including those inside self-transactional files.

## 4. Mandatory pre-stage backup

Run before **Stage 0** and again before **Stage 2**, **Stage 4** and **Stage 5** (stages that add columns to live tables or change grants).

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$HOME/bos-dev-backups"          # outside the repository
mkdir -p "$BACKUP_DIR"
pg_dump "$BOS_DEV_DB_URL" \
  --format=custom --no-owner --no-privileges \
  --file "$BACKUP_DIR/bos-dev-$TS.dump"
sha256sum "$BACKUP_DIR/bos-dev-$TS.dump" > "$BACKUP_DIR/bos-dev-$TS.dump.sha256"
pg_restore -l "$BACKUP_DIR/bos-dev-$TS.dump" | head -20   # sanity: TOC readable
```

Requirements:

- Backup lives outside the repo and outside any synced folder that stores secrets.
- Record the file name, size, sha256 and UTC timestamp in the change ticket.
- **Restore test is mandatory** (§5). A dump that has not been restored is not a backup.

## 5. Restore test into a scratch database

Use a disposable local Postgres (Docker or a local cluster), never DEV.

```bash
SCRATCH=postgresql://postgres@127.0.0.1:55432/bos_restore_test   # local throwaway cluster; PGPASSWORD supplied by the operator
createdb -h 127.0.0.1 -p 55432 -U postgres bos_restore_test
pg_restore --no-owner --no-privileges --exit-on-error -d "$SCRATCH" "$BACKUP_DIR/bos-dev-$TS.dump"

psql "$SCRATCH" -v ON_ERROR_STOP=1 -c "
  select (select count(*) from information_schema.tables where table_schema='public') as public_tables,
         (select count(*) from supabase_migrations.schema_migrations) as ledger_rows,
         (select max(version) from supabase_migrations.schema_migrations) as ledger_max,
         (select count(*) from pg_policies where schemaname='public') as policies,
         (select count(*) from auth.users) as auth_users;"
```

Expected immediately before Stage 0: `public_tables = 75`, `ledger_rows = 74`, `ledger_max = 20261108150000`, `policies = 141`. Any mismatch means the dump is not a faithful copy — stop and re-take it.

A restore that completes but reports missing extensions (`pg_trgm`, `pgcrypto`) or `auth` schema objects is expected on a plain local cluster; treat only `--exit-on-error` failures and the four counts as pass/fail.

## 6. Stages

Every stage: apply in the listed order, then run the matching section of `docs/DEV_MIGRATION_STAGE_VERIFICATION.sql`, then record the result. A stage is complete only when all its checks return `ok = true`.

Two standing rules for every stage:

- **Exact filenames only.** No globs, no `--include-all`, no `supabase db push`. A stage's approval covers the files listed under that stage and nothing else.
- **One stage, one approval.** Applying Stage 1 without its own approval is a process violation even if Stage 0 succeeded.

### Stage 0 — repair the two-version hole (2 files)

```
20261102124513_movie_visibility_management.sql
20261102142141_movie_tamil_nadu.sql
```

```bash
apply_stage 20261102124513_movie_visibility_management.sql 20261102142141_movie_tamil_nadu.sql
```

Creates `movie_theatres`, `movie_titles`, `movie_showtimes`; schema `cinema_private` with `admin_permissions`, `audit_log`, `bootstrap_admins`; 10 functions in `cinema_private` and 8 in `public` (`movies_now_showing`, `movie_admin_access`, `movie_admin_catalog`, `movie_admin_permissions`, `movie_visibility_audit`, `manage_movie_visibility`, `manage_movie_admin_permission`, `sync_movie_catalog`); a trigger on `auth.users` that grants super-admin to four seeded bootstrap emails after first email verification; two **restrictive** SELECT policies (`movie_screen_visibility_guard` on `cinema_screens`, `movie_listing_visibility_guard` on `listings`); the Tamil Nadu CHECK widening.

**Stage 0 is not inert.** Two facts that must be in the approval:

1. Current application code **already calls** these RPCs (`src/server/movieRoutes.ts`: `movies_now_showing`, `movie_admin_access`, `movie_admin_catalog`, `manage_movie_visibility`, `movie_visibility_audit`, `movie_admin_permissions`). On today's DEV they fail as missing functions. Stage 0 makes the movies read/admin endpoints answer instead of error.
2. The restrictive policies change who can read two existing tables directly through PostgREST. `cinema_screens` currently allows `using (true)` to `anon, authenticated`; after Stage 0 only cinema admins can read it, and `movie-*` / `sectionType = 'movies'` listings become admin-only. The application reads both tables through the table-owner pool (`src/server/providerListingRepository.ts` explicitly `RESET ROLE` for this reason, and `src/server/moviesShowtimesApi.ts` reads via `deps.pool`), so server-rendered pages are unaffected — but any direct anon/authenticated query, and the existing `Cinema screens are public discovery data` policy, stop returning rows.

**Pre-flight assertions for Stage 0** (all verified `true` on DEV at review time):

```sql
select has_table_privilege('auth.users','TRIGGER')      as can_trigger_auth_users,   -- true
       has_table_privilege('auth.users','REFERENCES')   as can_reference_auth_users, -- true
       to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null as realtime_send; -- true
```

**Isolation**: run the two files by exact filename. Never pass a glob, `$(ls supabase/migrations/*.sql)`, or a directory to the apply helper — Stage 0 approval covers exactly two files. Assert the count first:

```bash
ls supabase/migrations/20261102124513_movie_visibility_management.sql \
   supabase/migrations/20261102142141_movie_tamil_nadu.sql | wc -l   # must print 2
```

**Stop conditions**: any `42P07` (object already exists) or `42P01` — the preflight says those objects are absent, so either means an out-of-band change; stop and re-audit. `42501` on `create trigger ... on auth.users` or on the `auth.users` foreign keys means the executing role differs from the one verified above; stop. A `cinema_screens` policy error means the guarded block needs review before retry. The file is **not** re-runnable: tables and policies are created without `IF NOT EXISTS`/`DROP`, so a partially applied attempt is recovered by restore (§ rollback runbook §7), never by re-running.

### Stage 1 — delivery tracking, institutes, service builder (4 files)

```
20261111190000_universal_delivery_tracking.sql
20261111192224_institute_owner_workspace.sql
20261111200000_dynamic_service_category_builder.sql
20261111210000_service_document_storage_access.sql
```

```bash
apply_stage 20261111190000_universal_delivery_tracking.sql \
            20261111192224_institute_owner_workspace.sql \
            20261111200000_dynamic_service_category_builder.sql \
            20261111210000_service_document_storage_access.sql
```

Adds 4 delivery/tracking tables, 8 `institute_*` tables, 6 service-category/credential tables, storage policies.

**Stop conditions**: constraint-recreation failure in `20261111200000` (drops and re-adds two constraints on `service_delivery_profiles` created minutes earlier — a failure here means the create in `20261111190000` produced an unexpected shape); any policy name collision.

### Stage 2 — business ownership core (6 files)

```
20261112010000_business_ownership_phase1.sql
20261112020000_business_ownership_phase2_backfill.sql
20261112030000_business_ownership_phase3_rls.sql
20261112040000_business_ownership_phase4_rls.sql
20261112050000_business_ownership_phase5_transfer.sql
20261112080846_admin_stay_production_hardening.sql
```

```bash
apply_stage 20261112010000_business_ownership_phase1.sql \
            20261112020000_business_ownership_phase2_backfill.sql \
            20261112030000_business_ownership_phase3_rls.sql \
            20261112040000_business_ownership_phase4_rls.sql \
            20261112050000_business_ownership_phase5_transfer.sql \
            20261112080846_admin_stay_production_hardening.sql
```

Creates `businesses`, `business_members`, `business_invitations`, `business_module_access`, `business_audit_events`, `business_backfill_review`, `business_ownership_transfers`; adds `business_id` to `listings`, `bookings`, `provider_registration_requests`; rebuilds 35+ policies; **`12020000` performs the owner backfill**.

Backfill expected result on this DEV: **zero businesses** (0 listings, 0 bookings), therefore zero members, zero module rows, zero `business.backfilled` audit events, and `business_backfill_review` empty. Any non-zero count must be explained before Stage 3.

**Stop conditions**: `12020000` inserting rows (unexpected data), `23503`/`23505` during the backfill, or a policy build failure in `12030000`/`12040000`.

### Stage 3 — provider/institute operations and hardening (20 files)

```
20261112100000_provider_portal_operations.sql
20261112130000_institute_management_complete.sql
20261112140000_institute_business_scope.sql
20261112150000_business_legacy_null_fallbacks.sql
20261112160000_business_legacy_listing_fallbacks.sql
20261112170000_business_anon_listing_policy.sql
20261112180000_business_admin_insert_policy.sql
20261112190000_pin_service_booking_guard_search_path.sql
20261112200000_business_function_privileges.sql
20261112210000_business_payment_legacy_fallbacks.sql
20261112220000_drop_duplicate_transfer_audit_trigger.sql
20261112230000_strict_listing_business_assignment.sql
20261112240000_listing_business_function_privileges.sql
20261112250000_business_module_hotels_alias.sql
20261112260000_admin_stay_rpc_finalize.sql
20261112270000_institute_member_business_isolation.sql
20261112280000_strict_record_business_assignment.sql
20261112290000_record_business_function_privileges.sql
20261112300000_payment_claim_business_triggers.sql
20261112310000_final_security_hardening.sql
```

```bash
apply_stage $(printf '%s\n' \
  20261112100000_provider_portal_operations.sql \
  20261112130000_institute_management_complete.sql \
  20261112140000_institute_business_scope.sql \
  20261112150000_business_legacy_null_fallbacks.sql \
  20261112160000_business_legacy_listing_fallbacks.sql \
  20261112170000_business_anon_listing_policy.sql \
  20261112180000_business_admin_insert_policy.sql \
  20261112190000_pin_service_booking_guard_search_path.sql \
  20261112200000_business_function_privileges.sql \
  20261112210000_business_payment_legacy_fallbacks.sql \
  20261112220000_drop_duplicate_transfer_audit_trigger.sql \
  20261112230000_strict_listing_business_assignment.sql \
  20261112240000_listing_business_function_privileges.sql \
  20261112250000_business_module_hotels_alias.sql \
  20261112260000_admin_stay_rpc_finalize.sql \
  20261112270000_institute_member_business_isolation.sql \
  20261112280000_strict_record_business_assignment.sql \
  20261112290000_record_business_function_privileges.sql \
  20261112300000_payment_claim_business_triggers.sql \
  20261112310000_final_security_hardening.sql)
```

Adds 9 provider-portal tables, 13 `institute_*` tables, the strict-assignment triggers, the `business_module_for_listing()` alias function, and the closing privilege revokes.

**Stop condition — hard stop**: `20261112230000`/`12280000` add strict `NOT NULL`/guard triggers on `listings`/`bookings` paths. If they fail, do **not** continue; the app may still write legacy rows without `business_id`. Roll back the stage by restore, then re-plan.

### Stage 4 — access layer and super-admin boundaries (9 files)

```
20261112320000_service_tracking_function_privileges.sql
20261112330000_movies_state_approval.sql
20261112340000_business_member_access.sql
20261113000000_customer_module_access.sql
20261113010000_provider_portal_membership_guard.sql
20261113020000_payment_claim_business_trigger.sql
20261113030000_business_rls_super_admin.sql
20261113040000_legacy_services_provider_backfill.sql
20261113050000_business_creation_super_admin_boundary.sql
```

```bash
apply_stage 20261112320000_service_tracking_function_privileges.sql \
            20261112330000_movies_state_approval.sql \
            20261112340000_business_member_access.sql \
            20261113000000_customer_module_access.sql \
            20261113010000_provider_portal_membership_guard.sql \
            20261113020000_payment_claim_business_trigger.sql \
            20261113030000_business_rls_super_admin.sql \
            20261113040000_legacy_services_provider_backfill.sql \
            20261113050000_business_creation_super_admin_boundary.sql
```

Adds `business_member_access` and `customer_module_access` (+ audit), super-admin RLS, the membership guard, and the legacy service-provider backfill (`13040000`). On this DEV the backfill candidate set is empty (schedules, blackouts, service bookings all 0), so it must insert nothing.

**`12330000`** rewrites `cinema_screens` with `approval_status not null default 'pending'` — 5 rows get the default. Verify the 5 rows survive with a non-null status.

### Stage 5 — the four permission migrations (4 files)

```
20261114090000_module_section_action_grants.sql
20261114100000_permission_rls_hardening.sql
20261114110000_strict_permission_backfill.sql
20261114120000_customer_audit_profile_cascade.sql
```

```bash
apply_stage 20261114090000_module_section_action_grants.sql \
            20261114100000_permission_rls_hardening.sql \
            20261114110000_strict_permission_backfill.sql \
            20261114120000_customer_audit_profile_cascade.sql
```

Creates section/action grants, validates the seven text-array constraints, revokes browser writes on both grant tables, installs `backfill_strict_permission_grants(boolean)` and calls it with **`false`**, and fixes the customer audit cascade.

Because DEV has no active non-owner members, the in-migration backfill call is a no-op (0 rows). The customer-widening path (`true`) is **not** part of this stage and needs separate approval.

## 7. Approval separation

Three distinct approvals, never bundled:

| Approval | Scope | Grants |
|---|---|---|
| **A — DB schema** | Stages 0–4 (41 files, additive DDL, policy rebuilds) | right to change DEV schema; no data mutation beyond the two migration-internal backfills that must insert zero rows |
| **B — Permission stack** | Stage 5 (4 files) | schema + the `false` backfill call inside `20261114110000` |
| **C — Runtime strictness** | app flags `BOS_STRICT_PERMISSION_DEFAULTS=1`, then separately `BOS_STRICT_CUSTOMER_DEFAULTS` | behaviour change only, requires app restart and no DB write |

Additionally, **customer widening** (`backfill_strict_permission_grants(true)`) is a fourth, separate decision that must be requested explicitly with the target customer list.

## 8. Deployment freeze and application compatibility

- **Freeze window**: start 30 minutes before Stage 0, end after Stage 5 verification. No deploys of the DEV app during Stages 0–5.
- **App version**: the running DEV app must correspond to commit `980cb6e` (or later on `dev`). Older builds do not know `business_id`/`businesses` and will write rows that Stage 3's strict-assignment triggers reject.
- **Provider redesign files** (`ProviderPortalShell.tsx`, `ProviderDashboard.tsx`, `PgProviderWorkspace.tsx`, `PgOwnerSimpleDashboard.tsx`, `App.tsx`) are modified but uncommitted. Do **not** deploy them as part of this rollout; if a deploy happens they must be committed and reviewed separately.
- **Compatibility checks before Stage 2**, all read-only against the running app:
  1. Listing creation still writes `listings` without `business_id` (allowed until Stage 3).
  2. Booking creation does not select `business_id`.
  3. No client query selects `businesses`/`business_member_access` (they do not exist yet).
- **Compatibility checks after Stage 4, before enabling flags**: provider portal loads a business, member list renders, customer discovery unaffected, and `authenticated` cannot INSERT into either grant table.
- **Flags** are read from `process.env` at server start (`server.ts`, `strictPermissionDefaults`); a flag change requires an app restart and must be its own step with its own approval.

## 9. Record keeping

Per stage, record in the change ticket: stage number, files applied, start/end UTC, exit status, verification output (all `ok = true`), row counts before/after, and operator name. Keep the backup sha256 alongside. If a stage is aborted, record the failing file, the SQLSTATE and the recovery action from `DEV_MIGRATION_ROLLBACK_RUNBOOK.md`.

## 10. Explicitly out of scope

No `supabase db push`, no `--include-all`, no writes from the Freebuff integration, no flag change, no backfill with `true`, no app deploy, no provider-file commit. Rollout executes only the six stages above, one approval at a time.

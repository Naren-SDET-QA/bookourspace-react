# BookOurSpace — DEV migration final plan (v2)

**Date:** 2026-11-04 · **Target:** `ezrxykyocgbolpaebnqx` · **Repo:** `/Users/aa/Downloads/bookourspace-react`
**Mode:** read-only + local verification. **No hosted migration or configuration change was made.**
**Worktree:** dirty paths preserved; nothing committed, pushed, merged or deployed.

---

## 1. Migration recount — 26 files, no duplicates

The earlier "22" (and the audit's "25") are stale. Current tree:

```
total=26   unique_versions=26   duplicates=0
```

Latest three (added after the previous audit): `20261103250000_pg_admin_disputes_invoices.sql`,
`20261104100000_profiles_private_access.sql`, `20261104110000_google_profile_provision_rpc.sql`,
`20261104120000_admin_provider_activation_rpc.sql`.

**Duplicate versions reconciled:** the two pairs that previously shared a version are now unique —
`20261103200000_class_batches_and_enrollment.sql` + **`20261103201000`**_stay_confirmation_actor_authorization.sql*, and
`20261103210000_pg_booking_lifecycle.sql` + **`20261103211000`**_services_schedule_and_verified_payments.sql*.
A strict `uniq -d` on the version prefix now returns **nothing**.

**Local dry run (throwaway cluster, real baseline):**

```
PASS  migrations applied: 26
PASS  all migrations re-applied cleanly (26)
public tables=51  rls_enabled=51  policies=107  functions=303
DRY RUN PASSED
```

---

## 2. Hosted read-only verification (publishable key only)

| Check | Result | Evidence |
|---|---|---|
| Project reachable | **PASS** | `GET /auth/v1/health` → 200 GoTrue v2.197.0 |
| Key belongs to this project | **PASS** | key accepted by Auth + PostgREST on this host |
| Google provider enabled | **PASS** | `/auth/v1/settings` → `external.google=true` |
| Anonymous sign-in disabled | **PASS** | `external.anonymous_users=false` |
| Email provider disabled | **FAIL** | `external.email=true` |
| Storage buckets | **EMPTY** | `/storage/v1/bucket` → `[]` |
| OpenAPI schema dump | **BLOCKED** | 401 `Secret API key required` (needs a secret/management key) |
| Tables visible via PostgREST | **NOT EXPOSED** | 13/13 → `404 PGRST205` |
| Functions visible via PostgREST | **NOT EXPOSED** | `is_admin`, `is_active_user`, `sweep_expired_stay_holds` → `404 PGRST202` |
| OAuth redirect allowlist | **BLOCKED** | not readable with the publishable key |
| Backup / PITR status | **BLOCKED** | not readable with the publishable key |
| **Actual hosted schema (tables/columns/rows)** | **UNVERIFIED** | requires a DB connection or a secret key |
| **Migration history on the host** | **UNVERIFIED** | same |

### 2.1 PGRST205 does **not** prove the database is empty

`PGRST205` / `PGRST202` mean *"not found in the PostgREST schema cache"*. That happens when a table/function
(a) does not exist, **(b) exists but is not exposed** (`db-schemas` excludes `public`), or **(c) the cache is stale**
(e.g. after a migration without a reload). The publishable key cannot distinguish these. I therefore **do not claim
the DEV database is empty** — it is **unverified**, and the first apply step must prove it with a direct connection.

---

## 3. Database identity verification (required before apply)

Run with the DEV session-pooler URL; **never print the URL**. The username carries the project ref (`postgres.<ref>`).

```sql
-- identity: the project ref must appear in current_user, the DB must be `postgres`
select current_database()                                   as database,
       current_user                                         as db_user,
       (select setting from pg_settings where name='cluster_name') as cluster,
       inet_server_addr()                                   as server_addr,
       (select count(*) from pg_tables  where schemaname='public') as public_tables,
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relrowsecurity)    as rls_tables,
       (select count(*) from pg_policies where schemaname='public') as policies;

show server_version;
select extname from pg_extension order by 1;   -- expect supabase extensions (pgcrypto, pg_stat_statements, ...)
select rolname from pg_roles where rolname in ('anon','authenticated','service_role','authenticator');
```

**Accept only if:** `current_user` contains `ezrxykyocgbolpaebnqx`, the three Supabase roles exist, and
`server_version` is the DEV project's. Otherwise stop.

---

## 4. Backup — evidence produced locally

Scripts: [`scripts/backup_database.sh`](scripts/backup_database.sh), [`scripts/verify_backup_restore.sh`](scripts/verify_backup_restore.sh)
(custom-format dump + plain SQL + role dump + manifest + `SHA256SUMS`, `chmod 700`, refuses `prod` URLs).

| Backup | Tables | RLS | Policies | Checksum | Restore into isolated PG |
|---|---|---|---|---|---|
| `~/BookOurSpace_Backups/20261104T072950Z-local-disposable-evidence` | 44 | 34 | 65 | all `.sha256` **OK** | **VERIFIED** 44/44, 34/34, 65/65 |
| `~/BookOurSpace_Backups/20261104T074410Z-local-26-migrations` | 48 | 38 | 68 | all `.sha256` **OK** | **VERIFIED** 48/48, 38/38, 68/68, 299 functions |

`shasum -a 256 -c SHA256SUMS` → `schema.dump: OK`, `schema.sql: OK`, `globals.sql: OK`, `manifest.txt: OK` for both.

**Hosted DEV backup:** still **BLOCKED** (no connection string). The same two commands will produce it:

```bash
BOS_BACKUP_DATABASE_URL='<dev session pooler URL>' \
  bash scripts/backup_database.sh dev-pre-migration
bash scripts/verify_backup_restore.sh ~/BookOurSpace_Backups/<that-dir>
```

---

## 5. Local revalidation — five booking modules (all green)

| Module | Suite | Result |
|---|---|---|
| Stays | `tests/stay-booking-e2e.test.mjs` | **5/5 PASS** |
| Stays (payment) | `npm run test:db:stay-payments` | **37/37 + 5/5 PASS** |
| Services | `tests/services-booking-e2e.test.mjs` | **6/6 PASS** |
| Venues | `npm run test:db` (venue integration) | **PASS** |
| Classes | `npm run test:db` (classes enrollment) | **PASS** |
| PG | `bash supabase/tests/run_pg_payment_e2e.sh` | **22 checks, 0 blockers** |
| PG (integration) | `bash supabase/tests/run_pg_integration.sh` | **4/4 PASS**, RLS isolation + atomicity + restart verified |
| **All** | `npm run test:db` | **ALL CHECKS PASSED** (functional 52, contact 23, app_config 14, rural 10, profile_privacy 4, concurrency 1) |

Migrations were applied to the local mirror first (48 public tables), then every suite above re-ran green.

---

## 6. Exact DEV apply commands (awaiting approval — not executed)

```bash
# 0) identity + pre-state (read-only)
psql "$BOS_DEV_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f /dev/stdin <<'SQL'
select current_database(), current_user,
       (select count(*) from pg_tables  where schemaname='public') as public_tables,
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relrowsecurity) as rls_tables;
SQL

# 1) backup (must succeed + checksum + restore-verify before any DDL)
BOS_BACKUP_DATABASE_URL="$BOS_DEV_DATABASE_URL" bash scripts/backup_database.sh dev-pre-migration
bash scripts/verify_backup_restore.sh ~/BookOurSpace_Backups/<dir>

# 2) plan (no connection)
bash supabase/tests/run_dev_migration_plan.sh plan

# 3) apply baseline + 26 migrations (explicit approval flags)
BOS_DEV_APPLY=1 \
BOS_DEV_CONFIRM=ezrxykyocgbolpaebnqx \
BOS_DEV_DATABASE_URL="$BOS_DEV_DATABASE_URL" \
BOS_DEV_INCLUDE_BASELINE=1 \
  bash supabase/tests/run_dev_migration_plan.sh apply

# 4) post-state + invariants
BOS_DEV_DATABASE_URL="$BOS_DEV_DATABASE_URL" bash supabase/tests/run_dev_migration_plan.sh check
```

**Expected post-apply:** `public_tables=51`, `rls_enabled_tables=51`, `policies=107`, functions ≈303
(matches the local dry run).

**Schema changes at a glance:** 51 public tables (37 new), 107 RLS policies (every table RLS-enabled),
stay/venue/service/class/pg inventory + booking + payment-intent tables, SECURITY DEFINER booking RPCs,
idempotency + exclusion constraints, and the FK index set.

---

## 7. Rollback

1. **Preferred:** PITR restore to the pre-apply timestamp (verify in the dashboard before applying).
2. **Snapshot:** `pg_restore` the pre-migration `schema.dump` into a clean database and repoint the app.
3. **Manual drop (empty/staging only):** `drop schema public cascade; create schema public;` then re-apply.
4. **Partial failure:** the runner stops on the first error and logs it; all steps are idempotent, so fix, then
   re-run `apply` from step 1.
5. **Verification after rollback:** `public_tables`, `rls_enabled_tables`, `policies` return to the recorded pre-state.

---

## 8. Launch blockers that are still open

| # | Blocker | Evidence |
|---|---|---|
| 1 | Hosted schema/migration history unverified | no DB connection or secret key; `PGRST205`/`PGRST202` are inconclusive |
| 2 | Hosted backup/PITR unverified | dashboard/Management API only |
| 3 | OAuth redirect allowlist unverified | not readable with the publishable key |
| 4 | Email provider still enabled | `external.email=true` on a Google-only product |
| 5 | Real Google sign-in E2E not run | needs #3 + `APP_URL` + a Google test account |
| 6 | Razorpay test-mode settlement not implemented | webhook returns `501 WEBHOOK_HANDLER_NOT_IMPLEMENTED`; signature uses re-serialised body |

---

## 9. Approval request

I have **not** changed the hosted project. To proceed I need, from you:

1. **“approved, apply DEV”**.
2. The DEV **session-pooler URL** exported as `BOS_DEV_DATABASE_URL` in the environment (not in chat).
3. Confirmation that **PITR/backup** is enabled on the DEV project in the dashboard.
4. Confirmation that the **OAuth redirect URLs** are registered (`…/auth/v1/callback` + app `/auth/callback`).

On approval the sequence is: identity check → hosted backup + checksum + restore-verify → baseline + 26 migrations →
post-state invariants → report with exact numbers. Rollback is the PITR/snapshot path above.

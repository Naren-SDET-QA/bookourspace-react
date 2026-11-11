# BookOurSpace — PRODUCTION migration plan, risk & rollback

**Date:** 2026-11-04
**Target:** `ezrxykyocgbolpaebnqx` — **the only React PRODUCTION database** (corrected: not a DEV project).
**Flutter database:** separate, **out of scope**.
**Status:** **MIGRATIONS NOT APPROVED — NOTHING APPLIED.** No baseline, no migration, no configuration change, no commit/push/merge/deploy.

---

## 1. Correction and safety posture

Earlier drafts called this project “DEV”. It is **production**. Consequences:

| Action | Allowed now? |
|---|---|
| Read-only verification (GET) | yes — done |
| Hosted **backup** | **only after separate approval** (prepared, not executed) |
| Baseline / migrations | **NO — not approved** |
| Auth/provider/settings change | **NO** |
| Commit / push / merge / deploy | **NO** |

The local worktree (233 dirty paths) is preserved untouched.

---

## 2. Production identity & permissions (read-only)

| Check | Result | Evidence |
|---|---|---|
| URL ↔ project ref | **PASS** | `https://ezrxykyocgbolpaebnqx.supabase.co` |
| Key belongs to this project | **PASS** | Auth + PostgREST accept the publishable key on this host |
| Auth service live | **PASS** | `GET /auth/v1/health` → 200, GoTrue v2.197.0 |
| Google provider enabled | **PASS** | `external.google = true` |
| Email provider disabled | **FAIL** | `external.email = true` (product is Google-only) |
| Anonymous sign-in disabled | **PASS** | `external.anonymous_users = false` |
| Sign-ups disabled | **FAIL** | `disable_signup = false` |
| Phone provider | **INFO** | `sms_provider = twilio`, `external.phone = false` |
| DB-level identity (`current_user`, ref in username) | **BLOCKED** | needs a DB connection string; SQL prepared in §3 |
| Effective DB grants/role | **BLOCKED** | same |

---

## 3. Hosted schema & migration history — **UNVERIFIED, not assumed empty**

| Probe | Result |
|---|---|
| `GET /rest/v1/<13 tables>` | `404 PGRST205` |
| `POST /rest/v1/rpc/{is_admin,is_active_user,sweep_expired_stay_holds}` | `404 PGRST202` |
| `GET /rest/v1/` (OpenAPI) | `401 Secret API key required` |
| `GET /storage/v1/bucket` | `200 []` |

`PGRST205` / `PGRST202` mean **“not in the PostgREST schema cache”** — the object may not exist, may exist but not be
exposed (`db-schemas`), or the cache may be stale. The publishable key cannot distinguish these, so the hosted
schema and migration history are **UNVERIFIED**. The first approved step must prove them with a direct connection:

```sql
select current_database(), current_user,
       (select setting from pg_settings where name='cluster_name') as cluster,
       (select count(*) from pg_tables where schemaname='public') as public_tables,
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relrowsecurity) as rls_tables,
       (select count(*) from pg_policies where schemaname='public') as policies;
select to_regclass('public.profiles'), to_regclass('public.listings'), to_regclass('public.bookings');
select tablename from pg_tables where schemaname='public' order by 1;
```

**Accept only if** `current_user` contains `ezrxykyocgbolpaebnqx` and the expected baseline tables are present.

---

## 4. Production backup — prepared, **awaiting separate approval**

Location required by you: `~/BookOurSpace_Backups/react/`.

```bash
# PREPARED — DO NOT RUN WITHOUT APPROVAL
BOS_BACKUP_DATABASE_URL='<production session-pooler URL, exported locally>' \
  bash scripts/backup_database.sh prod-pre-migration
# → ~/BookOurSpace_Backups/react/<UTC stamp>-prod-pre-migration/
#   schema.dump (custom, compressed) · schema.sql · globals.sql · manifest.txt · SHA256SUMS

bash scripts/verify_backup_restore.sh ~/BookOurSpace_Backups/react/<stamp>-prod-pre-migration
```

The backup root defaults to `~/BookOurSpace_Backups/react/` (mode 700). The script never prints the URL, refuses any
string containing `prod` **unless** it is explicitly the approved production URL passed in the variable, and aborts on
any `pg_dump` failure.

**Procedure proven locally (same scripts):**

| Backup | Tables | RLS | Policies | Checksums | Isolated restore |
|---|---|---|---|---|---|
| `…072950Z-local-disposable-evidence` | 44 | 34 | 65 | **OK** | **VERIFIED** 44/44 |
| `…074410Z-local-26-migrations` | 48 | 38 | 68 | **OK** | **VERIFIED** 48/48, 299 functions |

---

## 5. Hosted history vs the 26 local migrations

Hosted history cannot be read (BLOCKED, §3), so this is a **static compatibility analysis** of the 26 files.

| Risk class | Finding |
|---|---|
| `DROP TABLE` / `DROP COLUMN` | **none** |
| `ALTER COLUMN … TYPE` / `RENAME` | **none** |
| `TRUNCATE` | **none** |
| `DROP FUNCTION` | **3**, all `if exists` and immediately replaced (`provider_contact_details`, `record_contact_click`, `pg_create_payment_intent`, `provision_google_profile`) |
| `DROP CONSTRAINT` | **1**, inside a guarded `DO` block: the `stay_properties.listing_id` FK is dropped and immediately re-added as `ON DELETE RESTRICT` |
| `ADD COLUMN … NOT NULL` | several, **all with a constant DEFAULT** (no table rewrite, no backfill failure) |
| Data-changing DML | only inside RPC bodies (e.g. `venue_seasonal_rates` delete-by-id), **not executed at migration time** |
| Duplicate versions | **0** (26 files, 26 unique prefixes) |
| Re-apply safety | **26/26 re-apply cleanly** on a throwaway cluster |

**Incompatible-change verdict:** no destructive DDL. The only behaviour-changing step is the FK tightening to
`ON DELETE RESTRICT` — if production has orphan `stay_properties.listing_id` rows, that constraint addition would
fail (safe: the migration aborts, nothing is lost). Pre-check:

```sql
select count(*) from public.stay_properties p
where p.listing_id is not null
  and not exists (select 1 from public.listings l where l.id = p.listing_id);
```

**Baseline warning:** `supabase/schema_and_rls.sql` drops and recreates policies. On a **production** database that
already has the baseline, re-applying it is a **policy-churn risk** and must be skipped unless §3 proves the baseline
objects are absent.

---

## 6. Razorpay settlement handler — implemented & verified

`src/server/platformApi.ts` `/api/payments/razorpay/webhook` now:

1. **Raw-body signature**: HMAC-SHA256 over `req.rawBody` (not `JSON.stringify(req.body)`); missing raw body → `400 RAW_BODY_UNAVAILABLE`; bad signature → `401`.
2. **Idempotency**: requires `x-razorpay-event-id` (else `400 PROVIDER_EVENT_ID_REQUIRED`); replayed ids return `200 replayed:true` with no state change.
3. **Authoritative confirmation**: binds `order_id → intent → booking`, requires `intent.amount * 100 === event.amount`, refuses unknown orders (`404`), cross-booking settlement (`409`), duplicate provider payment (`409`).
4. **Refunds**: `refund.succeeded` only for a verified payment; amount capped at the paid amount (`400 REFUND_EXCEEDS_PAYMENT`).
5. **Fail-closed**: no webhook secret → `503`; unconfigured order creation → `503`.

**Tests:** `tests/razorpay-sandbox-webhook.e2e.test.mjs` → **19/19 PASS** (signature, replay, wrong amount, unknown order, cross-booking, duplicate payment, refund over/valid).

---

## 7. Google-only OAuth verification (no production change)

| Check | Result |
|---|---|
| Google provider on | **PASS** |
| Anonymous sign-in off | **PASS** |
| Email provider off | **FAIL** (`external.email=true`) |
| Sign-ups closed | **FAIL** (`disable_signup=false`) |
| Redirect allowlist readable | **BLOCKED** |
| End-to-end Google sign-in | **BLOCKED** (allowlist + test account + `APP_URL`) |

To enforce Google-only **without code**, the owner must disable Email in Supabase Auth → Providers (a production
setting change, explicitly **not performed**).

---

## 8. Local E2E (isolated databases)

| Suite | Result |
|---|---|
| `npm test` (no DB) | **101 pass / 0 fail / 14 skipped** |
| `tests/stay-booking-e2e` | **5/5** |
| `tests/services-booking-e2e` | **6/6** |
| `tests/razorpay-sandbox-webhook.e2e` | **19/19** |
| `npm run test:db` | **ALL CHECKS PASSED** (functional 52, contact 23, app_config 14, rural 10, privacy 4, concurrency 1) |
| `run_pg_payment_e2e.sh` | **22 checks, 0 blockers** |
| `run_pg_integration.sh` | **4/4 + RLS/atomicity/restart verified** |
| Migration dry run | **26/26 apply + re-apply**, 51 tables / 51 RLS / 107 policies |

Note: running the DB-gated unit tests against my **scratch** `bos_test` database (accumulated fixtures) produces 8
fixture-related failures; they all pass in their own throwaway clusters — the isolated runners above are the
authoritative result.

---

## 9. Production migration plan (only if ever approved)

```bash
# 0. identity + pre-state (read-only)
psql "$PROD_URL" -f pre_state.sql            # §3 queries; record counts

# 1. production backup + checksum + isolated restore (separate approval)
BOS_BACKUP_DATABASE_URL="$PROD_URL" bash scripts/backup_database.sh prod-pre-migration
bash scripts/verify_backup_restore.sh ~/BookOurSpace_Backups/react/<stamp>-prod-pre-migration

# 2. pre-flight compatibility checks (§5)
select count(*) from public.stay_properties p where p.listing_id is not null
  and not exists (select 1 from public.listings l where l.id = p.listing_id);   -- must be 0

# 3. apply the 26 migrations ONLY (skip baseline unless §3 proves it is absent)
BOS_DEV_APPLY=1 BOS_DEV_CONFIRM=ezrxykyocgbolpaebnqx \
BOS_DEV_DATABASE_URL="$PROD_URL" bash supabase/tests/run_dev_migration_plan.sh apply

# 4. post-state
#    expect public_tables=51, rls_enabled=51, policies=107 (matches the local dry run)
```

---

## 10. Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hosted schema differs from expectation | **unknown (unverified)** | high | §3 identity/schema check before anything |
| Policy churn from re-applying the baseline | medium if baseline applied | high | **skip baseline** on production |
| FK tightening fails on orphan rows | low | low (migration aborts) | §5 pre-check must return 0 |
| Long locks on large tables during ADD COLUMN | low (constant defaults, PG 11+) | low | run in a low-traffic window |
| Payment mis-settlement | low | high | raw-body signature, event-id replay guard, amount+booking binding (19/19 tests) |
| Email auth stays enabled | certain today | medium | owner disables Email provider |
| No verified backup | high until approved | high | backup + restore verification is step 1 |

---

## 11. Rollback

1. **PITR** to the pre-apply timestamp (verify the recovery window **before** applying).
2. **Snapshot restore** from the approved `schema.dump` into a clean database, repoint the app.
3. **Partial failure:** the runner stops on the first error; all 26 files are idempotent — fix and re-run.
4. **Post-rollback verification:** `public_tables`, `rls_enabled`, `policies` return to the pre-state recorded in §0;
   app boots and `/api/auth/me` returns 401 without a session.

---

## 12. Approval checkpoint

**Nothing has been applied or changed.** I need, from you:

1. **Approval to run the PRODUCTION backup** (read-only `pg_dump`) with the connection string exported locally as
   `BOS_BACKUP_DATABASE_URL` — this is the only hosted action I am asking for now.
2. Confirmation that PITR is enabled and the recovery window.
3. Only **after** the backup + §3 schema proof + §5 pre-checks: a **separate** approval to apply the 26 migrations.

I will not run the backup or any migration until you explicitly approve.

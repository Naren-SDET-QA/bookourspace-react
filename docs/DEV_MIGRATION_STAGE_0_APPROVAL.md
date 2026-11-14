# Stage 0 Approval Package — Movies visibility schema (DEV)

Project: **`obkfgxjzlscungkhbyvq`** (`React`, Mumbai `ap-south-1`, PostgreSQL 17.11, `postgres` database)
Scope: **Stage 0 only** — two migrations. Nothing else.
Status: prepared, **not executed**. Hosted DEV has been read-only throughout this review.

> This approval authorizes Stage 0 and **only** Stage 0. It does not authorize Stages 1–5, any permission backfill, any runtime flag, any application deploy, or any provider-redesign change. Those each need their own written approval.

---

## 1. The two files

| # | File | sha256 | Lines |
|---|---|---|---|
| 1 | `supabase/migrations/20261102124513_movie_visibility_management.sql` | `db83bf109b5fcc43552044c2faa50f7224ebcc07ab2c89c900a5cdc670921f6a` | 307 |
| 2 | `supabase/migrations/20261102142141_movie_tamil_nadu.sql` | `f7e01281253b32091ae39b7bf803b364869fb0dd208bee33ff445802701e6e92` | 7 |

Order matters: `…124513` creates `movie_theatres` and its `state` CHECK over `Andhra Pradesh, Telangana, Karnataka`; `…142141` drops and re-adds that CHECK to include `Tamil Nadu`. Applying only the first leaves Chennai unusable in the catalog. **Both or neither.**

Verify checksums before applying:

```bash
shasum -a 256 supabase/migrations/20261102124513_movie_visibility_management.sql \
                supabase/migrations/20261102142141_movie_tamil_nadu.sql
```

## 2. Why Stage 0 is needed

DEV's ledger stops at `20261108150000`, so these two were skipped even though `20261103…20261108…` were applied. Consequences measured today:

- `public.movie_theatres`, `movie_titles`, `movie_showtimes` and schema `cinema_private` **do not exist**.
- The application already calls the movies RPCs (`src/server/movieRoutes.ts`): `movies_now_showing`, `movie_admin_access`, `movie_admin_catalog`, `manage_movie_visibility`, `movie_visibility_audit`, `movie_admin_permissions`. On today's DEV every one of those endpoints fails as a missing function.
- `src/server/providerListingRepository.ts` and `src/server/moviesShowtimesApi.ts` are written against a schema that includes this migration's restrictive `cinema_screens` guard and its `state`/`approval_status` capability probes.

Stage 0 restores the missing half of the Movies model so those endpoints can answer. It does **not** complete the Movies feature: `state` and `approval_status` on `cinema_screens` arrive in Stage 4 (`20261112330000`), and until then `PUT /api/movies/showtimes/:id` keeps returning `503 MOVIES_APPROVAL_MIGRATION_REQUIRED` exactly as it does now.

## 3. Database objects created

**Tables (public):** `movie_theatres` (PK text id, state/city/area, `sync_active`, `is_visible`, `visibility_version`, `synced_at`), `movie_titles` (PK, `legacy_listing_id` unique, visibility columns), `movie_showtimes` (PK, FKs to theatre and title with `on delete restrict`, `starts_at`, screen/format, visibility columns). Three indexes.

**Schema `cinema_private`** (USAGE granted to `anon`, `authenticated`; no table privileges):
`admin_permissions` (FK to `auth.users`), `audit_log` (append-only, actor FK to `auth.users`), `bootstrap_admins` (RLS enabled, all privileges revoked).

**Seeded data:** four rows in `cinema_private.bootstrap_admins` — `narenqe@gmail.com`, `tnarendra2027@gmail.com`, `monapatisravya28@gmail.com`, `tnarendra2025@gmail.com`.

**Trigger on `auth.users`:** `movies_bootstrap_verified_admin` after insert/update of `email`, `email_confirmed_at` → `cinema_private.claim_bootstrap_admin()`, which on the first verified sign-in of a seeded email inserts a `super_admin` row into `admin_permissions` and writes an audit entry. Guarded: skipped when `auth.users` has no `email_confirmed_at` column.

**Functions:** 10 in `cinema_private` (`is_admin`, `is_super_admin`, `is_public`, `claim_bootstrap_admin`, `change_visibility`, `manage_permission`, `access_info`, `read_permissions`, `read_audit`, `invalidate_public_feed`) and 8 in `public` (`movies_now_showing`, `movie_admin_access`, `movie_admin_catalog`, `movie_admin_permissions`, `movie_visibility_audit`, `manage_movie_visibility`, `manage_movie_admin_permission`, `sync_movie_catalog`).

**Policies (all `SELECT`):** permissive read policies on the three movie tables gated by `cinema_private.is_public(...)` or admin; **two restrictive guards**: `movie_screen_visibility_guard` on `cinema_screens` (`using (cinema_private.is_admin())`) and `movie_listing_visibility_guard` on `listings` (hides `movie-%` / `sectionType = 'movies'` rows from non-admins).

**Grants:** `SELECT` on the three movie tables to `anon`, `authenticated`, `service_role`; column-level `INSERT`/`UPDATE` on the three tables to `service_role` (metadata columns only — visibility flags and versions excluded); `EXECUTE` on `sync_movie_catalog` to `service_role` only; `EXECUTE` on the movie admin RPCs to `authenticated`. Triggers on the three movie tables publish a payload-free `invalidate` event to topic `bos-public-movies` via `realtime.send`.

## 4. Application impact

| Area | Effect | Assessment |
|---|---|---|
| `/api/movies` discovery | starts returning an empty catalogue instead of erroring | improvement; no data exists yet |
| `/api/admin/movies/*` | RPCs exist; non-admins get `42501` | improvement |
| `PUT /api/movies/showtimes/:id` | still `503 MOVIES_APPROVAL_MIGRATION_REQUIRED` until Stage 4 | unchanged |
| Server-rendered listing/screen reads | unaffected — those queries run as the table owner (`RESET ROLE`), and neither table has `FORCE ROW LEVEL SECURITY` (verified: `relforcerowsecurity = false`) | no change |
| **Direct PostgREST reads as `anon`/`authenticated`** | `cinema_screens` (5 rows) and movie-section `listings` become admin-only; the existing `Cinema screens are public discovery data` policy stops returning rows | **intentional hardening — requires explicit acknowledgment** |
| **Admin bootstrap** | the four seeded emails become `super_admin` on first verified sign-in | **requires owner confirmation that all four mailboxes are controlled by BookOurSpace** |
| Provider cinema-screen edits | code already expects the restrictive policy and re-runs as server role | no change |

`listings.category_id` is `NOT NULL` on DEV, so the guard's `category_id not like 'movie-%'` test cannot evaluate to NULL and hide non-movie listings.

## 5. Verified prerequisites (read-only, today)

| Check | Value |
|---|---|
| `has_table_privilege('auth.users','TRIGGER')` | `true` |
| `has_table_privilege('auth.users','REFERENCES')` | `true` |
| `realtime.send(jsonb,text,text,boolean)` | exists (exactly the 4-argument form used) |
| `movie_theatres` / `movie_titles` / `movie_showtimes` / `cinema_private.*` | all absent → clean create |
| Ledger | 74 rows, max `20261108150000`; neither Stage 0 version present |
| `cinema_screens` rows | 5 (preserved by the migration) |
| `listings` rows | 0 |
| Local proof | `run_local_validation.sh` applies baseline + all 118 migrations from empty and passes 290 checks (exit 0), which includes both Stage 0 files in order |

## 6. Backup prerequisites

Before applying, and recorded in the change ticket:

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$HOME/bos-dev-backups"; mkdir -p "$BACKUP_DIR"
pg_dump "$BOS_DEV_DB_URL" --format=custom --no-owner --no-privileges \
  --file "$BACKUP_DIR/bos-dev-$TS.dump"
shasum -a 256 "$BACKUP_DIR/bos-dev-$TS.dump" | tee "$BACKUP_DIR/bos-dev-$TS.dump.sha256"
pg_restore -l "$BACKUP_DIR/bos-dev-$TS.dump" | head -5
```

Then restore it into a scratch database and confirm `public_tables = 75`, `ledger_rows = 74`, `ledger_max = 20261108150000`, `policies = 141`. Stage 0 does not start without a verified dump.

## 7. Exact execution commands

Run from the repository root, operator shell only, credentials from the environment:

```bash
export BOS_DEV_DB_URL='postgresql://postgres@db.obkfgxjzlscungkhbyvq.supabase.co:5432/postgres?sslmode=require'
export PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s'

# Isolation gate: exactly two files, correct checksums.
shasum -a 256 supabase/migrations/20261102124513_movie_visibility_management.sql \
                supabase/migrations/20261102142141_movie_tamil_nadu.sql
# expect db83bf10… and f7e01281…

# Both files contain their own BEGIN/COMMIT — do NOT add --single-transaction.
psql "$BOS_DEV_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261102124513_movie_visibility_management.sql
psql "$BOS_DEV_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261102142141_movie_tamil_nadu.sql
```

`lock_timeout=5s` and `statement_timeout=120s` come from `PGOPTIONS`, so they hold inside the files' own transactions. If the first file fails, stop — do not run the second.

## 8. Verification (run after both files)

```bash
awk '/^-- SECTION 0/,/^-- SECTION 1/' docs/DEV_MIGRATION_STAGE_VERIFICATION.sql | sed '$d' > /tmp/s0.sql
supabase db query --project-ref obkfgxjzlscungkhbyvq --linked -f /tmp/s0.sql
```

Expected: **17 rows, all `ok = true`.**

| Check | Expected |
|---|---|
| three movie tables, three `cinema_private` tables | `true` ×6 |
| both versions in ledger | `2` |
| RLS on movie tables | `3` |
| `movie_screen_visibility_guard` policy | `1` |
| `cinema_screens` rows preserved | `≥ 5` |
| restrictive guards on existing tables | `2` |
| bootstrap admin emails | `4` |
| `auth.users` bootstrap trigger | `1` |
| `cinema_private` functions | `≥ 10` |
| public movie RPCs | `8` |
| sync RPC not executable by `anon`/`authenticated` | `2` |
| ledger rows | `76` |

Plus one application check, read-only: load the DEV movies page and confirm it returns an empty catalogue rather than a 500, and that a non-admin session receives `42501` from the admin RPCs.

## 9. Failure and recovery

| Failure | Meaning | Action |
|---|---|---|
| `42501` on `create trigger … on auth.users` or the `auth.users` FKs | executing role differs from the verified role | abort; re-check role, do not retry blindly |
| `42P07` `already exists` | out-of-band object | abort, re-audit; the file is **not** re-runnable |
| `42P01` on `cinema_screens`/`listings` inside the `DO` guard | predicate schema drift | abort; the guard block needs review |
| any error | file's own transaction rolls back; ledger unchanged for that file | stop the stage |
| second file fails after first committed | ledger at 75 rows with `state` CHECK excluding Tamil Nadu | stop; do not edit by hand — restore or re-apply the 7-line file after review |

Recovery is by restore (`docs/DEV_MIGRATION_ROLLBACK_RUNBOOK.md` §5/§7), not by re-running. Note that reversing Stage 0 restores **public read access** to `cinema_screens` and movie listings.

## 10. Approval checklist

Sign off each line; unapproved lines block execution.

- [ ] **Scope**: only `20261102124513` + `20261102142141`; Stages 1–5 explicitly **not** authorized.
- [ ] **Checksums** match §1 and files are unmodified since this package.
- [ ] **Backup** taken, sha256 recorded, restore test passed (§6).
- [ ] **Freeze** window agreed; no DEV app deploy during Stage 0.
- [ ] **Visibility change** acknowledged: `cinema_screens` and movie-section listings stop being readable by `anon`/`authenticated` PostgREST directly; server pages unaffected.
- [ ] **Bootstrap admins** acknowledged and confirmed as owner-controlled mailboxes; the four emails become `super_admin` on first verified sign-in.
- [ ] **Unchanged expectations**: movies showtime editing still `503` until Stage 4; movie catalogue is empty until a sync runs.
- [ ] **No data, no backfill, no flags, no deploy**: this stage writes no business/customer permission data and changes no runtime environment variable.
- [ ] **Rollback owner** named; restore path rehearsed.
- [ ] **Operator** confirmed to hold DB access and the `auth.users` trigger privilege verified in §5.

## 11. Boundary statement

Stage 0 approval authorizes two DDL migrations on DEV. It does **not** authorize: Stage 1–5 migrations, `supabase db push`, `--include-all`, any permission backfill (`backfill_strict_permission_grants`, including with `false` and `true`), `BOS_STRICT_PERMISSION_DEFAULTS` or `BOS_STRICT_CUSTOMER_DEFAULTS`, any application deployment, any commit, or any change to the five provider-redesign files. Production is out of scope entirely.

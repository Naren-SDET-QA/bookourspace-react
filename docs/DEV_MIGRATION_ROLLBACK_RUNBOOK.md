# DEV Migration Rollback Runbook — BookOurSpace

Applies to the six-stage rollout in `docs/DEV_MIGRATION_ROLLOUT_RUNBOOK.md`.
Target: **`obkfgxjzlscungkhbyvq`** only. `zykxneztahxbjduagutv` is the wrong database and must never be used for a restore target, a scratch copy, or a comparison.

Status: **prepared, not exercised on DEV.** Every command below is a write operation and requires the approval named in its section.

---

## 1. Principles

1. **Restore beats reverse-engineering.** These migrations create tables, functions, triggers and policies that later files depend on. Hand-written `drop` sequences leave orphaned grants and half-recreated policies. The only reliable reversal after Stage 1 is a dump restore.
2. **A failed statement is not a failed stage.** Files run inside a transaction (own or wrapped). On failure the transaction rolls back, so the database is still at the last successful file. Confirm with §3 before doing anything else.
3. **Roll back the app before the database.** If the app was deployed with code that reads new tables, restoring the database first produces a broken app, not a clean state.
4. **No `supabase db reset`, no `drop database`, no disabling RLS, no dropping audit tables** — not in any scenario.
5. **Never re-run a partially applied file by hand.** Find the boundary with the ledger, restore, then re-plan.

## 2. Backup requirement

Rollback depends entirely on the dump described in `DEV_MIGRATION_ROLLOUT_RUNBOOK.md` §4. Before any stage you must hold:

- `bos-dev-<UTC>.dump` (custom format), its `.sha256`, and the TOC check output;
- a **restore test** in a scratch database with matching `public_tables`, `ledger_rows`, `ledger_max`, `policies`;
- the file name, size and sha recorded in the change ticket.

No verified dump → the stage does not start.

## 3. First five minutes after a failure

```bash
# 1. Stop. Do not re-run the file.
# 2. Identify the boundary.
supabase migration list --project-ref obkfgxjzlscungkhbyvq

# 3. Confirm the last applied version is the last file that succeeded.
supabase db query --project-ref obkfgxjzlscungkhbyvq --linked \
  "select max(version) as ledger_max, count(*) as rows from supabase_migrations.schema_migrations"

# 4. Re-run the stage section of the verification file; a partially applied
#    file shows as one or more failed checks inside that stage.
```

Then choose from §4.

## 4. Decision matrix

| Situation | Action | Approval |
|---|---|---|
| Failure in a file that rolled back cleanly; ledger unchanged for that file | Fix forward is **not** allowed mid-stage. Restore is not needed if the previous file committed and the stage's earlier checks pass. Stop the rollout, re-plan the failing file. | stage owner |
| Failure left the ledger one version ahead but verification fails | Restore the pre-stage dump | rollback approver |
| Policies/grants look wrong (`authenticated` can write a grant table, or provider portal 500s on a missing table) | Restore the pre-stage dump; do not patch policies by hand | rollback approver |
| Data written that should not exist (backfill rows on an empty DEV) | Restore the pre-stage dump | rollback approver |
| Stage 5 applied but strict flags not enabled | No rollback needed; the flags are the switch. Disable/omit the flags and the DB is inert. | none |
| Stage 5 applied **and** app restarted with strict defaults | App rollback first, then restore the Stage-5 dump | rollback + app owner |

## 5. Restore procedure (recommended: new database, repoint the app)

This never drops objects in the live database, so it is safe to rehearse and reversible.

```bash
TS=<timestamp-of-the-dump-to-restore>
BACKUP_DIR="$HOME/bos-dev-backups"

# 5.1 Verify the artefact before touching anything.
shasum -a 256 -c "$BACKUP_DIR/bos-dev-$TS.dump.sha256"
pg_restore -l "$BACKUP_DIR/bos-dev-$TS.dump" | head -5

# 5.2 Create a restore database in the same project (name is illustrative;
#     Supabase allows additional databases over the direct connection).
psql "$BOS_DEV_DB_URL" -v ON_ERROR_STOP=1 -c "create database bos_restore_$TS"

# 5.3 Restore into it.
pg_restore --no-owner --no-privileges --exit-on-error \
  -d "postgresql://postgres@db.obkfgxjzlscungkhbyvq.supabase.co:5432/bos_restore_$TS?sslmode=require" \
  "$BACKUP_DIR/bos-dev-$TS.dump"

# 5.4 Verify the restore matches the recorded baseline of that dump.
psql "postgresql://postgres@db.obkfgxjzlscungkhbyvq.supabase.co:5432/bos_restore_$TS?sslmode=require" -c "
  select (select count(*) from information_schema.tables where table_schema='public') as public_tables,
         (select count(*) from supabase_migrations.schema_migrations) as ledger_rows,
         (select max(version) from supabase_migrations.schema_migrations) as ledger_max,
         (select count(*) from pg_policies where schemaname='public') as policies;"

# 5.5 Repoint the DEV app's database connection to bos_restore_$TS, restart it,
#     and run the app smoke checks. Keep the old database untouched.
```

If additional databases are not permitted in the project, fall back to §6.

## 6. In-place restore (fallback, destructive)

Only with the rollback approver present, and only after the app is in maintenance mode.

```bash
# 6.1 Put the app in maintenance mode (proxy 503 or stop the service).
# 6.2 Terminate other sessions on the target database.
psql "$BOS_DEV_DB_URL" -c "
  select pg_terminate_backend(pid) from pg_stat_activity
   where datname = current_database() and pid <> pg_backend_pid();"

# 6.3 Restore with --clean so objects created by the failed stage disappear.
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error \
  -d "$BOS_DEV_DB_URL" "$BACKUP_DIR/bos-dev-$TS.dump"

# 6.4 Run the same four-count verification as 5.4 against the live database.
# 6.5 Leave maintenance mode only after the app smoke checks pass.
```

`--clean` drops every object in the dump's TOC that exists; it does not drop objects created *after* the dump (that is the point of restoring). Anything created by a stage after the dump must be dropped explicitly — see §7.

## 7. Stage-by-stage reversibility

| Stage | Files | Reversal |
|---|---|---|
| 0 | `20261102124513`, `20261102142141` | **Prefer restore.** Objects are new, so a manual reverse is possible but has three side effects the operator must know: (a) `drop schema cinema_private cascade` also drops the `movies_bootstrap_verified_admin` trigger on `auth.users`, and (b) it drops the `public` SQL wrappers that reference `cinema_private` (`movies_now_showing`, `movie_admin_*`, `manage_movie_visibility`, `movie_visibility_audit`, `sync_movie_catalog`), and (c) it removes the restrictive guards, which **restores public read access** to `cinema_screens` and movie listings — a security regression if it happens silently. Minimum reverse, in this order: `drop trigger if exists movies_bootstrap_verified_admin on auth.users; drop policy if exists movie_screen_visibility_guard on public.cinema_screens; drop policy if exists movie_listing_visibility_guard on public.listings; drop schema cinema_private cascade;` then `drop table if exists public.movie_showtimes, public.movie_titles, public.movie_theatres;` and finally re-create or accept the loss of the `public` movie RPCs (they will 500 again, as they do today). |
| 1 | `20261111190000`–`20261111210000` | Restore only. `20261111190000` alters `service_bookings`; dropping the new tables would leave the altered column. |
| 2 | `20261112010000`–`20261112080846` | Restore only. Adds `business_id` to `listings`/`bookings`, creates the audit trail, and rebuilds ~40 policies. |
| 3 | `20261112100000`–`20261112310000` | Restore only. 20 files, strict triggers on write paths, privilege revokes. |
| 4 | `20261112320000`–`20261113050000` | Restore only. Creates the access layer and revokes browser writes; a partial reverse leaves writable grants. |
| 5 | `20261114090000`–`20261114120000` | Restore only for schema. Data is idempotent (zero rows here), so if only the backfill is in question, re-running with `false` is a no-op. Reverting `20261114100000` restores the pre-hardening grants — treat as a security regression, not a rollback. |

Manual reverse DDL for Stages 1–5 is deliberately not provided: it cannot restore the pre-existing policy bodies that those stages dropped and recreated.

## 8. Post-rollback verification

```bash
supabase db query --project-ref obkfgxjzlscungkhbyvq --linked \
  -f docs/DEV_MIGRATION_STAGE_VERIFICATION.sql
```

Expected after restoring the pre-Stage-0 dump: Section P all `ok = true`, Sections 0–5 mostly `ok = false` (objects legitimately absent). After restoring a pre-Stage-N dump: Sections P…N−1 true, N…5 false.

Also confirm, in the app: provider portal login, one read of a listing, no 500s in the server log, and that `authenticated` still cannot write `business_audit_events`.

## 9. What must be recorded

- failing file, SQLSTATE, exact error text;
- ledger max before and after the failure;
- dump restored (name + sha256) or "no restore, stage boundary intact";
- verification output after recovery;
- whether app rollback was required;
- approver names and UTC timestamps.

## 10. Escalation

Stop the rollout and escalate to the DB owner if any of these occur: `42P07`/`42703` on a table the preflight said was absent, a policy or trigger that cannot be recreated, `authenticated` regaining write access to a grant table after restore, or a restore that fails `--exit-on-error`. Do not improvise a fix on DEV.

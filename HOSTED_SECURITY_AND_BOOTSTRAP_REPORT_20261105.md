# HOSTED SECURITY, SUPER ADMIN BOOTSTRAP & LIVE BUILDER — 2026-11-05

Worktree: `bookourspace-react` · Hosted project: `obkfgxjzlscungkhbyvq` (Mumbai) · Capacitor: `bookourspace-react-capacitor`

Nothing in this report was applied to the hosted project. No role was assigned,
no hosted test record was created, and no secret was read or printed.

## 1. Current status

| Priority | Status | Evidence |
|---|---|---|
| 1. Remaining Security Advisor vulnerabilities | **PASS (local), BLOCKED (hosted confirmation)** | Advisor audit: **0 blocking**, 17 reviewed WARN; 8 migrations prepared |
| 2. Secure Super Admin bootstrap | **PASS (prepared + tested), BLOCKED (hosted run needs approval)** | `run_super_admin_bootstrap_test.sh` **18/18 PASS** |
| 3. Hosted Live Builder publish / visibility / rollback × 6 | **PASS (local), BLOCKED (hosted)** | Builder e2e **PASS**: 6 pages publish → public read → rollback, RLS published-only, audit append-only |
| Migrations | **PASS local** | 50 pinned; dry run **50 apply + 50 re-apply**; manifest `baseline + 50 migrations, sha256 match` |
| TypeScript / unit tests | **PASS** | `tsc --noEmit` exit 0; 203 tests, 188 pass, 0 fail, 15 DB-gated skips |

## 2. Hosted migration ledger

Hosted ledger (reported): **43 records = baseline + 42 migrations** (through `20261105050000`). Local manifest: **50**.
Therefore **8 migrations are pending on Mumbai**:

| Version | Purpose | Risk if omitted |
|---|---|---|
| `20261105060000_builder_registry_read_policies` | public read policies for builder registries | builder UI registry reads return no rows over PostgREST |
| `20261105101329_hosted_security_advisor_corrections` | pin 5 definer search_paths, revoke sweepers/movie hold, move btree_gist | advisor findings stay open; browser can call the disabled movie seat hold |
| `20261105102436_public_provider_profile_projection` | replace owner-rights provider view with invoker view + public-only projection | advisor "security definer view"; private profile columns reachable |
| `20261105102913_live_builder_foreign_key_indexes` | index 14 builder FK columns | sequential scans / advisor unindexed-FK findings |
| `20261105114000_super_admin_bootstrap_audit` | owner-only bootstrap/revoke RPCs + audit columns | no safe way to create the first Super Admin |
| `20261105115000_security_definer_execute_hardening` | revoke PUBLIC EXECUTE, pin remaining search_paths, extensions schema usage | definer surface stays wider than necessary |
| `20261105120000_builder_registry_rls` | enable RLS on both registry tables | policies inert; tables served with RLS off |
| `20261105120100_super_admin_bootstrap_guards` | reject repeat bootstrap, protect the last Super Admin | duplicate audit rows; possible owner lock-out |

All eight are forward-only and idempotent. Local dry run applies and re-applies
all 50 cleanly on an isolated baseline.

## 3. Security Advisor

`supabase/tests/run_security_advisor_audit.sh` builds a disposable cluster with
the baseline plus all 50 migrations and audits every SQL-fixable advisor class.

**Blocking findings: 0** (was 2 — both registry tables had policies but RLS off;
fixed by `20261105120000`).

Review items, all deliberate:

| Finding | Count | Decision |
|---|---|---|
| `anon_definer_execute` | 7 | Public discovery RPCs (`class_batch_availability`, `provider_contact_details`, `service_listing_profile`, `service_listing_slots`, `stay_availability`, `venue_public_calendar`, `venue_quote`). Each returns public booking/contact data only and is validated by existing suites. |
| `always_true_policy` | 9 | Public discovery tables (cinema screens, module flags, reviews, stay units, schedules, registries, provider projection). Writes stay revoked. |
| `extension_in_public` | 1 | `pgcrypto` — a **local stub artifact**; Supabase installs extensions in `extensions`. Confirm on hosted before treating as real. |

Still requires the dashboard (not SQL): **leaked password protection** and other
Auth settings. Confirm in Supabase → Authentication → Policies.

## 4. Super Admin bootstrap

Owner-run script: `supabase/bootstrap_super_admin.sql`. It wraps
`private.bootstrap_super_admin()` in a transaction and only commits with
`bootstrap_confirm=BOOTSTRAP-SUPER-ADMIN`; `DRY-RUN` rolls the whole thing back.

Enforced in SQL, not just the script:

- database-owner session only (`session_user in ('postgres','supabase_admin')`)
- confirmed **Google** Auth identity, active profile
- reason 5–1000 characters, written to `user_access_audit_events`
- repeat bootstrap refused (`TARGET_ALREADY_SUPER_ADMIN`)
- last active Super Admin cannot be revoked
- `anon`, `authenticated`, `service_role` have no EXECUTE on either routine

Evidence (`supabase/tests/run_super_admin_bootstrap_test.sh`): **18 passed, 0 failed**
— missing/invalid token, unknown email, unconfirmed email, non-Google account,
non-owner session, dry run writes nothing, approved run writes one row,
repeat refused, last-admin protected, client roles locked out.

### Approval request A — bootstrap (dry run first)

```bash
psql "$BOS_OWNER_DATABASE_URL" \
  -v bootstrap_email='<owner-google-email>' \
  -v bootstrap_confirm=DRY-RUN \
  -v bootstrap_note='2026-11-05 approved by owner' \
  -f supabase/bootstrap_super_admin.sql
```

then repeat with `bootstrap_confirm=BOOTSTRAP-SUPER-ADMIN`.

## 5. Live Builder across six modules

Local evidence (`supabase/tests/run_universal_builder_e2e.sh`, `PASS`):

- pages `pg_hostels`, `classes`, `venues`, `services`, `hotel_stay`, `movies`
- Super Admin publish → independent customer browser renders the new blocks
- rollback → customer browser observes the restored baseline
- anon RLS exposes published versions only (38 published / 1 draft, 0 leaks)
- builder audit append-only (65 rows); direct writes denied to anon
- JSON store hash unchanged

Hosted verification is **BLOCKED**: there is no working credential (the Keychain
password is stale) and no approval to connect. Prepared read-only harness:

```bash
BOS_HOSTED_READONLY_DSN='<read-only DSN>' \
BOS_HOSTED_VERIFY_APPROVED=obkfgxjzlscungkhbyvq \
bash supabase/tests/run_hosted_builder_verification.sh
```

It forces `default_transaction_read_only=on` and checks, per page: a published
version exists, it is the newest, the document page key matches, anon sees only
published rows, registries are populated, builder tables have RLS, and anon
cannot execute builder routines.

## 6. Approval requests

| # | Request | Scope |
|---|---|---|
| A | Apply 8 migrations to Mumbai | SQL DDL only; no data backfill, no role assignment |
| B | Run the Super Admin bootstrap (dry run, then apply) | one profile: `role='admin'`, `is_super_admin=true` + audit row |
| C | Read-only hosted verification | SELECTs only under `default_transaction_read_only` |
| D | Hosted login proof / payment evidence | needs a real admin session and provider sandbox |

Not requested and not performed: any commit, push, merge, deploy, payment,
hosted test record or secret rotation.

## 7. Known defects fixed in this pass

1. Registry RLS was never enabled while 050600 added policies for it — policies
   were inert and the advisor flagged both tables. Fixed in `20261105120000`.
2. The bootstrap RPC could be re-run, appending duplicate `bootstrap_grant`
   rows, and `revoke_super_admin` could remove the last Super Admin. Fixed in
   `20261105120100`.
3. A duplicate bootstrap-audit migration (`20261105110000`) was removed in
   favour of the concurrent, richer `20261105114000`; the owner script and test
   were re-pointed at that RPC.

## 8. Remaining non-SQL work

- Stale Mumbai database password (Keychain `bookourspace-react-db`) — rotate per
  `REMAINING_BLOCKERS.md`.
- Enable leaked-password protection and review Auth rate limits in the dashboard.
- Google login proof and provider-backed payment evidence on hosted.
- Native Android/iOS verification in the Capacitor worktree.

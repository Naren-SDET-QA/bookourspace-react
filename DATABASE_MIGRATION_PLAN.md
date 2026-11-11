# DATABASE_MIGRATION_PLAN — DEV project

> **Reviewed 2026-11-04.** The sole intended target is DEV `ezrxykyocgbolpaebnqx`; no separate staging project is required. Supabase management/catalog access currently returns HTTP 403. Earlier claims here that another project is the active target or that DEV is confirmed empty are withdrawn. Do not apply anything until the actual DEV catalog, migration history, backup state and plan are reviewed with authorized read access.

**Prepared:** 2026-11-04
**Target (confirmed by owner):** `ezrxykyocgbolpaebnqx` → `https://ezrxykyocgbolpaebnqx.supabase.co`
**Mode:** read-only investigation complete. **No hosted write, DDL, migration or configuration change has been performed.**
**Approval required before any hosted write. Not granted yet.**

---

## 1. Verified state of the DEV project (read-only, 2026-11-04)

| Check | Result | Interpretation |
|---|---|---|
| Project reachable (`/auth/v1/health`) | **200**, GoTrue v2.197.0 | Live project |
| Publishable key scoped to this project | **owned** — the same key returns **401** on `zykxneztahxbjduagutv` | `.env.local` key belongs to `ezr…nqx` |
| `GET /rest/v1/` (OpenAPI root) | **401** | Data API root not readable with the publishable key |
| Exposed relations in OpenAPI | **0** | No table/view is exposed |
| `public.bookings` / `public.profiles` / `public.listings` | **404 `PGRST205`** for each | Expected relations are not exposed in the REST schema cache; this does not establish the complete catalog or migration history |
| Any RPC (`/rest/v1/rpc/is_admin`) | **404 `PGRST202`** | No application function exists |
| Storage buckets | **200**, **0 buckets** | Storage provisioned but empty |
| Auth providers | `google`, `email`; `disable_signup: false` | Email sign-in open; Google-only **not** enforced |
| Google authorize endpoint | **302 → accounts.google.com**, `client_id` present | Google OAuth **is configured** in this project |

**Conclusion on the direct probes.** The Data API is reachable with the publishable key and reports `PGRST205` for the probed application relations and `PGRST202` for the probed RPC. These results support that the expected application relations/functions are not exposed in the Data API. Management access is denied, so exact catalog state and migration history remain **unverified**. Do not infer a complete schema inventory or migration-history state from the REST probes. The current local plan contains the baseline plus **27 migrations**, including private profile provisioning, Admin provider activation and PG Razorpay settlement RPCs. This is local evidence only and needs a target-catalog comparison before any hosted apply.

**Not verifiable with current access (management API returns 403 for this ref):**

| Question | Status | Why |
|---|---|---|
| Exact table list / RLS flags / policies | **BLOCKED** | `SUPABASE_LIST_TABLES` → HTTP 403 |
| Applied migration history | **BLOCKED** | `SUPABASE_LIST_MIGRATION_HISTORY` → 403. Direct REST relation probes do not establish migration history. |
| Auth configuration details | **BLOCKED** | `SUPABASE_GETS_PROJECT_S_AUTH_CONFIG` → 403 |
| Service health per service | **BLOCKED** | 403 |
| `auth.users` count / whether real users exist | **BLOCKED** | needs service-role or management access |

"Not serving real production users" is **supported but not proven**: with zero application tables, zero functions and zero storage objects, no BookOurSpace user data can exist here. It can only be *proven* by reading `auth.users` with service-role access.

---

## 2. Access needed to finish (choose one)

| Option | What it unlocks | Notes |
|---|---|---|
| **A. Grant the connected Supabase integration read access to `ezrxykyocgbolpaebnqx`** (minimum `project_admin_read`) | table inventory, migration history, auth config, read-only SQL | Preferred: no secret handling at all. Apply additionally needs write authorization and explicit user approval. |
| **B. Provide an authorized read-only catalog connection in local environment** | table inventory, migration history and RLS inspection | Do not paste credentials in chat. A service-role key is not required for ordinary catalog inspection if a read-only DB role is available. |
| **C. Dashboard-only apply** | you run the SQL, I verify afterwards | Slowest, still needs a read credential to verify |

Until one of these exists, everything below is a plan, not an action.

---

## 3. Migration inventory and ordering

**Current local reconciliation (2026-11-04):** the checked-in manifest contains **27 migration files**. This corrects the 26-file count in the older text below. The last file, `20261104130000_pg_razorpay_raw_body_settlement.sql`, was missing from the written 26-migration list and runs after `20261104120000_admin_provider_activation_rpc.sql`. The 21-file deployment-plan comparison is historical: at the 22-file checkpoint, the first omission was `20261103240000_stay_checkout_pay_after_service_without_vpa.sql`; the current local plan adds five more migrations after it, for six current additions (files 22–27). Hosted migration history is still **unverified** because read-only project access is denied; do not infer how many files have actually been applied to DEV. No separate hosted staging project is required or assumed.

The baseline is conditional: include it only if an authorized read-only catalog query proves that it is required and safe. Then review/apply the **27** files in filename order:

1. `supabase/schema_and_rls.sql` — baseline: `profiles`, `listings`, `bookings`, `enquiries`, `transactions`, `reviews`, `payments`, `refunds`, `audit_logs`, `favorites`, `categories`, `movie_*` (14 tables) — **not a migration**, must run before all others.
2. `20261101000002_marketplace_modules_and_stay_inventory.sql`
3. `20261101000003_fix_provider_contact_listing_ids.sql`
4. `20261101000004_platform_module_realtime.sql`
5. `20261101072320_active_admin_marketplace_listing_rls.sql`
6. `20261101073937_admin_stay_inventory_safety.sql`
7. `20261101075829_app_builder_config_versions.sql`
8. `20261101175250_former_local_services_listing_fields.sql`
9. `20261103120000_marketplace_foreign_key_indexes.sql`
10. `20261103130000_provider_listing_idempotency.sql`
11. `20261103171437_provider_registration_workflow.sql`
12. `20261103173631_venue_booking_inventory.sql`
13. `20261103175957_venue_dynamic_categories_timezone_dst.sql`
14. `20261103180000_services_booking_lifecycle.sql`
15. `20261103190000_stay_checkout_and_payment_intents.sql`
16. `20261103200000_class_batches_and_enrollment.sql`
17. `20261103201000_stay_confirmation_actor_authorization.sql`
18. `20261103210000_pg_booking_lifecycle.sql`
19. `20261103211000_services_schedule_and_verified_payments.sql`
20. `20261103220000_pg_payment_lifecycle.sql`
21. `20261103233000_venue_booking_disputes.sql`
22. `20261103234000_venue_payment_provider_binding.sql`
23. `20261103240000_stay_checkout_pay_after_service_without_vpa.sql`
24. `20261103250000_pg_admin_disputes_invoices.sql`
25. `20261104100000_profiles_private_access.sql`
26. `20261104110000_google_profile_provision_rpc.sql`
27. `20261104120000_admin_provider_activation_rpc.sql`
28. `20261104130000_pg_razorpay_raw_body_settlement.sql` — adds Razorpay order/payment references and indexes to `payment_intents`; replaces PG payment-intent creation with explicit provider-order binding; adds the service-role-only webhook settlement RPC. It depends on the earlier PG booking/payment lifecycle, `payment_provider_events`, bookings, profiles and PG audit objects. It uses additive `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `CREATE OR REPLACE FUNCTION`, and its local apply/re-apply check passes; this does not establish hosted compatibility.

**Duplicate versions resolved 2026-11-04.** Two pairs previously shared a timestamp. Only the second file of each pair was renumbered into the free
slot before the next version, so apply order is unchanged: `class_batches_and_enrollment` (…200000) still runs before
`stay_confirmation_actor_authorization` (now …201000), and `pg_booking_lifecycle` (…210000) still runs before
`services_schedule_and_verified_payments` (now …211000). All 27 versions are unique, which the manifest checker requires.
`supabase/MIGRATION_MANIFEST.json` pins the baseline and all 27 migrations in apply order with sha256: regenerate with
`node supabase/tests/migration_manifest.mjs --write`, verify with `node supabase/tests/migration_manifest.mjs`.

### Expected prerequisites (hosted state unverified)
The local migration harness supplies `auth.users`, `auth.uid()`, `auth.role()`, roles `anon`/`authenticated`/`service_role`, the `supabase_realtime` publication and extensions `pgcrypto` / `btree_gist`. The hosted catalog cannot be inspected with current access. Confirm the Supabase extension schema and publication before any approved apply.

### Local dry run (already green, repeatable)
The current local plan contains `schema_and_rls.sql` plus **27 migrations** for disposable PostgreSQL. A fresh local dry run applied all 27 and re-applied all 27 cleanly; the baseline produced 51 public tables, all RLS-enabled. `run_local_validation.sh` also passed profile privacy, profile provisioning, Admin activation, module RLS, concurrency and venue HTTP integration. This is local compatibility evidence only, **not** hosted DEV catalog or migration-history evidence. Do not use older public table/policy count estimates as expected DEV values; compare the verified hosted catalog to the exact migration plan first.

---

## 4. Backup and recovery (before any apply)

1. **Record the current recovery point.** Dashboard → Database → Backups: note the latest daily backup timestamp and whether PITR is enabled. If PITR is unavailable, do not proceed on a free-tier project without a manual dump.
2. **Logical dump** (outside the repo, never committed):
   `pg_dump "$DEV_DB_URL" --schema-only --no-owner -f dev-schema-pre.sql` and a full `pg_dump -Fc -f dev-pre.dump`.
   Store both outside the repo, verify dump integrity and document the recovery point. Current schema size is **unknown** until an authorized read-only catalog check.
3. **Baseline object inventory and row counts** for every table the plan may alter. Current counts are **BLOCKED**; the prior assertion that no application objects exist is not a safe precondition.
4. **Apply one file per invocation** with `ON_ERROR_STOP=1`; stop on the first error and retain logs. The current runner does not wrap each file in an explicit transaction; a failure may leave earlier statements from that file committed. Inspect partial state and use the verified backup/PITR recovery point before retrying.
5. **Post-apply verification** (must all hold):
   - Compare tables, columns, constraints, indexes, grants, RLS policies, functions, publications and migration history with the reviewed plan; investigate existing objects before any DDL.
   - Ensure all private tables have intended RLS/grants and private profile/Admin RPCs are not exposed via the public REST schema.
   - Re-run migration idempotency checks in disposable PostgreSQL and perform two-user owner/stranger RLS probes.
6. **Rollback**
   - Preferred: restore `dev-pre.dump` or use PITR to the documented pre-apply recovery point, after reviewing impact and receiving approval.
   - Do not assume object-level rollback is safe. There are no complete reviewed down migrations for all files; design any object-level recovery only after comparing the actual hosted catalog. Never drop pre-existing objects or data.
   - After recovery, verify catalog, representative data, RLS, Auth and app health read-only before resuming.

---

## 5. Post-migration configuration (separate approval)

| Item | Current | Needed |
|---|---|---|
| Google-only enforcement | `google=true`, `email=true`, `disable_signup=false` from read-only Auth settings | Google-only is not enforced; a settings change needs explicit approval |
| Redirect allowlist | unknown (403) | add `http://localhost:3000/auth/callback`, `http://127.0.0.1:3000/auth/callback` and the deployed origin |
| Data API exposure | 0 relations | tables become exposed by the migrations' grants; verify `anon` cannot read private tables |
| Server secrets | absent | `BOS_SERVER_HMAC_SECRET`, `BOS_LISTINGS_DATABASE_URL` (DEV), Google client id/secret, Razorpay test keys |

---

## 6. Approval gate

**Nothing below is authorised yet.** Reply with the specific approvals you want:

1. Apply the baseline only if authorized catalog verification proves it is required, then the reviewed 27 migrations to `ezrxykyocgbolpaebnqx` (DEV) — yes/no.
2. Disable email sign-in and close signups (Google-only) — yes/no.
3. Add the redirect allowlist entries — yes/no.
4. Provide DEV credentials (`SUPABASE_SERVICE_ROLE_KEY`, `BOS_LISTINGS_DATABASE_URL`) or grant integration access — which option.

## Status: **BLOCKED ON APPROVAL + ACCESS** — no hosted change made.

## 13. Final local manifest update — 2026-11-04 (supersedes older 21/26/27 counts)

The repository now verifies **baseline + 29 unique migrations**. `node supabase/tests/migration_manifest.mjs` passed with unique versions and SHA-256 match. The earlier 21-file deployment plan was a planning snapshot, not evidence that 21 files were applied to DEV. At the previous 22-file comparison point, the first omitted migration was `20261103240000_stay_checkout_pay_after_service_without_vpa.sql`; the current tree adds through migration 29. No hosted applied-migration count has been verified.

Current files 27–29, in required lexical order:

27. `20261104130000_pg_razorpay_raw_body_settlement.sql` — follows the PG booking/payment schema and provider event/intent objects; records raw-body verified settlement support for the PG path.
28. `20261104140000_restrict_profile_self_insert_columns.sql` — tightens self-insertable profile columns after profile privacy/provisioning and provider registration policies exist. It prevents a user from supplying protected authorization/identity fields during profile creation.
29. `20261104150000_live_edit_audit_trail.sql` — adds append-only App Builder live-edit audit persistence; depends on the existing App Builder config version schema and profile/admin actor authorization helpers.

**Local validation evidence:** `bash supabase/tests/run_staging_migration_dry_run.sh` created a unique disposable local PostgreSQL cluster, applied all 29 migrations, then reapplied all 29 successfully. It found 52 public tables, all 52 with RLS enabled, 108 policies, and 306 public functions. This proves local syntax/order/reapply behavior against the repository baseline and Supabase-compatible stubs only. It does not prove compatibility with the hosted DEV catalog or reveal which migrations were applied there.

**Hosted gate remains unchanged:** the designated DEV project is `ezr…nqx`, but Supabase project-scoped read-only calls still return permission denied (`MCP error -32600`). Do not infer hosted schema or migration history from local REST responses. Before any hosted write, obtain authorized read access, export the actual migration history/catalog, compare against this 29-file manifest, review recovery/backup state, then request separate explicit approval. No migration was applied to hosted DEV.

## 14. Production access and backup blocker — 2026-11-04

The authorized read-only project lookup is still denied: `get_project(ezr…nqx)` returns `MCP error -32600: You do not have permission to perform this action`. The connector lists a different project and one organization, which does not establish whether the connected account is wrong or simply lacks membership/project scope. Local configuration is consistent with the selected ref, but that does not prove hosted identity.

The database URL environment variable is absent. The Keychain record `bos-production-backup` / `readonly` exists with a one-byte newline-only value. No connection, dump, restore, or production query was attempted. The reported 22-applied count remains unverified. The first migration beyond the historical 21-file plan at the 22-file checkpoint was `20261103240000_stay_checkout_pay_after_service_without_vpa.sql`; current local total is 29. The current ordered local list and dependencies are the exact manifest plus §13 above. Hosted drift, orphan rows, foreign-key preflight, and rollback targeting require authorized read-only catalog access.

`supabase/tests/backup_production_readonly.sh` accepts the URL from its environment and enforces the exact ref, but does not automatically read Keychain and does not independently prove that the database role lacks write privileges. Before retrying, use a secure Keychain-to-process wrapper, verify role privileges without displaying the URL, then use the script's backup-only and project-reference guards. No code or hosted schema changes were made in response to this blocker.

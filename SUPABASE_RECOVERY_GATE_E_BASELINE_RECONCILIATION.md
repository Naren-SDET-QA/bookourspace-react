# SUPABASE RECOVERY — GATE E: BASELINE RECONCILIATION

**Project:** BookOurSpace Supabase recovery · target `obkfgxjzlscungkhbyvq` (ap-south-1 / Mumbai)
**Date:** 2026-11-24 · **Mode:** READ-ONLY
**Scope:** migration-history reconciliation and an independently verified recovery baseline, before any hosted database write is authorised.

> No hosted write, migration, schema change, extension install, Supabase link, Docker start, restore, key generation, Git modification or deployment was performed. No credential, password, key or secret is reproduced here. The only file created is this report.

---

## 1. Executive summary

The migration history **is now fully reconciled, and the discrepancy is explained exactly**.

| Question | Answer |
|---|---|
| Local migration files | **81** (all tracked, none untracked, no non-SQL entries) |
| Hosted ledger rows | **74** |
| Rows that are migrations | **73** |
| Rows that are not migrations | **1** — the synthetic baseline marker `00000000000000` / `bookourspace_baseline` |
| Applied migrations matched to files | **73** |
| Pending migrations | **8** |
| Ledger entries with no file | **1** (that same baseline marker) |
| Duplicate timestamps (local or ledger) | **0** |
| Version/name mismatches | **0** |
| Ordering inversions | **0** |

**The seven-file discrepancy (81 − 74) is arithmetic, not drift: 8 pending migrations minus 1 baseline marker row.** The Gate E brief inherited the "seven" from a raw 81-vs-74 subtraction. Once the baseline row is classified as a marker rather than a migration, the true pending set is **eight** — and all eight arrive in a single commit, `96c1297`.

The one ledger row that is not an applied migration is `00000000000000` / `bookourspace_baseline`. It carries one recorded statement, describes the pre-history baseline of `supabase/schema_and_rls.sql`, and has no corresponding file under `supabase/migrations/`. It is not an omission and needs no repair.

All eight pending migrations were analysed in full: **17 new tables, 39 new functions, 55 new policies, 20 new columns**, and **zero unresolved dependencies** — none of those objects exists in the target today, the set is internally ordered, and none of the eight needs a missing extension (no `postgis`, `pg_cron`, `pg_net` or `geography` reference at all).

**The reconciliation passes. The recovery stage does not start yet**, because the production project is still unidentified and no archive can be encrypted. §10 gives a split verdict.

---

## 2. Verified Git baseline

| Item | Value |
|---|---|
| Branch | `feat/universal-gps-tracking` |
| HEAD | `96c1297fa7e1a5dae46872bf1f1c30b0c4788297` (`96c1297`) |
| HEAD subject | `feat(business): add business ownership module with phase 1-5 migrations` |
| HEAD commit date | 2026-11-15 18:10:00 +0530 |
| Working tree | 1 modified file: `src/components/ProviderDashboard.tsx` (+16 / −0) |
| Tracked migration files | 81 of 81 |
| Checkout / reset / clean / stash / amend / commit | **none performed** |
| Application source modified | **none** |

The single working-tree modification is the one recorded in the Gate E brief as pre-existing. It was read for statistics only and left byte-identical.

Recent history: `96c1297` (business ownership, phase 1–5 migrations) ← `7c52b8c` (PG owner local sign-in) ← `4acdc90` (owner dashboard on provider login) ← `59f75a4` (owner dashboard workspace). Only `96c1297` touches `supabase/migrations`.

---

## 3. Complete 81-migration inventory

Sorted by 14-digit version. Size in bytes. The ledger column is the result of the reconciliation in §4; the final eight entries are the entire pending set.

| # | Version | Migration | Bytes | Ledger |
|---|---|---|---|---|
| 1 | `20261101000002` | marketplace_modules_and_stay_inventory | 29,085 | applied |
| 2 | `20261101000003` | fix_provider_contact_listing_ids | 5,331 | applied |
| 3 | `20261101000004` | platform_module_realtime | 1,640 | applied |
| 4 | `20261101072320` | active_admin_marketplace_listing_rls | 2,567 | applied |
| 5 | `20261101073937` | admin_stay_inventory_safety | 21,303 | applied |
| 6 | `20261101075829` | app_builder_config_versions | 20,673 | applied |
| 7 | `20261101175250` | former_local_services_listing_fields | 3,474 | applied |
| 8 | `20261103120000` | marketplace_foreign_key_indexes | 2,613 | applied |
| 9 | `20261103130000` | provider_listing_idempotency | 778 | applied |
| 10 | `20261103171437` | provider_registration_workflow | 3,676 | applied |
| 11 | `20261103173631` | venue_booking_inventory | 40,272 | applied |
| 12 | `20261103175957` | venue_dynamic_categories_timezone_dst | 7,385 | applied |
| 13 | `20261103180000` | services_booking_lifecycle | 17,105 | applied |
| 14 | `20261103190000` | stay_checkout_and_payment_intents | 21,860 | applied |
| 15 | `20261103200000` | class_batches_and_enrollment | 19,968 | applied |
| 16 | `20261103201000` | stay_confirmation_actor_authorization | 11,113 | applied |
| 17 | `20261103210000` | pg_booking_lifecycle | 15,706 | applied |
| 18 | `20261103211000` | services_schedule_and_verified_payments | 21,614 | applied |
| 19 | `20261103220000` | pg_payment_lifecycle | 27,437 | applied |
| 20 | `20261103233000` | venue_booking_disputes | 6,243 | applied |
| 21 | `20261103234000` | venue_payment_provider_binding | 4,329 | applied |
| 22 | `20261103240000` | stay_checkout_pay_after_service_without_vpa | 7,640 | applied |
| 23 | `20261103250000` | pg_admin_disputes_invoices | 60,132 | applied |
| 24 | `20261104100000` | profiles_private_access | 4,674 | applied |
| 25 | `20261104110000` | google_profile_provision_rpc | 2,541 | applied |
| 26 | `20261104120000` | admin_provider_activation_rpc | 2,591 | applied |
| 27 | `20261104130000` | pg_razorpay_raw_body_settlement | 14,425 | applied |
| 28 | `20261104140000` | restrict_profile_self_insert_columns | 733 | applied |
| 29 | `20261104150000` | live_edit_audit_trail | 5,594 | applied |
| 30 | `20261104160000` | super_admin_role_management | 6,513 | applied |
| 31 | `20261104170000` | provider_listing_ownership_guards | 5,199 | applied |
| 32 | `20261104180000` | booking_idempotency_per_user | 7,712 | applied |
| 33 | `20261104190000` | active_admin_authorization | 1,774 | applied |
| 34 | `20261104200000` | complete_foreign_key_indexes | 3,787 | applied |
| 35 | `20261104210000` | restrict_definer_execution | 4,048 | applied |
| 36 | `20261104220000` | live_edit_backend_security | 56,365 | applied |
| 37 | `20261105000000` | class_batches_role_scoped_read_policies | 1,090 | applied |
| 38 | `20261105010000` | service_reviews_public_policy | 1,689 | applied |
| 39 | `20261105020000` | universal_live_builder | 38,305 | applied |
| 40 | `20261105030000` | platform_settings_persistence | 13,532 | applied |
| 41 | `20261105040000` | universal_media_assets | 9,600 | applied |
| 42 | `20261105050000` | builder_entity_rollback | 2,778 | applied |
| 43 | `20261105060000` | builder_registry_read_policies | 899 | applied |
| 44 | `20261105101329` | hosted_security_advisor_corrections | 2,147 | applied |
| 45 | `20261105102436` | public_provider_profile_projection | 3,353 | applied |
| 46 | `20261105102913` | live_builder_foreign_key_indexes | 1,933 | applied |
| 47 | `20261105114000` | super_admin_bootstrap_audit | 9,728 | applied |
| 48 | `20261105115000` | security_definer_execute_hardening | 1,758 | applied |
| 49 | `20261105120000` | builder_registry_rls | 1,526 | applied |
| 50 | `20261105120100` | super_admin_bootstrap_guards | 5,324 | applied |
| 51 | `20261105130000` | media_finalization | 7,063 | applied |
| 52 | `20261105140000` | media_anon_policy_split | 1,665 | applied |
| 53 | `20261105150000` | server_media_byte_validation | 3,120 | applied |
| 54 | `20261105160000` | media_published_listing_visibility | 7,951 | applied |
| 55 | `20261105163924` | profile_media_and_account_closure | 10,771 | applied |
| 56 | `20261105170000` | stay_discovery_filters | 35,364 | applied |
| 57 | `20261105180000` | stay_host_inventory_controls | 14,165 | applied |
| 58 | `20261105210000` | stay_requests_fees_profiles | 21,698 | applied |
| 59 | `20261105220000` | restore_pg_hostel_property_type | 2,107 | applied |
| 60 | `20261106010000` | stay_razorpay_and_verified_upi | 26,236 | applied |
| 61 | `20261106120000` | stay_owner_onboarding_approval | 29,801 | applied |
| 62 | `20261106130000` | stay_booking_guest_contacts | 4,227 | applied |
| 63 | `20261106174309` | security_advisor_forward_fixes | 13,938 | applied |
| 64 | `20261107032340` | authenticated_rpc_security_boundary_audit | 13,921 | applied |
| 65 | `20261107051930` | restrict_service_provider_schedule_access | 3,378 | applied |
| 66 | `20261107121500` | user_favorites_grants | 472 | applied |
| 67 | `20261107183158` | india_location_catalog_search | 13,138 | applied |
| 68 | `20261107201500` | allow_demo_booking_preview | 2,777 | applied |
| 69 | `20261108090000` | india_location_directory | 6,228 | applied |
| 70 | `20261108120000` | movies_showtimes_only | 735 | applied |
| 71 | `20261108130000` | movies_showtimes_dates | 454 | applied |
| 72 | `20261108140000` | distributed_api_rate_limits | 3,521 | applied |
| 73 | `20261108150000` | superadmin_module_visibility | 963 | applied |
| 74 | `20261111190000` | universal_delivery_tracking | 17,092 | **PENDING** |
| 75 | `20261111200000` | dynamic_service_category_builder | 85,321 | **PENDING** |
| 76 | `20261111210000` | service_document_storage_access | 1,825 | **PENDING** |
| 77 | `20261112010000` | business_ownership_phase1 | 18,775 | **PENDING** |
| 78 | `20261112020000` | business_ownership_phase2_backfill | 9,871 | **PENDING** |
| 79 | `20261112030000` | business_ownership_phase3_rls | 9,734 | **PENDING** |
| 80 | `20261112040000` | business_ownership_phase4_rls | 3,772 | **PENDING** |
| 81 | `20261112050000` | business_ownership_phase5_transfer | 2,209 | **PENDING** |

Totals: **81 files**, **73 applied**, **8 pending**.

---

## 4. Migration-to-ledger reconciliation

Method: `supabase_migrations.schema_migrations` read as `version, name` under `begin read only; … rollback;`, then compared against file-name versions and names by script. The comparison was mechanical, not visual.

| Measure | Count |
|---|---|
| Local files | 81 |
| Ledger rows | 74 |
| Ledger rows excluding the baseline marker | 73 |
| Matched (version **and** name) | 73 |
| Pending (file, no ledger row) | 8 |
| Orphan (ledger row, no file) | 1 |
| Duplicate local timestamps | 0 |
| Duplicate ledger timestamps | 0 |
| Applied files whose ledger name differs | 0 |
| Highest applied version | `20261108150000` (`superadmin_module_visibility`) |

### 4.1 The eight pending migrations

| Version | Tables | Functions | Policies | Own transaction | Purpose |
|---|---|---|---|---|---|
| `20261111190000` | 4 | 5 | 5 | no | OTP-verified prescription delivery for service bookings |
| `20261111200000` | 6 | 23 | 12 | **yes** | Dynamic service-category configuration (largest file: 85 KB, 1,831 lines) |
| `20261111210000` | 0 | 0 | 2 | **yes** | Forward-only policy fix: lets a customer upload their own booking document |
| `20261112010000` | 6 | 8 | 12 | no | Business identity model plus 13 `business_id` columns |
| `20261112020000` | 0 | 0 | 0 | no | Deterministic backfill: 7 more columns, ~60 UPDATEs, 6 review INSERTs |
| `20261112030000` | 0 | 2 | 16 | no | Booking-side policies rewritten to business-membership predicates |
| `20261112040000` | 0 | 0 | 7 | no | Finance/enquiry/contact policies rewritten; 12 policy names dropped first |
| `20261112050000` | 1 | 1 | 1 | no | Two-step business ownership transfer with audit trigger |

### 4.2 The one non-migration ledger row

`00000000000000` / `bookourspace_baseline` — recorded as one statement, describing the baseline schema all 73 migrations build on. `supabase/schema_and_rls.sql` exists in the repository but is deliberately not a migration file. Every earlier audit that reported "74 rows / 73 applied" was measuring exactly this.

### 4.3 Why the brief said seven

81 files − 74 rows = 7. That subtraction silently treats the baseline marker as a migration file. The identities that actually hold are:

- **81 files = 73 applied files + 8 pending files**
- **74 rows = 73 applied migrations + 1 baseline marker**

Both sides reconcile with no unexplained element.

---

## 5. Unmatched migration analysis

Every object these eight migrations create was checked against the live catalog. **None of them is present.**

| Candidate object | In target today |
|---|---|
| 17 tables — `service_delivery_otps`, `service_delivery_profiles`, `service_tracking_events`, `service_tracking_locations`, `service_booking_documents`, `service_booking_field_values`, `service_category_configs`, `service_category_config_versions`, `service_category_config_audit`, `service_provider_credentials`, `businesses`, `business_members`, `business_invitations`, `business_module_access`, `business_audit_events`, `business_backfill_review`, `business_ownership_transfers` | **none present** |
| `business_id` columns | **none** (only pre-existing `business_phone`, `business_name`, `business_phone_verified_at`) |
| Functions matching `business%` / `delivery%` / `tracking%` / `category_config%` | **none** |

Hosted state behind that judgement: 74 `public` base tables, 179 `public` functions, 18 `private` functions, 141 `public` policies, 3 buckets (all private), 7 storage policies — consistent with the Gate C census.

### 5.1 What each pending migration touches

- **`universal_delivery_tracking`** — four delivery tables, five `SECURITY DEFINER` functions, five policies, and columns added to `service_bookings` and its own tables. Nothing outside `public` beyond `auth.uid()`, `profiles` and `service_bookings`.
- **`dynamic_service_category_builder`** — six tables, 23 functions (16 `SECURITY DEFINER`), 12 policies. It consumes `service_delivery_*` and `confirm_service_delivery` from the previous file, so order matters and is correct. Transaction-wrapped.
- **`service_document_storage_access`** — 55 lines, two policies, no objects. Both blocks are guarded by `if to_regclass(...) is null then return; end if;`, so it is a no-op when the table is absent and idempotent when re-run. It depends on bucket `bos-private-documents` (**exists**, private) and `public.is_active_user()` (**exists**).
- **`business_ownership_phase1`** — six tables, eight functions, twelve policies, 13 `business_id` columns. Not transaction-wrapped.
- **`business_ownership_phase2_backfill`** — seven more columns, then the only row-writing statements in the set: one `INSERT … ON CONFLICT DO NOTHING` per owner+module, matching membership and module-access rows, ~20 `UPDATE`s that propagate `business_id` from listings outward, and six ambiguity-report inserts. Not transaction-wrapped.
- **`phase3_rls` / `phase4_rls`** — policy replacement only. Phase 3 rewrites 16 policies across `bookings`, `listings`, `payment_intents`, `service_bookings`, `service_payment_intents`, `stay_properties`, `venue_bookings`, `venue_payment_intents`. Phase 4 rewrites 7 across `pg_invoices`, `enquiries`, `provider_contact_settings`, `pg_payment_claims`, `service_payment_claims`, and re-grants `select, insert, update` on `enquiries` and `provider_contact_settings`. Neither is transaction-wrapped.
- **`business_ownership_phase5_transfer`** — one table, one audit trigger function, one policy. Not transaction-wrapped.

---

## 6. Dependency and conflict analysis

### 6.1 Resolution result

Every `public.`/`private.` qualified reference in all eight files was extracted and resolved against (a) the live catalog and (b) the objects the eight files themselves create.

| Migration | Qualified references | Unresolved |
|---|---|---|
| `universal_delivery_tracking` | 12 | **0** |
| `dynamic_service_category_builder` | 38 | **0** |
| `service_document_storage_access` | 2 | **0** |
| `business_ownership_phase1` | 31 | **0** |
| `business_ownership_phase2_backfill` | 26 | **0** |
| `business_ownership_phase3_rls` | 15 | **0** |
| `business_ownership_phase4_rls` | 9 | **0** |
| `business_ownership_phase5_transfer` | 7 | **0** |

Ordering was also checked mechanically: no file references an object created by a **later** file. The chain `universal_delivery_tracking → dynamic_service_category_builder → service_document_storage_access → phase1 → phase2 → phase3 → phase4 → phase5` is exactly the timestamp order. **The existing order is safe.**

### 6.2 Extensions

The eight files reference **no** extension: zero hits for `cron.`, `net.http`, `postgis` or `geography`, and no `create extension`. The Gate D extension blocker (postgis / pg_net / pg_cron) does **not** constrain this set; it belongs to the later Flutter work.

### 6.3 Duplicate-object risk — none

All 17 tables are absent from the target, so no `create table` can collide, and the data-bearing ones use `if not exists`. All 39 functions use `create or replace function`. All 55 policies are preceded by `drop policy if exists`, and the two storage-side blocks are `to_regclass`-guarded. DDL re-run would be idempotent.

### 6.4 Destructive-operation risk — bounded, and the real one

There is no `DROP TABLE`, `TRUNCATE`, `DROP SCHEMA` or `DROP COLUMN` anywhere in the set. The destructive surface is **policy replacement**, concentrated in phase 4, where twelve currently-live policy names are dropped and replaced across `pg_invoices`, `enquiries`, `provider_contact_settings`, `pg_payment_claims` and `service_payment_claims`.

**Only 2 of the 8 files carry their own `begin;`/`commit;`** (`dynamic_service_category_builder`, `service_document_storage_access`). The other six — including the backfill and both RLS phases — are bare statement sequences. Under `supabase db push` the CLI wraps each migration in a transaction, so this is safe **if and only if** the apply goes through a transaction-wrapping path. A manual `psql -f` apply would leave phase 2 or phase 4 half-applied on error, with policies dropped and not yet recreated. This is the single most important execution constraint in the set.

### 6.5 Data-integrity risk — currently near zero

The backfill is the only migration that writes rows, and the target has almost nothing to backfill:

| Table | Rows |
|---|---|
| `listings` | 0 |
| `bookings` | 0 |
| `service_bookings` | 0 |
| `venue_bookings` | 0 |
| `stay_properties` | 0 |
| `payment_intents` | 0 |
| `enquiries` | 0 |
| `reviews` | 0 |
| `provider_registration_requests` | 0 |
| `media_assets` | 1 |
| `profiles` | 8 (1 `provider`) |

The backfill therefore cannot mis-attribute commercial data — no listings or bookings exist. It will create **no** `businesses` rows (its source CTE drives from `listings`) and will write **one** ambiguity-review row: the single `provider` profile that owns no listing. That is a correctness check, not data loss.

### 6.6 Verdict on applying in the existing order

**Safe, in the existing order, provided the apply is transaction-per-migration and a fresh pre-apply archive exists.** No conflict, no duplicate, no destructive DDL, no missing extension, no unresolvable reference.

---

## 7. Production project identity — UNRESOLVED

Production **cannot** be positively identified from the repository. Every configuration surface that would name it is a placeholder, and the guard requires it at runtime.

| Surface | What it says | Named production ref |
|---|---|---|
| `deploy/env.production.example` | `BOS_PRODUCTION_SUPABASE_PROJECT_ID=__PRODUCTION_SUPABASE_PROJECT_REF__` | **placeholder** |
| `deploy/cloudrun/service.yaml` | `value: "${SUPABASE_PROJECT_ID}"`, supplied by `envsubst` at apply time | **runtime** |
| `src/server/supabaseProductionGuard.ts` | Lists the three refs that are *development* and must be refused | names only dev refs |
| `.env.example` | Points at Mumbai and states production must not reuse it | **none** |
| `supabase/backup/react-target.conf` | Approved **backup** target is `obkfgxjzlscungkhbyvq`; `BOS_REJECTED_REFS=sfoizxarbljhldmkgsma ezrxykyocgbolpaebnqx` | none (development backup) |

### 7.1 Project classification, by evidence rather than by name

| Ref | Classification | Evidence |
|---|---|---|
| `obkfgxjzlscungkhbyvq` | **Development** — the project this gate queried | Listed in `DEVELOPMENT_SUPABASE_PROJECT_REFS`; `.env.example` and `env.production.example` both forbid reusing it in production; project name "React", Mumbai, 8 dev users, 0 transactional rows |
| `ezrxykyocgbolpaebnqx` | **Legacy development** (Stockholm) | `DEVELOPMENT_SUPABASE_PROJECT_REFS`; `DATABASE_MIGRATION_PLAN.md` names it as the intended DEV target; `react-target.conf` rejects it |
| `sfoizxarbljhldmkgsma` | **Retired** (Mumbai) | `DEVELOPMENT_SUPABASE_PROJECT_REFS`; `GOOGLE_OAUTH_MUMBAI_REPORT.md` marked SUPERSEDED |
| `zykxneztahxbjduagutv` | **Not BookOurSpace at all** | `docs/supabase-dev-setup.md`: `bookmyspace-dev`, ap-south-1, PG 17.6, a *different application* — no `public.listings`, no `stay_*`, unrelated BookMySpace migration history; "Do not reuse" |
| `ehxuygrsyaknhhsaihhx` | **Unverified candidate — unresolved** | Cited as a production candidate in the Flutter repository evidence gathered at Gates C/D. **It appears nowhere in this repository** (zero matches), and the authenticated account lists only two projects — Stockholm and Mumbai/"React" — so this ref is not among them |

### 7.2 Why it stays unresolved

Three independent things would have to agree, and none does: (1) a committed configuration value — absent, by design; (2) a reachable project in the authenticated org — the accessible org contains only `ezrxykyocgbolpaebnqx` and `obkfgxjzlscungkhbyvq`; (3) a runtime declaration — `BOS_PRODUCTION_SUPABASE_PROJECT_ID` is unset everywhere, and production fails closed without it.

Name similarity cannot settle this, and the guard exists precisely to make that impossible. **Resolution requires the owner to state the production project ref**, and separately to confirm whether the Flutter app shares it. Until then no pre-cutover archive can be taken, because there is no defensible source database to archive.

---

## 8. Recovery prerequisite status

| Prerequisite | Status | Evidence |
|---|---|---|
| Backup freshness | **PASS** | Four consecutive daily PHYSICAL backups `COMPLETED`: 2026-11-24 02:39:53Z, 2026-11-23 02:39:07Z, 2026-11-22 02:39:06Z, 2026-11-21 02:39:01Z |
| Backup integrity evidence | **NOT VERIFIED THIS GATE** | No archive downloaded, decrypted or restored. Prior local drill evidence exists; no hosted archive has ever been restore-verified |
| Point-in-time recovery | **DISABLED** | `pitr_enabled: false` (Gate D) |
| Local restore prerequisites | **PARTIAL** | `pg_restore 17.11` matches server 17.11; `initdb` present; no current dump exists to restore (no credential, and `supabase db dump` needs Docker) |
| Encryption readiness | **BLOCKED** | `gpg --list-secret-keys` and `--list-keys` both return nothing; `age` absent; only `openssl` available. No recipient exists, so `backup_production_readonly.sh` refuses by design |
| Docker | **BLOCKED (not started, by rule)** | `Cannot connect to the Docker daemon … Is the docker daemon running?`; Docker.app is installed |
| Disk capacity | **DEGRADED** | 9.1 GiB free of 926 GiB (99 % used). Sufficient for a 145 kB database, thin for a dump plus isolated cluster plus ciphertext plus retained history |
| Hosted clone requirements | **NOT MET** | Paid plan, physical backup required, DB-only scope (schema, data, roles, ACL, auth users and hashes, Vault root key); excludes Storage bytes, Edge Functions and secrets. Not requested |
| D7 development-project protection | **ARMED, UNCHANGED** | `DEVELOPMENT_SUPABASE_PROJECT_REFS` still lists `obkfgxjzlscungkhbyvq`, `ezrxykyocgbolpaebnqx`, `sfoizxarbljhldmkgsma`; production refuses them and refuses to start without an explicit production ref |
| Read-only hosted access | **DEGRADED** | `supabase db query --linked` from the repository root fails with `Cannot find project ref. Have you run supabase link?` — the untracked `supabase/config.toml` and `supabase/.temp/project-ref` are gone. Queries succeeded only through the pre-existing stale link state in `.local/pre-fix-backup`. **No link was created and no state was repaired** |

---

## 9. Risks and recommended remediation

| # | Risk | Severity | Remediation |
|---|---|---|---|
| R1 | Production project unidentified | **Blocker** | Owner states the production ref explicitly; do not infer from names. Then re-run this reconciliation against that project |
| R2 | No encryption recipient | **Blocker** | Owner creates the recovery key and records the fingerprint; until then the backup scripts correctly refuse |
| R3 | Six of eight pending migrations are not self-transactional | **High** | Apply only through a transaction-wrapping path (CLI `db push`, or `psql -1`). Never statement-by-statement |
| R4 | Phase 4 drops twelve live policy names before recreating them | **High** | Treat phase 4 as the rollback-sensitive step; capture the pre-apply policy definitions in the archive schema dump first |
| R5 | No rehearsal has ever completed end-to-end | **High** | Run the local drill against a real pre-apply dump before any hosted write, then one hosted clone to measure RTO |
| R6 | Read-only access depends on stale link state in `.local/pre-fix-backup` | **Medium** | Restore a proper link (owner action) so verification does not depend on a directory that can be cleaned away |
| R7 | Disk at 99 % | **Medium** | Reclaim space before a rehearsal that materialises a second copy |
| R8 | Docker daemon down | **Medium** | Start Docker Desktop (owner action) if the `supabase db dump` path is wanted; otherwise use the local 17.11 `pg_dump` |

---

## 10. GO / NO-GO

Split verdict, because these are two different questions.

### 10.1 Migration-history reconciliation — **GO (complete)**

The baseline is reconciled with no unexplained element: 81 files = 73 applied + 8 pending; 74 rows = 73 migrations + 1 baseline marker; 0 duplicates, 0 name mismatches, 0 ordering inversions, 0 unresolved dependencies, 0 duplicate-object collisions. All eight pending migrations arrive in one commit and all sit after the current ledger maximum.

### 10.2 Next recovery stage (pre-cutover archive + restore rehearsal) — **NO-GO**

Justification, in order of weight:

1. **The production database is unidentified (§7).** An archive of the wrong project is worse than none, and the repository deliberately holds no concrete production ref.
2. **No archive can be encrypted (§8).** The keyring is empty and the backup script fails closed without a recipient — correctly.
3. **Recoverability is still unproven end-to-end.** No hosted archive has ever been restored; the only restore evidence is a local drill against a local dump.
4. **The rehearsal has no room and no tooling yet:** 9.1 GiB free, and the Docker daemon is down.

### 10.3 What must be true before this flips to GO

- The owner names the production project ref, and confirms whether Flutter shares it.
- An encryption recipient exists, with custody outside both repositories.
- One pre-apply archive is taken from the identified production source and **restored successfully** into an isolated cluster.
- The apply path is settled as transaction-per-migration, with the phase-4 policy set captured first.
- Disk headroom is restored above a comfortable margin.

None of these is a code change. Items 1–3 are owner decisions or owner actions; this gate stops here rather than approximating them.

---

## Appendix A — How the hosted figures were obtained

All hosted reads were `SELECT`-only, wrapped in `begin read only; … rollback;` against `obkfgxjzlscungkhbyvq`. Because the repository link state is gone, the working invocation was:

```
npx --no-install supabase db query --linked --workdir .local/pre-fix-backup --file <sql>
```

`--project-ref` alone is rejected: *"--project-ref only applies when targeting the linked project; use it with --linked"*. `.local/pre-fix-backup` is a pre-existing untracked artefact; it was used as-is and **not** modified, recreated or linked.

## Appendix B — Evidence boundary

Verified in this gate: Git baseline; the 81-file inventory; the 74-row ledger; the exact 73/8/1 reconciliation; hosted absence of all 17 candidate tables and the candidate columns; zero unresolved references; intra-set ordering; transaction wrappers; row counts for the backfill target; backup freshness; keyring, Docker, disk and tooling state; D7 contents; production-identity surfaces.

**Not** verified: backup archive integrity (none downloaded); any restore; PITR; the production project (unidentified); the Flutter repository state (outside this workspace, not re-read this gate); Edge Function deployment; Storage object bytes.

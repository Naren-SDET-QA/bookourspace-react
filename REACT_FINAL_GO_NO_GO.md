# React Final GO / NO-GO

**Decision date:** 2026-11-24
**Question:** may the eight pending React migrations be applied to `obkfgxjzlscungkhbyvq`?

## Verdict

| Scope | Verdict | Basis |
| --- | --- | --- |
| Local code quality (typecheck, build) | **GO** | `tsc --noEmit` exit 0; `vite build` exit 0, 0 errors |
| Local test suite | **CONDITIONAL** | 472/491 pass; the 17 failures are stale business-context fixtures (Approval F), not regressions |
| Read-only database investigation | **COMPLETE** | 74 rows / 73 real / 8 pending; 0/17 tables; 0 function collisions; 0 partial application |
| **Applying the 8 migrations** | **NO-GO** | no verified restore point (B-1), credential incident open (B-3), business-context rollout undecided (B-5) |
| Declaring the project "fully migrated" | **NO** | 0 of 8 applied; `REACT_POST_MIGRATION_VERIFICATION.md` deliberately not created |

**One sentence:** the migrations are ready to run; the database is not ready to be changed.

---

## 1. What is actually complete

| Item | Evidence |
| --- | --- |
| Ledger reconciliation, permanently | 74 rows = 1 synthetic baseline + 73 real versions → **8 pending**; the five-gate "7 vs 8" contradiction is closed |
| Pending set identified exactly | the 8 files named in `REACT_MIGRATION_EXECUTION_PLAN.md` §2 |
| 17-table figure reconciled | the 8 files declare exactly 17 `CREATE TABLE`s; **0 of 17** exist live |
| No partial application | 0/17 tables, 0/36 function collisions, both step-3 guards present |
| Destructive-operation audit | 0 `DROP TABLE`, 0 `DROP COLUMN`, 0 `TRUNCATE`, 0 `DELETE`, 0 extensions, 0 non-transactional statements outside two deliberate file-level commits |
| `SECURITY DEFINER` posture | every definer in the pending set pins `search_path`; live count of unpinned definers = 0 |
| Target safety | dev project confirmed on four grounds; production untouched; root not linked |
| The SQL itself | already applied cleanly to the project's local PostgreSQL 17 cluster — all 17 tables and 8 helper functions exist there |
| React app ↔ schema agreement | delivery-tracking select matches the creation + alteration of `service_delivery_profiles` column for column |
| Recovery gap named | the 14 legacy tables are enumerated exactly, not estimated |
| Credential incident quantified | the exposed postgres-equivalent role still exists (`cli_login*` = 1) |

## 2. What is missing

| # | Missing | Consequence |
| --- | --- | --- |
| B-1 | A verified, decryptable archive of the current 74-table state (incl. the 14 legacy tables) | a failed step 5 has no rollback path |
| B-2 | Restore rehearsal | "decryptable" would still not equal "recoverable" |
| B-3 | Credential rotation / role removal decision | execution would use a postgres-equivalent path whose equivalent is exposed |
| B-4 | Acceptance of stop-and-verify discipline given two files commit early | partial-file application risk unmanaged |
| B-5 | Decision on shipping the business-context selector before/with execution | every provider write would 403 immediately after the backfill |
| B-6 | Decision on the 17 stale integration fixtures | Phase 9's "relevant tests pass" cannot be claimed |

## 3. Owner approvals required — all currently PENDING

| # | Approval text | Turns into |
| --- | --- | --- |
| **A** | "Approve `REACT_MIGRATION_EXECUTION_PLAN.md` v2: the 8 versions, in the stated order, against `obkfgxjzlscungkhbyvq`." | a green-lit plan |
| **B** | "Authorise one schema-only capture of the development project, its encrypted archive, and a decrypt+integrity verification." | **the restore point** |
| **C** | "Authorise Storage configuration capture (buckets, visibility, limits, `storage.objects` policies)." | complete step-3 coverage |
| **D** | "Sequence the credential rotation: rotate now / remove the CLI role first / accept the incident open during execution." | R-6 resolved |
| **E** | "`migration repair` remains forbidden; a failed step means stop, verify, report." | R-2 discipline |
| **F** | "Update the 17 stale integration fixtures to send `x-business-id`, or review the 403/404 and error-ordering assertions as intended behaviour." | Phase 9 testability |
| **G** | "Authorise a restore rehearsal into a scratch local database (never the hosted project)." | proven recoverability |

Any one of these may be refused. **B is the only one that changes the migration verdict from NO-GO to GO.**

## 4. Explicitly not authorised by this document

Applying the 8 migrations · creating a dump, archive or encryption · decrypting an existing archive · restoring anything · restoring into the hosted project · rotating or testing any credential · changing `.env`, Keychain or GPG keys · installing an extension · editing a historical migration · creating a corrective migration · `migration repair` · any Git reset/checkout/clean/stash/commit/push/merge · touching the Stockholm project · touching Flutter.

A general instruction to "fix everything" is not any of the above.

## 5. Definition of done (Phase 9) — for later

The project may be called complete only when **all** of these are evidenced from real output:

1. Ledger shows **82 rows** = 81 real versions + the synthetic baseline; 0 pending; 0 unexpected versions.
2. **91** base tables (+1 view), **215** functions, **56** triggers, RLS **91/91**, `FORCE RLS` 0, extensions still 7, event triggers 7.
3. The 17 named tables, 36 named functions, 16 named triggers and the named policies all exist — including both storage policies (proving step 3 did not no-op).
4. `business_backfill_review` contents recorded; no silently unmapped rows.
5. `npm run lint` exit 0; `npm run build` exit 0; suite green against a live local DB with the 17 stale fixtures resolved (Approval F).
6. Authenticated provider, customer and admin flows exercised against the migrated database — provider writes with `x-business-id` succeed, and 403 without it is confirmed as intended.
7. RLS behaviour spot-checked with two distinct accounts (no cross-tenant reads).
8. `REACT_POST_MIGRATION_VERIFICATION.md` written **from the actual query output**, plus the archive's verification record.

Anything unverified stays unclaimed.

## 6. Recommendation

Grant **B** and **C** now, decide **D** and **F** in the same pass, and let the archive be created and verified before any migration runs. The migration content has been audited statement by statement and has already executed against a local PostgreSQL 17 database without error — the missing ingredient is a proven way back, not confidence in the forward path.

Fastest safe path to green:

1. Approve B + C → capture → archive → decrypt-verify (no restore yet).
2. Approve D → rotate credential / remove the CLI role, or record why not.
3. Approve A + E → run `migration up`, verifying §10 assertions afterwards.
4. Approve F → modernise the 17 fixtures so the suite can actually gate the release.
5. Approve G → rehearse the restore, then write the post-migration verification from real output.

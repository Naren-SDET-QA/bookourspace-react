# Mumbai Forward-Only Migration Recovery Plan

**Target:** Supabase project `obkfgxjzlscungkhbyvq` (`ap-south-1`)
**Scope:** exactly `20261105150000`, `20261105160000`, `20261105170000`, in order.
**Excluded:** `20261105180000_stay_host_inventory_controls.sql` and every other migration.
**State:** preparation only; no hosted write has been performed by this runbook.

## Preflight evidence

- Supabase project identity read-only check: ref matches the target, region is `ap-south-1`, status `ACTIVE_HEALTHY`.
- Hosted ledger before execution: 53 entries including baseline, latest `20261105140000_media_anon_policy_split`; none of the three target versions exists.
- Local manifest: baseline + 56 migration files, unique versions and SHA-256 checks verified.
- Target SHA-256:
  - `20261105150000_server_media_byte_validation.sql`: `923566a56784407e6b95b1b9304080398d1020a7c579acf506fdb202203b73d5`
  - `20261105160000_media_published_listing_visibility.sql`: `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f`
  - `20261105170000_stay_discovery_filters.sql`: `ece6230b3cef258edb2d7f6063212f65579f0ea7d68ea16c4694606f1f94cb05`
- Required relations and function dependencies exist in Mumbai. Read-only counts: 0 bookings, 0 stay allocations, 0 payment intents, 1 media asset, 2 `bos-public-media` objects (one JPEG, one WebP; 148,357 metadata bytes total), and 0 Stay properties.
- Current `media_assets` RLS is enabled. Both Storage buckets are private. The current ready-public policy does not require a published listing; `051600` is intended to close this exposure.

## SQL and operational risk review

### 051500 — trusted server byte validation

- Revokes `finalize_media_asset(uuid)` from `PUBLIC`, `anon`, and `authenticated`; retains service-role execution.
- Adds a service-role-only finalizer that checks the quarantined owner asset, checksum, object prefix, dimensions/pixel limit and Storage object byte size before changing `processing_status` to `ready`.
- No row or Storage object deletion; no broad table grants. Explicit `BEGIN`/`COMMIT`.
- **Never roll this back to the old client-callable metadata finalizer.** Recovery keeps the trusted boundary and uses a forward correction.

### 051600 — publication-scoped media visibility

- Adds publication and append-only audit tables, RLS, a Super Admin-checked publication RPC, least-privilege anonymous media projection, and listing/profile/public-asset-scoped read policies.
- Does not update or delete existing media rows or Storage objects. Explicit `BEGIN`/`COMMIT`.
- Locks/DDL are limited to policy, grant, and table metadata operations. The migration replaces the old broad ready-public policies.
- **Never restore the old policy** if verification fails. Correct the new publication predicates or grants forward.

### 051700 — Stay discovery and checkout updates

- Adds Stay discovery columns with defaults/checks, indexes, helper/calendar functions, and replaces Stay checkout/cancellation functions; also grants read on the public Stay host projection/reviews and updates payment-intent attributes.
- Static SQL review found no `DELETE`, `TRUNCATE`, or Storage mutation. It drops/replaces the old Stay property-type constraints and changes routines, so a down migration that drops added columns or restores old routines is not considered safe after use.
- Index creation is non-concurrent and constraint creation can scan tables; expect write-blocking locks on `stay_properties`/`stay_room_types` during those statements. Current Stay property count is zero, but active traffic/transactions can still contend for locks. Stop on lock timeout or unexpected long wait; do not kill unrelated sessions.
- File has no explicit top-level transaction wrapper. The local fault-injection test wraps it in one to model the migration transaction. Confirm the migration executor provides atomic execution before hosted use; if not confirmed, do not execute this file under the present approval.

## Failure detection and stop conditions

Apply exactly one migration at a time with the migration tool and exact SQL file. Never use a broad push. Before each step, re-read the project reference and ledger. After the tool returns, re-read the ledger and schema before considering the next migration.

Stop immediately on SQL error, timeout, checksum mismatch, wrong project, unexpected ledger version, missing object/function/policy, wider-than-approved grants, failed object integrity check, or count changes to protected data. Do not reapply, manually mark a version, run `051800`, or issue rollback SQL.

For a command failure, capture the sanitized error and determine whether the migration version was recorded. If absent, compare the schema and grants to the pre-step fingerprint to determine whether the transaction fully rolled back. If recorded or state is ambiguous, stop with the ledger and catalog evidence; do not attempt automatic repair.

For a post-commit verification failure, leave security protections in place. Prepare a new, separately reviewed and owner-approved forward migration. Never remove the server-only finalizer, restore broad ready-public policies, widen anon grants, or drop publication/audit history as a recovery action.

## Required checks after each migration

At each checkpoint, compare ledger and protected-data counts with the immediately preceding checkpoint. Read-only object checks must still show the same two Storage objects and byte metadata; verify downloaded bytes/signatures and compare JPEG SHA-256 with the stored media checksum without printing object paths or credentials.

### After 051500 (ledger 54)

- Latest ledger version is `20261105150000`; no later version is present.
- `finalize_media_asset(uuid)` is not executable by `PUBLIC`, `anon`, or `authenticated`; service role retains execution.
- `finalize_media_asset_server(uuid,uuid,text,integer,integer)` exists; execution is service-role-only.
- Media RLS remains enabled; existing image object count, sizes and byte hashes are unchanged.

### After 051600 (ledger 55)

- Latest ledger version is `20261105160000`; no later version is present.
- Publication and audit tables exist with RLS enabled; direct anon/authenticated DML is denied; publication RPC is callable only by authenticated users and internally requires active Super Admin.
- Public media requires a ready public asset plus an active listing reference, approved provider avatar projection, or active explicit public-asset publication. Storage object reads use the same media reference rule.
- Anon receives only the approved lookup columns; no `id`, `owner_id`, `parent_id`, checksum, caption, or private metadata column grant.
- Anonymous read probes: published listing media succeeds; quarantined, orphaned, draft/unpublished, private and unapproved banner/category media fails. Movies remains discovery artwork only.
- Existing Storage objects remain byte-identical.

### After 051700 (ledger 56)

- Latest ledger version is `20261105170000`; no later version is present.
- Stay discovery columns, checks, indexes and functions exist; checkout/cancellation execute grants remain service-role-only where required; public host/review reads remain constrained by RLS.
- Read-only counts for bookings, allocations and payment intents match the pre-migration counts; no image row/object changes.
- Run read-only booking/availability authorization probes; do not create bookings, payment intents, refunds, images, or test rows in Mumbai.

## Disposable PostgreSQL failure-injection evidence

The local PostgreSQL 17 runner now injects a deliberate division-by-zero immediately before transaction commit for each of the three candidate migrations, then verifies the DDL/grant/policy state and booking, allocation, payment-intent, media-asset, and Storage-object counts are unchanged. It then applies the original candidate files and runs the existing security/regression suites. This validates transactional failure handling in local PostgreSQL; it does not prove remote platform transaction behavior, hosted permission state, or production recovery.

## Approval boundary and residual risks

This document is a plan, not execution approval beyond the three migration names already authorized. Do not proceed if the migration tool's atomic behavior for `051700` cannot be established, if locks cannot be safely obtained, or if any checkpoint differs. There is no verified backup in scope; recovery after a committed failure is forward-only and requires a new reviewed migration and separate approval. No hosted changes, uploads, deletions, code push, or deployment are authorized by this document.

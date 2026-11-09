# Mumbai hosted preflight and owner approval pack

**Status:** read-only preflight completed on 2026-11-06. No hosted DDL, DML, Auth creation, backup, or Storage write was performed. This document prepares the owner decision; it does not authorize migration execution or backup.

> **Current reconciliation status (2026-11-07):** Use the “Final local migration reconciliation” addendum and the later “Final stays regression + migration parity checkpoint” at the end of this document as authoritative for current local files and tests. They supersede older counts, hashes, and blockers in the historical snapshots below. Per the latest owner-provided hosted read-only status, the ledger has 53 entries, 14 migrations are pending (`20261107121500_user_favorites_grants` was added by the latest checkpoint), and order 66 had a checksum mismatch. That earlier task selected and locally validated order 66, synchronized both repositories/manifests, and ran both guarded installer `--plan` commands successfully; the latest checkpoint re-pinned the manifest at 66 migrations and re-ran both plans. Hosted ledger/grants were not queried anew during this local verification; no hosted changes were made. The off-device recovery gap remains unresolved.

## Target and migration ledger

The Supabase project lookup resolved the target as **React**, ref `obkfgxjzlscungkhbyvq`, region `ap-south-1` (Mumbai), PostgreSQL 17.11, `ACTIVE_HEALTHY`. All follow-up catalog queries were SELECT-only; explicit `BEGIN READ ONLY` checks reported `transaction_read_only=on`.

The hosted migration API and `supabase_migrations.schema_migrations` agree: 53 ledger entries including the baseline, 52 applied migration versions, latest `20261105140000_media_anon_policy_split`. There are exactly seven later local migrations, and none is present in the hosted ledger. The 52 common versions have matching names and order in the local manifest. The hosted ledger stores version, name, and SQL statements, but has no file SHA-256 column; byte-for-byte checksums for already-applied files cannot be independently attested from that ledger. The pending files below match their local manifest SHA-256 values.

| Order | Version | Name | Local SHA-256 |
|---:|---|---|---|
| 54 | 20261105150000 | server_media_byte_validation | `6b1cced1c112679f80e152630587fb54c0d5521223a0789617ad8ed03e37d49c` |
| 55 | 20261105160000 | media_published_listing_visibility | `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f` |
| 56 | 20261105163924 | profile_media_and_account_closure | `a4aa10b30eb0cdd612896ee88384cf6cc25c0419de85d05c791804f4d7d7e440` |
| 57 | 20261105170000 | stay_discovery_filters | `4693e0930088538aaf076d9d331d04808dcffd778772ddfa66336d8057b66d4e` |
| 58 | 20261105180000 | stay_host_inventory_controls | `6dfa942e28b3290e8741173a487b629ff304a697952d0c6f8a8960bb57e7f548` |
| 59 | 20261105210000 | stay_requests_fees_profiles | `f22c3b1700135c02eaf1ae69c2d028743558cb07b0dd7dcbd3c22ea50996922a` |
| 60 | 20261105220000 | restore_pg_hostel_property_type | `3d476396f23466878c7245c59d01edc9c135955160c74d7a50b1574717292889` |

Both repositories pass `migration_manifest.mjs` and the Mumbai installer guard tests. Each pending file has a `BEGIN`/`COMMIT` boundary; the full local 59-migration chain and fault-injection rollback tests pass.

### Ordering and lock review

1. `05150000` hardens server media finalization and requires server-validated byte metadata.
2. `05160000` creates explicit publication/audit records and changes public media visibility. It has no automatic publication backfill.
3. `05163924` adds private profile media, closure audit, session revocation, and account-status denial.
4. `05170000` adds stay discovery fields, functions, and ordinary indexes.
5. `05180000` adds stay inventory ownership controls and the hardened availability implementation.
6. `05210000` adds stay request, fee, and profile behavior.
7. `05220000` conditionally restores the `pg_hostel` property-type constraint; `05170000` already contains that value, so it avoids an unnecessary drop/rebuild on the expected state.

All seven are ordered by their manifest version and the full chain applies locally in that order. There are no `CREATE INDEX CONCURRENTLY` statements. The stay-discovery migration creates ordinary indexes and alters existing tables inside its transaction; index creation can block writes while scanning, and some `ALTER TABLE` operations need stronger locks. Production duration and lock impact were not measured on Mumbai. Schedule the approved apply for a low-traffic window and monitor lock waits. If a transaction fails before commit, PostgreSQL rolls back its DDL. After a committed migration, use a reviewed forward fix; do not run ad hoc destructive rollback SQL.

The hosted catalog currently reports 92 public SECURITY DEFINER functions: zero PUBLIC EXECUTE grants, zero functions without a pinned `search_path`, seven executable by `anon`, and 51 executable by `authenticated`. `anon` and `authenticated` cannot CREATE in `public`. The new publication function is super-admin checked; profile-media finalization and account closure are granted only to `service_role` in the pending source. Local migration and security tests validate these grants. The hosted project has not run these seven definitions yet.

## Media visibility finding and safe plan

The hosted catalog contains one `media_assets` row marked `privacy=public`, `processing_status=ready`, `parent_type=provider_listing`. Its `parent_id` has no matching row in `public.listings`; its owner profile exists. The row is tagged `bos-media-test-20261105`, which suggests a test association, but ownership and intended display were not inferred from that label.

Two matching Storage metadata rows exist in `bos-public-media`, whose bucket flag is `public=false`:

- Original JPEG: 138,395 bytes.
- Registered 320-pixel WebP variant: 9,962 bytes.
- Combined Storage metadata size: 148,357 bytes.

Both rows have the same owner scope. The variant is registered in the asset’s `variants` JSON. The private-document bucket has zero objects; no private media rows were found. No object bytes were downloaded. The current RLS policy permits anonymous reads of ready assets marked public, including this orphan and its variant, even though the bucket is not globally public. The object itself was not fetched.

`media_asset_publications` does not yet exist. The pending visibility migration requires listing media to match an active listing, same owner, and a `storage://` reference in the listing payload. It also leaves banner/category media unpublished until an authorized super-admin records an audited publication. Under that policy, the orphan should remain unpublished and unreadable anonymously. Keep its database metadata and both Storage objects intact; do not create a publication row or delete either object. If the owner confirms it belongs to a real listing, reconcile the correct listing association through the authorized application flow after migration approval.

Before any approved migration:

1. Re-run the read-only inventory and record counts, owners, privacy, object sizes, variant references, and listing matches.
2. Prepare a separately encrypted Storage-byte archive and isolated restore check. The PostgreSQL backup archive does **not** contain Storage object bytes.
3. Apply the reviewed migration chain only after owner approval. Do not blanket-publish existing media; backfill only rows that have an independently verified active parent and intended public presentation. Leave the orphan out.
4. Verify anonymous reads are denied for the orphan and private media, while active published listing media and owner-scoped access continue to work.

## Encrypted backup and restore procedure

The local recovery drill passed in both repositories: baseline plus 59 migrations, `pg_dump -Fc`, restore into a clean database, and equal source/restore catalogs (71 tables, 182 functions, 139 policies, 275 indexes; all 71 public tables had RLS enabled). The restored copy preserved the Google Auth user/identity and passed profile-privacy assertions. The encrypted backup self-test produced encrypted, checksum-verified archives, restored Auth and Storage metadata, and removed plaintext dumps. It was run against disposable local PostgreSQL with a temporary GPG key; it was not a Mumbai backup. Backup guard tests passed 5/5.

Owner-approved hosted procedure, using `supabase/tests/backup_production_readonly.sh`:

1. Approve **backup-only** for exact ref `obkfgxjzlscungkhbyvq`; provide the owner GPG recipient and external keyring. Keep the keyring outside both repo and archive.
2. Use the guarded Mumbai target/Keychain connection with TLS and `default_transaction_read_only=on`. The script rejects a wrong project, missing encryption, or missing approval before dumping.
3. Produce the custom-format database archive, schema, TOC, Auth/migration preflight, restore evidence, encryption record, and SHA-256 manifest. The script requires `auth.users` and `auth.identities`, restores into an isolated local cluster, compares table/RLS/policy/Auth/Storage metadata counts, encrypts the dump, verifies decryption/checksum, and removes plaintext.
4. Separately archive Storage bytes with the approved Storage export path, encrypt that archive, and restore into an isolated bucket with private/public settings and object paths preserved. Verify object hashes and counts; never make private objects public to simplify restore.
5. Owner reviews the backup evidence, recovery point, and Storage restore evidence before separately approving any migration execution.

### Mandatory Storage backup approval gate

Do not approve or start a hosted migration until every item below is evidenced for the exact project reference and immediately pre-change recovery point:

- Inventory every bucket and object using read-only metadata plus an authorized byte download, including private buckets. Record bucket privacy, object count/bytes, MIME type, size, owner scope, and variant relationships; ensure the byte export count equals the metadata inventory.
- Download each object without changing hosted state. Compare downloaded byte length to Storage metadata and generate a SHA-256 manifest covering every object and archive member.
- Encrypt the object-byte archive with the owner-controlled recovery key, verify the encrypted file checksum, decrypt it using the recovery key, and compare the plaintext archive checksum. Keep plaintext only on encrypted/volatile staging; never place the keyring beside the archive.
- Restore the archive into isolated local or disposable Storage with bucket privacy, paths, metadata, and object bytes preserved. Download the restored objects again and verify every size and SHA-256. Test private-object access as an unauthorized client and confirm it is denied; do not relax RLS or bucket privacy for the drill.
- Create and verify both the fresh encrypted database backup and the separate fresh encrypted Storage-byte backup before the first hosted write. Record the exact target, archive hashes, object totals, restore result, and recovery owner. Any missing/failed evidence is a **NO-GO**; do not proceed on the basis of the database archive alone.

This gate is independent of migration checksums and transaction safety. Approval of a migration does not approve Storage uploads, deletes, visibility changes, profile backfills, or Auth changes.

The local restore drill and encrypted self-test pass. Hosted backup, hosted restore, PITR-window verification, and Storage-byte export/restore remain unperformed.

## Google OAuth QA readiness

The [Google-only OAuth QA runbook](qa-google-oauth-e2e.md) covers Web, Android, and iOS first signup, returning login, callbacks, persistence, profile edits, server roles, logout, protected routes, and stale unexpired-token denial after account closure.

The project list currently contains the Mumbai React project and a legacy Stockholm project; neither is designated here as the explicitly approved non-production QA project. Do not use either for real OAuth tests or create Auth records until the owner supplies the exact non-production project ref and separately authorizes disposable QA identities. No live Google sign-in was attempted.

## Size evidence

Read-only Mumbai measurements on 2026-11-06: PostgreSQL database **18,470,579 bytes**; Storage metadata **2 objects / 148,357 bytes**. Compared with the prior read-only snapshot (18,413,235 bytes and 2 objects / 148,357 bytes), database size is **+57,344 bytes** and Storage metadata size is unchanged. No hosted writes were issued in this preflight, so the database growth is not attributed to this work. The Storage size is metadata-reported; no object bytes were read.

## Final pre-production verification (2026-11-06)

No hosted operation was performed. The migration installer guard was rerun and passed: it accepted the exact Mumbai reference only after the explicit environment approvals, rejected wrong project/endpoint and missing approvals, and the guarded happy path stopped at the test-only `psql` stub. No hosted connection was opened.

The seven pending files, their SHA-256 values, ordering and transaction boundaries remain as listed above. The review found ordinary blocking indexes/table changes in `20261105170000`; production lock duration is still unmeasured. The guarded forward-only recovery plan remains required after a committed migration. The two Storage objects and the orphan media row were left unchanged. The existing media row is marked `privacy=public` under the current metadata RLS policy; the bucket itself is `public=false`, and direct object reads were not attempted. After the visibility migration is approved and applied, keep the orphan unpublished/unreadable until the owner verifies the listing association; retain both objects.

Android diagnosis: the emulator process and data were preserved. The Android Debug Bridge transport was offline even though the emulator remained alive; restarting only the host ADB server restored `adb shell`, `pm path`, install and launch. The rebuilt APK was installed with `adb install -r`; the foreground activity was `com.bookourspace.app/.MainActivity`. The actual WebView route check passed for all six modules (PG, Classes, Venues, Services, Stays, Movies). Movies showed zero cards and “No shows found”; no seeded title/cinema/showtime appeared.

The Movies route in both repos had a separate `MOVIES_APP_DATA` fallback, independent of the listing-discovery filter. That fallback was removed; explicit owner-entered local cards remain local-only. The web E2E now asserts the empty state and absence of bundled sample cards. React Chromium shell/builder regression: 30/30 passed, with the added Movies test separately 1/1 passed on a dedicated test port. Capacitor Chromium shell/builder regression: 25/25 passed. Movies discovery safety tests: React 4/4 and Capacitor 4/4 passed. The latest full Capacitor suite evidence remains 69 total, 46 passed, 23 skipped, 0 failed, recorded before this isolated Movies fallback removal; the current focused suite and new Movies test cover the changed route. A parallel full browser-matrix attempt in this pass stalled without producing a report and was stopped; it is not counted as a pass.

iOS 26.5 iPhone 17 Pro: rebuilt app installed and launched to the home screen. The Movies route loaded its hero, city selector and search. The lower result/empty-state region was not visible in the captured viewport and simulator scrolling did not advance it, so iOS no-sample-result runtime verification remains incomplete; web and Android assertions pass. The iOS native location prompt was handled in the simulator for this authorized runtime check; no hosted location or account data was sent.

The disposable local restore evidence remains valid: no migration/schema/backup code changed in this pass, and no hosted data was written. The recorded local restore comparisons remain 71 tables, 182 functions, 139 policies, 275 indexes, with RLS enabled on all 71 public tables. Restore archives remain 859,808 bytes (React) and 859,801 bytes (Capacitor). This pass did not rerun a database restore.

Latest logical build sizes:

| Artifact | React | Capacitor | Capacitor minus React |
|---|---:|---:|---:|
| Web `dist` files | 7,032,387 B | 7,032,270 B | -117 B |
| Android debug APK | 19,200,582 B | 8,742,798 B | -10,457,784 B |
| iOS simulator `.app` files | 14,236,774 B | 14,236,785 B | +11 B |
| Mumbai hosted PostgreSQL snapshot | 18,470,579 B | same project | not applicable |
| Mumbai Storage metadata | 2 objects / 148,357 B | same project | unchanged |

Both web builds, both Android debug builds, and both iOS simulator builds succeeded. OAuth signup/login, persistence, role enforcement and real unexpired-JWT closure denial remain untested because no explicitly approved non-production Supabase project and disposable QA identities are designated. Hosted backup and all seven migrations remain unexecuted pending separate approval.

## Exact Mumbai snapshot verification addendum (2026-11-06)

This addendum supersedes the earlier seven-pending/59-migration counts above. No hosted connection, write, migration, Auth change, payment, push, merge, or deployment was performed.

### Exact snapshot and pending count

The encrypted local preflight archive `~/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-20261106T135330Z-installer-preflight` identifies project `obkfgxjzlscungkhbyvq` in `ap-south-1`. It decrypted locally and matched recorded plaintext SHA-256 `c99c01337f1c3c0d1e71f5c2207b7de72a4e4cb975fd824f61e326e391d57ca6`. A fresh disposable PostgreSQL restore succeeded.

The restored migration ledger has 53 rows through `20261105140000`. The current manifest has 62 migrations plus the baseline marker, so **10** versions are actually missing—not nine. The count difference is the baseline row plus 52 applied migrations. All ten ledger-pending files were applied to the disposable restore in manifest order; no file was skipped or replayed. The final ledger had 63 rows through `20261106130000`, with every version/name matching the manifest. A second manifest pass would apply zero files. The user-stated count of nine is therefore a **FAIL against the archive's observed ledger**, while the corrected all-pending local dry run is **PASS**.

| Version | Migration | SHA-256 |
|---|---|---|
| `20261105150000` | `server_media_byte_validation` | `6b1cced1c112679f80e152630587fb54c0d5521223a0789617ad8ed03e37d49c` |
| `20261105160000` | `media_published_listing_visibility` | `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f` |
| `20261105163924` | `profile_media_and_account_closure` | `a4aa10b30eb0cdd612896ee88384cf6cc25c0419de85d05c791804f4d7d7e440` |
| `20261105170000` | `stay_discovery_filters` | `4693e0930088538aaf076d9d331d04808dcffd778772ddfa66336d8057b66d4e` |
| `20261105180000` | `stay_host_inventory_controls` | `390c7688b72deead74e7b0280cf7873ed47c3bfd85926e68d0ad6406abece09e` |
| `20261105210000` | `stay_requests_fees_profiles` | `f22c3b1700135c02eaf1ae69c2d028743558cb07b0dd7dcbd3c22ea50996922a` |
| `20261105220000` | `restore_pg_hostel_property_type` | `3d476396f23466878c7245c59d01edc9c135955160c74d7a50b1574717292889` |
| `20261106010000` | `stay_razorpay_and_verified_upi` | `fc65266798f68df881480d0eb59cc5abfbf76b2f1ca6b0f9241534fe47191f63` |
| `20261106120000` | `stay_owner_onboarding_approval` | `3147405e6633530316ed7b318447837917ba3e7fa658064b07eaf253d920f121` |
| `20261106130000` | `stay_booking_guest_contacts` | `44822b66903916a068d3d78c378e2a9d0bbfb2dadc855ac0db0625defc92eb48` |

React and Capacitor now have matching migration content and manifests. Their owner-approval definition unconditionally denies demo listings; React's test-only session-config bypass was removed. Both manifest validators, transaction inventories and Mumbai installer guard suites pass. The focused React stay-listing suite passes 6/6.

### Local restore and security evidence

- All 10 pending migrations have explicit `BEGIN`/`COMMIT`; none uses concurrent index creation or other non-transactional DDL. Every `SECURITY DEFINER` function in this pending chain pins `search_path`. Ordinary table/index/constraint DDL can take blocking locks; production lock duration was not measured. The files ran in order against the exact restored schema, which verifies dependencies locally.
- The final public-schema check found zero tables without RLS. The role-management RPC and the owner-review path were present. Local owner-approval fixtures passed: a customer could not approve; a Super Admin could approve and activate a verified provider/listing with audit rows.
- Local account-closure fixtures passed: sessions were revoked, the account was blocked and scrubbed, audit/payment rows remained, and a one-hour unexpired JWT claim was denied profile, provider-registration and media access. This is local fixture evidence, not a hosted signed-JWT test.
- The media security fixture passed owner-only private profile media access, cross-owner denial, client-finalizer revocation, service-role-only finalization, publication controls, and Super Admin moderation. Its clean-database expectation was adjusted in a temporary test copy to account for the two preserved snapshot objects; the repository test was not changed.
- Auth/profile counts were unchanged at 2 users, 2 identities, and 2 profiles; the snapshot includes one Google identity with a profile. No profile backfill ran. The two Storage object rows and both original bucket records were unchanged. The profile migration added one private bucket, as expected.
- Existing public table row counts were unchanged during the local migration dry run. The disposable database and decrypted dump were removed after verification.

### Backup gate, Storage bytes, and recovery

The installer code requires a new, non-overwriting `.gpg` archive outside the repo before any baseline or migration write. It requires the configured owner key, checks that Auth users and identities are in the dump, verifies the archive TOC, encrypts it, decrypts it for checksum round-trip verification, removes the plaintext, and writes an encrypted-file SHA-256. Installer guards pass in both repos, including refusal of the backup-skip flag and a check that the verified-backup step precedes the first write. This proves the code gate; a new hosted pre-change backup was **not** created because no hosted apply was authorized or attempted.

PostgreSQL backup contents include Storage metadata, not object bytes. The installed Supabase CLI's `storage cp` help exposes local/linked copy modes, but the Docker daemon is unavailable, so no local Storage API is running. End-to-end object-byte export, encryption, and isolated restore are **BLOCKED**. No hosted object bytes were read. Keep the existing objects private/public exactly as recorded; a restore drill must preserve paths, hashes, bucket visibility and MIME/size metadata without widening private access. Supabase documents database backups and object transfers separately: [Database Backups](https://supabase.com/docs/guides/platform/backups), [Storage object downloads](https://supabase.com/docs/guides/storage/management/download-objects).

Recovery is forward-only. A migration failure before its `COMMIT` is rolled back by PostgreSQL. If SQL commits but ledger insertion fails, stop and reconcile; do not replay blindly. For a committed change that needs full rollback, use the verified encrypted pre-change database archive and a separately verified Storage-byte archive to restore an isolated recovery target, validate data/RLS/Auth/Storage, then cut over only under a separately approved recovery plan. Otherwise apply a reviewed forward corrective migration. No destructive down migration or restore was run.

### Final status

| Area | Status | Evidence / limit |
|---|---|---|
| Code and manifests | **PASS** | Matching React/Capacitor hashes, strict demo-booking guard, both installer guard suites |
| Exact snapshot restore and migration dry run | **PASS** | 10 actual missing files applied locally; final 63-row ledger matches all 62 versions + baseline |
| Requested count of nine | **FAIL** | Exact snapshot has ten versions missing through its recorded head |
| Local RLS / Super Admin / owner approval / account closure / media isolation | **PASS** | Disposable PostgreSQL fixtures described above |
| Fresh backup before a future hosted apply | **PASS (code gate)** / **BLOCKED (execution)** | Installer refuses to proceed without a newly encrypted, round-trip-verified backup; no hosted apply was attempted |
| Storage object-byte backup and restore | **BLOCKED** | No local Docker/Storage API; no hosted byte transfer performed |
| Hosted migration state after this work | **BLOCKED / unchanged** | No hosted connection or write was made |

## Complete Storage backup preflight addendum (2026-11-06)

This newer addendum supersedes the preceding Storage-byte **BLOCKED** inventory and archive statements. No hosted SQL write, Storage upload/delete, Auth change, migration, payment, push, merge, or deployment was performed.

### Read-only inventory and encrypted archive

Read-only inspection of project `obkfgxjzlscungkhbyvq` (`ap-south-1`) found two objects, totaling 148,357 bytes, in `bos-public-media` (bucket `public=false`), and zero objects in `bos-private-documents` (also private). The two media objects are a 138,395-byte JPEG original and 9,962-byte WebP variant. Both downloaded sizes matched the Storage metadata. No hotel-verification or customer file was present in the private bucket. No bucket policy or object visibility was changed.

The separate object-byte archive is `~/BookOurSpace_Backups/react/storage-objects/obkfgxjzlscungkhbyvq-20261106T173030Z/storage-objects.tar.gz.gpg` (143,840 bytes). Ciphertext SHA-256: `f9f14c1b63d1d40cbb2f5dd0e400f2a201fb50b8d6654507b9d5bdab8936f7a8`. Decrypted tar SHA-256: `8bc6f51b42f7f35aeca8b63dd895bbecf6b2735a5c760da024aab2451a93b9ae`. GPG owner-key decrypt/round-trip and per-object size/SHA-256 verification passed. Object SHA-256 values: JPEG `ec263ce3fce94b09c2f549a1be56ff7b1f5732c5ca11a08bea5345e42c6b8656`; WebP `bca0d9cbaf9f7cc2470c40b1cf88e839a52decd12f67e552bd1461d5136241a3`. Plaintext download/extraction/restore checks ran on a temporary RAM disk, detached after use. The archive directory is 0700 and evidence/archive files are 0600.

The isolated filesystem extraction and byte/hash comparison passed. A disposable local Supabase project was configured with private bucket definitions to perform a Storage API restore. Its initial start encountered an occupied default port; after changing only the temporary project's ports, its database initialized, then Docker container inspection and service health checks stalled. The Storage API upload/download round-trip and unauthorized-private-read denial test are **BLOCKED**. The previous section's statement that hosted object bytes were not read is superseded by this verified read-only export. The Storage API restore remains a required approval gate.

### Live migration ledger and checksum recheck

The Supabase migration-list API and a separate read-only query of `supabase_migrations.schema_migrations` returned the same 53 entries through `20261105140000`. The local manifest has 62 migrations plus baseline, so exactly 10 are pending. Each current pending file was rehashed and matched the manifest; the exact ten version/name/hash values are listed in the preceding **Exact Mumbai snapshot verification addendum**. The hosted ledger remains unchanged by this work.

### Decision

**NO-GO for hosted migration approval.** The read-only inventory, byte sizes, encrypted archive integrity, filesystem restore, pending count, all ten migration checksums, and hosted ledger alignment pass. Local Storage API restore plus private-object access-control verification is blocked by Docker startup. The saved archive is a verified preflight artifact, not the required fresh database-and-Storage backup pair immediately before a future approved hosted apply. Complete those two gates and obtain owner approval before any hosted migration.

## Native Storage API restore and final ledger recheck (2026-11-07)

This addendum supersedes the prior Storage API **BLOCKED** statement and the 10-pending count. All target-project operations remained read-only. No hosted Storage, SQL, Auth, or other data was changed.

### Docker diagnosis and isolated runtime

Docker Desktop and its `desktop-linux` context were present, but read-only `docker info` and `docker ps` requests each timed out after 4 seconds. The backend log recorded event-stream EOFs; the VM log recorded attempts to signal container processes that were already absent. I did not restart Docker Desktop or stop/delete any pre-existing container, volume, or service. The precise underlying Docker defect remains undiagnosed.

The safe alternative was Supabase's experimental native local runtime, which supports macOS on Apple silicon without a container engine ([Supabase native runtimes](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes)). I used CLI 3.0.0 with a separate temporary project and `SUPABASE_HOME` on a 4-GiB RAM disk. A first 1-GiB attempt could not extract the database artifact; a later attempt exposed a space in the temporary mount path, which was removed. Supabase Storage's 413 response was resolved by setting the disposable stack's global upload limit to the hosted bucket's 100-MiB limit. The resulting native stack reached `Stack is ready`; no repository config or existing Docker stack was changed.

### Storage API restore and privacy evidence

The encrypted archive was decrypted and extracted onto the RAM disk with the owner recovery keyring. The archive manifest was rechecked: two media files, 148,357 bytes total, both per-file sizes and SHA-256 values matched. Both private buckets were created in the isolated stack with `public=false` and their respective 100-MiB and 25-MiB limits. I restored the two archived objects using the supported local Storage CLI transfer (`supabase --experimental storage cp`, with no `--remote` or linked target), downloaded them again through that same Storage API, and verified count, byte totals, object paths, file sizes, and SHA-256 values. All passed. Supabase documents `storage cp` as its object-copy interface ([CLI `storage cp`](https://supabase.com/docs/reference/cli/supabase-storage-cp)).

Anonymous direct reads of both restored objects were denied while the bucket remained private. The hosted private-document bucket is empty, so I used one synthetic text object and two disposable local Auth users, all confined to the RAM-backed stack, to exercise the private owner policy. A local copy of the hosted `Owners and Super Admins read private documents` predicate allowed the owner-prefix user and denied anonymous and different-user requests. The local `is_active_user` and Super Admin predicate stubs returned false; therefore the Super Admin branch was not exercised. No hotel verification document or customer file was copied or exposed. The Storage API byte/path checks passed, but the restored `storage.objects` MIME metadata was not independently queried after upload; that metadata round-trip remains **BLOCKED** for the checklist gate. The local stack was stopped and both task-created RAM disks were detached after verification; the encrypted archive remains intact.

### Hosted unchanged check and current migration count

Final read-only queries still show `bos-public-media` as `public=false`, 2 objects / 148,357 bytes, with the same November 5 update timestamps recorded in the archive inventory; `bos-private-documents` remains `public=false` with 0 objects. The Storage CLI was explicitly local and the hosted query confirms no change to either bucket or its object counts.

The hosted migration-list API and direct read-only ledger query still agree: 53 ledger rows including baseline through `20261105140000`. Both React and Capacitor manifests now contain 63 migrations, with matching ordered version/name/hash entries; every migration file in both repositories matches its manifest. Therefore **11** migrations are pending. This is a newer local manifest than the preceding 62-migration snapshot, which accounts for the additional `20261106174309` migration.

| Pending version | Migration | SHA-256 |
|---|---|---|
| `20261105150000` | `server_media_byte_validation` | `6b1cced1c112679f80e152630587fb54c0d5521223a0789617ad8ed03e37d49c` |
| `20261105160000` | `media_published_listing_visibility` | `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f` |
| `20261105163924` | `profile_media_and_account_closure` | `a4aa10b30eb0cdd612896ee88384cf6cc25c0419de85d05c791804f4d7d7e440` |
| `20261105170000` | `stay_discovery_filters` | `4693e0930088538aaf076d9d331d04808dcffd778772ddfa66336d8057b66d4e` |
| `20261105180000` | `stay_host_inventory_controls` | `390c7688b72deead74e7b0280cf7873ed47c3bfd85926e68d0ad6406abece09e` |
| `20261105210000` | `stay_requests_fees_profiles` | `f22c3b1700135c02eaf1ae69c2d028743558cb07b0dd7dcbd3c22ea50996922a` |
| `20261105220000` | `restore_pg_hostel_property_type` | `3d476396f23466878c7245c59d01edc9c135955160c74d7a50b1574717292889` |
| `20261106010000` | `stay_razorpay_and_verified_upi` | `fc65266798f68df881480d0eb59cc5abfbf76b2f1ca6b0f9241534fe47191f63` |
| `20261106120000` | `stay_owner_onboarding_approval` | `3147405e6633530316ed7b318447837917ba3e7fa658064b07eaf253d920f121` |
| `20261106130000` | `stay_booking_guest_contacts` | `44822b66903916a068d3d78c378e2a9d0bbfb2dadc855ac0db0625defc92eb48` |
| `20261106174309` | `security_advisor_forward_fixes` | `3b6d87409fc9f3b655bcaef92d1920793d5135d7f0704e63248edb595e5fde27` |

### Updated decision

| Gate | Status | Evidence / remaining limit |
|---|---|---|
| Docker runtime | **BLOCKED** | Engine API timeouts and Docker Desktop VM lifecycle errors; no existing Docker data was touched |
| Isolated Supabase Storage runtime | **PASS** | Experimental native runtime on Apple silicon; task-only RAM-backed project started successfully |
| Restore of both archived objects through Storage API | **PASS** | 2 objects / 148,357 bytes; downloaded paths, sizes, and SHA-256 values matched the archive |
| Private-object policy check | **PASS (owner branch)** | Local owner allowed; anonymous and cross-user denied; Super Admin branch not tested |
| Restored object MIME metadata | **BLOCKED** | Source manifest records MIME types; post-upload Storage metadata was not independently checked |
| Hosted Storage unchanged | **PASS** | Read-only inventory still matches both bucket privacy flags, object totals, sizes, and timestamps |
| Hosted migration ledger | **PASS** | API and SQL agree at 53 entries through `20261105140000`; 11 current manifest migrations are pending |
| Hosted migration approval | **NO-GO pending fresh backup pair and owner approval** | The verified object-byte archive is dated 2026-11-06; the production gate still requires a fresh encrypted database backup and fresh Storage-byte backup immediately before any separately authorized hosted apply |

## Final native Storage and Mumbai migration preflight (2026-11-07)

This addendum supersedes the prior **BLOCKED** restored-MIME and Super Admin policy entries and corrects the earlier 11-pending count. The Mumbai project was accessed only for read-only migration and Storage inventory queries. There were no hosted SQL writes, Storage changes, Auth changes, fresh backups, payments, push, merge, or deployment. No application files or Capacitor files were changed; this checklist is the only file updated in the React repository.

### Isolated native Storage restore

I recreated the disposable Supabase native runtime on a task-owned 4-GiB RAM disk at `/Volumes/BOSMumbai`, using Supabase CLI 3.0.0 with its experimental Apple silicon native stack. Docker containers and volumes were not started, stopped, inspected, or modified in this run. The stack started healthy; only the two archived media objects were restored to the local private `bos-public-media` bucket. Local `storage.objects` metadata and Storage API downloads independently verified, for both objects, the exact hosted/archive object key, bucket ID `bos-public-media`, MIME type, byte size, and downloaded SHA-256. Results: JPEG `image/jpeg`, 138,395 bytes; WebP `image/webp`, 9,962 bytes; total 148,357 bytes. The local bucket was private (`public=false`) with the hosted 100-MiB limit and MIME allowlist. The private `bos-private-documents` bucket was also private, used the hosted 25-MiB limit and MIME allowlist, and remained empty. No verification documents or customer files were present in the archive or copied to the local restore.

### Private-document access policy test

On the RAM-backed stack only, I used disposable local Auth identities and synthetic private objects to test the hosted SELECT predicate from migration `20261105040000_universal_media_assets.sql` and its active-user/Super Admin helper conditions. The exact local policy conditions were: owner UUID as the first path component, or active current Super Admin. Results: own provider object allowed; own customer object allowed; cross-account reads denied; anonymous reads denied; active Super Admin with `role=admin`, `account_status=active`, and `is_super_admin=true` allowed; provider upload to own prefix allowed; customer uploads (own or cross-prefix) denied. This exercised the intended admin branch without changing hosted policies or weakening customer/owner privacy. All identities, objects, policy definitions, and test helper functions were disposable and local.

### Existing encrypted archive and database restore evidence

No new backup was created. Existing Storage archive:

`~/BookOurSpace_Backups/react/storage-objects/obkfgxjzlscungkhbyvq-20261106T173030Z/storage-objects.tar.gz.gpg`

Encrypted archive SHA-256 is `f9f14c1b63d1d40cbb2f5dd0e400f2a201fb50b8d6654507b9d5bdab8936f7a8` (143,840 bytes). Its sidecar check, owner recovery-key decrypt, GPG round-trip, plaintext checksum, two-object manifest, object sizes, and object SHA-256 values passed. Decrypted archive SHA-256 is `8bc6f51b42f7f35aeca8b63dd895bbecf6b2735a5c760da024aab2451a93b9ae`. The recovery keyring is outside both repositories and the archive at `~/.config/bookourspace/backup-gnupg-recovery-20261106`; the encryption evidence records the recipient fingerprint. No passphrase or private key material is stored in this checklist.

The existing encrypted database dump at `~/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-20261106T135330Z-installer-preflight/backup.dump.gpg` is 174,207 bytes with SHA-256 `ba005a3a5d3552e1a5321c86c17a92a5ca6a4bdc60742b826c776a0b930053c3`. Its SHA256SUMS entries match the archive and companion schema, TOC, identity, restore, and encryption evidence files. Owner recovery-key decrypt/round-trip and plaintext dump checksum passed; `pg_restore --list` parsed 1,395 TOC entries. The existing isolated restore record reports matching source/restored counts: 68 public tables, 68 RLS tables, 135 policies, 2 Auth users, 2 identities, 10 Storage metadata tables, 2 buckets, 2 object metadata rows, and 2 profiles. PostgreSQL archives do not include Storage object bytes; the separate verified object-byte archive is required. Recovery evidence supports an isolated restore drill; production cutover/point-in-time recovery remains a separately approved operation. No hosted backup was initiated in this task.

### Exact read-only migration reconciliation

The hosted Supabase migration-list API and direct read-only `schema_migrations` query agree on 53 ledger records through `20261105140000`, including the hosted baseline record `00000000000000`. Both local repositories have the same ordered 64-file manifest and matching file hashes. The baseline is a hosted ledger record and is not a local SQL file. Therefore the current exact pending set is **12 migrations**, not 11; the preceding 11-count snapshot predates `20261107032340_authenticated_rpc_security_boundary_audit.sql`. The hosted ledger has no version absent from the local migration files other than that baseline record; all 52 hosted SQL migration versions are present locally.

| Pending version | Migration | SHA-256 |
|---|---|---|
| `20261105150000` | `server_media_byte_validation` | `6b1cced1c112679f80e152630587fb54c0d5521223a0789617ad8ed03e37d49c` |
| `20261105160000` | `media_published_listing_visibility` | `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f` |
| `20261105163924` | `profile_media_and_account_closure` | `a4aa10b30eb0cdd612896ee88384cf6cc25c0419de85d05c791804f4d7d7e440` |
| `20261105170000` | `stay_discovery_filters` | `4693e0930088538aaf076d9d331d04808dcffd778772ddfa66336d8057b66d4e` |
| `20261105180000` | `stay_host_inventory_controls` | `390c7688b72deead74e7b0280cf7873ed47c3bfd85926e68d0ad6406abece09e` |
| `20261105210000` | `stay_requests_fees_profiles` | `f22c3b1700135c02eaf1ae69c2d028743558cb07b0dd7dcbd3c22ea50996922a` |
| `20261105220000` | `restore_pg_hostel_property_type` | `3d476396f23466878c7245c59d01edc9c135955160c74d7a50b1574717292889` |
| `20261106010000` | `stay_razorpay_and_verified_upi` | `fc65266798f68df881480d0eb59cc5abfbf76b2f1ca6b0f9241534fe47191f63` |
| `20261106120000` | `stay_owner_onboarding_approval` | `3147405e6633530316ed7b318447837917ba3e7fa658064b07eaf253d920f121` |
| `20261106130000` | `stay_booking_guest_contacts` | `44822b66903916a068d3d78c378e2a9d0bbfb2dadc855ac0db0625defc92eb48` |
| `20261106174309` | `security_advisor_forward_fixes` | `3b6d87409fc9f3b655bcaef92d1920793d5135d7f0704e63248edb595e5fde27` |
| `20261107032340` | `authenticated_rpc_security_boundary_audit` | `67c85b9e27c997563ae9e76570861f118333e2096e86539507b2c81c149aa2f9` |

### Owner-approval checklist

| Gate | Result | Evidence / required next action |
|---|---|---|
| Hosted project identity and region | **PASS** | Read-only project metadata: `obkfgxjzlscungkhbyvq`, `ap-south-1` |
| Hosted migration ledger | **PASS** | API and SQL agree: 53 records through `20261105140000` |
| Local migration reconciliation | **PASS** | Both repositories agree; 52 applied SQL versions present locally; exact 12 pending hashes listed above |
| Local native Storage restore | **PASS** | Two archived objects, exact paths/bucket IDs/MIME/sizes/hashes verified via local metadata and API |
| Owner/customer privacy and Super Admin branch | **PASS (local only)** | Eight read cases and owner-vs-customer upload checks passed against local policy equivalent; hosted policy unchanged |
| Existing Storage archive integrity/recovery key | **PASS** | Sidecar, GPG decrypt/round-trip, plaintext hash and per-object hashes verified |
| Existing DB archive integrity/recovery key | **PASS** | SHA256SUMS, GPG round-trip, plaintext checksum, 1,395-entry `pg_restore --list`, existing isolated restore counts verified |
| Hosted inventory unchanged | **PASS** | Read-only query still shows two private media objects / 148,357 bytes and zero private-document objects |
| Fresh backup pair immediately before migration | **BLOCKED / NOT PERFORMED** | Existing backups are preflight artifacts, not a fresh pre-change pair; user explicitly prohibited a new hosted backup in this task |
| Hosted migration execution | **BLOCKED / NOT AUTHORIZED** | Requires separate explicit owner approval after reviewing current pending SQL, checksums, backup evidence, recovery window, and apply plan |
| Hosted profile backfill / Auth changes | **BLOCKED / NOT AUTHORIZED** | Separate approval required; none performed |
| Recovery/cutover | **BLOCKED / NOT AUTHORIZED** | Use the isolated restore evidence and forward-only recovery runbook; any hosted restore or cutover requires explicit approval |

**Decision: NO-GO for hosted migration execution at this time.** Backup artifacts and local restore verification pass, but a fresh pre-change DB plus Storage-byte backup must be made and verified immediately before any separately approved apply. The owner must approve the exact 12-file set, backup pair, execution window, and recovery/cutover plan. No hosted changes were made here.


Cleanup: `supabase stack stop --all` confirmed the task-created local stack stopped; `hdiutil detach /Volumes/BOSMumbai` succeeded. Only the task-owned RAM disk was detached. Docker state and the encrypted backup archives remain untouched.

## Mumbai migration change-window plan (read-only preparation, 2026-11-07)

**Scope/guard:** planning only. No fresh backup was created, no hosted migration/SQL/Auth/Storage change was made, and no payment was run. This plan covers only the verified 12 pending files below. The existing local read-only installer plan completed successfully: it verified the baseline plus 64 migration hashes, showed the exact Mumbai link, and listed the manifest order. The current hosted ledger remains at 53 rows through `20261105140000`.

### Backup window plan and current readiness

Immediately before the separately approved window, create a unique UTC-stamped directory under `/Users/aa/BookOurSpace_Backups/react/`, outside either repository and outside the recovery keyring. Keep the two backups and their evidence together under a new project/timestamp directory; refuse to overwrite any existing path. Produce:

1. A custom-format `pg_dump` encrypted to the owner recipient (`backup.dump.gpg`) with a ciphertext SHA-256 sidecar, dump scope/TOC, recipient fingerprint, plaintext hash, target identity and restore-verification evidence. The existing guarded script includes Auth users/identities, schema/data visible to the backup role, Storage metadata, and the migration ledger; Storage object bytes are excluded. Its isolated restore verification must compare Auth users/identities, public tables, RLS flags/policies, Storage buckets/object metadata and profiles against the source before the archive is treated as recovery-ready.
2. A separate Storage object-byte archive plus manifest. Refresh the bucket/object metadata inventory read-only immediately before download. Use the supported Storage API/CLI download path with explicit remote targeting and download-only GETs; include every bucket, exact object key/path, bucket ID, MIME type, byte size, owner where present, and per-object SHA-256. Keep private objects private, never mint public URLs, and do not copy via an operation that can upload/delete/move. Encrypt the manifest and bytes to the same owner recipient. Supabase's database backups do not include object bytes, so both artifacts are required ([Supabase database backups](https://supabase.com/docs/guides/platform/backups), [Storage object downloads](https://supabase.com/docs/guides/storage/management/download-objects)).
3. Run SHA256SUMS verification, decrypt each archive through the recovery key without logging or saving plaintext outside a protected temporary restore location, compare decrypted hashes and per-object hashes, then restore the DB and Storage objects into an isolated disposable environment. Re-download each restored object and compare path, MIME, size and SHA-256. Run private owner/customer/anonymous/Super Admin policy checks against the isolated restore. Do not restore to Mumbai as part of this backup step.

Current read-only checks for this plan:

| Item | Result | Evidence / limitation |
|---|---|---|
| Destination | **PASS** | `/Users/aa/BookOurSpace_Backups/react` exists, mode `0700`, outside both repos and outside the keyring; archived files are mode `0600`. Use a fresh unique child directory. |
| Destination filesystem | **PASS WITH RISK** | About 63.2 GiB free; current database size is 18,511,539 bytes and Storage inventory is 148,357 bytes / 2 objects. This is ample relative to measured state, but the filesystem is already 93.2% used. Recheck immediately before backup and stop if free space has materially fallen. |
| Recovery recipient and private key | **PASS** | Canonical React target guard pins the owner recipient/keyring; its secret key is present. Fingerprint recorded in the existing encryption evidence; no key material is printed here. |
| GPG recovery credential | **PASS** | Recovery Keychain item is present. Using it and the recovery key, both existing encrypted archives streamed to their recorded plaintext SHA-256 hashes; plaintext was not written by this check. |
| PostgreSQL backup credential | **PARTIAL** | The configured Keychain item exists, and hosted read-only SQL succeeded through the connected project tool. The Keychain credential has not been used for a new direct `pg_dump` connection in this planning task; validate the exact dump connection with a read-only `SELECT 1` immediately before backup, then run the newly approved backup. |
| Restore procedure | **PASS (existing drill)** | Existing DB isolated-restore evidence and the previous native Storage restore drill passed. Repeat with the *fresh* paired artifacts at the window; do not treat November 6 artifacts as the required fresh pre-change pair. |
| Off-device recovery copy | **BLOCKED / OWNER DECISION** | Current root is on the same local Data volume (about 93.2% occupied). No separate off-device destination was verified. Decide whether an encrypted, access-controlled second copy is required and approve its destination before the window. |
| Local config documentation | **BLOCKED / RECONCILE** | `supabase/connection-settings.example` says the recipient/key is empty, while canonical `supabase/backup/react-target.conf`, the pinned installer guard and the tested recovery key show it is configured. Do not source the stale example for this run; reconcile that documentation before delegating the window. |

Never put the passphrase, database URL, DB password, service-role key, or private key in a command, shell history, log, checklist, or archive manifest. Keep GPG recovery material outside the repository and backup tree. The backup installer requires explicit backup-only authorization and a newly verified archive; hosted apply has separate exact-project approvals. Supabase CLI v3 is local by default and has a hosted-write confirmation change, so any future remote action must be explicit, target-checked, and run only under its own approval ([CLI v3 change](https://supabase.com/changelog/supabase-cli-v3)).

### Exact pending file set and execution order

Order numbers are the verified manifest order (54 through 65); apply sequentially, never parallelize or skip. Hashes are SHA-256 of the current SQL file bytes.

| Order | Version | Migration name | SHA-256 | Dependency / review note |
|---:|---|---|---|---|
| 54 | `20261105150000` | `server_media_byte_validation` | `6b1cced1c112679f80e152630587fb54c0d5521223a0789617ad8ed03e37d49c` | Depends on the established `media_assets` / server finalization pipeline. Security-sensitive: service-role-only server validation/finalization. |
| 55 | `20261105160000` | `media_published_listing_visibility` | `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f` | Depends on media publication tables and prior media validation. Replaces RLS policies and updates publication metadata; inspect public/private visibility carefully. Migration comments specify no media-row or Storage-object deletion. |
| 56 | `20261105163924` | `profile_media_and_account_closure` | `a4aa10b30eb0cdd612896ee88384cf6cc25c0419de85d05c791804f4d7d7e440` | Depends on profiles, media assets, Auth and Storage. Security-sensitive; adds private profile-media bucket metadata, owner RLS, account-closure audit and server-only functions. The migration does not close accounts. If its closure RPC is later invoked, it deletes that user's Auth sessions, bans the Auth user and redacts profile PII; it does not delete bookings, financial rows or audit records. |
| 57 | `20261105170000` | `stay_discovery_filters` | `4693e0930088538aaf076d9d331d04808dcffd778772ddfa66336d8057b66d4e` | Depends on existing Stays inventory/booking tables. Adds filters, constraints, indexes and routines. Review stay-block overlap enforcement and validate existing rows against checks. |
| 58 | `20261105180000` | `stay_host_inventory_controls` | `390c7688b72deead74e7b0280cf7873ed47c3bfd85926e68d0ad6406abece09e` | Depends on 57's Stays schema. Security-sensitive owner inventory policies, media reorder policy and write guard routines. |
| 59 | `20261105210000` | `stay_requests_fees_profiles` | `f22c3b1700135c02eaf1ae69c2d028743558cb07b0dd7dcbd3c22ea50996922a` | Depends on Stays bookings, allocations and payment intents. Changes payment-status constraints and adds checkout/request/expiry routines; booking and payment behavior needs non-payment regression coverage. |
| 60 | `20261105220000` | `restore_pg_hostel_property_type` | `3d476396f23466878c7245c59d01edc9c135955160c74d7a50b1574717292889` | Explicitly depends on 57's property-type check; restores `pg_hostel` while retaining Stays types. It conditionally replaces/validates a constraint and can scan/lock `stay_properties`. |
| 61 | `20261106010000` | `stay_razorpay_and_verified_upi` | `fc65266798f68df881480d0eb59cc5abfbf76b2f1ca6b0f9241534fe47191f63` | Depends on earlier Stays checkout/payment routines and verified-identity fields. Payment-sensitive; drops old function overloads and replaces implementations inside this migration's transaction. No live payment exercise is part of this window. |
| 62 | `20261106120000` | `stay_owner_onboarding_approval` | `3147405e6633530316ed7b318447837917ba3e7fa658064b07eaf253d920f121` | Depends on listings, providers and Stays inventory/booking functions. Security-sensitive approval state machine, audit events, triggers and owner/admin RPCs; review SECURITY DEFINER checks and grants. |
| 63 | `20261106130000` | `stay_booking_guest_contacts` | `44822b66903916a068d3d78c378e2a9d0bbfb2dadc855ac0db0625defc92eb48` | Depends on existing bookings and Auth identities. Adds guest contact PII storage with RLS; validate exact owner/guest/admin readers and retention expectations. |
| 64 | `20261106174309` | `security_advisor_forward_fixes` | `3b6d87409fc9f3b655bcaef92d1920793d5135d7f0704e63248edb595e5fde27` | Depends on functions/tables from earlier module migrations. Highly security-sensitive: hardens SECURITY DEFINER search paths, function grants, policies and append-only payment/audit protections. Verify intended API roles after revocations. |
| 65 | `20261107032340` | `authenticated_rpc_security_boundary_audit` | `67c85b9e27c997563ae9e76570861f118333e2096e86539507b2c81c149aa2f9` | Depends on prior module RPCs, `pg_admin_audit`, PG invoices and stay checkout guard functions. Highly security/financial-sensitive: removes direct authenticated execution from privileged RPCs, grants service-role paths, and adds checkout/tax/Super Admin enforcement triggers. Verify server route callers and denial paths. |

### Destructive, irreversible, transaction and lock review

The 12 files each have exactly one explicit `BEGIN` and one `COMMIT`; none uses `CREATE INDEX CONCURRENTLY`. No file directly drops a table/column, truncates a table, or executes a migration-time `DELETE FROM`. The `DROP POLICY`, `DROP TRIGGER`, `DROP CONSTRAINT`, and two replaced checkout function overloads are transactional replacement/hardening operations, not evidence of table data deletion. `20261105163924` defines a future account-closure operation whose invocation intentionally deletes only that account's sessions and redacts profile identifiers; financial/bookings and closure audit records are retained by its code path.

All are ordered dependencies, so a failure partway through the set leaves an intentionally partial migration sequence. Each file is atomic on its own; the installer inserts its ledger row after the file commits. If SQL commits but ledger insertion fails, stop and reconcile that version manually; never replay it blindly. Recovery is forward-only: fix with a reviewed forward migration, or restore the pre-change DB and Storage pair into an isolated target, validate, then cut over only with separate owner approval. An in-place production restore can discard bookings/payments written after the backup, so it is not an automatic rollback.

No explicit `lock_timeout` or `statement_timeout` was found in these files or the installer. Constraint replacement/validation, `ALTER TABLE`, policy changes and dynamic policy hardening can wait on or hold locks; constraint validation may scan existing rows. Before the window, inspect active transactions and table sizes, choose low traffic, define an approved bounded lock-wait/statement-timeout behavior, and abort rather than wait indefinitely. The installer currently does not enforce those timeouts, so that behavior needs an explicit operator/code decision before a production apply. See Supabase's [migration deployment guidance](https://supabase.com/docs/guides/deployment/database-migrations).

### Change-window health and recovery checklist

**Before any backup or migration write**

- [ ] Owner separately authorizes a fresh read-only DB dump and Storage object download; the current request does not authorize either.
- [ ] Reconfirm exact project reference `obkfgxjzlscungkhbyvq`, region `ap-south-1`, target profile/link, and current migration ledger. Stop if the latest version/count differs from the 53-row snapshot.
- [ ] Re-run manifest/file byte+SHA checks in both repos; confirm both still match this exact table and no unreviewed migration is present.
- [ ] Confirm backup root is mode 0700, destination name is new, disk has enough free space for dump, both plaintext staging/isolated restore and ciphertext, and the keyring remains outside the archive/repo.
- [ ] Confirm DB backup credential authentication with read-only `SELECT 1`; confirm GPG recipient, Keychain passphrase, and decrypt/round-trip without printing credentials.
- [ ] Capture read-only baseline: migration ledger; `pg_database_size`; public relation/RLS/policy/function grants; Auth users/identities and profile totals; storage bucket privacy/config; all object keys, MIME, sizes, owner IDs and hashes; pending/active bookings and payment-intent/event counts; active transactions and service health/error rates. Do not expose file contents or customer document URLs.
- [ ] Capture fresh PostgreSQL and complete Storage-byte backups into the same new timestamped directory. Verify encryption, SHA256SUMS, decrypted hashes, object manifests and isolated restore before approving the first migration write.
- [ ] Agree maintenance window, low-traffic window, lock timeout/abort limits, operator, observer, and communication plan. Pause feature writes only under separately approved operational steps; do not initiate/capture/settle live payments during migration.
- [ ] Resolve whether to take a separate encrypted off-device copy. Confirm the stale `connection-settings.example` is not being used; reconcile it before delegating credentials/runbook steps.

**During the approved window**

- [ ] A single named operator verifies all approval flags and project guards, runs only the installer against the exact Mumbai target, and applies versions 54–65 sequentially.
- [ ] After each file, confirm the expected version/name ledger row. On SQL failure, stop; verify transaction rollback and absence of ledger row. If migration SQL committed but the history row did not, stop and reconcile schema/history before any retry.
- [ ] Do not run profile backfill unless separately approved; the installer requires an explicit run-or-skip decision. Do not change Auth users, Storage object bytes, or bucket visibility during this window.

**After the final migration**

- [ ] Confirm exactly the 12 expected version/name rows are present once, no unexpected ledger versions, and the final highest version is `20261107032340`.
- [ ] Recheck all public tables have RLS; review changed policies, SECURITY DEFINER search paths and EXECUTE grants. Verify service role remains the only caller for the restricted server RPCs and Super Admin financial audit enforcement behaves as intended in approved isolated/non-financial checks.
- [ ] Verify Auth user/identity counts unchanged; no account was closed; closure audit, financial rows, bookings and payment events remain. Profile backfill count should remain unchanged unless separately approved.
- [ ] Verify Storage object inventory (keys/counts/bytes/MIME/hash) is unchanged. Confirm `bos-public-media` and `bos-private-documents` remain private and object access stays owner/admin scoped. Account for the intentional new private `bos-private-profile-media` bucket metadata from migration 56; confirm the two existing hosted objects and all existing bucket contents were not copied, deleted or made public.
- [ ] Check DB health, API/Auth/Storage error rates and lock/slow query status. Run approved read-only smoke checks across all six modules; any booking/payment mutation or hosted UI test requires its own explicit approval.
- [ ] If any check fails, stop feature rollout. Prefer a forward corrective migration. If data restore is selected, restore both fresh archives to an isolated target first, reconcile all writes after backup, verify counts/RLS/Auth/Storage and obtain explicit cutover approval; do not blindly restore over Mumbai.

### Explicit owner approvals required

- [ ] Approve **exactly** the 12 file versions, names, SHA-256 hashes and order in this table; any mismatch means stop and regenerate this review.
- [ ] Separately approve the fresh read-only PostgreSQL backup and complete Storage-byte backup; this plan did neither.
- [ ] Approve the backup destination, local/off-device retention, encryption recipient and named recovery operators. Confirm the stale template/config discrepancy is resolved.
- [ ] Approve the migration date/window, operator/observer, bounded lock-wait policy, write pause and abort criteria.
- [ ] Explicitly choose whether to run or defer the Google profile backfill. This is separate from migration approval.
- [ ] Approve only the intended private profile-media bucket metadata change from migration 56; confirm no object-byte move or public visibility change.
- [ ] Approve post-migration read-only health checks and six-module smoke scope; separately approve any hosted user/data mutation or payment test.
- [ ] Approve the forward-only recovery decision and conditions for an isolated restore/cutover. A restore/cutover is not authorized by approving migrations.

**Current decision: NO-GO until owner decisions above are recorded.** The read-only evidence passes for destination, pinned encryption identity, GPG recovery, disk space against current measured data, manifest/order and existing restore procedures. Remaining risks are the 93.2%-used local filesystem, no verified off-device copy, no direct DB backup-credential connection test in this planning task, stale template guidance, and missing enforced migration lock/statement timeouts. No hosted or repository application state was changed by this addendum.

## Final security migration reconciliation — 2026-11-07

Scope: reconcile the 12 local migrations following the last previously confirmed Mumbai ledger snapshot. This addendum supersedes any earlier checksum entry in this checklist. No hosted SQL, Auth changes, migrations, fixture writes, payments, deployment, push, or merge were performed.

### Immutable local migration bytes

The ordered manifest check passes in both repositories: baseline + 64 migrations, unique ordered versions, SHA-256 matches. All 64 migration SQL files, including the 12 pending candidates below, are byte-identical between Web and Capacitor. `schema_and_rls.sql`, `MIGRATION_MANIFEST.json`, and `migrations.sha256` are also byte-identical.

| Order | Version / file | Bytes | SHA-256 |
|---:|---|---:|---|
| 54 | `20261105150000_server_media_byte_validation.sql` | 3,120 | `6b1cced1c112679f80e152630587fb54c0d5521223a0789617ad8ed03e37d49c` |
| 55 | `20261105160000_media_published_listing_visibility.sql` | 7,951 | `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f` |
| 56 | `20261105163924_profile_media_and_account_closure.sql` | 10,771 | `a4aa10b30eb0cdd612896ee88384cf6cc25c0419de85d05c791804f4d7d7e440` |
| 57 | `20261105170000_stay_discovery_filters.sql` | 35,364 | `4693e0930088538aaf076d9d331d04808dcffd778772ddfa66336d8057b66d4e` |
| 58 | `20261105180000_stay_host_inventory_controls.sql` | 14,165 | `390c7688b72deead74e7b0280cf7873ed47c3bfd85926e68d0ad6406abece09e` |
| 59 | `20261105210000_stay_requests_fees_profiles.sql` | 21,698 | `f22c3b1700135c02eaf1ae69c2d028743558cb07b0dd7dcbd3c22ea50996922a` |
| 60 | `20261105220000_restore_pg_hostel_property_type.sql` | 2,107 | `3d476396f23466878c7245c59d01edc9c135955160c74d7a50b1574717292889` |
| 61 | `20261106010000_stay_razorpay_and_verified_upi.sql` | 26,236 | `fc65266798f68df881480d0eb59cc5abfbf76b2f1ca6b0f9241534fe47191f63` |
| 62 | `20261106120000_stay_owner_onboarding_approval.sql` | 28,426 | `3147405e6633530316ed7b318447837917ba3e7fa658064b07eaf253d920f121` |
| 63 | `20261106130000_stay_booking_guest_contacts.sql` | 4,227 | `44822b66903916a068d3d78c378e2a9d0bbfb2dadc855ac0db0625defc92eb48` |
| 64 | `20261106174309_security_advisor_forward_fixes.sql` | 13,938 | `3b6d87409fc9f3b655bcaef92d1920793d5135d7f0704e63248edb595e5fde27` |
| 65 | `20261107032340_authenticated_rpc_security_boundary_audit.sql` | 13,921 | `67c85b9e27c997563ae9e76570861f118333e2096e86539507b2c81c149aa2f9` |

The approval checklist previously recorded `60115509c3a9982fb760ba29f887c35685777e9c2b8f707e69c36db74c091840` for version 65. The file is untracked in both repositories and has no Git history; a local search found no prior copy. Therefore the historical byte difference cannot be reconstructed, and it is not possible to determine whether the SQL changed after that entry or the earlier entry was inaccurate. The current file digest above is independently reproduced from both files and both manifests; use only this current digest for any future owner review. The earlier table entry was corrected accordingly. Manifest SHA-256: Web and Capacitor `7db5d0e926471eaea3f3b49d0586ebfaa2c1aff5d87c63bec09db0ff16ea1ea0`; checksum-list SHA-256: `af77ffd6bf77f0c098a1d52d31f432b5e60f3538a8046a9f0ea68235ba8bd72a`.

### Isolated verification evidence

- PASS — Fresh throwaway PostgreSQL 17.11 clusters in both repositories applied baseline and all 64 local migrations in filename order, including all 12 candidates. Each run ended `ALL CHECKS PASSED`; 73 public tables had RLS enabled.
- This was a fresh schema/migration replay, **not** a restore from a database backup. Backup restoration remains unverified because no backup was created or available for this run.
- PASS — Local SQL asserts `anon` and `authenticated` cannot EXECUTE, while `service_role` can EXECUTE, for all eight trusted RPCs: `create_booking_atomic`, `create_service_payment_intent`, `create_stay_checkout`, `pg_create_payment_intent`, `stay_hold_units`, `stay_cancel_allocation`, `record_live_edit_cinema_audit`, and `finalize_media_asset`. SECURITY DEFINER search paths and the stay-publication guard also passed.
- PASS — Ownership and role tests: cross-provider venue seasonal-rate UUID collision is denied; own seasonal-rate create/delete succeeds; financial fee-waiver/refund audit actions reject ordinary Admin and require active Super Admin; closed-account class cancellation/refund quote is denied with `ACTIVE_PROFILE_REQUIRED`. Guardrail audit passed in both repos.
- PASS — Server/API tests: Services 11/11 in each repo; Stays payments 47/47 plus restart persistence 5/5 in each repo; PG payments 59/59 plus restart persistence 5/5 in each repo. No live payment provider was called; these use local sandbox fixtures.
- PASS — Live Edit audit persistence/security 20/20 in each repo.
- PASS — PG browser run after readiness fix: 22 checks passed, 0 browser/runtime blockers in each repo. Owner inventory edits passed for both PG styles using the signed local provider session. Customer discovery, live availability, unpaid booking, cancellation and responsive Chromium/Firefox/WebKit checks passed. The Capacitor run initially hit a transient 15-second availability-text timeout; the same full journey passed on rerun.
- Provider-inventory test root cause: the test treated absence of the splash/welcome element immediately after DOMContentLoaded as readiness. React had not mounted yet, so the check raced app initialization and the provider redirect. The test now waits for an actual marketplace, welcome, or provider-portal destination, exits the provider portal through the real Back to Marketplace control, then waits for the PG search surface. No auth or authorization behavior was bypassed.
- Manifest check `node supabase/tests/migration_manifest.mjs --check` passed in both repositories.

### Multiple-permissive-policy review and residual risk

The last available hosted Performance Advisor snapshot contained 23 `multiple_permissive_policies` findings. Most are intended role-scope unions: customer/provider/admin booking reads; owner/admin listing writes; published catalog/config reads plus active-admin inspection; owner/admin media and inventory reads; and separate provider/admin service-schedule management. The two booking UPDATE and enquiries findings are inert for direct Data API access in the last catalog snapshot because `anon`/`authenticated` lack the relevant direct table privileges. No privilege widening was demonstrated for those branches. Multiple policy predicates can still add evaluation work; realistic workload plans/latency have not been measured, so avoid consolidating policies without proving equivalent authorization.

One finding is a genuine latent exposure: `service_provider_schedules` grants anonymous and authenticated SELECT under a permissive `USING (true)` policy and has no active/published state predicate. The last hosted read-only row count was zero, so no schedule rows were observed exposed then, but future schedule rows would be publicly readable. Treat this as a production blocker. Prepare a separate minimal forward-only fix that scopes direct table reads to the owner/active admin and serves approved public schedule details only through the existing active-listing profile projection. Do not make the table public or broaden write access.

### Hosted verification and approval status

A fresh read-only Mumbai ledger/Advisor call was attempted for exact project `obkfgxjzlscungkhbyvq`; the configured Supabase connector returned `You do not have permission to perform this action` for SQL and both Advisor types. The latest available prior ledger snapshot remains 53 rows, max version `20261105140000`; this turn did not independently refresh hosted state. No hosted write was attempted. Reconfirm target identity, exact ledger and current Advisor findings through an authorized read-only session before approving any migration. A hosted backup restore was not performed.

**Decision: NO-GO for migration approval until the owner reviews the current 12 hashes, the schedule-policy exposure is corrected in a separately reviewed forward migration, the hosted ledger/Advisor state is re-read, and a recovery/restore plan is accepted.** This addendum makes no hosted changes and does not constitute migration approval.

## Timeout, recovery-config and privilege-boundary remediation (2026-11-07)

This was a read-only hosted preflight plus disposable local testing. No hosted database, migration ledger, Storage, Auth or payment data was changed. No fresh hosted backup was created. The only repository edits for this remediation are this checklist and the tracked sample-config/install-timeout guard adjustments noted below.

### Proposed database timeouts — isolated PostgreSQL 17 drill

The existing encrypted November 6 custom-format database backup was decrypted with the configured recovery key into a task-owned mode-0600 temporary file, then restored to a new task-owned local PostgreSQL 17 cluster. The previous restore runbook's exclusion for Supabase-managed Vault objects was applied; synthetic Supabase roles were created only in that disposable cluster. Restore baseline evidence before migrations was 53 migration rows through `20261105140000`, 68 public tables, 68 RLS-enabled public tables and 135 public policies. No private hosted Storage object bytes were brought into this database drill.

I applied the exact 12 pending manifest files in order, checking each current file against its manifest SHA-256 before execution. Each file ran as its own transaction with `PGOPTIONS='-c lock_timeout=5s -c statement_timeout=5min'`, `psql -X -v ON_ERROR_STOP=1`; the local history row was inserted only after successful file commit. **All 12 passed.** Final local ledger: 65 rows including the baseline marker, through `20261107032340`; all 73 public tables retained RLS; 141 public policies were present. The timeouts are inherited per migration session/transaction; every one of the 12 files was accepted with both settings.

For failure behavior, I restored the baseline again in a second disposable DB, applied migrations 54 and 55, and held an `ACCESS SHARE` lock on `public.profiles` while running migration 56. The exact failure was `20261105163924_profile_media_and_account_closure.sql:12: ERROR: canceling statement due to lock timeout`. `ON_ERROR_STOP` returned nonzero; the transaction rolled back; `cover_url` was absent; no migration-56 ledger row was written; migration 57 and later were not attempted. This confirms the fail-fast path. A migration did not naturally exceed five minutes, so an actual 5-minute expiration was not induced; the 5-minute setting was applied successfully to all 12. Statement-timeout errors use the same psql nonzero/rollback/stop path.

The installer now applies the two session settings to each migration and names both version and migration in its failure message. `bash -n supabase/install_mumbai_migrations.sh` passed. Its read-only `--plan` passed manifest validation and printed `lock_timeout=5s, statement_timeout=5min` plus the 12 versions at manifest orders 54–65. It did not connect to or write to Mumbai.

### Recovery-key sample configuration reconciliation

The tracked `supabase/connection-settings.example` had stale text claiming no owner key existed and declared an empty `BOS_BACKUP_GPG_RECIPIENT`, which could override/mask the canonical recovery profile. I changed only that sample stanza: recipient, keyring and recovery-service overrides are now documented as unset and sourced from the canonical guarded target profile. No secret or fingerprint was added to the sample. `supabase/backup/react-target.conf` remains the source of truth for project and recovery identity.

Read-only verification confirmed the configured owner secret key/fingerprint and Keychain recovery item are present. Using the Keychain credential and keyring in memory, both existing encrypted DB and Storage artifacts decrypted to their recorded plaintext SHA-256 values. No passphrase/private key was printed or written by this check. Backup root is mode 0700 and the current archives mode 0600.

### PostgreSQL connection, destination and off-device option

The local backup filesystem currently has approximately 67 GiB free and is about 93% used. The measured database is about 18.5 MB; the current object-byte inventory is 148,357 bytes. Capacity is ample against current source size, but recheck free space immediately before the window, including the dump, temporary plaintext during encryption, isolated restore and Storage archive.

The existing `bos-production-backup` Keychain item was available, so I attempted a TLS `psql` connection through the pinned ap-south-1 session pooler with `default_transaction_read_only=on`. It was rejected with a password-authentication failure. **BLOCKED:** do not start a database dump until the owner/operator repairs or rotates that database credential under the approved credential workflow and a `SELECT 1` read-only check succeeds. The failure did not expose the password and no SQL write was attempted. The connected Supabase MCP read-only tools also returned “You do not have permission to perform this action” on this retry. Therefore I could not reconfirm the hosted ledger during this remediation; the most recent successful read-only verification immediately before it was API + SQL agreement on 53 rows through `20261105140000`. Reconfirm both sources at the window before any backup or apply.

A secure off-device option for owner review: copy only the completed client-side GPG-encrypted DB and Storage archives plus encrypted manifests to a dedicated owner-controlled S3-compatible bucket or equivalent organization vault, with TLS, block-public-access, a separate least-privilege write identity, server-side encryption, versioning/retention lock, audit logging, and a distinct recovery administrator. Verify remote object size and ciphertext SHA-256 after transfer. Do not sync plaintext, Keychain entries, GPG private keys, or passphrases. The local GPG encryption remains mandatory even when the destination also encrypts at rest. No remote destination was configured and no upload was made; owner approval and destination/cost review are outstanding.

### Existing-Google profile backfill

A hosted read-only query earlier in this task found **0 eligible Google Auth users lacking a profile**. The installer makes backfill a separate explicit run-or-skip decision after the migrations. The SQL inserts only missing Google-linked profiles, sets their role to `customer`, derives verification status from `email_confirmed_at`, uses `ON CONFLICT (id) DO NOTHING`, and never updates existing role/status/profile rows. It is idempotent and does not grant provider/admin roles.

Decision: **optional, currently unnecessary**. If the eligible count is still zero at the approved window, choose the explicit skip path with its separate approval. If the count changes, re-read the candidate count, review the behavior, and obtain separate backfill approval before executing; migration approval alone does not authorize the insert. Current Supabase MCP permission denial means the count must be reconfirmed before a future window.

### Migrations 64–65 security review and local limits

`20261106174309_security_advisor_forward_fixes` (order 64) pins selected SECURITY DEFINER discovery RPC search paths, replaces class/service/provider/stay availability bodies with scoped reads, revokes implicit PUBLIC function/table access where specified, preserves named anon/authenticated/service-role grants for intended discovery RPCs, and makes venue payment events append-only with row and truncate triggers. Its dynamic policy loop rewrites only `auth.uid()` calls to scalar subqueries and does not change the policy role list. On the restored local DB, the final count remained coherent at 141 public policies with RLS enabled for all 73 public tables. Review risk: verify the six-module anon/authenticated discovery callers still work and verify the payment-event append-only trigger against the intended service-role insert/retry path in a disposable full-fidelity fixture.

`20261107032340_authenticated_rpc_security_boundary_audit` (order 65) revokes direct `PUBLIC`/anon/authenticated execution from booking/payment/checkout/hold/cancel-allocation/audit/media-finalize RPCs and grants service-role execution. It adds triggers to require publicly bookable stays for checkout rows, reject unverified GST values in PG invoices, and require an active `admin` profile with `is_super_admin=true` for protected PG financial audit actions. Both trigger functions revoke direct caller execution and use empty search paths. It also hardens search paths for public SECURITY DEFINER functions reachable by authenticated users. `class_cancel_enrollment` is replaced with active-profile and actor ownership checks; its existing grant is intentionally authenticated-only per migration 20261103200000. `venue_owner_manage_seasonal_rate` adds owner/admin row-scoped upsert/delete protection for the caller's own listing; its existing authenticated-only grant is in migration 20261103173631. Migration 65 does not reset those existing function ACLs.

Important validation limit: the database dump was restored locally with the existing documented `pg_restore --no-privileges` option. That preserves tables, policies, functions and RLS for schema/migration testing, but omits historic function/table ACLs; local `has_function_privilege` results for functions created before the pending set are therefore not a valid source for live effective grants. Static migration review confirms earlier grants and the pending revocations/grants, but the current remote ACL matrix could not be re-read because both hosted read-only channels failed during this turn. **BLOCKED for hosted ACL confirmation:** before approval, query effective EXECUTE grants for every function named in migration 65 and confirm API handlers use service-role calls for the newly restricted RPCs. Confirm that active Super Admin enforcement rejects normal admin/customer actors and allows only the active Super Admin role in isolated testing; no live financial action should be exercised. The initial source scan identified the `stay_hold_units` caller for follow-up; its React caller was still using the authenticated role at that time. The remediation below records the aligned caller check in both repositories. The other inspected service-only callers use active/current profile checks and per-transaction `service_role` elevation for `create_service_payment_intent`, `create_stay_checkout`, `pg_create_payment_intent`, and `record_live_edit_cinema_audit`; class cancellation and venue seasonal-rate continue to use their existing authenticated-only RPCs. The media route calls `finalize_media_asset_server`, a different function from the service-only `finalize_media_asset` named in migration 65. No reference to `create_booking_atomic` or `stay_cancel_allocation` was found under `src/` or `tests/`; confirm there are no external/older clients before accepting their direct-execution revocation.

### Exact manifest and current hosted ledger status

The 12 versions, names, hashes and order are the exact table in this document's immediately preceding change-window plan. Both repository manifests and each listed file byte/hash were revalidated against one another earlier in this turn: 64 entries, unique versions, matching ordered hashes. After the timeout guard change, the installer plan independently revalidated the React manifest and printed all 12 pending entries. The host's latest successfully read-only-verified ledger is 53 rows through `20261105140000`, making 12 pending, but the fresh reconfirm requested now is **BLOCKED** by Supabase MCP permission denial and the Keychain PostgreSQL password failure. Treat the set as provisional until the hosted API and direct ledger query agree again at window start. If either current ledger endpoint differs, stop and regenerate the pending set/order/hashes.

### Updated decision and owner checklist

| Gate | Status | Evidence / decision |
|---|---|---|
| Timeout settings on all 12 | **PASS (isolated)** | Full 12-migration restored-DB run passed under 5s/5min settings; final local ledger 65; RLS 73/73 |
| Timeout failure stops safely | **PASS (lock timeout fault injection)** | Migration 56 failed exactly at line 12; nonzero exit, transaction rollback, no ledger row, no later attempts |
| Actual five-minute statement expiration | **NOT INDUCED** | None of the 12 exceeded five minutes; setting was active for all migrations. Any statement timeout returns through the same `ON_ERROR_STOP` path. |
| GPG recipient/recovery | **PASS** | Canonical profile/keyring + Keychain item decrypt both existing archives to recorded hashes |
| Stale sample recovery config | **PASS / corrected** | Empty override and false “no key exists” text removed from example; private key/passphrase remain outside repos |
| Read-only PostgreSQL Keychain preflight | **BLOCKED** | Existing Keychain item is present but the Mumbai session pooler reports password authentication failure; no dump attempted |
| Backup destination capacity | **PASS WITH RISK** | 67 GiB currently free; filesystem 93% full; recheck before backup and restore drill |
| Off-device copy | **BLOCKED / owner choice** | Secure encrypted object-store/vault option documented; no destination configured or data uploaded |
| Profile backfill | **OPTIONAL / currently unnecessary** | Earlier hosted read-only eligible count 0; reconfirm before window; separate explicit skip/run approval required |
| Hosted migration ledger/ACL recheck | **BLOCKED** | Supabase MCP denied read-only calls during this turn; last confirmed state remains 53 through `20261105140000` |
| Migration 64–65 privilege behavior | **REVIEWED / hosted effective grants BLOCKED** | SQL grants/predicates reviewed; local ACL check limited because restore excludes privileges; require live read-only ACL matrix and API caller confirmation |

Owner approvals remain: exact 12-file set after a fresh ledger reconciliation; fresh encrypted PostgreSQL and Storage backups (not created here); repaired DB credential; off-device destination/retention choice; low-traffic window; 5s/5min limits and abort behavior; profile-backfill run-or-skip decision; restricted-RPC caller and Super Admin validation; and forward-only recovery or separately approved isolated restore/cutover. **Current decision remains NO-GO.** No hosted writes or backups were made.

## Mumbai access and final preflight recheck (2026-11-07)

This is a local read-only preflight and application-caller remediation only. No database credentials were changed, no hosted SQL/Storage/Auth operation or backup was performed, and no migration was applied.

### Target and PostgreSQL authentication

- **PASS — target identity:** canonical `supabase/backup/react-target.conf`, linked `supabase/.temp/project-ref`, and the linked pooler URL all identify `obkfgxjzlscungkhbyvq`. Region is `ap-south-1`; host is `aws-0-ap-south-1.pooler.supabase.com`; port `5432`; database `postgres`; username shape is `postgres.<approved-project-ref>`; `sslmode=require`; port 5432 is the session-pooler mode required for `pg_dump`. The linked URL contains no inline password. The sample config uses the `bos-production-backup` Keychain service.
- **FAIL — usable DB credential:** the Keychain item is present, but a read-only `psql` attempt to that exact endpoint reached PostgreSQL authentication and returned `password authentication failed`. Name resolution and TCP port 5432 are reachable. This rules out a wrong project/tenant suffix, host typo, closed port or DNS failure in the pinned configuration as the immediate cause. The failure is consistent with the stored password not matching the database credential currently accepted by this pooler; the precise cause (rotation, stale item, or a provider-side password change) cannot be distinguished from this response. No other credential was tried and none was changed. Do not start a backup or ledger query through PostgreSQL until the authorized operator reconciles the Keychain item and a read-only `SELECT 1` succeeds.
- The direct host is documented as IPv6-only for this environment and is not a safe fallback for this client network. The pooler is the only approved attempted connection path.

### Hosted ledger and effective grants

- **BLOCKED — fresh ledger reconciliation:** Supabase MCP read-only SQL and migration-list requests returned `You do not have permission to perform this action`. The PostgreSQL pooler rejects the configured Keychain credential. The last successfully read-only-reconciled hosted snapshot remains 53 rows through `20261105140000`, with the 12 candidates listed at orders 54–65 in the table above. Treat that snapshot as historical/provisional, not a current-window ledger assertion.
- **PASS — local exact-set integrity, orders 54–65:** the 12 documented filenames and SHA-256 hashes still match both current migration files and the corresponding entries in each repository's `supabase/migrations.sha256`. Capacitor's manifest check and installer `--plan` pass for its 64-file inventory. React's ordinary manifest check is **BLOCKED by local inventory drift**: its directory contains one additional migration file, `20261107051930_restrict_service_provider_schedule_access.sql` (SHA-256 `6c9758eaab9cd8b6d7dec1233e2657895af1d7aeb8e068ce6a48300aeef5ef14`), which is absent from both its 64-entry checksum manifest and the Capacitor repository. It is a candidate follow-up to the previously documented public schedule-table policy exposure. I did not alter, apply, add to the manifest, or claim approval for that file. The installer manifest guard correctly refuses React `--plan` while the drift exists. The exact 12 hashes remain intact, but the local candidate set is no longer a clean 64-file inventory; owner/release decision is needed on whether this additional forward migration belongs in a future manifest and both repositories.
- **BLOCKED — effective hosted EXECUTE ACLs:** the current hosted ACL matrix could not be queried. This applies to the eight trusted RPCs in migration 65 and the relevant trigger/SECURITY DEFINER functions; SQL definitions and grants are reviewable locally, but no claim is made about effective remote grants or role membership. The local dump used `--no-privileges`, so it cannot substitute for that check.
- **Local caller finding fixed:** `stay_hold_units` was newly service-role-only in migration 65 while React's route still called it inside an `authenticated` transaction. React now verifies a signed Google session, requires a current active `customer` profile under authenticated RLS with a `FOR SHARE` row lock, verifies the approved public listing/room relationship, then elevates only the hold statement to `service_role` and keeps the verified subject in the request claims for `auth.uid()`. Capacitor already had this same guarded flow. TypeScript checks pass in both repositories. The change is local and does not apply any hosted SQL.
- Other reviewed service-only call sites check the current signed actor/profile and raise only the required transaction/statement to `service_role` for `create_service_payment_intent`, `create_stay_checkout`, `pg_create_payment_intent`, and `record_live_edit_cinema_audit`. The media route calls `finalize_media_asset_server`, not migration 65's `finalize_media_asset`. `create_booking_atomic` and `stay_cancel_allocation` have no application `src/` or `tests/` callers in either repository; external/older clients must be confirmed before the revocation is accepted. `class_cancel_enrollment` and `venue_owner_manage_seasonal_rate` intentionally remain authenticated-only and enforce active actor/ownership checks inside their functions.
- **BLOCKED — external Super Admin proof:** migration 65's financial-audit trigger checks an active `admin` row with `is_super_admin=true`, but hosted function EXECUTE grants, trigger state, and role behavior could not be freshly read or exercised. Existing isolated tests are not a substitute for live effective-grant inspection.

### Off-device encrypted destination and profile backfill

- **BLOCKED — secure off-device destination:** no `rclone` remote or AWS CLI profile is configured. The existing encrypted backup root and repository backup directory are on the same filesystem device; free space is about 67.8 GB, with the filesystem roughly 93% occupied. Two volumes are mounted locally but neither is approved/validated as the owner's off-device encrypted recovery destination. No bucket/vault identity, block-public setting, retention policy, independent credential, or remote restore path can be verified without an owner-selected destination. No upload or fresh backup occurred. The owner-controlled S3-compatible/vault safeguards in the preceding plan remain a proposed option only.
- **OPTIONAL / reconfirm required — Google profile backfill:** the most recent available hosted read-only count was zero eligible Google users without profiles. Since a fresh hosted query is blocked, this is historical evidence only. Backfill remains unnecessary if a fresh count is zero; use the explicit skip decision. If any candidates appear, obtain separate approval before an insert.

### Current go/no-go and required owner decisions

**NO-GO.** Before reopening the window: (1) repair/reconcile the configured DB credential through the authorized credential owner and pass read-only `SELECT 1`; (2) restore read-only hosted ledger and effective-grant visibility and reconcile both sources; (3) decide whether the extra React-only schedule-policy migration is retained, reviewed, manifested, and mirrored; (4) select and validate an owner-controlled off-device destination without uploading until separately approved; (5) reconfirm profile-backfill count and explicitly run or skip; and (6) review the missing application callers for `create_booking_atomic` and `stay_cancel_allocation` against external/older clients. The 12 listed migration hashes are unchanged, but the migration window must not rely on the historical 53-row ledger until current hosted reconciliation passes.

## Provider schedule RLS remediation and migration recheck (2026-11-07)

This addendum supersedes the schedule exposure finding and the 12-file local candidate count above. All work was local or read-only. No hosted SQL, migration, Auth, Storage, booking, payment, deployment, push, merge, or backup operation was performed.

### Schedule access model

`public.service_provider_schedules` has `provider_id`, `timezone`, `working_days`, `day_start`, `day_end`, `slot_minutes`, `service_areas`, `travel_radius_km`, and `updated_at`. Before this change, `Published schedules are readable` granted anon/authenticated row access with `USING (true)`, and the table also had owner/admin write policy.

- Direct schedule rows are private: active providers may read/insert/update only their own schedule; active admins may read and administer schedules. Unrelated authenticated users see no rows, anon has no direct table privilege, and authenticated clients still have no DELETE grant. No public `USING (true)` policy remains.
- Public discovery remains through the existing `service_listing_profile(text)` and `service_listing_slots(text,date,date)` RPCs, not direct table access. For active service listings, the profile projection exposes only its established discovery fields: service areas, travel radius, working weekdays, opening/closing times, slot length, and whether a schedule is configured. Date-specific available slots are returned separately. `provider_id`, timezone, and `updated_at` remain unavailable in the public projection.
- Caller audit: browser services profile and availability requests go to `/api/services/listings/:id/profile` and `/api/services/listings/:id/availability`, which call those RPCs. Provider updates go through `/api/services/provider/schedule` with a Google-authenticated provider actor and active-profile DB transaction. `serviceBookingRepository` now validates booking/reschedule dates through `service_listing_slots()` because customer RLS must not read the private schedule or blackout tables directly. Its booking insert and canonical unique slot constraint remain in place.

### Forward-only migration and exact local hashes

New migration order 66 is `20261107051930_restrict_service_provider_schedule_access.sql`, 3,363 bytes, SHA-256 `6c9758eaab9cd8b6d7dec1233e2657895af1d7aeb8e068ce6a48300aeef5ef14`. It drops the blanket policy, replaces the permissive all-operation owner policy with separate active-provider/admin SELECT/INSERT/UPDATE policies, and revokes direct anon/PUBLIC table access while preserving authenticated SELECT/INSERT/UPDATE grants. It does not alter schedule rows or the public RPC definitions.

React and Capacitor now both have 65 versioned migrations plus the baseline marker. The complete migration directories, `MIGRATION_MANIFEST.json`, `migrations.sha256`, baseline schema, new RLS SQL test, and Services runner are byte-identical. Both manifest validators pass. The manifest SHA-256 is `d63d8e37e12e5c8cc6b5f191b97285a7b6873245246116ab6b5a77e996a352db`; `migrations.sha256` SHA-256 is `b5115bc9364bf8ededf43ec897ad332f71375b3390f0816e892fa85a85ca4da1`.

### Disposable database verification

- **PASS — fresh full-chain replay:** both repositories independently applied baseline and all 65 migrations in order on PostgreSQL 17.11, including order 66.
- **PASS — RLS matrix in each repository:** anon cannot SELECT the table but can read the approved active-listing profile and slots; unrelated customer sees/changes zero schedule rows and cannot insert a schedule; active provider can manage only their own schedule and cannot transfer ownership; active admin can read and update provider schedules. Grants and RLS enabled were asserted.
- **PASS — Services E2E in each repository:** 12/12 tests; profile and availability, provider schedule publication, outside-hours rejection, canonical duplicate prevention, simultaneous two-customer same-slot race (one success/one conflict), day-off and blackout enforcement, sandbox settlement/refund, restart persistence, and provider/customer/admin lifecycle.
- **PASS — TypeScript/lint and production build:** `npm run lint` and `npm run build` passed in both repositories.

### Hosted ledger / Security Advisor attempt and pending count

At 2026-11-07 05:26 UTC, read-only Supabase MCP calls for project details, migration history, catalog SQL, and Security Advisor were attempted against `obkfgxjzlscungkhbyvq`; each was denied with `You do not have permission to perform this action`. No fallback credential or write-capable path was used. Therefore current Mumbai identity, ledger, effective grants/policies, and Security Advisor findings are **BLOCKED** for fresh verification.

The last successful hosted snapshot recorded in this checklist is 53 ledger rows through `20261105140000`, i.e. 52 migration versions plus the baseline marker. Against that historical snapshot, local pending candidates increase from 12 to **13** after adding order 66. **The exact current hosted pending count is unverified** and must be recomputed from a fresh authorized read-only ledger before the migration is presented for approval. Do not apply or reapply any migration until that reconciliation passes.

**Decision: NO-GO for hosted migration.** Local RLS and Services verification is PASS; hosted verification and exact pending migration count remain BLOCKED. This checklist update is not migration approval.

## Mumbai access and migration reconciliation (read-only, 2026-11-07)

This addendum supersedes the older connector/credential and pending-count statements above. It records read-only work only. No hosted data, schema, Auth, Storage, or migration state was changed; no backup was created or uploaded.

### Access and identity

| Check | Status | Evidence |
|---|---|---|
| Stored credential source | **PASS** | macOS Keychain item service `bos-production-backup` was present and used in memory. The credential itself and full URL were not printed or logged. No password reset or local credential edit occurred. |
| Mumbai connection target | **PASS** | Session Pooler `aws-0-ap-south-1.pooler.supabase.com:5432`, database `postgres`, user `postgres.obkfgxjzlscungkhbyvq`, SSL `require`; keychain username pins project reference `obkfgxjzlscungkhbyvq`. The direct IPv6 endpoint was not used. |
| Read-only PostgreSQL | **PASS** | Read-only transaction connected as database role `postgres` to PostgreSQL 17.11. The guard forced `default_transaction_read_only=on`; the transaction rolled back. The earlier 28P01 failure is not reproducible with the current Keychain item; its historical cause cannot be established, but the credential currently stored there is accepted. |
| Supabase connector | **BLOCKED** | Supabase MCP project/catalog endpoints still deny this session permission. Direct, target-pinned PostgreSQL reads provided the evidence below. |

### Hosted ledger, local files and checksums

At 05:26 UTC, the hosted ledger read returned **53 rows**, including baseline marker `00000000000000`, ending at `20261105140000`. Against that snapshot, 52 migration versions were recorded and 13 local versions (orders 54–66) were candidates. This is historical evidence only: fresh hosted list/catalog calls are now denied, so the actual current hosted pending count remains unverified. This does not authorize applying any migration.

| Order | Version | SHA-256 |
|---:|---|---|
| 54 | `20261105150000` | `6b1cced1c112679f80e152630587fb54c0d5521223a0789617ad8ed03e37d49c` |
| 55 | `20261105160000` | `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f` |
| 56 | `20261105163924` | `a4aa10b30eb0cdd612896ee88384cf6cc25c0419de85d05c791804f4d7d7e440` |
| 57 | `20261105170000` | `4693e0930088538aaf076d9d331d04808dcffd778772ddfa66336d8057b66d4e` |
| 58 | `20261105180000` | `390c7688b72deead74e7b0280cf7873ed47c3bfd85926e68d0ad6406abece09e` |
| 59 | `20261105210000` | `f22c3b1700135c02eaf1ae69c2d028743558cb07b0dd7dcbd3c22ea50996922a` |
| 60 | `20261105220000` | `3d476396f23466878c7245c59d01edc9c135955160c74d7a50b1574717292889` |
| 61 | `20261106010000` | `fc65266798f68df881480d0eb59cc5abfbf76b2f1ca6b0f9241534fe47191f63` |
| 62 | `20261106120000` | `3147405e6633530316ed7b318447837917ba3e7fa658064b07eaf253d920f121` |
| 63 | `20261106130000` | `44822b66903916a068d3d78c378e2a9d0bbfb2dadc855ac0db0625defc92eb48` |
| 64 | `20261106174309` | `3b6d87409fc9f3b655bcaef92d1920793d5135d7f0704e63248edb595e5fde27` |
| 65 | `20261107032340` | `67c85b9e27c997563ae9e76570861f118333e2096e86539507b2c81c149aa2f9` |
| 66 | `20261107051930` | **Repository mismatch:** Web `96fb8c34daa3cc5983c4903519e2ded737e5bf333a881865cb32e10a03d16202`; Capacitor `6c9758eaab9cd8b6d7dec1233e2657895af1d7aeb8e068ce6a48300aeef5ef14`. Both manifests record the Capacitor hash; Web manifest does not match its current SQL bytes. |

For orders 54–65, both repositories' current bytes match each other and their manifests. **FAIL / NO-GO:** order 66 differs across repositories and the Web manifest is stale relative to its file. Preserve both files; do not regenerate, copy, or apply until the owner resolves which SQL bytes are authoritative and both manifests are reviewed. Re-run all hashes after reconciliation.

### Effective hosted function permissions

Read-only catalog checks evaluated `has_function_privilege` for the effective roles. All eight are `SECURITY DEFINER`, have pinned function search paths, have no effective `PUBLIC` grant, and deny `anon`; however, **all eight grant direct `authenticated` execution and `service_role` execution**:

| RPC | anon | authenticated | service_role | Finding |
|---|---:|---:|---:|---|
| `create_booking_atomic` | no | yes | yes | Authenticated direct call remains possible; no in-repository server caller found. |
| `create_service_payment_intent` | no | yes | yes | Server caller exists; browser grant remains broader than server-only candidate policy. |
| `create_stay_checkout` | no | yes | yes | Server caller exists; browser grant remains broader than server-only candidate policy. |
| `pg_create_payment_intent` | no | yes | yes | Server caller exists; browser grant remains broader than server-only candidate policy. |
| `stay_hold_units` | no | yes | yes | Server caller exists; browser grant remains broader than server-only candidate policy. |
| `stay_cancel_allocation` | no | yes | yes | No in-repository server caller found; browser grant remains broader than candidate policy. |
| `record_live_edit_cinema_audit` | no | yes | yes | Direct execution is broader than the intended server-only boundary. The hosted body checks `auth.uid()`, active provider/admin/Super Admin role, screen ownership and a server-context GUC. No exploit was demonstrated; the GUC is not a replacement for the planned EXECUTE restriction. |
| `finalize_media_asset` | no | yes | yes | **High risk:** authenticated owners can directly invoke the existing metadata-only finalizer. Trusted server-side byte inspection and removal of authenticated EXECUTE are not present in hosted state. |

The local `20261107032340_authenticated_rpc_security_boundary_audit.sql` revokes `authenticated` from these eight and grants only `service_role`, but that version is pending in Mumbai. The local media byte-validation migration `20261105150000` also changes the metadata-only finalization boundary. The media route in `src/server/mediaValidationApi.ts` currently calls `finalize_media_asset_server`, while the hosted catalog and pending SQL target `finalize_media_asset`; verify the intended RPC name before migration approval. Server callers found for payment intents, Stays checkout/hold and cinema audit validate a server-side actor/ownership or active profile, then use a transaction-local `SET ROLE service_role`. `create_booking_atomic` and `stay_cancel_allocation` had no in-repository caller in the searched React server/source tree. Do not treat service-role use in application code as a substitute for fixing the hosted EXECUTE grants.

Other catalog checks: `settle_stay_payment` and `refund_stay_payment` are service-role-only (`anon=false`, `authenticated=false`, `service_role=true`); `is_admin` and `is_active_user` deny anon and are executable by authenticated/service_role. The pending `close_account_server` and `review_stay_listing` functions were not present under those names in the hosted catalog. No write was attempted.

### Google profile backfill and recovery destination

| Check | Status | Evidence |
|---|---|---|
| Google profile backfill | **PASS — not needed now** | Read-only anti-join found 0 Google Auth users without a `public.profiles` row (1 Google identity among 2 Auth users). No Auth/profile write was performed. |
| GPG recovery configuration | **PASS** | Recovery keyring fingerprint matches the configured recipient; recovery passphrase Keychain item is present. Secret values were not read to output. |
| Off-device encrypted destination | **BLOCKED** | `/Volumes` contains only the system volume and mounted installer volumes; no owner-controlled off-device backup target was identified. Nothing was uploaded or created. Do not treat the existing internal backup path as off-device recovery. |

### Change-window decision and owner actions

**NO-GO for hosted migration.** Before a change window can be presented for approval, the owner must: (1) resolve the 13th-version count and the order-66 React/Capacitor checksum mismatch without overwriting either copy; (2) review the effective authenticated EXECUTE grants and approve a forward-only hosted security correction, including audit-RPC and media-RPC naming; (3) decide whether to provide an off-device encrypted destination; and (4) request a fresh read-only ledger/grant check at the eventual window start. The current credential works; no reset is indicated by this evidence. This addendum does not authorize SQL, role changes, fixtures, backup creation, upload, or migration execution.

## Schedule RLS drift closure and final preflight (2026-11-07)

This addendum supersedes the earlier drift status. All work was local or read-only. No hosted SQL, migration, Auth, Storage, backup, payment, or deployment operation was performed.

### Schedule-security migration review

The React working tree contained `20261107051930_restrict_service_provider_schedule_access.sql`; the Capacitor working tree also contained the same version, but its grant clause differed. I preserved both files and reconciled the single grant difference by making both versions revoke all privileges from `PUBLIC`, `anon`, and `authenticated`, then granting only `SELECT`, `INSERT`, and `UPDATE` to `authenticated`. The migration SHA-256 is `96fb8c34daa3cc5983c4903519e2ded737e5bf333a881865cb32e10a03d16202` in both repositories.

Review findings:

- **PASS — SQL and dependencies:** the migration is version 66, after migration 65. Its table dependency (`public.service_provider_schedules`) was created by `20261103211000_services_schedule_and_verified_payments`; `public.is_admin()` has the active-account check from `20261104190000_active_admin_authorization`; public discovery projections/RPCs already exist from earlier migrations. It changes no rows, function bodies, schemas, or storage. It runs in one `BEGIN`/`COMMIT` transaction.
- **PASS — RLS:** RLS is explicitly enabled. The permissive `USING (true)` published-schedule policy and prior owner policy are removed. SELECT is limited to an active provider reading their own row or an active admin; INSERT and UPDATE use the same owner/admin boundary, and UPDATE has both `USING` and `WITH CHECK` to prevent ownership transfer. The public-safe `service_listing_profile()` and `service_listing_slots()` paths remain available for approved active listings; raw schedule columns such as timezone/provider ID are not exposed to anon.
- **PASS — grants:** the migration revokes all table privileges from `PUBLIC`, `anon`, and `authenticated`, then restores only authenticated SELECT/INSERT/UPDATE. No direct client DELETE is granted. The test checks these effective privileges and RLS behavior on a fresh disposable PostgreSQL 17 cluster.
- **PASS — role matrix on Web and Capacitor:** anonymous raw-table access denied while approved public projection/slots remain available; customer has no schedule rows and cannot insert/update another owner; unrelated active provider sees only its own schedule; active owner can update its own row but cannot transfer ownership or alter another provider; suspended provider cannot read/write even its legacy row; active admin can inspect/update all three fixture schedules. Existing database-backed Services E2E also passed on Capacitor, 12/12, and on Web after rerun, 12/12.
- **PASS — ordering/manifest integrity:** both repositories now contain the same 65 SQL migrations with exact byte parity. Both `MIGRATION_MANIFEST.json` files and both `migrations.sha256` files were regenerated; their ordered migration arrays and checksum inventory are identical. Both manifest checks pass. The Web and Capacitor installer `--plan` commands pass read-only and show the same order through migration 66. No manifest check was bypassed.

### Disposable full-chain and stay caller verification

- **PASS — Web disposable database validation:** `supabase/tests/run_local_validation.sh` on PostgreSQL 17.11 applied all 65 migrations and completed `ALL CHECKS PASSED`: 63 functional stay/inventory assertions, 24 contact, 14 App Builder, 10 rural, 10 profile privacy, 12 Super Admin, 6 bootstrap, 20 media, and the concurrency check all passed. The full chain included the schedule migration.
- **PASS — Services role matrix and integration:** `supabase/tests/run_services_e2e.sh` applies the full migration chain on PostgreSQL 17.11 and runs the schedule RLS matrix plus real HTTP lifecycle tests. Web first had one browser readiness failure (`Hire a professional…` heading not present during initial app load), then passed 12/12 on rerun. Capacitor passed 12/12. The schedule SQL matrix passed in both runs. The first Web UI failure is retained as a transient FAIL followed by a successful rerun, rather than hidden.
- **PASS — React stay hold runtime:** `tests/stay-booking-e2e.test.mjs` ran against the disposable PostgreSQL 17.11 chain and passed 6/6. Cases covered tampered session subject/signature rejection (401), suspended customer rejection (403), provider role rejection (403), pending/unapproved listing rejection (404), active approved customer hold/booking flow, and concurrent same-room holds (one success, one conflict). No real payment provider was contacted; the verified booking was an isolated local fixture.
- The React `stayApi` now sets the request claims explicitly for every actor-scoped transaction, checks and row-locks the active customer profile before using the service-role-only hold RPC, checks the approved listing/room, then elevates only the hold statement. Inactive accounts receive HTTP 403. TypeScript checks passed in both repositories in the preceding verification; the runtime stay test above covers the React implementation.

### Current pending set and hosted access

The last read-only hosted ledger available to this work showed 53 rows through `20261105140000`. On that **historical** ledger, the local set would have **13 pending migrations**, orders 54–66. Current actual hosted pending count is **BLOCKED / unknown**: a fresh authorized Supabase `list_migrations` request and a catalog-only SQL query for effective EXECUTE grants both returned “You do not have permission to perform this action.” A final read-only `SELECT 1` through the pinned session pooler using the configured Keychain item again returned `password authentication failed`; the secret remained in a short-lived mode-0600 passfile and was never printed, and the passfile was removed. Project reference, region-scoped host, tenant-qualified username, port 5432/session mode, database, and `sslmode=require` match the approved local target profile. No reset or alternate credential was attempted. Do not treat the 13 as a current hosted count until an authorized read-only ledger succeeds.

Provisional orders 54–66 against the last known 53-row ledger (SHA-256 values from both regenerated manifests):

| Order | Version | Migration | SHA-256 |
|---:|---|---|---|
| 54 | `20261105150000` | `server_media_byte_validation.sql` | `6b1cced1c112679f80e152630587fb54c0d5521223a0789617ad8ed03e37d49c` |
| 55 | `20261105160000` | `media_published_listing_visibility.sql` | `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f` |
| 56 | `20261105163924` | `profile_media_and_account_closure.sql` | `a4aa10b30eb0cdd612896ee88384cf6cc25c0419de85d05c791804f4d7d7e440` |
| 57 | `20261105170000` | `stay_discovery_filters.sql` | `4693e0930088538aaf076d9d331d04808dcffd778772ddfa66336d8057b66d4e` |
| 58 | `20261105180000` | `stay_host_inventory_controls.sql` | `390c7688b72deead74e7b0280cf7873ed47c3bfd85926e68d0ad6406abece09e` |
| 59 | `20261105210000` | `stay_requests_fees_profiles.sql` | `f22c3b1700135c02eaf1ae69c2d028743558cb07b0dd7dcbd3c22ea50996922a` |
| 60 | `20261105220000` | `restore_pg_hostel_property_type.sql` | `3d476396f23466878c7245c59d01edc9c135955160c74d7a50b1574717292889` |
| 61 | `20261106010000` | `stay_razorpay_and_verified_upi.sql` | `fc65266798f68df881480d0eb59cc5abfbf76b2f1ca6b0f9241534fe47191f63` |
| 62 | `20261106120000` | `stay_owner_onboarding_approval.sql` | `3147405e6633530316ed7b318447837917ba3e7fa658064b07eaf253d920f121` |
| 63 | `20261106130000` | `stay_booking_guest_contacts.sql` | `44822b66903916a068d3d78c378e2a9d0bbfb2dadc855ac0db0625defc92eb48` |
| 64 | `20261106174309` | `security_advisor_forward_fixes.sql` | `3b6d87409fc9f3b655bcaef92d1920793d5135d7f0704e63248edb595e5fde27` |
| 65 | `20261107032340` | `authenticated_rpc_security_boundary_audit.sql` | `67c85b9e27c997563ae9e76570861f118333e2096e86539507b2c81c149aa2f9` |
| 66 | `20261107051930` | `restrict_service_provider_schedule_access.sql` | `96fb8c34daa3cc5983c4903519e2ded737e5bf333a881865cb32e10a03d16202` |

The currently configured target reference and session-pooler endpoint remain the approved Mumbai values; the credential itself remains unusable until its owner reconciles it. No password reset or alternate credential attempt was made. Hosted effective EXECUTE grants for the eight trusted RPCs and sensitive SECURITY DEFINER functions remain **BLOCKED**; disposable ACL/RLS results are not represented as hosted grants.

### Off-device backup destination and owner decisions

No AWS CLI profile or `rclone` remote is configured, and the current encrypted backup root is on the same local filesystem as the repositories. **No off-device destination has been validated and no upload occurred.** Proposed destination: an owner-controlled organization vault or S3-compatible bucket with block-public-access, TLS, server-side encryption, object versioning/retention lock, audit logging, a separate least-privilege upload identity, and a distinct recovery administrator. Upload only client-side GPG-encrypted PostgreSQL/Storage archives and encrypted manifests; verify remote size and SHA-256 and perform an isolated restore before relying on it. Never upload plaintext, Keychain entries, private keys, or passphrases.

Owner decisions required before the window: choose the destination/account/region and encrypted path; approve retention and object-lock duration/cost; name the upload and recovery identities; confirm the canonical GPG recovery operators; separately authorize any upload; refresh the hosted ledger and EXECUTE-grant snapshot read-only; confirm the current 13-or-other pending count; and accept or defer migration execution. **GO/NO-GO remains NO-GO** until hosted read access and the off-device recovery destination are resolved and the exact current hosted ledger matches the reviewed manifest.

## Fresh verification addendum — 2026-11-07 07:04 UTC

This addendum supersedes prior inferred states where this fresh check differs. No hosted writes, database changes, Auth/Storage changes, credential rotation, uploads, or migration applications were performed.

### Hosted access and PostgreSQL authentication

- **Supabase account/project scope: BLOCKED.** The connected account's project list exposes only `zykxneztahxbjduagutv` (`bookmyspace-dev`, ap-south-1, PostgreSQL 17.6); Mumbai `obkfgxjzlscungkhbyvq` is not listed. Read-only project detail, migration ledger, SQL catalog, and Security Advisor requests for Mumbai return permission denied. No role or membership changes were attempted. An organization/project owner must assign the connected identity a project-scoped Read-Only role (or use an already authorized read-only account); Supabase documents role scope and availability [here](https://supabase.com/docs/guides/platform/access-control).
- **Pooler: NETWORK PASS / AUTH FAIL.** Canonical target configuration is `aws-0-ap-south-1.pooler.supabase.com:5432`, database `postgres`, username `postgres.obkfgxjzlscungkhbyvq`, TLS `sslmode=require`. TCP is reachable and `psql` reached PostgreSQL's password-authentication response, so DNS/network/TLS and target syntax are not the observed failure. A one-shot read-only `SELECT 1` using the existing Keychain credential returned `FATAL: password authentication failed`. The stored credential is rejected; this cannot distinguish a stale Keychain value from a server-side password change. Nothing was reset or changed, and the credential was never printed.

### Ledger, manifests, EXECUTE/RLS and replay

- **Current hosted ledger and Security Advisor: BLOCKED / UNKNOWN.** No current hosted rows or findings were retrieved. The last successful 53-row ledger through `20261105140000` is historical only. The 13 entries at orders 54–66 above are **provisional**, not a verified current hosted pending count.
- **Both repositories list 65 migrations, but byte integrity FAILS.** Capacitor's order-66 file hashes to the manifest-pinned `6c9758eaab9cd8b6d7dec1233e2657895af1d7aeb8e068ce6a48300aeef5ef14`. React's current file hashes to `96fb8c34daa3cc5983c4903519e2ded737e5bf333a881865cb32e10a03d16202`, while React's manifest and checksum inventory still pin the Capacitor hash. React's migration additionally revokes `authenticated` before granting selected table privileges; Capacitor does not. Orders 54–65 match byte-for-byte. Capacitor's manifest check passes; React's `migration_manifest.mjs` fails at order 66 and reports checksum inventory drift. Both files were preserved; no manifest was regenerated. **Do not approve or apply order 66 until the owner resolves which SQL is authoritative and both trees/manifests are reviewed.**
- **Provider schedule local security: PASS.** React Services E2E ran the SQL matrix with notice `PASS schedule RLS and least-privilege table grants`; Services API E2E then passed provider schedule publishing, customer slot isolation, availability, concurrent booking, signed settlement, refunds and restart. This is disposable-local evidence only. Hosted effective table grants/policies remain **BLOCKED**.
- **Eight trusted-server RPC grants: hosted BLOCKED; local ACL test BLOCKED.** Hosted catalogs were inaccessible. The dedicated local assertion is `authenticated_rpc_security_audit_test.sql`, invoked by `run_guardrails_audit.sh`; this attempt exited at `initdb` before assertions ran. Do not infer current hosted EXECUTE grants from SQL files or unrelated E2E suites.
- **Restored-database replay/timeout/rollback: BLOCKED.** The encrypted archive `obkfgxjzlscungkhbyvq-20261106T135330Z-installer-preflight` passes archive verification and all six listed SHA-256 checks. Its existing restore record reports PostgreSQL 17.11, 68 public tables, 68 RLS tables, 135 policies, 2 Auth users/identities, and 10 Storage metadata tables; Storage object bytes are excluded. That historical restore record is not a fresh restore/replay in this verification. The current machine has no `gpg` executable, so the archive could not be decrypted into an isolated restore; the Keychain item exists but was not read or exposed. No timeout/rollback drill is claimed. Fresh migration-chain replay did run in the module harnesses below.

### Disposable local regression results

Runner: `supabase/tests/run_all_booking_suites.sh /tmp/bos-final-six-module-preflight.log` on PostgreSQL 17.11. It creates throwaway clusters and does not access hosted services or move money.

| Area | Result | Evidence |
|---|---|---|
| Live Builder audit/security | PASS | Both suites exited 0; Live Edit security reports 19/19 passed. |
| PG payments | PASS | Signed sandbox payment suite exited 0. |
| PG inventory/booking | FAIL | Integration suite exited 1. Provider booking, cancellation, role isolation and browser discovery checks passed, but inventory restoration, overlapping block/booking race, public availability count, reserved-bed removal rollback, concurrent final-bed allocation and restart block fixture assertions failed. |
| Classes | PASS | Chromium owner/admin/student journey and last-seat concurrency suite exited 0; 7 Playwright cases passed. |
| Function Halls/Venues | PASS | Chromium create/approval/booking/cancellation/dispute/sandbox settlement/restart suite exited 0; 9 cases and cross-engine/mobile surface checks passed. |
| Services API/RLS | PASS | Provider schedule RLS/grants matrix and Services API E2E exited 0, including concurrent same-slot protection, payment/refund and restart persistence. |
| Services browser | FAIL | Suite exited 1 before browser journey: signed sandbox settlement returned HTTP 500 `SERVICE_SETTLEMENT_FAILED`; response says nothing was charged. Root cause was not established from sanitized output. |
| Stays/payments/refunds | PASS | Checkout, signed capture, unpaid pay-after-service, refunds, inventory concurrency, restart persistence and account isolation passed in the local sandbox suite. |
| Dedicated RPC ACL/rollback guardrails | BLOCKED | `run_guardrails_audit.sh` failed at disposable `initdb`; no ACL assertion or rollback drill result is available. |

Complete runner log: `/tmp/bos-final-six-module-preflight.log`. Suites inject locally signed QA sessions; they are not Google OAuth or hosted-auth tests.

### Recovery destination and verdict

- **Encrypted archive integrity: PASS; freshness: WARN.** The selected archive's SHA-256 list verifies and its metadata identifies the expected Mumbai project and recovery fingerprint. It is dated 2026-11-06 13:53 UTC, so it is not a current 2026-11-07 recovery point.
- **Off-device destination: BLOCKED.** The archive root is under `/Users/aa/BookOurSpace_Backups/react` on this machine. No external physical disk is attached (`diskutil list external physical` returned no device); the mounted `/Volumes` images are read-only. No `rclone` remote or AWS CLI profile is available, and no remote copy was verified. The archive's restore record explicitly excludes Storage binary object bytes. No upload or deletion occurred.
- **Owner checklist verdict: NO-GO.** Before any hosted migration approval: obtain project-scoped read-only access; reconcile the rejected pooler credential through the authorized Supabase owner without automated reset; refresh the hosted ledger/Advisor; resolve order-66 byte drift; run the eight-RPC ACL test and restored-backup replay with lock/statement timeout and rollback assertions; verify an off-device encrypted destination and separately account for Storage object recovery; then rerun the failing PG inventory and Services browser tests. All 13 versions/hashes remain provisional against historical state only.

## Final local migration reconciliation — 2026-11-07

This addendum supersedes the earlier local order-66 mismatch, order-61 drift, and blocked replay statements above. It records local validation performed after the source SQL stabilized. Hosted facts below are the owner-provided read-only status for this task (53 ledger rows, 13 pending, orders 54–65 matched, order 66 mismatched); this addendum does not claim a fresh hosted query.

### Version selection and byte integrity

- **PASS — `20261107051930_restrict_service_provider_schedule_access.sql`:** line-by-line comparison found one grant-boundary difference. The old Capacitor candidate (`6c9758eaab9cd8b6d7dec1233e2657895af1d7aeb8e068ce6a48300aeef5ef14`) revoked `PUBLIC` and `anon`, but did not first revoke `authenticated`; the selected version (`96fb8c34daa3cc5983c4903519e2ded737e5bf333a881865cb32e10a03d16202`) revokes all three, then grants authenticated only `SELECT`, `INSERT`, and `UPDATE`. DELETE and other table privileges remain unavailable. RLS still limits rows to the schedule owner and authorized admin workflows.
- **PASS — Services behavior/privacy:** the selected and preserved prior candidates were exercised in disposable PostgreSQL role/lifecycle tests. The final selected bytes passed the schedule RLS/grant matrix and Services E2E in both repositories. Customers and unrelated providers do not read schedule rows; owners retain permitted schedule management; admins retain review capability; bookings, slot availability, settlement, cancellation/refund and restart persistence remain functional.
- **PASS — additional order-61 drift resolved:** `20261106120000_stay_owner_onboarding_approval.sql` is now the same tested version in both repositories, SHA-256 `40ee36bb5958ce6d6a8a5204698bd7d3573e7f2f265817e98d803b829d30cb04`. Compared with the preserved old Capacitor candidate (`3147405e6633530316ed7b318447837917ba3e7fa658064b07eaf253d920f121`), it clears and restores both `request.jwt.claim.sub` and the JSON `request.jwt.claims.sub` around trusted trigger-controlled state transitions. The owner submit/approval test sets both claim forms and passes; the prior candidate failed that context.
- **PASS — repository parity:** all 65 migration filenames and SQL bytes match between Web and Capacitor. Both `MIGRATION_MANIFEST.json` files are now byte-identical (SHA-256 `41ac91ab52120232aa52c6b81e7231cb1b6a4d7e26f9f336b4f4608269330ffb`); both `migrations.sha256` files are byte-identical (SHA-256 `61463552aff4ce280c890a0d8950699168499dba5b1b60e460f3322197d23e89`). `migration_manifest.mjs` passes in each repository: baseline + 65 migrations, unique versions, all SHA-256 values match. The former Capacitor candidates are retained read-only in mode-0600 reconciliation sidecars under its `docs/migration-reconciliation/` directory.

### Final provisional 13-file set and checksums

These are the exact local bytes for orders 54–66, relative to the supplied 53-entry hosted ledger. Confirm the live ledger and these values again with read-only access immediately before any separately approved execution.

| Order | Version | File | SHA-256 |
|---:|---|---|---|
| 54 | `20261105150000` | `server_media_byte_validation.sql` | `6b1cced1c112679f80e152630587fb54c0d5521223a0789617ad8ed03e37d49c` |
| 55 | `20261105160000` | `media_published_listing_visibility.sql` | `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f` |
| 56 | `20261105163924` | `profile_media_and_account_closure.sql` | `a4aa10b30eb0cdd612896ee88384cf6cc25c0419de85d05c791804f4d7d7e440` |
| 57 | `20261105170000` | `stay_discovery_filters.sql` | `4693e0930088538aaf076d9d331d04808dcffd778772ddfa66336d8057b66d4e` |
| 58 | `20261105180000` | `stay_host_inventory_controls.sql` | `390c7688b72deead74e7b0280cf7873ed47c3bfd85926e68d0ad6406abece09e` |
| 59 | `20261105210000` | `stay_requests_fees_profiles.sql` | `f22c3b1700135c02eaf1ae69c2d028743558cb07b0dd7dcbd3c22ea50996922a` |
| 60 | `20261105220000` | `restore_pg_hostel_property_type.sql` | `3d476396f23466878c7245c59d01edc9c135955160c74d7a50b1574717292889` |
| 61 | `20261106010000` | `stay_razorpay_and_verified_upi.sql` | `fc65266798f68df881480d0eb59cc5abfbf76b2f1ca6b0f9241534fe47191f63` |
| 62 | `20261106120000` | `stay_owner_onboarding_approval.sql` | `40ee36bb5958ce6d6a8a5204698bd7d3573e7f2f265817e98d803b829d30cb04` |
| 63 | `20261106130000` | `stay_booking_guest_contacts.sql` | `44822b66903916a068d3d78c378e2a9d0bbfb2dadc855ac0db0625defc92eb48` |
| 64 | `20261106174309` | `security_advisor_forward_fixes.sql` | `3b6d87409fc9f3b655bcaef92d1920793d5135d7f0704e63248edb595e5fde27` |
| 65 | `20261107032340` | `authenticated_rpc_security_boundary_audit.sql` | `67c85b9e27c997563ae9e76570861f118333e2096e86539507b2c81c149aa2f9` |
| 66 | `20261107051930` | `restrict_service_provider_schedule_access.sql` | `96fb8c34daa3cc5983c4903519e2ded737e5bf333a881865cb32e10a03d16202` |

### Local replay, RPC, media and application-call evidence

- **PASS — full local suite in Web and Capacitor:** `supabase/tests/run_local_validation.sh` completed against PostgreSQL 17.11 in each repository. Both reported: functional `63`, contact `24`, App Builder `14`, rural listings `10`, profile privacy `10`, Super Admin `12`, bootstrap `6`, media `20`, and concurrency `1`; no double booking. The authenticated RPC audit passed: all eight trusted-server RPCs deny `anon` and `authenticated` direct execution while retaining `service_role`; security-definer/search-path and payment/audit immutability assertions passed.
- **PASS — Services role and browser lifecycle in both repositories:** `supabase/tests/run_services_e2e.sh` passed the schedule RLS/least-privilege grant matrix and all `12/12` HTTP/browser lifecycle tests in Web and Capacitor. Direct SQL invariants showed no duplicate live slots and no cross-customer payment rows.
- **PASS with explicit local restore limitation — replay from existing snapshot:** the locally retained 2026-11-06 snapshot was verified against its recorded plaintext SHA-256, restored into a fresh disposable PostgreSQL 17.11 instance, and all 13 migrations above applied in order. Result: `73` public tables. Vanilla PostgreSQL lacks Supabase Vault, so four Vault extension/schema TOC entries were excluded from this isolated restore. This proves the migration replay against the restored non-Vault schema/data, not Vault recovery, Storage object-byte recovery, or off-device recovery. A previous restore attempt without the Supabase roles/ACLs also confirmed that the archive does not preserve all platform grants; role-matrix proof is therefore the separate clean full-chain test result above.
- **PASS — `finalize_media_asset` transition:** migration 54 revokes client execution of the metadata-only finalizer and adds `finalize_media_asset_server`, executable only by `service_role`. `src/server/mediaValidationApi.ts` verifies the Google identity, active profile and ownership, fetches the quarantined object bytes with a server-only credential, decodes and checks format/size/dimensions/SHA-256 plus derivative MIME/size/quality, then calls the new RPC. Tests reject client bypass, wrong owner, object-size/checksum mismatch and invalid variants, and allow a valid quarantined-to-ready transition. Missing server credential or missing migration fails closed. The old hosted RPC remains a compatibility blocker until migration 54 is approved and applied.
- **PASS — caller boundary audit:** repository search found no browser-side call sites for the eight restricted routines. Current server call sites run in server repositories/APIs (`stayApi.ts`, `stayPayments.ts`, `serviceCommerceApi.ts`, `pgPaymentRepository.ts`, `providerListingRepository.ts`, and `mediaValidationApi.ts`) after verified actor/profile, ownership, booking/payment state or signed-webhook checks, then use transaction-scoped `SET LOCAL ROLE service_role`. `create_booking_atomic` and `stay_cancel_allocation` have no current application call sites in these repositories; confirm there are no external consumers before removing authenticated grants in hosted rollout.

### Prepared rollout and recovery sequence — not executed

1. Before the change window, read-only verify the project ref is exactly `obkfgxjzlscungkhbyvq`, confirm the live ledger is still exactly 53 through `20261105140000`, confirm there are no conflicting versions, and recompute all 13 SHA-256 values above from the approved checkout. Stop on any discrepancy.
2. Establish a recoverable pre-change database snapshot and separately account for Supabase Storage object bytes. The available local archive is not off-device and excludes Storage bytes; the off-device destination remains **BLOCKED**. No rollback/recovery point was verified for this change window.
3. After explicit hosted-write approval only, apply one migration file at a time in version order (54 through 66), with a short lock timeout, statement timeout, `ON_ERROR_STOP`, and a pause after each commit. Do not use broad `db push`. If a migration fails, stop, capture sanitized diagnostics and inspect the ledger/catalog before any retry. Never blindly rerun or reverse an already committed security migration.
4. After each file, verify its ledger row, expected objects/functions, ACLs, RLS policies, and protected row counts. In particular, verify migration 54's server-only media finalizer and byte-validation endpoint compatibility, migration 55 public media predicates, and migration 65's eight RPC grants. Verify migration 66's schedule ACL plus owner RLS matrix.
5. After all 13, verify the exact terminal ledger and read-only catalog state; rerun the Services schedule matrix, trusted-RPC ACL checks, media visibility/finalization checks, and safe booking authorization/concurrency checks. If a committed migration needs correction, prepare a tested forward-only repair and obtain separate approval; do not restore an insecure policy or delete existing data.

**Owner decisions still required:** hosted write approval is not granted by this checklist; confirm/obtain an off-device recoverable database plus Storage-object backup or explicitly decide how to handle that recovery gap; confirm whether the two no-caller RPCs have external consumers; coordinate the server release and protected `serverSecretKey` configuration with migration 54; and decide the acceptable maintenance window/traffic pause. No hosted operation, Auth/Storage write, deployment, push, merge, or payment occurred during this reconciliation.

## Final verified artifact and preflight status (2026-11-07 07:06 UTC)

This section is the latest authority for local files and replaces the conflicting order-66 checksum, credential, manifest-parity, and hosted-ledger statements earlier in the document. It records no hosted writes, credential changes, backup creation/upload, migration application, Auth/Storage changes, payments, push, merge, or deployment.

### Final synchronized files

- Migration `20261107051930_restrict_service_provider_schedule_access.sql` is **byte-identical in both repositories**, final SHA-256 `96fb8c34daa3cc5983c4903519e2ded737e5bf333a881865cb32e10a03d16202`. It includes `REVOKE ALL ... FROM PUBLIC, anon, authenticated` followed by only authenticated `SELECT, INSERT, UPDATE` grants. Version 66 is after the 65 pre-existing migrations.
- The enhanced role-matrix SQL test is byte-identical in both repositories, SHA-256 `e16dc44f9ff408991a0f670cd20903b477f310baae47711d51c6d4afad3a2245`.
- Both repositories have 65 migrations; names and per-file SHA-256 inventories match exactly. `supabase/migrations.sha256` is byte-identical (SHA-256 `36d321384cc7e24f6a10db6e96c7e52f718eaf93574b8e2b1e8f9aa456d6667a`). Both manifest validators pass. The two JSON manifests are also byte-identical in this run and include the same review record.
- Both read-only installer `--plan` commands pass and list the same order 54–66. Plan mode did not connect to Mumbai.

### Runtime evidence

- Full baseline plus all 65 migrations replayed on disposable PostgreSQL 17.11 in both repositories. Web local validation ended `ALL CHECKS PASSED` with functional=63, contact=24, app_config=14, rural=10, profile_privacy=10, super_admin=12, bootstrap=6, media=20, concurrency=1.
- Services role-matrix and HTTP E2E passed 12/12 on Capacitor. Web's first run had 11/12 because Chromium readied slowly and the expected Services heading was absent while the app still showed Loading; the immediate full rerun passed 12/12. Both schedule RLS matrices passed.
- React stay hold API E2E passed 6/6 on the same disposable PostgreSQL 17.11 chain. Tampered signed-session payload rejected (401); suspended customer and provider account rejected (403); unapproved listing rejected (404); authorized booking flow passed; simultaneous holds returned one success and one conflict. Tests never called a real payment provider.
- `npm run lint` passed in both repositories.

### Hosted and off-device decision

- **BLOCKED — current hosted authentication and read access:** final read-only `SELECT 1` using the configured Keychain item at the pinned target again returned password authentication failure. The temporary passfile was mode 0600, removed after use, and never printed. No reset or alternate secret was attempted. Supabase MCP ledger and catalog-grant queries returned a permission denial. The last successful hosted snapshot is historical: 53 ledger rows through `20261105140000`; it implies 13 provisional candidates at local orders 54–66. Current hosted pending count and effective grants are unknown.
- **BLOCKED — off-device encrypted destination:** no `rclone` remote or AWS CLI profile is configured. The existing backup root is on the same local filesystem as the repos. No mounted volume was validated as an owner-controlled, off-device vault; no destination identity, public-access controls, retention, independent credential, or restore path was verified. A dedicated owner-controlled vault with block-public access, TLS, GPG-encrypted archives, server-side encryption, versioning/retention, audit logs, separate least-privilege upload/recovery roles, remote hash verification, and isolated restore remains a proposal only. No upload occurred.

**Final decision: NO-GO for any Mumbai migration window.** Owner decisions/actions: repair or reconcile the Keychain DB credential through its authorized owner; restore authorized read-only hosted ledger/grant access; confirm the live pending set against the 65-entry manifest; choose and validate an off-device encrypted recovery destination and approve any future upload separately; reconfirm the historical zero-candidate Google profile count and explicitly skip or separately approve a backfill. Local verification does not substitute for these hosted gates.

## Final stays regression + migration parity checkpoint (2026-11-07)

Scope: local-only regression and manifest parity. No hosted SQL, migration, Auth or Storage call was made; no live payment, push, merge or deployment ran. The Mumbai target was not contacted in this checkpoint, so all hosted counts below are the previously recorded read-only snapshot, not a refreshed read.

### Manifest, baseline and pending set

`node supabase/tests/migration_manifest.mjs --write` re-pinned the reviewed bytes after adding `20261107121500_user_favorites_grants.sql`, and the verifier then passed: baseline + **66 migrations**, unique 14-digit versions, SHA-256 match. The Capacitor repository carries byte-identical copies of the manifest, checksum inventory, baseline and every migration file.

| Artifact | React | Capacitor |
|---|---|---|
| `supabase/MIGRATION_MANIFEST.json` SHA-256 | `ceffceaf0193b76c53e3ae3e0d4cf115d7a882f3a331c8b92b27209a05ed9bf6` | same |
| `supabase/migrations.sha256` SHA-256 | `6b7964f9a115cf641aa1ee8393b9eb01bfe54c274278a5f71d0c518daf3d2d5e` | same |
| Baseline `schema_and_rls.sql` | 39,246 B · `f37bdbcaf1870a05fe8f45acbf2ec17f0cc99162cd7e60270d5f8d5fabe412c2` | same |
| Migration files | 66 | 66, byte-identical |

The baseline hash changed from `6d4c2d0f…` because `schema_and_rls.sql` now carries the same `grant select, insert, delete on public.user_favorites to authenticated` statement as the new migration, so a first install and an upgrade converge on the same privileges. Both guarded installer plans print the same 66-file order (manifest order 2–67, baseline = order 1, history rows = 67) and both manifest checks pass. No hosted connection was opened.

**Pending set: 14** against the last recorded hosted ledger (53 rows through `20261105140000`, i.e. 52 applied SQL versions). This supersedes the earlier 13-pending count, which predates the grants migration.

| Order | Version | Migration | Bytes | SHA-256 |
|---:|---|---|---:|---|
| 54 | `20261105150000` | `server_media_byte_validation` | 3,120 | `6b1cced1c112679f80e152630587fb54c0d5521223a0789617ad8ed03e37d49c` |
| 55 | `20261105160000` | `media_published_listing_visibility` | 7,951 | `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f` |
| 56 | `20261105163924` | `profile_media_and_account_closure` | 10,771 | `a4aa10b30eb0cdd612896ee88384cf6cc25c0419de85d05c791804f4d7d7e440` |
| 57 | `20261105170000` | `stay_discovery_filters` | 35,364 | `4693e0930088538aaf076d9d331d04808dcffd778772ddfa66336d8057b66d4e` |
| 58 | `20261105180000` | `stay_host_inventory_controls` | 14,165 | `390c7688b72deead74e7b0280cf7873ed47c3bfd85926e68d0ad6406abece09e` |
| 59 | `20261105210000` | `stay_requests_fees_profiles` | 21,698 | `f22c3b1700135c02eaf1ae69c2d028743558cb07b0dd7dcbd3c22ea50996922a` |
| 60 | `20261105220000` | `restore_pg_hostel_property_type` | 2,107 | `3d476396f23466878c7245c59d01edc9c135955160c74d7a50b1574717292889` |
| 61 | `20261106010000` | `stay_razorpay_and_verified_upi` | 26,236 | `fc65266798f68df881480d0eb59cc5abfbf76b2f1ca6b0f9241534fe47191f63` |
| 62 | `20261106120000` | `stay_owner_onboarding_approval` | 29,801 | `40ee36bb5958ce6d6a8a5204698bd7d3573e7f2f265817e98d803b829d30cb04` |
| 63 | `20261106130000` | `stay_booking_guest_contacts` | 4,227 | `44822b66903916a068d3d78c378e2a9d0bbfb2dadc855ac0db0625defc92eb48` |
| 64 | `20261106174309` | `security_advisor_forward_fixes` | 13,938 | `3b6d87409fc9f3b655bcaef92d1920793d5135d7f0704e63248edb595e5fde27` |
| 65 | `20261107032340` | `authenticated_rpc_security_boundary_audit` | 13,921 | `67c85b9e27c997563ae9e76570861f118333e2096e86539507b2c81c149aa2f9` |
| 66 | `20261107051930` | `restrict_service_provider_schedule_access` | 3,378 | `96fb8c34daa3cc5983c4903519e2ded737e5bf333a881865cb32e10a03d16202` |
| 67 | `20261107121500` | `user_favorites_grants` | 472 | `a3428e17b45681d358cc7347139401789e6f7af723b60ed1c704ff6fd5355d87` |

`20261107121500_user_favorites_grants.sql` is a single `grant select, insert, delete on public.user_favorites to authenticated;` statement. It changes privileges only; it adds no table, function or policy, holds no row locks, and is safe inside the installer's per-file transaction. RLS remains owner-only; no UPDATE privilege is granted.

### Local verification in this checkpoint

- **Wishlist RLS (local PostgreSQL, role matrix): PASS 10/10.** A saves/views/removes own favourite; B cannot see, delete or rewrite A's row (UPDATE is refused with `42501` because only SELECT/INSERT/DELETE are granted); A's row survives B's delete attempt; `anon` is denied read and write.
- **Wishlist API isolation: PASS 6/6.** Signed-in save/list works over the session token; a second account sees an empty list; its delete does not touch the first account's row; anonymous access is `401`.
- **Wishlist persistence: PASS 4/4.** Saving while signed in appears in Wishlists; after sign-out the account list is not shown; signing in again with the same identity restores it; a different account does not inherit it. This is a signed local session standing in for the same Google profile — no hosted Google OAuth round-trip was performed.
- **Demo non-bookable marking: PASS 8/8.** Search cards show `Sample` and `Not bookable`; detail shows a disabled `Sample listing — not bookable` CTA with the preview explanation; the checkout component carries the same non-bookable branch; the demo listing exposes zero bookable room types and a direct hold attempt is refused with no allocation.
- **Stay regression: PASS 13/13.** Search (33 seeded stays), server-side price filter, price sort ascending, priced map pins, detail price breakdown (`₹2,400 × 2 nights` → `₹4,800`), availability (2 rooms), checkout quote/`2 rooms free`, confirmation (`BOOKING CONFIRMED — PAYMENT DUE`, price breakdown, balance due), pay-at-hotel booking persisted as `pay_later`/`pay_after_service`, cancellation `released: true`, availability restored to 2, cancelled status visible to the guest.
- **Payment status accuracy: PASS.** No booking or payment intent in the local database is `paid` without provider evidence; observed rows are `pay_later`, `not_due`, `pending_verification`, `pending`, `created`, `expired`. Focused payment tests 29/29 (Pay at Hotel, Razorpay Test Mode settlement only after a signed webhook, verified UPI mapping). No live Razorpay/UPI call was made.
- **Suites.** React unit/API: 301 tests, 284 pass, 17 skipped, 0 fail. Capacitor unit/API: 186 tests, 171 pass, 15 skipped, 0 fail. Browser (Chromium): stays booking 11/11, stays filters/payments/receipt 19/19, Stay 2 smoke 1/1, safe-image 2/2.
- **Mobile.** Android emulator and iOS simulator builds are recorded separately in the delivery report; this checklist makes no claim about native runtime beyond that report.

### Decision (unchanged)

**NO-GO for hosted migration execution.** The local manifest, privileges and regression evidence pass, but a fresh encrypted database + Storage-byte backup pair, a refreshed hosted ledger/Advisor read, the schedule-policy exposure fix, and explicit owner approval of the 14-file set are still required. The grants migration is additive and privilege-only, but it remains subject to the same backup and approval gate as the rest of the pending chain.

## Final QA pass — native, backups and hosted read-only recheck (2026-11-07)

Scope and guard: this pass made no hosted write, no migration, no Auth/Storage change, no payment, push or deploy. Mumbai was queried with `default_transaction_read_only=on` and a 20–25s statement timeout only. Local working tree remains uncommitted.

### Environment remediation (root causes of the earlier native hangs)

- A runaway **Docker Desktop VM** had been consuming ~450–535% CPU for ~21 hours (Docker.raw backing disk, virtualization.framework, PID 83167) and swap was 10.1 GiB of 11.2 GiB used. Docker had already been reported timing out in the previous preflight. The VM was stopped; no container/volume was deleted or inspected.
- Three extra booted iOS simulators and an iPad simulator were shut down, leaving one iPhone 17 Pro on the iOS 26.5 runtime.
- Xcode was found at **26.6** with both iOS 26.4 and iOS 26.5 simulator runtimes installed. After the VM was stopped, `xcodebuild` completed successfully; the earlier "Supported platforms … empty" and asset-catalog stalls did not recur.
- Android was run headless (`-no-window -no-audio -no-boot-anim -memory 3072`) and booted in ~29s.

### Browser suite review (23 skipped, 9 not-run)

The **final** Chromium run is 103 passed, 23 skipped, 0 failed, **0 not-run** (103 + 23 = the 126 tests reported by `--list`). The earlier "9 did not run" line belonged to the superseded run that had two failures; those nine were serial dependents in the failed files and all ran once the two defects were fixed.

All 23 skips are intentional environment/fixture gates, not unexplained gaps:

| Suite | Skipped | Reason |
|---|---:|---|
| `_stay2_cloud_smoke.spec.ts` | 1 | requires `E2E_STAY2_SMOKE=1`; it was run with that flag against the dev server and passed 1/1 |
| `classes-training.spec.ts` | 8 | `E2E_CLASS_SESSIONS` not configured for the run (dedicated seeded harness) |
| `services-booking.spec.ts` | 2 | seeded booking fixtures not present / phase-two restart gate |
| `stays-real.spec.ts` | 1 | requires `E2E_STAYS_REAL=1` (authorized real inventory) |
| `venue-booking-cross-browser.spec.ts` | 1 | `E2E_VENUE_SESSIONS` not configured |
| `venue-booking.spec.ts` | 10 | `E2E_VENUE_SESSIONS` not configured / phase-two restart gate |

### Native verification

**Android — PASS** (Pixel_8_API36 emulator, app built with `VITE_NATIVE_API_ORIGIN=http://10.0.2.2:<local port>`, debug debug builds only). Driven through the real app WebView via its DevTools socket, with a signed local session:

- signed-in session renders (`Demo Guest One`), Stay section loads, results render (`BOS Local Test Hotel 05`), detail opens;
- sticky Reserve bar renders pinned to the bottom (`bottomGap=0`, safe-area `padding-bottom:12px`, text `₹2,600 night · 2 nights · ₹5,200 total · Reserve`), with exactly **one** visible Reserve control;
- checkout opens with the server quote (`2 rooms free`), Pay-at-Hotel selected, booking confirmed (`stay-f7a84bc902f849e29f7b9aebffe62677`, `pay_later`);
- Trips opens and the cancel control is present and clickable;
- wishlist Save responds and `/api/stays/wishlists` returns `200` from the native app;
- keyboard: tapping the guest-name field opens the IME, the WebView resizes (`innerHeight` 840 → 528) and the focused field stays fully visible above the keyboard;
- cancellation completion through the UI was not finished in this pass; server-side cancel + inventory release was verified via the API (`released: true`, availability 2/2).

**iOS — build/launch PASS; interactive checks BLOCKED.**
- `xcodebuild` succeeded (Debug, iOS 26.5 simulator); `simctl install` + `launch` succeeded (`com.bookourspace.app`, PID 99002); the app renders the entry screen; requests reach `http://127.0.0.1:<local port>/api/...` successfully.
- The simulator window is a rendering canvas: the available automation (screen coordinates via `cliclick`, AppleScript/System Events, `simctl`) would not reliably deliver taps to the WKWebView, and `ios_webkit_debug_proxy` could not attach a WebKit inspector target. Sticky bar, keyboard, booking, cancellation and wishlist interaction therefore remain **BLOCKED on iOS**; this is a tooling limitation, not an app failure. No hosted auth was attempted.

### Encrypted backup and isolated restore verification

Existing archives (outside the repo, mode 0600):

| Artifact | Ciphertext SHA-256 | Decrypted SHA-256 | Result |
|---|---|---|---|
| `backup.dump.gpg` (20261106T135330Z) | `ba005a3a…b930053c3` — matches `SHA256SUMS` | `c99c0133…d57ca6` — matches `encryption.txt` | PASS |
| `storage-objects.tar.gz.gpg` (20261106T173030Z) | `f9f14c1b…8936f7a8` — matches evidence | `8bc6f51b…1a93b9ae` — matches evidence | PASS |

- GPG decryption used the owner recovery keyring outside the repo with the Keychain passphrase (`bos-backup-gpg-passphrase-recovery-20261106`); no secret was printed or written.
- Storage archive members verified with its own `SHA256SUMS`: `byte-manifest.json` OK, JPEG 138,395 B OK, WebP 9,962 B OK (total 148,357 B = metadata-reported size).
- Isolated PostgreSQL 17.11 restore into a disposable cluster succeeded: **68 public tables, 68 with RLS, 135 policies, 2 Auth users, 2 identities, 10 Storage metadata tables, 2 buckets, 2 objects, 2 public profiles, 53 migration rows** — identical to the recorded restore evidence. The only restore errors were the disposable cluster lacking Supabase-managed extensions (`supabase_vault`, therefore `vault.secrets`); base schema, data and RLS restored.
- **Off-device copy: BLOCKED.** No second copy exists on an external volume or in iCloud Drive; only the local `~/BookOurSpace_Backups` tree (3.2 GB) is present. The checklist already records this as an owner decision; it remains unresolved.

### Hosted read-only recheck (project obkfgxjzlscungkhbyvq, ap-south-1)

- Migration ledger: **53 rows**, max version **`20261105140000`** (unchanged). Local manifest: **66 migrations** → **14 pending** (52 applied SQL versions + the baseline ledger row).
- RPC surface: **92** `SECURITY DEFINER` functions in `public`; **0** without a pinned `search_path`; **11** executable by `anon`; **64** executable by `authenticated` (counts include PUBLIC execute defaults).
- RLS: **0** public tables without RLS. Two RLS tables have no policy at all (`user_access_audit_events`, `venue_payment_events`) → deny-by-default.
- `user_favorites` on hosted currently grants `anon`/`authenticated` only `TRUNCATE/REFERENCES/TRIGGER` — **no `SELECT`/`INSERT`/`DELETE`**, so hosted signed-in wishlists fail until the pending `20261107121500_user_favorites_grants` is applied. This matches the local failure that the new migration fixes.
- `service_provider_schedules`: RLS on, two policies, `anon` has `SELECT`, and the policy `Published schedules are readable` is permissive with `USING (true)` — the known exposure is **still present** and is addressed by the pending `20261107051930_restrict_service_provider_schedule_access`.
- Multi-permissive policy groups: **17** table/command groups.
- Official **Security Advisor API: BLOCKED** — no Supabase access token is configured for this environment; the catalog checks above are the read-only proxy and are reported as such.

### Decision

**NO-GO unchanged.** Local manifests (66 migrations, 14 pending, identical hashes in both repositories), the encrypted archive integrity and isolated restore pass, and the Android customer journey passes end to end. Hosted apply still requires: a fresh encrypted DB + Storage-byte backup pair immediately before the window, an off-device copy decision, the schedule-policy forward fix, a refreshed hosted ledger/Advisor read with an authorized token, iOS native interaction verification, and explicit owner approval of the exact 14-file set. No hosted changes were made in this pass.

## Demo-catalog booking preview (2026-11-07, local only)

Owner request: the seeded demo stay cards must work end to end (detail, dates, quote, checkout, confirmation, trips, cancellation, wishlist) instead of stopping at a “not bookable” notice.

Implementation is an **explicit local preview**, not a production policy change:

- The SQL bookability gate now refuses demo rows unless the transaction-local setting `bos.allow_demo_booking=on` is present. The new migration `20261107201500_allow_demo_booking_preview.sql` redefines `public.stay_listing_is_publicly_bookable(text)` with that condition; every other rule (active, verified, approved, owner verified, active inventory, not sold out) still applies.
- The server sets that setting only when `NODE_ENV !== 'production'` **and** `BOS_STAY_ALLOW_DEMO_BOOKING=1`. Production never sets it, so demo stays remain unbookable and are still excluded from production discovery.
- Room types, availability, holds, quotes and checkout include demo inventory only under the same flag. The search response reports `demoBookable`, and the client hides the “Not bookable” badge/notice and enables Reserve only when it is true.
- Defaults and tests stay deny-by-default: `tests/stay-listing-gate.test.mjs` asserts demo refuses without the opt-in and books with it, and the e2e harness sets both `BOS_STAY_INCLUDE_DEMO=0` and `BOS_STAY_ALLOW_DEMO_BOOKING=0`. The “Super Admin demo hotels never accept real bookings” browser test still passes.
- `scripts/dev-with-stays-db.sh` and the local `.env.local` enable both preview flags. `.env.example` documents the new flag and its default-off behaviour.

Verification: a demo stay (`demo-ab-varkala-27`, Varkala) was booked end to end in the browser: card keeps the `Sample` label and drops `Not bookable`; detail shows `Reserve` after dates with the `₹8,800 × 2 nights` breakdown; checkout opens the real flow with `2 rooms free`; Pay at Hotel confirms (`stay-e361a6ae…`, `pay_later`); the booking persists with unpaid status; cancellation returns `released: true` and demo availability returns to 2/2. React unit/API suite 304 tests (287 pass / 17 skip / 0 fail); Capacitor 186 (171 / 15 / 0); stays browser suites 27/27 including the demo-never-books default case.

### Migration count correction

The local manifest is now **67 migrations**; against the unchanged hosted ledger (53 rows, max `20261105140000`, i.e. 52 applied SQL versions) the pending set is **15**. Both repositories carry byte-identical manifests, checksums, baseline and migration files; both verifiers pass.

**Decision remains NO-GO** for hosted execution. The new migration is a reviewed local-preview capability with a transaction-local switch; it does not weaken the default or production policy, but it joins the same approval, backup and recovery gate as the other 14 pending files.

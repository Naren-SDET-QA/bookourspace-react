# BookOurSpace — final Mumbai backup preflight

Date: 2026-11-06  
Target: `obkfgxjzlscungkhbyvq` (ap-south-1)  
Repos: `bookourspace-react` (this report) and `bookourspace-react-capacitor` (untouched)  
Mode: **backup + local restore only**

No `--apply`, hosted writes, Auth changes, payments, push, merge, or deployment.

**Stop here. Applying the eight pending migrations needs a separate explicit approval after GPG decrypt is proven interactively.**

---

## Verdict

| Gate | Result |
|---|---|
| Hosted identity | **PASS** `postgres \| user=postgres \| server=17.11`, ref `obkfgxjzlscungkhbyvq`, dump session read-only |
| Dump integrity | **PASS** custom `pg_dump` 1,044,313 bytes, SHA-256 `8054b8cacc5516b49da3063147eb599074356e9d27d2addae06d76e8544b29d6` |
| Restore on disposable PostgreSQL 17 | **PASS** Homebrew **17.11**, twice, `--exit-on-error` (vault extension filtered from TOC) |
| Preserve Auth / Super Admin / RLS / storage metadata / audit | **PASS** counts match hosted inventory |
| Orphaned media hide without deleting bytes | **PASS** on restore copy only (`20261105160000` not applied on Mumbai) |
| Profile backfill | **NOT NEEDED** (0 Auth users missing `public.profiles`; SQL is `on conflict (id) do nothing`) |
| Pending migration hashes | **PASS** file = manifest = `migrations.sha256` for all eight |
| GPG encrypt | **PASS** recipient `CC5AE8D856FE65C7349E9EE94F2EF422CFD44129` |
| GPG decrypt / round-trip | **FAIL** passphrase-protected secret key; no TTY pinentry in this session |
| Official archive verifier | **COMPLETE** (2 warnings: Storage bytes excluded from PostgreSQL; freshness not scored) |
| Apply eight pending migrations | **NO-GO** |

Backup was **not** skipped. Mumbai was not written.

---

## 1. Backup locations (outside both repos)

Encrypted archive (owner-only `drwx------`):

`/Users/aa/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-20261106T105408Z/`

| File | Role |
|---|---|
| `backup.dump.gpg` | 174,056-byte OpenPGP message (RSA session key `4F2EF422CFD44129`, packet header `0x85`) |
| `schema.sql` / `toc.txt` (1,395 entries) | Schema + custom-format TOC including `auth.users`, `auth.identities`, `storage.objects` |
| `identity-preflight.txt` | Read-only dump identity |
| `hosted-inventory.txt` | Hosted preserve counts captured during the dump session |
| `restore-verification.txt` | Disposable PG 17 restore counts |
| `media-visibility-before.txt` / `media-visibility-proof.txt` | Local-only 160000 hide proof |
| `encryption.txt` | Encrypt PASS / decrypt FAIL |
| `SHA256SUMS` | Archive checksums |

Plaintext hold (kept because decrypt is unproven; `700`):

`/Users/aa/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-20261106T105408Z-plaintext-hold/backup.dump`

Keyring stays outside the archive and both repos: `~/.config/bookourspace/backup-gnupg`.

Storage **object bytes** are not in PostgreSQL. The dump has metadata only (2 objects, 148,357 bytes recorded in `storage.objects.metadata`). Bytes remain on hosted Storage until a separate delete is approved.

---

## 2. Restore PASS — preserve inventory

Dump: session pooler, `sslmode=require`, `PGOPTIONS=-c default_transaction_read_only=on` **only on the hosted dump**. Local restore unsets `PGOPTIONS` (a first attempt failed with `CREATE DATABASE` in a read-only transaction while that option leaked).

Restore cluster: PostgreSQL **17.11** (Homebrew). `supabase_vault` objects were excluded from the restore TOC; public/auth/storage data restored.

| Object | Hosted | Restored |
|---|---:|---:|
| `auth.users` | 2 | 2 |
| `auth.identities` (google 1, email 1) | 2 | 2 |
| `public.profiles` | 2 | 2 |
| Super Admin (`is_super_admin`, `role=admin`) | 1 | 1 |
| Super Admin UUID `887f5e06-e06d-4bee-a5a2-081f6cbd32ec` | true | true |
| Public tables / RLS enabled / policies | 68 / 68 / 135 | 68 / 68 / 135 |
| Storage buckets / objects / metadata bytes | 2 / 2 / 148357 | 2 / 2 / 148357 |
| Storage tables | 10 | 10 |
| `media_assets` | 1 | 1 |
| `schema_migrations` | 53 | 53 |
| `user_access_audit_events` | 1 | 1 |
| `platform_builder_audit` | 18 | 18 |
| `payment_intents` / `payment_provider_events` / `bookings` | 0 / 0 / 0 | 0 / 0 / 0 |
| Google users missing profile | 0 | 0 |
| Any Auth user missing profile | 0 | 0 |

---

## 3. Orphaned media (local restore copy only)

Test asset `1739b44f-3a47-4d0f-a1fd-0e42a2088747` (`parent_id=bos-media-test-20261105`, module `services`) is ready/public and is **not** referenced by an active listing.

`20261105160000_media_published_listing_visibility.sql` was applied **only** on the disposable restore database. Mumbai still has the pre-160000 policy.

| Check after local 160000 | Result |
|---|---|
| `media_assets` row still present | true |
| Storage object rows | 2 (unchanged) |
| Storage metadata bytes | 148357 (unchanged) |
| Row still `privacy=public` / `processing_status=ready` | true |
| Published-listing predicate | false |
| `media_asset_publications` row | false |
| Policy `Published public media is readable` | present |
| Policy `Ready public media is readable` | dropped |

Public **discovery** via `media_assets` therefore hides the orphan. Bytes and object rows are not deleted.

Nuance: the replacement `storage.objects` SELECT still matches ready/public `media_assets` by path. A client that already knows the object path may still GET Storage until a later policy tightens that. Hide is on listing/discovery, not a Storage byte delete.

---

## 4. Profile backfill audit

`supabase/backfill_existing_google_profiles.sql` inserts missing Google Auth profiles as `customer` and **`on conflict (id) do nothing`**. It cannot overwrite Super Admin or any existing role.

Hosted and restored both show **0** missing profiles. **Do not run backfill.** For a later `--apply`, set `BOS_MUMBAI_SKIP_PROFILE_BACKFILL_APPROVED=obkfgxjzlscungkhbyvq` and leave `BOS_MUMBAI_PROFILE_BACKFILL_APPROVED` unset.

---

## 5. Hashes, identity, locks, recovery

CLI link `supabase/.temp/project-ref` = `obkfgxjzlscungkhbyvq`.  
Target profile `supabase/backup/react-target.conf` matches. Rejected refs `sfoizxarbljhldmkgsma` and `ezrxykyocgbolpaebnqx` were not used.

`node supabase/tests/migration_manifest.mjs` **PASS** (baseline + 60). Cosmetic: `review.migrationCount` is still 59.

Eight pending files, hashes match file / `MIGRATION_MANIFEST.json` / `migrations.sha256`:

| Version | SHA-256 |
|---|---|
| `20261105150000` | `6b1cced1c112679f80e152630587fb54c0d5521223a0789617ad8ed03e37d49c` |
| `20261105160000` | `7642844ca107fef5463ecb3b8d705c3719db15055112d396960447a1380b3e4f` |
| `20261105163924` | `a4aa10b30eb0cdd612896ee88384cf6cc25c0419de85d05c791804f4d7d7e440` |
| `20261105170000` | `4693e0930088538aaf076d9d331d04808dcffd778772ddfa66336d8057b66d4e` |
| `20261105180000` | `9c683af7a2ac86e2bae98c7f4f611cc8dfde0a478f844157c2b8ccd3530e8659` |
| `20261105210000` | `f22c3b1700135c02eaf1ae69c2d028743558cb07b0dd7dcbd3c22ea50996922a` |
| `20261105220000` | `3d476396f23466878c7245c59d01edc9c135955160c74d7a50b1574717292889` |
| `20261106010000` | `e6b05b1a71cc1bfa279de37257bc3f9f5067882e1b4a135fd8dc08a26a0595a2` |

**Lock risk at apply time (still not executed):** stay/listing tables are empty. File 4 recreates `stay_blocks_no_overlap` (short `ACCESS EXCLUSIVE` on empty `stay_blocks`). File 7 rebuilds a CHECK only if the current constraint is incomplete. Row-level `FOR UPDATE` appears inside functions, not as apply-time table locks. No guest traffic.

**Rollback:** restore this custom dump onto a new cluster / PITR; then forward-only corrective SQL. There are **no down migrations** for these eight files (`supabase/rollback/` still has only `20261104_hardening_down.sql`).

**Forward recovery:** installer `--apply` takes a **new** encrypted dump at `BOS_MUMBAI_BACKUP_PATH` (must be a fresh `*.gpg` outside the repo) **before** any write, then applies only versions missing from `schema_migrations`. Do **not** set `BOS_MUMBAI_SKIP_BACKUP_APPROVED`.

Installer backup also calls `bos_crypto_verify` and `bos_crypto_roundtrip`. Those fail in this non-interactive session. `--apply` will fail the backup gate until you unlock the owner key in a real terminal (pinentry).

---

## 6. GPG decrypt FAIL (why APPLY is NO-GO)

- Encrypt to the owner public key **PASS**.
- Secret key is present in the owner keyring and is passphrase-protected.
- `gpg --pinentry-mode loopback --passphrase ''` → `No passphrase given` (rc 2).
- `bos_crypto_verify` reports “not a parseable OpenPGP message” because `gpg --list-packets` against the owner keyring tries to decrypt the session key and exits non-zero. The archive verifier confirms the `0x85` public-key packet without the keyring.
- Official `run_dev_backup.sh` would delete plaintext if encrypt-verify fails; this preflight kept a `700` plaintext hold **because decrypt was not proven**.

Owner action before `--apply`: on an interactive terminal, decrypt `backup.dump.gpg` with the owner passphrase and confirm the plaintext SHA-256 above. Then installer backup can pass without skip.

---

## 7. What this does **not** approve

- `bash supabase/install_mumbai_migrations.sh --apply`
- Hosted writes, Auth, payments, push, merge, deploy
- Deleting the media test asset or Storage objects
- Running profile backfill
- Skipping backup

Required later (after you approve apply **and** complete interactive GPG decrypt):

1. `BOS_MUMBAI_APPLY_APPROVED=obkfgxjzlscungkhbyvq`
2. `BOS_MUMBAI_CONFIRM_REF=obkfgxjzlscungkhbyvq`
3. `BOS_MUMBAI_SKIP_PROFILE_BACKFILL_APPROVED=obkfgxjzlscungkhbyvq`
4. `BOS_MUMBAI_BACKUP_PATH` = new `*.gpg` outside both repos (installer refuses overwrite)
5. Interactive pinentry so installer encrypt-verify-roundtrip succeeds
6. Leave `BOS_MUMBAI_SKIP_BACKUP_APPROVED` unset

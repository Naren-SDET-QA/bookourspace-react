# Backup target hardening — BookOurSpace React

Approved project: **`obkfgxjzlscungkhbyvq`** (ap-south-1, PostgreSQL 17.11).
Scope of this change: backup, migration-history and restore-verification tooling,
plus the active React environment files. Nothing was run against a hosted
database, nothing was pushed, merged or deployed.

## Verdict

| Requirement | State |
|---|---|
| Dedicated React backup configuration (not a blind ref replacement) | Done — `supabase/backup/react-target.conf` |
| Scripts accept only the approved ref | Done — all four scripts source one guard |
| Stale refs / wrong pooler user / mismatched host / missing approval rejected | Done — 24/24 dry-run cases |
| Duplicate password assignments removed without printing values | Done — `.env`, `.env.local` |
| No PostgreSQL URI in a password variable | Done — value moved to `BOS_DATABASE_URL` |
| Keychain or interactive-prompt credential loading | Done — Keychain item `bos-production-backup` |
| Owner-key backup encryption, key stored separately | Done — `supabase/tests/lib/bos_backup_crypto.sh` |
| Hash / identity / Auth / restore verification | Done — `verify_backup_archive.sh`, restore evidence |
| Existing backups, legacy projects and env snapshots preserved | Done — nothing deleted |
| Local tests and dry-run guards only | Done — see evidence |

## New files

- `supabase/backup/react-target.conf` — the single approved target profile
  (ref, region, direct + pooler host, pooler tenant username, port 5432, db
  `postgres`, sslmode `require`, rejected refs, keyring default). Tracked, and
  credential-free by construction. Parsed as `KEY=value`, never sourced.
- `supabase/tests/lib/bos_target_guard.sh` — shared guard:
  `bos_load_target_config`, `bos_require_approval`,
  `bos_require_ref_confirmation`, `bos_assert_password_is_bare`,
  `bos_parse_url`, `bos_assert_connection`, `bos_assert_keyring_separate`.
  Violations exit 3, matching the scripts' existing convention.
- `supabase/tests/lib/bos_backup_crypto.sh` — owner-key encryption:
  `bos_crypto_assert_separation`, `bos_crypto_fingerprint`,
  `bos_crypto_encrypt`, `bos_crypto_verify`, `bos_crypto_roundtrip`. Refuses a
  keyring inside the archive tree, inside the backup destination or inside the
  repository; refuses to encrypt without an owner recipient.
- `supabase/tests/prepare_react_env.sh` — structural env repair (dry-run by
  default, `--apply`): collapses duplicate password assignments (keeps the
  last), renames a URI-shaped password value to `BOS_DATABASE_URL`, backs the
  original up outside the repo, writes atomically, and proves the retained
  value byte-identical via SHA-256 before and after. It never prints a value.
- `supabase/tests/run_target_guard_dryrun.sh` — the 24-case accept/reject
  matrix.

## Changed files

- `supabase/tests/run_dev_backup.sh` — target comes from the profile; approval,
  exact-ref confirmation and connection shape enforced by the guard (the
  hand-rolled `sed` ref check is gone); `PGSSLMODE` forced to `require`;
  encryption goes through the crypto library and records
  `encryption.txt` (recipient fingerprint + plaintext SHA-256) with keyring
  separation asserted; restore evidence now records
  `restored_auth_users`, `restored_auth_identities`, `restored_public_profiles`
  and fails when the dump carried `auth` tables but the restored copy has none.
- `supabase/tests/backup_production_readonly.sh` — same guard; `PROD_REF` from
  the profile; confirmation variable named correctly in the refusal message.
- `supabase/tests/compare_migration_history.sh` — same guard; ref check now
  structural (host/port/db/tenant), not a substring match.
- `supabase/tests/verify_backup_archive.sh` — expected ref defaults to the
  approved target and any other ref is refused with exit 3, so stale/legacy
  archives cannot be presented as React recovery evidence.
- `scripts/mumbai_temp_credential_preflight.mjs` — fails closed if the old
  `MUMBAI_DB_PASSWORD` key is gone (superseded by the Keychain flow) and refuses
  a URI supplied as a "password", so the defect cannot be reintroduced.

## Rules the guard enforces

1. Only `obkfgxjzlscungkhbyvq`; every 20-character ref token in host and user
   must be exactly that ref.
2. `sfoizxarbljhldmkgsma` (stale Mumbai) and `ezrxykyocgbolpaebnqx` (legacy
   Stockholm, preserved but not a target) are refused **by name**.
3. Pooler host must be `aws-0-ap-south-1.pooler.supabase.com` with username
   exactly `postgres.obkfgxjzlscungkhbyvq`; direct host must be
   `db.obkfgxjzlscungkhbyvq.supabase.co` with username exactly `postgres`.
4. Port 5432 only (session mode — transaction mode 6543 cannot run `pg_dump`),
   database `postgres`, sslmode `require`/`verify-*`.
5. `BOS_BACKUP_AUTHORIZED=backup-only` plus an exact ref confirmation.
6. A URI in a password variable is refused; a keyring inside the archive,
   backup root or repository is refused.

## Local evidence (no connection attempted)

| Check | Command | Result |
|---|---|---|
| Guard matrix | `bash supabase/tests/run_target_guard_dryrun.sh` | 24 passed / 0 failed, exit 0 |
| Backup pipeline selftest | `BOS_BACKUP_SELFTEST=1 bash supabase/tests/run_dev_backup.sh` | PASS (dump → SHA-256 → isolated restore) |
| Same, with owner-key encryption | `... BOS_BACKUP_GPG_RECIPIENT=<throwaway> BOS_BACKUP_GNUPGHOME=<tmp>` | PASS, encrypt + verify + decrypt round-trip reproduced the plaintext SHA-256 |
| Migration history selftest | `BOS_HISTORY_SELFTEST=1 bash supabase/tests/compare_migration_history.sh` | PASS (MATCH and DRIFT both detected) |
| Archive verifier, complete archive | `verify_backup_archive.sh <fixture>` | exit 0, 6 warnings |
| Archive verifier, legacy ref requested | `verify_backup_archive.sh <fixture> ezrxykyocgbolpaebnqx` | exit 3 (refused) |
| Archive verifier, archive recording stale ref | `verify_backup_archive.sh <fixture>` | exit 1 (identity mismatch) |
| Backup guard-only, approved target | `BOS_BACKUP_GUARD_ONLY=1 ...` | exit 0 "GUARDS PASS" |
| Backup, legacy / stale / no approval / wrong confirmation | same script | exit 3 each |
| Production script, approved target | `backup_production_readonly.sh` (no output path) | guards passed, then usage exit 2 — no connection |
| Production script, legacy cfg / stale host | same script | exit 3 each |
| History script, legacy ref / no URL | `compare_migration_history.sh` | exit 3 / exit 2 |
| Crypto refusals | wrong checksum, keyring in archive, keyring in repo, no recipient | exit 5 each |
| Syntax | `bash -n` all changed scripts, `node --check` preflight | clean |

## Environment files

Structural edits only, values never printed, copied or flagged:

- `.env` and `.env.local`: two `MUMBAI_DB_PASSWORD` assignments collapsed to one
  (last retained), then renamed to `BOS_DATABASE_URL` because the value was a
  PostgreSQL URI. The retained value was verified byte-identical by SHA-256.
  Both files are now mode `0600` (`.env` was `0644`).
- Two shadowed assignments that still named the stale Mumbai project
  (`sfoizxarbljhldmkgsma`) were removed; the effective endpoint values are now
  the approved ones (`db.obkfgxjzlscungkhbyvq.supabase.co`,
  `aws-0-ap-south-1.pooler.supabase.com`, `5432`, `postgres`,
  `postgres.obkfgxjzlscungkhbyvq`).
- Pre-edit copies are outside the repository in `~/BookOurSpace_Backups/env`,
  mode 600.
- Note: a second edit of these two files landed at 01:40 UTC, after this
  tooling wrote them; it added the corrected endpoint block. Only the two
  shadowed stale lines from it were removed. `MUMBAI_DB_HOST`,
  `MUMBAI_DB_NAME` and `MUMBAI_DB_PORT` appear twice with **identical** values —
  cosmetic only, left untouched.
- The URI itself is still on disk in `.env`/`.env.local`. Owner action 3 moves
  it to Keychain and removes it.

## Preserved, untouched

`~/BookOurSpace_Backups/react/20261104T080110Z-local-27-migrations`,
`.env.save`, `.env.local.stockholm`, `.env.local.mumbai`,
`.env.local.mumbai.pre-mumbai-key-20261104T174243`,
`.env.local.pre-mumbai-key-20261104T174243`, `.env.example`. No Flutter or
mobile directories exist in this repository, so there was no Flutter
configuration to preserve.

## Manual owner actions

**1. Rotate the database password.** It lived in a world-readable `.env` and in
several copies. Dashboard → Project Settings → Database → Reset database
password. Not done automatically.

**2. Store the connection URL in Keychain** (prompts silently; nothing enters
shell history):

```bash
security add-generic-password -U -a "$USER" -s bos-production-backup -w
# paste the full session-pooler URL at the prompt
security find-generic-password -s bos-production-backup >/dev/null && echo present
```

**3. Remove the plaintext URI from the env files** once step 2 is verified:

```bash
python3 - <<'PY'
import re
for f in (".env", ".env.local"):
    s = open(f, encoding="utf-8").read()
    open(f, "w", encoding="utf-8").write(re.sub(r'^BOS_DATABASE_URL=.*\n?', '', s, flags=re.M))
PY
```

Then delete the pre-edit copies in `~/BookOurSpace_Backups/env` once you are
satisfied (`ls -l ~/BookOurSpace_Backups/env` — they still contain the old
value).

**4. Create the owner encryption key** in a keyring outside the repo and the
backup tree:

```bash
mkdir -p ~/.config/bookourspace/backup-gnupg && chmod 700 ~/.config/bookourspace/backup-gnupg
GNUPGHOME=~/.config/bookourspace/backup-gnupg gpg --quick-gen-key "BookOurSpace Backups <you@example.com>" default default never
GNUPGHOME=~/.config/bookourspace/backup-gnupg gpg --with-colons --list-keys | awk -F: '/^fpr/{print $10; exit}'
```

Keep the passphrase in Keychain (`security add-generic-password -U -a "$USER" -s bos-backup-gpg-passphrase -w`)
and keep an offline export of the secret key on removable media — never in the
repository, never in `~/BookOurSpace_Backups`:

```bash
GNUPGHOME=~/.config/bookourspace/backup-gnupg gpg --export-secret-keys --armor <FPR> > /Volumes/OFFLINE/bos-backup-secret.asc
```

**5. Guard-only check** (validates everything, connects to nothing):

```bash
BOS_BACKUP_AUTHORIZED=backup-only BOS_DEV_CONFIRM=obkfgxjzlscungkhbyvq BOS_BACKUP_GUARD_ONLY=1 \
BOS_BACKUP_DATABASE_URL="$(security find-generic-password -s bos-production-backup -w)" \
  bash supabase/tests/run_dev_backup.sh
```

**6. First encrypted hosted backup:**

```bash
BOS_BACKUP_AUTHORIZED=backup-only BOS_DEV_CONFIRM=obkfgxjzlscungkhbyvq \
BOS_BACKUP_GPG_RECIPIENT=<FPR> \
BOS_BACKUP_DATABASE_URL="$(security find-generic-password -s bos-production-backup -w)" \
  bash supabase/tests/run_dev_backup.sh
```

**7. Verify the resulting archive offline:**

```bash
bash supabase/tests/verify_backup_archive.sh \
  ~/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-<STAMP> --max-age-hours 26
```

**8. Compare migration history:**

```bash
BOS_DEV_CONFIRM=obkfgxjzlscungkhbyvq \
BOS_DEV_DATABASE_URL="$(security find-generic-password -s bos-production-backup -w)" \
  bash supabase/tests/compare_migration_history.sh
```

**9. Record the dashboard-side recovery settings** (backup schedule / PITR
window) from the project dashboard; they are not readable from this tooling.

## Not done, deliberately

No hosted connection, dump, restore or migration. No credential rotation. No
deletion of any historical env file or existing backup. No `git commit`, push,
merge or deploy. `age` is not installed on this machine, so GPG is the
encryption path.

## Post-audit hardening (2026-11-05)

Applied after the read-only audit. Every item below is covered by a local test.

1. **Manifest drift resolved by review, not by reflex.** The two edits to
   `supabase/migrations/20261104220000_live_edit_backend_security.sql` were
   reviewed (single `begin`/`commit` transaction, idempotent `drop … if exists`
   blocks, `private.capture_cinema_owner_audit()` with `revoke all`, an added FK
   marked `NOT VALID`, no new permissive policy). The pin was then regenerated
   and the review is recorded in `supabase/MIGRATION_MANIFEST.json` under
   `review`, so a later re-pin cannot silently discard what was reviewed.
   `node supabase/tests/migration_manifest.mjs --write` without a note now warns
   and carries the previous record forward.
2. **Production backup path hardened.** `supabase/tests/backup_production_readonly.sh`
   now requires `BOS_BACKUP_GPG_RECIPIENT` before any connection, refuses to run
   without it (exit 5), asserts that the dump carries `auth.users` and
   `auth.identities` data, compares restored Auth user/identity counts against
   the source, encrypts with the owner key, verifies the round-trip, removes the
   plaintext, and writes verifier-compatible evidence
   (`identity-preflight.txt`, `restore-verification.txt`, `encryption.txt`,
   `SHA256SUMS`). Its argument is now an archive **directory**, and it runs
   `verify_backup_archive.sh` as its final gate. `BOS_BACKUP_SELFTEST=1` proves
   the whole path on a disposable local database.
3. **Legacy script retired.** `scripts/backup_database.sh` no longer reads any
   environment variable or connects anywhere: it exits 17 and points at the two
   guarded, encrypted scripts. It previously pinned the legacy Stockholm ref.
4. **No plaintext database URI in the env files.** `BOS_DATABASE_URL` was
   removed from `.env` and `.env.local` (mode 600, backups in
   `~/BookOurSpace_Backups/env`). `run_dev_backup.sh` and
   `compare_migration_history.sh` load the credential from the Keychain service
   `bos-production-backup`; `supabase/tests/check_env_secrets.sh` fails the build
   if a URI, a password value or a URL-embedded password reappears.
5. **Concurrent writers are serialised.** `supabase/tests/lib/bos_write_lock.sh`
   provides an atomic, TTL-reclaiming lock outside the repository; the env
   normaliser (on `--apply`) and the manifest writer both take it, and the env
   normaliser additionally refuses to overwrite a file whose size/mtime changed
   while it was inspecting it.
6. **Verifier is keyring-independent.** `verify_backup_archive.sh` no longer
   requires the encrypting keyring to parse the archive: when gpg cannot read a
   message addressed to a key it does not hold, it validates the OpenPGP
   session-key packet header instead.

New tests: `supabase/tests/run_write_lock_test.sh` (7 cases) and
`supabase/tests/check_env_secrets.sh`. Existing suites: guard matrix 24/24,
dev backup selftest (plain and encrypted), production selftest (encrypted, ends
with `ARCHIVE COMPLETE`), migration-history selftest, and the local
backup/recovery drill over baseline + 37 migrations.

## Owner GPG key — exact procedure

Run these in your own interactive terminal so the passphrase is typed by you and
never appears in a file, a command line or this transcript. The keyring directory
(`~/.config/bookourspace/backup-gnupg`, mode 700) is intentionally outside both the
repository and `~/BookOurSpace_Backups`.

**1. Point the session at the dedicated keyring**

```bash
export GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg"
chmod 700 "$GNUPGHOME"
```

**2. Generate the owner key** (RSA 4096, sign+cert primary with an encryption
subkey; choose a strong passphrase when prompted, and keep it in your password
manager, not in this repository)

```bash
gpg --quick-gen-key "BookOurSpace Backups <you@example.com>" default default 2y
```

Non-interactive equivalent if you prefer the full dialog: `gpg --full-generate-key`
(RSA and RSA, 4096 bits, expiry 2y).

**3. Record the fingerprint** (public identifier only — never a secret)

```bash
gpg --with-colons --list-keys | awk -F: '/^fpr/{print $10; exit}'
```

**4. Verify permissions and custody**

```bash
stat -f '%Sp %N' "$GNUPGHOME" "$GNUPGHOME"/*
ls -ld "$GNUPGHOME/private-keys-v1.d"
bash supabase/tests/gpg_readiness.sh <FPR>
```

`gpg_readiness.sh` checks owner-only permissions, that the keyring is outside the
repository and the backup tree, that the secret key is present (presence only),
that the key can encrypt, and — when run from your terminal — that decryption
reproduces the plaintext.

**5. Encryption/decryption round-trip you can repeat manually**

```bash
TMP="$(mktemp -d)"; printf 'bookourspace-roundtrip\n' > "$TMP/plain.txt"
gpg --batch --yes --trust-model always --recipient <FPR> \
    --output "$TMP/cipher.gpg" --encrypt "$TMP/plain.txt"
gpg --yes --output "$TMP/decrypted.txt" --decrypt "$TMP/cipher.gpg"   # pinentry asks for the passphrase
cmp "$TMP/plain.txt" "$TMP/decrypted.txt" && echo "ROUND-TRIP OK"
rm -rf "$TMP"
```

**6. Recovery export** — to removable media only, never into the repository or
`~/BookOurSpace_Backups`:

```bash
gpg --export-secret-keys --armor <FPR> > /Volumes/OFFLINE/bookourspace-backup-secret-<FPR>.asc
gpg --export --armor <FPR>              > /Volumes/OFFLINE/bookourspace-backup-public-<FPR>.asc
cp "$GNUPGHOME/openpgp-revocs.d/<FPR>.rev" /Volumes/OFFLINE/
shasum -a 256 /Volumes/OFFLINE/bookourspace-backup-*.asc
```

Store the passphrase separately from the export, verify the archive restore
before deleting the offline copy, then eject the media. The revocation
certificate must be kept: without it a lost key cannot be revoked.

**7. Encrypted hosted backup** (only after separate approval; never run by an
agent without it):

```bash
BOS_BACKUP_AUTHORIZED=backup-only \
BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq \
BOS_BACKUP_GPG_RECIPIENT=<FPR> \
BOS_PRODUCTION_DATABASE_URL="$(security find-generic-password -s bos-production-backup -w)" \
  bash supabase/tests/backup_production_readonly.sh \
    "$HOME/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-$(date -u +%Y%m%dT%H%M%SZ)"
```

Then verify offline:

```bash
bash supabase/tests/verify_backup_archive.sh <archive-dir> --max-age-hours 26
```

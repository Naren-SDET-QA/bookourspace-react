# Owner GPG Key Setup and Credential Snapshot Cleanup

**Purpose:** create the owner-controlled OpenPGP key used by encrypted backups,
verify encryption/decryption, and retire legacy plaintext `.env` snapshots.
**Scope:** owner workstation only. No hosted connection is made by this procedure.

**Current status:** **PASS** — the prior owner key remains present and unchanged,
but its Keychain passphrase did not decrypt the earlier archive. A separate
recovery encryption key is now configured and verified.

Active recovery key (public fingerprint):
`E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A`

Keyring: `~/.config/bookourspace/backup-gnupg-recovery-20261106`  
Keychain service: `bos-backup-gpg-passphrase-recovery-20261106`  
Fresh verified Mumbai archive:
`~/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-20261106T133043Z-key-recovery`

The old encrypted archive, its plaintext hold, old keyring, and old Keychain
entry were left in place. The new Keychain item is device-only and the
passphrase is not recorded in this document.

---

## 1. Create a future replacement key outside the repository

This section is for a future key rotation only. The recovery key listed above
already exists; do not rerun key generation in its keyring. For a later
rotation, replace each placeholder with a new unique value before running the
commands; choose a new dated keyring path and a new Keychain service name.

The keyring must not live inside this repository or inside
`~/BookOurSpace_Backups`.

```bash
export GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg-<new-rotation-date>"
install -d -m 700 "$GNUPGHOME"

# Interactive: GPG asks for a strong passphrase. Do not put the passphrase
# on the command line, in a file, or in this repository.
gpg --quick-generate-key \
  "BookOurSpace Backup Owner <owner@example.invalid>" \
  rsa3072 encr 2y
```

Record the primary fingerprint (not secret):

```bash
gpg --list-secret-keys --with-colons
# first `fpr` line under the encryption-capable primary key is the recipient
export BOS_BACKUP_GPG_RECIPIENT='<new-public-fingerprint>'
```

Store the passphrase in macOS Keychain (owner action):

```bash
security add-generic-password -U -a "$USER" -s 'bos-backup-gpg-passphrase-<new-rotation-date>' -w
```

Export the secret key **only** to offline removable media; never to Git, the
repository, `~/BookOurSpace_Backups`, chat, or a cloud drive:

```bash
gpg --export-secret-keys --armor "$BOS_BACKUP_GPG_RECIPIENT" \
  > /Volumes/OFFLINE/bookourspace-backup-secret.asc
```

Keep at least two offline copies and record the fingerprint in the owner
runbook.

---

## 2. Test owner-key encryption/decryption

The test encrypts a non-secret sentence, decrypts it, and compares SHA-256. It
does not print key material or credentials.

```bash
export GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg-recovery-20261106"
export BOS_BACKUP_GPG_RECIPIENT='E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A'
bash supabase/tests/owner_gpg_test.sh
```

Expected:

```text
encrypted with key <FPR> (private key stays in <owner keyring>)
encrypted archive decrypts cleanly
decrypt round-trip reproduces the recorded plaintext checksum
PASS: owner key encrypted, decrypted and reproduced the test checksum.
```

If the keyring/recipient is absent, the test exits **BLOCKED (2)** and does not
attempt encryption.

---

## 3. Use the key for hosted backup

Only after separate backup approval:

```bash
BOS_BACKUP_AUTHORIZED=backup-only \
BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq \
BOS_BACKUP_GPG_RECIPIENT='<FPR>' \
BOS_PRODUCTION_DATABASE_URL='<read-only URI from Keychain>' \
  bash supabase/tests/backup_production_readonly.sh \
    "$HOME/BookOurSpace_Backups/react/<UTC-stamp>"
```

Then verify in strict mode:

```bash
bash supabase/tests/verify_backup_archive.sh \
  "$HOME/BookOurSpace_Backups/react/<UTC-stamp>" \
  obkfgxjzlscungkhbyvq --require-encryption --max-age-hours 24
```

The archive must contain only `backup.dump.gpg` (no plaintext `backup.dump`),
must preserve `auth.users` and `auth.identities`, and must pass the isolated
restore evidence check.

---

## 4. Legacy plaintext credential snapshots — owner cleanup

The retired temporary-credential helper no longer creates snapshots, but legacy
files remain. Their names/modes are inventoried by:

```bash
bash scripts/audit_plaintext_credentials.sh
```

It prints **names, modes and sizes only** — never contents. It currently exits
**BLOCKED** because these legacy snapshots remain:

- `.env.save`
- `.env.local.stockholm`
- `.env.local.mumbai`
- `.env.local.mumbai.pre-mumbai-key-<timestamp>`
- `.env.local.pre-mumbai-key-<timestamp>`
- `~/BookOurSpace_Backups/env/*.bak` (8 files)

All are mode `600`; that is access restriction, **not encryption**.

### Required owner actions (do not do this until approved)

1. **Rotate/revoke** any credential present in these snapshots. Do not assume
   the old password is still valid.
2. Decide, with the owner, whether to **encrypt then delete** or **securely
   delete** each snapshot. Encryption is preferred while credentials are still
   being preserved temporarily.
3. Encrypt with the owner key; for example:

```bash
# External snapshots
tar -C "$HOME/BookOurSpace_Backups" -czf - env \
  | gpg --encrypt --recipient "$BOS_BACKUP_GPG_RECIPIENT" \
      --output "$HOME/BookOurSpace_Backups/env-snapshots.tar.gz.gpg"

# Workspace legacy snapshots (names from the audit script)
cd /Users/aa/Downloads/bookourspace-react
tar -czf - .env.save .env.local.stockholm .env.local.mumbai \
  .env.local.mumbai.pre-mumbai-key-* .env.local.pre-mumbai-key-* \
  | gpg --encrypt --recipient "$BOS_BACKUP_GPG_RECIPIENT" \
      --output "$HOME/BookOurSpace_Backups/workspace-env-snapshots.tar.gz.gpg"
```

If a glob does not match, remove that name from the command; do not archive the
active `.env`/`.env.local` unless the owner explicitly includes them.

4. Verify decryption of the encrypted archive, then remove the plaintext
   snapshots through the owner-approved secure-delete procedure.
5. Re-run `bash scripts/audit_plaintext_credentials.sh`; it must exit 0 with
   `PASS: no legacy plaintext credential snapshots found`.
6. Never commit `.env*`; keep active `.env`/`.env.local` mode `600` and ignored.

**No snapshot was deleted or encrypted during this readiness pass** because no
owner key exists and no destructive credential action was approved.

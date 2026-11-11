# Backup & Connection Audit — BookOurSpace React

Date: 2026-11-04
Target: `obkfgxjzlscungkhbyvq` (ap-south-1 / Mumbai, PostgreSQL 17.11)
Role: Supabase Backup and Connection Engineer.

No hosted backup, migration, push or deploy was performed. No credential value
was printed, logged or written by this audit. Every drill ran against
disposable local PostgreSQL clusters.

---

## 1. Verdict

| Area | State |
| --- | --- |
| Target ref agreed by tooling | **PASS** — `supabase/.temp/project-ref` and `linked-project.json` both say `obkfgxjzlscungkhbyvq` (name "React") |
| Frontend/API config | **PASS** — `VITE_SUPABASE_*` all target `obkfgxjzlscungkhbyvq` |
| **Database connection config** | **FAIL** — `MUMBAI_DIRECT_HOST` and `MUMBAI_DB_USER` still name `sfoizxarbljhldmkgsma` |
| Backup gate targets | **FAIL** — every backup script is hard-coded to `ezrxykyocgbolpaebnqx` |
| Backup tooling correctness | **PASS** — dump → SHA-256 → isolated restore proven |
| Encrypted destination | **FAIL (blocked)** — destination exists and is mode 700, but no GPG key exists, so archives are plaintext |
| Archive completeness checks | **PARTIAL** — archive verifier added; two evidence files were outside checksum coverage |
| Isolated restore rehearsal | **PASS** — full chain restores with identical catalog and security posture |

---

## 2. Three project refs, and where each is referenced

| Ref | Role | Where it appears |
| --- | --- | --- |
| `obkfgxjzlscungkhbyvq` | **TARGET** | `.env`, `.env.local` (`VITE_SUPABASE_*`, `MUMBAI_PROJECT_REF`), `.env.example`, `supabase/.temp/*` |
| `sfoizxarbljhldmkgsma` | **STALE** — previous Mumbai project | `.env`, `.env.local` (`MUMBAI_DIRECT_HOST`, `MUMBAI_DB_USER`); `.env.save`; `.env.local.mumbai`; `.env.local.pre-mumbai-key-20261104T174243`; `.env.local.mumbai.pre-mumbai-key-20261104T174243`; `MUMBAI_AUTH_DIAGNOSTIC_20261104.md`; `GOOGLE_OAUTH_MUMBAI_REPORT.md` |
| `ezrxykyocgbolpaebnqx` | **OLD** — Stockholm project | `.env.local.stockholm`; `run_dev_backup.sh`; `backup_production_readonly.sh`; `compare_migration_history.sh`; several plan documents |

The current project name on the CLI is **React** (`linked-project.json`), which
matches the React/Vite database this backup plan covers.

---

## 3. Local connection configuration — exact findings

Values below are refs, hostnames, ports and key names only. No password, key or
credential-bearing URI appears in this report.

### `.env` and `.env.local` (identical, 15 assignments)

| Key | Value class | Ref named |
| --- | --- | --- |
| `VITE_SUPABASE_PROJECT_ID` | ref | **target** |
| `VITE_SUPABASE_DEVELOPMENT_PROJECT_ID` | ref | **target** |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | **target** |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable key | — |
| `MUMBAI_PROJECT_REF` | ref | **target** |
| `MUMBAI_DIRECT_HOST` | host | **STALE `db.sfoizxarbljhldmkgsma.supabase.co`** |
| `MUMBAI_DIRECT_PORT` | `5432` | — |
| `MUMBAI_DIRECT_USER` | `postgres` | — |
| `MUMBAI_DB_HOST` | `aws-0-ap-south-1.pooler.supabase.com` | region only (shared) |
| `MUMBAI_DB_PORT` | `5432` (session mode) | — |
| `MUMBAI_DB_NAME` | `postgres` | — |
| `MUMBAI_DB_USER` | `postgres.<ref>` | **STALE `postgres.sfoizxarbljhldmkgsma`** |
| `MUMBAI_DB_PASSWORD` | **URL-shaped, contains a ref** | **target** |
| `MUMBAI_DB_SSLMODE` | `require` | — |

Two defects here, in order of severity:

1. **Split-brain database target.** The frontend talks to `obkfgxjzlscungkhbyvq`
   while both database paths name `sfoizxarbljhldmkgsma`. Any script that loads
   this file connects to (or authenticates against) the wrong project. The
   pooler username carries the tenant, so `postgres.sfoizxarbljhldmkgsma` cannot
   authenticate against the target no matter how correct the password is —
   it produces `28P01` or reaches the stale tenant.
2. **A password key holds a URI.** `MUMBAI_DB_PASSWORD` is URL-shaped, not a
   bare password. Any consumer that treats it as a password builds a malformed
   connection, and any log or error that echoes the value leaks a complete
   credential-bearing URL. `MUMBAI_DB_PASSWORD` is also **assigned twice** in
   both files, so which credential is active depends on parse order (last wins).

### Other local files

| File | State | Action |
| --- | --- | --- |
| `.env.local.mumbai` | all keys **stale** | quarantine |
| `.env.local.pre-mumbai-key-20261104T174243` | all keys **stale**, publishable key empty | quarantine |
| `.env.local.mumbai.pre-mumbai-key-20261104T174243` | all keys **stale**, publishable key empty | quarantine |
| `.env.save` | URL **stale**, pooler user **stale**, password URL-shaped | quarantine |
| `.env.local.stockholm` | all keys **old** Stockholm ref | quarantine |
| `.env.example` | tracked, 39 keys, target ref, no secrets | keep |

`.gitignore` covers `.env*` with a single exception for `.env.example`, and
`.env` / `.env.local` / `.env.save` are untracked. No credential is in git.

---

## 4. Correct-target connection settings

Authoritative source: `supabase/.temp/pooler-url` written by the Supabase CLI
when it linked project "React". It contains the correct host, port, tenant
username and database, and **no password**.

### Session pooler (recommended — IPv4 reachable)

| Parameter | Value |
| --- | --- |
| Host | `aws-0-ap-south-1.pooler.supabase.com` |
| Port | `5432` (session mode) |
| User | `postgres.obkfgxjzlscungkhbyvq` |
| Database | `postgres` |
| SSL mode | `require` |
| Password | from the untracked env or Keychain — never a file in this repo |

### Direct connection (IPv6-only on many networks)

| Parameter | Value |
| --- | --- |
| Host | `db.obkfgxjzlscungkhbyvq.supabase.co` |
| Port | `5432` |
| User | `postgres` |
| Database | `postgres` |
| SSL mode | `require` |

`MUMBAI_AUTH_DIAGNOSTIC_20261104.md` records that the direct host resolved only
over IPv6 and TCP failed on the client network. Treat direct as a fallback and
run scripts through the session pooler.

`supabase/connection-settings.example` (tracked, credential-free) now holds this
table using the existing key names, so the fix is value-for-value.

---

## 5. Database access procedure — verified behaviour

| Gate | Implementation | Evidence |
| --- | --- | --- |
| Explicit authorisation | `BOS_BACKUP_AUTHORIZED=backup-only` required | without it → exit 3, "No connection was attempted" |
| Exact target confirmation | `BOS_DEV_CONFIRM` must equal a hard-coded ref | **correct target refused, exit 3** |
| Ref pinning in the URL | host or pooler username must name exactly one 20-char ref | non-matching ref → exit 3 |
| Read-only session | `PGOPTIONS=-c default_transaction_read_only=on` on every dump and preflight | recorded in `identity-preflight.txt` |
| No URL on the command line | connection passed via a mode-0600 option file, then deleted | `conn.conf`, `umask 077`, `rm -f` on exit |
| No credential echo | errors filtered through `sed` redaction; identity line has no secret | code review of both scripts |
| Overwrite protection | refuses an existing output path and an existing backup dir | `exit 2` |
| Encryption | optional GPG, plaintext removed only after successful encryption | code review |

Measured guard results:

```
A. correct target  obkfgxjzlscungkhbyvq → exit 3  BLOCKED (hard-coded ref mismatch)
B. old ref         ezrxykyocgbolpaebnqx → exit 0  GUARDS PASS (no connection)
C. production script without authorisation → exit 3 REFUSED
```

**Blocker:** the procedure is sound but is pinned to `ezrxykyocgbolpaebnqx`, so
it cannot back up the target. `backup_production_readonly.sh` additionally
refuses any URL containing `prod`, which will reject many production labels.

---

## 6. Encrypted backup destination

| Item | Result |
| --- | --- |
| `~/BookOurSpace_Backups` | exists, `drwx------`, owner-only |
| `~/BookOurSpace_Backups/react` | exists, `drwx------`, owner-only |
| Contents | one directory: `20261104T080110Z-local-27-migrations` — local evidence, **not** a hosted backup |
| Default path in script | `$BOS_BACKUP_ROOT/<ref>-<UTC>/`, `umask 077`, `chmod 700` |
| GPG binary | present (`gpg`) |
| GPG secret keys | **none** — no recipient exists |
| Keychain `bos-production-backup` | **PRESENT** (presence checked; value never read, target project unverified) |
| `age` | not installed |
| Net state | **access-restricted only, NOT encrypted** |

Until a recipient key exists, `BOS_BACKUP_GPG_RECIPIENT` cannot be set and the
"encrypted backup destination" requirement is unmet. A 700 directory protects
against other local users only; it does not protect a copied or synced archive.

---

## 7. Archive completeness

Per-archive contents produced by `run_dev_backup.sh`:

```
backup.dump              custom-format dump (--no-owner --no-acl)
schema.sql               schema-only dump
toc.txt                  pg_restore --list
SHA256SUMS               checksums
identity-preflight.txt   current_database | user | server_version, project_ref, read-only marker
restore-verification.txt source/restored table, RLS, policy counts, dump scope
dump.err                 pg_dump stderr
```

Gaps found and their status:

1. `SHA256SUMS` covered only `backup.dump`, `schema.sql`, `toc.txt` — the two
   files that prove restorability were unchecksummed and could be edited
   undetected. **Now reported as a WARN by the verifier; fix by adding them to
   `SHA256SUMS` in `run_dev_backup.sh`.**
2. No per-table row-count manifest; only an approximate `n_live_tup` sum.
3. No `pg_dump` client version recorded in the archive (server version is).
4. Storage object bytes are excluded by design — a database-only archive cannot
   restore listing images or documents. Must be paired with a Storage export.
5. `run_dev_backup.sh` dumps with `--no-acl`, so role grants/ACLs are **not** in
   the dump, while `run_backup_recovery_drill.sh` and
   `backup_production_readonly.sh` explicitly restore privileges. Pick one
   policy: security posture includes grants, so `--no-acl` is the weaker choice.
6. No retention, immutability or off-machine copy rule; destination is local.
7. `dump.err` is checksummed by neither script.

New verifier: `supabase/tests/verify_backup_archive.sh <dir> [ref] [--max-age-hours N]`.
Offline, credential-free, exit 1 on any incompleteness. Verified behaviour:

| Case | Result |
| --- | --- |
| Complete synthetic archive | exit 0, `ARCHIVE COMPLETE`, 5 warnings |
| `schema.sql` removed | exit 1, `missing or empty`, `SHA256SUMS verification failed` |
| Expected ref mismatched | exit 1, `archive identity ... != expected ...` |

---

## 8. Isolated restore rehearsal — verified

`run_backup_recovery_drill.sh` builds a disposable cluster, applies the baseline
plus all 35 migrations, dumps with `pg_dump -Fc`, restores into a second
database, and compares catalogs.

Measured result (exit 0):

```
dump        dev-pre.dump  bytes=595946  sha256=d271f98ffac3bdfb0403dfc65976f8581423bdc5126f869cd3101e798d92c4f4
source      tables 53  views 1  functions 316  policies 108  rls_enabled 53  rls_disabled 0  indexes 197
restored    tables 53  views 1  functions 316  policies 108  rls_enabled 53  rls_disabled 0  indexes 197
privacy     policy 1  can_read_private_profile 1  public_provider_profiles 1
google      auth user 1  identity 1  customer profile 1
profile_private_access assertions: 7 PASS / 0 FAIL on the restored copy
```

`run_dev_backup.sh` self-test (disposable database, no hosted access) also
passed: dump → SHA-256 verify → isolated restore reproduced the schema.

### Rehearsal plan for the real archive

1. Obtain a read-only credential for the target (Keychain
   `bos-production-backup`, or `BOS_BACKUP_DATABASE_URL` in the untracked env).
2. Identity preflight: `select current_database(), current_user` must return
   `postgres | postgres.obkfgxjzlscungkhbyvq`; dump session forced read-only.
3. Dump: `pg_dump -Fc --no-owner --no-acl` to a 700 directory outside the repo.
4. Record `SHA256SUMS`, `toc.txt`, `identity-preflight.txt`, `restore-verification.txt`.
5. Encrypt, then remove the plaintext and re-checksum the `.gpg`.
6. Run `verify_backup_archive.sh <dir> obkfgxjzlscungkhbyvq --max-age-hours 24`.
7. Restore into a disposable local cluster and compare table / RLS / policy /
   function / index counts (the drill's `measure()` query) — the hosted archive
   must reproduce the same numbers.
8. Re-run `profile_private_access_test.sql` against the restored copy.
9. Copy the encrypted archive off-machine; record the retention date.

---

## 9. Exact manual actions required

Do these in order. Do not paste any password, key or connection URL into chat.

1. **Confirm the target** is `obkfgxjzlscungkhbyvq` (project "React").
2. **Fix `.env` and `.env.local`** (both currently identical):
   - `MUMBAI_DIRECT_HOST=db.obkfgxjzlscungkhbyvq.supabase.co`
   - `MUMBAI_DB_USER=postgres.obkfgxjzlscungkhbyvq`
   - keep `MUMBAI_DB_HOST=aws-0-ap-south-1.pooler.supabase.com`,
     `MUMBAI_DB_PORT=5432`, `MUMBAI_DB_SSLMODE=require`
   - delete **one** of the two `MUMBAI_DB_PASSWORD` lines, and set the survivor
     to the **password only** — no `postgresql://`, no username, no host. Or
     delete the key entirely and store the credential in Keychain service
     `bos-production-backup`.
3. **Quarantine the stale files** (move outside the repo into a 700 directory,
   then delete once verified unnecessary):
   `.env.save`, `.env.local.mumbai`,
   `.env.local.pre-mumbai-key-20261104T174243`,
   `.env.local.mumbai.pre-mumbai-key-20261104T174243`,
   `.env.local.stockholm`.
4. **Rotate the database password** (Dashboard → Settings → Database → Reset
   database password). It has been stored as a plaintext, URL-embedded value in
   several files, including stale snapshots.

4a. **Re-point or replace the Keychain item** `bos-production-backup`. The item
    exists, but nothing proves it holds a credential for
    `obkfgxjzlscungkhbyvq` — it may still hold the Stockholm or stale Mumbai
    password. Update it to the new read-only credential, or delete it and use
    the untracked env instead.
5. **Repoint the backup gate** (needs your approval; three constants):
   - `supabase/tests/run_dev_backup.sh`: `DEV_REF=ezrxykyocgbolpaebnqx`
   - `supabase/tests/backup_production_readonly.sh`: `PROD_REF=ezrxykyocgbolpaebnqx`
   - `supabase/tests/compare_migration_history.sh`: `DEV_REF=ezrxykyocgbolpaebnqx`
   Make them read `BOS_TARGET_REF` (defaulting to `obkfgxjzlscungkhbyvq`) rather
   than a literal, so the guard stays exact without pinning the wrong project.
   Also review the `*prod*` refusal in `backup_production_readonly.sh`.
6. **Create or import a GPG key**, then set
   `BOS_BACKUP_GPG_RECIPIENT=<fingerprint>` so archives are encrypted.
7. **Add `identity-preflight.txt` and `restore-verification.txt` to
   `SHA256SUMS`** in `run_dev_backup.sh` so restore evidence is tamper-evident.
8. **Prove connectivity read-only** before any dump:
   `PGOPTIONS='-c default_transaction_read_only=on' psql "$BOS_BACKUP_DATABASE_URL" -tAc "select current_user"`
   → expect `postgres.obkfgxjzlscungkhbyvq`.
9. **Approve the hosted backup**, then run it with
   `BOS_BACKUP_AUTHORIZED=backup-only BOS_DEV_CONFIRM=obkfgxjzlscungkhbyvq`.
10. **Verify the archive** with
    `bash supabase/tests/verify_backup_archive.sh <dir> obkfgxjzlscungkhbyvq --max-age-hours 24`,
    then copy it off-machine and record retention.

---

## 10. Remaining blockers

1. **Target credential unproven.** A macOS Keychain item named
   `bos-production-backup` exists (presence checked; its value was never read),
   and the env files carry a credential. Neither is proven to belong to
   `obkfgxjzlscungkhbyvq`: the env value is URL-shaped, one key is assigned
   twice, and the stale snapshots indicate older credentials. Prove the target
   with the read-only preflight before any dump. Never paste a credential in
   chat.
2. **Backup tooling pins the wrong project.** All three scripts refuse the
   correct target (measured: exit 3). Fixing that constant is a code change that
   needs your approval because other documents depend on the Stockholm ref.
3. **No encryption key.** No GPG secret key exists, so no encrypted archive can
   be produced yet. The destination directory itself is correct and 700.
4. **Connectivity unproven for the target.** Direct host is IPv6-only on this
   network; the pooler path previously returned `28P01` for the stale tenant.
   Re-test after step 2 and step 4.
5. **Hosted recovery metadata unread.** Backup schedule, PITR window and latest
   recovery point require dashboard access and were not read. A logical dump is
   not a substitute for PITR.
6. **Storage objects are outside the database archive.** A complete restore also
   needs a Storage export; none exists here.
7. **Stale credential-bearing files remain on disk** until actions 3 and 4.

---

## 11. Files added

```
supabase/connection-settings.example      correct-target settings, no secrets (tracked)
supabase/tests/verify_backup_archive.sh   offline archive completeness verifier
BACKUP_CONNECTION_AUDIT.md                this report
```

No `.env*` file, existing backup script, migration, frontend file or hosted
project was modified.

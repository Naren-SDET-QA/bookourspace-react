# Gate L2 — Owner Security Closure & Recovery Authorization Readiness

**Date:** 2026-11-24
**Mode:** PREPARATION AND EVIDENCE VERIFICATION ONLY. No dump, backup, encryption, decryption,
migration, restore, extension install, project, deployment or Git mutation.
**Verdict: NO-GO.** Credential incident **OPEN** (rotation deferred by owner) · **D6 PENDING**.

Read for this gate: `SUPABASE_RECOVERY_GATE_L_SCHEMA_CAPTURE_PREFLIGHT.md`,
`SUPABASE_RECOVERY_GATE_L1_CREDENTIAL_CONTAINMENT.md`.

---

## 1. Owner confirmation status — incident **OPEN**

Owner answer, recorded verbatim in substance: *"I have not reset the development database password yet.
I intend to rotate it later during the security cleanup."*

| Item | Status |
| --- | --- |
| Dashboard reset (Project Settings → Database → Reset database password) | **NOT DONE** |
| Owner intent | deferred to a later security cleanup |
| Incident state | **OPEN** — not resolved, not contained |
| Gate L2 classification | **OPEN**, as required when confirmation is absent |

The exposed credential is the CLI-minted pooler login `cli_login_postgres.obkfgxjzlscungkhbyvq`. It
grants `postgres`-level access to the dev database and remains valid until the password is rotated. This
report does not describe the incident as resolved anywhere, and no rotation action was taken.

**Accepted risk, for the record:** the owner is knowingly deferring rotation while continuing read-only
work. That is a legitimate owner decision, but it means *the clock on the exposure keeps running* — the
longer it stands, the longer a leaked `postgres`-equivalent credential to a database holding real
provider/client data is live.

---

## 2. Owner temporary authorization — recorded, with its boundaries

The owner issued a **temporary existing-credential authorization for read-only investigation**, so this
gate does not block purely on pending rotation. Recorded as given:

| # | Owner instruction | Gate L2 compliance |
| --- | --- | --- |
| 1 | Do not block read-only investigation solely because rotation is pending | honoured — Phase 3/4 completed |
| 2 | Use only credentials already in the local environment or approved Keychain entry | honoured — the CLI's own linked session was used; no new credential supplied |
| 3 | Never print/expose/copy/request passwords, tokens, connection strings, service-role keys | honoured — all output masked; only counts and paths reported |
| 4 | Do not reuse or retrieve the previously exposed `cli_login_postgres` credential | honoured — never retrieved, never tested, never replayed |
| 5 | Do not run `supabase db dump --dry-run` | honoured — not executed in L1 or L2 |
| 6 | Do not modify `.env` files or replace credentials | honoured — 0 file writes outside this report |
| 7 | Restrict all database access to `obkfgxjzlscungkhbyvq` | honoured — `--workdir .local/pre-fix-backup` links only that ref |
| 8 | All SQL strictly read-only, `BEGIN READ ONLY` … `ROLLBACK` | honoured — every statement wrapped, no DDL/DML |
| 9 | Keep production inaccessible and untouched | honoured — production ref never configured, never contacted |

**Explicitly NOT approved by that authorization** (owner's own list, unchanged): A1 schema dump · A1b
storage bucket capture · A3 migrations · A5 PostGIS · database restore or clone · production
provisioning or deployment · D6 decryption until genuine owner evidence. None were performed.

---

## 3. GPG round-trip evidence — **D6 PENDING**

### 3.1 Evidence state

| Check required by Phase 2 | Result |
| --- | --- |
| Correct canonical keyring used | **keyring present**: `~/.config/bookourspace/backup-gnupg-recovery-20261106`, `drwx------` |
| Expected fingerprint | **match**: `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` |
| Encryption succeeded | **claimed in Gate I only** — no new run in L2 |
| Decryption succeeded | **NO EVIDENCE** |
| Round-trip plaintext matched original payload | **NO EVIDENCE** |
| Temporary plaintext/ciphertext cleaned up | no leftovers found in `/tmp` — **but see §3.2, this proves nothing** |

No result artifact, log or marker exists in the repository or the backup destination; the newest backup
entries remain `…20261110T041600Z`, `…20261110T041358Z`, `…20261108T160611Z`. The owner did not answer
the round-trip question. **D6 stays PENDING.**

### 3.2 Absence of temp files is not evidence of success

`owner_gpg_test.sh` creates `mktemp -d` and registers `trap 'rm -rf "$TMP"' EXIT`. The directory is
removed on **every** exit path — pass, fail, or blocked. So "no leftovers in `/tmp`" is equally
consistent with a successful run, a failed run, and no run at all. The **only** admissible evidence is a
transcript showing exit `0` and both PASS lines:

```
PASS: owner key encrypted, decrypted and reproduced the test checksum.
PASS: no credential, key material or private-key path was printed.
```

Anything less is inferred success, which this gate does not accept.

### 3.3 Correction: D6 is **not** an interactive pinentry test

Reading the flow for the first time exposes a misconception carried since Gate I. `owner_gpg_test.sh`
calls `bos_crypto_roundtrip` → `bos_crypto_decrypt_to`, which is:

```bash
security find-generic-password -s "$service" -w | GNUPGHOME=… gpg --batch --yes \
  --pinentry-mode loopback --passphrase-fd 0 --quiet --decrypt --output "$output" "$file"
```

`--batch` + `--pinentry-mode loopback` + `--passphrase-fd 0` means GPG **can never prompt**. The
passphrase must arrive on stdin from the macOS Keychain item `bos-backup-gpg-passphrase`
(overridable via `BOS_BACKUP_GPG_PASSPHRASE_SERVICE`). Consequences:

| Implication | Effect |
| --- | --- |
| Earlier wording "one interactive pinentry prompt" (Gates I, L, L1) | **incorrect** — corrected here |
| The Keychain item `bos-backup-gpg-passphrase` | **EXISTS** (metadata checked; value never read or printed) |
| Is D6 technically executable unattended right now? | **Yes** — the passphrase precondition is satisfied |
| Is D6 authorised? | **No** — decryption is prohibited in this gate and awaits owner evidence/approval |
| Failure mode if the Keychain item were missing or held the wrong passphrase | gpg receives an empty/wrong passphrase, decrypt fails, script returns **5** — which reads like a crypto failure, not a custody problem |

This is good news for feasibility — a working passphrase item exists, so D6 is likely a single
non-interactive run away — but it must be **run and witnessed**, not asserted.

### 3.4 How to produce genuine D6 evidence

```bash
cd /Users/aa/Downloads/bookourspace-react
BOS_BACKUP_GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
BOS_BACKUP_GPG_RECIPIENT=E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A \
bash supabase/tests/owner_gpg_test.sh; echo "exit=$?"
```

`BOS_BACKUP_GNUPGHOME` remains mandatory: `bos_crypto_keyring()` defaults to
`$HOME/.config/bookourspace/backup-gnupg`, and that legacy keyring **provably lacks the canonical key**
(re-verified this gate), so omitting the variable yields exit 2 with a misleading "owner key absent"
message. Capture the whole transcript with `exit=0`; that is what turns D6 from PENDING to VERIFIED.
No passphrase or payload is needed in the report — only the exit status and the two PASS lines.

---

## 4. Corrected migration baseline — **74 / 81 / 7 confirmed**

Re-verified read-only in this gate, independently of Gate L1:

| Metric | Measured | Source |
| --- | --- | --- |
| Hosted ledger rows | **74** | `count(*)` on `supabase_migrations.schema_migrations` |
| Distinct versions | **74** | `count(distinct version)` |
| Duplicate versions | **0** | `count(*) − count(distinct version)` |
| Local migration files | **81** | `supabase/migrations/*.sql` |
| Pending | **7** | 81 − 74 |

**Superseded figures, explicitly retired:**

| Gate | Claim | Status |
| --- | --- | --- |
| Gate L | ledger 73 rows | **superseded** — measurement error; it is 74 |
| Gates G / J / K | 8 pending migrations | **superseded** — it is **7** |

The downstream claim that those pending migrations create **17 tables** was derived from the "8" figure
and must be **re-derived from the actual 7 files** before A3. Gate L2 does not assert a replacement
number; it asserts only that 74/81/7 is the measured baseline and that the 17-table figure is unverified.

No migration was executed. This is metadata read only.

---

## 5. Preservation and disk status — **all PASS**

| Check | Observed | Result |
| --- | --- | --- |
| D7 dev refs | **3** | **PASS — unchanged** |
| D7 file diff | **0 lines** | **PASS — unweakened** |
| React branch / HEAD | `feat/universal-gps-tracking` @ `96c1297` | **PASS** |
| React tree | 1 modified · 0 staged · 10 untracked | **PASS** — deltas are this pipeline's own reports |
| Flutter branch / HEAD | `main` @ `fc35976` | **PASS** |
| Flutter tree | 0 entries | **PASS** |
| New dumps / archives / `.gpg` today | **0** | **PASS** |
| Backup destination | 17 entries, unchanged | **PASS** |
| Free disk | **9,131 MiB** ≥ 2,048 MiB | **PASS** |

Free space drift: 9,336 → 9,136 → **9,131 MiB** across Gates L, L1, L2 (−205 MiB total, none from backup
activity). The 2 GiB floor holds with ~4.4× margin, but the trajectory is downward and should be
re-checked immediately before A1.

`supabase db dump --dry-run` was **not** executed (owner instruction 5).

---

## 6. Authorization register — kept separate

| Ref | Scope | Status |
| --- | --- | --- |
| **A1** | Schema-only dump (`public` + `private`), roles, metadata, encrypt, checksum | **NOT APPROVED** |
| **A1b** | Storage bucket metadata capture (3 bucket configuration rows) | **NOT APPROVED** |
| **A3** | Seven pending migrations | **NOT APPROVED** |
| **A5** | PostGIS installation (`postgis` absent but available on the server) | **NOT APPROVED** |
| **D6** | GPG decryption verification | **PENDING** — no genuine owner evidence |
| **Production provisioning** | New project / clone / deploy | **NO-GO** |
| Password rotation | Dev `postgres` password reset | **DEFERRED BY OWNER** — incident OPEN |
| Read-only investigation | Existing dev credentials, `obkfgxjzlscungkhbyvq` only | **TEMPORARILY AUTHORIZED** (owner, this gate) |

These are deliberately not collapsed: read-only authorization does **not** imply capture authorization,
and capture authorization would not imply decryption or migration authorization.

---

## 7. GO / NO-GO verdict

### NO-GO
- **Credential incident** — OPEN. Rotation deferred by owner; the exposed `postgres`-equivalent dev
  credential remains live. Not resolved, and this report does not present it as resolved.
- **D6 decryption** — PENDING. No witnessed exit 0. The Keychain passphrase item exists, so this is one
  run away, which makes the delay a choice rather than a constraint.
- **A1 / A1b / A3 / A5** — all NOT APPROVED; none attempted.
- **Production provisioning** — NO-GO, unchanged, and now additionally gated on the retirement of the
  17-table figure.

### GO
- **Read-only investigation** — authorised by the owner for this scope, and exercised within every stated
  boundary (dev only, `BEGIN READ ONLY`/`ROLLBACK`, no dry-run, no credential reuse).
- **Target identity & preservation** — `obkfgxjzlscungkhbyvq`, D7 at 3 refs / 0 diff, both repos at their
  recorded HEADs, zero unexpected modifications.
- **Corrected baseline** — 74 distinct versions / 81 files / 7 pending, verified twice independently.
- **Key custody preconditions** — canonical keyring present and exact; legacy keyring provably lacks the
  key; Keychain passphrase item present.
- **Disk** — 9,131 MiB free, 2 GiB floor met, nothing created.

### The short version

Two prerequisites were supposed to close here. **Neither did.** The password is still the exposed one —
by explicit owner decision, which is recorded rather than argued with — so the incident is open and any
further capture work would build on an uncontained credential. And decryption is still unproven: the
script cleans up after itself on every exit path, so no filesystem observation can substitute for a
witnessed `exit=0`.

What this gate *did* add: the read-only authorization is now written down with its exact boundaries, the
migration baseline is corrected and double-verified at **74 / 81 / 7**, and the D6 procedure is corrected
from "interactive pinentry" to what it actually is — a non-interactive run fed from an existing Keychain
item, which means the only thing standing between D6 and VERIFIED is a single executed command with its
output kept.

**Incident OPEN · D6 PENDING · A1, A1b, A3, A5 NOT APPROVED · Production NO-GO.**

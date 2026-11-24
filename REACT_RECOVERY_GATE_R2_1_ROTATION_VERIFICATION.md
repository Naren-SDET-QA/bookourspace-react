# Gate R2.1 — Development Credential Rotation Verification

**Verdict: OPEN — ROTATION NOT VERIFIED. OWNER ACTION REQUIRED.**
**Three of the ten required checks fail. The pre-rotation credential still authenticates, so the rotation did not take effect.**

| | |
| --- | --- |
| Date | 2026-11-24 (verification window 18:00Z → 18:07Z) |
| Repository | `/Users/aa/Downloads/bookourspace-react` |
| Branch / HEAD | `feat/universal-gps-tracking` @ `96c1297` — unchanged |
| Project | `obkfgxjzlscungkhbyvq` (development, ap-south-1) |
| Linked workdir | `.local/pre-fix-backup` |
| Mode | **Read-only.** No rotation, no role change, no write, no `.env`/Keychain/GPG change |
| Git | 8 modified, 0 staged, 24 untracked before this report — preserved |
| Previous gate | `REACT_RECOVERY_GATE_R2_CREDENTIAL_CONTAINMENT.md` (status: OPEN — OWNER ACTION REQUIRED) |

---

## 1. Result summary

| # | Required check | Result |
| --- | --- | --- |
| 1 | Every identified development connection entry updated | **FAIL** |
| 2 | Keychain backup item updated (value not displayed) | **FAIL** |
| 3 | Stale `.local/pre-fix-backup/.env.save` credential securely addressed | **FAIL** |
| 4 | Reconnect to the exact development project using the **updated** credential | **FAIL** — no updated credential exists; the pre-rotation one still works |
| 5 | Only `BEGIN READ ONLY` / `ROLLBACK` executed | **PASS** |
| 6 | `transaction_read_only = on`, PostgreSQL version, project identity | **PASS** (identity `postgres@postgres`, PostgreSQL 17.11) |
| 7 | No production project accessed | **PASS** |
| 8 | `cli_login*` role inventory checked, no role change | **PASS** — 1 role, `cli_login_postgres`, `canlogin = true` |
| 9 | GPG fingerprint and Keychain metadata unchanged | **PASS** |
| 10 | No secrets in logs, terminal output or reports | **PASS** — no plaintext secret emitted |

**5 PASS · 4 FAIL · 1 not applicable as specified (check 4 cannot pass without checks 1–2).** The verdict is therefore **OPEN**, not VERIFIED CLOSED.

---

## 2. The decisive evidence

### 2.1 The pre-rotation credential still authenticates

A read-only session opened with the **current** `BOS_HOSTED_DATABASE_URL` at `2026-11-24T18:06:58Z`:

```
utc_now=2026-11-24T18:06:58Z
identity=postgres|postgres|17.11|read_only=on
cli_login_roles=1
cli_login_detail=cli_login_postgres:canlogin=true
psql_exit=0
```

This is the `postgres` role credential held in the local env — **not** the exposed `cli_login` credential, which was never presented. Resetting the database password in the Supabase Dashboard changes the `postgres` password; a still-working `postgres` password therefore proves the reset has **not** been performed.

### 2.2 Nothing on the owner side changed since Gate R2

| Artifact | R2 baseline (2026-11-24) | Now | Changed? |
| --- | --- | --- | --- |
| `.env.local` mtime | 2026-11-11 12:51:36 | 2026-11-11 12:51:36 | **no** |
| `.local/pre-fix-backup/.env.local` mtime | 2026-11-07 23:11:00 | 2026-11-07 23:11:00 | **no** |
| `.local/pre-fix-backup/.env.save` | present, 2026-11-04 20:25:54 | present, 2026-11-04 20:25:54 | **no** |
| Keychain `bos-production-backup` `mdat` | — | **2026-11-04T20:46:58Z** | predates rotation; untouched |
| Keychain `bookourspace-react-db` `mdat` | — | 2026-11-04T20:14:10Z | untouched |
| Keychain `bos-backup-gpg-passphrase-recovery-20261106` `cdat` | — | 2026-11-06T13:27:29Z | untouched |

An owner update would have moved at least one mtime or the Keychain modification date. None moved.

### 2.3 All four connection entries are still the same value

| File | Variable | Host / user | Password length | Digest prefix (non-reversible indicator) |
| --- | --- | --- | --- | --- |
| `.env.local` | `BOS_HOSTED_DATABASE_URL` | pooler / `postgres.obkfgxjzlscungkhbyvq` | 23 | `179ea6` |
| `.env.local` | `BOS_MUMBAI_DATABASE_URL` | pooler / same | 23 | `179ea6` |
| `.local/pre-fix-backup/.env.local` | `BOS_HOSTED_DATABASE_URL` | pooler / same | 23 | `179ea6` |
| `.local/pre-fix-backup/.env.local` | `BOS_MUMBAI_DATABASE_URL` | pooler / same | 23 | `179ea6` |

All four are byte-identical in their password component. The digest prefix is a change indicator only — it is not the password and cannot be reversed into it; no plaintext value was read out or printed.

### 2.4 The stale snapshot is still on disk

`.local/pre-fix-backup/.env.save` is present, unchanged since 2026-11-04, and still contains the standalone `MUMBAI_DB_PASSWORD` name. Its value was not read. It was not deleted, emptied or moved.

---

## 3. What did verify cleanly

| Check | Evidence |
| --- | --- |
| **Read-only discipline (5, 6)** | `PGOPTIONS='-c default_transaction_read_only=on'` on every session; `select current_setting('transaction_read_only')` returned `on`; all SQL wrapped in `begin read only; … rollback;`; `psql_exit=0`. No `INSERT`/`UPDATE`/`DELETE`/DDL was sent. |
| **Project identity (6)** | `current_database()=postgres`, `current_user=postgres`, `server_version=17.11`; connection host `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.obkfgxjzlscungkhbyvq` — both name the approved ref. |
| **No production (7)** | `BOS_PRODUCTION_SUPABASE_PROJECT_ID` count = 0; host and tenant username are the development ref; the rejected refs `sfoizxarbljhldmkgsma` and `ezrxykyocgbolpaebnqx` never appear in any connection or output. |
| **Role inventory (8)** | `cli_login_roles=1`, `cli_login_postgres:canlogin=true`. Read-only; no `ALTER ROLE`, no `DROP ROLE`, no `NOLOGIN`. |
| **GPG unchanged (9)** | Secret-key fingerprint `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A`; keyring `~/.config/bookourspace/backup-gnupg-recovery-20261106` `drwx------`; keychain item timestamps as above. |
| **No secret exposure (10)** | No password, URI-with-password, `PGPASSWORD=` assignment, token or key material appears in this report or in the session output. The psql stderr was empty; the probe masks the password before printing. |
| **Git preserved** | `feat/universal-gps-tracking` @ `96c1297`; 8 modified, 0 staged, 24 untracked pre-existing; this report is the only addition. |

---

## 4. Interpretation — why this is OPEN, not a false alarm

Two independent facts point the same way:

1. **A password change is observable from outside.** The Dashboard reset rewrites the `postgres` password. Either the local `postgres` credential stops working (`28P01`) or it does not. It still worked at 18:06:58Z.
2. **A local update leaves timestamps.** Four env URLs and one Keychain item would have to change. Their mtimes and the Keychain `mdat` are all from 2026-11-04 → 2026-11-11, i.e. before Gate R2 asked for the rotation.

The only benign alternative — the owner reset the password to a value that is byte-identical to the old 23-character one — would still have touched the Keychain `mdat` and at least one env mtime. It did not.

`cli_login_postgres` remaining with `canlogin = true` is **not** by itself proof of failure: rotation invalidates its password without disabling the login. It is recorded because check 8 requires it. Its presence becomes actionable only once the password is actually rotated — at which point role removal is a separate, explicitly approved step.

---

## 5. Exact owner actions to unblock the verdict

The full procedure is in `REACT_RECOVERY_GATE_R2_CREDENTIAL_CONTAINMENT.md` §3. The minimum sequence:

1. **Reset the password** — `https://supabase.com/dashboard/project/obkfgxjzlscungkhbyvq/settings/database` → Database password → **Reset database password**. Generate ≥32 characters; store in the password manager. Do not paste it into chat, a command line, a report or a commit.
2. **Update all four URLs in an editor** — `BOS_HOSTED_DATABASE_URL` and `BOS_MUMBAI_DATABASE_URL` in **both** `.env.local` and `.local/pre-fix-backup/.env.local`. Percent-encode `@ : / ? # [ ] %` or use a symbol-safe alphabet.
3. **Re-save the Keychain item** — `security add-generic-password -U -a "$USER" -s bos-production-backup -w` (hidden prompt, full pooler URI with `?sslmode=require`). Update or retire `bookourspace-react-db`.
4. **Retire `.local/pre-fix-backup/.env.save`** — delete it (`rm -P`) once its contents are confirmed obsolete; it holds a standalone `MUMBAI_DB_PASSWORD` from 2026-11-04.
5. **Reconnect the CLI** — `supabase link --project-ref obkfgxjzlscungkhbyvq --workdir .local/pre-fix-backup` if stale, then `supabase migration list --linked`.
6. **Verify read-only** — private `PGPASSFILE`, `PGOPTIONS='-c default_transaction_read_only=on'`, `begin read only; select current_database(), current_user, current_setting('transaction_read_only'); rollback;`, then delete the pgpass with `rm -P`.
7. **Ask for a re-run of Gate R2.1** — the verdict flips only on fresh evidence.

Role cleanup (`cli_login_postgres`) stays out of scope: it requires a separate review and explicit approval, and a blind drop during a CLI operation can break the next migration run.

---

## 6. Remaining risks while the incident stays open

| # | Risk | Severity |
| --- | --- | --- |
| R2.1-1 | Exposed `postgres`-equivalent credential remains live; no containment has occurred | **Critical** |
| R2.1-2 | `.env.save` retains a stale plaintext password on disk | Medium |
| R2.1-3 | Local tooling currently "works" with the compromised password, which can mask the exposure | Medium |
| R2.1-4 | A future partial rotation (env updated, Keychain not, or one of two env files) will produce confusing auth failures; all five entries must change together | Medium |
| R2.1-5 | CLI will mint a new `cli_login_*` role after the first privileged command; review before closing | Low |
| R2.1-6 | Backup archive decryptability and PITR remain unproven — unaffected by this gate | High (separate) |

---

## 7. What this gate did and did not do

**Did:** read the R2 report; compared every owner-side artifact against the R2 baseline (mtimes, Keychain `cdat`/`mdat`); compared the four connection entries by metadata and non-reversible digest prefix; opened one read-only session to the exact development project and executed only `begin read only; … rollback;`; recorded identity, version, `transaction_read_only`, role inventory; re-checked the GPG fingerprint and keyring permissions; recorded Git state; wrote this report.

**Did not:** perform any rotation; present, retrieve, test or reuse the exposed `cli_login` password; print any password; modify `.env`, `.env.save`, Keychain or GPG; create, alter or drop a role; write to the database; create a dump, backup, archive, encryption or restore; contact production; touch Flutter; run any Git mutation; begin Gate R3.

**Checks run:** `stat` on env files; `security find-generic-password` metadata (no `-w`/`-g`); one `psql` read-only session (exit 0); `gpg --list-secret-keys`; `git status`/`rev-parse`. No build or test suite was run — no source file changed.

---

## 8. Verdict

**OPEN — ROTATION NOT VERIFIED.**

Checks 1, 2, 3 and 4 fail. The development password has not been changed: the pre-rotation credential authenticates, every connection entry is untouched, the Keychain item still dates from 2026-11-04, and the stale `.env.save` snapshot is still present.

Checks 5–10 pass, which means the verification itself was sound and the environment is well understood — but sound verification of an unrotated credential is still an open incident. **Owner action is required before this can become VERIFIED CLOSED.**

*No rotation, write, role change, backup, restore, `.env`/Keychain/GPG modification or Git mutation was performed in producing this report.*

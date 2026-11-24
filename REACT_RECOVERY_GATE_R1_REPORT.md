# Gate R1 — React Database Recovery Readiness

**Status: RECOVERY SCOPE DEFINED · PREREQUISITES MEASURED · NOTHING CAPTURED · APPROVAL CHECKPOINT**
**Verdict: capture is READY TO EXECUTE, but NO-GO until each operation is approved separately. The credential incident remains OPEN.**

| | |
| --- | --- |
| Date | 2026-11-24 |
| Repository | `/Users/aa/Downloads/bookourspace-react` |
| Branch / HEAD | `feat/universal-gps-tracking` @ `96c1297fa7e1a5dae46872bf1f1c30b0c4788297` |
| Target project | `obkfgxjzlscungkhbyvq` — **development only** (ap-south-1). Production never contacted. |
| Linked workdir | `.local/pre-fix-backup` |
| Scope | **React only. Flutter never read, compared or touched.** |
| Dumps / archives / backups created | **0** |
| Restores / rehearsals | **0** |
| Migrations executed | **0 of 8** |
| Database writes | **0** — every hosted statement ran in `begin read only; … rollback;` |
| `supabase db dump --dry-run` | **not run** |
| Credentials retrieved, tested or printed | **0** |
| Git mutations | **0** — 8 modified, 0 staged, 22 pre-existing untracked files preserved, plus this report |

---

## 1. Phase 1 — current state reconfirmed

### 1.1 Project identity — PASS

| Check | Observed |
| --- | --- |
| `.local/pre-fix-backup/supabase/.temp/project-ref` | `obkfgxjzlscungkhbyvq` |
| Repo-root link (`supabase/.temp/project-ref`) | **absent** — the root must never be used |
| Connection used | session pooler `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.obkfgxjzlscungkhbyvq` — host and tenant username both name the approved ref |
| Server | PostgreSQL **17.11**, database `postgres`, role `postgres`, `transaction_read_only = on` |
| `BOS_PRODUCTION_SUPABASE_PROJECT_ID` in env | **0 occurrences** |
| Rejected refs | `sfoizxarbljhldmkgsma` (stale Mumbai), `ezrxykyocgbolpaebnqx` (legacy Stockholm) — neither in the connection, neither contacted |

The credential came from the **existing** git-ignored `.local/pre-fix-backup/.env.local` (`BOS_HOSTED_DATABASE_URL`). It was never printed; the probe masks any accidental echo and only emits counts.

### 1.2 Repository — PASS, working tree preserved

| Check | Observed |
| --- | --- |
| Branch / HEAD | `feat/universal-gps-tracking` @ `96c1297` |
| Modified | **8** — the 4 React UI fixes (`ProviderDashboard`, `VenueOwnerWorkspace`, `ClassBatchManager`, `ConfirmDialog`) + 4 prior integration-test fixtures |
| Staged | **0** |
| Untracked | **23** = 22 pre-existing gate reports (8 `REACT_*`, 14 `SUPABASE_*`) + this report |
| New files from this gate | **1** report + gitignored `.local/r1-census.*` |

Nothing was stashed, reset, checked out or committed. The four browser-gate UI fixes are intact.

### 1.3 Migrations and ledger — PASS

| Metric | Measured |
| --- | --- |
| Local migration files | **81** (0 duplicate versions, strictly ascending) |
| Ledger rows | **74** = 1 synthetic baseline `00000000000000` + **73** real versions |
| Duplicate ledger versions | **0** |
| Newest applied version | `20261108150000` |
| **Pending** | **8** — 81 − 73 |
| Pending tables present live | **0 of 17** (no partial application) |

The eight pending versions:

```
20261111190000_universal_delivery_tracking
20261111200000_dynamic_service_category_builder
20261111210000_service_document_storage_access
20261112010000_business_ownership_phase1
20261112020000_business_ownership_phase2_backfill
20261112030000_business_ownership_phase3_rls
20261112040000_business_ownership_phase4_rls
20261112050000_business_ownership_phase5_transfer
```

### 1.4 Hosted schema inventory — measured this session

| Object class | Live count |
| --- | --- |
| Base tables (`public`) | **74** |
| Views (`public`) | **1** — `public_provider_profiles` |
| Materialised views | 0 |
| Tables (`private`) | **1** — `api_rate_limit_windows` |
| Tables (`auth` / `storage`) | 27 / 10 |
| Functions (`public`) | **179** |
| Policies (`public` / `storage`) | **141 / 7** |
| Non-internal triggers | **53** = `public` 40 + `storage` 11 + `auth` 1 + `realtime` 1 |
| Indexes (`public`) | **292** |
| Sequences (`public`) | **9** |
| RLS enabled (`public`) | **74 / 74** |
| `FORCE RLS` | **0** |
| `SECURITY DEFINER` without pinned `search_path` | **0** |
| Extensions | **7**: `btree_gist 1.7`, `pg_stat_statements 1.11`, `pg_trgm 1.6`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1` |
| Event triggers / publications | 7 / 2 (`supabase_realtime`, `supabase_realtime_messages_publication`) |
| Schemas | `auth, extensions, graphql, graphql_public, private, public, realtime, storage, supabase_migrations, vault` |
| Non-internal cluster roles | 15 |
| Table / routine grants | 1,080 / 412 |
| Auth users / identities | **8 / 8** |
| Database size | **19.7 MB** |

**Trigger-count reconciliation (previous reports said 40).** 40 was the `public`-schema count. The true non-internal total is **53**; the extra 13 live in `storage` (11), `auth` (1) and `realtime` (1), which the earlier query excluded. Both numbers are correct for their scope; this report uses 53 for "all" and 40 for `public`.

### 1.5 The 14 legacy tables — PASS, exact set confirmed

Derived by diffing the 74 live `public` tables against every `CREATE TABLE` in all 81 migration files: **60 tables are created by migrations, 14 are not.** The 14 are identical to `REACT_RECOVERY_READINESS_REPORT.md` §2 — no drift.

### 1.6 Storage — PASS

| Item | Measured |
| --- | --- |
| Buckets | **3** |
| Objects | **2**, total **148,357 bytes**, both in `bos-public-media` |
| Policies on `storage.objects` | **7** |
| `bos-private-documents` (required by pending migration 3) | **present**, private, 25 MiB limit, PDF/DOCX/XLSX/PPTX/TXT |

Bucket configuration (rows, not DDL):

| Bucket | Public | Size limit | MIME allowlist |
| --- | --- | --- | --- |
| `bos-private-documents` | false | 26,214,400 | pdf, docx, xlsx, pptx, text/plain |
| `bos-private-profile-media` | false | 10,485,760 | jpeg, png, webp, avif, heic, gif |
| `bos-public-media` | false | 104,857,600 | images (+svg), mp4/quicktime/webm, mp3/wav/aac/mp4 |

All three are `public = false`; `bos-public-media` is readable anonymously only through its policy, not through bucket visibility. That distinction matters for restore: recreating the bucket row without the policy makes every public image 403.

### 1.7 Disk and destination — PASS with a watch item

| Check | Observed | Threshold |
| --- | --- | --- |
| Free space | **8,341 MiB** (8.1 GiB) | ≥ 2,048 MiB → PASS |
| Volume | 100 % used (APFS) | cosmetic, but trending down (−800 MiB since Gate L) |
| Destination | `~/BookOurSpace_Backups/react` | `drwx------ aa:staff` |
| Writable | **YES** (`test -w`, no file created) | PASS |
| Entries | **17** (16 directories + 1 plan file) | unchanged |

### 1.8 GPG keyring — PASS (key only; archive decryptability unproven)

| Check | Observed |
| --- | --- |
| Keyring | `~/.config/bookourspace/backup-gnupg-recovery-20261106`, `drwx------ aa:staff` |
| Public key | present, `B151F3EB267A8E5A` |
| Secret key | **present**, same key id |
| Fingerprint | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` — **exact match** |
| UID | `BookOurSpace Backup Recovery 2026 <backup-key@bookourspace.invalid>` |
| Created / expires | 2026-11-06 → **2028-11-05** (valid at capture time) |
| Passphrase item | `bos-backup-gpg-passphrase-recovery-20261106` **exists** in the login Keychain (existence checked; value never read) |

No private key material and no passphrase was printed. The key was **not** exercised in this gate (that would be an encryption/decryption operation awaiting approval).

### 1.9 Existing archives — 17 entries, newest 14 days old

| Archive | Created (UTC) | Size | Dump | Verifier |
| --- | --- | --- | --- | --- |
| `20261104T080110Z-local-27-migrations` | 2026-11-04T13:31 | 904 K | schema only | not run (not project-prefixed) |
| `20261104T213546Z-first-install-prechange` | 2026-11-05T03:06 | 288 K | schema only | not run |
| `20261104T213657Z-first-install-prechange` | 2026-11-05T03:07 | 288 K | schema only | not run |
| `20261104T213743Z-first-install-prechange` | 2026-11-05T03:08 | 356 K | gpg | not run |
| `20261104T213817Z-first-install` | 2026-11-05T03:08 | 72 K | — | not run |
| `20261104T214137Z-first-install-final` | 2026-11-05T03:12 | 176 K | — | not run |
| `…20261106T105408Z-plaintext-hold` | 2026-11-06T16:24 | 1.0 M | **plaintext** | **INCOMPLETE** (14 failures — expected: it is the plaintext hold) |
| `obkfgxjzlscungkhbyvq-20261106T105408Z` | 2026-11-06T16:30 | 1.1 M | gpg | COMPLETE |
| `…20261106T133043Z-key-recovery` | 2026-11-06T19:01 | 1.1 M | gpg | COMPLETE |
| `…20261106T135330Z-installer-preflight` | 2026-11-06T19:24 | 1.1 M | gpg | COMPLETE |
| `obkfgxjzlscungkhbyvq-20261108T160611Z` | 2026-11-08T21:37 | 1.1 M | gpg | COMPLETE |
| `…20261110T041358Z` | 2026-11-10T09:44 | 1.0 M | — | **INCOMPLETE** (9 failures) |
| **`…20261110T041600Z` (newest)** | **2026-11-10T09:47** | **1.2 M** | **gpg** | **COMPLETE** |
| `…-stay2-20261106T132833Z` | 2026-11-06T18:58 | 8 K | — | **INCOMPLETE** |
| `…-stay2-ssl-20261106T132855Z` | 2026-11-06T18:59 | 1.1 M | gpg | COMPLETE |
| `storage-objects` | 2026-11-06T23:00 | 152 K | — | not run (object export) |

Newest archive measured directly (offline verifier, no decryption):

```
ARCHIVE COMPLETE — 2 warning(s)
74 public tables · 74 RLS relations · 141 policies · auth 7 users / 7 identities
Storage metadata: 10 tables, 3 buckets, 2 object rows
warning: Storage object bytes are excluded (PostgreSQL only)
```

Its `schema.sql` is **schema-only** (`COPY`/`INSERT` count = 0, `INSERT INTO storage.buckets` = 0), contains all **14 legacy tables**, and has **no** bucket rows. Inside the same directory, `schema.sql` is still **plaintext** (mode 600, directory 700) — the earlier pipeline encrypted only `backup.dump`.

**The archive is a snapshot of an older state, not of today:**

| Object | Archive (2026-11-10) | Live (2026-11-24) |
| --- | --- | --- |
| `public` functions | 148 `CREATE FUNCTION` statements | **179** |
| Auth users / identities | 7 / 7 | **8 / 8** |
| Public tables / policies | 74 / 141 | 74 / 141 |

Two caveats, stated rather than assumed away. First, statement counts are **not** catalog counts: unique/PK constraints emit no `CREATE INDEX` (104 constraint-backing indexes live), identity columns emit no `CREATE SEQUENCE` (6 identity columns, 9 owned sequences live), and `pg_dump` may group or qualify statements. So 148 vs 179 is partly method, not necessarily drift. Second, the auth user difference (7 vs 8) **is** real data drift. Either way the archive cannot be presented as a verified restore point for today's state.

### 1.10 Credential incident — **OPEN**

`cli_login*` roles present: **1**. Existence only — the role's password was not retrieved, tested, printed or reused, and no connection was made as that role. No `.env` mtime changed (`.env.local` still 2026-11-11 12:51; workdir `.env.local` still 2026-11-07 23:11).

---

## 2. Phase 2 — recovery scope and coverage matrix

### 2.1 What "recovery" has to cover

| # | Family | Live count | Schema-only dump | Separate capture needed |
| --- | --- | --- | --- | --- |
| 1 | Tables, columns, types, defaults, nullability, identity | 74 public + 1 private | **YES** | — |
| 2 | Primary keys, unique, CHECK, foreign keys | 74 PK · 25 unique · 104 constraint indexes · FK graph | **YES** | — |
| 3 | Indexes | 292 public | **YES** | — |
| 4 | Sequences and current values | 9 public | **definition only** — `setval` not emitted | **current values** (data) |
| 5 | Functions | 179 public | **YES** | — |
| 6 | Triggers | 40 public (53 all schemas) | **YES** for `public` | `auth`/`storage`/`realtime` triggers are platform-managed |
| 7 | RLS enablement, `FORCE RLS`, policies | 74/74 on, 0 force, 141 public | **YES** | — |
| 8 | Grants / default privileges | 1,080 table · 412 routine | **YES** for `public`/`private` | internal-schema ACLs suppressed by the CLI |
| 9 | Extensions + versions | 7 | **partially** — `COMMENT ON EXTENSION` commented out | record list (already have it) |
| 10 | Event triggers | 7 | **NO** — CLI comments these out | hand-authored DDL from catalog |
| 11 | Publications | 2 | **partially** — `supabase_realtime` suppressed | catalog snapshot |
| 12 | Migration ledger | 74 rows | **NO** — `supabase_migrations` excluded | read-only query snapshot |
| 13 | Storage buckets | 3 **rows** | **NO** — buckets are data | **A1b / Plan C** |
| 14 | Storage policies | 7 | **NO** — `storage` excluded | **A1b / Plan C** |
| 15 | Storage object bytes | 2 objects, 148,357 B | **NO** | **Plan D** |
| 16 | Table **data** | 13 rows in the 14 legacy tables + 0 elsewhere | **NO — guaranteed absent** | **Plan B** |
| 17 | Auth users / identities | 8 / 8 | **NO** (platform-managed) | part of Plan B if approved |
| 18 | Roles | 15 non-internal | **NO** with the schema dump (`--role-only` is separate) | optional |

### 2.2 The 14 legacy tables — exact inventory

| Table | Rows now | Cols | Indexes | Policies | RLS | Triggers | FK out / in |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `bookings` | **0** | 30 | 10 | 6 | on | 5 | 1 / 8 |
| `cinema_screens` | **5** | 28 | 5 | 3 | on | 2 | 0 / 1 |
| `enquiries` | **0** | 10 | 4 | 3 | on | 1 | 1 / 0 |
| `listings` | **0** | 16 | 6 | 5 | on | 4 | 2 / 9 |
| `movie_refunds` | **0** | 15 | 3 | 1 | on | 0 | 2 / 0 |
| `movie_support_tickets` | **0** | 12 | 2 | 3 | on | 0 | 1 / 0 |
| `notifications` | **0** | 11 | 3 | 4 | on | 0 | 2 / 0 |
| `payment_verifications` | **0** | 10 | 4 | 1 | on | 0 | 2 / 0 |
| `profiles` | **8** | 15 | 2 | 3 | on | 2 | 1 / **41** |
| `reviews` | **0** | 8 | 3 | 4 | on | 0 | 1 / 0 |
| `seat_locks` | **0** | 11 | 3 | 3 | on | 0 | 1 / 0 |
| `transactions` | **0** | 11 | 2 | 2 | on | 0 | 1 / 0 |
| `user_favorites` | **0** | 3 | 1 | 3 | on | 0 | 1 / 0 |
| `user_module_configs` | **0** | 4 | 1 | 4 | on | 0 | 1 / 0 |

Total legacy rows: **13**. `profiles` is the hub — 41 foreign keys point at it, and every pending migration's FK graph resolves through it.

**This materially changes the data-risk picture.** The plan's risk R-3 assumed 17 `UPDATE`s over populated `listings`, `bookings`, `service_bookings`, `transactions`. On today's development database those business tables are **empty**; the backfill would mutate **0 listing rows and 0 booking rows**. It would still touch `profiles`-anchored inserts and create provisional businesses. The risk is lower than stated — but not zero, and the development database is not a disposable scratch DB: it holds 8 real auth identities and the storage objects.

### 2.3 What a schema-only capture cannot preserve — stated plainly

1. **All table data.** `pg_dump --schema-only` emits no `COPY`/`INSERT`. If the capture run yields `COPY`/`INSERT` counts > 0, it is not schema-only.
2. **Sequence current values.** Definitions are captured; `setval` is not.
3. **Storage bucket rows** (name, `public`, `file_size_limit`, MIME allowlist).
4. **Storage object bytes** — 2 objects / 148,357 B live in the Storage API, not in PostgreSQL.
5. **Storage policies** — `storage` is outside the dump.
6. **Migration ledger** (74 rows), event triggers (7), publications (2), and internal-schema ACLs.
7. **Auth users and identities** (8/8) if the dump excludes `auth`.

Therefore: **a schema-only archive is a structural restore point, not a complete database backup.** It cannot be described as one anywhere in this programme.

---

## 3. Phase 3 — credential containment

### 3.1 Status: **OPEN**

| Item | State |
| --- | --- |
| Exposed secret | password of CLI-minted pooler login `cli_login_postgres.obkfgxjzlscungkhbyvq` → `postgres` on the dev database |
| Role still exists | **YES** (`cli_login%` count = 1) |
| Password retrieved / tested / printed | **NO** |
| Rotation evidenced | **NO** — owner deferred it (Gate L2/L5); no `.env` or Keychain change detected |
| Incident state | **OPEN** — must not be closed until §3.3 is evidenced |

The role's continued existence is the only fact this gate establishes. It does not prove the leaked password still works, and it must not be tested.

### 3.2 Owner instructions — reset the development database password

Do these in order, in the Supabase Dashboard. None of them is performed by this gate.

1. Open `https://supabase.com/dashboard/project/obkfgxjzlscungkhbyvq/settings/database`.
2. Choose **Reset database password** (Project Settings → Database → Database password → Reset). Generate a long random password and store it in the password manager first; the dashboard shows it once.
3. Wait for the project to report healthy (the reset briefly restarts connections). Supavisor derives pooler credentials from this password, so every derived login — including the leaked one — stops authenticating.
4. Update the **local** connection strings that address this project (`.local/pre-fix-backup/.env.local` and `.env.local`: `BOS_HOSTED_DATABASE_URL`, `BOS_MUMBAI_DATABASE_URL`, and any `BOS_LISTINGS_DATABASE_URL` that points at the hosted project). Do not paste the new password into chat, a report, a commit or a shell history line that persists.
5. In **Database → Roles**, remove `cli_login_postgres.obkfgxjzlscungkhbyvq` if it is still listed after rotation. The CLI re-mints a fresh role on its next privileged operation; the old one must not survive.
6. Purge the exposure source: any shell history/scrollback and CI log that captured the `--dry-run` output. The chat transcript is inherently sensitive — do not export it.
7. Check **Logs → Database / Auth** for connections from unexpected addresses between the exposure time and the rotation; record the result.

### 3.3 What must be revalidated before the incident can be marked CLOSED

| # | Check | Passing evidence |
| --- | --- | --- |
| 1 | New password authenticates | a read-only `select current_user` succeeds with the new URL |
| 2 | Old derived login is gone | the role is absent from `pg_roles`, **or** the owner confirms dashboard-side removal — not a login attempt with the leaked value |
| 3 | App connectivity restored | local app reaches the hosted project with the new URL (or the app is intentionally kept on the local PG) |
| 4 | CLI still works | `npx --no-install supabase migration list --linked --workdir .local/pre-fix-backup` (read-only) succeeds with a freshly minted role |
| 5 | No leaked copy on disk | secret scan still returns 0 files for `PGPASSWORD="<20+>"` and for the CLI role pattern |
| 6 | Log review | no unexpected successful connections in the exposure window, or explained |

Mark the incident **CLOSED** in the gate chain only when 1–6 are evidenced. This gate does not close it.

### 3.4 Sequencing consequence

Any capture in Phase 5 will use the same `postgres`-equivalent access path. That is acceptable for a read-only dump, but it means the incident is a **sequencing** risk: the ideal order is rotate → revalidate → capture. If the owner prefers to capture first, that is a recorded, accepted risk (R1-5), not a silent one.

---

## 4. Phase 4 — GPG and archive procedure

### 4.1 What is proven, and what is not

| Proposition | Status |
| --- | --- |
| Canonical keyring exists, owner-only permissions | **PASS** (measured) |
| Fingerprint is exactly `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` | **PASS** (public **and** secret key) |
| Key is unexpired | **PASS** (expires 2028-11-05) |
| Keychain passphrase item exists | **PASS** (existence only) |
| Key can encrypt/decrypt a **synthetic payload** | **PASS** — Gate L3 D6, 2026-11-24T11:52:53Z, exit 0, checksum reproduced |
| Any **database archive** has been decrypted | **NO — never** |
| A decrypted archive has been restored | **NO — never** |

The D6 self-test proves the key, not the archive. It was **not re-run** here, because running it is an encryption/decryption operation and no approval covers it.

### 4.2 Approved archive procedure (defined, not executed)

Working directory: `/Users/aa/Downloads/bookourspace-react`. All steps run with `umask 077`.

1. **Create the artifact directory**
   ```bash
   STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
   OUT="$HOME/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-$STAMP"
   mkdir -p "$OUT" && chmod 700 "$OUT"
   ```
2. **Place the captured artifacts** (`schema.sql`, and if separately approved `legacy-data.dump`, `storage-config.sql`, `ledger.txt`, `census.txt`) in `$OUT`.
3. **Record plaintext digests before encrypting**
   ```bash
   ( cd "$OUT" && shasum -a 256 schema.sql legacy-data.dump storage-config.sql ledger.txt census.txt \
       > PLAINTEXT.SHA256SUMS )
   ```
4. **Encrypt every artifact** (including `schema.sql` — the previous archives left it in plaintext)
   ```bash
   for f in schema.sql legacy-data.dump storage-config.sql ledger.txt census.txt; do
     gpg --homedir "$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
         --batch --yes --trust-model always \
         --recipient E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A \
         --output "$OUT/$f.gpg" --encrypt "$OUT/$f"
   done
   ```
5. **Remove plaintext, then checksum ciphertext**
   ```bash
   rm -f "$OUT"/schema.sql "$OUT"/legacy-data.dump "$OUT"/storage-config.sql "$OUT"/ledger.txt "$OUT"/census.txt
   ( cd "$OUT" && shasum -a 256 *.gpg PLAINTEXT.SHA256SUMS > SHA256SUMS )
   ```
6. **Prove decryptability without writing plaintext to disk**
   ```bash
   gpg --homedir "$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
       --batch --decrypt "$OUT/schema.sql.gpg" | shasum -a 256
   # must equal the schema.sql line in PLAINTEXT.SHA256SUMS
   ```
7. **Record evidence**
   ```bash
   { echo "created_utc=$STAMP"; echo "recipient=E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A";
     echo "plaintext_sha256=$(grep ' schema.sql$' "$OUT/PLAINTEXT.SHA256SUMS" | cut -d' ' -f1)";
     echo "ciphertext_sha256=$(shasum -a 256 "$OUT/schema.sql.gpg" | cut -d' ' -f1)";
     echo "decrypt_check=PASS"; } > "$OUT/verification.txt"
   ```
8. **Secure cleanup** — delete any temporary plaintext with `rm -P` (or overwrite then delete), verify `find "$OUT" -name '*.sql' -o -name '*.dump'` returns nothing, and never leave plaintext in `/tmp`, the repo or shell scrollback.
9. **Custody** — archive stays `drwx------`, ciphertext `-rw-------`. Off-machine transfer only under a separate approval (Phase 5 E, approval 6).

Passphrase handling: never on the command line, never in a file, never echoed. Use the Keychain-fed `--batch --pinentry-mode loopback --passphrase-fd` pattern already implemented in `supabase/tests/lib/bos_backup_crypto.sh`, or an interactive pinentry. Do not paste a passphrase into this chat.

### 4.3 Archive verification acceptance — corrected

The earlier readiness report required the decrypted schema to contain "74 `CREATE TABLE`, 179 functions, 141 policies". **That criterion is wrong** and would fail a good dump: `pg_dump` emits *statements*, and the catalog counts *objects*. The newest archive demonstrates it — 74 public tables and 141 public policies match exactly, but 148 `CREATE FUNCTION` statements against 179 catalog functions (constraint-backing indexes and identity sequences have the same effect).

Acceptance must therefore be:

| # | Criterion | Method |
| --- | --- | --- |
| 1 | Ciphertext present, `-rw-------`, directory 700 | `stat` |
| 2 | Decrypt-to-stdout reproduces the recorded plaintext SHA-256 | `gpg --decrypt \| shasum -a 256` |
| 3 | Schema contains **74** `CREATE TABLE public.` and **141** `CREATE POLICY … ON public.` | `grep -c` |
| 4 | All **14** legacy tables present by name | per-name `grep` |
| 5 | The **1** view and **9** sequence definitions present (names, not totals) | per-name `grep` |
| 6 | Schema is data-free | `grep -cE '^(COPY \|INSERT INTO )'` = **0** |
| 7 | Artifact has **no** storage bucket rows | records the A1b gap honestly |
| 8 | Object census compared **after a restore**, not by counting statements | Plan F |
| 9 | Ledger snapshot and identity preflight stored alongside | file presence |

### 4.4 Archive-level decrypt test (not performed)

Decrypting `…20261110T041600Z/backup.dump.gpg` would answer "can we open the only complete recent archive?" without restoring anything. It is a **decryption**, so it needs its own approval (decision D-A). Note that the archive also contains a plaintext `schema.sql`, so a decrypt test is about the encrypted dump specifically, not about the schema.

---

## 5. Phase 5 — capture execution plans

Common rules for A–F: working directory is the repository root; target is `obkfgxjzlscungkhbyvq` only; `umask 077`; no credential on a command line (use `PGSERVICEFILE`/`PGPASSFILE` in a `mktemp -d` directory with `chmod 700`, as `supabase/tests/mumbai_readonly_identity_preflight.sh` already does); no `--dry-run`; stop on first error; never overwrite an existing archive directory.

### Plan A — React schema-only capture

| | |
| --- | --- |
| Command | see below |
| Working directory | `/Users/aa/Downloads/bookourspace-react` |
| Target | `obkfgxjzlscungkhbyvq` via `--linked --workdir .local/pre-fix-backup` |
| Included | `public`, `private`, and whatever else the CLI does not exclude (the 2026-11-10 archive contained `auth`/`storage`/`vault` DDL as well) |
| Excluded | all table data, storage bucket rows, storage object bytes, ledger, event triggers (commented out), `supabase_realtime` publication |
| Expected output | `schema.sql`, **~0.9–1.2 MB**; 74 `CREATE TABLE public.`; 141 public policies; 1 view; 14 legacy tables; 0 `COPY`/`INSERT` |
| Disk | < 10 MB for the artifact; ≥ 2,048 MiB floor (8,341 MiB free) |
| Secret risk | medium — the CLI mints/uses a postgres-equivalent login; its output must never be run with `--dry-run`; `--file` writes plaintext that must be encrypted and removed |
| Verification | §4.3 criteria 3–7 + `shasum -a 256` + Plan F restore census |
| Failure / cleanup | leave `$OUT` in place with a `FAILED` marker; do not delete evidence; delete only a partial file with `rm -P`; retry only after the cause is understood |

```bash
cd /Users/aa/Downloads/bookourspace-react
umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$HOME/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-$STAMP"
mkdir -p "$OUT" && chmod 700 "$OUT"
npx --no-install supabase db dump \
  --linked --workdir .local/pre-fix-backup \
  --file "$OUT/schema.sql"
shasum -a 256 "$OUT/schema.sql" > "$OUT/schema.sql.sha256"
```

Notes: the CLI's `--schema-only` is implicit (only `--data-only` switches mode). `--workdir` is a supported global flag on `db dump` (verified against CLI 2.117.0). If the CLI mints a *new* `cli_login_*` role for this run, that is a fresh credential that must be removed with the incident cleanup.

### Plan B — legacy table data (requires separate approval)

| | |
| --- | --- |
| Command | `pg_dump` with 14 `--table` flags, `--data-only`, custom format, `service=…` (no DSN in argv) |
| Included | rows of the 14 legacy tables only (13 rows today) + optionally `auth.users`/`auth.identities` if the owner wants account recovery |
| Excluded | every migration-created table (all empty), storage bytes, extensions |
| Expected output | `legacy-data.dump`, **kilobytes**; `pg_restore --list` shows 14 `TABLE DATA public.*` entries (plus auth if included) |
| Disk | < 5 MB |
| Secret risk | **high** — contains PII (`profiles` holds 8 identities; auth holds emails). Encrypt immediately, never print rows, never restore into a non-isolated database |
| Verification | `pg_restore --list` entry count; restored row counts per table equal 0/5/8/… under Plan F |
| Failure / cleanup | `rm -P` any plaintext dump; keep the directory 700; a partial dump is deleted, not archived |

```bash
# connection via PGSERVICEFILE/PGPASSFILE prepared in a chmod 700 temp dir
pg_dump 'service=bos-r1-capture' --data-only --no-owner --no-privileges --format=custom \
  --table=public.profiles --table=public.listings --table=public.bookings \
  --table=public.enquiries --table=public.reviews --table=public.transactions \
  --table=public.payment_verifications --table=public.cinema_screens \
  --table=public.movie_refunds --table=public.movie_support_tickets \
  --table=public.notifications --table=public.seat_locks \
  --table=public.user_favorites --table=public.user_module_configs \
  --file "$OUT/legacy-data.dump"
```

### Plan C — Storage configuration capture (bucket rows are data)

| | |
| --- | --- |
| Command | read-only `psql` emitting `INSERT INTO storage.buckets` + `CREATE POLICY` DDL from `pg_policies` |
| Included | 3 bucket rows (id, name, public, limit, MIME list), 7 policies with `qual`/`with_check`, 2 object metadata rows |
| Excluded | object bytes; any `auth`/`service_role` secret; nothing else |
| Expected output | `storage-config.sql`, **~4–8 KB**; 3 `INSERT INTO storage.buckets`; 7 `CREATE POLICY … ON storage.objects` |
| Disk | negligible |
| Secret risk | low — configuration only, but bucket ids and policy expressions describe the security model |
| Verification | 3 buckets, all `public=false`, `bos-private-documents` present; 7 policy names match §1.6 |
| Failure / cleanup | query is read-only; delete a partial file with `rm -P` |

```bash
psql 'service=bos-r1-capture' -X -v ON_ERROR_STOP=1 -P pager=off -o "$OUT/storage-config.sql" <<'SQL'
begin read only;
select format('insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L,%L,%L,%L,%L) on conflict (id) do nothing;',
              id, name, public, file_size_limit, allowed_mime_types)
from storage.buckets order by id;
select format('create policy %I on storage.objects for %s to %s using (%s)%s;',
              policyname, cmd, array_to_string(roles, ','),
              coalesce(qual, 'true'),
              case when with_check is null then '' else ' with check (' || with_check || ')' end)
from pg_policies where schemaname = 'storage' order by policyname;
rollback;
SQL
```

### Plan D — Storage object recovery (requires separate approval)

| | |
| --- | --- |
| Command | `npx --no-install supabase storage ls …`, then `storage cp -r` per bucket |
| Included | 2 objects, 148,357 bytes, in `bos-public-media` |
| Excluded | nothing; the other two buckets are empty |
| Expected output | `storage/bos-public-media/<paths>`, 2 files, byte-for-byte identical |
| Disk | < 1 MB (leave 2 GiB headroom) |
| Secret risk | medium — the Storage API path uses the linked project's keys; downloaded objects may be customer images. Never commit them; directory 700 |
| Verification | per-file `shasum -a 256` recorded in `storage-objects.SHA256SUMS`; count 2; total bytes 148,357 |
| Failure / cleanup | partial downloads deleted; never overwrite an existing export |

```bash
npx --no-install supabase storage ls --linked --workdir .local/pre-fix-backup -r ss:///bos-public-media
mkdir -p "$OUT/storage/bos-public-media"
npx --no-install supabase storage cp --linked --workdir .local/pre-fix-backup -r \
  ss:///bos-public-media "$OUT/storage/bos-public-media"
```

### Plan E — encryption, integrity and custody

Covered by §4.2. Additional requirements:

* `schema.sql` **is** encrypted in this gate's procedure (the old archives left it plaintext; that is a finding, not a pattern to copy).
* A single `SHA256SUMS` covers every stored file, and the plaintext digests live in `PLAINTEXT.SHA256SUMS` so the decrypt check is meaningful.
* The archive is **not** a backup until §4.3 passes **and** Plan F reproduces the census.
* Off-machine transfer is a separate approval; if granted, verify the copy's ciphertext digest at the destination and record the transfer time. Never copy the keyring with the archive.

### Plan F — restore rehearsal in an isolated environment

| | |
| --- | --- |
| Environment | throwaway local PostgreSQL 17 cluster created by `initdb` in `mktemp -d`; **never** the hosted project, never `.local/stays-db` |
| Included | decrypted `schema.sql`, then the approved data artifact |
| Expected output | restored DB with 74 `public` tables, 1 view, 74/74 RLS, 141 policies, 40 public triggers, 1,080 table grants; 14 legacy tables with rows 0/5/0/0/…/8/… |
| Disk | ~200–500 MB for a scratch cluster; delete after |
| Secret risk | high — decrypted data exists briefly on disk. Use a `chmod 700` temp dir, decrypt to a pipe or that dir only, delete with `rm -P`, stop and remove the cluster |
| Verification | catalog comparison table printed side by side with the live census; every difference classified as platform-managed or a finding |
| Failure / cleanup | `pg_ctl -D … -m immediate stop`; `rm -rf` the temp root; record the failure; never restore into the hosted project |

```bash
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/bos-r1-rehearsal.XXXXXX")"; chmod 700 "$ROOT"
initdb -D "$ROOT/pgdata" -U postgres --auth=trust > "$ROOT/initdb.log" 2>&1
pg_ctl -D "$ROOT/pgdata" -o "-p 55441 -k $ROOT -c listen_addresses=127.0.0.1" -l "$ROOT/pg.log" start
psql -h 127.0.0.1 -p 55441 -U postgres -c 'create database bos_r1_restore'
# roles required by policies
psql -h 127.0.0.1 -p 55441 -U postgres -d bos_r1_restore -c \
  "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"
psql -h 127.0.0.1 -p 55441 -U postgres -d bos_r1_restore -v ON_ERROR_STOP=1 -f "$ROOT/schema.sql"
pg_restore --no-owner --no-privileges -d "postgres://postgres@127.0.0.1:55441/bos_r1_restore" "$ROOT/legacy-data.dump"
# census + comparison here
pg_ctl -D "$ROOT/pgdata" -m immediate stop; rm -rf "$ROOT"
```

Expected, pre-classified differences: `supabase_vault`, `pg_stat_statements`, `pgbouncer`, `realtime`, `graphql` internals are platform-provided and will differ or be absent locally. Those are **not** failures. Missing `public` tables, policies, functions or legacy rows **are**.

---

## 6. Phase 6 — approval checkpoint

**Nothing below has been executed. No dump, archive, backup, encryption, decryption, restore or migration exists as a result of this gate.**

| # | Operation | Status | Blocking risk |
| --- | --- | --- | --- |
| 1 | **Schema-only capture** (Plan A) | **NOT APPROVED** | R1-1 (structure only) |
| 2 | **Legacy table data capture** (Plan B) | **NOT APPROVED** | R1-2 (PII) |
| 3 | **Storage configuration capture** (Plan C) | **NOT APPROVED** | R1-3 (bucket rows are data) |
| 4 | **Storage object backup** (Plan D) | **NOT APPROVED** — only 2 objects / 148 KB | R1-4 |
| 5 | **Encryption and archive creation** (Plan E) | **NOT APPROVED** | R1-5 |
| 6 | **Off-machine transfer** | **NOT APPROVED** — not requested | custody |
| 7 | **Restore rehearsal** (Plan F) | **NOT APPROVED** | R1-6 |

Additional owner decisions raised by this gate:

| Ref | Decision |
| --- | --- |
| **D-A** | Authorise a decrypt test of `…20261110T041600Z/backup.dump.gpg` (no restore) to learn whether any existing archive is openable |
| **D-B** | Rotate the dev database password / remove `cli_login*` **before** capture, or accept the incident open during capture |
| **D-C** | Confirm bucket **rows** are authorised under operation 3 — approving schema capture (1) must not be read as approving a data export |
| **D-D** | Decide whether the 13 legacy rows + 8 auth identities warrant data capture at all, given the development database can be reseeded |
| **D-E** | Decide PITR: not required to proceed, but it is the standing gap that makes any capture window unrecoverable |

---

## 7. Outstanding risks

| # | Risk | Severity | Handling |
| --- | --- | --- | --- |
| **R1-1** | A schema-only archive is **not** a complete backup — no rows, no buckets, no objects | High | Never label it complete; pair with B/C/D or record the accepted gap in writing |
| **R1-2** | Legacy data capture contains PII (8 profiles, 8 auth identities) | High | Encrypt immediately, 700 dirs, no row printing, no non-isolated restore |
| **R1-3** | Bucket configuration is **data**, not DDL | Medium | Separate approval (D-C); capture is kilobytes |
| **R1-4** | Storage objects (2 / 148 KB) are outside every PostgreSQL backup | Medium | Plan D if the owner wants them; otherwise record the gap |
| **R1-5** | Credential incident OPEN; capture uses the same postgres-equivalent path | High | Rotate first (D-B), or record the accepted sequencing |
| **R1-6** | No archive has ever been decrypted, so "recoverable" is unproven | **Critical** | §4.3 decrypt check + Plan F rehearsal |
| **R1-7** | Newest archive is 14 days old and shows a different state (7 vs 8 auth users) | High | Capture fresh; do not rely on it |
| **R1-8** | The newest archive keeps `schema.sql` in plaintext | Medium | New procedure encrypts every artifact |
| **R1-9** | 8,341 MiB free on a 100 %-full volume, drifting down ~200 MiB per gate | Medium | Re-check the 2 GiB floor immediately before capture; clean the scratch cluster |
| **R1-10** | Pending migrations 2 and 3 carry their own `COMMIT`, so a partial file can commit without a ledger row | High | Unchanged from the execution plan: stop → verify → forward-recover or restore; never `migration repair` |
| **R1-11** | `statement counts ≠ catalog counts` in any dump-based acceptance test | Medium | Use restore census (§4.3 criterion 8), not `grep` totals |
| **R1-12** | No PITR on the project | Medium | Owner decision D-E |

---

## 8. What this gate did and did not do

**Did:** read-only connection to `obkfgxjzlscungkhbyvq` in `begin read only; … rollback;`; live catalog census; ledger/pending reconciliation; legacy-table derivation and row counts; bucket/policy inventory; keyring and fingerprint verification; offline verification of every existing archive; destination/disk checks; credential-role existence check; wrote this report and a gitignored census log.

**Did not:** create any dump, archive, backup or encryption; decrypt any archive; restore or rehearse anything; execute or repair a migration; write to the database; install an extension; retrieve, test or print any credential or passphrase; run `supabase db dump --dry-run`; touch production; read or touch Flutter; stage, commit, reset or push anything.

**Checks run:** `psql` read-only census (exit 0, `transaction_read_only=on`), `supabase db dump --help` / `storage --help` capability check, `gpg --list-keys`/`--list-secret-keys` fingerprint check, `supabase/tests/verify_backup_archive.sh` on each archive, `test -w` on the destination, `git status` before and after. No build or test suite was run — no source file changed.

**Verdict: the recovery scope is now explicit and measured; the recovery capability is still unproven. Awaiting separate approval for operations 1–7, and an owner decision on rotating the development database password before capture.**

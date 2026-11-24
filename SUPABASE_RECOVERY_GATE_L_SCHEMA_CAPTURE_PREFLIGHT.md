# Gate L — Schema Baseline Capture Preflight & Owner Authorization

**Date:** 2026-11-24
**Mode:** PREPARATION ONLY. No dump created or downloaded, no encryption/decryption of any backup, no
migration, no restore, no project, no clone, no schema change, no deployment, no Git mutation.
**A1 (schema dump): PENDING · D6 (decryption): PENDING · A3 (migrations): PENDING**

Read for this gate: `SUPABASE_RECOVERY_GATE_K_CANONICAL_SCHEMA_DESIGN.md`,
`SUPABASE_CANONICAL_DATABASE_BLUEPRINT.md`, `SUPABASE_RECOVERY_GATE_I_ENCRYPTION_AND_PRODUCTION_DISCOVERY.md`.

---

## ⚠ 0. SECURITY INCIDENT — credential exposed during this preflight

**What happened.** To establish the exact `pg_dump` invocation the CLI would run, Gate L executed
`npx supabase db dump --dry-run --linked`. That command prints a generated shell script to stdout
which **includes a plaintext `export PGPASSWORD="…"`**. Output masking at the time covered
`postgres://`-style URIs but **not** the `PGPASSWORD` variable, so a live credential appeared in the
tool output.

**What was exposed.** The password of the CLI-generated Supavisor login role
`cli_login_postgres.obkfgxjzlscungkhbyvq` for the **development** project
`obkfgxjzlscungkhbyvq` — a pooler-level credential for the `postgres` database user. It is not a
service-role key, not the anon key, and not production. It has been removed from every subsequent
command; all later output in this gate was filtered with
`s#PGPASSWORD="[^"]*"#PGPASSWORD="[REDACTED]"#g` before display, and the value is not reproduced
anywhere in this report.

**Required owner action.**

1. Treat that password as compromised. Reset the dev project's database password (Supabase dashboard →
   Project Settings → Database → **Reset database password**), which invalidates Supavisor login roles
   derived from it. Nothing in the repository depends on that credential: the backup tooling reads the
   Keychain entry `bos-production-backup`, not this one.
2. Accept that **`supabase db dump --dry-run` is a credential-dumping command** and must never be run
   unmasked. Gate L records this so no later gate repeats it.
3. Rotate before the A1 capture if the owner wants the dump performed with a fresh credential.

Gate L did not verify whether the credential is still valid — testing it would have meant using it.

---

## 1. Repository and project identity verification

### 1.1 Repositories — CONFIRMED

| Check | Expected | Observed | Result |
| --- | --- | --- | --- |
| React path | `~/Downloads/bookourspace-react` | `/Users/aa/Downloads/bookourspace-react` | **PASS** |
| React branch | `feat/universal-gps-tracking` | `feat/universal-gps-tracking` | **PASS** |
| React HEAD | `96c1297` | `96c1297fa7e1a5dae46872bf1f1c30b0c4788297` | **PASS** |
| React tree | 1 pre-existing modify, 0 staged, 8 untracked reports | exactly that | **PASS** |
| Flutter path | `~/Desktop/BookMySpace` | `/Users/aa/Desktop/BookMySpace` | **PASS** |
| Flutter branch | `main` | `main` | **PASS** |
| Flutter HEAD | `fc35976` | `fc35976f7bc2895f6b8bcbcb1f82bb1ea155eb6c` | **PASS** |
| Flutter tree | clean | 0 entries | **PASS** |

### 1.2 Linked project ref — CONFIRMED, with a critical caveat

| Location | Linked ref | Note |
| --- | --- | --- |
| `supabase/.temp/project-ref` (repo root) | **absent** | `supabase/config.toml` also absent |
| `.local/pre-fix-backup/supabase/.temp/project-ref` | `obkfgxjzlscungkhbyvq` | the linked workdir |

**Caveat (blocking for a naive command):** the repository root is **not** linked. Running
`supabase db dump --linked` from `/Users/aa/Downloads/bookourspace-react` fails with
*"Cannot find project ref. Have you run supabase link?"* — this is exactly what Gate I saw from
`supabase projects list`. Any capture must either pass `--workdir .local/pre-fix-backup` or avoid
`--linked` entirely.

### 1.3 Target is development, not production — CONFIRMED on four independent grounds

| Evidence | Finding |
| --- | --- |
| D7 guard list | `obkfgxjzlscungkhbyvq` is the *first* entry of `DEVELOPMENT_SUPABASE_PROJECT_REFS` (`src/server/supabaseProductionGuard.ts`), unchanged — 0 diff, 3 refs present |
| Production variable | `BOS_PRODUCTION_SUPABASE_PROJECT_ID` is **never set** in any `.env*` file |
| Account inventory | only `obkfgxjzlscungkhbyvq` (dev) and `ezrxykyocgbolpaebnqx` (legacy dev) exist; no third project |
| Deploy templates | production ref remains `__PRODUCTION_SUPABASE_PROJECT_REF__` placeholder |

### 1.4 Canonical GPG keyring — CONFIRMED

| Property | Observed |
| --- | --- |
| Path | `~/.config/bookourspace/backup-gnupg-recovery-20261106` |
| Permissions | `drwx------` |
| Fingerprint | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` — **exact match** |
| UID | `BookOurSpace Backup Recovery 2026 <backup-key@bookourspace.invalid>` |
| Created / expires | epoch `1793971695` (2026-11-06) / `1857043695` (2028-11-05) |
| Recipient resolvable | **YES** |
| Legacy keyring | `~/.config/bookourspace/backup-gnupg` also exists and must **not** be used |

---

## 2. Exact development target confirmation

| Property | Value |
| --- | --- |
| Project ref | `obkfgxjzlscungkhbyvq` |
| Name / region | "React" · South Asia (Mumbai) |
| Host (pooler) | `aws-0-ap-south-1.pooler.supabase.com:5432` |
| Database | `postgres` |
| Server | PostgreSQL 17.11 (tools 17.11 — **matched**, no version skew for `pg_dump`) |
| Size | ≈20 MB (Gate E census) |
| Backups | 8 × PHYSICAL COMPLETED, 2026-11-17 → 2026-11-24 |
| Classification | **DEVELOPMENT** — `BOS_BACKUP_AUTHORIZED=backup-only` + `BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq` semantics apply |

---

## 3. Backup destination and disk-capacity evidence

| Check | Observed | Result |
| --- | --- | --- |
| Destination | `~/BookOurSpace_Backups/react` | exists |
| Permissions | `drwx------ aa:staff` | **owner-only** |
| Entries / size | 17 entries / 11 MiB | consistent with Gate E |
| Newest archive | `obkfgxjzlscungkhbyvq-20261110T041600Z`, 342 h old | stale (unchanged) |
| Free disk | **9,336 MiB** (99 % used) | above the ≈2.2 GiB Gate G requirement |
| Expected artifact size | schema-only dump of a 20 MB DB → **≈300–700 KB** plaintext, < 400 KB encrypted | ample headroom |

Disk is tight but sufficient. A schema-only dump is ~1/3 the size of the existing 1.2 MB archives, so
no capacity change is needed. **Still recommended before A1:** free ≥2 GiB, because the same volume is
also the restore target.

---

## 4. Proposed schema-only dump command

### 4.1 Tool capability — CONFIRMED

`supabase db dump --help` (CLI v2.117.0) exposes `--dry-run`, `--data-only`, `--role-only`,
`--keep-comments`, `--file/-f`, `--db-url`, `--linked`, `--local`, `--project-ref`, `--schema/-s`.
**There is no `--schema-only` flag because schema-only is the default** — `--data-only` is the
opt-in for data. `pg_dump` 17.11 is installed with `-s/--schema-only`, `--section`, `-n/-N`, `-T`,
`-x/--no-privileges`, `-O/--no-owner`; `pg_dumpall -r/--roles-only` exists.

### 4.2 What the CLI actually runs — CONFIRMED via `--dry-run`

```
pg_dump
  --schema-only
  --quote-all-identifier
  --role "postgres"
  --exclude-schema "information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|
                    pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|
                    graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|
                    tiger_data|timescaledb_*|_timescaledb_*|topology|vault"
| sed …   # strips \restrict, makes CREATE SCHEMA/TABLE/SEQUENCE/VIEW/FUNCTION/TRIGGER idempotent,
          # comments out event triggers, supabase_realtime publication, internal-schema ACLs,
          # COMMENTS ON EXTENSION, cron policies; deletes every line starting with "--"
```

**Two properties matter most:** `--schema-only` guarantees **zero table data**, and the exclude list
guarantees **`auth`, `storage`, `extensions`, `supabase_migrations`, `vault`, `realtime` are omitted**.

### 4.3 Recommended command — PREPARED, NOT EXECUTED

Primary artifact (public + private DDL, via the linked workdir so no credential enters argv):

```bash
cd /Users/aa/Downloads/bookourspace-react

# A1 — DO NOT RUN WITHOUT OWNER APPROVAL
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$HOME/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-schema-$STAMP"
umask 077 && mkdir -p "$OUT"

npx --no-install supabase db dump --linked \
    --workdir .local/pre-fix-backup \
    --file "$OUT/schema.sql" \
  2>&1 | sed -E 's#PGPASSWORD="[^"]*"#PGPASSWORD="[REDACTED]"#g; s#(postgres(ql)?://)[^ ]*#\1[REDACTED]#g'
```

Supplementary capture (the schemas the CLI excludes), via the already-established read-only SQL path —
**no credentials in argv, no pg_dump, no writes**:

```bash
# A1 — DO NOT RUN WITHOUT OWNER APPROVAL
npx --no-install supabase db dump --role-only --linked --workdir .local/pre-fix-backup \
  --file "$OUT/roles.sql"          # cluster roles (no passwords in schema-only role dumps)

npx --no-install supabase db query --linked --workdir .local/pre-fix-backup \
  --file /tmp/gate_l/capture_metadata.sql   # storage buckets + policies, extensions, ledger, event triggers
```

Then encrypt both once, with the canonical recipient and an explicit keyring:

```bash
# A1 — DO NOT RUN WITHOUT OWNER APPROVAL
tar -czf - -C "$(dirname "$OUT")" "$(basename "$OUT")" \
  | gpg --homedir "$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
        --batch --yes --trust-model always \
        --recipient E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A \
        --output "$OUT.tar.gz.gpg"

shasum -a 256 "$OUT.tar.gz.gpg" | tee "$OUT.tar.gz.gpg.sha256"
```

`--batch` is safe here because public-key encryption needs no passphrase (Gate I proved it produces
ciphertext). Decryption is the interactive step and is **not** part of A1.

### 4.4 Why not `pg_dump --schema-only` directly?

| Criterion | `supabase db dump --linked` (recommended) | direct `pg_dump --schema-only` |
| --- | --- | --- |
| Credential in argv / process list | **none** — CLI mints an ephemeral login role | requires the pooler URI (Keychain) exported into the environment |
| Produces idempotent DDL | **yes** — `CREATE … IF NOT EXISTS` normalisation | no — raw DDL |
| Excludes platform noise | **yes** — curated exclude list | must hand-maintain `-N` for ~20 schemas |
| Captures `storage`/`auth`/ledger | **no** | yes, but only with hand-written `-n` and extra risk |
| Reproducibility for the team | **yes** — same tool everyone already uses | no |
| Credential-exposure surface | the same `--dry-run` hazard (§0); masked when needed | a password in the environment |

**Recommendation:** CLI dump for the primary artifact + read-only metadata capture for the excluded
schemas. This keeps the database password out of every command line, which — after §0 — is the
deciding factor. Direct `pg_dump` is documented as the fallback if the CLI's normalisation proves lossy.

---

## 5. Schema / object inclusion and exclusion matrix

Live object census (read-only, this gate): 141 policies, **40** non-internal triggers on `public`,
179 functions (116 `SECURITY DEFINER`), **1,080** table ACL rows, **443** routine ACL rows,
7 extensions, 2 publications, **7 event triggers**, 3 storage buckets, schemas
`auth, extensions, graphql, graphql_public, private, public, realtime, storage, supabase_migrations, vault`.

| Object class | Schema | In `supabase db dump`? | In metadata capture? | Reproducibility impact |
| --- | --- | --- | --- | --- |
| Tables (74), incl. 14 legacy | `public` | **YES** | — | Resolves Gate K §4 |
| Columns, types, defaults, NOT NULL | `public` | **YES** | — | — |
| PK / FK / UNIQUE / CHECK constraints | `public` | **YES** (post-data section) | — | Restore ordering matters |
| Indexes (incl. partial + JSONB expression) | `public` | **YES** | — | — |
| Functions (179) + `SECURITY DEFINER` + pinned `search_path` | `public` | **YES** (`proconfig` → `SET search_path`) | — | Preserves the 116 pinned paths |
| Triggers (40) | `public` | **YES** | — | — |
| RLS enablement + policies (141) | `public` | **YES** | — | — |
| GRANT/REVOKE (1,080 + 443) | `public`, `private` | **YES** for `public`/`private` | — | Internal-schema ACLs deliberately commented out |
| Views (1: `public_provider_profiles`) | `public` | **YES** | — | — |
| `private` schema (rate-limit table + 18 fns) | `private` | **YES** (not excluded) | — | — |
| **Storage buckets (3) + storage policies (7)** | `storage` | **NO — excluded** | **YES** (required) | Gate K blocker |
| **Migration ledger (73 rows)** | `supabase_migrations` | **NO — excluded** | **YES** (required) | Needed to know 73/81 |
| **Extensions (7)**: `btree_gist, pg_stat_statements, pg_trgm, pgcrypto, plpgsql, supabase_vault, uuid-ossp` | `extensions`/`public` | **partially** — excluded schema, but `CREATE EXTENSION` for public-installed ones may appear | **YES** (required) | **`postgis` is NOT installed** — Flutter needs it |
| **Event triggers (7)** | cluster | **NO — commented out by the CLI** | **YES** (required) | — |
| Publications (2) | cluster | `supabase_realtime` commented out | **YES** (required) | — |
| Cluster roles | cluster | **NO** (needs `--role-only`) | separate artifact | — |
| `auth` schema objects | `auth` | **NO — excluded** | not captured (platform-managed) | FKs to `auth.users` still appear in `public` DDL |
| `auth.users` rows (8) | `auth` | **NO** | **NO — by design** | Data, not schema; separate decision |
| Table **data** | any | **NO — `--schema-only`** | — | Guaranteed absent |
| Application secrets / keys / `.env` values | — | **NO** | — | Guaranteed absent |

### 5.1 Does the proposed dump capture all required objects? **No — not on its own.**

The CLI dump is a complete **`public` + `private`** baseline: all 74 tables (including the 14 legacy
tables that Gate K could not reproduce), every constraint, index, function with its pinned
`search_path`, trigger, policy and grant. That solves the Gate K blocker.

It is **not** a complete database baseline, because five families are excluded by design and must be
captured separately (§4.3 second command): storage buckets + their 7 policies, the migration ledger,
extension inventory, event triggers, and publications. Without those, a fresh project would restore a
schema with no buckets, no way to know which migrations had run, and no PostGIS prerequisite check.

**Two additional defects found while building this matrix:**

1. **`postgis` is not installed** on the dev project. Flutter's `venues.geog geography(Point,4326)`
   and `nearby_venues()` require it, so Flutter's lineage **cannot run against this project as-is**.
   Gate K listed PostGIS as "implied but undeclared"; it is in fact **absent from the server too**.
2. `btree_gist` **is** installed (1.7) — Flutter's `EXCLUDE` constraint and the Blueprint's
   `core.resource_claim` both depend on it, and that prerequisite is satisfied.

---

## 6. Encryption and decryption verification procedure

### 6.1 Integrity and "no data" verification — runs immediately after A1

| Check | Command | Pass criterion |
| --- | --- | --- |
| No table data | `grep -cE '^(COPY |INSERT INTO )' schema.sql` | **0** |
| No credentials in artifact | `grep -cE 'PGPASSWORD|postgres(ql)?://|eyJ[A-Za-z0-9_-]{10,}' schema.sql` | **0** |
| Table coverage | `grep -c '^CREATE TABLE' schema.sql` | **≥ 74** (all legacy tables present) |
| Function coverage | `grep -c '^CREATE OR REPLACE FUNCTION\|^CREATE FUNCTION'` | **≥ 179** |
| Policy coverage | `grep -c '^CREATE POLICY'` | **141** |
| Trigger coverage | `grep -c '^CREATE OR REPLACE TRIGGER\|^CREATE TRIGGER'` | **40** |
| `search_path` preserved | `grep -c 'SET search_path TO'` | **116** |
| RLS enablement | `grep -c 'ENABLE ROW LEVEL SECURITY'` | **74** |
| Legacy tables specifically | grep each of the 14 names for `CREATE TABLE` | **14/14** |

Coverage is **not** assumed: the counts are compared to the live census, and a shortfall is a finding
that blocks A1 acceptance.

### 6.2 Encryption verification (non-interactive, safe)

| Check | Pass criterion |
| --- | --- |
| `gpg --list-packets archive.gpg` | shows recipient keyid `B151F3EB267A8E5A`, cipher `AES256` (or similar), no plaintext |
| File type | `file archive.gpg` → `PGP symmetric key encrypted data` / `public key encrypted` |
| Plaintext not present | `grep -c 'CREATE TABLE' archive.gpg` → 0 on the binary |
| Checksum recorded | `.sha256` written beside the archive, from the ciphertext |
| Size sanity | 100 KB – 2 MB encrypted |

### 6.3 Decryption verification — OWNER ACTION, still UNVERIFIED

Gate I established: encryption **PASS** (real 512-byte ciphertext), decryption **UNVERIFIED**
(non-interactive). Gate L did not change that, and did not decrypt anything.

Owner round-trip, in the owner's own terminal (one pinentry prompt for key `B151F3EB267A8E5A`):

```bash
cd /Users/aa/Downloads/bookourspace-react
BOS_BACKUP_GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
BOS_BACKUP_GPG_RECIPIENT=E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A \
bash supabase/tests/owner_gpg_test.sh
```

**Must not** be run without `BOS_BACKUP_GNUPGHOME`: the script sources only
`lib/bos_backup_crypto.sh` (not the guard), so it would silently fall back to the **legacy** keyring at
`~/.config/bookourspace/backup-gnupg`, where the canonical recipient is absent, and exit **2 BLOCKED**
with a false "owner key missing" message. Expected exit codes: `0` pass · `2` blocked · `5` crypto
failure.

Independently verify the *real* archive later, once A1 has produced one:

```bash
gpg --homedir "$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
    --decrypt "$OUT.tar.gz.gpg" | tar -tzf - | head   # lists without writing files
```

**Decryption is not claimed verified until that round-trip actually succeeds.**

---

## 7. Risks and unresolved prerequisites

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| L1 | **Credential exposed via `--dry-run`** (§0) | **Critical** | Rotate dev DB password before A1; never run `--dry-run` unmasked |
| L2 | Repo root unlinked → naive `--linked` fails, or a wrong `--project-ref` is used | High | Always pass `--workdir .local/pre-fix-backup` |
| L3 | Dump accepted without coverage check → silent gaps | High | §6.1 counts must match live census before acceptance |
| L4 | Excluded schemas assumed captured (storage/ledger/extensions/event triggers) | High | Supplementary capture is mandatory, not optional |
| L5 | Archive unreadable when needed | **Critical** | D6 round-trip before relying on any archive |
| L6 | `postgis` absent → Flutter lineage fails on this project | High | Add extension decision to A5/Blueprint §9.1 |
| L7 | 5 legacy tables partially described only by `schema_and_rls.sql` | Medium | The dump resolves this; do not substitute the script |
| L8 | Disk 99 % used | Medium | Free ≥2 GiB before A1 |
| L9 | Dump taken from dev, later mistaken for production baseline | Medium | Filename/ref embedded in path; §2 classification recorded |
| L10 | CLI normalisation lossy (`--quote-all-identifier`, `--role postgres`) | Low | Compare against fallback `pg_dump` if a restore diverges |

**Unresolved prerequisites:** D6 decryption; A1 approval; A3 (8 pending migrations — the dump captures
73/81 state, so pending tables will be absent by design); D1/D2 (production identity/architecture);
`postgis` decision; storage DDL authorship (Gate K P5).

---

## 8. Exact owner approvals required

| Approval | Scope | Status |
| --- | --- | --- |
| **Rotate dev DB password** | invalidate the §0 credential | **AWAITING OWNER** |
| **A1** | run §4.3 exactly as written: dump `public`+`private`, roles, metadata; encrypt to canonical recipient; record checksum. **No download, no restore, no migration.** | **NOT APPROVED** |
| **D6** | interactive GPG round-trip in owner's terminal | **AWAITING OWNER** |
| **A3** | apply the 8 pending migrations (separate gate) | **NOT APPROVED** |
| **A2** | restore rehearsal (after A1+D6) | **NOT APPROVED** |
| **D1 / D2** | production identity / Option C | **AWAITING OWNER** |
| **A5** | `postgis` + storage DDL authoring | **NOT APPROVED** |
| **A6** | any deployment | **NOT APPROVED** |

A1 authorises **capture only**. It does not authorise decryption, restore, migration, clone or deploy.

---

## 9. GO/NO-GO verdict for capture readiness

### GO
- **Target identity:** GO — `obkfgxjzlscungkhbyvq` conclusively verified as development on four
  independent grounds; D7 intact (0 diff, 3 dev refs).
- **Tooling:** GO — CLI v2.117.0 + `pg_dump` 17.11 both present, server 17.11, no version skew.
- **Encryption capability:** GO — canonical keyring present, `drwx------`, fingerprint exact,
  recipient resolves, encryption proven in Gate I.
- **Destination and disk:** GO — `drwx------`, 9,336 MiB free, artifact ≈300–700 KB.
- **Dump design:** GO — `--schema-only` guarantees no table data; the exact flag set is known from
  `--dry-run` rather than assumed.
- **Credential hygiene in the prepared commands:** GO — no password enters argv; `--workdir` replaces
  `--db-url`.

### NO-GO
- **Capture execution:** **NO-GO until A1.** Nothing was captured.
- **Completeness as designed:** **NO-GO for a CLI-only dump** — five object families are excluded and
  must come from the supplementary capture (§5.1).
- **Decryption:** **NO-GO** — still unverified; an archive that cannot be read is not a baseline.
- **Credential state:** **NO-GO** — the §0 exposure must be rotated before the capture is performed.
- **Production provisioning:** **NO-GO** — unchanged from Gates J/K, and still gated on A1 + D6 + D1.

### The short version

The capture is **ready to approve but not ready to trust**. The target is unambiguously development, the
tooling is present and matched, the encryption path is proven for writing, and the exact `pg_dump`
invocation is now known from evidence rather than assumption — including the fact that a CLI-only dump
would silently omit storage buckets, the migration ledger, extensions, event triggers and
publications, and that `postgis` is missing from the server entirely.

Two things must happen before this is executed: **rotate the credential exposed by `--dry-run`**, and
**prove decryption** (D6). Then A1 produces a schema baseline that finally resolves Gate K's 14
missing tables.

### Exact command awaiting A1

```bash
cd /Users/aa/Downloads/bookourspace-react
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$HOME/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-schema-$STAMP"
umask 077 && mkdir -p "$OUT"
npx --no-install supabase db dump --linked --workdir .local/pre-fix-backup --file "$OUT/schema.sql"
```

followed by the roles + metadata captures and the single `gpg --encrypt` to
`E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A`, exactly as specified in §4.3.

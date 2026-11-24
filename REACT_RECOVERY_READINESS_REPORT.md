# React Recovery Readiness Report

**Status: NOT READY. No capture, archive, dump, restore or rehearsal was performed.**
**Verdict: there is no restore point for the state the migrations would change.**

| | |
| --- | --- |
| Date | 2026-11-24 |
| Target | `obkfgxjzlscungkhbyvq` (development) |
| What is at risk | 74 base tables + 1 view, 179 functions, 141 policies, 40 triggers, 292 indexes, 7 extensions |
| Existing archives | 17 entries in `~/BookOurSpace_Backups/react`, 11 MB, newest `obkfgxjzlscungkhbyvq-20261110T041600Z` (~14 days) |
| Archives ever decrypted | **0** |
| Restores ever rehearsed | **0** |
| PITR | not enabled |
| Free disk | 9,141 MiB |

---

## 1. What "recovery" has to mean here

The pending set mutates data (17 `UPDATE`s in `business_ownership_phase2_backfill`) and rewrites authorization (56 policy statements across four files). Schema can be rebuilt from migration files; **rows cannot**. Recovery therefore requires, at minimum:

1. a schema capture that includes the 14 tables no migration ever creates,
2. an encrypted archive whose integrity and decryptability are actually proven,
3. a rehearsal showing the archive can be loaded and matches this database's object census.

A GPG self-test (Gate L3 D6, PASS at 2026-11-24T11:52:53Z, exit 0) proves the key can encrypt/decrypt **a test payload**. It does not prove any database archive is recoverable. That distinction is the reason this report exists.

---

## 2. The 14 legacy tables — the actual coverage gap

Computed this session by diffing the live relation census against every `CREATE TABLE` in all 81 migration files:

| # | Table | Why it matters |
| --- | --- | --- |
| 1 | `profiles` | every FK in the pending set points at it (`businesses.owner_user_id`, `business_members.user_id`, `business_ownership_transfers.*`, delivery OTP/audit actors) |
| 2 | `listings` | `business_id` backfill source — the mapping that decides every downstream row |
| 3 | `bookings` | backfill target (3rd `UPDATE`) |
| 4 | `enquiries` | backfill target + Phase 4 policy rewrite |
| 5 | `reviews` | backfill target |
| 6 | `transactions` | payment history; no migration creates or restores it |
| 7 | `payment_verifications` | payment evidence |
| 8 | `cinema_screens` | cinema ownership/assignment assertions |
| 9 | `movie_refunds` | refund ledger |
| 10 | `movie_support_tickets` | support records |
| 11 | `notifications` | per-user records |
| 12 | `seat_locks` | live seat state |
| 13 | `user_favorites` | per-user records |
| 14 | `user_module_configs` | per-user configuration |

**Arithmetic closes:** 74 live = 60 created by migrations + **14 legacy**. This is the same 14 that no historical baseline contains, so any archive that only covers migration-created objects leaves the tables holding real user data unprotected.

These 14 also carry RLS policies that Phases 3–4 rewrite, so their *policy state* must be in the capture as well as their rows.

---

## 3. Complete schema-capture scope

A schema-only capture is sufficient for structure, and this is the family list that must be evidenced:

| Family | Content | How it is evidenced |
| --- | --- | --- |
| 1 | Tables, columns, types, defaults, nullability, identity | `supabase db dump` schema-only |
| 2 | Primary keys, unique constraints, CHECKs, foreign keys | same |
| 3 | Indexes (292), including the 25 the pending set adds' predecessors | same |
| 4 | Functions (179), including `SECURITY DEFINER` + pinned `search_path`, and the five `pg_catalog`-only declarations that must not be rewritten | same + catalogue query |
| 5 | Triggers (40 non-internal) + trigger functions | same |
| 6 | RLS enablement, `FORCE RLS`, and **every policy (141)** | same + `pg_policies` |
| 7 | Grants: role → object privileges, default privileges | same |
| 8 | Extensions and versions (7) | `pg_extension` |
| 9 | Event triggers (7) | `pg_event_trigger` |
| 10 | Publications / realtime configuration | `pg_publication` + read-only query |
| 11 | Schemas present (`auth, extensions, graphql, graphql_public, pgbouncer, private, public, realtime, storage, supabase_migrations, vault`) | `pg_namespace` |
| 12 | Migration ledger (74 rows) | read-only query — needed to know what was applied *at capture time* |
| 13 | Sequences and their current values | schema dump + note |

Schema-only is not a data backup. Where rows are required to make a restore meaningful (`profiles`, `listings`, `businesses`, `business_members`, `business_module_access`, `business_backfill_review`), that is a **data** capture decision the owner has to make separately — it is not covered by Approval B and is not assumed here.

---

## 4. Storage configuration — separately required

Storage is not fully described by the schema dump:

| Item | Where it lives | Why separate |
| --- | --- | --- |
| Buckets, public/private, size limits, MIME allowlists | `storage.buckets` **(rows)** | a schema dump captures the table, not its contents |
| Object policies | `storage.objects` **(policies)** | captured with the schema, but their *effectiveness* depends on the bucket rows above |
| The private bucket used by step 3 | `bos-private-documents` | the new policy hard-codes this bucket id; if the bucket does not exist the policy is inert |
| Object inventory / count | `storage.objects` rows | needed to judge whether a restore is comparable |

Step 3's two policy replacements both reference `bucket_id = 'bos-private-documents'`, so bucket existence is a precondition of that step being meaningful. That is why the plan keeps Storage capture as **Approval C**, separate from the schema capture.

---

## 5. Key custody — what is proven and what is not

| Item | State |
| --- | --- |
| Canonical keyring | `~/.config/bookourspace/backup-gnupg-recovery-20261106` |
| Permissions | `drwx------` (owner-only) — **PASS** |
| Fingerprint | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` |
| Self-test | D6 round-trip PASS, 2026-11-24T11:52:53Z, exit 0 |
| Key material present + usable | **PASS** |
| Secret key export / offline copy verified | **not evidenced in this run** |
| **Archive-level decryptability** | **UNPROVEN** — no database archive has ever been opened |
| Key loss risk | single keyring, no rehearsal of recovery from a cold start |

Passphrase handling must stay interactive: never pass a passphrase on the command line, never write it into a file, never echo it.

---

## 6. Archive creation and verification procedure (defined, NOT executed)

```bash
# NOT RUN — requires Approval B
set -euo pipefail
umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$HOME/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-$STAMP"
mkdir -p "$OUT"

# 1. schema-only dump (CLI default is schema-only; never --dry-run)
npx --no-install supabase db dump --linked --workdir .local/pre-fix-backup \
  --file "$OUT/schema.sql"

# 2. checksum the plaintext, then encrypt it
shasum -a 256 "$OUT/schema.sql" | awk '{print $1}' > "$OUT/schema.sha256"
gpg --homedir "$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
    --batch --yes --trust-model always \
    --recipient E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A \
    --output "$OUT/schema.sql.gpg" --encrypt "$OUT/schema.sql"

# 3. remove the plaintext, keep only ciphertext + checksum of the ciphertext
rm -f "$OUT/schema.sql"
shasum -a 256 "$OUT/schema.sql.gpg" > "$OUT/schema.sql.gpg.sha256"

# 4. prove decryptability AND integrity without restoring anything
gpg --homedir … --batch --decrypt "$OUT/schema.sql.gpg" \
  | shasum -a 256            # must equal the value stored in schema.sha256
```

Acceptance for the archive to count as a *verified recovery point*:

1. `schema.sql.gpg` exists, `-rw-------`, in the backup destination.
2. Ciphertext SHA-256 recorded.
3. Decryption reproduces the exact plaintext SHA-256 recorded at step 2 — proving both key access and integrity.
4. The decrypted schema contains **74** `CREATE TABLE` statements including all **14 legacy** tables, **179** functions, and the policy set (141) — i.e. it matches the census, not just "some SQL".
5. The ledger snapshot taken at the same moment is stored alongside.
6. Nothing is written back to the project.

---

## 7. Existing archives — decryptability is unproven

17 archives exist; none has ever been opened. A safe way to close that gap **without restoring**:

1. Pick the newest archive only (`obkfgxjzlscungkhbyvq-20261110T041600Z`).
2. `gpg --decrypt` to **stdout piped into `shasum -a 256` and `grep -c 'CREATE TABLE'`** — never to a file in the project.
3. Compare table names against the 14 legacy tables.
4. Record pass/fail; delete nothing.

This requires the owner's explicit authorisation (it is a decryption, not a restore, but it touches the archive).

---

## 8. Restore rehearsal plan

A rehearsal is the only thing that converts "decryptable" into "recoverable". It does not need the hosted project:

| Step | Action |
| --- | --- |
| 1 | Use the **local** PostgreSQL 17 cluster already present at `.local/stays-db` (or a fresh scratch cluster), never the hosted project |
| 2 | Create a scratch database `bos_restore_rehearsal` |
| 3 | Load the decrypted schema into scratch |
| 4 | Compare: 74 tables, 179 functions, 141 policies, 40 triggers, 292 indexes, 7-extensions list, all 14 legacy tables present |
| 5 | Record every difference; a difference is a finding, not a rounding error |
| 6 | Drop the scratch database |

Note: the hosted stack provides `supabase_vault`, `pg_stat_statements`, `pgbouncer` schema etc. A local rehearsal cannot be byte-identical; differences in *platform-provided* objects must be classified as such rather than counted as failures. This classification has to be defined before the rehearsal, or the rehearsal will look worse than reality.

**Requires Approval G.**

---

## 9. Prerequisites and approvals

| # | Prerequisite | Blocking? |
| --- | --- | --- |
| 1 | Keyring + fingerprint verified | already PASS |
| 2 | Destination writable, ≥ 2,048 MiB free | already PASS (9,141 MiB) |
| 3 | Approval **B** — schema-only capture + archive + decrypt verification | **YES** |
| 4 | Approval **C** — Storage configuration capture | for step 3's meaningfulness |
| 5 | Decision on whether **data** capture is required for the 6 row-dependent tables | for a truly restorable state |
| 6 | Approval **G** — restore rehearsal in a scratch database | for "recoverable", not just "decryptable" |
| 7 | Archive-level decrypt test of the newest existing archive (§7) | to know whether the old archives are worth anything |
| 8 | Owner decision on PITR | not required to proceed, but it is the standing gap |

---

## 10. Verdict

**NOT READY.** The key is healthy and the destination is writable, but:

- the 14 tables that hold the data at risk have never been captured;
- the newest archive is ~14 days old;
- no archive has ever been decrypted, let alone restored;
- PITR is off, so there is no point-in-time fallback;
- the migrations rewrite policies on exactly those 14 tables and run 17 `UPDATE`s over their rows.

Until Approval B (and ideally C and G) is granted and the archive is verified against the census in §6.4, executing the eight migrations would be an irreversible data change with no restore point.

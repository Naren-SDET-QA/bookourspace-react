# Gate R2 — Development Credential Containment

**Status: OPEN — OWNER ACTION REQUIRED**
**No rotation performed. No role modified. No credential read, tested, copied or printed.**

| | |
| --- | --- |
| Date | 2026-11-24 (role evidence captured 2026-11-24T18:00:35Z) |
| Repository | `/Users/aa/Downloads/bookourspace-react` |
| Branch / HEAD | `feat/universal-gps-tracking` @ `96c1297fa7e1a5dae46872bf1f1c30b0c4788297` |
| Project | `obkfgxjzlscungkhbyvq` — development, ap-south-1. Production never contacted. |
| Linked workdir | `.local/pre-fix-backup` |
| Scope | **React only.** Flutter excluded. |
| Mode | Read-only review + owner instructions. No writes, no dumps, no restores. |
| Git | 8 modified, 0 staged, 23 untracked — unchanged by this gate except this report |
| Verdict | **Not closed.** Rotation is the owner's action; post-rotation evidence is still missing. |

---

## 1. Incident summary

| Property | Record |
| --- | --- |
| Secret class | **Database login password** — not a JWT, not `anon`, not `service_role`, not a management API token, not a personal access token |
| Role | `cli_login_postgres.obkfgxjzlscungkhbyvq` — a Supavisor pooler login minted by the Supabase CLI |
| Effective privilege | the `postgres` database user on the **development** project: DDL and DML on `public`, `private`, `storage` metadata, `auth` metadata |
| Vector | `supabase db dump --dry-run --linked` prints the generated `pg_dump` script, which contains `export PGPASSWORD="…"` |
| Root cause | tool design — the CLI must export a password for `pg_dump`, and `--dry-run` prints the whole script |
| Discovered | Gate L, by reading tool output with masking that did not cover `PGPASSWORD` |
| Blast radius | development only. No management-plane power, no production, no billing, no project settings |
| State since Gate L1/L2 | **OPEN**; rotation deferred by the owner to "a later security cleanup" |
| State now | **OPEN — OWNER ACTION REQUIRED** |

**Not implied by this report:** that the password still works, that it has been tested, that the role is harmless, or that the incident is contained. None of those is established.

---

## 2. Phase 1 — read-only evidence

### 2.1 Target identity — PASS

| Check | Observed |
| --- | --- |
| `.local/pre-fix-backup/supabase/.temp/project-ref` | `obkfgxjzlscungkhbyvq` |
| Repo-root link (`supabase/.temp/project-ref`) | **absent** |
| `BOS_PRODUCTION_SUPABASE_PROJECT_ID` in environment | **0 occurrences** |
| Connection host | `aws-0-ap-south-1.pooler.supabase.com:5432` (session pooler) |
| Connection user | `postgres.obkfgxjzlscungkhbyvq` — tenant username names the approved ref |
| Server identity | PostgreSQL **17.11**, database `postgres`, role `postgres` |
| Rejected refs in use | none — `sfoizxarbljhldmkgsma` (stale Mumbai) and `ezrxykyocgbolpaebnqx` (legacy Stockholm) never contacted |

The read-only session used the **existing git-ignored** `.local/pre-fix-backup/.env.local` credential. Every statement ran inside `begin read only; … rollback;` with `PGOPTIONS='-c default_transaction_read_only=on'`. No password was printed; only counts and metadata were emitted.

### 2.2 Exposed role — still present

```
utc_now=2026-11-24T18:00:35Z
identity=postgres|postgres|17.11|read_only=on
cli_login_roles=1
cli_login_canlogin=cli_login_postgres:true
```

| Check | Result |
| --- | --- |
| `cli_login%` roles present | **1** |
| Role name | `cli_login_postgres` |
| Can log in | **true** |
| Password retrieved / tested / reused | **NO** |
| Role altered / dropped / disabled | **NO** |
| Change since Gate L1 (2026-11-24, same count) | **none** |

Existence and login capability are facts; **the password's validity is not tested and must not be tested by this pipeline.** Rotation is the only action that invalidates it without presenting it.

### 2.3 Git state — preserved

| Check | Observed |
| --- | --- |
| Branch / HEAD | `feat/universal-gps-tracking` @ `96c1297` |
| Modified | **8** — 4 React UI fixes (`ProviderDashboard`, `VenueOwnerWorkspace`, `ClassBatchManager`, `ConfirmDialog`) + 4 prior integration-test fixtures |
| Staged | **0** |
| Untracked | **23** gate reports (8 `REACT_*`, 14 `SUPABASE_*`, plus `REACT_RECOVERY_GATE_R2_CREDENTIAL_CONTAINMENT.md`) |
| Git commands run | read-only: `status`, `rev-parse`, `check-ignore` |

Nothing was reset, cleaned, checked out, stashed, committed, pushed or merged.

### 2.4 Environment variable **names** only — no values

`.env.local` (repo root, git-ignored) and `.local/pre-fix-backup/.env.local` (git-ignored) expose these database-related names:

```
VITE_SUPABASE_PROJECT_ID, VITE_SUPABASE_DEVELOPMENT_PROJECT_ID, VITE_SUPABASE_URL,
VITE_SUPABASE_PUBLISHABLE_KEY,
BOS_HOSTED_DATABASE_URL, BOS_MUMBAI_DATABASE_URL, BOS_LISTINGS_DATABASE_URL,
MUMBAI_DB_HOST/PORT/NAME/USER/SSLMODE, MUMBAI_DIRECT_HOST/PORT/USER,
BOS_BACKUP_GPG_RECIPIENT, BOS_BACKUP_GNUPGHOME
```

Metadata-only parse of the two connection-shaped names (no credential material):

| Variable | Host | Port | User | Password present | Database |
| --- | --- | --- | --- | --- | --- |
| `BOS_HOSTED_DATABASE_URL` | `aws-0-ap-south-1.pooler.supabase.com` | 5432 | `postgres.obkfgxjzlscungkhbyvq` | yes | `postgres` |
| `BOS_MUMBAI_DATABASE_URL` | same pooler | 5432 | same user | yes | `postgres` |
| `BOS_LISTINGS_DATABASE_URL` | `127.0.0.1` | 55440 | `postgres` | **no** | `bookourspace_dev` |

**Both hosted variables address the same development database with the same role**, so both stop working when the password is rotated. `BOS_LISTINGS_DATABASE_URL` is the disposable loopback cluster and is unaffected.

Other files that carry database secrets (all git-ignored, confirmed with `git check-ignore`):

| File | Secret-bearing name | State |
| --- | --- | --- |
| `README.md` / env examples | `BOS_LISTINGS_DATABASE_URL`, `BOS_DEVELOPMENT_DATABASE_*` | placeholders only — no value |
| `.local/pre-fix-backup/.env.save` | `MUMBAI_DB_PASSWORD` (standalone) | **present**; Nov 4 snapshot, not read by any current script |
| `.local/pre-fix-backup/.env.local.mumbai` | public keys only | no password |

No value was read from any of these files. `.env`, `.env.local`, `.env.local.*`, `.env.save` and `.local/**` are all git-ignored.

### 2.5 Running services and CI — what will actually break

| Consumer | Target today | Affected by rotation? |
| --- | --- | --- |
| React dev app on `127.0.0.1:3010` (PID 37725) | **local PG** `127.0.0.1:55440`; log says *"Live Supabase is disabled"* | **No** |
| Local PostgreSQL cluster `.local/stays-db` | loopback, trust auth | **No** |
| Playwright harness | isolated local PG + synthetic publishable key | **No** |
| GitHub Actions `ci.yml` | `npm test` + a **runner-local** PostgreSQL it installs with apt | **No dev DB secret configured** |
| Cloud Run `deploy/cloudrun/service.yaml` | `BOS_LISTINGS_DATABASE_URL` from deploy secret `bos-listings-database-url` | **No** — deployment-time config, not this device's dev password |
| GPG keyring / passphrase Keychain item | `bos-backup-gpg-passphrase-recovery-20261106` | **No** — unrelated to DB auth |

Two unrelated `server.ts` processes from another project directory (`/Users/aa/Projects/bookourspace-final`) are running. They are outside this workspace and were not inspected or touched; if they hold this dev password, they will fail after rotation — the owner should check them.

### 2.6 CLI configuration

| Item | Observed |
| --- | --- |
| `.temp/project-ref` | `obkfgxjzlscungkhbyvq` |
| `.temp/pooler-url` | 93 bytes, **no inline password** (re-verified in Gate L1) |
| `.temp/linked-project.json` | present, metadata only |
| `~/.supabase/` | `cli-latest`, `ports.sqlite` — no readable DB password cached |
| CLI version | 2.117.0 |

The CLI mints or reuses its own `cli_login_postgres` role per privileged invocation. After rotation it will re-mint; the current role will be dead but may still be listed until the owner removes it.

---

## 3. Phase 2 — owner rotation instructions

Do these in order. **Do not paste the new password into this chat, a terminal command, a report, a commit or a shell history line.**

### 3.1 Reset the password

1. Open `https://supabase.com/dashboard/project/obkfgxjzlscungkhbyvq`.
2. Go to **Project Settings → Database** (`/settings/database`).
3. Find **Database password** and choose **Reset database password**.
4. Generate a **new, unique** password of at least 32 characters (letters, digits, symbols). Supabase shows it **once** — copy it immediately.
5. Store it in the owner's password manager under a name such as `BookOurSpace dev DB (post-R2)`. Do not reuse any password from another project or from `.env.save`.

*Why this contains the incident:* Supavisor derives pooler credentials from the database password, so resetting it invalidates every derived login mapped to `postgres` — including the leaked `cli_login_postgres…` — without anyone presenting the leaked value.

### 3.2 Update the local development configuration (owner action)

Only these locations address the development database. Edit them **in a text editor**, never with a command that embeds the password.

| # | Location | What to change |
| --- | --- | --- |
| 1 | `.env.local` (repo root) | `BOS_HOSTED_DATABASE_URL` **and** `BOS_MUMBAI_DATABASE_URL` — replace the password in both URLs |
| 2 | `.local/pre-fix-backup/.env.local` | same two variables |
| 3 | Keychain `bos-production-backup` | the pooler URI read by the backup scripts |
| 4 | Keychain `bookourspace-react-db` | legacy item; already rejected in earlier gates — update or retire (owner decision) |
| 5 | `.local/pre-fix-backup/.env.save` | contains a standalone `MUMBAI_DB_PASSWORD`; not used at runtime — retire it or leave it, but do not treat it as current |

**URL-encoding:** if the new password contains `@ : / ? # [ ] %`, percent-encode it inside the URL (or regenerate a password using only `A-Z a-z 0-9 - _ . ~`). A raw `@` or `:` silently corrupts the URI and produces a misleading auth failure.

For the Keychain item, let Keychain prompt (nothing appears in history):

```bash
security add-generic-password -U -a "$USER" -s bos-production-backup -w
# paste the full postgresql://postgres.obkfgxjzlscungkhbyvq:…@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require at the hidden prompt
```

### 3.3 Reconnect the CLI and the authorized session

```bash
cd /Users/aa/Downloads/bookourspace-react
npx --no-install supabase link --project-ref obkfgxjzlscungkhbyvq \
  --workdir .local/pre-fix-backup      # only if the CLI reports the link is stale
npx --no-install supabase migration list --linked \
  --workdir .local/pre-fix-backup      # read-only; expect 74 applied rows, 8 pending
```

If the CLI asks for the database password, it prompts interactively — do not pass it as `-p` on the command line.

### 3.4 Verify with a read-only query

Prepare a private pgpass so the password never appears in `argv` or history:

```bash
TMPD="$(mktemp -d)"; chmod 700 "$TMPD"
printf '%s\n' 'aws-0-ap-south-1.pooler.supabase.com:5432:postgres:postgres.obkfgxjzlscungkhbyvq:NEW_PASSWORD' > "$TMPD/pgpass"
chmod 600 "$TMPD/pgpass"
PGPASSFILE="$TMPD/pgpass" PGSSLMODE=require PGCONNECT_TIMEOUT=20 \
PGOPTIONS='-c default_transaction_read_only=on' \
psql -X -h aws-0-ap-south-1.pooler.supabase.com -p 5432 \
     -U postgres.obkfgxjzlscungkhbyvq -d postgres -c \
  "begin read only; select current_database(), current_user,
          current_setting('transaction_read_only') as read_only,
          current_setting('server_version') as server; rollback;"
rm -P "$TMPD/pgpass"; rmdir "$TMPD"
```

Expected: `postgres | postgres | on | 17.11`. Type the password into the file with an editor or a hidden prompt, not into a command that is recorded.

Then, and only then, ask for Gate R3 to verify the state independently. **Do not mark the incident closed from the owner's own assertion alone.**

---

## 4. Phase 3 — post-rotation verification checklist

Each check states the command, the expected result, and what a failure means. All are read-only.

| # | Check | Command | Expected | Failure means |
| --- | --- | --- | --- | --- |
| 1 | New connection succeeds | `psql 'service=bos-r2-verify' -c "begin read only; select 1; rollback;"` | exit 0, `1` | password/encoding wrong, or pooler not yet settled |
| 2 | Read-only enforced | same session: `select current_setting('transaction_read_only')` | `on` | `PGOPTIONS` not applied — abort, do not query |
| 3 | Same target, no production | `select current_user, current_database()`; assert host `aws-0-ap-south-1.pooler.supabase.com`, user `postgres.obkfgxjzlscungkhbyvq` | exact match | wrong project — stop immediately |
| 4 | Old credential rejected | **owner-controlled only**: either Dashboard → Database → Roles shows the old role gone, **or** the owner deliberately attempts one connection with the old password from a throwaway pgpass and expects `28P01` | role absent **or** `28P01` | old password still works → rotation did not take effect; escalation needed |
| 5 | Explicit old role not usable | `select count(*) from pg_roles where rolname='cli_login_postgres'` | 0 or explained | present → cleanup decision (below) |
| 6 | No production access | `env \| grep -c BOS_PRODUCTION_SUPABASE_PROJECT_ID`; host/user check from #3 | `0` and dev ref only | production configured — stop |
| 7 | No secret exposure | scan the session transcript for `postgres\.[a-z]+:[^@]+@` and `PGPASSWORD=` | 0 matches | rotate again; treat transcript as sensitive |
| 8 | No Keychain change beyond the intended item | `security find-generic-password -s <item>` presence for the three known items; compare GPG fingerprint and keyring mtime with §5 | 3 present, fingerprint `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A`, mtime unchanged except normal gpg housekeeping | unexpected change — investigate |
| 9 | Role status documented | `select rolname, rolcanlogin from pg_roles where rolname like 'cli_login%'` | recorded verbatim (may be a **new** role minted by the CLI) | new role unreviewed → schedule role review |
| 10 | Local tooling reconnected | `node .local/r1-census.mjs` (read-only census, prints counts only) | exit 0, 74 tables / 74 ledger / 8 pending | env not updated in one of the two files |
| 11 | Backup path still guarded | `bash supabase/tests/run_dev_backup.sh` with `BOS_BACKUP_GUARD_ONLY=1` and approval vars unset | refuses without approval (exit 3/2), no connection | guard regression — stop |

**Check 4 is deliberately owner-gated.** This pipeline will not present the leaked secret. The preferred evidence is dashboard-side: after reset, the old derived login no longer authenticates because its password no longer exists. If the owner wants a direct negative test, it must be their own deliberate action, with the transcript handled as sensitive.

**Role cleanup is not part of this gate.** `cli_login_postgres` still exists with `canlogin = true`. Dropping or disabling it needs a separate review and explicit approval, because the role name is also the one the CLI mints; a blind `drop role` during a CLI operation can break the next migration run.

---

## 5. Phase 4 — operational dependency inventory

### 5.1 Must be updated after rotation

| # | Consumer | Path / item | Why | Owner action |
| --- | --- | --- | --- | --- |
| 1 | App/dev env (root) | `.env.local` → `BOS_HOSTED_DATABASE_URL`, `BOS_MUMBAI_DATABASE_URL` | both carry the old password | replace password in both |
| 2 | App/dev env (workdir) | `.local/pre-fix-backup/.env.local` → same two | same | replace password in both |
| 3 | Backup credential | Keychain `bos-production-backup` | read by `supabase/tests/run_dev_backup.sh:384`, `backup_production_readonly.sh:400`, `compare_migration_history.sh:31` | re-save full URI via hidden prompt |
| 4 | Legacy credential | Keychain `bookourspace-react-db` | already stale per earlier gates; unused by current scripts | update or delete (decision) |

### 5.2 Reads the env at runtime — no stored secret

| Consumer | Path | Notes |
| --- | --- | --- |
| Media pipeline verifier | `scripts/verify-media-pipeline.mjs:47` | `BOS_MUMBAI_DATABASE_URL \|\| BOS_HOSTED_DATABASE_URL \|\| DATABASE_URL` |
| Read-only identity preflight | `supabase/tests/mumbai_readonly_identity_preflight.sh` | requires `BOS_MUMBAI_DATABASE_URL` |
| Dev migration plan | `supabase/tests/run_dev_migration_plan.sh` | `BOS_DEV_DATABASE_URL`; **also prints a stale legacy target `ezrxykyocgbolpaebnqx` in its plan header** — a label defect, no connection |
| Migration installer | `supabase/install_mumbai_migrations.sh:131` | `BOS_MUMBAI_DATABASE_URL` |
| Migration history compare | `supabase/tests/compare_migration_history.sh:29` | env or Keychain |
| Backup runner | `supabase/tests/run_dev_backup.sh` | env or Keychain, approval-gated |
| Connection preflight | `scripts/mumbai_connection_backup_preflight.sh` | prompts with `read -s`; stores nothing |
| CLI | `.local/pre-fix-backup/supabase/.temp/*` | ref + password-free pooler URL; CLI re-mints |

### 5.3 Not affected

| Consumer | Why |
| --- | --- |
| React dev server on `:3010` | uses loopback `127.0.0.1:55440`; hosted Supabase disabled |
| Local PostgreSQL `.local/stays-db` | trust auth on loopback |
| Playwright/Chromium harness | isolated local PG, synthetic publishable key |
| CI `.github/workflows/ci.yml` | no dev DB secret; installs PostgreSQL on the runner |
| Cloud Run deploy config | uses deploy-time secret `bos-listings-database-url`, not this device's dev password |
| GPG keyring / passphrase item | encryption custody, unrelated to DB auth |
| `.env`, `.env.local.mumbai` | public keys only |

### 5.4 Secret files that need a retirement decision (not changed here)

| File | Issue |
| --- | --- |
| `.local/pre-fix-backup/.env.save` | standalone `MUMBAI_DB_PASSWORD`, Nov 4 snapshot; stale and unencrypted |
| `.local/pre-fix-backup/.env.local.mumbai` | no password, but it is a project-switch snapshot that can silently point the app at an old target |
| `.local/pre-fix-backup/supabase/.temp/pooler-url` | password-free today; keep it that way |

---

## 6. Remaining risks

| # | Risk | Severity | Handling |
| --- | --- | --- | --- |
| **R2-1** | Incident cannot be closed until the owner rotates and post-rotation evidence is captured | **Critical** | Owner action; Gate R3 verification |
| **R2-2** | Leaked role still live (`canlogin = true`) right now | **High** | Rotation invalidates it; role removal needs separate approval |
| **R2-3** | Two env files × two URL variables = four places to update; partial update yields confusing failures | Medium | Update all four in the same sitting; verify with census |
| **R2-4** | Keychain `bos-production-backup` also holds the old password; backup scripts will fail until re-saved | Medium | Owner re-saves URI; guard-only run confirms |
| **R2-5** | Password may contain characters that break the URI | Medium | Percent-encode or use a symbol-safe alphabet |
| **R2-6** | `.env.save` retains an old password in plaintext | Medium | Retire the file (owner decision) |
| **R2-7** | CLI will mint a **new** `cli_login_*` role on the next privileged command; it must be reviewed, not assumed clean | Medium | Check #9; separate role review |
| **R2-8** | `run_dev_migration_plan.sh` prints the legacy Stockholm ref as its "target" | Low | Label only; correct before it is used to justify any apply |
| **R2-9** | Another project's server processes on this machine may use the dev password | Low | Owner checks; out of this workspace |
| **R2-10** | Rotation does not enable PITR, fix the missing archive decrypt test, or change the 8 pending migrations | — | Separate gates (R1 D-A/D-E, execution plan A–G) |

---

## 7. What this gate did and did not do

**Did:** read the three prior reports; verified the project reference and connection identity without printing credentials; confirmed `cli_login*` existence and `canlogin` at `2026-11-24T18:00:35Z`; enumerated environment variable **names** and connection targets (metadata only); inventoried every local consumer, script, CI workflow and running service; captured Keychain/GPG baseline metadata for the post-rotation comparison; recorded Git state; wrote this report.

**Did not:** rotate or reset any password; retrieve, test, copy, log or reuse the exposed credential; create, alter, disable or drop any role; modify `.env`, Keychain, CI secrets or GPG configuration; create any dump, backup, archive, encryption or restore; write to any database; contact production; touch Flutter; run any Git mutation.

**Checks run:** `git status`/`rev-parse`/`check-ignore`; `cat project-ref`; `psql` read-only `pg_roles`/identity query (exit 0, `read_only=on`); `security find-generic-password` presence/metadata only; `gpg --list-secret-keys` fingerprint; `ls` of CLI temp and `~/.supabase`; workflow and script inspection. No build or test suite was run — no source file changed.

---

## 8. Status

**OPEN — OWNER ACTION REQUIRED.**

The incident is not contained: the exposed role still exists and can still log in. The path to closure is entirely owner-side — reset the development database password in the Supabase Dashboard, update the four local connection entries and the backup Keychain item, reconnect the CLI, and run the read-only verification in §4.

Once that is done, a verification gate must independently confirm checks 1–11 before the incident is recorded **VERIFIED CLOSED**. This report does not claim it.

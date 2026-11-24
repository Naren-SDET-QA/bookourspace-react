# Gate I — Encryption Verification & Production Project Discovery

**Date:** 2026-11-24
**Branch:** `feat/universal-gps-tracking` @ `96c1297`
**Mode:** READ-ONLY. No database writes, no backup execution, no backup download, no Docker, no
`supabase link`, no key generation, no clone, no migration, no deployment, no Git modification,
no project creation.
**Predecessor:** `SUPABASE_RECOVERY_GATE_H_PRODUCTION_IDENTITY_VERIFICATION.md`

Evidence labels used throughout: **CONFIRMED** (directly observed this gate), **INFERRED**
(deduced from observed evidence, stated as such), **UNRESOLVED** (evidence absent or
contradictory), **OWNER ACTION** (cannot be produced by any read-only probe).

---

## 1. Git baseline

| Item | Observed value | Label |
| --- | --- | --- |
| Branch | `feat/universal-gps-tracking` | CONFIRMED |
| HEAD | `96c1297` | CONFIRMED |
| Staged changes | 0 | CONFIRMED |
| Modified (pre-existing) | 1 — `src/components/ProviderDashboard.tsx` | CONFIRMED |
| Untracked | 4 — Gate E / F / G / H reports (Gate I adds a 5th) | CONFIRMED |
| Migration files in `supabase/migrations/` | 81 | CONFIRMED |
| Newest migration | `20261112050000_business_ownership_phase5_transfer.sql` | CONFIRMED |
| Migration ledger (hosted, from Gate E) | 73 applied / 8 pending | CONFIRMED (Gate E) |

The pre-existing working-tree modification and every prior Gate report were preserved untouched.
Gate I produced exactly one new untracked file (this report). No Git command that mutates state was
run — only `rev-parse`, `status --porcelain`, `log -1`, `remote -v`.

### D7 protection — ARMED, unchanged

`src/server/supabaseProductionGuard.ts` still lists exactly three development refs and still
requires an explicit production variable:

```
DEVELOPMENT_SUPABASE_PROJECT_REFS = [ 'obkfgxjzlscungkhbyvq', 'ezrxykyocgbolpaebnqx', 'sfoizxarbljhldmkgsma' ]
PRODUCTION_SUPABASE_PROJECT_ID_VAR = 'BOS_PRODUCTION_SUPABASE_PROJECT_ID'
```

No ref was added, removed or reordered. Gate I made no edit to that file.

---

## 2. GPG verification result

### 2.1 What was inspected

Gate I looked for an existing `owner_gpg_test.sh` result before doing anything else.

| Probe | Result |
| --- | --- |
| Round-trip log / artifact in `~/BookOurSpace_Backups` | **none found** |
| Any stored output of `owner_gpg_test.sh` | **none found** |

**CONFIRMED: the owner-only test has never been executed.** No result exists to inspect, so Phase 1
falls to the "if no result exists" branch. The test was **not** run by Gate I.

### 2.2 Canonical keyring — CONFIRMED present

`~/.config/bookourspace/` contains exactly two keyrings:

```
backup-gnupg                        # legacy "Temporary Hosted Install" keyring (wrong recipient)
backup-gnupg-recovery-20261106      # canonical recovery keyring
```

Secret-key listing of the canonical keyring (`--list-secret-keys --with-colons`, public identifiers
only; no private material read or printed):

```
sec:u:3072:1:B151F3EB267A8E5A:1793971695:1857043695::u:::ecEC:::+:::23::0:
fpr:::::::::E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A:
uid:u::::1793971695::...::BookOurSpace Backup Recovery 2026 <backup-key@bookourspace.invalid>:::
```

| Property | Value | Label |
| --- | --- | --- |
| Fingerprint | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` | CONFIRMED — matches the brief exactly |
| Key ID | `B151F3EB267A8E5A` | CONFIRMED |
| UID | `BookOurSpace Backup Recovery 2026 <backup-key@bookourspace.invalid>` | CONFIRMED |
| Algorithm / size | ECC (`ecEC`), 3072-bit primary | CONFIRMED |
| Capabilities | `u` — certify + encrypt | CONFIRMED |
| Created (epoch 1793971695) | 2026-11-06 | CONFIRMED |
| Expires (epoch 1857043695) | 2028-11-05 | CONFIRMED |
| Secret key present | yes (`sec:u`) | CONFIRMED |
| Keys in keyring | 1 | CONFIRMED |

### 2.3 Encryption evidence — CONFIRMED

`gpg_readiness.sh` (exit 0) encrypts a non-secret probe to the recipient using the **public key
only**, so it needs no passphrase:

```
PASS  keyring directory exists
PASS  keyring permissions drwx------ (owner-only)
PASS  keyring outside the repository and outside ~/BookOurSpace_Backups/react
PASS  public key present (1 key(s))
PASS  recipient supplied: E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A
PASS  recipient resolves to fingerprint E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A
PASS  fingerprint length 40 (public identifier only)
PASS  matching secret key present (contents never read or printed)
PASS  key advertises encryption capability (ecEC)
WARN  key expires 2028-11-05; plan rotation before then
PASS  encryption to E18BA34…A8E5A produced a ciphertext (512 bytes)
WARN  SKIPPED: decryption not an interactive terminal
verdict: READY — owner key can encrypt; decryption verified when run interactively
```

**Encryption: CONFIRMED WORKING.** A real 512-byte ciphertext was produced by the canonical
recipient this gate.

### 2.4 Decryption evidence — UNRESOLVED (owner action)

Decryption requires the private-key passphrase, which only interactive pinentry can supply. No
non-interactive path exists, and Gate I may not request, accept or print a passphrase.

**Decryption: UNRESOLVED.** A backup that can be written but never read is not a recovery
capability; this is the single largest outstanding encryption gap.

### 2.5 The keyring trap in `owner_gpg_test.sh` — CONFIRMED, must be avoided

`supabase/tests/owner_gpg_test.sh` sources **only** `supabase/tests/lib/bos_backup_crypto.sh`, not
the guard library. `bos_crypto_keyring()` therefore resolves:

```
KEYRING = ${BOS_BACKUP_GNUPGHOME:-$HOME/.config/bookourspace/backup-gnupg}
```

Without an explicit `BOS_BACKUP_GNUPGHOME`, the script inspects the **legacy** keyring (fingerprint
`CC5AE8D8…`, "Temporary Hosted Install"), where the canonical recipient **does not exist**, and
exits **2 BLOCKED** with a message implying the owner key is missing. That message would be false.

Exit codes: `0` pass · `2` blocked (owner action) · `5` encryption/decryption failure.

### 2.6 Exact owner command — OWNER ACTION, not executed here

Run in your own interactive terminal (pinentry needs a TTY):

```bash
cd /Users/aa/Downloads/bookourspace-react
BOS_BACKUP_GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
BOS_BACKUP_GPG_RECIPIENT=E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A \
bash supabase/tests/owner_gpg_test.sh
```

Expected interaction: one pinentry dialog for key `B151F3EB267A8E5A`, once (the script encrypts,
verifies, then decrypts the same message). Type the passphrase in the dialog — never on the command
line, never in this chat. The terminal will show only PASS lines and a checksum comparison; the
script is written to print no key material, no passphrase and no credential.

Expected output on success:

```
=== owner key encryption/decryption ===
PASS: owner key encrypted, decrypted and reproduced the test checksum.
PASS: no credential, key material or private-key path was printed.
```

---

## 3. Production project discovery evidence

Six independent evidence sources were queried. All six are negative.

### 3.1 Connected Supabase account — 2 projects, no production

`supabase orgs list`:

| Org ID | Name |
| --- | --- |
| `xmdplhsezwoxmoxkciow` | `Babu` |
| `qecpaywxwprftaaminzf` | `ap-south-1` (empty) |

`supabase projects list`:

| Ref | Name | Region | Created (UTC) |
| --- | --- | --- | --- |
| `ezrxykyocgbolpaebnqx` | tnarendra2027-ui's Project | North EU (Stockholm) | 2026-10-30 18:46:40 |
| `obkfgxjzlscungkhbyvq` | React | South Asia (Mumbai) | 2026-11-04 16:51:24 |

**CONFIRMED: the connected account holds exactly two projects.** Both are already classified as
development in D7 (Stockholm is the legacy dev project, Mumbai is the designated dev project).
There is no third, newer, larger or differently-named project that could be production. The brief's
rule — do not infer production from a name — is moot here: there is no candidate to name.

### 3.2 Deployment environment configuration — placeholders only

```
deploy/env.production.example:3   # Supabase project: __PRODUCTION_SUPABASE_PROJECT_REF__ (dedicated production project)
deploy/env.production.example:25  BOS_PRODUCTION_SUPABASE_PROJECT_ID=__PRODUCTION_SUPABASE_PROJECT_REF__
deploy/env.production.example:29  VITE_SUPABASE_PROJECT_ID=__PRODUCTION_SUPABASE_PROJECT_REF__
deploy/native/env.production.example:22  VITE_SUPABASE_PROJECT_ID=<production-project-ref>
deploy/native/README.md:12        export VITE_SUPABASE_PROJECT_ID="<dedicated production project ref>"
```

`deploy/native/build-production.sh` fails closed: it requires the ref, requires the URL to equal
`https://<ref>.supabase.co`, and rejects a `.supabase.co`-hosted origin mismatch. So the production
deployment path is **built to refuse** without an owner-supplied ref — consistent with that ref
never having been supplied.

### 3.3 Repository-wide ref census — no unknown ref

Scoped census (`.env*`, `src/`, `supabase/`, `deploy/`, `scripts/`, `docs/`, `package.json`):

| Ref | URL occurrences | Bare `PROJECT_ID` occurrences | Identity |
| --- | --- | --- | --- |
| `obkfgxjzlscungkhbyvq` | 18 | 3 | designated dev (Mumbai) |
| `sfoizxarbljhldmkgsma` | 5 | 3 | retired Mumbai |
| `ezrxykyocgbolpaebnqx` | 2 | 1 | legacy dev (Stockholm) |
| **any 4th ref** | **0** | **0** | — |

**CONFIRMED: zero unknown references in the React repository.** Every ref present is already known
and already inside D7's development list. No production ref is hiding in config, scripts or docs.

### 3.4 Production deployment records — none exist

```
gcloud config: account = monapatisravya28@gmail.com, core/project = (unset)
gcloud projects list: bookmyspace-42c8e (BookMySpace), gen-lang-client-0546443421,
                      project-31b76c44-…, project-ed76611f-…, project-55f7dbac-…, numeric-pilot-455916-n2
gcloud run services list --project bookmyspace-42c8e
  → API [run.googleapis.com] not enabled on project [bookmyspace-42c8e].
```

**CONFIRMED: no Cloud Run deployment can exist** in the only BookMySpace GCP project — the API was
never enabled, so no service was ever deployed. No production deployment record exists on this
workstation. (Enabling that API would be a write; Gate I stopped at the prompt.)

### 3.5 Previous backup metadata — one ref only

`supabase backups list --project-ref obkfgxjzlscungkhbyvq`:

| Region | Type | Status | Created (UTC) |
| --- | --- | --- | --- |
| South Asia (Mumbai) | PHYSICAL | COMPLETED | 2026-11-24 02:39:53 |
| South Asia (Mumbai) | PHYSICAL | COMPLETED | 2026-11-23 02:39:07 |
| South Asia (Mumbai) | PHYSICAL | COMPLETED | 2026-11-22 02:39:06 |
| South Asia (Mumbai) | PHYSICAL | COMPLETED | 2026-11-21 02:39:01 |
| South Asia (Mumbai) | PHYSICAL | COMPLETED | 2026-11-20 02:39:05 |
| South Asia (Mumbai) | PHYSICAL | COMPLETED | 2026-11-19 02:38:58 |
| South Asia (Mumbai) | PHYSICAL | COMPLETED | 2026-11-18 02:39:04 |
| South Asia (Mumbai) | PHYSICAL | COMPLETED | 2026-11-17 02:39:07 |

Every backup in existence belongs to `obkfgxjzlscungkhbyvq`. **CONFIRMED: no other project in this
account has ever been backed up**, which independently corroborates §3.1 — a production database
would be the first thing configured for backups, and none exists.

The series is unbroken and daily, now spanning 2026-11-17 → 2026-11-24 inclusive: 8 automatic
backups at exactly 7-day retention (Gate H's entitlement evidence still holds).

### 3.6 Authorized local configuration + historical reports — placeholder only

`deploy/CHECKLIST.md` §8 and `deploy/cloudrun/service.yaml` continue to record the production ref as
owner input, not as a value. Gate E/F/G/H reports record the same. No historical recovery report
names a production ref.

### 3.7 Verdict for Phase 2

> **PRODUCTION PROJECT: UNRESOLVED. OWNER IDENTIFICATION REMAINS MANDATORY.**
>
> Six sources, six negatives. This is now the third gate in which production identity has failed to
> resolve, and the failure is no longer attributable to missing local evidence: the connected
> account, the deployment tooling, the backup system and the repository all agree that **no
> production project exists**. The most defensible inference is that production has not been
> provisioned yet — meaning the recovery target is a *future* project and backup/restore planning
> must assume "provision, then migrate", not "recover an existing live database". That inference is
> **not** permission to act: an owner statement is still required, because the alternative
> explanation (a second Supabase account not connected here) cannot be excluded read-only.

---

## 4. Flutter repository discovery evidence

Gate H recorded "Flutter project: EXTERNAL TO CURRENT REPOSITORY" and could not verify it. Gate I
searched the accessible local project directories and **found five locations**, one of which is a
real git repository.

### 4.1 `~/Desktop/BookMySpace` — the authoritative Flutter repository

| Property | Value | Label |
| --- | --- | --- |
| Path | `/Users/aa/Desktop/BookMySpace` | CONFIRMED |
| Git | yes — `.git` present | CONFIRMED |
| Branch | `main` | CONFIRMED |
| Commit | `fc35976` | CONFIRMED |
| Last commit | `2026-08-03 10:20:02 +0530` — "M11: Firebase Crashlytics, Performance monitoring, app icons, splash screen" | CONFIRMED |
| Remote | `https://github.com/Naren-SDET-QA/bookmyspace.git` | CONFIRMED |
| Working tree | clean (0 changed paths) | CONFIRMED |
| App identity | `name: bookmyspace`, `description: "A new Flutter project."` | CONFIRMED |
| Layout | `lib/`, `android/`, `ios/`, `web/`, `test/`, `docs/`, `docker/`, `supabase/`, `build/` | CONFIRMED |
| Migrations | `supabase/migrations/0001…0016` (16 numbered files) + `test_harness_auth_stub.sql` + 3 test files = **20 SQL files** | CONFIRMED |

**Supabase configuration of this repo — no ref is committed.** `lib/core/config/app_config.dart`
reads everything from compile-time defines:

```dart
static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
static const String envDefine   = String.fromEnvironment('APP_ENV');
```

and validates at startup, adding the errors `Missing SUPABASE_URL` and `Invalid SUPABASE_URL`. A
scoped search of `lib/`, `docs/`, `README.md` and `.env.example` for any `*.supabase.co` returned
**zero matches**. `README.md` states: *"All secrets are placeholders in code. Real values are
injected at build time."*

Five environments are documented:

| Env | Purpose | `APP_ENV` |
| --- | --- | --- |
| local | Local Supabase (Docker) | `local` |
| development | Dev team work | `development` |
| testing | Automated tests | `testing` |
| staging | Pre-production validation | `staging` |
| production | Live users | `production` |

`AppEnvironment` defaults to `production` in `kReleaseMode` and `development` in debug, so a release
build with no `--dart-define` silently targets *production-with-no-URL* and fails the startup
validation rather than falling back to a dev database. That is fail-closed and good.

**Flutter production ref: UNRESOLVED.** It is not in the repo by design. It lives only in whatever
build invocation produced each release artifact.

### 4.2 Four further copies in `~/Downloads` — Kotlin-native variants, no git

| Path | `.git` | Files (excl. build) | `.dart` files | `AppConfig.kt` SHA-256 (16) | Hardcoded ref |
| --- | --- | --- | --- | --- | --- |
| `bookmyspace (1)` | no | 430 | 107 | `32a6375d69058d19` | `zykxneztahxbjduagutv` |
| `bookmyspace (5)` | no | 1633 | 151 | `32a6375d69058d19` | `zykxneztahxbjduagutv` |
| `bookmyspace_andriod (1)` | no | 575 | 142 | `32a6375d69058d19` | `zykxneztahxbjduagutv` |
| `BookMyspace_Andriod-main.zip` | no (archive) | — | — | same ref | `zykxneztahxbjduagutv` |

These are a **hybrid** codebase: Flutter under `lib/` *plus* a native Kotlin app under `app/src/`.
The identical `AppConfig.kt` hash in all three unpacked copies proves a single lineage, so these are
clones of one project, not three apps.

`app/src/main/java/com/bookmyspace/bookmyspace/data/config/AppConfig.kt`:

```kotlin
const val supabaseUrl: String = "https://zykxneztahxbjduagutv.supabase.co"
const val projectRef: String = "zykxneztahxbjduagutv"
...  get() = supabaseUrl.contains("zykxneztahxbjduagutv")
```

and `ProfileSettingsAuthLegalScreens.kt:1460` self-documents the identity:

> `"Mobile OTP provider requires configuration on DEV Supabase (Project: bookmyspace-dev, Ref: zykxneztahxbjduagutv). Status: BLOCKED."`

### 4.3 The fourth ref — `zykxneztahxbjduagutv` — UNRESOLVED and outside this account

| Question | Answer |
| --- | --- |
| Present in `supabase projects list`? | **No** — account holds only `ezrxykyocgbolpaebnqx` and `obkfgxjzlscungkhbyvq` |
| Present anywhere in the React repo? | **No** — §3.3 found 0 occurrences |
| Self-declared identity | "bookmyspace-dev" — a **development** project, not production |

**CONFIRMED:** a fourth Supabase ref exists in Flutter build config and is **not** reachable from the
connected account. It belongs to another Supabase account (or was deleted). It is a *dev* ref, so it
does not resolve production — but it does prove **at least one second Supabase account exists outside
this workstation's connection**, which is exactly the alternative explanation that keeps §3.7's
inference from being a certainty.

### 4.4 No live environment files anywhere

Every Flutter location holds **only** `.env.*.example` templates:

```
.env.example  .env.dev.example  .env.staging.example  .env.prod.example
```

with placeholder values only:

```
SUPABASE_URL=https://dev-project-ref.supabase.co      (.env.dev.example)
SUPABASE_URL=https://staging-project-ref.supabase.co  (.env.staging.example)
SUPABASE_URL=https://prod-project-ref.supabase.co     (.env.prod.example)
```

No `.env.prod`, `.env.dev` or `.env.staging` exists on disk in any copy. **CONFIRMED: no live Flutter
production configuration exists on this workstation.**

### 4.5 What the Flutter owner must supply — OWNER ACTION

1. The **canonical repository.** Five locations exist; only `~/Desktop/BookMySpace` is a git repo
   with a remote. Confirm it is authoritative and archive/delete the three untracked Downloads
   copies and the zip so recovery work cannot target a stale tree.
2. The **production `SUPABASE_URL` / project ref** actually baked into the shipped release artifact.
   Not recoverable from source — injected at build time.
3. The **`APP_ENV`/`--dart-define` values used for the current release build**, and where the release
   artifacts and build logs are stored.
4. **Which Supabase account owns `zykxneztahxbjduagutv`**, and whether it still exists.
5. Whether the Flutter production database is the **same** project as React's production database
   (the D2 question, still open).

---

## 5. Application-to-project mapping

| Application | Environment | Project ref | Region | Evidence | Label |
| --- | --- | --- | --- | --- | --- |
| React (customer app + admin portal) | development | `obkfgxjzlscungkhbyvq` | South Asia (Mumbai) | `.env`/`.env.local`/`.env.example`, 18 URL + 3 ID occurrences | CONFIRMED |
| React | retired dev | `sfoizxarbljhldmkgsma` | Mumbai | `.env.local.mumbai`, 2 key-rotation backups, `.env.save` | CONFIRMED |
| React | legacy dev | `ezrxykyocgbolpaebnqx` | North EU (Stockholm) | `.env.local.stockholm`, D7 (must remain untouched) | CONFIRMED |
| React | **production** | **—** | **—** | 0 occurrences in repo; 0 projects in account; deployment templates placeholders | **UNRESOLVED** |
| Flutter (Desktop repo) | development | not committed (`--dart-define`) | — | `app_config.dart` `String.fromEnvironment` | CONFIRMED-by-design |
| Flutter (Downloads copies) | development | `zykxneztahxbjduagutv` | unknown | hardcoded in Kotlin `AppConfig.kt`; self-labelled "bookmyspace-dev" | CONFIRMED but **outside account** |
| Flutter | staging | `staging-project-ref` (placeholder) | — | `.env.staging.example` | UNRESOLVED |
| Flutter | **production** | **`prod-project-ref` (placeholder)** | **—** | `.env.prod.example` | **UNRESOLVED** |

**Cross-application sharing:**
- At **development** level they are provably **separate**: React uses `obkfgxjzlscungkhbyvq`, Flutter
  uses `zykxneztahxbjduagutv`. Two different databases.
- At **production** level **sharing cannot be determined**, because neither side's production ref
  exists. The question is not answerable from any artifact on this workstation.

---

## 6. Recovery architecture comparison

Two architectures are prepared. **Neither is selected**: §3.7 leaves production identity unresolved,
and §4.1 leaves Flutter's production ref unresolved. Selecting one now would be an assumption.

### Architecture A — shared production project

Flutter and React both point at one production Supabase project.

**Backup scope.** One project, one backup series, one encryption recipient, one archive set. Exactly
the model Gate G's command already implements — one `pg_dump`, one `BOS_APPROVED_REF`, one restore
target. Flutter requires **no additional backup script**; it is covered automatically.

**Migration scope.** This is the hardest part. Two independent lineages must coexist in one database:

| Lineage | Files | Naming | State |
| --- | --- | --- | --- |
| React | 81 | `20261112050000_*.sql` (timestamped) | 73 applied / 8 pending on dev |
| Flutter | 16 (+1 stub, 3 tests) | `0001_*.sql` … `0016_*.sql` (sequential) | unknown applied state |

They were authored independently with no shared ledger, and both create `users`/`roles`, venues,
availability, bookings, payments and RLS policies (`0001_users_roles_organizations.sql`,
`0002_venues.sql`, `0005_rls_policies.sql` vs the React equivalents). Merging them needs a real
reconciliation migration — object-by-object, policy-by-policy — not a concatenation. Gate C already
established that policy sets in this domain are sensitive (the `venue_images_owner_*` reversal), so
a naive merge risks silently widening RLS.

**Restore sequence.** Single-project restore is the clean one: decrypt archive → `pg_restore` into
a fresh project → apply the reconciled post-snapshot migrations → verify. One dump covers both apps,
so neither app can be "restored" independently of the other's schema — which means a Flutter-only
rollback is impossible and a React-only rollback is impossible.

**Data consistency risks.** Shared tables under two writers. A Flutter release that runs its own
migrations against shared tables can break React in the same instant, and React's next deploy can
break Flutter. Blast radius = both apps. Single point of RLS regression. Conversely, referential
integrity across the two apps' data is automatic — no cross-database inconsistency is possible.

**Recovery validation.** One drill validates both apps. Acceptance: 74 public tables, 179 public
functions, 18 private functions, 141 policies, 3 private buckets, 7 storage policies, 8 profiles,
8 auth users, 2 storage objects (148,357 B), ledger 74 rows max `20261108150000`. A single restore
either meets or misses all of it.

**Cost and storage.** One project's compute and disk. Pro disk 8 GB included, then $0.125/GB; Micro
≈$0.01344/h ≈ $10/mo. Archives ≈1.5–3 MB compressed each (newest verifiable 1.2 MB) → 30 days
≈45–90 MB, negligible. Verified clone for a drill: ≈$0.32 per 24 h, ≈$2.26 per 7 d. **Cheapest
architecture to run and to rehearse.**

### Architecture B — separate production projects

Flutter and React each have their own production Supabase project.

**Backup scope.** Two projects ⇒ two backup series ⇒ **two independent archive sets**, and the
existing tooling only handles one target at a time (`react-target.conf` pins a single
`BOS_APPROVED_REF`). Gate G's script must be parameterised and run twice, with two approval flags,
two ref confirmations, and archive directories that cannot be confused. Two restore targets, two
verification baselines, two chances to restore the wrong ref. The gate guard would need a second
approved-ref entry — a change to a safety-critical file, which is why it must not be improvised.

**Migration scope.** Cleanly partitioned, and this is B's real advantage: each lineage owns its
database. React's 81 files stay React's; Flutter's 16 stay Flutter's; the 8 pending React migrations
are applied against React only. No reconciliation migration, no shared-ledger problem, no risk of one
app's migration widening the other's RLS.

**Restore sequence.** Two fully independent sequences that can be run in either order, in parallel,
or one without the other. Partial recovery becomes possible: restore React only, or Flutter only.
Each sequence is identical to the current single-project procedure.

**Data consistency risks.** Cross-project referential integrity is impossible. If any data is shared
in practice today — a user identity that exists in both, an owner who lists venues through one app
and books through the other, a booking referenced from both sides, Razorpay settlements reconciled in
one and charged in the other — then a restore of one project produces permanent cross-database
inconsistency that no constraint will catch. **The size of this risk is unknown**, because nobody has
established whether the two apps currently share rows. Both apps integrate Razorpay
(`RAZORPAY_KEY_ID`/`WEBHOOK_SECRET` in both env templates), which is the most likely coupling point
and the most damaging one to split.

**Recovery validation.** Two baselines must be captured and maintained independently. A drill proves
one app at a time; a "restore both" drill is really two drills. More work, but each result is
unambiguous about which app it proves.

**Cost and storage.** Two projects: roughly double the compute floor (≈$20/mo at Micro rates) plus a
second disk allowance, and two archive sets ≈90–180 MB/30 days. Two clones to rehearse simultaneously
≈$0.64/24 h. Rehearsal cost is still small in absolute terms; the operational cost is the real
difference.

### Comparison summary

| Dimension | A — shared | B — separate |
| --- | --- | --- |
| Backup series to operate | 1 | 2 (tooling change required) |
| Migration reconciliation | **Required, high risk** | Not required |
| Restore independence | None | Full |
| Cross-app referential integrity | Guaranteed | **Broken if data is shared** |
| RLS blast radius | Both apps at once | One app |
| Drill cost | ≈$0.32/24 h | ≈$0.64/24 h |
| Steady-state cost | ≈$10/mo | ≈$20/mo |
| Wrong-target restore risk | Single ref, low | **Two refs, materially higher** |
| Blocked by | Flutter prod ref + React prod ref | Flutter prod ref + React prod ref |

**Neither architecture is selected.** Both are blocked by the same two unknowns (§3.7, §4.1), and A's
decisive risk (IRL reconciliation cost) versus B's (cross-project data splitting) can only be weighed
once the owner states whether the two apps share production data — the D2 question.

---

## 7. Backup readiness

Revalidated read-only; nothing executed.

| Check | Result | Label |
| --- | --- | --- |
| Canonical keyring present | `backup-gnupg-recovery-20261106` | PASS |
| Keyring permissions | `drwx------` | PASS |
| Keyring location | outside repo and outside backup root | PASS |
| Recipient resolves | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` | PASS |
| Secret key present | yes | PASS |
| Encryption capability | `ecEC`, ciphertext produced (512 B) | PASS |
| Decryption | not exercised (non-interactive) | **UNRESOLVED** |
| Key expiry | 2028-11-05 | WARN (rotation planned) |
| Guard, unauthenticated | exit **3** — "REFUSED: … requires explicit backup-only authorisation … No connection was attempted." | PASS (fails closed) |
| Guard, authorised `GUARD_ONLY=1` | exit **0** — "GUARDS PASS: Keychain/environment credential loaded in memory, backup-only approval and exact ref verified, no connection attempted." | PASS |
| Target verification | `ref=obkfgxjzlscungkhbyvq via=pooler host=aws-0-ap-south-1.pooler.supabase.com port=5432 db=postgres password_present=yes` | PASS |
| SSL note | "no sslmode in the URL; export PGSSLMODE=require before connecting" | PASS (handled) |
| Production ref confirmation | works for the dev ref; **no production ref exists to confirm** | **BLOCKED** |
| Backup destination | `~/BookOurSpace_Backups/react`, `drwx------`, 17 entries, 11 MiB | PASS |
| Newest local archive | `obkfgxjzlscungkhbyvq-20261110T041600Z`, age **342 h** | WARN (stale) |
| Hosted backups | 8 × PHYSICAL COMPLETED, 2026-11-17 → 2026-11-24 | PASS |
| Free disk | **9,618 MiB** (99 % used) vs ≈2.2 GiB needed | PASS (tight) |

**Backup readiness for the *development* project: GO.** Every gate passes; the only skip is
decryption, which needs the owner's terminal.

**Backup readiness for *production*: cannot be assessed** — there is no production project to back
up, and `BOS_PROD_REF_CONFIRM` has no valid value. The prepared Gate G §2.7 command targets
`obkfgxjzlscungkhbyvq` and must not be repurposed for production once one is named: it requires a
fresh owner approval and a fresh target confirmation.

No credential value was printed this gate. The Keychain URI was loaded in memory by the script and
reported only as `password_present=yes`; all psql-style output masking rules were respected.

---

## 8. Remaining owner decisions

No approval is inferred. Every item below is the owner's to grant.

| # | Decision | Status | Blocks |
| --- | --- | --- | --- |
| **A1** | Execute the production backup (Gate G §2.7) | **NOT APPROVED** | Any restore drill |
| **A2** | Run the local restore rehearsal | **NOT APPROVED** | Recoverability proof |
| **A3** | Reconcile the 8 pending migrations | **NOT APPROVED** | Schema parity with ledger |
| **A4** | Paid hosted clone (≈$0.32/24 h) | **NOT APPROVED** | Real restore validation |
| **A5** | Merge/reconcile Flutter + React migration lineages | **NOT APPROVED** | Architecture A only |
| **A6** | Deployment of any kind | **NOT APPROVED** | Go-live |
| **D1** | **Production project ref, region, and whether it exists yet** | **AWAITING OWNER** | Everything production |
| **D2** | Does the Flutter app share React's production database? | **AWAITING OWNER** | Architecture choice |
| **D5** | Which Flutter repo is canonical; which account owns `zykxneztahxbjduagutv`; the Flutter **production** ref | **AWAITING OWNER** | Flutter recoverability |
| **D6** | Run the interactive GPG test in your own terminal (§2.6) | **AWAITING OWNER** | Decryption proof |

D1 must be answered before A1–A5 can even be scoped correctly: backing up the development project and
calling it a production backup would be a false assurance, which is precisely the failure mode the
B → H gates exist to prevent.

---

## 9. GO/NO-GO verdict

### GO
- **Encryption (write path):** GO — canonical recipient `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A`
  encrypts successfully from the correct keyring, verified this gate.
- **Backup readiness for the development project:** GO — guard fails closed unauthenticated, passes
  authorised, target verified, destination writable, 9,618 MiB free.
- **Flutter repository *location*:** GO — `~/Desktop/BookMySpace` @ `main` / `fc35976` identified with
  a remote, a clean tree and a self-consistent fail-closed Supabase config.

### NO-GO
- **Production recovery:** NO-GO. Production identity is **UNRESOLVED** across six independent
  sources. No production project exists in the connected account, no unknown ref exists in the repo,
  no production deployment record exists, and no other project has ever been backed up. Per the
  brief: production recovery readiness is **not** claimed while production identity remains
  unresolved.
- **Decryption / restore capability:** NO-GO — never exercised (§2.4).
- **Flutter recoverability:** NO-GO — production ref is a build-time define, absent from every
  artifact on this workstation; the fourth ref is outside the account.
- **Migration readiness:** NO-GO — 8 pending on React; Flutter's applied state unknown; the two
  lineages are unreconciled §6.
- **Architecture selection:** NO-GO — A and B are prepared and compared but **not selected**.

### The single sentence that matters

The encryption half of this gate **passed**: the owner's key is the right key, in the right keyring,
and it produces real ciphertext. The discovery half **failed**, and failed cleanly enough to be
informative: three gates of searching now converge on the conclusion that **no production Supabase
project exists yet** — so the remaining risk is not "we cannot find production", it is "production
was never provisioned", and the recovery plan must be rewritten as *provision → migrate → verify*
rather than *restore → verify* once the owner confirms D1.

### Recommended next actions, in order

1. Owner runs the interactive GPG command in §2.6 (closes decryption; no approval needed beyond
   owning the passphrase).
2. Owner answers **D1** — the production ref, its region, and whether it exists today.
3. Owner answers **D5** — canonical Flutter repo, and the Flutter production ref.
4. Owner answers **D2** — shared or separate production database, which selects A or B.
5. Only then request **A1** against the confirmed production ref (not the dev project).

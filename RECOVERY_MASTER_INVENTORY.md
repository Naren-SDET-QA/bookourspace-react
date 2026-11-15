# RECOVERY MASTER INVENTORY

Generated: 2026-11-15 · Canonical target: `Naren-SDET-QA/bookourspace-react` · Canonical checkout: `/Users/aa/Projects/bookourspace-final`

All entries below were established from live `git`/`rg` evidence, not from commit messages alone.
**Nothing has been merged, reset, cleaned, pushed or deployed.** No application tests have been run yet.

---

## 1. Source census

| Location | Branch @ HEAD | Dirty | TypeScript/SQL files | Size | Notes |
|---|---|---|---|---|---|
| `/Users/aa/Projects/bookourspace-final` | `dev` @ `b6223f5` | **62** (51 M + 11 ??) | 697 | 8.1 G | **Canonical. Feature-richest working tree + uncommitted work** |
| `/Users/aa/Downloads/bookourspace-react` | `feat/universal-gps-tracking` @ `96c1297` | 0 | 2905 (incl. 14 worktrees) | 4.3 G | Holds every branch/object; 2 stashes |
| `/Users/aa/Documents/ChatGPT/react` | `main` @ `6dfecbf` | 0 | 505 | 2.8 G | Clean mirror of rewritten `origin/main` |
| `/Users/aa/Projects/bookourspace-aistudio` | `codex/prepare-aistudio` @ `9aec495` | — | — | — | Old AI Studio export (wa=28, gps=2) |
| `/Users/aa/Downloads/bookourspace-codex` | `feat/codex-work` @ `0da14b4` | — | — | — | Stale checkpoint (wa=15, gps=0) |
| `/Users/aa/Downloads/bookourspace-freebuff` | `feat/freebuff-work` @ `83ed2cc` | — | — | — | Stale (Oct 31), in sync with remote |
| `/Users/aa/Downloads/bookourspace-kilo` | `feat/kilo-work` @ `83ed2cc` | — | — | — | Duplicate of `freebuff` ref |
| `/Users/aa/Downloads/bookourspace-opencode` | `feat/opencode-work` @ `83ed2cc` | — | — | — | Duplicate of `freebuff` ref |
| `/Users/aa/Downloads/bookourspace-react-capacitor` | `codex/capacitor-mobile` @ `f7c9cd3` | — | — | — | Capacitor native work |
| `/Users/aa/Downloads/bookourspace-react-classes-wt` | `fix/classes-anon-public-batches` @ `e8151ee` | — | — | — | Already merged to `main` |
| `~/Documents/BookMyspace_Andriod` | none (Flutter/Dart) | — | — | — | Separate Android reference app — not part of this React repo |
| `~/Downloads/*.zip` (~25 archives) | none | — | — | — | Snapshots; superseded by git refs |

Environment files present and untouched: `/Users/aa/Projects/bookourspace-final/.env.local` (mode `600`). Values never read, printed or copied into this report.

---

## 2. Feature inventory

| Feature | Source folder | Branch / commit | Key files | Status | Missing dependency |
|---|---|---|---|---|---|
| **WhatsApp integration** | canonical | `dev` @ `b6223f5` | `server.ts:82,4999`; `src/server/evolutionWhatsApp.ts`; `src/server/whatsappFaq.ts`; deep links in 39 components | Implemented + wired server-side, **unverified** | `EVOLUTION_*` env + webhook URL must be set |
| **Resend email** | canonical | `dev` @ `b6223f5` | `src/server/resendEmail.ts`; `src/server/bookingNotificationEmails.ts`; `server.ts:79,649,2626` | Implemented, dev test API registered, **unverified** | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_DEV_TEST_RECIPIENT` |
| **Universal GPS tracking** | canonical | `dev` @ `b6223f5` | `src/hooks/useDeviceLocation.ts`; `src/lib/currentLocation.ts` (+ test); `src/hooks/useDeliveryTracking.ts`; `src/components/tracking/{HelperTrackingPublisher,DeliveryTrackingMap,DeliveryTrackingPanel}.tsx` | Implemented, consumed by `HelperTrackingPublisher`, **unverified** | Browser/Capacitor geolocation permission |
| **Provider portal** | canonical | `dev` @ `4fe09d1`, `fb28b74`, `977baf5` | `ProviderPortalShell.tsx` (used by `ProviderDashboard.tsx:28,340`), `ServicesProviderDashboard`, `InstituteOwnerDashboard`, `StaysOwnerAdminDashboard`, `PgProviderWorkspace`, `pg/BusinessCreatePanel` | Implemented + wired into provider dashboard, **unverified** | Provider membership rows + `provider_portal_membership_guard` migration |
| **Customer login / OTP / Google** | canonical, **uncommitted** | `dev` working tree | `CustomerLoginExperience.tsx` (**?? untracked**), `src/lib/googleSignIn.ts` (**??**), `SimpleLoginPage.tsx` (M), `VerifiedPhoneReveal.tsx` (M), `emailOtpClient.ts` (M), routes `server.ts:2703,2731,2769` | **Implemented but uncommitted — highest loss risk** | `GOOGLE_*` OAuth client, Resend for OTP delivery |
| **Admin console** | canonical | `dev` @ `b6223f5` (teal recolour) | `AdminDashboard`, `AdminIntegrationsSection`, `SuperAdminControlHub`, `SupremeAdminControlPanel`, `src/server/adminAuthorization.ts` | Implemented + wired, **unverified** | Super-admin role rows |
| **Permission system v2** | canonical | `dev` @ `a1a81a8`…`3527075` | migrations `20261113000000`…`20261114120000`; `customerPermissions.ts`, `memberAccess.ts`, `moduleGate.ts` | Implemented as migrations + middleware, **unverified** | Migrations must be applied in order |
| **Marketplace modules** (PG, Hotels/Stays, Services, Institutes, Classes, Movies) | canonical | `dev` @ `b6223f5` | `PGDekhoExperience`, `PGSectionExperience`, `HotelsStayExperience`, `HomeServicesSection`, `ClassesTimingsExperience`, `MoviesShowtimes`, 200+ components | Implemented + wired, **unverified** | Module grants seeded |
| **Business ownership module** | `feat/universal-gps-tracking` | `96c1297` (also `9c4551a` on `main`) | phase 1–5 migrations + `businessApi.ts`, `business-creation` bounds | Implemented, **not on `dev`** | Conflicts with `dev` permission migrations |
| **Database migrations** | all | `dev` 118 / `main` 106 / `96c1297` 81 | `supabase/migrations/` | **Needs reconciliation** | Ordered, non-conflicting single set |
| **CI + class/PG E2E hardening** | `main` only | `8f0b3e2`…`1302c19`, PR #5 | `.github/workflows`, `e2e/` | Implemented, absent from `dev` | — |

---

## 3. Duplicates and conflicts

1. **`movies-upi-payment/` — 111 files, 15 MB vendored copy of the entire app inside the repo.** Duplicate implementation; must be retired after confirming no imports resolve to it.
2. **Four branches at near-identical old trees:** `feat/freebuff-work`, `feat/kilo-work`, `feat/opencode-work` all point to `83ed2cc`; `feat/codex-work` at `0da14b4`. All are Oct 31 snapshots (wa=15, gps=0) — **stale, superseded by `dev`**.
3. **`feat/universal-gps-tracking` (`96c1297`) vs `dev`:** branch carries business-ownership phase 1–5 migrations but only 81 migrations total, versus `dev`'s 118 — it is *behind* on schema while *ahead* on business ownership.
4. **Uncollected work:** stash `final-dev merge` (6 606-line patch), stash `checkpoint before image-loading fix` (3 064-line patch) in the Downloads clone; stash `pre-sync WIP 2026-11-13` in canonical.
5. **Orphaned-but-preserved commits:** `ed1731e` (pre-author-rewrite tip) exists only in the Downloads clone object DB.

---

## 4. Git topology (why features look "missing")

* `main` (`6dfecbf`, rewritten) and `dev` (`b6223f5`) **share no ancestry** — neither is an ancestor of the other: **98 commits unique to `main`, 150 unique to `dev`**.
* Only on `main`: business-ownership architecture (`9c4551a`, `e407941`, `4346ebb`, `1f5c0fb`), provider operations dashboards (`572d82a`), image-reload PR #5, CI and class/PG E2E stabilisation.
* Only on `dev`: teal admin recolour (`b6223f5`), provider shell rebuild (`4fe09d1`), permission system v2, business-creation RLS close (`27608cd`), Services access fix (`3230675`).
* Canonical local `main` (`27608cd`) reads as "1 ahead" of `origin/main` only because the rewrite dropped it — **it is already contained in `dev`**, so nothing is lost.
* `origin/main` was force-pushed (`3230675` → `6dfecbf`); old tip preserved on `origin/backup/main-before-author-rewrite`.

**Conclusion: no feature is truly lost. The work is split across two divergent lines plus 62 uncommitted files.**

---

## 5. Backups created (Phase 3)

Directory: `/Users/aa/Projects/bookourspace-recovery-2026-11-15/`

| Artifact | Contents |
|---|---|
| `downloads-clone-all-refs.bundle` (37 MB) | Every branch, remote ref, tag + `refs/stash` |
| `canonical-all-refs.bundle` (20 MB) | Canonical branches incl. superseded local `main` |
| `stash0-final-dev-merge.patch` | 6 606 lines |
| `stash1-image-loading.patch` | 3 064 lines |
| `canonical-uncommitted-tracked.patch` | 6 247 lines / 512 KB — the 51 modified files |
| `canonical-untracked-files.tgz` | 12 entries / 272 KB — new components, theme, migration, tests |
| `refs/recovery/wip-20261115` = `a71c7c7` | In-repo checkpoint commit of tracked WIP (52 files, +1442/−1191); **working tree left untouched** |

Recovery: `git bundle verify <file>` then `git fetch <file> 'refs/*:refs/recovered/*'`.

---

## 6. Consolidation plan (not yet executed)

1. **Freeze** — commit the 62 canonical files on `recovery/wip-20261115` so nothing depends on a dirty tree.
2. **Choose the base** — `dev` (`b6223f5`) holds newest WhatsApp/Resend/GPS/permissions/UI; `main` holds business ownership + CI + image fixes.
3. **Merge `origin/main` into an integration branch off `dev`** — expect conflicts in `server.ts`, `AdminDashboard.tsx`, `ProviderDashboard.tsx`, `src/modules/registry.ts`, `index.css`.
4. **Fold in `96c1297`** business-ownership migrations, or drop them if `dev`'s `20261113*`/`20261114*` set supersedes them.
5. **Retire `movies-upi-payment/`** and the four stale `83ed2cc`/`0da14b4` branches.
6. **Reconcile migrations** into one ordered set (118 + 106 + 81 → one chain), then apply to a local DB.
7. **Verify**: `tsc --noEmit`, `vite build`, `npm test`, module E2E, and per-feature entry points. No real WhatsApp/email sends — test recipients only.
8. **Push** only after all of the above, and only on explicit approval.

## 7. Phase 4 execution log (integration branch)

Branch: `integration/recover-20261115` (local only — **not pushed**)

| Step | Commit | Result |
|---|---|---|
| Freeze 62 uncommitted files | `76945cf` | 63 files, +3006/−1191 (excludes `e2e-artifacts/`) |
| Reattach rewritten `main` | `5b136bc` (`refs/recovery/main-reattached`) | `-s ours` graft onto fork point `48b2040`; tree identical to `origin/main` |
| Merge `main` into `dev` | `2a774b6` | 29 conflicts resolved, 36 files auto-merged |
| Movies migration correction | `a56e82b` | dev's grandfathering variant restored; manifest regenerated |

**Why the graft was required:** the author rewrite gave `main` commits with no shared ancestry, so git refused the merge as unrelated histories. The naive base (`3230675`, old main tip) would have applied **247 deletions**, including every GPS tracking component, because `main` forked *before* those 282 files existed. `48b2040` is content-identical to main's real fork point and is already an ancestor of `dev`, so the merge diffed only main's true 121-file business-ownership delta.

**Conflict resolution rules applied:**
- `dev` won every UI/branding conflict — they were almost entirely the teal token migration (`brand-teal-deep`) versus main's older indigo literals (`#527a40`, `#2554db`).
- `dev` won `businessAccess.ts`, `businessClient.ts`, `businessApi.ts`, `serviceDispatchApi.ts` — verified as supersets: identical endpoint lists, plus `allowed_actions` persistence and the action-grant permission system that main predates.
- `main` won the newer product rules it owns (`sectionStyleSettings` style retirement, business rollback runbook, business tests).
- Generated files (`MIGRATION_MANIFEST.json`, `migrations.sha256`) were regenerated, never hand-merged: **119 migrations, unique versions, checksums verified**.

**Verification actually run:**

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npm run build` (vite) | **exit 0**, 1.02 s |
| `npm test` full suite | 640 tests, 572 pass, 37 fail (run *before* the migration fix) |
| Focused re-run after fix | `movies-schema-compat` now passes; 3 failures remain |
| Conflict markers in tree | 0 |
| Migration manifest verify | PASS |

**The 3 remaining failures are pre-existing, not merge damage** — each assertion was already unsatisfied on the frozen `dev` tree (`76945cf`) before the merge:

| Failing assertion | Pre-merge evidence |
|---|---|
| `provider APIs require server-verified business context` | `76945cf:server.ts` has no `BUSINESS_CONTEXT_REQUIRED` (dev returns `BUSINESS_ACCESS_DENIED`); dev's own test already expected it |
| `Provider Portal exposes a business switcher` | `76945cf:ProviderDashboard.tsx` has no `Select business`; main's does |
| `admin style panel locks PG and Classes` | `76945cf:AdminDashboard.tsx` has no `PG and Classes are locked to Style 3` |

These are the concrete remaining integration gaps: main's business-context error code and business switcher were never ported into dev's newer provider shell.

## 8. Explicitly unverified

Every "Implemented" status above is a **code-level** finding unless listed in the Phase 4 log. No E2E/Playwright run, no live WhatsApp or Resend send, no GPS entry point driven in a browser, and no authenticated provider/customer/admin journey has been exercised. Nothing has been pushed, merged to `main`, or deployed.

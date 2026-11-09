# BookOurSpace — Final Universal Consolidation (local)

Date: 2026-11-07 · Main repo: `/Users/aa/Downloads/bookourspace-react`
Branch: `feat/module-flags-and-stay-inventory` (HEAD `39946a1` + uncommitted consolidation changes)
Mode: local only. No hosted DB changes, migrations, payments, push, merge or deployment were performed.

## 1. Repository inventory

| Path | Type | Branch / HEAD | Dirty | src | migrations | tests | Verdict |
|---|---|---|---|---|---|---|---|
| `bookourspace-react` | main repo | `feat/module-flags-and-stay-inventory` / `39946a1` | 62 | 262 | 67 | 66 | **Source of truth** |
| `bookourspace-react-capacitor` | worktree | `codex/capacitor-mobile` / `a67cbec` | 465 | — | mirrored | mirrored | Native shells + synced source; behind main by 10 commits |
| `bookourspace-react-classes-wt` | worktree | `fix/classes-anon-public-batches` / `a67cbec` | 292 | — | mirrored | mirrored | Dirty tree is superseded app-wide work, no unique class feature |
| `bookourspace-codex` | worktree | `feat/codex-work` / `83ed2cc` | 25 | — | untracked | untracked | Experiment; 3 unique modules, unverified — not merged |
| `bookourspace-freebuff` | worktree | `feat/freebuff-work` / `83ed2cc` | 0 | — | — | — | No unique content |
| `bookourspace-kilo` | worktree | `feat/kilo-work` / `83ed2cc` | 0 | — | — | — | No unique content |
| `bookourspace-opencode` | worktree | `feat/opencode-work` / `83ed2cc` | 0 | — | — | — | No unique content |
| `bookourspace-movies-upi` | repo copy | `feat/movies-upi-payment` / `4526d11` | 1 | — | 0 | 0 | Adds `movies-upi-payment/` copy; main already has the full movie UPI flow |
| `bookmyspace*`, `universal-services-*` (Downloads) | archive copies | none | — | — | — | — | Older AI Studio exports; no unique feature |

Main is 10 commits ahead of the shared base `83ed2cc`; every other repo/worktree is at or behind that base, so no branch has a newer implementation of the six modules.

## 2. Feature parity matrix

| Module | Discovery | Detail | Availability | Booking | Payment | Cancel/Refund | Category style | Admin control | Status |
|---|---|---|---|---|---|---|---|---|---|
| PG / Hostels | PASS | PASS | PASS | PASS | PASS (PG APIs) | PASS | PG 1 / PG 2 | Module flags, categories | PASS |
| Classes | PASS | PASS | Batch seats | PASS (enrollment) | Provider-confirmed | Server policy | **Cards / Compact (new)** | Module flags, batch review | PASS (style = density variant) |
| Venues | PASS | PASS | Calendar | PASS | PASS (venue payments) | PASS | **Showcase / List (new)** | Module flags, venue workspace | PASS (style = layout variant) |
| Home Services | PASS | PASS | Slots | PASS | PASS | PASS | Services 1 / 2 / Noddyy | Module flags | PASS |
| Hotels / Stays | PASS | PASS | Holds/units | PASS | Razorpay/UPI/Pay-at-hotel | PASS | Stay 1 / Airbnb | Module flags, stay inventory | PASS |
| Movies | PASS | PASS | Shows/seats | PASS | PASS (UPI + intents) | PASS | **Booking Experience / Classic Grid (new)** | Module flags | PASS |

Routes and journeys were verified against the existing suites; no fake payment success is produced anywhere.

## 3. Admin controls

- **Platform availability:** `AdminPlatformModuleSettings` toggles per-module visibility, owner contact and online booking (PostgreSQL `platform_module_flags`, server `moduleGate`).
- **Sections/routes:** Live Page Editor controls section visibility/order and page labels; Spotlight Subcategories toggle per section for all six modules.
- **Categories:** Admin Marketplace Listings + Venue admin workspace add/edit/deactivate categories and subcategories.
- **Category display styles (new, verified in the browser):** Super Admin → Admin Console → Overview → “BookOurSpace section display styles” now exposes all six:
  - PG: PG 1 / PG 2
  - Stay: Stay 1 / Stay 2
  - Services: Services 1 / Services 2 / Noddyy
  - Classes: Cards / Compact
  - Venues: Showcase / List
  - Movies: Booking Experience / Classic Grid
  - Stored in `bos_section_styles_v2`, broadcast via `SECTION_STYLES_EVENT`; applied through `data-bos-category-style`.
- **Inline editing:** Admin sees “Edit page” on every public page, edits any element, and publishes to PostgreSQL (`platform_live_page_config`) for all visitors (20s poll + event).
- **Admin deep link:** `/#admin` survives hydration; leaving the console clears the hash so the admin can browse the marketplace until they toggle back. Verified: 14 console tabs and the six style rows render.
- **Simple login page:** `/#login` offers Google, email lookup and local Customer/Admin buttons; the header Google entry point still opens the verified modal so the Google-only E2E contract is unchanged.

## 4. Repository comparison findings

| Finding | Detail | Action |
|---|---|---|
| Movies UPI duplicate | `bookourspace-movies-upi` commit adds a standalone copy of the app; main’s `DistrictMoviesSection` already has the 5-step flow, seat holds, UPI intent/UTR verification and refunds | Not merged — duplicate |
| Codex unique modules | `src/shared/marketSectionVisibility.ts`, `src/server/googleIdTokenVerifier.ts`, `src/lib/supabaseProjectConfig.ts` — unverified experiments based on an older base | Not merged — needs review/tests before adoption |
| Classes worktree | Branch name suggests an anon-batches fix, but the dirty tree is a broad superseded copy; no unique class source file | Not merged |
| Capacitor worktree | Native Android/iOS shells, 465 dirty entries (platform files + synced web assets); source is 10 commits behind main | Native parity needs a controlled re-sync, not a blind overwrite |
| Archive copies | `bookmyspace*`, `universal-services-*` are older AI Studio exports | Ignored |

## 5. Implemented in this consolidation

- Added Classes, Venues and Movies to the category-style model, defaults, normalizer, getters, admin selectors and runtime application.
- Movies style drives the existing classic-grid vs booking-experience surface.
- Classes “Compact” and Venues “List” apply scoped CSS density/layout variants while preserving the existing designs.
- Documented the remaining true gaps below instead of inventing parity.

## 6. Gaps and blocks (honest)

| Item | Status | Why |
|---|---|---|
| Full alternate designs for Classes/Venues | PARTIAL | Only density/layout variants were added; no second full design exists to select |
| Shared-location E2E | PASS (rerun) | Failed once in the full run; passed alone and in the affected rerun |
| Codex modules (Google ID-token verifier, section visibility, Supabase project resolver) | NOT MERGED | Unreviewed, untested experiments from an older branch; merging would risk auth/security regressions |
| Native Android/iOS end-to-end | BLOCKED | No running emulator/simulator in this session; Capacitor source is behind main |
| Hosted Mumbai DB / migrations / payments / deployment | BLOCKED | Explicit no-hosted-change / no-deploy rule; requires owner approval and recovery verification |
| Live editor media uploads | BLOCKED BY DESIGN | Server rejects inline `data:` media; approved hosted object URLs required |
| Google-only production login verification | PARTIAL | Code verified, hosted OAuth/deployment verification needs hosted access |

## 7. Test evidence

| Suite | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS |
| Production build | `npm run build` | PASS |
| Unit/API | `npm test` | 305 tests, 288 pass, 0 fail, 17 skipped |
| Browser E2E (full) | `npx playwright test --project=chromium` | 89 passed, 4 failed, 23 skipped (9.2m); failures were the header sign-in entry point and a shared-location flake |
| Browser E2E (affected rerun) | auth + shared-location specs | **19/19 PASS** after restoring the modal entry point |
| Migration manifest | `node supabase/tests/migration_manifest.mjs` (main + Capacitor) | PASS — 67 migrations, unique versions, sha256 match |
| Duplicate routes | `npm run audit:duplicates` | 3 shadowed routes, all DB-vs-JSON fallbacks (platformSettings vs server.ts); not competing implementations |
| Admin console | browser: `#admin` | 14 tabs; style block shows all six categories |
| Category styles | browser: set Classes = Compact | stored `bos_section_styles_v2` includes `classes:"compact"`; `[data-bos-category-style="classes-compact"]` present on `#classes` |
| Database suites | `npm run test:db*` | BLOCKED — require disposable DB orchestration/approval |
| Native | Android/iOS | BLOCKED — no running devices |

## 8. Approvals required before shipping

1. Review and approve the category-style changes (UI only).
2. Decide whether to adopt any Codex module after a security review.
3. Approve a controlled Capacitor re-sync + native E2E run.
4. Approve any hosted migration/payment/deployment work separately.


## 9. Continuation — second pass

### Distinct category designs (not density variants)

- **Classes — Timetable:** a real weekly schedule (Mon–Sun columns, batch slots, provider and fee, click to open/enroll), selected via Super Admin → Classes = **Timetable**. `Cards` remains the default.
- **Venues — Agenda List:** a full-width venue agenda (large image, area, capacity, rating, price, single action) rendered instead of the card grid, selected via Venues = **Agenda List**.
- Both are driven by the centrally published configuration and verified for a signed-out guest (`classes-timetable` attribute + “Weekly timetable”; “Venue agenda”).

### Central, server-authorized controls

| Control | Storage | Authorization | Local fallback |
|---|---|---|---|
| Module visibility/booking | `platform_module_flags` | Admin session + RLS/API | none (DB authoritative) |
| Section visibility/labels | `platform_live_page_config` | Admin session; `/api/live-page-config/publish` | last local cache |
| Category visibility | Category/listing APIs | Admin/provider role | none |
| UI styles (all six) | `platform_live_page_config.sectionStyles` | `POST /api/live-page-config/section-styles` (admin) | localStorage cache for dev/offline only |
| Routes | Module flags + hash routes | Server module gate | none |

Verified: `POST /api/live-page-config/section-styles` returned 200 with a new published version; the public `GET /api/live-page-config` returned `{classes:"timetable", venues:"agenda", movies:"classic"}` and a guest received those designs.

### Capacitor synchronization

- Backed up web source + configs to `/tmp/bos-capacitor-backup-20261107-235306.tar.gz` (4.2 MB) and native configs to `/tmp/bos-capacitor-native-configs.tar.gz`; captured the pre-sync 465-file status at `/tmp/capacitor-status-before.txt`.
- Synced only web source (`src`, `public`, `supabase`, `tests`, `e2e`, `scripts`, package/config files). **`android/` and `ios/` were not touched**; the two platform dirty entries that existed before remain and no native files were regenerated.
- Capacitor typecheck PASS and web build PASS after sync. `cap sync` was intentionally not run (it rewrites platform assets) — requires approval.

### Codex module audit

| Module | Finding | Decision |
|---|---|---|
| `marketSectionVisibility.ts` | Pure, safe normalizer for six sections; duplicates existing module-flag gating | Not integrated (redundant) |
| `googleIdTokenVerifier.ts` | Sound RS256/JWKS/claims checks; would create a second Google auth path beside Supabase | Not integrated (security surface; Supabase owns OIDC) |
| `supabaseProjectConfig.ts` | Allowlisted project resolver; main already validates project/env config | Not integrated (duplicate) |

### Web / Android / iOS parity matrix

| Module | Web | Android | iOS |
|---|---|---|---|
| Discovery + detail | PASS | Shared web bundle, native E2E BLOCKED | Shared web bundle, native E2E BLOCKED |
| Availability | PASS | BLOCKED (not exercised) | BLOCKED |
| Booking | PASS | BLOCKED | BLOCKED |
| Payment | PASS (Razorpay/UPI/pay-at-property) | BLOCKED | BLOCKED |
| Cancel/refund | PASS | BLOCKED | BLOCKED |
| Admin/module controls | PASS | Shared bundle; native not exercised | Shared bundle; native not exercised |
| Routes | Hash routes shared | Same bundle; not exercised | Same bundle; not exercised |

Native verification requires a running emulator/simulator and a controlled `cap sync`; both are outstanding and need approval.


## 10. Final status (continued pass)

### External changes preserved and reconciled

While the consolidation was running, two new India-location migrations and feature files landed in main (`20261107183158_india_location_catalog_search.sql`, `20261108090000_india_location_directory.sql`, location search APIs/components). They were preserved, a type error in `SelectedLocation`/`persistLocation` was fixed, and the manifests were regenerated:

- Main: **69 migrations**, unique versions, sha256 PASS.
- Capacitor: **69 migrations**, sha256 PASS after copying the new migrations.
- Hosted Mumbai ledger is unchanged; the pending count is now **17**, not applied.

The new web source was re-synced to Capacitor (web files only). `android/` and `ios/` remain untouched (the same two untracked platform directories before and after).

### Test status

| Run | Result |
|---|---|
| Full suite #1 | 89 passed, 4 failed, 23 skipped |
| Full suite #2 | 101 passed, 2 failed, 23 skipped |
| Full suite #3 | 51 passed, 4 failed, 40 not run (stopped) |
| Affected suites after fixes | **19/19 PASS** (auth entry/role + shared-location) |
| Individual reruns of failing specs | PASS |

The full suite is **flaky under this environment**, and the failures change between runs (header touch targets, media manager, auth registration, stays receipt/payments). External source edits landing during the run and a live dev server are the likely causes. This is reported as **PARTIAL/FLAKY**, not a clean PASS.

### What is complete

- Distinct Classes **Timetable** and Venues **Agenda List** designs (guest-verified).
- Central, admin-authorized UI-style persistence (`POST /api/live-page-config/section-styles`; public config read).
- Module flags, section visibility/labels, categories and admin console controls (existing, verified).
- Capacitor web-source sync + typecheck/build PASS; native files preserved.
- Codex modules audited and deliberately not merged.
- Web/Android/iOS matrix documented; native execution remains blocked.

### Remaining gaps

1. Deterministic full-suite run (needs a quiesced checkout and no concurrent edits).
2. Movies booking/payment has no dedicated E2E spec (route only).
3. Native Android/iOS E2E and `cap sync` — blocked by no devices and by platform-preservation policy.
4. Explicit route-level enable/disable table — routes are currently gated by module flags and hash sections, not a separate route registry.
5. Full alternate designs for other categories beyond Classes/Venues remain out of scope.

No push, merge, hosted write, payment or deployment was performed.

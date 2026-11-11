# REMAINING BLOCKERS

Generated: 2026-11-03 · Worktree: `bookourspace-react`

## Release scope decision (2026-11-05)

**Movies is optional for this release and does not block GO.** It stays discovery-only: `MOVIES_BOOKING_ENABLED = false`, and `/api/seats*` + `/api/movies/bookings*` remain hard-disabled with `410 MOVIES_V1_DISPLAY_ONLY`. No seat-hold, ticket or refund path exists for Movies, and none is required for this release. Item 10 below is therefore informational, not a blocker.

## P0 — must fix before any production release
| # | Blocker | Evidence | Owner action |
|---|---|---|---|
| 1 | **Mumbai Google login proof not run** | Read-only Auth settings on 2026-11-05: `google: true`, `email: false`, `phone: false`, anonymous disabled; prior preflight found 1 Google user/identity | Run an approved end-to-end Google sign-in; do not change hosted providers without approval |
| 2 | ~~Server HMAC secret unset~~ | `BOS_SERVER_HMAC_SECRET` generated locally into ignored `.env.local`; production startup still blocked by persistence policy | Keep it in the deployment secret manager; rotate if exposed |
| 3 | ~~Admin passcode unset~~ | Current code does not consume `BOS_ADMIN_PASSCODE`; stale docs only | Remove from runbooks; do not generate |
| 4 | ~~Production persistence policy~~ **RESOLVED LOCALLY (2026-11-05)** | Production starts on PostgreSQL and serves `/api/live-page-config` and `/api/admin/modules` from the database (`run_production_persistence_smoke.sh` PASS). Live page config + 17 admin module settings migrated in `20261105030000_platform_settings_persistence.sql`; builder was already database-backed. **Still JSON-shaped:** movie admin records/refunds/support tickets and legacy Super Admin views → 503 in production. Requires hosted apply after approval |
| 5 | **No staging E2E** | Hosted first install is complete; browser Google login and six-module booking/payment smoke tests are not yet run | Run approved end-to-end login and smoke tests |
| 6 | **Live payments/refunds not provider-verified** | Venue/stay/service sandbox HMAC settlement and refund paths pass locally; no live Razorpay/UPI keys or provider callbacks | Supply live sandbox credentials; verify create → settle → refund against the provider |
| 7 | **Two active worktrees** | `bookourspace-codex` (branch `feat/codex-work`) has uncommitted edits and is being modified concurrently | Freeze one tree / merge intentionally; avoid overwrite |

## P1 — should fix before release
| # | Blocker | Notes |
|---|---|---|
| 8 | No data-backed browser journey | Playwright Chromium shell suite passes 9/9 (including `#venues`), but no signed-in database-backed purchase is exercised in a browser | Add local Supabase/auth fixture and drive the full booking UI |
| 9 | Admin stores partly localStorage-backed | **Server side done:** the 17 admin module settings persist in PostgreSQL with revision + audit. `adminEnterpriseStore` still keeps `*_v2` local keys as a client cache, so a browser that never reaches the server can still show stale local state |
| 10 | Movies live data source | **Optional this release.** Discovery is wired but showtimes depend on a verified source; the unavailable state is shown and booking stays disabled |
| 11 | `ServiceCategoryGrid.tsx` imports `mockData` | Unused legacy component; remove or confirm not rendered |
| 12 | AI quick-book needs Gemini key | `/api/ai/quick-book` blocked without `GEMINI_API_KEY` |

## P2 — polish / hardening
| # | Item |
|---|---|
| 13 | Verify webhook HMAC with real provider callback |
| 14 | Add rate limiting + monitoring/health-check dashboards |
| 15 | Confirm RLS on every new table in production |
| 16 | Cross-device live-edit verification | Builder publish/rollback is now proven for all six pages at the API level and in one Chromium session; two simultaneous sessions and native WebView revalidation are still unverified |
| 17 | Accessibility + mobile responsiveness audit |

## What is NOT blocked (safe to continue)
- Static build, TypeScript, and all 9 test files pass.
- Movies V1 discovery-only gate implemented.
- UI polish and module components can be improved without credentials.

## Hosted apply pending approval (2026-11-05)

Two reviewed migrations are pinned locally and **not** applied to Supabase:

| Migration | Contents | Local evidence |
|---|---|---|
| `20261105020000_universal_live_builder` | builder page/entity/record versions, registries, audit, 7 server-only RPCs | builder e2e 27/27; 3 review defects fixed before pinning |
| `20261105030000_platform_settings_persistence` | live page config stream, 17 admin module settings, 4 server-only RPCs | settings suite 27/27 |
| `20261105040000_universal_media_assets` | media metadata + Storage bucket/object policies | applied by every harness via the new storage stub |
| `20261105050000_builder_entity_rollback` | Super-Admin-only, audited module rollback | settings suite section F |

Manifest state: `PASS manifest verified: baseline + 42 migrations, unique versions, sha256 match`.
Hosted history is still at 38 rows (baseline marker + 37 migrations), so five pinned migrations are not on the hosted project: `20261105010000` (service reviews policy), `050200`, `050300`, `050400` and `050500`. No hosted write, apply or repair is permitted without explicit owner approval.

## Universal Live Builder — six-page integration status (2026-11-05)

| Item | Result | Evidence |
|---|---|---|
| Six-page render mount | **PASS** | `PublishedBuilderRegion` in both App branches; Playwright 3/3 (Classes, Movies guard, fallback) |
| Live publish propagation | **PASS (API)** | 40/40 E2E including all six page keys; browser multi-session not run |
| Rollback | **PASS** | Page and entity rollback restore the prior published version |
| Legacy config persistence | **PASS** | `/api/live-page-config` 200 from PostgreSQL; draft→publish persists; JSON store sha256 unchanged |
| Capacitor synchronization | **PASS (types/build)** | Builder client/render/UI copied and mounted; `tsc` + `vite build` exit 0; native runtime not run |
| PostgreSQL / RLS | **PASS** | anon sees 20 published vs 1 draft; anon insert denied; audit append-only (34 rows) |
| Offline last-known-good | **PASS (code + fallback)** | Cache-first client; failed fetch with no cache leaves the page unchanged; offline-with-cache not browser-tested |
| Approved policy configuration | **PASS (advisory)** | Admin-only, server-validated allowlist; pricing/RLS remain authoritative |

Still blocking production release:

1. Hosted apply of the five pinned migrations (owner approval).
2. Android/iOS runtime verification: safe-area layout, WebView cache and background revalidation.
3. Two-browser publish propagation and offline-with-cache browser tests.
4. Stale hosted database credential (below).

## Database credential (2026-11-05)

`bookourspace-react-db` / `postgres.obkfgxjzlscungkhbyvq` holds a 16-character password that Supabase rejects on both the session pooler and the direct endpoint (`FATAL: password authentication failed for user "postgres"`). The stored URI shape is correct, so the password is stale. `bos-production-backup` holds an empty 1-byte placeholder and is unusable.

Owner action, with no secret printed or stored in the repository:

```bash
read -r -s -p "Mumbai DB password: " BOS_DB_PW; printf '\n'
security add-generic-password -U -s bookourspace-react-db \
  -a postgres.obkfgxjzlscungkhbyvq -w "$BOS_DB_PW"
unset BOS_DB_PW
security find-generic-password -s bookourspace-react-db \
  -a postgres.obkfgxjzlscungkhbyvq -w | wc -c   # length only
```

Do not reset the database password without approval; rotation invalidates the existing credential.

## Addendum 2026-11-05 (hosted state, security advisor, bootstrap)

Local manifest is now **50 migrations** (hosted ledger reported at **43 records**
= baseline + 42). Eight migrations are pending on Mumbai and are listed with
risk in `HOSTED_SECURITY_AND_BOOTSTRAP_REPORT_20261105.md` §2.

- Security Advisor audit: `bash supabase/tests/run_security_advisor_audit.sh`
  → **0 blocking**, 17 reviewed WARN. Two blocking findings (registry tables
  with RLS disabled) were fixed by `20261105120000_builder_registry_rls`.
- Super Admin bootstrap: `supabase/bootstrap_super_admin.sql` +
  `bash supabase/tests/run_super_admin_bootstrap_test.sh` → **18/18 PASS**.
  Hosted execution needs approval A/B in the same report.
- Six-module Live Builder: local e2e PASS (publish → public read → rollback for
  all six page keys). Hosted verification is **BLOCKED** on a working read-only
  credential; the approval-gated read-only harness is
  `supabase/tests/run_hosted_builder_verification.sh`.
- No hosted SQL, role assignment, test record, commit, push, merge or deploy was
  performed in this pass.

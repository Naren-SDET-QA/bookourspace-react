# BookOurSpace consolidated readiness — 2026-11-06

Report refreshed: 2026-11-06. React repository: `/Users/aa/Downloads/bookourspace-react`. Capacitor repository: `/Users/aa/Downloads/bookourspace-react-capacitor`.

## Verdict

**NO-GO for production release.** Web and Android builds are healthy. iOS native location now returns a Mumbai simulator fix, handles denied permission, and retries successfully after permission is restored. PG booking/provider checks pass against disposable PostgreSQL. Real Google OAuth still needs an approved non-production Supabase project and authorized QA account. Eight Mumbai migrations remain unapplied and require separate approval.

No hosted database writes, migrations, Storage changes, Auth writes, real payments, push, merge, or deployment were performed in this verification.

## Local changes in this verification

- Passed the shared city into the nested PG Style 2 experience in both repositories. Its city selector now follows the shared location and is explicitly labelled `PG city` for accessible browser selection.
- Added `e2e/shared-location-pg.spec.ts` in both repositories. It loads a saved Mumbai location, switches through all six modules, confirms the shared header retains Mumbai, and confirms the PG Style 2 city filter is Mumbai.
- Updated stale Capacitor Stays E2E steps to follow the current quote, booking, My Stays and cancellation UI; selected dates before booking and supplied required guest details in the unavailable-payment test. Focused affected tests pass. These changes only correct test flows and assertions.
- Replaced the failing iOS one-shot Capacitor location request with a small delegate-driven Core Location bridge. It validates fresh fixes, returns explicit permission/service errors, cleans up after success or timeout, retries transient timeouts once, and does not log coordinates. Android continues using its existing Geolocation path.
- Corrected Stays payment-method E2E locators to accept the wording each app actually renders (`Pay at property` or `Pay after service`); this changes tests only.

Existing user changes remain in place; no unrelated work was reverted.

## Results by runtime

| Area | Status | Evidence |
|---|---|---|
| React web code | **PASS** | `npm run lint` and `npm run build` passed. |
| Capacitor code | **PASS** | `npm run lint` passed. Android `assembleDebug` and iOS Simulator `xcodebuild` both succeeded. |
| React unit suite | **PASS** | 269 tests: 254 passed, 15 skipped, 0 failed. |
| Capacitor unit suite | **PASS** | 175 tests: 161 passed, 14 skipped, 0 failed. |
| React Chromium | **PASS** | 116 tests: 94 passed, 22 skipped, 0 failed. |
| Capacitor Chromium | **PASS** | 75 tests: 52 passed, 23 skipped, 0 failed after correcting the visible payment-method text selector. |
| Six-module shared location browser check | **PASS** | New focused spec passed 1/1 in React and 1/1 in Capacitor. Each checks PGs, Classes, Halls, Services, Stays and Movies; PG Style 2 also selects Mumbai. |
| Native location helper tests | **PASS** | 14/14 focused tests passed in each repository. These are helper/unit tests, not a substitute for native runtime checks. |
| Android runtime GPS | **PASS** | Updated APK installed with `adb install -r` (app data preserved), launched on `emulator-5554`; native permission check and position read succeeded. Safe diagnostic recorded a successful position read in 4.568 seconds; the app returned to the home view with Mumbai in the shared location header. Screenshot: `/tmp/bos-gps-result-android.png`. |
| iOS runtime GPS | **PASS (simulator)** | iPhone 17 Pro simulator, iOS 26.5. A simulated Mumbai route returned a location fix and updated the app's city to Mumbai. Revoking app location permission produced the expected denied message; restoring permission and retrying updated the city again. Screenshots: `/tmp/bos-ios-denied-result.png` and `/tmp/bos-ios-granted-retry.png`. Physical iPhone testing remains unverified. |
| Native app builds | **PASS** | iOS Simulator `xcodebuild` succeeded with the custom bridge. Android `assembleDebug` succeeded; APK installed with `adb install -r`, preserving app data. |
| Real Google login | **BLOCKED** | Browser OAuth checks intercept/simulate the provider flow; no real Google login is claimed. No approved non-production Supabase project plus authorized QA account is available in the current session. |
| Live hosted migration or media change | **SKIPPED** | Explicitly not run. Hosted state was queried read-only. |

The React and Capacitor Chromium suites intentionally skip 22 and 23 tests respectively. Skips include dedicated Classes training, Services lifecycle/payment, real Stays inventory, Venue booking/cross-browser, and other fixture/provider-gated cases. The disposable Stays PostgreSQL payment suite was run separately: 47/47 checkout, signed settlement/refund, conflict and security checks passed; 5/5 restart persistence checks passed. It uses a local throwaway database and labeled sandbox provider only. No production settlement or real payment was attempted.

## Six-module readiness

| Module | Status | Evidence and limit |
|---|---|---|
| PGs & Hostels | **PASS locally** | Disposable PostgreSQL booking suite passed: provider API/ownership and RLS checks, room/bed inventory, date block and restore, Admin application/listing approval, customer booking/cancellation, concurrent conflict atomicity, and restart persistence. PG Style 2 now reflects the shared selected city in both apps. |
| Classes & Training | **PASS locally** | Chromium customer/trainer/admin journey, waitlist ordering, duplicate prevention, cancellation and last-seat conflict checks passed. Separate training harness tests were skipped. |
| Function Halls / Venues | **PASS locally; default-suite SKIPPED** | Latest dedicated local PostgreSQL/Chromium report records 9/9 owner/Admin/customer lifecycle journeys, cross-engine responsive checks and restart persistence. The current all-in-one Chromium run skipped its gated Venue fixture group; it produced no new failure. |
| Home Services | **PASS locally; default-suite SKIPPED** | Latest dedicated local PostgreSQL/Chromium report records customer cancellation, provider completion, Admin refund of verified sandbox payment and restart persistence. The current all-in-one Chromium run skipped its gated Services fixtures; it produced no new failure. |
| Hotels & Stays | **PASS locally** | Capacitor’s corrected customer booking/cancellation journey and mobile/tablet booking surface passed; API tests cover ownership, availability, concurrency and payment refusal. React full suite also passed its PG/DB-backed Stays flows. Real hosted inventory was skipped. |
| Movies | **PASS for discovery-only scope** | Route rendering and builder guard passed; custom builder content cannot enable booking. No legitimate theatre inventory/booking capability is claimed. |

**Provider inventory and Admin publication:** PG provider inventory editing and Admin approval passed the disposable PostgreSQL/browser suite. Those results are retained; no code changed those flows in this pass.

**Stays payment/recovery evidence:** Disposable PostgreSQL E2E applied the full local baseline and migrations in a throwaway database, then passed 47 workflow checks and 5 restart checks. It exercised server quotes, UPI/Razorpay sandbox intents, signed provider capture, idempotency, admin refund, inventory release, concurrency caps and RLS isolation. The JSON store hash was unchanged. This is not evidence of hosted payment-provider credentials or production settlement.

## Mumbai hosted snapshot — read-only

Target identity was freshly verified as Supabase project `obkfgxjzlscungkhbyvq`, region `ap-south-1`, status `ACTIVE_HEALTHY`, PostgreSQL 17.11. Fresh identity, migration ledger and schema inventory checked read-only at **2026-11-06 09:29:19 UTC**.

- Migration ledger: **53 rows** — baseline marker plus 52 applied migration records.
- Public tables: **68**, with RLS enabled on all 68.
- Public RLS policies: **135**.
- Profiles: **2**; listings, Stays properties, room types and bookings: **0** each. The earlier 1-profile snapshot is superseded by this current read.
- `public.media_assets`: **1 row**, `ready`/`public`, parent type `provider_listing`; its object is present in Storage, but it has **no active listing reference**.
- `storage.objects`: **2 objects**, **148,357 bytes** total; only one is represented by the current media asset row.
- No objects were uploaded, replaced, or deleted. Existing media bytes remain untouched.

Older 52/zero-object findings are stale and superseded by this fresh read-only snapshot. The pending migration `20261105160000_media_published_listing_visibility.sql` narrows public media reads to referenced/published media. With zero listings and zero active media references, it may hide these existing objects from public listing discovery after application even though it does not delete their bytes. Preserve the objects, but decide whether to map/publish them or accept this visibility change before separately approving that migration.

## Eight pending migration rollout plan

The local manifest check passed: baseline plus **60 migration files**, unique versions and SHA-256 checksums. Hosted ledger has 52 migrations plus the baseline marker, leaving **eight** local migrations pending. The installer plan resolved to `obkfgxjzlscungkhbyvq`. Installer guard tests passed for the plan and wrong-project refusal; transaction inventory confirmed every pending Mumbai migration is wrapped or handled by installer-owned transactions. `bash supabase/install_mumbai_migrations.sh --plan` was run; no apply command was run.

| Order | Pending migration | Preflight status |
|---:|---|---|
| 1 | `20261105150000_server_media_byte_validation.sql` | **READY FOR APPROVAL** — extends server-side media validation against the existing media model; no object rewrite/deletion. |
| 2 | `20261105160000_media_published_listing_visibility.sql` | **REVIEW REQUIRED BEFORE APPROVAL** — changes row/object visibility policy; it preserves bytes, but the current asset is unreferenced and may stop appearing publicly. Resolve/map it or explicitly accept the visibility change before approval. |
| 3 | `20261105163924_profile_media_and_account_closure.sql` | **READY FOR APPROVAL** — depends on current profile/auth identity schema; adds controlled profile media/account-closure support, does not delete existing Auth users during migration. |
| 4 | `20261105170000_stay_discovery_filters.sql` | **READY FOR APPROVAL** — depends on published Stays fields; no booking/payment ledger rewrite. |
| 5 | `20261105180000_stay_host_inventory_controls.sql` | **READY LOCALLY FOR APPROVAL** — follows 1700; the latest report records empty `search_path`, schema-qualified references and explicit reviewed `EXECUTE` grants for its `SECURITY DEFINER` availability function. |
| 6 | `20261105210000_stay_requests_fees_profiles.sql` | **READY FOR APPROVAL** — follows Stays discovery/host controls; adds request/fee/profile data path. |
| 7 | `20261105220000_restore_pg_hostel_property_type.sql` | **READY FOR APPROVAL** — follows the PG/Stays property-type schema and is conditional when the target constraint is already correct. |
| 8 | `20261106010000_stay_razorpay_and_verified_upi.sql` | **READY FOR SEPARATE REVIEW/APPROVAL** — adds Razorpay checkout and verified UPI fields/RPC flow; uses a transaction and restricted `SECURITY DEFINER` grants. Local disposable payment E2E passed; hosted payment configuration and any production settlement were not tested. |

The rollout remains **unapplied**. Required order is the sequence above. Migration 2200 remains in the ledger-consistent batch as a conditional no-op repair after 1700; it is not a reason to silently omit a version. Guarded preview command:

```bash
bash supabase/install_mumbai_migrations.sh --plan
```

Applying requires a separate explicit hosted-write approval. The user previously declined additional backup/PITR requests and accepted that recovery risk; no new backup was requested or created here. Do not substitute a destructive reset or direct `supabase db push` for the guarded installer.

## OAuth, security, and remaining blockers

- Google remains the only configured auth provider in the local contract; customer-by-default registration and database-authoritative elevated roles remain enforced. `npm run audit:oauth` passed in both repositories this turn (0 failures, no network call, no secrets printed). Browser OAuth is simulated/intercepted; no real Google login is claimed.
- To run real Google OAuth E2E, designate a non-production Supabase project, configure the existing Google provider and app callback for that project, and authorize a QA Google account. No hosted Auth writes were made.
- **Production release blockers:** real OAuth QA environment/account missing; eight hosted migrations unapproved; hosted backup/restore readiness remains unverified (prior backup-request decline and accepted recovery risk retained); hosted listing inventory is empty and hosted payment tables contain no transactions; some fixture-gated browser suites remain skipped. The hosted project remains at 52 applied migrations plus the baseline marker. No hosted booking, Razorpay/UPI, refund, or settlement has been verified in this run.
- The read-only Storage inventory found two objects (148,357 bytes); one object is not represented by `media_assets`, and one ready media asset has no active listing reference. No object changed. The pending media visibility migration may hide this unreferenced ready asset from public discovery without deleting its bytes.
- No hosted storage or schema change is required to reproduce the successful local tests.

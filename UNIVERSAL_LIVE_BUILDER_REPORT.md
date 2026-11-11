# Universal Live Builder — Implementation Report

**Date:** 2026-11-05 · **Repo:** `/Users/aa/Downloads/bookourspace-react`
**Status:** secure core, six-page customer integration and legacy PostgreSQL persistence delivered and verified locally. Hosted apply and native runtime verification remain owner-gated; see §6.

---

## 1. What was built

A registry-driven, PostgreSQL-authoritative builder that reuses the existing Live Edit
repository pattern and component vocabulary rather than introducing a second engine.

| Capability | Implementation |
|---|---|
| Page editing | `/api/builder/pages/:key` + `UniversalLiveBuilder` Pages tab: headings, text, images, heroes, cards, galleries, buttons, navigation document, forms, tables, calendars, listing layouts, booking/inventory widgets, reports, workflow actions |
| Reorder / show-hide | Native drag-and-drop at root level plus move up/down for any block, per-block visibility |
| Draft / preview / publish / rollback | Append-only page versions; draft never alters the published document; Super Admin publish; rollback creates a new published version referencing the restored one |
| Feature Builder | 26 reviewed components from one registry shared by UI, API validator and SQL guard; no script, HTML, SQL or custom component type is representable |
| Universal Module Builder | `platform_entities` + versioned `platform_entity_versions` + `platform_entity_records`; fields (14 types), relations (`belongs_to` / `has_many`), list columns, read scope, optional workflow statuses; the School → Job → Application example is covered by the E2E test |
| Reports | Fixed metric registry (`listings_by_module`, `providers`, `service_bookings`, `refunds`, `reviews`, `user_growth`, `module_performance`) executed server-side; arbitrary metric names rejected |
| Persistence | Pages, entity schemas and records in PostgreSQL; no JSON fallback; image references only, never binaries |
| Versioning | Per-page and per-entity version streams, summaries, author, publish timestamps, rollback, optimistic concurrency (`BUILDER_VERSION_CONFLICT`) |
| Audit | `platform_builder_audit`, append-only by trigger, actor role resolved from `profiles` inside SQL |
| Cross-platform delivery | ETag + `stale-while-revalidate` public endpoint, local cache, offline fallback, BroadcastChannel/storage/visibility revalidation, `schemaVersion` compatibility gate |
| Client | `src/lib/builder/client.ts` (no draft caching, no admin data in public cache) |
| Admin UI | `src/components/UniversalLiveBuilder.tsx`, opened from the admin-only **Build** launcher in the app shell; Pages (blocks, navigation, global theme), Modules (schema, records, rollback), Policies, Reports and Audit tabs |
| Customer rendering | `src/components/builder/PublishedBuilderRegion.tsx` mounted in both App render branches for all six page keys; renders presentation blocks only and leaves booking/inventory/pricing logic untouched |
| Legacy compatibility | `/api/live-page-config` now answers from PostgreSQL (`20261105030000_platform_settings_persistence.sql`) with draft/publish/rollback; no production 503 and no JSON writes |

## 2. Security model

- **Allowlist everywhere.** A block type must exist in `platform_component_registry`; the SQL trigger
  `guard_builder_page_version` rejects anything else even if the TypeScript validator regresses.
- **Data, not code.** Props are rebuilt from reviewed descriptors; `javascript:`, `data:`, `file:`,
  `vbscript:`, `<script`, `<iframe`, `<object`, `<embed`, prototype keys and unknown keys are rejected.
  The React renderer uses text nodes only — there is no `dangerouslySetInnerHTML`.
- **Server-derived identity.** The signed session token only identifies the caller. Every builder
  function re-reads `profiles.role`, `account_status` and `is_super_admin`; publish/rollback and
  publish of booking/inventory/report/workflow components require Super Admin.
- **No browser RPC access.** Every builder function is revoked from `PUBLIC`, `anon` and
  `authenticated`; only the application server connection can call them, so `p_actor` cannot be spoofed.
- **RLS.** Anonymous readers see published page/entity versions only; drafts stay hidden. Records are
  readable only when the published schema marks them public/authenticated. Verified in SQL.
- **No arbitrary DDL.** A module is JSON metadata plus rows in a generic record table; the builder never
  creates tables from user input.
- **No financial bypass.** The builder has no path to payment settlement tables; booking/inventory
  widgets are declarative and server pricing/authorization still applies.

## 3. Verification (executed)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npm run build` | **PASS** (exit 0; 503 kB main chunk warning only) |
| `npm test` | **PASS** — 200 tests, **185 pass, 0 fail**, 15 DB-gated skips |
| New registry/validator tests | **PASS 10/10** |
| New policy allowlist tests | **PASS 7/7** |
| `bash supabase/tests/run_universal_builder_e2e.sh` | **PASS** — **40/40** HTTP checks plus RLS/audit SQL checks |
| `npx playwright test e2e/builder-region.spec.ts --project=chromium` | **PASS 3/3** — published region renders in the real Classes page; Movies suppresses booking/inventory widgets; failed fetch with no cache leaves it unchanged |
| Capacitor repo `tsc --noEmit` + `npm run build` | **PASS** (exit 0 both) |
| Migration manifest | **PASS** — baseline + **42** migrations, SHA-256 verified |

The E2E run (throwaway PostgreSQL 17, real Express server, signed sessions) proved:

```text
anonymous draft read/write          401
customer draft read/write           403
admin draft save                    200 (v2)
admin publish                       403 BUILDER_SUPER_ADMIN_REQUIRED
super-admin publish                 200, public client sees the blocks immediately
<script> / unknown component        400
stale expectedVersion               409 BUILDER_VERSION_CONFLICT
rollback                            new published version, public follows
six pages (PG, classes, venues, services, hotel_stay, movies)
                                    publish→public read→rollback PASS for every page key
entity rollback                     Super Admin only; prior schema restored, admin 403
legacy /api/live-page-config        200 from PostgreSQL; draft→publish persists publicly
policies                            admin-only; save 200, unknown key/out-of-range 400
School module + Job relation        published; relation to unpublished module 409
records                             stored, schema-rejected fields 400, money precision 400
report metric / raw_sql             200 / 400
audit actions                       page_draft_saved … entity_rolled_back, role from profiles
RLS                                 total=21 published=20 drafts=1 anon_visible=20
audit                               34 rows; update and delete denied (append-only)
anon direct insert                  denied
legacy JSON store                   sha256 unchanged
```

## 4. Changed / added files

**Added**
- `supabase/migrations/20261105020000_universal_live_builder.sql`, `20261105030000_platform_settings_persistence.sql`, `20261105050000_builder_entity_rollback.sql`
- `src/lib/builder/registry.ts`, `validate.ts`, `client.ts`, `policies.ts`
- `src/server/platformBuilderRepository.ts`, `src/server/platformSettingsApi.ts`
- `src/components/UniversalLiveBuilder.tsx`, `src/components/builder/PublishedBuilderRegion.tsx`
- `tests/universal-builder.test.mjs`, `tests/universal-policies.test.mjs`, `tests/universal-builder.integration.mjs`
- `e2e/builder-region.spec.ts`, `supabase/tests/run_universal_builder_e2e.sh`
- `UNIVERSAL_LIVE_BUILDER_REPORT.md`

**Modified**
- `server.ts` — repository startup verification, `/api/builder/*` and settings registration before the JSON handlers
- `src/App.tsx` — lazy builder console mount, admin launcher, and the published region in both render branches
- Capacitor repo — copied builder client/validator/policies/render/UI and mounted the region plus the admin launcher
- `supabase/MIGRATION_MANIFEST.json`, `supabase/migrations.sha256` — regenerated for 42 migrations

## 5. Deliberate limits

- Drafts are append-only: saving supersedes the previous draft. There is no multi-user co-editing; the
  second writer receives `BUILDER_VERSION_CONFLICT` and must reload. This is intentional for financial
  and inventory configuration.
- Publishing is atomic per page/entity. A failed publish leaves the previous published version serving.
- Image binaries are not stored; only HTTPS references pass validation.
- Payment, inventory, role and report policies are advisory UI configuration. They are server-validated
  and stored in PostgreSQL, but they are never read by pricing, availability, refund, RLS or authorization
  decisions. The confirmed payment/inventory/role rules remain the existing server code.

## 6. Six-page integration status

`PublishedBuilderRegion` is mounted in both App render branches:

- the section-experience branch covers `pg_hostels`, `classes`, `services`, `hotel_stay` and `movies`;
- the main marketplace branch covers `venues` and the rest of the marketplace flow.

The region renders presentation blocks only. Booking, inventory, pricing and listing components become
CTAs that scroll to the existing `#bos-listings-feed-grid`; no booking, payment or inventory logic is
duplicated. If there is no published document, a 404/503, or no cache after a failure, the region renders
nothing and the original page is unchanged. The client is cache-first and revalidates on focus, on a
broadcast publish event, and every 60 seconds while visible.

| Page | Region mount | Browser evidence |
|---|---|---|
| PGs & Hostels | PASS | API publish/rollback |
| Classes & Courses | PASS | Playwright render + fallback |
| Function Halls & Venues | PASS | API publish/rollback |
| Home & Local Services | PASS | API publish/rollback |
| Hotels & Stays | PASS | API publish/rollback |
| Movies (discovery only) | PASS | API publish/rollback; Playwright proves published booking/inventory widgets are suppressed |

Delivered configuration surfaces: navigation editor, global theme editor, block visibility, dynamic
module/listing fields, entity rollback, approved payment/inventory/role/report policy forms, report
metric selection and audit history.

## 7. Remaining gaps and approvals

1. **Hosted apply:** the three new migrations are **not applied** to `obkfgxjzlscungkhbyvq`; that needs owner approval.
2. **Native runtime:** the Capacitor repo typechecks and builds, but Android/iOS runtime checks (safe area,
   WebView cache, background revalidation) have not been run on a device or simulator.
3. **Browser multi-session:** propagation is proven at the API level for all six pages and in one browser;
   two simultaneous browser sessions receiving a publish were not exercised.
4. **Offline-with-cache:** the cache-first fallback and the no-cache failure path are covered; a browser
   offline test with a previously cached document is still outstanding.
5. **Legacy document import:** `/api/live-page-config` is now PostgreSQL-backed and serves draft/publish
   normally. Existing legacy JSON values are not auto-imported into builder blocks, so no published
   configuration is overwritten. A one-off importer would need real legacy data to review.
6. Run the E2E script against a staging deployment and verify Web/Android/iOS caches revalidate.

## 8. Final verification addendum — 2026-11-05

This addendum supersedes the browser/offline/native gaps recorded above. All hosted observations
were read-only; no hosted schema, data, bucket, or migration was changed.

### Local disposable PostgreSQL and browser

- **Independent browser sessions: PASS.** `supabase/tests/run_universal_builder_e2e.sh` now opens
  separate Super Admin and customer Chromium contexts against its throwaway PostgreSQL/API. The
  customer renders the baseline publication, sees the Super Admin publish, then sees the rollback.
  The same run passes 40 HTTP assertions, six page-key publish/rollback checks, anonymous RLS,
  append-only audit, and confirms the legacy JSON store hash is unchanged.
- **Offline/cache paths: PASS (browser).** Focused Playwright tests verify a valid recent cache on
  503, cold start with no cache, expired-cache removal, offline rendering, reconnect revalidation,
  and Movies component suppression (6/6 focused tests pass).
- **Legacy route: PASS locally; hosted BLOCKED.** The production-startup smoke returns
  `/api/live-page-config` from PostgreSQL, preserves publish across restart, and creates or reads no
  JSON store. The intended hosted project still has no `platform_live_page_config` table because
  its builder migrations are absent, so this does not establish hosted behavior.
- **Security checks: PASS locally.** Page documents are registry/shape validated; browser scripts,
  unknown components, and stale versions are rejected. Policy payloads are allowlisted and cannot
  decide pricing, inventory, payment settlement/refunds, RLS, or role grants. Movies booking and
  inventory widgets, forms, calendars, and booking actions are suppressed even when injected into a
  published Movies document. Movies remains discovery-only.

### Hosted migration audit (read-only)

The linked production target checked was `obkfgxjzlscungkhbyvq` (ap-south-1). It records the baseline
and 37 of the 42 pinned migrations. These **exact five** are absent:

1. `20261105010000_service_reviews_public_policy.sql`
2. `20261105020000_universal_live_builder.sql`
3. `20261105030000_platform_settings_persistence.sql`
4. `20261105040000_universal_media_assets.sql`
5. `20261105050000_builder_entity_rollback.sql`

Hosted catalog evidence: 56 public tables, all 56 with RLS; 115 policies; no builder page/settings/
entity/media tables; Storage schema is present but has 0 buckets, 0 objects, and 0 bytes. The local
42-migration dry run applies and reapplies all files. Dependency review found the review policy uses
existing reviews/profile authorization; the builder depends on existing profile/active-admin checks;
settings and rollback depend on builder tables/functions; media metadata depends on profile roles and
Storage catalogs. The five migrations add policies, tables, functions, component metadata, and (if
applied) private bucket definitions. They do not delete or rewrite booking/payment/listing rows. Current
hosted absence of the new tables/buckets means there is no corresponding builder/media data to migrate.

The disposable post-migration catalog has 67 public tables, 65 with RLS. The two intentionally
RLS-disabled tables are `platform_component_registry` and `platform_field_types`: anon/authenticated
have SELECT only, with INSERT/UPDATE/DELETE revoked. All 56 pre-existing hosted public tables have
RLS enabled.

All five still require an approved pre-change hosted recovery point. The local custom-format backup
and restore drill passes and the restored catalog matches (67 tables, 132 policies, 65 RLS-enabled
tables). Hosted backup/PITR schedule and the latest recoverable point are **BLOCKED/unverified**.
Runtime page/entity rollback is copy-forward and audited; it is not a schema downgrade. There is no
automatic down migration for this five-file set, so schema recovery would require a reviewed forward
fix or restoring the verified pre-change backup. **No migration was applied.**

### Native and media status

- **iOS:** installed/synchronized the current Capacitor bundle on the already booted iPhone 17
  simulator and launched `com.bookourspace.app`. The first screenshot was captured during WebView
  startup and was blank; a screenshot after four seconds showed the rendered home screen with
  content below the status safe area and the fixed bottom navigation above the home indicator. WebKit
  logs show the local page and subresources completed. This is a transient startup frame, not a
  persistent blank screen. Native scroll gestures, a published server document, native cache
  persistence, and background/foreground revalidation remain **BLOCKED**: no local backend is
  configured in the installed app, and the hosted builder schema is not installed.
- **Android:** debug APK build passes. Runtime launch is **BLOCKED** because this machine has no
  Android emulator executable/AVD and `adb devices` reports no connected device. No device data was
  touched.
- **Smart Media Engine:** local image inspection/preview is available and used by the media manager;
  originals remain intact and only metadata/references are stored in PostgreSQL. Hosted Storage has
  no bucket, so uploads are not claimed as available and no binary was uploaded or removed.

### Reproducible local evidence

- Main: TypeScript PASS; unit tests **186 passed, 0 failed, 15 skipped**; production build PASS.
- Capacitor: TypeScript PASS; unit tests **138 passed, 0 failed, 14 skipped**; production build,
  iOS simulator build, and Android debug build PASS.
- Main local PostgreSQL validation: **52 functional checks**, profile privacy, role management,
  provider/listing, class enrollment, venue concurrency, and no-double-booking checks PASS.
- Live Edit backend security: **19/19 PASS**.
- Focused builder Playwright: **6/6 PASS**. Full browser suite and combined booking suites are
  **60 passed, 0 failed, 22 skipped**; all **9/9** sequential booking/security suites pass (including
  Classes, Venues, Services API/browser and Stays). See the final readiness addendum for the full
  evidence and hosted blockers.

No push, merge, deployment, hosted write, live payment, or media deletion was performed. Remaining
hosted action requires owner approval after hosted backup/PITR is verified; native live-cache
verification additionally needs an installed hosted schema or an authorized local API environment.

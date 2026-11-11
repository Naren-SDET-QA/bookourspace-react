# ADMIN / SUPER ADMIN AUDIT

Generated: 2026-11-03 · Worktree: `bookourspace-react`

## Admin surfaces present in the tree
| Component | Purpose | Build/TS |
|---|---|---|
| `AdminDashboard.tsx` | Admin console shell & navigation | ✅ |
| `SupremeAdminControlPanel.tsx` | Super-admin controls | ✅ |
| `AdminMarketplaceListings.tsx` | Listing moderation | ✅ |
| `AdminStayInventory.tsx` | Stay room/inventory management | ✅ |
| `AdminPlatformModuleSettings.tsx` | Module flags (6 modules) | ✅ |
| `AdminThemeManagementSection.tsx` | Branding/theme management | ✅ |
| `AdminAnnouncementsSection.tsx` | Announcements/banners | ✅ |
| `AdminReportsAnalyticsSection.tsx` | Reports & analytics | ✅ |
| `AdminDataManagementSection.tsx` | Data import/export/backup | ✅ |
| `AdminIntegrationsSection.tsx` | Integrations | ✅ |
| `AdminAnalyticsAndBilling.tsx` | Billing & revenue | ✅ |
| `LiveAdminPageEditor.tsx` | Live page editing (draft/publish) | ✅ |
| `UniversalObjectEditorModal.tsx` | Universal multi-entity editor | ✅ |
| `UniversalBarcode.tsx` | Signed pass/barcode verification | ✅ |

## Server APIs (admin-gated)
| Endpoint | Guard |
|---|---|
| `GET /api/admin/users` | signed admin identity |
| `POST /api/admin/users` | signed admin identity |
| `PATCH /api/admin/users/:id/status` | admin + reason |
| `PATCH /api/admin/users/:id/role` | admin |
| `PATCH /api/admin/users/:id/verify` | admin |
| `GET /api/admin/modules` | admin |
| `PUT /api/admin/modules/:moduleKey` | admin |
| `GET /api/live-page-config` | public read |
| `POST /api/live-page-config/draft` | admin |
| `POST /api/live-page-config/publish` | admin |
| `POST /api/live-page-config/rollback` | admin |
| `GET /api/billing/records` | admin |
| `POST /api/billing/run-cycle` | admin |

`tests/admin-authorization.test.mjs` → **PASS** (only a signed admin identity is accepted by admin guards).

## Live Edit Mode — PARTIAL
- **Present:** draft → publish → rollback endpoints, versioned config, `LiveAdminPageEditor` UI, theme/category/announcement editors, audit store (`adminEnterpriseStore` with `*_v2` keys for users/roles/refunds/payouts/disputes/theme).
- **Verified:** compile + admin auth test.
- **Not verified:** cross-device persistence against Supabase (needs staging + OAuth admin session). Some admin stores are localStorage-backed for preview, which is **not** the production persistence path.
- **Gap:** confirm every editor writes through a validated backend API into Supabase (not only localStorage). This requires a read/write staging session.

## Super-admin controls — PARTIAL
- Roles/permissions, provider verification, listing moderation, module flags, refunds/disputes views exist.
- **BLOCKED:** confirm production RLS enforcement for `service_role`-only operations and immutable audit rows (needs DB audit + approval).

## Guarantees enforced in code (verified)
- Admin routes reject unsigned identities (`admin-authorization` PASS).
- Public listing approval requires an administrator (`payment-settlement-safety` test 10 PASS).
- No arbitrary SQL executor is exposed to the browser (no `/api/sql` endpoint).
- No secret-editing endpoint exists.
- Financial history is append-only in the tested payment lifecycle (UTR immutability test).

## Gaps / risks
| Item | Status |
|---|---|
| Cross-device live-edit persistence in prod | ⛔ BLOCKED (staging/OAuth) |
| Some admin stores use localStorage preview | ⚠️ needs backend wiring for prod |
| Immutable audit table + reason enforcement at DB level | ⛔ not DB-audited |
| Production RLS verification | ⛔ blocked |

## Verdict
Admin/Super-admin **UI + APIs are present and admin-gated (test PASS)**. **Live-edit and RLS persistence are PARTIAL/BLOCKED** pending a staging session and DB audit.

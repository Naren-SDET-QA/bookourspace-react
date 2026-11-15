# REMAINING BLOCKERS

Generated: 2026-11-03 · Worktree: `bookourspace-react`

## P0 — must fix before any production release
| # | Blocker | Evidence | Owner action |
|---|---|---|---|
| 1 | **Mumbai Google-only Auth not configured** | Read-only Mumbai Auth settings report `google: false`, `email: true`, `phone: false`; the app correctly keeps OAuth client secrets out of React env | After approval, reuse the existing Web client, add Mumbai's Google Cloud callback, enable Google in Mumbai, disable Email/Phone, and run a real sign-in |
| 2 | **Server HMAC secret unset** | server logs "using an ephemeral development-only signing key" | Set `BOS_SERVER_HMAC_SECRET`; signed passes must be durable |
| 3 | **Admin passcode unset** | `BOS_ADMIN_PASSCODE` missing | Set before exposing admin console |
| 4 | **Migrations not applied / DB not audited** | 7 migration files, no read-only prod audit executed | Approve audit; diff schema; apply in isolated DB first |
| 5 | **No staging E2E** | No staging credentials; live journeys not exercised | Provision staging + test users; run full E2E |
| 6 | **Live payments/refunds not provider-verified** | Venue/stay/service sandbox HMAC settlement and refund paths pass locally; no live Razorpay/UPI keys or provider callbacks | Supply live sandbox credentials; verify create → settle → refund against the provider |
| 7 | **Two active worktrees** | `bookourspace-codex` (branch `feat/codex-work`) has uncommitted edits and is being modified concurrently | Freeze one tree / merge intentionally; avoid overwrite |

## P1 — should fix before release
| # | Blocker | Notes |
|---|---|---|
| 8 | No data-backed browser journey | Playwright Chromium shell suite passes 9/9 (including `#venues`), but no signed-in database-backed purchase is exercised in a browser | Add local Supabase/auth fixture and drive the full booking UI |
| 9 | Admin stores partly localStorage-backed | `adminEnterpriseStore` uses `*_v2` local keys; wire to Supabase for cross-device persistence |
| 10 | Movies live data source | Discovery is wired but showtimes depend on a verified source; unavailable state must be shown |
| 11 | `ServiceCategoryGrid.tsx` imports `mockData` | Unused legacy component; remove or confirm not rendered |
| 12 | AI quick-book needs Gemini key | `/api/ai/quick-book` blocked without `GEMINI_API_KEY` |

## P2 — polish / hardening
| # | Item |
|---|---|
| 13 | Verify webhook HMAC with real provider callback |
| 14 | Add rate limiting + monitoring/health-check dashboards |
| 15 | Confirm RLS on every new table in production |
| 16 | Cross-device live-edit persistence verification |
| 17 | Accessibility + mobile responsiveness audit |

## What is NOT blocked (safe to continue)
- Static build, TypeScript, and all 9 test files pass.
- Movies V1 discovery-only gate implemented.
- UI polish and module components can be improved without credentials.

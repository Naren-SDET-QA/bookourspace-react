# ENV_CONFIGURATION_STATUS

Updated: 2026-11-04 · Worktree: `/Users/aa/Downloads/bookourspace-react`

> Secrets are never printed. Only key presence and validation status are reported.

## Supabase — CONFIGURED
| Key | Present in `.env.local` | Notes |
|---|---|---|
| `VITE_SUPABASE_PROJECT_ID` | ✅ | `obkfgxjzlscungkhbyvq` (Mumbai) |
| `VITE_SUPABASE_DEVELOPMENT_PROJECT_ID` | ✅ | same project |
| `VITE_SUPABASE_URL` | ✅ | `https://obkfgxjzlscungkhbyvq.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | fetched from Mumbai and validated by the local preflight; value not printed |
| `VITE_SUPABASE_ANON_KEY` | ❌ | not required when publishable key is set |

Client config validation: `tests/supabase-config.test.mjs` → **23/23 PASS** (rejects service-role keys, mismatched refs, host mismatch, etc.).

## Google OAuth — BLOCKED (Mumbai provider configuration required)

The React app delegates Google OAuth to Supabase Auth; Google Client ID/secret
do not belong in Vite variables. A read-only Mumbai Auth settings request
returned `google: false`, `email: true`, `phone: false`. Enable Google using the
existing Web client and disable Email/Phone in the Mumbai dashboard after
approval. The existing Google Cloud client ID/secret and redirect list were
not verified from this machine. No OAuth secret is stored in this report.

## Server security — BLOCKED (not configured)
| Key | Present | Impact |
|---|---|---|
| `BOS_SERVER_HMAC_SECRET` | ❌ | Server logs "using an ephemeral development-only signing key" — signed pass tokens are not durable across restarts |
| `BOS_ADMIN_PASSCODE` | ❌ | Admin passcode gate falls back to dev behaviour |

## AI / Gemini — BLOCKED (not configured)
| Key | Present | Impact |
|---|---|---|
| `GEMINI_API_KEY` | ❌ | `/api/ai/quick-book` and AI-assisted help have no upstream model |

## Payments (Razorpay / Direct UPI / WhatsApp / Email / Storage / Maps) — NOT VERIFIABLE
No dedicated env keys are present in `.env.local` or `.env.example` for Razorpay, WhatsApp, email or storage providers. UPI settlement is modelled server-side through `/api/payments/*` with HMAC verification, but **provider credentials and sandbox accounts were not supplied**, so live verification is **BLOCKED**.

## APP_URL
| Key | Present | Impact |
|---|---|---|
| `APP_URL` | ❌ | OAuth redirect URIs and webhook callbacks are not pinned; defaults are used |

## Summary
| Area | Status |
|---|---|
| Supabase DB/URL/key | ✅ CONFIGURED (shape validated) |
| Google OAuth | ❌ BLOCKED — Mumbai reports Google disabled and Email enabled |
| Server HMAC / admin passcode | ❌ BLOCKED |
| Gemini AI | ❌ BLOCKED |
| Payments / UPI / WhatsApp / email / maps | ❌ NOT VERIFIABLE |
| Build & type safety | ✅ PASS |

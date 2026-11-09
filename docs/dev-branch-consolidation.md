# `dev` branch consolidation audit

Base: `9fd81e66f3d637980388a7bd316549d6832cf67d` (latest `feat/module-flags-and-stay-inventory`).

## Branches / worktrees audited

| Ref / worktree | HEAD | Finding | Action |
|---|---|---|---|
| `feat/module-flags-and-stay-inventory` | `9fd81e6` | Latest working source (6 modules, admin, India search, Movies showtimes, migrations 71, tests) | **Base for `dev`** |
| `origin/main` | `83ed2cc` | Ancestor, 10 commits behind; no unique work | Skipped |
| `origin/feat/bookourspace-live-audit` | `5f931cb` | Older demo/booking architecture + separate Movies Supabase project; 100 files, conflicts with current showtimes-only design | Skipped as obsolete |
| `origin/feat/movies-upi-payment` | `4526d11` | Nested duplicate copy of the app (`movies-upi-payment/`), 80k lines; main already has movie flow, now showtimes-only | Skipped duplicate |
| `feat/codex-work` | `83ed2cc` + 25 dirty | Unverified experiment: Google ID-token verifier, section visibility helper, Supabase project resolver; no tests, older base | Skipped (security/redundancy) |
| `feat/freebuff-work` / `feat/kilo-work` / `feat/opencode-work` | `83ed2cc` | Clean at base; no unique content | Skipped |
| `fix/classes-anon-public-batches` | `a67cbec` + 292 dirty | Broad superseded app-wide changes; no unique class implementation | Skipped |
| `codex/capacitor-mobile` | `a67cbec` + native dirs | Android/iOS shells + synced web assets; web source already mirrored; native build not validated | Preserved in `/Users/aa/Downloads/bookourspace-react-capacitor`; not merged into web repo |
| detached `/tmp/bos-head-build`, kilo pool | old | Temporary build checkouts | Skipped |

## Merge decision

No safe *unique* implementation remained outside the feature branch. The only unique remote work was obsolete booking/demo code or a duplicate nested application; merging it would reintroduce removed Movies booking, conflict with current views and add untested code. Native Android/iOS sources remain in the Capacitor worktree and are intentionally not duplicated into the web branch.

## Preserved

- All six modules and their routes, admin controls, India location search, Movies showtimes-only, 71 migrations/manifests, tests/e2e, selected docs, responsive brand assets.
- Dirty runtime files (`authoritative-marketplace-store.json`, `live-page-config.json`) remain local, not committed.
- Native platform files remain untouched in the Capacitor worktree.

## Checks (dev)

| Check | Result |
|---|---|
| TypeScript | PASS |
| Build | PASS |
| Unit/API | 318 tests, 300 pass, 0 fail, 18 skipped |
| Browser E2E | 113 passed, 1 flaky (passed on retry), 23 skipped; `retries: 1` |
| Migration manifest | 71 migrations, sha256 PASS |
| Native Android/iOS | BLOCKED — not in dev; preserved in Capacitor worktree, no device run |

Remaining gaps: native platform code stays in the separate Capacitor worktree; E2E needs one retry under this environment; hosted DB/deploy untouched.

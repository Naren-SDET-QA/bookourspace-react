# Movies — Showtimes-only simplification

Date: 2026-11-08 · Main repo: `/Users/aa/Downloads/bookourspace-react` (local only)

## Scope delivered

Movies now shows **movies → nearby theatres → real showtimes** filtered by **city, area and PIN**. Booking, seat selection, payments, tickets and refunds are not rendered for Movies. The legacy booking engine and APIs remain in the codebase untouched but are unreachable from the Movies UI.

## Data model

Local migration `20261108120000_movies_showtimes_only.sql` (migration 70) adds to `public.cinema_screens`:

- `movie_title`, `movie_id`
- `city`, `pincode` (existing `area` reused)
- `is_visible` (default `true`)
- `showtime_source`, `showtimes_synced_at`
- public lookup index on `(is_visible, city, area, pincode)`

No fabricated showtimes are inserted by this change. The five existing local screen rows are shown as-is; screens without a movie title appear under **“Movie not assigned”** until a theatre/admin assigns one.

## API (server-authorized)

| Endpoint | Auth | Behaviour |
|---|---|---|
| `GET /api/movies/showtimes` | public | Visible screens only; optional `city`, `area`, `pin` filters; admins may request `includeHidden=1` |
| `PUT /api/movies/showtimes/:screenId` | admin or owning theatre provider | Updates movie title, city/area/PIN, showtimes (12-hour validation) and visibility; writes `showtime_source='manual'` |
| `POST /api/movies/showtimes/sync` | admin + `x-bos-sync-token` | Authorized daily sync; rejects invalid payloads; **503 `MOVIES_SYNC_NOT_CONFIGURED`** until `BOS_MOVIES_SYNC_TOKEN` (16+ chars) is provisioned |

No fake payment success or generated inventory exists on these paths.

## UI

- Movies → movie list → theatre screens → timing chips.
- Location filters: city select, area text, PIN input (digits, 6 max), reset.
- Admin/theatre “Manage” dialog edits movie title, city, area, PIN, showtimes and visibility.
- Hidden screens are excluded from public responses.
- Honest empty state: “No showtimes for this location yet… No placeholder showtimes are shown.”
- Explicit note: “No seats, tickets, payments or refunds.”

## Verification (local)

| Check | Evidence |
|---|---|
| API loads real screens | `GET /api/movies/showtimes` → 5 screens, `movies: []` (no titles yet) |
| Movies → theatres → times | Guest click on “Movie not assigned” shows AMB/Prasads/AAA theatres and their timings |
| City/area/PIN filters | Hyderabad filter + area/PIN fields render; test movie with `Hyderabad/Gachibowli/500032` filtered correctly |
| Visibility control | `is_visible=false` screen excluded from public list; restored afterwards |
| Admin manual update | `PUT` as admin → 200 with updated screen |
| Customer denied | `PUT` with customer token → **403** |
| Theatre owner denied/ allowed | Provider without ownership → **403**; with `live_edit_cinema_screen_owners` row → **200** (row cleaned up) |
| Daily sync guard | `POST /api/movies/showtimes/sync` → **503 MOVIES_SYNC_NOT_CONFIGURED** (honest, no token provisioned) |
| Movies E2E | Updated `app.smoke` test → **PASS** (real data only, no booking surfaces) |
| Unit/API | **317 tests, 299 pass, 0 fail, 18 skipped** |
| Typecheck/build | PASS (main and Capacitor) |
| Performance | Movies heading visible in **~1.04 s** on the local dev server; single inventory request, no booking bundle |
| Capacitor | Web source + migration 70 synced; Capacitor manifest PASS; **android/ios untouched** (same two untracked platform dirs) |

## Hidden booking surfaces (preserved)

- `MoviesAppExperience.tsx`, `DistrictMoviesSection.tsx` and their data module `src/data/moviesAppData.ts` were removed; only the showtimes UI and its API remain.
- Legacy booking/seat/payment/ticket/refund APIs remain for audit/rollback but no Movies UI calls them.
- The Movies admin style row was removed; the global listing grid is never rendered for Movies.

## Remaining gaps

1. **Movie titles not assigned** in the existing seed rows — the UI honestly groups them as “Movie not assigned”; an admin/theatre must set real titles.
2. **Daily sync not provisioned** — the endpoint exists and is guarded; no authorized provider/token is configured, so it returns 503.
3. **Native execution** — Android/iOS not run (no emulator/simulator); Capacitor web source synced, platform files preserved, `cap sync` not run.
4. Movies booking E2E is intentionally no longer applicable; the old booking specs remain untouched for other modules.
5. Other five modules (PG, Classes, Venues, Services, Stays) were not changed; their suites remain the existing baseline.

No hosted database changes, push, merge, payment or deployment were performed.


## 11. Finalization — completeness, dates and last-updated (2026-11-08)

### Public completeness rules (server-enforced)

A screen is returned by the public `GET /api/movies/showtimes` only when **all** of these hold:

1. `is_visible = true`
2. a real non-empty `movie_title`
3. a non-empty `cinema_title` (theatre)
4. `show_date is not null` **and** `show_date >= current_date`
5. at least one valid 12-hour timing in `showtimes[]`

Incomplete or expired rows remain in the table for admin repair but never appear publicly. This is why the five legacy local rows now produce the honest empty state: they have no movie title or show date. No titles/dates were fabricated.

### Manual updates

`PUT /api/movies/showtimes/:screenId` now **requires** `movieTitle`, a valid `showDate` (`YYYY-MM-DD`) and at least one valid timing; missing data returns **400** (`MOVIE_TITLE_REQUIRED`, `SHOW_DATE_REQUIRED`, `INVALID_SHOWTIMES`). Ownership checks are unchanged: admin 200; theatre owner 200; provider without ownership 403; customer 403.

### Last updated / empty state

- Public response includes `lastUpdated` (latest `updated_at`) and `checkedAt`.
- UI shows **“Last updated: …”** in the filter card and in the empty state; when no verified shows exist it says **“Last updated: no verified showtimes yet”**.
- Empty state: “No showtimes for this location yet… add a real movie title, theatre, date and timings. No placeholder showtimes are shown.”

### Daily sync

Still deliberately disabled: `POST /api/movies/showtimes/sync` returns **503 MOVIES_SYNC_NOT_CONFIGURED** until `BOS_MOVIES_SYNC_TOKEN` (16+ chars) and an authorized provider are provisioned. Sync now also rejects rows without a movie title or show date.

### Final evidence

| Check | Result |
|---|---|
| Incomplete public rows | `count 0`, `lastUpdated null` — excluded |
| Incomplete admin PUT | **400** |
| Complete future PUT | **200**; public `count 1`, movie/date/city/PIN/times returned |
| Expired show date | PUT 200 but public `count 0` — excluded |
| Filters | Hyderabad+Gachibowli+500032 → 1; wrong PIN → 0; Delhi → 0 |
| Last updated | present on public response and UI; empty message when none |
| Permissions | admin 200; owner provider 200; non-owner provider 403; customer 403 |
| Mobile 390×844 | no horizontal overflow; movie list + empty state render |
| Movies E2E | updated smoke **PASS** (no booking surfaces, real data only) |
| Unit/API | **318 tests, 300 pass, 0 fail, 18 skipped** |
| Typecheck/build | PASS (main + Capacitor) |
| Capacitor | migration 71 + web source synced; manifest PASS; android/ios untouched |

### Remaining gaps

- Legacy local screen rows have no real movie/date; admins must complete them before anything is public.
- Authorized daily sync provider/token not configured (endpoint returns 503).
- Android/iOS runtime tests remain BLOCKED (no emulator/simulator; platform files preserved, `cap sync` not run).
- Legacy booking/seat/payment APIs remain in code but are unreachable from the Movies UI.

## Orphaned API clients (audited 2026-11-10)

`src/lib/supabaseClient.ts` still exports three clients whose endpoints are not
part of Movies V1 and have no consumer in the app:

| Client | Target | Status |
|---|---|---|
| `fetchMoviesRealityAudit()` | `GET /api/movies/reality-audit` | No route exists. |
| `downloadBosMovieTicketPdf()` | `GET /api/movies/bookings/:id/ticket.pdf` | Blocked by the `MOVIES_V1_DISPLAY_ONLY` gate; no PDF renderer is configured server-side. |
| ticket resend | `POST /api/movies/bookings/:id/resend` | Blocked by the same gate; no transactional email provider is configured. |

No endpoint was implemented for these clients: V1 is display-only, no customer
movie booking can be created (`POST /api/bookings/atomic` answers 410 for a
cinema listing), and ticket delivery has no authorized backend data or provider.
Removing the clients would be a code change, not a feature change, so they are
left in place and remain unreachable.

#!/usr/bin/env bash
# =============================================================================
# Movies real-browser E2E.
#
# Boots its own disposable PostgreSQL cluster, real Express server and Vite dev
# middleware through supabase/tests/lib/booking_ui_harness.sh, then drives the
# real React app. Movies V1 is discovery + showtimes only
# (docs/movies-showtimes-only.md):
#
#   - the seeded cinema screen persisted in PostgreSQL is rendered with its
#     stored showtimes, and the hidden screen is not published
#   - no seat/ticket/payment surface exists for Movies
#   - /api/seats/*, /api/movies/bookings/* and /api/bookings/atomic refuse with
#     MOVIES_V1_DISPLAY_ONLY instead of creating inventory
#   - the same inventory is served after a server restart
#
# Seat availability, hold, booking and cancellation are BLOCKED by that product
# contract; the spec reports them as skipped rather than inventing a booking.
#
# No cloud database, no live payment provider and no mocked booking API is used.
# The signed session is injected into the browser storage the Google flow uses
# because OAuth credentials are absent here; every request is still verified by
# the server (HMAC session + DB role + RLS). Local test authentication only.
#
# Usage: bash supabase/tests/run_movies_ui_e2e.sh
# Exit:  0 = all checks passed, 1 = failure
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

source "$(dirname "${BASH_SOURCE[0]}")/lib/booking_ui_harness.sh"

MOVIE_TITLE="${E2E_MOVIES_TITLE:-E2E Cinema Feature}"
HIDDEN_TITLE="E2E Hidden Feature"

echo "=== 6. Movies discovery and display-only contract (Chromium) ==="
E2E_BASE_URL="$SERVER_URL" \
E2E_MOVIES_SESSIONS="$SESSIONS" \
E2E_MOVIES_TITLE="$MOVIE_TITLE" \
npx playwright test e2e/movies-showtimes.spec.ts --project=chromium --reporter=list \
  > "$OUT/playwright-movies.log" 2>&1 \
  || { tail -80 "$OUT/playwright-movies.log"; fail "Movies browser coverage (see $OUT/playwright-movies.log)"; }
grep -E "✓|passed|failed|skipped" "$OUT/playwright-movies.log" | tail -10 | sed 's/^/    /'
# The display-only cancellation test is intentionally skipped; the discovery and
# refusal tests must really pass, so a filtered run that skips everything fails.
grep -qE "2 passed" "$OUT/playwright-movies.log" \
  || { cat "$OUT/playwright-movies.log"; fail "Movies discovery/refusal tests did not both pass"; }

echo "=== 7. persisted Movies inventory (PostgreSQL is authoritative) ==="
VISIBLE_DB=$(pq -d "$DB" -tAc "select count(*) from public.cinema_screens where movie_title = '$MOVIE_TITLE'")
HIDDEN_DB=$(pq -d "$DB" -tAc "select count(*) from public.cinema_screens where movie_title = '$HIDDEN_TITLE'")
PUBLIC_JSON="$(curl -s "$SERVER_URL/api/movies/showtimes")"
PUBLIC_VISIBLE=$(printf '%s' "$PUBLIC_JSON" | grep -c "$MOVIE_TITLE" || true)
PUBLIC_HIDDEN=$(printf '%s' "$PUBLIC_JSON" | grep -c "$HIDDEN_TITLE" || true)
echo "    db_visible=$VISIBLE_DB db_hidden=$HIDDEN_DB api_visible=$PUBLIC_VISIBLE api_hidden=$PUBLIC_HIDDEN"
[ "$VISIBLE_DB" -ge 1 ] || fail "the seeded visible cinema screen is missing from PostgreSQL"
[ "$HIDDEN_DB" -ge 1 ] || fail "the seeded hidden cinema screen is missing from PostgreSQL"
[ "$PUBLIC_VISIBLE" -ge 1 ] || fail "/api/movies/showtimes did not publish the persisted screen"
[ "$PUBLIC_HIDDEN" = "0" ] || fail "/api/movies/showtimes published a screen that is not visible"

echo "=== 8. restart persistence ==="
stop_server
start_server
warm_dev_middleware
E2E_BASE_URL="$SERVER_URL" \
E2E_MOVIES_SESSIONS="$SESSIONS" \
E2E_MOVIES_TITLE="$MOVIE_TITLE" \
npx playwright test e2e/movies-showtimes.spec.ts --project=chromium \
  --grep "renders the persisted visible screen" --reporter=list \
  > "$OUT/playwright-movies-restart.log" 2>&1 \
  || { tail -60 "$OUT/playwright-movies-restart.log"; fail "Movies restart persistence (see $OUT/playwright-movies-restart.log)"; }
grep -E "✓|passed|failed|skipped" "$OUT/playwright-movies-restart.log" | tail -5 | sed 's/^/    /'
grep -qE "1 passed" "$OUT/playwright-movies-restart.log" \
  || { cat "$OUT/playwright-movies-restart.log"; fail "Movies restart persistence was skipped or did not pass"; }

echo "=== 9. verdict ==="
echo "    ALL MOVIES UI CHECKS PASSED (discovery+showtimes rendered from PostgreSQL, hidden screen unpublished, MOVIES_V1_DISPLAY_ONLY refusals, restart persistence; local signed test auth, not Google OAuth)"

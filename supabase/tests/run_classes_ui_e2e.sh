#!/usr/bin/env bash
# =============================================================================
# Classes & Training real-browser E2E.
#
# Creates a throwaway PostgreSQL cluster in a private temporary directory,
# applies the baseline schema and every migration, seeds test identities and
# approved course listings, boots the real Express server (Vite dev middleware
# serving the real React app), and drives:
#
#   trainer creates batch -> admin approves -> student discovers -> enrolls ->
#   duplicate refused -> My Classes -> cancellation -> restart persistence
#
# Venue mode (BOS_RUN_VENUE_ONLY=1) drives instead:
#   owner creates venue -> admin approves -> owner configures rates/calendar ->
#   customer books and cancels -> owner blocks/reschedules -> customer dispute ->
#   admin resolves -> signed Razorpay/UPI sandbox settlement and refund ->
#   cross-engine/mobile surface -> server-restart persistence.
#
# No cloud database, no live payment provider and no mocked booking API is used.
# The signed session is injected into the browser storage the Google flow uses
# because OAuth credentials are absent here; every request is still verified by
# the server (HMAC session + DB role + RLS). This is local test authentication,
# not a Google OAuth or hosted Supabase Auth session.
#
# Usage: bash supabase/tests/run_classes_ui_e2e.sh
#        BOS_RUN_VENUE_ONLY=1 bash supabase/tests/run_classes_ui_e2e.sh
# Exit:  0 = all checks passed, 1 = failure
# =============================================================================
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/booking_ui_harness.sh"

echo "=== 6. Playwright journey (Chromium) ==="
if [ "${BOS_RUN_VENUE_ONLY:-0}" != "1" ]; then
  E2E_BASE_URL="$SERVER_URL" \
  E2E_CLASS_SESSIONS="$SESSIONS" \
  E2E_RACE_COURSE_ID="class-e2e-race" \
  E2E_RACE_COURSE_TITLE="E2E Race Course" \
  E2E_COURSE_TITLE="E2E Algebra Course" \
  npx playwright test e2e/classes-training.spec.ts --project=chromium --reporter=list \
    > "$OUT/playwright-chromium.log" 2>&1 \
    || { tail -60 "$SERVER_LOG" >&2; tail -80 "$OUT/playwright-chromium.log"; fail "Chromium Classes journey (see $OUT/playwright-chromium.log)"; }
  grep -E "✓|passed|failed" "$OUT/playwright-chromium.log" | tail -12 | sed 's/^/    /'
else
  echo "    classes journey skipped by BOS_RUN_VENUE_ONLY=1"
fi

echo "=== 6b. Function Halls owner-create/admin-approve/customer/owner/admin browser journey ==="
E2E_BASE_URL="$SERVER_URL" \
E2E_VENUE_SESSIONS="$SESSIONS" \
E2E_VENUE_TITLE="$VENUE_TITLE" \
E2E_VENUE_SANDBOX_SECRET="$VENUE_SANDBOX_SECRET" \
npx playwright test e2e/venue-booking.spec.ts --project=chromium --grep-invert "persists venue" --reporter=list \
  > "$OUT/playwright-venues.log" 2>&1 \
  || { tail -140 "$OUT/playwright-venues.log"; fail "Chromium Function Halls browser journey (see $OUT/playwright-venues.log)"; }
grep -E "✓|passed|failed" "$OUT/playwright-venues.log" | tail -16 | sed 's/^/    /'

if [ "${BOS_RUN_VENUE_ONLY:-0}" = "1" ]; then
  VENUE_LISTING_ID=$(pq -d "$DB" -tAc "select id from public.listings where title='$VENUE_TITLE' and entity_type='venue' order by created_at desc limit 1")
  ACTIVE_VENUE=$(pq -d "$DB" -tAc "select count(*) from public.listings where id='$VENUE_LISTING_ID' and status='active'")
  VENUE_SETTINGS=$(pq -d "$DB" -tAc "select count(*) from public.venue_booking_settings where listing_id='$VENUE_LISTING_ID' and capacity=300 and setup_buffer_minutes=30 and cleanup_buffer_minutes=45")
  CANCELLED_VENUE=$(pq -d "$DB" -tAc "select count(*) from public.venue_bookings where listing_id='$VENUE_LISTING_ID' and status='cancelled'")
  OWNER_BLOCKS=$(pq -d "$DB" -tAc "select count(*) from public.venue_blocks where listing_id='$VENUE_LISTING_ID' and reason='Browser maintenance block'")
  DISPUTE_RESOLVED=$(pq -d "$DB" -tAc "select count(*) from public.venue_booking_disputes d join public.venue_bookings b on b.id=d.booking_id where b.listing_id='$VENUE_LISTING_ID' and d.status='resolved' and d.resolution like 'E2E admin resolved%'")
  RAZORPAY_REFUNDED=$(pq -d "$DB" -tAc "select count(*) from public.venue_payment_intents i join public.venue_bookings b on b.id=i.booking_id where b.listing_id='$VENUE_LISTING_ID' and i.provider='razorpay' and i.status='refunded'")
  UPI_VERIFIED=$(pq -d "$DB" -tAc "select count(*) from public.venue_payment_intents i join public.venue_bookings b on b.id=i.booking_id where b.listing_id='$VENUE_LISTING_ID' and i.provider='upi_webhook' and i.status='verified'")
  ADMIN_CATEGORIES=$(pq -d "$DB" -tAc "select count(*) from public.venue_category_events where category_id like 'venue-browser-%'")
  echo "    listing=$VENUE_LISTING_ID active=$ACTIVE_VENUE settings=$VENUE_SETTINGS cancelled=$CANCELLED_VENUE owner_blocks=$OWNER_BLOCKS resolved_disputes=$DISPUTE_RESOLVED razorpay_refunded=$RAZORPAY_REFUNDED upi_verified=$UPI_VERIFIED category_audits=$ADMIN_CATEGORIES"
  [ -n "$VENUE_LISTING_ID" ] && [ "$ACTIVE_VENUE" = "1" ] && [ "$VENUE_SETTINGS" = "1" ] && [ "$CANCELLED_VENUE" -ge 2 ] && [ "$OWNER_BLOCKS" = "1" ] && [ "$DISPUTE_RESOLVED" = "1" ] && [ "$RAZORPAY_REFUNDED" = "1" ] && [ "$UPI_VERIFIED" = "1" ] && [ "$ADMIN_CATEGORIES" -ge 1 ] || fail "venue browser state was not persisted correctly"

  echo "=== 6c. cross-engine and mobile/tablet venue surface ==="
  FIREFOX=0; WEBKIT=0
  node -e 'const {firefox}=require("playwright");firefox.launch().then(b=>b.close()).then(()=>process.exit(0)).catch(()=>process.exit(1))' && FIREFOX=1
  node -e 'const {webkit}=require("playwright");webkit.launch().then(b=>b.close()).then(()=>process.exit(0)).catch(()=>process.exit(1))' && WEBKIT=1
  echo "    firefox=$([ "$FIREFOX" = 1 ] && echo available || echo BLOCKED) webkit=$([ "$WEBKIT" = 1 ] && echo available || echo BLOCKED)"
  for ENGINE in chromium firefox webkit; do
    if [ "$ENGINE" = "firefox" ] && [ "$FIREFOX" != "1" ]; then continue; fi
    if [ "$ENGINE" = "webkit" ] && [ "$WEBKIT" != "1" ]; then continue; fi
    echo "    running $ENGINE mobile/tablet venue surface"
    E2E_BASE_URL="$SERVER_URL" E2E_VENUE_SESSIONS="$SESSIONS" E2E_VENUE_TITLE="$VENUE_TITLE" \
      npx playwright test e2e/venue-booking-cross-browser.spec.ts --project="$ENGINE" --reporter=list \
      > "$OUT/playwright-venue-$ENGINE.log" 2>&1 \
      || { tail -60 "$OUT/playwright-venue-$ENGINE.log"; fail "$ENGINE mobile/tablet venue surface (see $OUT/playwright-venue-$ENGINE.log)"; }
    grep -E "✓|passed|failed" "$OUT/playwright-venue-$ENGINE.log" | tail -4 | sed 's/^/      /'
  done

  echo "=== 6d. venue server-restart persistence ==="
  RESTART_REF=$(pq -d "$DB" -tAc "select b.booking_ref from public.venue_bookings b join public.venue_booking_disputes d on d.booking_id=b.id where b.listing_id='$VENUE_LISTING_ID' and d.status='resolved' order by d.resolved_at desc limit 1")
  [ -n "$RESTART_REF" ] || fail "no resolved-dispute booking reference for restart test"
  stop_server
  start_server
  echo "    warming the restarted Vite middleware before persistence assertions"
  warm_dev_middleware
  E2E_PHASE_TWO=1 \
  E2E_BASE_URL="$SERVER_URL" \
  E2E_VENUE_SESSIONS="$SESSIONS" \
  E2E_VENUE_TITLE="$VENUE_TITLE" \
  E2E_VENUE_SANDBOX_SECRET="$VENUE_SANDBOX_SECRET" \
  E2E_RESTART_BOOKING_REF="$RESTART_REF" \
  npx playwright test e2e/venue-booking.spec.ts --project=chromium --grep "persists venue" --reporter=list \
    > "$OUT/playwright-venue-restart.log" 2>&1 \
    || { tail -60 "$OUT/playwright-venue-restart.log"; fail "venue restart persistence (see $OUT/playwright-venue-restart.log)"; }
  grep -E "✓|passed|failed|skipped" "$OUT/playwright-venue-restart.log" | tail -6 | sed 's/^/    /'
  grep -q "1 passed" "$OUT/playwright-venue-restart.log" \
    || { cat "$OUT/playwright-venue-restart.log"; fail "venue restart persistence was skipped or did not pass"; }

  CANCELLED_AFTER=$(pq -d "$DB" -tAc "select count(*) from public.venue_bookings where listing_id='$VENUE_LISTING_ID' and status='cancelled'")
  RESOLVED_AFTER=$(pq -d "$DB" -tAc "select count(*) from public.venue_booking_disputes d join public.venue_bookings b on b.id=d.booking_id where b.listing_id='$VENUE_LISTING_ID' and d.status='resolved'")
  [ "$CANCELLED_AFTER" = "$CANCELLED_VENUE" ] && [ "$RESOLVED_AFTER" = "$DISPUTE_RESOLVED" ] || fail "restart changed persisted venue state"
  echo "    ALL FUNCTION HALLS UI CHECKS PASSED (create/approve/booking/cancellation/dispute/payment/restart; local signed test auth, not Google OAuth; signed sandbox webhooks only, no live PSP)"
  exit 0
fi

echo "=== 7. database assertions after the journey ==="
CANCELLED=$(pq -d "$DB" -tAc "select count(*) from public.class_enrollments where status = 'cancelled'")
CONFIRMED=$(pq -d "$DB" -tAc "select count(*) from public.class_enrollments where status = 'confirmed'")
PAID=$(pq -d "$DB" -tAc "select count(*) from public.class_enrollments where payment_status = 'verified'")
RACE_CONFIRMED=$(pq -d "$DB" -tAc "
  select count(*) from public.class_enrollments e
  join public.class_batches b on b.id = e.batch_id
  where b.title = 'E2E Race Batch' and e.status = 'confirmed'")
echo "    cancelled=$CANCELLED confirmed=$CONFIRMED verified_payments=$PAID race_confirmed=$RACE_CONFIRMED"
[ "$CANCELLED" -ge 1 ] || fail "no cancelled enrollment was persisted"
[ "$CONFIRMED" -ge 1 ] || fail "no confirmed enrollment was persisted"
[ "$PAID" = "0" ] || fail "a paid enrollment was fabricated without provider evidence"
[ "$RACE_CONFIRMED" = "1" ] || fail "the last seat race produced $RACE_CONFIRMED confirmed enrollments"

echo "=== 8. cross-browser availability ==="
FIREFOX=0; WEBKIT=0
node -e 'const {firefox}=require("playwright");firefox.launch().then(b=>b.close()).then(()=>process.exit(0)).catch(()=>process.exit(1))' && FIREFOX=1
node -e 'const {webkit}=require("playwright");webkit.launch().then(b=>b.close()).then(()=>process.exit(0)).catch(()=>process.exit(1))' && WEBKIT=1
echo "    firefox=$([ "$FIREFOX" = 1 ] && echo available || echo BLOCKED) webkit=$([ "$WEBKIT" = 1 ] && echo available || echo BLOCKED)"
for ENGINE in firefox webkit; do
  if [ "$ENGINE" = "firefox" ] && [ "$FIREFOX" = "1" ]; then FLAG="E2E_INCLUDE_FIREFOX=1"; elif [ "$ENGINE" = "webkit" ] && [ "$WEBKIT" = "1" ]; then FLAG="E2E_INCLUDE_WEBKIT=1"; else continue; fi
  echo "    running $ENGINE cross-browser surface"
  env $FLAG E2E_BASE_URL="$SERVER_URL" E2E_CLASS_SESSIONS="$SESSIONS" \
    npx playwright test e2e/classes-training.spec.ts --project="$ENGINE" --grep "cross-browser" --reporter=list \
    > "$OUT/playwright-$ENGINE.log" 2>&1 \
    || { tail -40 "$OUT/playwright-$ENGINE.log"; fail "$ENGINE cross-browser surface (see $OUT/playwright-$ENGINE.log)"; }
    grep -qE "[0-9]+ passed" "$OUT/playwright-$ENGINE.log" \
      || { cat "$OUT/playwright-$ENGINE.log"; fail "$ENGINE cross-browser surface was skipped"; }
done

echo "=== 9. restart persistence ==="
stop_server
start_server
# A fresh Vite middleware instance can return 504 (Outdated Optimize Dep)
# until its optimized dependencies and React entrypoint are warmed. Mount the
# real shell before Playwright's restart assertions, as in the first phase.
warm_dev_middleware
E2E_PHASE_TWO=1 \
E2E_BASE_URL="$SERVER_URL" \
E2E_CLASS_SESSIONS="$SESSIONS" \
E2E_COURSE_TITLE="E2E Algebra Course" \
npx playwright test e2e/classes-training.spec.ts --project=chromium --grep "persists after a server restart" --reporter=list \
  > "$OUT/playwright-restart.log" 2>&1 \
  || { tail -40 "$OUT/playwright-restart.log"; fail "restart persistence (see $OUT/playwright-restart.log)"; }
grep -E "✓|passed|failed|skipped" "$OUT/playwright-restart.log" | tail -5 | sed 's/^/    /'
# A filtered/skipped restart test exits 0 with no assertions; require a real pass.
grep -q "1 passed" "$OUT/playwright-restart.log" \
  || { cat "$OUT/playwright-restart.log"; fail "classes restart persistence was skipped or did not pass"; }

echo "=== 10. verdict ==="
echo "    ALL CLASSES UI CHECKS PASSED (chromium journey, cancelled=$CANCELLED, race_confirmed=$RACE_CONFIRMED, verified_payments=0)"

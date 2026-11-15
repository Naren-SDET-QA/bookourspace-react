#!/usr/bin/env bash
# =============================================================================
# External-provider E2E gate: Google OAuth sign-in and Razorpay Test Mode.
#
# These two flows cannot be verified locally: they need real external
# credentials and a real provider round trip. This script never fabricates a
# pass. It validates that credentials with the correct shape are present and
# refuses live keys outright.
#
# Exit codes:
#   0 = credentials present AND an external verification was observed by a
#       caller-supplied command (BOS_EXTERNAL_VERIFY_CMD)
#   3 = BLOCKED — missing credentials or no verification command
#   4 = credentials present but no external verification was run
#   2 = refused — live credentials or malformed values
#
# Required (never printed by this script):
#   Razorpay test mode: RAZORPAY_KEY_ID (rzp_test_...), RAZORPAY_KEY_SECRET,
#                       RAZORPAY_WEBHOOK_SECRET
#   Google OAuth E2E:   BOS_GOOGLE_TEST_EMAIL, BOS_GOOGLE_TEST_PASSWORD
#                       (the OAuth client id/secret live in the hosted Supabase
#                       project, not in this repo)
# =============================================================================
set -uo pipefail

missing=()
present=()
refused=()

require() { # name, description
  local value="${!1:-}"
  if [ -z "$value" ]; then missing+=("$1 ($2)"); else present+=("$1"); fi
}

require RAZORPAY_KEY_ID "Razorpay test key id"
require RAZORPAY_KEY_SECRET "Razorpay test key secret"
require RAZORPAY_WEBHOOK_SECRET "Razorpay webhook signing secret"
require BOS_GOOGLE_TEST_EMAIL "Google test account email"
require BOS_GOOGLE_TEST_PASSWORD "Google test account password"

if [ -n "${RAZORPAY_KEY_ID:-}" ] && [[ "${RAZORPAY_KEY_ID}" == rzp_live_* ]]; then
  refused+=("RAZORPAY_KEY_ID is a LIVE key — test mode only")
fi
if [ -n "${RAZORPAY_KEY_ID:-}" ] && [[ "${RAZORPAY_KEY_ID}" != rzp_test_* ]]; then
  refused+=("RAZORPAY_KEY_ID must start with rzp_test_")
fi

echo "external providers: Razorpay Test Mode + Google OAuth"
if [ ${#present[@]} -gt 0 ]; then
  echo "    present: ${present[*]}"
fi
if [ ${#refused[@]} -gt 0 ]; then
  echo "    REFUSED: ${refused[*]}" >&2
  exit 2
fi
if [ ${#missing[@]} -gt 0 ]; then
  echo "    missing: ${missing[*]}"
  echo
  echo "BLOCKED: external verification cannot run."
  echo "  Razorpay Test Mode needs dashboard-issued rzp_test_* keys and a webhook"
  echo "  secret; settlement is only accepted from a signed provider event."
  echo "  Google OAuth needs a real Google test account and the hosted Supabase"
  echo "  Google provider configuration. Neither value is ever committed."
  exit 3
fi

if [ -z "${BOS_EXTERNAL_VERIFY_CMD:-}" ]; then
  echo
  echo "BLOCKED: credentials are present, but no external verification was run."
  echo "  Set BOS_EXTERNAL_VERIFY_CMD to the command that performs the real round"
  echo "  trip (browser sign-in + a test-mode payment with a signed webhook)."
  exit 4
fi

echo "=== running external verification ==="
# shellcheck disable=SC2086
if eval "$BOS_EXTERNAL_VERIFY_CMD"; then
  echo "PASS external verification command succeeded"
  exit 0
fi
echo "FAILED: external verification command failed" >&2
exit 1

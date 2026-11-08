#!/usr/bin/env bash
# Build BookOurSpace Android/iOS release artifacts against the approved HTTPS
# API origin. This script NEVER uploads, submits, signs in to a store, or
# deploys anything.
#
# Usage:
#   VITE_NATIVE_API_ORIGIN="https://<cloud-run-status-url>" \
#     VITE_ENABLE_DEMO_DATA=false VITE_BOS_LOCAL_DEV_AUTH=0 \
#     bash deploy/native/build-production.sh --verify
#   ... --android   # produces a signed AAB if android/key.properties exists
#   ... --ios       # produces an archive if DEVELOPMENT_TEAM is set
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MODE="${1:---verify}"
ORIGIN="${VITE_NATIVE_API_ORIGIN:-}"

if [[ -z "$ORIGIN" ]]; then
  echo "BLOCKER: VITE_NATIVE_API_ORIGIN is unset. Resolve it from Cloud Run status.url after approval." >&2
  exit 2
fi
if [[ ! "$ORIGIN" =~ ^https://[^/]+$ ]]; then
  echo "BLOCKER: VITE_NATIVE_API_ORIGIN must be an HTTPS origin with no path: $ORIGIN" >&2
  exit 2
fi
if [[ "$ORIGIN" == *".supabase.co"* ]]; then
  echo "BLOCKER: VITE_NATIVE_API_ORIGIN must be the BookOurSpace API, not Supabase." >&2
  exit 2
fi
if [[ "${VITE_ENABLE_DEMO_DATA:-false}" != "false" ]]; then
  echo "BLOCKER: VITE_ENABLE_DEMO_DATA must be false for release builds." >&2
  exit 2
fi
if [[ "${VITE_BOS_LOCAL_DEV_AUTH:-0}" == "1" || "${BOS_LOCAL_DEV_AUTH:-0}" == "1" ]]; then
  echo "BLOCKER: local/demo authentication flags must be disabled." >&2
  exit 2
fi
for flag in BOS_PAYMENT_SANDBOX BOS_UPI_SANDBOX BOS_VENUE_PAYMENT_SANDBOX; do
  if [[ "${!flag:-0}" == "1" ]]; then
    echo "BLOCKER: ${flag} must be disabled for release builds." >&2
    exit 2
  fi
done
if [[ "${BOS_STAY_ALLOW_DEMO_BOOKING:-0}" == "1" || "${BOS_STAY_INCLUDE_DEMO:-0}" == "1" ]]; then
  echo "BLOCKER: demo stay flags must be disabled for release builds." >&2
  exit 2
fi
if [[ -z "${VITE_SUPABASE_URL:-}" || -z "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" ]]; then
  echo "BLOCKER: export the public VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for the release build." >&2
  exit 2
fi

# No live-reload server URL may be bundled into a release shell.
if grep -RIn --include='capacitor.config.*' -E 'url:[[:space:]]*["'"'"']https?://' capacitor.config.ts android ios 2>/dev/null; then
  echo "BLOCKER: a live-reload server.url is configured for a release build." >&2
  exit 2
fi
if grep -RIn --include='AndroidManifest.xml' 'usesCleartextTraffic="true"' android 2>/dev/null; then
  echo "BLOCKER: Android cleartext traffic is enabled." >&2
  exit 2
fi
if grep -RIn --include='Info.plist' -A 3 'NSAllowsArbitraryLoads' ios 2>/dev/null | grep -q '<true/>'; then
  echo "BLOCKER: iOS ATS arbitrary loads are enabled." >&2
  exit 2
fi

echo "Native origin: $ORIGIN"
echo "Demo data/auth: disabled; payment sandbox: disabled"
npm ci
VITE_NATIVE_API_ORIGIN="$ORIGIN" \
VITE_ENABLE_DEMO_DATA=false \
VITE_BOS_LOCAL_DEV_AUTH=0 \
VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
VITE_SUPABASE_PROJECT_ID="${VITE_SUPABASE_PROJECT_ID:-obkfgxjzlscungkhbyvq}" \
VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-$VITE_SUPABASE_PUBLISHABLE_KEY}" \
npm run build
npx cap sync

case "$MODE" in
  --verify)
    echo "VERIFIED: web bundle + Capacitor sync completed. No signed artifact produced."
    ;;
  --android)
    if [[ ! -f android/key.properties ]]; then
      echo "BLOCKER: android/key.properties (release signing) is missing." >&2
      exit 2
    fi
    (cd android && ./gradlew bundleRelease)
    echo "Android AAB: android/app/build/outputs/bundle/release/app-release.aab"
    ;;
  --ios)
    if [[ -z "${DEVELOPMENT_TEAM:-}" ]]; then
      echo "BLOCKER: DEVELOPMENT_TEAM is unset; Xcode signing cannot be resolved." >&2
      exit 2
    fi
    xcodebuild -project ios/App/App.xcodeproj -scheme App \
      -configuration Release -destination 'generic/platform=iOS' \
      -archivePath build/BookOurSpace.xcarchive archive \
      DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM"
    echo "iOS archive: build/BookOurSpace.xcarchive"
    ;;
  *)
    echo "Usage: $0 [--verify|--android|--ios]" >&2
    exit 2
    ;;
esac

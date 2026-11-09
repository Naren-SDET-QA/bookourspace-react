# Native Android/iOS production build

The native shell bundles `dist` and calls the BookOurSpace HTTPS API through
`VITE_NATIVE_API_ORIGIN`. The origin is resolved from Cloud Run `status.url`
after deployment; never invent it.

## Release inputs (export, do not commit)

```bash
export VITE_NATIVE_API_ORIGIN="$(gcloud run services describe bookourspace-api \
  --region asia-south1 --format='value(status.url)')"
export VITE_SUPABASE_URL="https://obkfgxjzlscungkhbyvq.supabase.co"
export VITE_SUPABASE_PUBLISHABLE_KEY="<public publishable/anon key>"
export VITE_ENABLE_DEMO_DATA=false
export VITE_BOS_LOCAL_DEV_AUTH=0
export BOS_PAYMENT_SANDBOX=0
export BOS_UPI_SANDBOX=0
export BOS_VENUE_PAYMENT_SANDBOX=0
export BOS_STAY_INCLUDE_DEMO=0
export BOS_STAY_ALLOW_DEMO_BOOKING=0
```

`VITE_NATIVE_API_ORIGIN` must be `https://…` with no path and must not be the
Supabase host — the build script rejects both.

## Verify configuration (no signed artifact)

```bash
bash deploy/native/build-production.sh --verify
```

This runs `npm ci`, the production web build and `npx cap sync`, and rejects:

- missing/non-HTTPS API origin or the Supabase host
- `VITE_ENABLE_DEMO_DATA` not `false`
- local demo auth / payment sandbox / demo stay flags
- a live-reload `server.url`
- Android `usesCleartextTraffic="true"`
- iOS `NSAllowsArbitraryLoads`

## Android release AAB

Create `android/key.properties` and a release keystore **outside version
control** (for example via your CI secret store), configure signing in
`android/app/build.gradle`, then:

```bash
bash deploy/native/build-production.sh --android
# output: android/app/build/outputs/bundle/release/app-release.aab
```

Bump `versionCode`/`versionName` before each store release. The script does not
upload to Play Console.

## iOS archive

Requires an Apple Developer team and provisioning profile:

```bash
export DEVELOPMENT_TEAM="<apple-team-id>"
bash deploy/native/build-production.sh --ios
# output: build/BookOurSpace.xcarchive
```

The script does not upload to App Store Connect. Archive/export/signing remain
manual, approved steps.

## Store/security notes

- Android release uses HTTPS-only networking; do not add cleartext exceptions.
- iOS ATS must not allow arbitrary loads.
- Demo auth and sandbox payment flags are rejected by the build script.
- The API CORS allowlist on Cloud Run is exactly
  `capacitor://localhost,https://localhost`.
- Rotating the Cloud Run URL requires rebuilding the native app; the origin is
  compiled into the bundle.

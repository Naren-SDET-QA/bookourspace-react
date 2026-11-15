# BookOurSpace Recovery Missing Features and Risks

Date: 2026-11-15

## Confirmed missing from canonical recovery

No requested business feature was conclusively proven absent from /Users/aa/Projects/bookourspace-final during this read-only pass. The canonical tree contains source and tests for WhatsApp, Resend, GPS, providers, authentication, admin, PG, stays, venues, movies, services, classes, institutes, payments, migrations, security, and CI.

This conclusion is deliberately limited: file presence is not runtime proof.

## Work requiring verification

1. Dirty canonical files: server.ts and src/components/AdminDashboard.tsx are modified outside expected HEAD, and e2e-artifacts/ is untracked.
2. Downloaded GPS dashboard: /Users/aa/Downloads/bookourspace-react/src/components/ProviderDashboard.tsx is modified and must be compared.
3. WhatsApp webhook verification, credentials, callback routing, and idempotency remain environment-dependent.
4. Resend server key/from-address configuration and safe test recipient remain environment-dependent.
5. GPS permission behavior and realtime provider/customer synchronization need runtime validation.
6. Google OAuth/OTP hosted callback and provider configuration need validation.
7. Provider/admin business scope and RLS need disposable database validation.
8. No canonical supabase/functions implementation was identified; confirm whether external hosted functions exist.
9. Capacitor native execution was not proven.

## Newer or potentially better work outside canonical

- origin/feat/universal-gps-tracking at 96c1297 and its downloaded checkout contain tracking/business lineage; canonical has later ownership and tracking migrations.
- origin/dev and provider branches contain visual/provider-shell changes; evaluate as UI deltas, not wholesale merges.
- origin/codex/fix-listing-images at ca34b5a contains earlier PG owner workspace work.
- origin/feat/movies-upi-payment at 4526d11 and nested movies-upi-payment contain standalone payment/refund behavior; they are not migration-compatible replacements.

## Duplicate/conflicting implementations

- Auth: canonical Supabase/server path versus nested movie app auth client.
- Admin: canonical admin console versus nested movie app admin console.
- Payment: canonical vertical APIs versus nested standalone payment server.
- Movie data/UI: canonical showtimes-only product versus nested full application.
- Migrations/RLS: canonical ordered migration chain versus nested monolithic schema/RLS.
- Native/web: Capacitor platform files versus canonical web source.

## Configuration and dependency gaps

- Server-side WhatsApp/Evolution configuration.
- Server-side Resend configuration.
- Supabase project URL/service-role configuration and migration state.
- Google OAuth client and callback configuration.
- Razorpay/UPI sandbox credentials and webhook secrets.
- Device/browser geolocation permissions and realtime support.
- Disposable database and test fixtures.

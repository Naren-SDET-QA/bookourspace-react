# Google-only OAuth QA runbook

Status: prepared; real OAuth has not been run. Use only an explicitly approved
non-production Supabase project and Google QA identities. This runbook creates
Auth users/sessions and includes an irreversible account-closure case, so get
separate approval before starting it. Never run it against production.

## Preflight

1. Confirm the project owner has identified the target as non-production and
   approved its Auth and profile writes. Confirm no real payments are enabled.
2. Configure Google as the only enabled OAuth provider. The Google Cloud
   authorized redirect URI is
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Add the QA Web origin's `/auth/callback` and the native
   `com.bookourspace.app://auth/callback` URI to Supabase's allowed redirect
   URLs. Native builds return to the app's custom scheme; Android and iOS
   register it. Keep Google Cloud's callback pointed at Supabase, not directly
   at the app.
4. In each repository run `npm run audit:oauth`. Confirm the configured URL,
   project id and callback match the approved QA environment. Do not paste
   OAuth tokens or client secrets into logs.
5. Prepare separate, owner-authorized new Google QA identities for first-use
   coverage. Reuse each identity for that platform's returning-login checks.

## Web, Android and iOS journey

Run these steps on each platform, recording the platform, build, QA identity
label (not its token), UTC time, outcome and redacted evidence:

1. **First signup:** choose Google from the Welcome screen and complete the
   provider consent flow. Verify callback returns to BookOurSpace, the Auth
   identity is verified, and the server provisions the account with the
   customer role. Capture the resulting profile UUID for test correlation.
2. **Returning login:** sign out, sign in again with the same Google identity,
   and verify the same Auth UUID and profile are used.
3. **Persistence:** force-close/reload the browser or native app, relaunch, and
   verify the valid session restores the signed-in profile. Confirm protected
   screens remain available without repeating login.
4. **Profile update:** change display name and phone in Profile, save, reload,
   and verify the values persisted. Confirm role and account-status fields
   cannot be changed by the client.
5. **Server role enforcement:** with the customer session, attempt a provider
   registration and a forged privileged role through the real API. Verify the
   server accepts only the provider-application flow and rejects client role
   assignment. Verify provider-only routes return 403 until an authorized
   server/admin approval exists.
6. **Logout:** sign out, restart the app, and open a protected route directly.
   Verify the session is cleared and the route redirects to the signed-out
   state; protected API calls return 401.

Platform-specific callback checks:

- **Web:** verify the callback remains on the QA origin at `/auth/callback`.
- **Android:** verify `com.bookourspace.app://auth/callback` reopens the app
  and the authorization code is exchanged once.
- **iOS:** verify the same custom scheme reopens the app and the code is
  exchanged once after backgrounding or force-closing during Google consent.

## Closed-account stale-token check

Use a separate disposable QA identity with no live bookings, payments or
provider assets. First record the token expiry and obtain an unexpired signed
access token. Close the account through the authorized server endpoint after
recent authentication, then replay the still-unexpired token against profile
read, provider registration, and private avatar/cover media access. All must be
denied; sessions must be revoked; the closure audit and any seeded financial
records must remain. Do not use a customer's account or create financial test
records in a live environment.

## Evidence and stop conditions

Record PASS/FAIL/BLOCKED for each step separately on Web, Android and iOS.
Redact authorization codes, access/refresh tokens, phone numbers and private
profile fields. Stop if the project identity is ambiguous, a callback targets
production, the provider list is not Google-only, a role can be assigned by a
client, or account closure would affect non-test records.

The repository's simulated OAuth and unexpired-claim tests are useful local
checks but do not substitute for this real Google-provider journey.

# Google-only sign-in setup (manual; no Dashboard changes made)

Apply these steps only after explicitly approving the Mumbai production
configuration. Configure the Supabase project `obkfgxjzlscungkhbyvq`.

## Google Cloud Console

1. In Google Cloud Console, select the BookOurSpace project. Configure the
   OAuth consent screen/Google Auth Platform branding and audience, and add
   the required app name, support email, contact email, and approved domains.
   Use only the basic identity scopes (`openid`, `email`, `profile`).
2. **Reuse the existing OAuth 2.0 Web client.** A Google Web client accepts
   any number of authorized redirect URIs, so one client can serve both
   Supabase projects. Do **not** create a second client or a second
   Google Cloud project unless the existing client is proven unusable; a
   duplicate client would split the consent screen and the audit trail.
3. Add each exact BookOurSpace origin to **Authorized JavaScript origins**:
   the production origin and any explicitly approved staging/local origins.
4. In that same client's **Authorized redirect URIs**, add the Mumbai
   callback and **keep the Stockholm callback**:
   - `https://obkfgxjzlscungkhbyvq.supabase.co/auth/v1/callback` (add)
   - `https://ezrxykyocgbolpaebnqx.supabase.co/auth/v1/callback` (keep)
   (If the Supabase Dashboard shows a different callback for the verified
   project, use the Dashboard value exactly.)
5. Save the client ID and client secret in the approved password manager,
   and reuse those same values in the Mumbai Supabase project. Never put
   the client secret in Vite variables, browser code, Git, or chat.

## Supabase Dashboard

1. Verify the Dashboard project reference is `obkfgxjzlscungkhbyvq`.
2. Open **Authentication → Sign In / Providers → Google**. Enable Google and
   enter the **same** Google OAuth client ID and client secret that the
   existing Stockholm project uses. Save.
3. Open **Authentication → URL Configuration**. Set **Site URL** to the
   production React origin. Under **Redirect URLs**, allow the React app's
   exact post-login callback, such as `https://<production-host>/auth/callback`
   and, if needed, `http://localhost:5173/auth/callback`. The Supabase URL
   `https://obkfgxjzlscungkhbyvq.supabase.co/auth/v1/callback` belongs in the
   Google Cloud OAuth client's **Authorized redirect URIs** (step 4 above),
   not in Supabase's post-login Redirect URLs. Do not add broad preview
   wildcards for production.
4. Under **Authentication → Sign In / Providers**, disable the Email and Phone
   providers so password, email OTP/magic-link, and phone OTP sign-in cannot be
   used. Keep Google enabled. Review any anonymous sign-in setting and leave it
   disabled.
5. Keep the existing Auth configuration unchanged until a separately approved
   rollout window. Validate new Google signup, existing account login, inactive
   account denial, and redirect allowlisting on a non-production project first.

The app currently delegates OAuth to Supabase and verifies the resulting
access token server-side using Supabase Auth. New accounts receive the
`customer` role; an existing database role is retained. The email-provider
toggle is a hosted configuration change and was not changed here.

The offline verification for this setup is in
[`GOOGLE_OAUTH_MUMBAI_REPORT.md`](GOOGLE_OAUTH_MUMBAI_REPORT.md), with the
repeatable checks `npm run audit:oauth` and `npm run test:db:mumbai-oauth`.

References: [Supabase Google sign-in setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls),
[Supabase Auth provider configuration](https://supabase.com/docs/guides/auth/general-configuration),
[Google OAuth web server setup](https://developers.google.com/identity/protocols/oauth2/web-server).

# BookOurSpace — Final Full Repository

Full-stack BookOurSpace marketplace for PGs, Classes, Function Halls, Home Services, Stays and Movies — with server-authoritative bookings, admin controls, Style 1/2/3 layouts and the dynamic Classes course detail sheet.

This `main` branch is the **complete repository**: application, server, tests, e2e, Android/iOS Capacitor projects, deployment configuration and Supabase migrations.

## Google AI Studio

Import **Naren-SDET-QA/bookourspace-react → main** into a **new** AI Studio app. AI Studio imports a snapshot and does not sync an existing app.

Add in **AI Studio → Settings → Secrets**:

- `BOS_LISTINGS_DATABASE_URL` — Supabase Mumbai pooler URL with `sslmode=verify-full`
- `BOS_SERVER_HMAC_SECRET` — 64+ random characters
- `SUPABASE_SECRET_KEY` — server-only
- `VITE_SUPABASE_URL=https://obkfgxjzlscungkhbyvq.supabase.co`
- `VITE_SUPABASE_PROJECT_ID=obkfgxjzlscungkhbyvq`
- `VITE_SUPABASE_PUBLISHABLE_KEY` — public publishable/anon key
- `GEMINI_API_KEY` — usually injected by AI Studio

Then `npm install` and `npm run dev`. The server intentionally fails closed without PostgreSQL in production. Inside Google AI Studio (`/app/applet`) it now boots in **demo mode without a database** so the preview loads; set `BOS_LISTINGS_DATABASE_URL` (or `BOS_AI_STUDIO_PREVIEW=1` explicitly) to enable server-authoritative features.

## Full local development

```bash
npm install
npm run dev:local   # starts the bundled local PostgreSQL workflow
npm run lint
npm run build
npm test            # unit/API tests
npm run e2e         # Playwright Chromium
```

`npm run dev` starts the server directly and expects a configured PostgreSQL URL; use `dev:local` on a developer machine.

## Native

```bash
npm run cap:sync
npm run cap:open:android
npm run cap:open:ios
```

Android/iOS source is included. Release signing keys, `android/local.properties`, keystores and store credentials are intentionally not committed.

## Included

- Complete `src/`, `server.ts`, `public/`
- Style 1/2/3 and dynamic Classes detail
- `tests/`, `e2e/`, Playwright config
- Android and iOS Capacitor projects (source only)
- `deploy/` Cloud Run/native production configuration
- Full `supabase/` migrations and test tooling
- `scripts/`, `patches/`, AI Studio metadata

## Security

Never put a database password, HMAC secret, service-role key or `sb_secret_` value in any `VITE_*` variable. Only public client IDs/URLs belong there.

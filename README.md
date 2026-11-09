# BookOurSpace — Final AI Studio repo

Full-stack BookOurSpace marketplace: PGs, Classes, Function Halls, Home Services, Stays, Movies, admin controls, bookings, Style 1/2/3 layouts and the dynamic Classes course-detail sheet.

## Open in Google AI Studio

1. Open **https://ai.studio/apps** and create/import an app.
2. AI Studio imports from a **GitHub repository** (recommended) or you can paste this project into a new AI Studio app.
3. Add the required values in **AI Studio → Settings → Secrets** (never in committed files):
   - `BOS_LISTINGS_DATABASE_URL` — Supabase Mumbai pooler URL with `sslmode=verify-full`
   - `BOS_SERVER_HMAC_SECRET` — 64+ random characters
   - `SUPABASE_SECRET_KEY` — server-only Supabase secret key
   - `VITE_SUPABASE_URL=https://obkfgxjzlscungkhbyvq.supabase.co`
   - `VITE_SUPABASE_PROJECT_ID=obkfgxjzlscungkhbyvq`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — public publishable/anon key
   - `GEMINI_API_KEY` — AI Studio usually injects this automatically
4. Run `npm install`, then `npm run dev`.

`npm run dev` starts the full Express + Vite server. It requires the PostgreSQL URL above because the app is server-authoritative and intentionally fails closed without a database. For a local machine, `npm run dev:local` starts the bundled local PostgreSQL workflow instead.

## What is included

- Complete `src/`, `server.ts`, `public/`, `index.html`, Vite/TypeScript configs
- All six modules and their booking/inventory APIs
- Supabase schema and migrations in `supabase/`
- Seed/preflight scripts in `scripts/`
- Style 1/2/3 layouts and Classes course detail
- AI Studio `.aistudio/` metadata and `metadata.json`

## What is intentionally excluded

- `node_modules/`, `dist/`, logs, screenshots and local runtime JSON
- tests/e2e, native Android/iOS projects, Cloud Run deployment files
- all `.env` / secret files

These are development/deployment extras. No application runtime feature was removed.

## Security

Never put a database password, HMAC secret, service-role key or `sb_secret_` value in any `VITE_*` variable. Only the public Supabase URL/project/publishable key and public Razorpay key id belong in client variables.

## Local verification

```bash
npm install
npm run lint
npm run build
npm run dev:local   # local PostgreSQL + app
```

# Production build environment directory

`npm run build:production` sets `BOS_PRODUCTION_BUILD=1`, and `vite.config.ts`
then reads environment files from this directory instead of the repository
root. Vite loads `.env.local` in every mode, so without this separation a
developer's local development values (including the development Supabase
project) would be inlined into a production bundle.

Rules:

- Only public values belong here, and only ones that are safe to publish. Real
  production values are supplied by the deployment environment (Cloud Run job
  or CI secret store) as process environment variables, which Vite gives
  priority.
- Never put a secret, service-role key, database URL or private key in this
  directory or in any `VITE_*` variable.
- A committed `.env.production` here must contain no development project
  reference; `node scripts/verify-production-bundle.mjs` fails the build if one
  reaches the bundle.

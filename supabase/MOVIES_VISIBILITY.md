# Movies visibility operations

Project: `ezrxykyocgbolpaebnqx`. Migration `20261102124513` was applied directly through the authenticated Supabase CLI and recorded in migration history on 2026-11-02. The existing `public.tasks` table was not changed. No application deployment or Git push was performed.

## Runtime

- Public Movies uses `GET /api/public/movies` and an anonymous Supabase client, including for signed-in admins. The SQL function and table RLS enforce the visible theatre + movie + showtime hierarchy. Responses are `no-store`.
- The legacy `/api/movies/inventory` GET now uses that same filtered feed. It no longer exposes unfiltered local cinema inventory, customer bookings, refunds, support tickets or audit logs.
- Static/offline cinema listings are excluded from public marketplace searches and favourites. The original records and legacy implementation remain in source/storage; the public Movies view is display-only.
- If legacy `listings`/`cinema_screens` tables are installed later, the base schema adds restrictive read policies: public cinema browsing remains exclusively through the normalized visibility-aware feed. Old cinema data stays accessible to authorized Movies admins.
- Visibility changes commit with their audit entries in one transaction. Version checks reject stale edits; bulk edits roll back together. Permission revocation and edits share a transaction advisory lock.
- Public Supabase broadcasts contain only an empty invalidation message. Clients discard current results and fetch again; focus/reconnect and a 15-second refresh recover missed notifications. An offline client cannot provide instant updates until connectivity returns.
- Theatre, movie and showtime ON flags are independent. A disabled parent hides children without overwriting their individual flags. Re-enabling a parent restores only eligible children.

## Authentication and permissions

Movies uses a separate verified Supabase Auth session, not the legacy local role selector. Use **Movies → Theatre administration**, or **Admin → Theatre Management**. All mutations verify the Supabase token on the server and check protected database permissions again inside the SQL transaction.

Four owner-supplied email addresses are registered in the private bootstrap table. No passwords were created and no emails were sent by the implementation. After Supabase verifies an authorized account's email, a one-time trigger creates its Movies Super Admin permission and an audit record. Signing in again never restores revoked permission. The account UUID, not email or user-editable metadata, controls subsequent access. The final Super Admin cannot be demoted.

Super Admins can grant/revoke access for an existing Supabase Auth user UUID. Every change requires a reason. Admins can manage visibility but cannot change permissions. Ordinary users and theatre owners have no permission to mutate visibility. Private permission/audit tables have RLS and no direct client grants.

## Daily feed integration

`npm run movies:sync` runs one atomic metadata sync against an authorized HTTPS feed. Configure `MOVIES_SUPABASE_URL`, `MOVIES_SYNC_SERVICE_KEY`, `MOVIES_FEED_URL` and, if needed, `MOVIES_FEED_TOKEN` on the private worker. Never prefix a worker secret with `VITE_`.

Feed format:

```json
{
  "theatres": [{"id":"stable-provider-theatre-id","name":"Provider theatre name","state":"Telangana","city":"Hyderabad","area":"Provider locality","sync_active":true}],
  "movies": [{"id":"stable-provider-movie-id","title":"Provider movie title","language":"Telugu","poster_url":"https://provider.example/poster.jpg","sync_active":true}],
  "showtimes": [{"id":"stable-provider-show-id","theatre_id":"stable-provider-theatre-id","movie_id":"stable-provider-movie-id","starts_at":"2099-01-01T12:00:00Z","screen_name":"Screen 1","format":"2D","sync_active":true}]
}
```

The example is documentation only and was not inserted into the database. Maximum 1,000 records per array per batch. Use stable provider IDs. A showtime ID cannot move to a different theatre/movie. New records start OFF and require admin approval. The sync identity has no UPDATE privilege for visibility/version columns. Feed visibility fields are ignored. Removed/cancelled source records must be supplied with `sync_active:false`; absence alone is not a deletion or cancellation. Expired showtimes disappear automatically from public results.

No real feed or worker credentials were supplied, so no daily scheduler was installed and no screenings were imported. Run the command from an existing approved daily worker after configuring its source and secrets. Ingestion is implemented; automated production synchronization is not activated.

## Verification

- `npm test`: HTTP authorization, public no-cache/no-fallback behavior, parallel conflicting HTTP mutations and all existing Stays/payment tests.
- `npm run test:movies:db`: explicit remote SQL tests inside BEGIN/ROLLBACK. Includes live RLS, all visibility levels, state/city/keyword filtering, ordinary-user rejection, admin escalation rejection, revocation, protected audit reads, one-time verified bootstrap, sync preservation, stale versions and atomic bulk rollback. All fixture users and data are rolled back.
- `npm run test:movies:concurrency`: independent remote connections contend for the same transaction lock; no records are written. This tests lock contention separately from stale-version and HTTP conflict tests; it is not a production load test.
- Supabase security advisors after migration: no issues reported.
- Final application checks: 29 tests passed, TypeScript/lint passed, production build passed, and `git diff --check` passed. Browser smoke checks reached Now Showing, all three state choices, the empty catalogue state and the protected theatre sign-in form. Existing Vite large-chunk/config warnings remain.

The live catalogue and Auth user list were empty at verification; four bootstrap grants are pending. A signed-in real admin browser toggle and populated catalogue E2E remain dependent on verified accounts and an authorized feed. No fabricated theatre, payment or booking confirmation is used.

## Files changed for this feature

`server.ts`, `src/server/movieRoutes.ts`, `src/features/movies/moviesApi.ts`, `src/features/movies/publicListings.ts`, `src/features/movies/publicListings.test.ts`, `src/integration/movieVisibility.integration.test.ts`, `src/components/MoviesNowShowing.tsx`, `src/components/AdminTheatreManagement.tsx`, `src/components/AdminDashboard.tsx`, `src/components/CraftoTopServicesBar.tsx`, `src/context/MarketplaceContext.tsx`, `src/App.tsx`, `package.json`, `.env.example`, ignored `.env.local` (public Movies URL/key only), `scripts/sync-movies.ts`, `scripts/validate-movie-db.ts`, `scripts/validate-movie-concurrency.ts`, `supabase/.gitignore`, `supabase/schema_and_rls.sql` (future legacy-table guards only; not applied in full), `supabase/migrations/20261102124513_movie_visibility_management.sql`, `supabase/tests/movie_visibility_rollback.sql`, `supabase/tests/movie_legacy_rls_rollback.sql`, and this document. All unrelated existing changes were preserved.

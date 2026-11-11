# Production Persistence Route Audit

This audit records what is and is not production-authoritative in the current
server. It does not authorize a hosted migration or deployment.

## Current production gate

`server.ts` calls `assertProductionPersistenceReady()` before it constructs the
HTTP listener. The gate intentionally rejects production because several
legacy route families still use the JSON compatibility store and several
PostgreSQL repositories still enforce a loopback-only connection target. Keep
the gate in place until the rows below marked **JSON compatibility** have
transactional PostgreSQL repositories and production connection verification.

## Role and identity operations

| Route family | Current backing | Authorization / audit |
| --- | --- | --- |
| `GET /api/admin/users` | Supabase `profiles` through caller JWT in production; local JSON in development | Verified Google identity must match the signed session; `is_current_user_admin()` and profile RLS gate production list |
| `POST /api/admin/users` | Local JSON compatibility only | Cannot create a provider/Admin role; managed role transitions require verified Google signup |
| `PATCH /api/admin/users/:id/{role,status,verify}` | Supabase `manage_user_access` RPC | Caller JWT must match signed Google identity; RPC requires active Super Admin and atomically writes previous/new role, status, verification, actor, target, reason, timestamp |
| `/api/super-admin/*` | Mixed legacy backing | Middleware revalidates Google identity and active DB Super Admin authority on each request; legacy action handlers still include JSON-backed behavior and are unavailable in production while the startup gate is closed |

## Legacy routes still using JSON compatibility state

- `GET/PUT /api/admin/modules` reads and updates module settings in the JSON
  store.
- `GET /api/admin/movies/records` reads JSON-backed movie administration data.
- `/api/super-admin/overview`, `/listings/action`, `/bookings/action`,
  `/payments/action`, `/retention/execute`, database snapshot/rollback, and
  audit verification use JSON compatibility state or its audit mirror.
- General live-page configuration, notification campaigns, and other older
  server-admin tools also use `loadAuthoritativeStore()` or `loadServerStore()`.

These operations must be moved to PostgreSQL repositories with durable audit
records before the production guard can be removed. The domain-specific PG,
Classes, Services, Stays, and Venues booking/payment APIs already use their
PostgreSQL repositories and module RLS/audit procedures; their local behavior
is covered by the disposable-database tests.

## Prioritized PostgreSQL migration plan

1. **Platform configuration and content.** Move module flags, Movies admin
   records, live-page drafts/versions, and notification campaigns from the
   JSON stores to PostgreSQL. Add per-action authorization, optimistic version
   checks where edits can race, and append-only actor/reason/state audit rows.
2. **Super Admin operational views and actions.** Replace JSON-backed
   `/api/super-admin/overview`, listing moderation, booking actions, payment and
   refund actions with queries/transactions over the existing marketplace and
   financial tables. Persist each action in its domain audit table in the same
   transaction; never write a second mutable JSON audit mirror.
3. **Retention and database operations.** Remove simulated JSON snapshot,
   rollback, migration dry-run, and audit-verification operations from the
   production HTTP API. Put backup/restore and migration work in a separately
   guarded operations workflow with project identity checks, verified backups,
   recorded migration history, and recovery drills.
4. **Production connection and acceptance gate.** Add TLS and verified remote
   database identity for every repository; test role freshness, audit
   durability, database outage behavior, and all modules in production-mode
   integration tests against isolated local PostgreSQL. Only then consider
   changing `assertProductionPersistenceReady()` in a reviewed change.

The profile role/status/verification RPC is already a separate database-backed
foundation and should remain the only route for those mutations. Keep the
current production guard until every tier above has passed its tests.

## Financial audit preservation

Financial booking/payment/refund APIs use domain audit tables in PostgreSQL.
Their audit rows are not deleted by the role-management RPC. The new
`user_access_audit_events` table records user authorization transitions
separately and denies direct client reads/writes.

## Required production exit criteria

1. Replace every listed JSON-backed privileged write/read with a PostgreSQL
   repository and transaction-level audit event.
2. Configure production PostgreSQL access with TLS and verified target identity
   for all repositories; current local repositories reject remote targets.
3. Run production-mode integration tests against an isolated local PostgreSQL
   instance, including database-unavailable fail-closed behavior.
4. Keep `assertProductionPersistenceReady()` throwing until those checks are
   satisfied. No hosted connection was used to establish readiness.

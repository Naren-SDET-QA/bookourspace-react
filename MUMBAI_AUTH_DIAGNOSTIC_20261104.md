# Mumbai Supabase PostgreSQL Authentication Diagnostic

**Generated:** 2026-11-04 UTC  
**Project ref:** `sfoizxarbljhldmkgsma`  
**Scope:** Read-only investigation only. No password reset, database write, migration, or deployment was performed.

## Confirmed project identity

The Supabase project connector returned project ref `sfoizxarbljhldmkgsma`, name `bookourspace-mumbai`, region `ap-south-1`, status `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.011`, and direct database host `db.sfoizxarbljhldmkgsma.supabase.co`.

## Local connection settings

`.env` parses with the installed dotenv parser. It contains both connection configurations and targets the Mumbai project. The configured Direct Connection is `db.sfoizxarbljhldmkgsma.supabase.co:5432`, user `postgres`, database `postgres`. The configured Session Pooler is `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.sfoizxarbljhldmkgsma`, database `postgres`. TLS is configured as `require`.

The project connector does not expose the dashboard's copyable Connect URI. Project-scoped Supavisor logs do confirm traffic for project ref `sfoizxarbljhldmkgsma`, region `ap-south-1`, mode `session`, and database `postgres`. This proves traffic through the configured pooler path reached the intended project; the canonical Dashboard hostname/port could not be independently retrieved from the connector.

## Local secret hygiene and input path

The local password was inspected without printing or hashing it for display. It has no leading/trailing whitespace and no control or invisible characters. Its dotenv-parsed value is unchanged from the protected snapshot created before the U+2028 formatting fix, so the current `.env` credential is not a post-reset update.

The temporary credential helper uses Bash `IFS= read -r -s`, passes the value unchanged through the process environment to `PGPASSWORD`, and does not trim or URL-encode it. It only writes the new value to `.env` after a successful Session Pooler authentication and read-only query. The prior failed run therefore did not update `.env`.

## Connectivity and server logs

The most recent user-provided local probe reported:

- Direct: DNS resolved over IPv6; TCP did not connect, so database authentication was not reached.
- Session Pooler: DNS, TCP, and TLS succeeded; PostgreSQL returned SQLSTATE `28P01`.

Project-scoped PostgreSQL logs for the 24-hour window `2026-11-03 15:36 UTC` through `2026-11-04 15:36 UTC` contained 18 `28P01` log entries for role `postgres`, grouped at `2026-11-04 13:46`, `14:06`, `14:57`, `15:00`, `15:17`, and `15:19` UTC. Supavisor logs in that window contained password-failure events through `15:33` UTC. The same Supavisor log query returned zero circuit-breaker events and zero tenant/user-mismatch events.

## Root cause and remaining verification

**Confirmed:** the server rejected the credentials used in the observed Session Pooler attempts (`28P01`). The project-scoped logs confirm the connection path reached the intended Mumbai project. Direct connection failure is at IPv6 TCP reachability, before authentication.

**Not confirmed:** whether all six Dashboard password resets completed successfully; whether Supavisor had a stale cached verifier for the latest reset; and the exact canonical Session Pooler URI displayed in the Dashboard Connect panel. The available connector exposes project metadata and project-scoped logs, but no password-reset history or Connect URI.

The current `.env` credential matches the pre-format snapshot and must be treated as stale relative to the subsequent rotations. It was not tested again to avoid another known-bad authentication attempt. A clean Session Pooler test with the latest temporary credential remains pending secure entry through the hidden prompt.

## Sanitized support summary

> Supabase project `sfoizxarbljhldmkgsma` (`ap-south-1`, PostgreSQL 17.11) has repeated Session Pooler authentication failures. Local probe: `aws-0-ap-south-1.pooler.supabase.com:5432`, session mode, database `postgres`, TLS required; TCP/TLS succeed but PostgreSQL returns SQLSTATE `28P01`. Project-scoped logs confirm the session pooler path routes to this project and show PostgreSQL `28P01` entries through `2026-11-04 15:19 UTC` and Supavisor password-failure events through `15:33 UTC`; no tenant/user-mismatch or circuit-breaker events were found in the queried 24-hour window. Direct `db.sfoizxarbljhldmkgsma.supabase.co:5432` DNS resolves over IPv6 but TCP fails on the client network. The database password was rotated repeatedly; please confirm the latest reset completed and whether Supavisor could still be validating against a cached credential. No password or credential-bearing URI is included in this report.

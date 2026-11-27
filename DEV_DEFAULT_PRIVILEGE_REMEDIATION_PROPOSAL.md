# Hosted DEV Default Privilege Audit and Proposal

**Target:** Supabase DEV project `obkfgxjzlscungkhbyvq` (`React`)
**Status:** Read-only catalog audit complete; proposal only; no hosted changes made.
**Date:** 2026-11-27

## Executive summary

The hosted catalog contains schema-scoped defaults for `postgres` and `supabase_admin`. The broadest rules are the `supabase_admin` table defaults in `public`, `graphql`, and `graphql_public`: future tables created by that role inherit every table privilege for `anon`, `authenticated`, and `service_role`. The `postgres` defaults expose no future-table CRUD in `public`, but grant non-CRUD table privileges there; `postgres` defaults for `storage` grant the API roles full table CRUD and sequence privileges, consistent with the Storage API model.

The proposal below removes unnecessary `MAINTAIN`, `REFERENCES`, and `TRIGGER` defaults from API roles on `postgres`-created `public` and `storage` tables, plus service-role `TRUNCATE` from those defaults. It preserves CRUD, sequence access, and function execution defaults. It does not change existing object ACLs. No `supabase_admin` defaults are included because the current SQL connection is neither a superuser nor a member of that role. **GraphQL defaults are deferred** pending an authorized isolated test and platform validation.

## Hosted catalog evidence

Project identity was confirmed through the Supabase project record: id/ref `obkfgxjzlscungkhbyvq`, name `React`, status `ACTIVE_HEALTHY`, PostgreSQL 17. The audit queried `pg_default_acl`, expanded ACL entries with `aclexplode`, and included PostgreSQL built-in defaults from `acldefault` for `postgres` and `supabase_admin` across the four requested schemas. No grant options were present on the listed API-role default ACLs.

`PUBLIC` below means the PostgreSQL pseudo-role, not a schema. The built-in function `EXECUTE` and type `USAGE` defaults are inherited by `anon`, `authenticated`, and `service_role`; no stored `pg_default_acl` entry grants these to PUBLIC. There were no relevant default ACL entries for schema objects or large objects.

### Effective defaults by owner, schema, object type and grantee

| Owner | Schema | Object type | PUBLIC | anon | authenticated | service_role |
|---|---|---|---|---|---|---|
| `postgres` | `public` | tables | — | MAINTAIN, REFERENCES, TRIGGER | MAINTAIN, REFERENCES, TRIGGER | MAINTAIN, REFERENCES, TRIGGER, TRUNCATE |
| `postgres` | `storage` | tables | — | SELECT, INSERT, UPDATE, DELETE, MAINTAIN, REFERENCES, TRIGGER | SELECT, INSERT, UPDATE, DELETE, MAINTAIN, REFERENCES, TRIGGER | SELECT, INSERT, UPDATE, DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE |
| `postgres` | `storage` | sequences | — | SELECT, UPDATE, USAGE | SELECT, UPDATE, USAGE | SELECT, UPDATE, USAGE |
| `postgres` | `storage` | functions | EXECUTE | EXECUTE | EXECUTE | EXECUTE |
| `postgres` | `public`, `storage`, `graphql`, `graphql_public` | types | USAGE | inherited USAGE | inherited USAGE | inherited USAGE |
| `postgres` | `public`, `graphql`, `graphql_public` | functions | EXECUTE | inherited EXECUTE | inherited EXECUTE | inherited EXECUTE |
| `supabase_admin` | `public`, `graphql`, `graphql_public` | tables | — | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN |
| `supabase_admin` | `public`, `graphql`, `graphql_public` | sequences | — | SELECT, UPDATE, USAGE | SELECT, UPDATE, USAGE | SELECT, UPDATE, USAGE |
| `supabase_admin` | `public`, `graphql`, `graphql_public` | functions | EXECUTE | EXECUTE | EXECUTE | EXECUTE |
| `supabase_admin` | `public`, `graphql`, `graphql_public`, `storage` | types | USAGE | inherited USAGE | inherited USAGE | inherited USAGE |
| `supabase_admin` | `storage` | functions | EXECUTE | inherited EXECUTE | inherited EXECUTE | inherited EXECUTE |

The `supabase_admin` entry applies only to future objects created by that owner. The table defaults include the PostgreSQL 17 `MAINTAIN` privilege. `postgres` has no API-role defaults for sequences in `public`, `graphql`, or `graphql_public`; `supabase_admin` has no API-role table/sequence/function defaults in `storage` in this catalog result.

### Relevance and dependencies

- **Application tables:** Current local migration evidence shows explicit, table-specific grants and revokes. For example, the signed-in favorites path has an explicit grant in `20261107121500_user_favorites_grants.sql:6`. Existing application tables were previously inventoried as owned by `postgres`. Thus the `postgres` `public` defaults do not provide app CRUD; the `supabase_admin` `public` defaults matter only if future application tables are created as `supabase_admin`.
- **Storage tables:** `src/lib/media/uploadMediaAsset.ts:141` uploads through the Supabase Storage client. Migrations create/maintain `storage.buckets` and `storage.objects` policies, including `20261105040000_universal_media_assets.sql:99-184` and `20261105163924_profile_media_and_account_closure.sql:28-40`. The `postgres` Storage CRUD and sequence defaults can support Storage API operations. The proposal preserves those privileges and function execution.
- **RPCs:** The app invokes RPCs such as `save_app_builder_config_draft`, delivery OTP functions, and stay-discovery functions. Local migrations explicitly revoke and grant sensitive function execution, e.g. `20261101075829_app_builder_config_versions.sql:396-404`. The proposal does not alter function defaults or current function ACLs.
- **`supabase_admin` defaults:** No local migration establishes these rules. The current connection is `postgres`, not a superuser or a member of `supabase_admin`; it cannot alter that role's default ACLs or `SET ROLE supabase_admin`. Therefore no `supabase_admin` default changes are in the proposed migration. This applies to `public` as well as the GraphQL schemas.
- **GraphQL/platform schemas:** No local application migration creates application objects in `graphql` or `graphql_public`, and no application code directly targets those schemas. `supabase_admin` can create objects in both, but the current connection cannot. A transaction/rollback probe is prepared below for an authorized isolated runner. GraphQL defaults remain deferred until that runner validates ACL behavior and platform operations are tested.
- **Existing relations:** `ALTER DEFAULT PRIVILEGES` changes future objects created by the named owner. It does not revoke privileges on existing tables, sequences, or functions.

The local repository contains no migration establishing the `supabase_admin` defaults. The local `run_guardrails_audit.sh:168-172` broad defaults are installed only in its disposable audit database setup; they are not a hosted migration and were not run for this task.

## Proposed DEV-only SQL

This proposal is intentionally outside `supabase/migrations/` so it cannot be picked up as a migration before approval. It preserves application CRUD, Storage sequence access, RPC execution and current object grants. It excludes all `supabase_admin` defaults because the available SQL role cannot alter them; GraphQL is also deferred for platform validation.

```sql
BEGIN;

-- postgres-created application tables in public: no API role needs table
-- maintenance or DDL-related privileges; API CRUD remains governed by grants
-- on existing tables and by explicit grants for future application tables.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE MAINTAIN, REFERENCES, TRIGGER ON TABLES
  FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM service_role;

-- Storage keeps API CRUD and sequence/function privileges. Remove only
-- table-maintenance/DDL privileges and service_role TRUNCATE on future tables.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  REVOKE MAINTAIN, REFERENCES, TRIGGER ON TABLES
  FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  REVOKE TRUNCATE ON TABLES FROM service_role;

COMMIT;
```

### Rollback SQL

Rollback restores the exact default privileges observed before the proposal. It does not grant anything on existing relations.

```sql
BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT MAINTAIN, REFERENCES, TRIGGER ON TABLES
  TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT TRUNCATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  GRANT MAINTAIN, REFERENCES, TRIGGER ON TABLES
  TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  GRANT TRUNCATE ON TABLES TO service_role;

COMMIT;
```

## Deferred GraphQL probe (prepared, not run)

The current SQL connection lacks the role authority and schema CREATE privilege required for this test. It was not run. An authorized isolated DEV runner with `supabase_admin` membership can test PostgreSQL default behavior using probe tables inside one transaction; `ROLLBACK` removes both default-privilege changes and probe tables. Use a unique probe name and stop if either schema already contains it.

```sql
BEGIN;
SET LOCAL ROLE supabase_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA graphql
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA graphql_public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role;

CREATE TABLE graphql.__dev_default_acl_probe_20261127 (id integer);
CREATE TABLE graphql_public.__dev_default_acl_probe_20261127 (id integer);
RESET ROLE;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(role_name,'graphql.__dev_default_acl_probe_20261127','TRUNCATE')
       OR has_table_privilege(role_name,'graphql_public.__dev_default_acl_probe_20261127','TRUNCATE') THEN
      RAISE EXCEPTION 'FAIL % inherited TRUNCATE on a GraphQL probe table', role_name;
    END IF;
    IF NOT has_table_privilege(role_name,'graphql.__dev_default_acl_probe_20261127','SELECT')
       OR NOT has_table_privilege(role_name,'graphql.__dev_default_acl_probe_20261127','INSERT')
       OR NOT has_table_privilege(role_name,'graphql_public.__dev_default_acl_probe_20261127','SELECT')
       OR NOT has_table_privilege(role_name,'graphql_public.__dev_default_acl_probe_20261127','INSERT') THEN
      RAISE EXCEPTION 'FAIL % lost preserved GraphQL CRUD defaults', role_name;
    END IF;
  END LOOP;
END $$;

ROLLBACK;
```

This probe validates only PostgreSQL ACL inheritance and rollback. It does not establish that Supabase GraphQL platform functions, schema-cache refresh, introspection, or client GraphQL operations continue to work. Those require post-change integration checks on an isolated project/branch; none was created.

## Verification plan if approved

Before applying, record current `pg_default_acl` and current table ACLs for the affected schemas; verify there is no application requirement for API-role TRUNCATE or API-role table maintenance/DDL privileges. Apply only the reviewed statements in the target DEV project. Afterwards, query `pg_default_acl` and create no test objects in the live database. Validate with a disposable project/branch that future objects retain expected CRUD, Storage sequence access, and RPC execution while omitting the revoked privileges. Run actual Storage upload/download and application RPC integration tests against isolated DEV fixtures. Production is outside scope.

## Migration tracking discrepancy

The Supabase migration list and read-only query by **version** show `20261127155114` (`revoke_api_role_truncate`) is recorded as applied. An earlier lookup filtered `schema_migrations.name` using the versioned filename; that was the wrong key and produced a false negative. The correct ledger fields are `version='20261127155114'` and `name='revoke_api_role_truncate'`.

The linked CLI migration list shows local `20261127170000` with a blank remote version; the direct query by `version` also finds no hosted row. The local file is untracked in Git and has SHA-256 `0801082075e2952b1049fbe15d337ea2c6bddcfa76a43adda4b52470935a9e4e`. Its exact statements are `BEGIN;`, `REVOKE ALL PRIVILEGES ON TABLE public.business_backfill_review FROM public, anon, authenticated, service_role;`, and `COMMIT;` (`supabase/migrations/20261127170000_business_backfill_review_server_only.sql:6-11`). Current live catalog state shows `postgres` owns the table and anon SELECT, authenticated SELECT/INSERT, service_role TRUNCATE are all false; this is consistent with the revoke's postcondition but does not establish exact SQL or transaction boundaries. The available Postgres logs for the preceding 24 hours returned no matching SQL records. No matching commands were found in accessible zsh/bash/fish history files or project artifacts beyond the migration, test, and this report. The connected Supabase tools expose no SQL Editor history reader, and no SQL Editor export was present in the workspace. These absences do not prove the SQL was never run manually.

Supabase's supported `migration repair` operation changes the migration tracking table only; it does not execute the migration SQL ([CLI reference](https://supabase.com/docs/reference/cli/supabase-migration-repair)). The installed CLI is v2.117.0 and its `migration repair --help` supports `--linked` and `--status applied`. If exact execution is later confirmed, the approval-gated command would be `supabase migration repair --linked --status applied 20261127170000 --workdir /Users/aa/Downloads/bookourspace-react`. Before that, inspect SQL Editor/audit evidence if available, compare exact SQL and transaction boundaries, verify the project link, and review `supabase migration list --linked`. Do not run repair now: exact execution remains unproven. If provenance cannot be established, leave the version unmarked and prepare a separately reviewed forward-only reconciliation migration; do not insert ledger rows manually or rerun the old file blindly. Migration `20261127155114` needs no repair; it is already recorded as applied.

## Remaining evidence gaps

- No hosted default-privilege behavior was changed or tested by creating objects.
- The platform dependency of `supabase_admin` defaults in `graphql` and `graphql_public` cannot be established from this app repository; these changes are explicitly deferred. The prepared ACL probe requires an authorized `supabase_admin` runner and was not run.
- No PostgREST, Storage, or authenticated application integration test was run here.
- Migration `20261127155114` is tracked; migration `20261127170000` remains absent from hosted history, and its execution provenance is unresolved.

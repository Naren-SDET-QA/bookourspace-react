# Permission Migration Runbook (dev → flags)

This is the operational companion to the admin permission work on `dev`. It covers
applying the four permission migrations to a database and then turning on the
deny-by-default flags, with verification and rollback for each step.

Nothing in this document has been executed against a hosted database. Each phase
needs its own explicit approval; do not treat one approval as covering the next.

## 1. What is being applied

| Order | Version | File | Adds | Safe to apply while old code runs? |
|---|---|---|---|---|
| 116 | `20261114090000` | `module_section_action_grants.sql` | `allowed_sections` / `allowed_actions` on both grant tables, audit columns, `effective_customer_permissions()`, `has_customer_permission()`, `has_customer_section_access()` | Yes — additive only |
| 117 | `20261114100000` | `permission_rls_hardening.sql` | Revokes browser write grants on `customer_module_access`, replaces the `FOR ALL` admin policy with read-only + server-mediated writes, adds text-array `CHECK` constraints, fixes `effective_customer_permissions` self-scope | Yes, **if** the running server writes grants through the service role (it does — `src/server/customerModuleAccess.ts`) |
| 118 | `20261114110000` | `strict_permission_backfill.sql` | `backfill_strict_permission_grants(p_include_customers boolean default false)` | Yes, but it is a **no-op until called**; the migration calls it with `false` |
| 119 | `20261114120000` | `customer_audit_profile_cascade.sql` | Guard so an account holding module grants can be deleted | Yes |

Prerequisites for a database that is behind: `20261112010000` (business ownership),
`20261112340000` (`business_member_access`), `20261113030000`/`040000`/`050000`
(business backfill and module access), `20261113000000` (customer module access).
The manifest already encodes this order; do not cherry-pick.

Key property: **nothing changes for end users until the flags are on.** With both
flags unset, the gates behave exactly as before, and the backfill rows describe
access users already had.

## 2. Preconditions

1. Working tree is the reviewed commit; `git status` is clean.
2. Manifest and checksums agree:
   ```bash
   node supabase/tests/migration_manifest.mjs
   ```
   Expect `PASS manifest verified: baseline + 118 migrations, unique versions, sha256 match`.
3. The full local suite is green on the same bytes:
   ```bash
   bash supabase/tests/run_local_validation.sh
   ```
   Expect `ALL CHECKS PASSED`, permission suites 24/24 and 15/15, gate suite 9/9,
   audit repair suite 7/7.
4. A fresh backup of the target exists and has been test-restored once.
   ```bash
   pg_dump -Fc "$TARGET" -f "bos-pre-permissions-$(date +%Y%m%d%H%M).dump"
   ```
5. Confirm the target identity before any write. On the local dev database that is
   `127.0.0.1:55441/bookourspace_dev` — check it, do not assume:
   ```bash
   psql "$TARGET" -tAc "select current_database(), inet_server_addr(), inet_server_port()"
   ```
6. For a hosted target, reconcile the ledger first (read-only):
   ```bash
   supabase migration list --json > /tmp/hosted-history.json
   node supabase/tests/migration_history_reconcile.mjs --remote /tmp/hosted-history.json
   ```
   It contacts nothing itself and exits non-zero on drift, an unknown version or
   an out-of-order prefix. Resolve drift before applying anything.

## 3. Apply the migrations

Apply **one file at a time, in version order**, each in its own transaction, with
timeouts and `ON_ERROR_STOP`. Do not use `supabase db push` for this: the baseline
is not a CLI migration and broad pushes give no per-file control.

```bash
export TARGET='postgres://postgres@127.0.0.1:55441/bookourspace_dev?sslmode=disable'
```

```bash
for f in \
  supabase/migrations/20261114090000_module_section_action_grants.sql \
  supabase/migrations/20261114100000_permission_rls_hardening.sql \
  supabase/migrations/20261114110000_strict_permission_backfill.sql \
  supabase/migrations/20261114120000_customer_audit_profile_cascade.sql
do
  echo "== $f"
  psql "$TARGET" -v ON_ERROR_STOP=1 \
    -c "set lock_timeout = '5s'" \
    -c "set statement_timeout = '120s'" \
    -f "$f" || { echo "STOP: $f failed; do not continue"; break; }
done
```

Notes:
- The local dev database has **no** `supabase_migrations.schema_migrations` table,
  so there is no ledger to check there; verify by catalog (section 4). Never delete
  ledger rows on a database that has them.
- Migration 117 validates its new `CHECK` constraints with a guarded `VALIDATE`.
  If legacy malformed JSON exists, the constraints stay `NOT VALID`: new writes are
  still checked, old rows are not. That is acceptable; record it and move on rather
  than editing data to force validation.
- Migration 118 prints a notice with the counts it wrote. On a database with no
  active non-owner members (the current dev database) those counts are all zero and
  the migration is effectively a no-op.

## 4. Verify the schema after applying

```sql
-- 116/117 columns and constraints
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('business_member_access','customer_module_access')
   and column_name in ('allowed_sections','allowed_actions')
 order by 1,2;

select conname, convalidated
  from pg_constraint
 where conname in ('customer_module_access_sections_array',
                   'customer_module_access_actions_array',
                   'business_member_access_actions_object')
 order by 1;

-- 117 privileges and policies
select has_table_privilege('authenticated','public.customer_module_access','INSERT') as anon_can_write,
       has_table_privilege('authenticated','public.business_member_access','INSERT') as member_can_write;

select tablename, policyname, cmd
  from pg_policies
 where schemaname='public'
   and tablename in ('customer_module_access','business_member_access')
 order by 1,2;

-- 116/117 functions
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'
   and proname in ('effective_customer_permissions','has_customer_permission',
                   'has_customer_section_access','backfill_strict_permission_grants')
 order by 1;
```

Expected: two new columns per table; `NOT VALID` allowed on the three checks;
`anon_can_write` and `member_can_write` both `false`; only the read policies plus
`Admins read every customer module access` on `customer_module_access`; all four
functions present.

Verify the backfill left nobody behind:

```sql
select count(*) as active_non_owner_members_without_row
  from public.business_members m
  join public.businesses b on b.id = m.business_id
 where m.status = 'active' and m.role <> 'owner'
   and not exists (select 1 from public.business_member_access ma
                    where ma.business_id = m.business_id and ma.user_id = m.user_id);
```

This must be `0`. If it is not, re-run the backfill (section 6) before enabling the
flag — with the flag on, those members are denied everything.

## 5. Rollback per step

Roll back only the step that failed. Prefer forward fixes to reversal for anything
already committed.

**119 — audit guard.** Restoring the previous function reopens the account-deletion
defect (`23503` on deleting a user who holds grants). Only revert if the guard
itself caused a problem:

```sql
-- re-apply the function body from
-- supabase/migrations/20261114090000_module_section_action_grants.sql
```

**118 — backfill.** There is no clean SQL revert: a backfilled row is
indistinguishable from a full grant an admin created. Two safe options:
1. Leave the rows and keep the flag off — they grant exactly what members already
   had, so nothing is widened.
2. Restore the pre-change dump.
Do not try to delete rows by "looks backfilled" heuristics; that can remove real
grants.

**117 — hardening.** Restores browser writes on the grant table, i.e. reopens
self-grant through PostgREST. Do this only as a break-glass, paired with a code
rollback:

```sql
grant insert, update, delete on public.customer_module_access to authenticated;
drop policy if exists "Admins read every customer module access" on public.customer_module_access;
create policy "Admins manage customer module access"
  on public.customer_module_access for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

Leave the `CHECK` constraints in place; they do not block legitimate writes.

**116 — columns and RPCs.** Reverting means dropping columns and therefore the
section/action data, and breaking any deployed server that reads them. Order:
roll the code back first, then restore the dump. Do not drop columns on a database
whose server version still selects them.

## 6. Turn on the strict flags

Flags are read per request from the server process environment
(`strictPermissionDefaults` / `strictCustomerDefaults`), so changing them requires
a redeploy or restart, not a database change:

- `BOS_STRICT_PERMISSION_DEFAULTS=1` — business members with **no** grant row are
  denied (`BUSINESS_PERMISSIONS_REQUIRED`) instead of getting implicit access.
- `BOS_STRICT_CUSTOMER_DEFAULTS=1` — customers with **no** grant rows are denied
  (`CUSTOMER_PERMISSIONS_REQUIRED`) instead of getting the legacy unrestricted view.

Order matters:

1. **Provider flag first.** Re-run the backfill so every active member has a row:
   ```sql
   select public.backfill_strict_permission_grants(false);
   ```
   Then set `BOS_STRICT_PERMISSION_DEFAULTS=1` and restart.
2. **Customer flag only as a deliberate product decision.** A customer with no
   rows already sees no modules, so strict mode mostly makes an existing denial
   explicit. Opting customers into grants *widens* access:
   ```sql
   select public.backfill_strict_permission_grants(true);
   ```
   Re-run the query from section 4 afterwards if you intend to enable
   `BOS_STRICT_CUSTOMER_DEFAULTS`.

Set the variables in the deployment's environment (hosting dashboard or the
process supervisor). Never write them into `.env.local` in this repository and
never commit them.

## 7. Verify the flags took effect

1. Sign in as a business member **without** a grant row on a business that is
   approved and module-enabled. The provider API must answer
   `403 BUSINESS_PERMISSIONS_REQUIRED`, and the provider console must show the
   permission notice rather than data.
2. Sign in as the same member after an admin grants the business module:
   Admin → **User Permissions** → enable that member. The same request must now
   succeed.
3. Restrict that member to one section and to `view`, then confirm a write is
   refused with `BUSINESS_ACTION_FORBIDDEN` and another section is refused with
   `BUSINESS_SECTION_FORBIDDEN`.
4. As an owner, confirm nothing changed: owners bypass grant rows by design.
5. As a customer with no grants (only if the customer flag is on): the marketplace
   must answer `403 CUSTOMER_PERMISSIONS_REQUIRED` and show no module data.
6. Check the server log for `BUSINESS_PERMISSIONS_REQUIRED` volume. A spike right
   after enabling means the backfill was skipped or a batch of members was added
   afterwards.
7. Run the read-only gate integration test against the environment's database if
   it is reachable from a test host:
   ```bash
   BOS_LISTINGS_DATABASE_URL="$TARGET" node --import tsx --test \
     tests/permission-gates-postgres.integration.test.mjs
   ```
   It seeds its own fixtures and removes them; do not point it at a database whose
   fixtures you cannot afford to touch.

## 8. Turning the flags off

Unset (or set to `0`) `BOS_STRICT_PERMISSION_DEFAULTS` / `BOS_STRICT_CUSTOMER_DEFAULTS`
and restart. Access returns to the legacy implicit behaviour immediately; no data
change is needed, and the grants stay in place for the next attempt. This is the
first-line rollback for any permission incident.

## 9. Known limitations to state in the change record

- **New members after the flag is on are denied until backfilled.** Either grant
  them in Admin → User Permissions, or re-run `backfill_strict_permission_grants(false)`
  after bulk membership changes.
- **A business's `module_type` change does not rewrite member rows.** Existing
  grants keep the old module; fix those members by hand.
- **Backfilled rows exist for members of non-approved businesses.** Authorization
  is unaffected (the gate refuses pending/suspended businesses before the grant
  check), but the console will show them as explicitly granted.
- **The local dev database has no migrations ledger**, so "which migrations are
  applied" is answered by catalog inspection, not by a version table.
- **`guard_business_member_access()` is `SECURITY INVOKER` with
  `set search_path = public`** — pre-existing and not touched by this work.

## 10. Approval checklist

- [ ] Approval to apply migrations to the target database
- [ ] Backup taken and restore-tested this change window
- [ ] Approval to set `BOS_STRICT_PERMISSION_DEFAULTS=1`
- [ ] Separate decision on `BOS_STRICT_CUSTOMER_DEFAULTS` and on the opt-in
      customer backfill (it widens access)
- [ ] Rollback owner named, with the section 8 flag-off step agreed
- [ ] Change record notes the limitations in section 9

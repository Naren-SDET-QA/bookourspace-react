# Supabase development environment setup

Status: **read-only cloud metadata checks only; no cloud writes or migrations.**
This document records the verified state of the repo, why the existing project
cannot be used, and the exact steps needed before any cloud migration is applied.

## 1. Verified current state

| Item | Result |
| --- | --- |
| Supabase CLI | installed — `/Users/aa/.local/bin/supabase`, version **2.117.0** (update to 2.122.0 offered) |
| `supabase/config.toml` | **absent** — the project has never been `supabase init`/`link`ed |
| Linked project | **none** (`supabase/config.toml` and `supabase/.temp/project-ref` absent) |
| `.env` / `.env.local` | **absent** — no `VITE_SUPABASE_URL`, no publishable key |
| Baseline schema | `supabase/schema_and_rls.sql` — **tracked**; creates the app tables (`profiles`, `listings`, `bookings`, …) |
| Migrations | 6 files in `supabase/migrations/`, applied in filename order after the baseline |
| Docker / psql | both present (Docker available if a local stack is wanted) |

## 2. Why `bookmyspace-dev` cannot be used

`bookmyspace-dev` (`zykxneztahxbjduagutv`, ap-south-1, Postgres 17) was checked
read-only with the Supabase MCP schema tools. It is a **different application**:

- no `public.listings`, no `public.platform_module_flags`, no `stay_properties` / `stay_room_types` / `stay_units` / `stay_allocations`;
- its migrations are an unrelated 2026 BookMySpace history (venues, `service_*`, `movie_*`, location schema);
- this app's baseline would collide with existing tables and RLS.

Do not point this repository at it.

It is the only project visible to the connected Supabase account, so there is
currently no verified compatible BookOurSpace development target. The project
contains existing data and is not safe to repurpose for this migration.

## 3. Schema prerequisites for this application

Order matters. The baseline is **not** a CLI migration, so `supabase db push`
alone will not create the schema.

1. **Baseline** `supabase/schema_and_rls.sql` — app tables, `is_admin()`,
   `is_active_user()`, `handle_new_user()`, listing/booking RLS.
2. **`20261101000002`** — `platform_module_flags` (+ movie approval trigger),
   `provider_contact_settings`, `provider_contact_events`,
   `provider_contact_details()`, `record_contact_click()`, stay inventory
   (`stay_properties` → `stay_room_types` → `stay_units` → `stay_blocks` →
   `stay_allocations`) with the `btree_gist` exclusion constraint,
   `stay_availability()`, `stay_hold_units()`, `stay_confirm_booking()`,
   `stay_release_hold()`, `sweep_expired_stay_holds()`, audit triggers.
3. **`20261101000003`** — drops the uuid overloads of the contact RPCs and
   recreates them against `listings.id TEXT`. Must run after 002.
4. **`20261101000004`** — replaces the module-flag write policy with
   `is_admin() and is_active_user()`, grants table privileges, adds the table to
   the `supabase_realtime` publication (idempotent).
5. **`20261101072320`** — replaces the listings admin policy with an active-admin
   check; owner policies unchanged.
6. **`20261101073937`** — stay inventory safety: FK to `listings` becomes
   `ON DELETE RESTRICT`, owner/admin `FOR ALL` policies are replaced by
   SELECT/INSERT/UPDATE (no DELETE policy), plus a transactional save RPC.
7. **`20261101075829`** — versioned App Builder configuration, published-only
   customer reads, active-admin RLS, strict data-only validation, draft/publish/
   rollback RPCs and Realtime publication. This is a local migration draft; it
   has not been applied to a cloud project.

## 4. Beginner setup (do these steps yourself)

1. In the Supabase Dashboard, create a **new project dedicated to BookOurSpace development**, or select an existing development project you know is safe to use. Choose the Free plan if available and acceptable. Do not reuse production or the unrelated `bookmyspace-dev` project. Do not create a paid project without approval. Wait until the new project's database is ready.
2. Record the **Project ID / project reference** from the project overview or dashboard URL (`/project/<project-ref>`). In Project Settings → API, or the project's **Connect** dialog, copy the **Project URL**. Its hostname should be `https://<project-ref>.supabase.co`.
3. In Project Settings → API Keys, use the **Publishable key** from the API Keys tab. A legacy **anon** key from Legacy API Keys is also accepted. Never select or copy a `secret` or `service_role` key for this app.
4. In Finder, open `/Users/aa/Downloads/bookourspace-react`. Create a file named `.env.local` beside `package.json`. Paste only these public development values into that local file:

   ```dotenv
   VITE_SUPABASE_PROJECT_ID=<project-ref>
   VITE_SUPABASE_DEVELOPMENT_PROJECT_ID=<same-project-ref>
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
   ```

   Set both project-reference variables explicitly and to the same value. The development variable is a local allowlist; it tells this checkout which one hosted project is intentionally designated for development. For the currently designated dev project, that value may be `ezrxykyocgbolpaebnqx` because you have identified that project as development. This string alone does not prove its cloud environment. For a legacy anon key, use `VITE_SUPABASE_ANON_KEY=<anon-key>` instead of the publishable-key line. Do not put a database password, service-role key, secret key, or admin passcode in any `VITE_` variable. `.env.local` is ignored by Git; never paste its contents into chat.
5. In Terminal, run:

   ```bash
   cd /Users/aa/Downloads/bookourspace-react
   npx tsx scripts/supabase-dev-preflight.ts
   ```

   This is an **offline local check**. It reads only `.env.local`, shows no key value, rejects an unallowlisted hosted project, ref/URL mismatches, and invalid key formats, and makes no network request. A passing result confirms syntax and URL/ref/allowlist consistency only; opaque publishable-key ownership still needs to be confirmed from that project's dashboard.
6. Stop there and share only the **project reference** and the preflight's pass/fail result. Do not send any keys or passwords. No cloud migration should be applied until the target's schema is reviewed and the migration plan is approved.

### Configuration behaviour

`src/lib/supabaseConfig.ts` resolves the environment for both the browser and
the Express server. No edits are required to point the app at a dev project,
and no target is ever selected for you.

| Environment | Result |
| --- | --- |
| No `VITE_SUPABASE_*` at all | Live Supabase disabled; one warning, no connection |
| Key set but `VITE_SUPABASE_URL` missing | `MISSING_SUPABASE_URL`; disabled, no derived URL |
| `VITE_SUPABASE_PROJECT_ID` without a URL | `MISSING_SUPABASE_URL`; the URL is never derived implicitly |
| Valid URL + explicit project ID + matching development allowlist + key | That explicitly designated project is used; trailing slash stripped; callback URL derived |
| Hosted project with no matching development allowlist | Rejected with `SUPABASE_DEVELOPMENT_PROJECT_NOT_ALLOWLISTED` or `SUPABASE_DEVELOPMENT_PROJECT_REFERENCE_MISMATCH` |
| Hosted URL without an explicit project ID | Rejected; project ID is not inferred for hosted targets |
| URL or project id invalid | Disabled, project URL cleared, `INVALID_SUPABASE_URL` / `INVALID_SUPABASE_PROJECT_ID` |
| URL and project id disagree | `SUPABASE_PROJECT_REFERENCE_MISMATCH`, nothing used |
| Legacy JWT key `ref` ≠ configured project | `SUPABASE_KEY_PROJECT_REFERENCE_MISMATCH`, nothing used |
| Service-role / `sb_secret_` / `postgres://` key | Refused |
| Opaque key with invalid publishable-key format | Refused |
| Legacy JWT without `role: anon` or hosted project ref | Refused |
| `http://127.0.0.1:54321` | Accepted for a local Supabase stack |

There is deliberately no implicit target and no fallback: an absent
or invalid configuration leaves the client disabled. Hosted targets must be
explicitly designated by the development allowlist. The resolver does not
infer that a project is production from a hard-coded ref; a reviewer/operator
must not designate an actual production project as development. Covered by
`tests/supabase-config.test.mjs`.

The App Builder React data path reads and writes `platform_config_versions`
with the current Supabase Auth session and database RLS. It does not use a
service-role key. Use the dedicated development project and provide
`VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_DEVELOPMENT_PROJECT_ID`,
`VITE_SUPABASE_URL`, and either
`VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY` in an untracked
`.env.local`. The URL hostname, project ID, and JWT `ref` (when the key is a
legacy anon JWT) must agree. Opaque publishable keys do not encode a project
reference, so verify their pairing against the intended development project's
dashboard before use. Never list a production project in the development
allowlist. The code cannot independently distinguish two environments that
share the same project reference.
The browser and Express server use the same resolver; the server loads `.env.local`
before `.env` while preserving variables already supplied by the process.
For server-side Google OAuth/session features, also configure the development
Google OAuth credentials and `BOS_SERVER_HMAC_SECRET` in local server
environment; never put those secrets in `VITE_*` variables.

New public-schema tables may not be exposed through the Supabase Data API by
default. After approving a development project, check its Data API schema
exposure settings for `public`; RLS and the migration's SQL grants still apply.

## 5. Migration review and proposed order

The current development target is unknown and unconfigured, so target-schema
conflicts cannot yet be checked. A clean local PostgreSQL 17.11 run has already
validated the baseline and six migration files; this does not establish that a
cloud project's schema is empty or compatible.

| Order | File | Dependencies and effect | Main risk / rollback |
| --- | --- | --- | --- |
| 0 | `supabase/schema_and_rls.sql` (baseline, not in CLI migration history) | Creates core profiles/listings/bookings and `is_admin()` / `is_active_user()` helpers. Must be applied exactly once before this app's migrations. | Can conflict with an existing schema. Do not apply to an occupied project without a conflict review and backup. |
| 1 | `20261101000002_marketplace_modules_and_stay_inventory.sql` | Requires baseline tables, `auth.users`, `pgcrypto`, and `btree_gist`. Adds module flags, contact consent/events/RPCs and stay inventory, holds and allocation exclusion constraints. | Additive tables, but later lifecycle behavior depends on them. Initial owner/auth foreign keys include cascade actions; review user-deletion and booking-retention policy before real use. |
| 2 | `20261101000003_fix_provider_contact_listing_ids.sql` | Requires migration 002. Drops UUID RPC overloads and recreates text-ID overloads to match `listings.id`. | Existing external callers of UUID overloads would break; rollback requires recreating them. |
| 3 | `20261101000004_platform_module_realtime.sql` | Requires `platform_module_flags` from 002 and active-admin profile helpers. Grants flag access, replaces write RLS with active-admin check, adds publication membership idempotently. | Table-level authenticated DELETE is granted and RLS is `FOR ALL`; ensure intended active-admin deletion capability is accepted. Publication membership is not a Data API exposure setting. |
| 4 | `20261101072320_active_admin_marketplace_listing_rls.sql` | Requires baseline `listings`, `profiles`, and admin helpers. Replaces admin listing policy and tightens owner update/delete policy branches. | Changes broad listing admin permissions. Restore prior policy definitions to roll back; inspect target policies first. |
| 5 | `20261101073937_admin_stay_inventory_safety.sql` | Requires 002 stay tables and baseline profiles/listings. Changes property→listing FK to `ON DELETE RESTRICT`, removes broad inventory `FOR ALL` policies, adds active owner/admin policies and `admin_upsert_stay_inventory` transaction RPC. | FK replacement can fail if target constraints/data differ. Inventory deletion policy is intentionally absent; rollback means restoring FK and old policies/RPC behavior. Test existing rows before applying. |
| 6 | `20261101075829_app_builder_config_versions.sql` | Requires baseline `auth.users`, `is_admin()`, and `is_active_user()`. Adds version table, RLS, data-only allowlist validator, save/publish/rollback RPCs, and Realtime membership. | Adds retained configuration history; rollback should preserve/export rows before dropping objects. Dashboard Data API exposure of `public` must be checked separately. |

The first app migration creates `btree_gist` and `pgcrypto`; target permissions
must allow required extensions. The baseline and all migrations must be reviewed
against the target project's existing tables, policies, functions, extensions,
and migration history before any cloud application. Local validation passed on
PostgreSQL 17.11; this does not prove cloud compatibility.

The App Builder migration grants `SELECT` to `anon` and `authenticated`,
`INSERT`/`UPDATE` to `authenticated`, and no table `DELETE`. RLS limits public
reads to published rows and admin history access/writes to active admins. RPCs
are security-invoker and require both `is_admin()` and `is_active_user()`;
published versions are immutable and rollback inserts a new published version.
The React client still needs the `public` schema exposed through the project's
Data API for PostgREST reads/RPC calls. RLS and SQL grants remain mandatory even
when the schema is exposed.

## 6. Preflight checklist — required before any cloud migration

- [ ] Project is a **development** project, not production; ref recorded.
- [ ] Local offline preflight passes; project ref is confirmed from the intended dev dashboard.
- [ ] Target schema and migration history are read-only inspected and compared to baseline + six migrations.
- [ ] A dry-run is prepared only after the target is identified; its output is reviewed before seeking approval.
- [ ] Baseline application plan states whether target is empty and how it will be backed up/recovered.
- [ ] `btree_gist` and `pgcrypto` extensions can be created.
- [ ] `public` Data API exposure is enabled for required app tables, including `platform_config_versions`, with RLS still enforced.
- [ ] Backup/recovery plan is ready before policy, RPC, FK or publication changes.
- [ ] Explicit human approval for this specific migration set.

## 7. App Builder integration test plan

After a dedicated development project is configured and its migration set is
explicitly approved/applied, test with **two real Supabase Auth identities**:
an active admin mapped to `public.profiles` and a normal customer. The server's
`bos_session_token_v1` is a separate auth system; it does not by itself create a
Supabase Auth JWT or satisfy App Builder RLS. Confirm the admin browser session
is actually signed in to Supabase before testing writes.

1. Active admin saves a draft; refresh the tab, sign out/in, and open a second browser profile. Admin should see the same draft and version record.
2. Customer/anon reads the config; it should see the published version only. Repeat while a newer draft exists.
3. Confirm customer, anonymous, inactive, and suspended accounts cannot save, publish, or roll back. Confirm an active admin can.
4. Publish as active admin. Reload a separate customer session and verify the new published version is returned. Verify another connected customer client receives the Realtime refresh.
5. Roll back to an older published version. Confirm a new version number is created, the older rows remain, and the customer sees the new rollback publication.
6. Repeat after a full browser restart and on a second device. Only this real cloud test establishes cross-session/device persistence.

The local SQL harness tests authorization and version rules on a disposable
PostgreSQL instance with Auth stubs. It is not a Supabase Auth, Data API,
Realtime, or cross-device cloud test. Browser-local caches are not evidence of
shared persistence.

## 8. Rollback risks (no automatic rollback exists)

| Migration | Risk | Inverse needed |
| --- | --- | --- |
| 002 | Creates tables/columns; additive | `drop table` chain (data loss) |
| 003 | **Drops** the uuid RPC overloads | Recreate uuid versions by hand |
| 004 | Replaces policy + grants DELETE/INSERT/UPDATE on flags | Restore previous policy by hand |
| 072320 | Replaces the listings admin policy | Restore old policy by hand |
| 073937 | Drops `FOR ALL` policies and the old FK | Recreate policies/FK by hand; FK swap fails if orphan rows exist |
| 075829 | Adds a table, policies, validators and RPCs; no existing rows are changed | Drop the table/functions/policies/publication membership only after confirming no App Builder versions need retention |

`supabase db push` has no `--rollback`. Take a branch or dump first.

## 9. What was actually verified, and where

**Local (executed):** `bash supabase/tests/run_local_validation.sh` → baseline
plus six migrations applied in order on disposable PostgreSQL 17.11; 14 App
Builder assertions, 52 stay/inventory assertions, 23 provider-contact
assertions, migration idempotency checks and concurrent allocation check passed.

**Cloud:** one existing project's metadata/schema was read-only inspected and
found incompatible. No cloud data was written, no migration was pushed, and no
RLS or admin authorization was tested against a live BookOurSpace database.

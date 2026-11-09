# BookOurSpace module contract

The marketplace is organised as independently configurable modules. This
document is the contract; `src/modules/registry.ts` is the machine-readable
version, and it is the only place a module's identity is declared.

## 1. Registry entry

Every module declares:

| Field | Purpose |
| --- | --- |
| `id` | Stable key. Matches `platform_module_flags.module_key`. |
| `version` | Contract version of this entry (`MAJOR.MINOR.PATCH`). |
| `label` | Default customer-facing name. |
| `route` | Deep link the section answers to (`#pg`, `#services`, `#stays`). |
| `entryPoints` | React components that render the module. |
| `screens` | Screen ids used by the marketplace shell. |
| `dataServices` | Functions/tables the module reads. |
| `dependsOn` | Database objects that must exist. |
| `config.fields` | Admin-editable presentation settings + validation rules. |
| `permissions` | View / contact-owner / admin-config / booking rules. |
| `healthChecks` | Named checks with `blocking` or `degraded` severity. |
| `cleanup` | What unmounting the section must release. |

Current modules: `hotels`, `pg`, `services`, `function_hall`, `classes`,
`movies`, `ecommerce`. The three redesigned experiences are `hotels`, `pg` and
`services`; the rest keep the existing marketplace screens.

## 2. Configuration

Visibility and capability live in the database (`platform_module_flags`),
never in `localStorage`. Presentation settings (label, headline, hero image,
layout, category count) are stored under the `modules` key of the existing
live-page configuration document, which already provides draft, publish,
version history and rollback through `/api/live-page-config`.

- Drafts are private: customer screens read `published` only.
- Invalid values (label too long, non-https image, unknown layout, out-of-range
  category count) are rejected at resolution time and replaced with the
  registry defaults, so bad admin input cannot blank a customer screen.
- Unknown module ids are dropped when the slice is read.

## 3. Health and recovery

`evaluateModuleHealth(moduleId, { flags, configIssues, dataReachable })`
returns `ok | degraded | disabled | unavailable` plus per-check detail and a
customer-safe message.

- Flags unreadable, missing row, or data unreachable → `unavailable` (fail closed, never "assume enabled").
- `is_enabled = false` → `disabled`. Deliberate, and never retried.
- Invalid config with valid flags → `degraded`, screen still renders with defaults.

`withBoundedRetry` retries **read-only** catalogue calls only: at most 3
attempts, exponential delay capped at 2 s, and only for transient errors. It is
never used for payments, inventory holds, contact recording or any other
non-idempotent operation. Nothing in this layer repairs data automatically.

## 4. Admin surface

`AdminPlatformModuleSettings` (Admin → Feature Management) shows:

- the database-backed visibility and owner-contact toggles;
- module health for every registry entry, with the reason for any non-ok state;
- the label/headline editor with **Save draft** and **Publish to customers**.

Publishing updates the existing configuration document; no redeploy is needed
for an ordinary presentation change.

## 5. Permissions

| Capability | Rule |
| --- | --- |
| View | Public, but only for enabled modules. |
| Contact owner | `allow_contact_owner` **and** a signed-in session, resolved through `provider_contact_details` (consent + verification). |
| Admin config | Active admin, enforced by RLS (`is_admin() and is_active_user()`), not by the UI. |
| Online booking | Server workflow only. No client path can enable it. |

## 6. MCP

The Supabase MCP server connected to this workspace is **read-only**: project
listing, schema introspection, migration listing, advisors and log queries.
There is no tool for arbitrary SQL, DDL or mutation, so MCP cannot be used to
apply migrations or to write during this task.

Allowlisted for module diagnostics: `list_projects`, `get_project`,
`list_tables`, `list_migrations`, `list_extensions`, `get_advisors`,
`query_logs`. Everything that writes (migrations, merges, branch resets, secret
reads) stays outside the agent's reach and needs a human operator.

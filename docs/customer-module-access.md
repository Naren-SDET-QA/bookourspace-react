# Customer Module Access

Individual, per-customer marketplace module permissions. Existing roles
(`customer`, `provider`, `admin`) are unchanged; this feature layers an
administrator-managed allow-list on top of the global module flags.

## Modules

The canonical module keys match the existing `platform_module_flags` gate:

| Module key | Customer label | Section route |
| --- | --- | --- |
| `pg` | PG Accommodation | `#pg` |
| `hotels` | Stays & Properties | `#stays` |
| `services` | Home Services | `#services` |
| `movies` | Movies & Cinemas | `#movies` |
| `classes` | Institutes & Classes | `#classes` |
| `function_hall` | Events & Function Halls | `#venues` |
| `ecommerce` | Ecommerce (not launched) | — |

Only the six keys with a section are surfaced in the admin UI.

## Data model

- `public.customer_module_access` — one row per (customer, module), with an
  optional `expires_at` and the granting administrator.
- `public.customer_module_access_audit` — append-only history (`grant`,
  `revoke`, `update`), written by an audit trigger on every change.
- `public.effective_customer_module_keys(uuid)` — security-definer RPC that is
  the authoritative answer: role/status, expiry, and global module flag are all
  resolved in one statement.
- `public.has_customer_module_access(text)` — boolean predicate available for
  future RLS policies on module-scoped objects.

The migration is additive only (two new tables, one trigger, two functions);
it changes no existing table, policy, role or module flag.

## Enforcement

1. **RLS** — customers can read only their own grant rows; administrators can
   read all; writes require an active administrator. There is no insert policy
   for an anonymous/customer session, so a customer can never grant themselves
   a module.
2. **Server** — `GET /api/customer/modules` returns the signed-in customer's
   effective module keys; `POST /api/customer/modules/verify` refuses an
   unauthorized module with `403`. Admin endpoints (`GET/PUT/DELETE
   /api/admin/customer-module-access/…`) re-verify an administrator session and
   fail closed without one.
3. **Client** — a signed-in customer's navigation is filtered to their
   authorized sections and a direct `#section` URL is blocked and redirected to
   the marketplace. Visibility is UX only and is backed by the checks above.

## Admin UI

**Admin console → Customer Module Access**: search customers by name/email,
toggle modules on/off, set an optional expiry per module, save, revoke all, and
review the audit history for a selected customer.

## Immediate effect

A saved grant/revoke dispatches `bos-customer-modules-updated`; the customer's
open tab refetches its allow-list, and any new request resolves against the
updated rows.

## Scope notes

- Providers and administrators are never constrained by this table.
- Module flags (`platform_module_flags`) still apply on top of grants: a
  customer grant for a globally disabled module is not usable.
- In local compatibility mode (no PostgreSQL) the customer endpoint returns the
  full module list so local development is not blocked; production always uses
  the database path.

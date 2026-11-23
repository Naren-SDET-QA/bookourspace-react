# User management & access control

One reusable engine controls every customer, provider and admin category in
BookOurSpace. Business-category behaviour stays outside this module: a category
is a row in the shared catalog, so a new marketplace module joins automatically
by being declared in `src/modules/registry.ts`.

## Directory

| File | Responsibility |
| --- | --- |
| `catalog.ts` | The single category/action/section catalog and alias map. Pure. |
| `engine.ts` | `authorize(actor, category, action, resource)`, signup defaults, self-elevation guards. Pure. |
| `health.ts` | Permission health scanning, repair planning and operation validation. Pure. |
| `repository.ts` | Postgres persistence: accounts, category grants, status, audit, repair apply/rollback. |
| `api.ts` | Admin HTTP API plus `GET /api/access/me`. |
| `middleware.ts` | Express adapters that make the engine the only decision point. |
| `index.ts` | Public module surface. |

## Storage (no duplicate permission system)

The engine writes the tables the product already used:

* `customer_module_access` — one row per customer per category, with
  `allowed_sections`, `allowed_actions` and `grant_source`
  (`manual`, `signup_default`, `legacy_backfill`, `repair`).
* `business_member_access` — one row per business member, with module, section
  and action grants, plus `grant_source`.
* `access_control_audit` — account status changes, presets, repairs.
* `access_control_repairs` — previewed plan, applied receipts and rollback.

An empty array keeps its historical meaning ("every section/action") only for
rows that predate explicit grants. New writes always store an explicit action
list, so `[]` is never used to mean "everything" by the console.

## Permission matrix

| Principal | Effective access |
| --- | --- |
| Super Admin (active) | Everything, every category, no grants required. Protected from permission edits by other admins and from being the last active Super Admin being suspended. |
| Admin (active) | Everything in the admin console; mutable category grants are not applied to admins. |
| Customer | Exactly the categories, sections and actions in their grant rows. No rows ⇒ unverified ⇒ denied. |
| Provider owner | Full control of an approved, enabled business in its own module. |
| Provider member | Bounded by the member grant (module, section, action) in their business's module. |
| Suspended / blocked / closed | Denied on the next request; status change also removes grant rows. |
| Anonymous | Denied; public reads keep their existing public routes. |

Actions: `view`, `create`, `edit`, `delete`, `approve`, `manage`.
`manage` implies the rest; any action implies `view`.

New accounts: `view` on every enabled active category only
(`DEFAULT_SIGNUP_ACTIONS = ['view']`).

## Integration contract

```ts
import { authorize, getAccessCategory } from '../permissions';

const decision = authorize(
  { userId, role, accountStatus, isSuperAdmin, customerGrants, businesses },
  categoryKey,          // 'pg' | 'hotels' | 'services' | 'sections alias' | ...
  'edit',
  { businessId, sectionKey, ownerUserId, category },
);
if (!decision.ok) return response.status(decision.status).json({ ok: false, error: decision.error });
```

Server gates in `server.ts` (provider business gate and customer booking gate)
call this engine directly. The admin API calls it for health/self-service
answers and uses `canManageAccess` / `mayModifyPermissionsFor` for mutations.

### Adding a category

1. Add the module to `src/modules/registry.ts` and its customer vocabulary to
   `src/lib/customerModuleMeta.ts`.
2. Add the provider module key mapping in `catalog.ts` if it has a provider
   workspace.
3. Nothing else: the catalog derives the category, defaults, health checks and
   the admin console entries from that data.

## Self-healing rules

* Safe repairs only ever create `view` grants (`insert_view_only_*`).
* Destructive repairs (delete a row, strip an action) are marked
  `approvalRequired` and excluded from a plan unless an administrator explicitly
  approves them.
* Every repair is previewed before it runs, stores its receipts, and can be
  rolled back exactly.

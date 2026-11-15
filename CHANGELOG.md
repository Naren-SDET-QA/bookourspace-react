# Changelog

All notable changes to BookOurSpace are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries are grouped by
`dev` branch state rather than tagged releases, because the project does not tag
releases.

## [Unreleased] — 2026-11-14

Provider portal and admin console redesign: the two consoles now share one navy
rail, one teal accent and one set of surfaces.

### Added

- Provider portal search over the rail's modules, showing a live result count and
  clearing on navigation. (`4fe09d1`)
- Provider portal notifications badge, fed by listings awaiting admin review and
  the signed-in account's new customer enquiries. Each item opens its module.
  (`4fe09d1`)
- Provider portal language menu covering the app's supported languages; choosing
  a language updates the application's language state. (`4fe09d1`)
- Grouped provider rail ("Workspace" and "Growth"), a breadcrumb in the content
  header, an account chip with name and role, and a rail status card. (`4fe09d1`)
- Shared brand token source: `src/theme/tokens.css` exposes the palette as
  Tailwind v4 `@theme` variables, and `src/theme/tokens.ts` mirrors it for inline
  styles and SVG attributes. (uncommitted in this working tree)
- Local console preview sessions, so a production build can be inspected without
  weakening production auth: `POST /api/local-provider-preview/session` and
  `POST /api/local-admin-preview/session`. Each route needs its own flag
  (`BOS_LOCAL_PROVIDER_PREVIEW` / `BOS_LOCAL_ADMIN_PREVIEW`), plus
  `BOS_POSTGRES_LOCAL_TEST_MODE=true` and a loopback database, answers only
  loopback callers with a loopback `Host`, signs exactly one seeded profile of
  the matching role, and returns `404 NOT_FOUND` otherwise. (uncommitted in this
  working tree)

### Changed

- Customer sign-in rebuilt as one combined screen for both the first-visit entry
  and `#login`: resort hero, the official lockup, "Book Spaces for Every
  Occasion", Movies/Classes/Function Halls/Hotels/PG shortcuts, Mobile OTP and
  Email tabs, `+91` number field, orange Send OTP, Google and Browse as Guest.
  The email code flow, Google OAuth, guest browsing and the access-config gates
  are the existing ones; the mobile tab is present but its Send OTP stays
  disabled with an explicit notice because the session exchange accepts only
  Google and email identities. (uncommitted in this working tree)

- Stays, home services and institute provider dashboards moved off their own
  coral, purple and forest-green accents onto the portal teal and navy. (`fb28b74`)
- Provider portal shell rebuilt to match the admin console chrome: navy sidebar
  with the brand block, a top bar with search and account chip, page title and
  subtitle in the content area, and the canvas/surface/border treatment used by
  admin screens. (`4fe09d1`)
- Admin console recoloured from indigo and violet to the teal brand across the
  admin sections, both super-admin hubs and the console header. (`b6223f5`)
- The page heading in the provider portal is now the active section rather than
  the generic "Provider workspace". (`4fe09d1`)
- The PG workspace now only receives `pg_hostels` businesses, and a stored
  business id is kept only while it still belongs to the signed-in account, so a
  provider whose only business is Stays or Services no longer lands on a PG
  console that fails with `BUSINESS_MODULE_MISMATCH`. (uncommitted in this
  working tree)
- Stays, Home services and Institute open the business that belongs to their own
  module, and show a create-business panel when the account holds none on that
  module, instead of the `BUSINESS_CONTEXT_REQUIRED` notice. The provider portal
  overview call now carries `x-business-id`, so those workspaces are scoped to
  the selected business. (uncommitted in this working tree)
- The classes batch console hides itself when the active business belongs to
  another module, instead of printing a module error inside the PG, Stays or
  Services screen. (uncommitted in this working tree)
- Duplicated brand hex values in admin and provider files replaced with shared
  `brand-*` utilities (`bg-brand-teal-deep`, `border-brand-border`,
  `from-brand-navy`, …). The rendered palette is unchanged:
  `#12C2A0`, `#0B8F76`, `#087A66`, `#04241C`, `#0B1526`, `#132238`, `#F4F7FB`,
  `#E3E9F2`. (uncommitted in this working tree)

### Fixed

- The admin console header's primary button kept an indigo hover
  (`hover:bg-indigo-800`) on a teal base; hover now uses the brand accent.
  (`b6223f5`)
- The super-admin hub button hover state followed the old indigo accent after its
  base turned teal. (`b6223f5`)
- `/#provider` and `/#admin` opened the marketplace on a cold load, because the
  hash router ran before the persisted session and the entry gate had settled.
  The hash is now re-applied once both are ready, using the router's own
  authority checks. (uncommitted in this working tree)

### Verified

Checked against a production build (`vite preview`, no HMR) with the local
preview sessions, at 1440 and 390 wide, light and dark:

- Provider portal: PG inventory renders the PG owner dashboard and its KPI row,
  no error banner and no classes console; light, dark and 390-wide layouts do not
  overflow.
- Admin console: header, section rail, Overview, Data Management and Users
  sections render; the active section tab uses `rgb(11, 143, 118)`.
- `/#provider` and `/#admin` open their console from a cold load; `/#admin` still
  refuses a provider session and `/#provider` still refuses a signed-out one.

### Not verified

- The admin console has one dark-mode leak: the Classes batch approvals card
  keeps a white surface on the dark canvas.
- `GET /api/admin/users` and `GET /api/notifications` answer 403 for the seeded
  admin in the local preview (the legacy `hasCurrentAdminSession` store check does
  not know that profile); the console tolerates both, but those panels are not
  showing live data.
- Marketplace chrome (category rail, bottom tab bar, Help bubble, demo banner)
  still surrounds both consoles, and `index.html` still sets
  `theme-color: #4f46e5`.
- The PG sub-pages beyond Dashboard (Dues, Collections, Rooms & beds, Tenants)
  and the remaining admin sections were not opened one by one.

# Recon map: OnlyPG-style PG owner workspace (web + mobile web)

Scope: the authenticated PG owner portal, based on the user's attached mobile screenshots and the public OnlyPGs owner navigation reference.
For: BookOurSpace PG owners.
Date: 2026-11-11

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | OnlyPGs public site | https://onlypgs.com/ | Direct public page was not accessible to the browsing connector; no login or private API was used. |
| 2 | User-provided owner navigation screenshot | https://onlypgs.com/ | Shows mobile drawer groups: Dashboard, Money, People, Property, Operations, Reports, Plan & billing, Settings. |
| 3 | User-provided owner navigation screenshot | https://onlypgs.com/ | Shows Dues, Collections, Expenses, Disputes, Leads, Bookings, Tenants, Staff, Rooms & Beds, Properties, Listings, Complaints, Requests, Food menu, Notices, Reviews and Community. |
| 4 | Public PG operations reference | https://app.gopgms.com/explore/ | Public feature pattern reference for occupancy, collections, dues, complaints, expenses, reports, leads and approvals. |
| 5 | Public PG management reference | https://trackmypg.com/mobile-app | Public feature pattern reference for rent invoices, reminders, payments, deposits, move-outs and reports. |

## Core loop

Owner signs in, selects a PG property, manages rooms and beds, reviews bookings, tracks money and operations, then publishes accurate availability to residents.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Owner login | `#provider_portal` after owner sign-in | Enter the owner workspace directly | local-dev owner login, server session | loading, authenticated, rejected |
| S02 | Owner shell | Provider portal → PG Owner | Persistent navigation and property selector | responsive drawer, property select, PG Owner / Marketplace tabs | desktop, mobile open, mobile closed |
| S03 | Dashboard | Owner shell → Dashboard | One-glance property health | KPI cards, properties, occupancy, inventory, bookings | loading, live data, empty |
| S04 | Dues | Owner shell → Money → Dues | Review unpaid booking amounts | outstanding total, due list, booking drill-down | empty, live booking-derived |
| S05 | Collections | Owner shell → Money → Collections | Review confirmed payment records | collected total, transaction list | empty, live booking-derived |
| S06 | Expenses | Owner shell → Money → Expenses | Track property costs | expense summary, ledger setup state | empty/setup |
| S07 | Disputes | Owner shell → Money → Disputes | Review money and resident disputes | audit-oriented empty/setup state | empty/setup |
| S08 | Leads | Owner shell → People → Leads | Convert enquiries into bookings | lead desk setup state | empty/setup |
| S09 | Bookings | Owner shell → People → Bookings | Review reservations and payment status | booking panel, server payment workflow | loading, empty, live |
| S10 | Tenants | Owner shell → People → Tenants | Manage resident records | tenant setup state | empty/setup |
| S11 | Staff | Owner shell → People → Staff | Manage people helping run the PG | staffing metrics/setup state | empty/setup |
| S12 | Rooms & beds | Owner shell → Property → Rooms & beds | Configure inventory and availability | room editor, bed labels, date blocks | loading, empty, live, error |
| S13 | Properties | Owner shell → Property → Properties | Manage PG listings | property cards, inventory counts | empty, live |
| S14 | Listings | Owner shell → Property → Listings | Control marketplace visibility | listing cards, property drill-down | empty, live |
| S15 | Complaints | Owner shell → Operations → Complaints | Track resident issues | support setup state | empty/setup |
| S16 | Requests | Owner shell → Operations → Requests | Review operational approvals | request setup state | empty/setup |
| S17 | Food menu | Owner shell → Operations → Food menu | Publish meals and mess charges | menu setup state | empty/setup |
| S18 | Notices | Owner shell → Operations → Notices | Broadcast owner updates | notice setup state | empty/setup |
| S19 | Reviews | Owner shell → Operations → Reviews | Monitor resident feedback | review setup state | empty/setup |
| S20 | Community | Owner shell → Operations → Community | Resident communication | community setup state | empty/setup |
| S21 | Reports | Owner shell → Reports | Occupancy and rent overview | export actions, KPI cards | live, empty |
| S22 | Plan & billing | Owner shell → Plan & billing | Manage owner subscription | billing setup state | setup |
| S23 | Settings | Owner shell → Settings | Configure owner workspace | profile, payments, notifications, team | editable/read-only setup |

## Flows

```text
F01 Owner signs in
    S01 -> S02 -> S03
    happy path clicks: 0 after successful owner login
    edge: invalid local account, blocked account, stale provider hash

F02 Owner reviews money
    S03 -> S04 or S05 -> S09
    happy path clicks: 2
    edge: no bookings, payment status not verified, partial backend data

F03 Owner configures inventory
    S03 -> S12 -> room editor -> date blocks
    happy path clicks: 3+
    edge: no room types, no beds, overlapping date block, API error

F04 Owner switches product surfaces
    S02 PG Owner tab -> Marketplace tab
    happy path clicks: 1
    edge: provider hash is cleared so marketplace does not immediately reopen owner mode
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Responsive owner drawer | desktop sidebar, mobile overlay drawer | open, closed, active item | S02-S23 |
| Property selector | all properties, one property | loading, selected, empty | S02-S23 |
| Workspace switcher | PG Owner, Marketplace | active, inactive | S02 |
| KPI card | blue, green, purple, amber | live, zero, empty | S03-S06, S21 |
| Page heading | title, subtitle, optional action | default, responsive | S04-S23 |
| Empty/setup panel | icon, title, explanation, optional action | empty, setup required | S06-S08, S10, S15-S20, S22 |
| Booking list | due, collection, booking | empty, live, pending | S04, S05, S09 |
| Room inventory editor | room type, rent, deposit, beds | loading, save, error | S12 |
| Date block editor | collapsed details panel | collapsed, expanded, saving, error | S12 |

## Inferred data model

```text
OwnerSession  user, role, verified, provider_id
              evidence: S01, existing server session flow
              confidence: high

Property      id, title, category_id, entity_type, status
              evidence: S02, S03, S13, provider listings API
              confidence: high

RoomType      room_type_id, name, occupancy_per_bed, monthly_rent_paise,
              security_deposit_paise, total_beds, available_beds, beds[]
              evidence: S12, existing PostgreSQL inventory API
              confidence: high

Booking       booking_id, listing_id, listing_title, status, payment_status,
              move_in, move_out, beds, total_due_paise
              evidence: S04, S05, S09, existing PG booking client
              confidence: high

FutureLedger  tenant_id, invoice_id, due_amount, collected_amount,
              expense_amount, dispute_status, receipt_id
              evidence: public PG operations references; not yet exposed by this repository API
              confidence: medium
```

Relationships: Owner 1-n Property; Property 1-n RoomType; RoomType 1-n Bed; Property 1-n Booking; future Tenant 1-n LedgerEntry.

## Feature matrix

See `features.csv`. Must: 23, should: 5, could: 2, skip: 0.

## Out of scope (cannot or should not be cloned)

- OnlyPGs source code, private APIs, private user data and branded assets.
- Real tenant, payment, KYC, WhatsApp or billing records not present in this project.
- Production payment settlement, reminders and ledger persistence until their server contracts are implemented.

## Size

Screens 23, flows 4, entities 5. Hard parts: tenant ledger, invoice generation, payment reconciliation, reminders, complaints, multi-property permissions and production billing. Size: XL for full backend parity; the current pass adds the complete owner navigation and safe live-data/setup surfaces.

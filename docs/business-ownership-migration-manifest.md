# Independent Business Ownership — Migration Manifest (Local Only)

Applied to local `bookourspace_dev` on PostgreSQL 55440. **No hosted Supabase migration was applied.**

| Order | Migration | SHA-256 | Purpose |
|---:|---|---|---|
| 80 | `20261112010000_business_ownership_phase1.sql` | `242915df355aea28b8be75797f66f5bb4532117fac3e9d5cb54eb37e7ea02cac` | Business, member, invitation, module-access and protected audit tables; RLS helpers; nullable `business_id` columns; Movies registration support |
| 81 | `20261112020000_business_ownership_phase2_backfill.sql` | `7cb229ee0dccd61589ecfbca9c5bb198868cae1aa1efb23b6934e66101ac7720` | Deterministic owner + module backfill; listing → booking → payment mapping; ambiguity report |
| 82 | `20261112030000_business_ownership_phase3_rls.sql` | `76c15c0f046fdeeb4c743c35e356310751bb48763ecfb26dada631aaaf759329` | Business-scoped RLS, module checks, removal of legacy owner/provider bypass policies |
| 83 | `20261112040000_business_ownership_phase4_rls.sql` | `ca1b51eff493674a2c8d5de0bf1148016d23ffbbffe8a621fd89c344945190f2` | Invoice, enquiry, contact-settings and payment-claim RLS; authenticated grants for the two previously ungranted tables |
| 84 | `20261112050000_business_ownership_phase5_transfer.sql` | `80d1e8cde339c718118c4c44c122c439d450d7f70c38d54fc5522a4103788147` | Secure two-step ownership transfer table, RLS and protected audit trigger |

Apply order is phase 1 → phase 2 → phase 3 → phase 4 → phase 5. The Supabase migration manifest and checksum inventory were regenerated locally; current total is **98 migrations plus baseline**.

## Local backfill evidence

| Measure | Result |
|---|---:|
| Businesses | 23 |
| Distinct owners | 13 |
| Multi-business owners | 3 — 6, 5 and 2 businesses |
| Owner memberships | 23 |
| Module-access rows | 23 |
| Listings mapped | 92 / 92 |
| Bookings mapped | 59 / 59 |
| Payment intents mapped | 49 / 49 |
| Stay properties mapped | 42 / 42 |
| Venue bookings mapped | 12 / 12 |
| Ambiguous records | 2 provider profiles with no listing/module relationship |

## Server enforcement evidence

- `/api/provider/listings` without `x-business-id`: **403**
- Invalid business ID: **403**
- Authorized business: **200**
- Suspended business: **403**; restore: **200**
- `/api/stays/host/listings` without a business header: **403**; with the Stays business: **200**
- `/api/admin/businesses`: **200** only for a Super Admin
- Ownership transfer request/accept: **201 / 200** in a temporary local business; temporary rows removed

## Rollback

`supabase/rollback/20261112_business_ownership_rollback.sql` removes Phase 1–5 policies, triggers, functions, `business_id` columns, transfer table and business tables in dependency order. It was tested on a cloned local database: business tables/columns absent afterward, while **37 profiles and 92 listings remained intact**. The original database was not rolled back.

## Remaining gaps

- Shared routes such as `/api/services/bookings`, `/api/venue-bookings` and class enrollment APIs now require a provider business header but their SQL still uses legacy owner/provider predicates rather than `business_id` in every path.
- Payment-claim/invoice API paths have not all been converted to business-filtered SQL; RLS coverage was added.
- Concurrency tests and full ownership-transfer audit verification are not complete.
- Staff invitation acceptance is wired through `#invite=` and the API, but corporate email delivery is not configured locally.

## Port reconciliation

The target checkout had no Phase 1–5 business migrations while the shared local database had five applied rows. The five migrations were ported byte-for-byte, then target-only forward migrations were added for Institute business scope, legacy null-row compatibility, anonymous listing policy separation, Super Admin business inserts, pinned security-definer paths, function privileges and venue-payment compatibility. The migration manifest and checksum inventory now verify **98 migrations plus baseline**.

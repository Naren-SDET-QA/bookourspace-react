# Migration 66 canonical review — local proposal only

**Reviewed:** 2026-11-07  
**Scope:** `20261107051930_restrict_service_provider_schedule_access.sql` only  
**Hosted status:** Not inspected or applied. This is not production approval.

## Current bytes

Rechecked after the latest local preflight. React and Capacitor currently contain byte-identical SQL with SHA-256:

`96fb8c34daa3cc5983c4903519e2ded737e5bf333a881865cb32e10a03d16202`

Both repositories' migration manifests and checksum inventories pass against their current files. The previously reported Capacitor digest (`6c9758eaab9cd8b6d7dec1233e2657895af1d7aeb8e068ce6a48300aeef5ef14`) was an earlier snapshot, not the current tree. No migration file or hash was changed in this remediation.

## Intended boundary

The current SQL revokes all table privileges on `public.service_provider_schedules` from `PUBLIC`, `anon`, and `authenticated`, then grants `SELECT`, `INSERT`, and `UPDATE` to `authenticated`. It does not grant `DELETE`. RLS scopes these direct reads and writes to an active provider's own schedule or an authorized active administrator. Raw schedule rows therefore are not a public discovery API. Anonymous customer discovery uses the established `service_listing_profile()` and `service_listing_slots()` projections, which return approved availability fields for active listings without exposing provider-private row fields.

This least-privilege reset-and-grant is the canonical candidate for review. The intended direct API privileges are authenticated-only `SELECT`/`INSERT`/`UPDATE`, with owner/admin RLS predicates, no client `DELETE`, and no broad public-row policy. The old variant that omitted `authenticated` from the `REVOKE` does not establish the intended reset-before-grant boundary.

## Local security evidence

- Services SQL RLS test: PASS for anon, unrelated customer, owner/provider, and admin cases.
- Services API suite: PASS for availability discovery, provider schedule management, booking concurrency, signed sandbox settlement, refund, and restart persistence.
- Both repository manifest verifiers: PASS on the current identical bytes.

These are disposable local results. Hosted policy/grant state and the current hosted ledger remain unverified. Re-run the hosted read-only catalog and ledger checks after read-only access is granted, then compare the hosted version/checksum and obtain separate approval before any hosted apply.

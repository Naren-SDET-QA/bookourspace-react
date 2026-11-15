# Booking and payment cutover plan

This is a deployment plan only. The migration has not been applied, and the live Supabase project has not been contacted.

## Before cutover

1. Take a recoverable Supabase snapshot and an encrypted copy of `authoritative-marketplace-store.json`. Keep the JSON snapshot unchanged until the migration is verified and the retention period has passed.
2. Confirm the database contains the base objects referenced by the migration (`bookings`, `payment_verifications`, `listings`, `seat_locks`, and `cinema_screens`). Run the migration in staging first.
3. Review the duplicate-slot preflight output. The migration stops on duplicate active exclusive reservations or overlapping availability locks; an operator must decide how to resolve each conflict. It does not delete rows.
4. Map application session IDs to the new `actor_id` text field. Map provider IDs to listing owners and verify every active listing and cinema screen has an authoritative database record.
5. Import legacy booking rows idempotently and compare counts, dates, amounts, statuses, seat locks, and customer/provider ownership. Import submitted UTRs as `pending_reconciliation`. Do not import a local “verified” flag as payment proof; match those payments against an independent bank/provider settlement record.
6. Reissue QR passes after rotating `BOS_SERVER_HMAC_SECRET`; passes signed with the prior secret will not validate under the new secret.
7. Confirm server-only `SUPABASE_SERVICE_ROLE_KEY`, `BOS_SERVER_HMAC_SECRET`, and `BOS_UPI_MERCHANT_VPA`. Configure Razorpay key ID/secret and webhook secret only after test-mode webhook/refund verification.

## Cutover

1. Pause writes to the old JSON booking/payment store and capture a final snapshot.
2. Apply `supabase/migrations/20261031143051_booking_payment_authority.sql` in staging, run migration/advisor checks, then run the production migration only after explicit approval.
3. Run the reviewed legacy import, then compare source and destination counts and financial totals. Keep UPI and refunds pending until independently reconciled.
4. Deploy the server and client together. Verify booking idempotency, simultaneous slot/seat conflicts, payment reconciliation, cancellation cutoffs, refund webhook handling, role isolation, and pagination in staging.
5. Retain the original JSON archive as a read-only recovery source. Do not dual-write bookings or payments back to JSON.

## Rollback

The migration is additive and does not delete database rows. If application rollback is required, stop new writes, export the post-cutover bookings/payment/refund changes, reconcile them before any old app version can write again, and retain the database as the recovery authority. Do not delete either the JSON archive or database records as a rollback shortcut.

## Unresolved gates

- There is no legacy-store import tool in this change; the source-to-database ETL and a count/amount reconciliation report must be prepared and reviewed before cutover.
- Pricing is not yet authoritative in the server/database for each module’s add-ons, taxes, discounts, and duration rules. A matching amount between a browser-created intent and booking is not enough to authorize production payment collection.
- Provider identity mapping, cinema screen configuration import, and QR pass reissue need staging validation.
- Full database-backed integration and six-module E2E tests require an available disposable Supabase environment plus the AI Studio source/screenshots.

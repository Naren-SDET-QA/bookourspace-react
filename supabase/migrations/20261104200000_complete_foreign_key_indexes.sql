-- 30 foreign keys added by later migrations have no leading index on the
-- referencing column. PostgreSQL does not index FK columns automatically, so
-- every parent DELETE/UPDATE cascade check and every ownership lookup on these
-- columns is a sequential scan.
--
-- Measured on an isolated cluster after the full migration chain:
--   30 of 97 public foreign keys had no valid leading index.
--
-- Additive and idempotent: only indexes are created. No table, column,
-- constraint, policy or grant is touched.

begin;

create index if not exists idx_provider_registration_reviewed_by
  on public.provider_registration_requests (reviewed_by);
create index if not exists idx_venue_seasonal_rates_owner
  on public.venue_seasonal_rates (owner_user_id);
create index if not exists idx_venue_blocks_owner
  on public.venue_blocks (owner_user_id);
create index if not exists idx_venue_booking_events_actor
  on public.venue_booking_events (actor_user_id);
create index if not exists idx_venue_payment_intents_customer
  on public.venue_payment_intents (customer_user_id);
create index if not exists idx_venue_payment_events_booking
  on public.venue_payment_events (booking_id);
create index if not exists idx_venue_payment_events_intent
  on public.venue_payment_events (payment_intent_id);
create index if not exists idx_venue_categories_updated_by
  on public.venue_categories (updated_by);
create index if not exists idx_venue_category_events_actor
  on public.venue_category_events (actor_user_id);
create index if not exists idx_service_booking_events_actor
  on public.service_booking_events (actor_id);
create index if not exists idx_service_payment_claims_claimed_by
  on public.service_payment_claims (claimed_by);
create index if not exists idx_service_payment_claims_reviewed_by
  on public.service_payment_claims (reviewed_by);
create index if not exists idx_service_reviews_customer
  on public.service_reviews (customer_id);
create index if not exists idx_payment_intents_room_type
  on public.payment_intents (room_type_id);
create index if not exists idx_payment_provider_events_intent
  on public.payment_provider_events (intent_id);
create index if not exists idx_class_batches_reviewed_by
  on public.class_batches (reviewed_by);
create index if not exists idx_service_payment_intents_customer
  on public.service_payment_intents (customer_id);
create index if not exists idx_service_payment_events_intent
  on public.service_payment_events (intent_id);
create index if not exists idx_venue_booking_disputes_opened_by
  on public.venue_booking_disputes (opened_by);
create index if not exists idx_venue_booking_disputes_resolved_by
  on public.venue_booking_disputes (resolved_by);
create index if not exists idx_pg_admin_audit_actor
  on public.pg_admin_audit (actor);
create index if not exists idx_pg_booking_disputes_opened_by
  on public.pg_booking_disputes (opened_by);
create index if not exists idx_pg_booking_disputes_resolved_by
  on public.pg_booking_disputes (resolved_by);
create index if not exists idx_pg_payment_claims_claimed_by
  on public.pg_payment_claims (claimed_by);
create index if not exists idx_pg_payment_claims_decided_by
  on public.pg_payment_claims (decided_by);
create index if not exists idx_pg_invoices_user_id
  on public.pg_invoices (user_id);
create index if not exists idx_app_builder_audit_events_actor
  on public.app_builder_audit_events (actor_user_id);
create index if not exists idx_app_builder_audit_events_source_version
  on public.app_builder_audit_events (source_version_id);
create index if not exists idx_user_access_audit_events_actor
  on public.user_access_audit_events (actor_user_id);
create index if not exists idx_user_access_audit_events_target
  on public.user_access_audit_events (target_user_id);

commit;

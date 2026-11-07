-- Cover every foreign-key column that had no leading index in the baseline
-- schema. PostgreSQL does not index referencing columns automatically, so
-- these lookups and cascade checks were sequential scans.
--
-- Additive and idempotent: no table, column, policy or constraint is changed.

create index if not exists idx_bookings_user_id on public.bookings (user_id);
create index if not exists idx_enquiries_user_id on public.enquiries (user_id);
create index if not exists idx_listings_owner_id on public.listings (owner_id);
create index if not exists idx_listings_verified_by on public.listings (verified_by);
create index if not exists idx_movie_refunds_booking_id on public.movie_refunds (booking_id);
create index if not exists idx_movie_refunds_customer_user_id on public.movie_refunds (customer_user_id);
create index if not exists idx_movie_support_tickets_customer_user_id on public.movie_support_tickets (customer_user_id);
create index if not exists idx_notifications_created_by on public.notifications (created_by);
create index if not exists idx_notifications_recipient_user_id on public.notifications (recipient_user_id);
create index if not exists idx_payment_verifications_user_id on public.payment_verifications (user_id);
create index if not exists idx_platform_config_versions_created_by on public.platform_config_versions (created_by);
create index if not exists idx_platform_config_versions_source_version_id on public.platform_config_versions (source_version_id);
create index if not exists idx_platform_module_flags_booking_approved_by on public.platform_module_flags (booking_approved_by);
create index if not exists idx_platform_module_flags_updated_by on public.platform_module_flags (updated_by);
create index if not exists idx_provider_contact_events_actor_user_id on public.provider_contact_events (actor_user_id);
create index if not exists idx_provider_contact_settings_owner_user_id on public.provider_contact_settings (owner_user_id);
create index if not exists idx_reviews_user_id on public.reviews (user_id);
create index if not exists idx_seat_locks_user_id on public.seat_locks (user_id);
create index if not exists idx_stay_allocations_guest_user_id on public.stay_allocations (guest_user_id);
create index if not exists idx_stay_audit_events_actor on public.stay_audit_events (actor);
create index if not exists idx_stay_audit_events_allocation_id on public.stay_audit_events (allocation_id);
create index if not exists idx_stay_blocks_created_by on public.stay_blocks (created_by);
create index if not exists idx_transactions_user_id on public.transactions (user_id);

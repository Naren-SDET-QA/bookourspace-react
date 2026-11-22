-- 20261118180000_universal_gps_engine.sql created
-- public.stamp_service_assignment() as a SECURITY DEFINER trigger function but,
-- unlike every sibling routine in that migration, never revoked the EXECUTE
-- privilege PostgreSQL grants to PUBLIC by default. The function is a trigger
-- function, so it cannot be invoked directly, but PUBLIC EXECUTE on a SECURITY
-- DEFINER routine is a security-advisor finding and breaks the invariant
-- asserted by supabase/tests/hosted_security_advisor_test.sql.
--
-- Match the sibling trigger functions (ensure_service_delivery_profile,
-- stop_delivery_tracking_on_terminal, apply_service_gps_metrics): owner and
-- service_role only, no anon/authenticated/PUBLIC EXECUTE.
begin;

revoke all on function public.stamp_service_assignment() from public, anon, authenticated;
grant execute on function public.stamp_service_assignment() to service_role;

commit;

-- 20261112100000 redefined this guard without a pinned search_path, which the
-- hosted security-advisor contract rejects. The function is schema-qualified;
-- pin it to an empty search path to preserve behavior and close the advisor gap.
alter function public.enforce_service_booking_guard() set search_path = '';

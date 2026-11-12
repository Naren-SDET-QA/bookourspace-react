revoke all on function public.service_booking_category_transition_guard() from public;
revoke all on function public.stop_delivery_tracking_on_terminal() from public;
revoke all on function public.ensure_service_delivery_profile() from public;
revoke all on function public.service_booking_requirements_check() from public;
grant execute on function public.service_booking_category_transition_guard() to service_role;
grant execute on function public.stop_delivery_tracking_on_terminal() to service_role;
grant execute on function public.ensure_service_delivery_profile() to service_role;
grant execute on function public.service_booking_requirements_check() to service_role;

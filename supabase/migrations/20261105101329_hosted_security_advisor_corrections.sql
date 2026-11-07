-- Local-only preparation for Mumbai security-advisor findings.
-- Forward-only; do not apply to a hosted project without separate approval.
begin;

-- These five routines reference application relations with explicit schema
-- qualification and built-ins through pg_catalog. An empty search_path removes
-- name-shadowing risk without changing their authorization or business logic.
alter function public.enforce_service_booking_guard()
  set search_path = '';
alter function public.enforce_service_booking_payment_guard()
  set search_path = '';
alter function public.pg_invoice_json(public.pg_invoices)
  set search_path = '';
alter function public.pg_dispute_json(public.pg_booking_disputes)
  set search_path = '';
alter function public.pg_claim_json(public.pg_payment_claims)
  set search_path = '';

-- Hold cleanup is invoked internally by the availability/hold routines. It has
-- no direct client call sites, so keep the RPC server-only.
revoke all on function public.sweep_expired_stay_holds()
  from public, anon, authenticated;
grant execute on function public.sweep_expired_stay_holds()
  to service_role;

-- These sweepers are scheduled/server cleanup operations, not client RPCs.
-- The backend uses its direct database/service role path; no application code
-- calls either function with an end-user Supabase session.
revoke all on function public.sweep_expired_payment_intents()
  from public, anon, authenticated;
grant execute on function public.sweep_expired_payment_intents()
  to service_role;

-- Movies V1 is discovery-only. The React client had a legacy direct RPC call
-- before its intentionally disabled HTTP endpoint; deny the underlying write
-- so the browser cannot create seat locks even when that HTTP route returns 410.
revoke all on function public.hold_movie_seats_atomic(text,text,text,text[],text,integer)
  from public, anon, authenticated, service_role;

-- btree_gist is relocatable. Move its extension-owned objects out of the API
-- schema; existing indexes retain their catalog dependencies and OIDs.
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

commit;

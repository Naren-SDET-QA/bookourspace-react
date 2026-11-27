-- Proposal only: business_backfill_review is a migration-only backfill queue.
-- No React, RPC, trigger, or Edge Function consumes this table. Operational
-- rollout documents call for reviewing/counting rows but do not specify an
-- API role; preserve owner/migration-runner access for those database tasks.
-- Do not apply to hosted DEV until the owner approves this exact migration.
begin;

revoke all privileges on table public.business_backfill_review
  from public, anon, authenticated, service_role;

commit;

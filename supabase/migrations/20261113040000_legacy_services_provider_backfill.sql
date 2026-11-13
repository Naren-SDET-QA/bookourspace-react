-- Legacy services-provider business backfill.
--
-- The provider module gate requires an approved business membership for
-- /api/services/provider and /api/services/workers. Phase 2 already created a
-- provisional business for every owner with a mapped listing, including
-- services listings. Providers that only have schedule/credentials/blackout/
-- worker/booking rows (or whose listing pre-dates the mapping) had no services
-- business and would be locked out of their existing workspace.
--
-- This backfill is fail-closed:
--   * a provider with ANY services business or ANY services membership history
--     (active, invited, suspended or revoked) is excluded; an administrative
--     suspension/revocation is never undone by a rerun;
--   * only a provider with no services business at all is considered;
--   * existing non-null listing/booking/schedule/credential/blackout ownership
--     is never overwritten, so transferred records keep their tenant;
--   * every changed row is recorded in business_audit_events;
--   * the temporary candidate set makes membership/module upserts apply only to
--     businesses created in this run, never to every historical backfill row.
--
-- The previous version of this file was never applied to a hosted database. It
-- is corrected in place because a later "fix" migration could not restore
-- booking business_ids that the old global update had already overwritten.

begin;

create temporary table bos_services_backfill_candidates on commit drop as
select p.id as owner_id,
       coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), 'Services provider') as owner_name
  from public.profiles p
 where p.role = 'provider'
   and p.account_status = 'active'
   -- Fail closed on any existing services business or membership history.
   and not exists (
     select 1
       from public.business_members m
       join public.businesses b on b.id = m.business_id
      where m.user_id = p.id
        and b.module_type = 'services'
   )
   and not exists (
     select 1
       from public.businesses b
      where b.owner_user_id = p.id
        and b.module_type = 'services'
   )
   and (
     exists (
       select 1 from public.listings l
        where l.owner_id = p.id
          and public.business_module_for_listing(l.category_id, l.entity_type) = 'services'
     )
     or exists (select 1 from public.service_provider_schedules s where s.provider_id = p.id)
     or exists (select 1 from public.service_provider_credentials c where c.provider_id = p.id)
     or exists (select 1 from public.service_provider_blackouts bl where bl.provider_id = p.id)
     or exists (select 1 from public.service_workers w where w.provider_id = p.id)
     or exists (select 1 from public.service_bookings sb where sb.provider_id = p.id)
   );

insert into public.businesses (
  business_ref, name, module_type, owner_user_id, approval_status, is_enabled,
  backfill_source, metadata, created_by, approved_at
)
select
  'BIZ-SVC-' || upper(substr(md5(owner_id::text), 1, 12)),
  owner_name || ' · Services',
  'services', owner_id, 'approved', true,
  'services_provider_backfill_v1',
  jsonb_build_object('provisional', true, 'legacy_services_provider_backfill', true),
  owner_id, now()
from bos_services_backfill_candidates
on conflict (business_ref) do nothing;

-- Membership changes are limited to businesses created by this candidate set.
with changed as (
  insert into public.business_members (business_id, user_id, role, status, accepted_at)
  select b.id, b.owner_user_id, 'owner', 'active', now()
    from public.businesses b
    join bos_services_backfill_candidates c on c.owner_id = b.owner_user_id
   where b.backfill_source = 'services_provider_backfill_v1'
     and b.module_type = 'services'
  on conflict (business_id, user_id) do update
    set role = 'owner', status = 'active'
    where business_members.role is distinct from 'owner'
       or business_members.status is distinct from 'active'
  returning business_id, user_id
)
insert into public.business_audit_events
  (business_id, actor_user_id, event_type, target_user_id, before_state, after_state, reason)
select business_id, null, 'services.backfill.member_linked', user_id,
       jsonb_build_object('membership', 'absent'),
       jsonb_build_object('role', 'owner', 'status', 'active'),
       'Legacy services provider backfill: owner membership linked'
  from changed;

-- Module access changes are limited to the same candidate set.
with changed as (
  insert into public.business_module_access (business_id, module_type, enabled, approval_status, approved_at)
  select b.id, 'services', true, 'approved', now()
    from public.businesses b
    join bos_services_backfill_candidates c on c.owner_id = b.owner_user_id
   where b.backfill_source = 'services_provider_backfill_v1'
     and b.module_type = 'services'
  on conflict (business_id, module_type) do update
    set enabled = true,
        approval_status = 'approved',
        approved_at = coalesce(public.business_module_access.approved_at, now())
    where business_module_access.enabled is distinct from true
       or business_module_access.approval_status is distinct from 'approved'
  returning business_id
)
insert into public.business_audit_events
  (business_id, actor_user_id, event_type, before_state, after_state, reason)
select business_id, null, 'services.backfill.module_linked',
       jsonb_build_object('module_access', 'absent'),
       jsonb_build_object('module_type', 'services', 'enabled', true, 'approval_status', 'approved'),
       'Legacy services provider backfill: services module access linked'
  from changed;

insert into public.business_audit_events (business_id, event_type, after_state, reason)
select b.id, 'business.backfilled',
       jsonb_build_object('business_ref', b.business_ref, 'module_type', b.module_type, 'owner_user_id', b.owner_user_id),
       'Legacy services provider backfill; provisional approved workspace'
  from public.businesses b
  join bos_services_backfill_candidates c on c.owner_id = b.owner_user_id
 where b.backfill_source = 'services_provider_backfill_v1'
   and b.module_type = 'services'
   and not exists (
     select 1 from public.business_audit_events e
      where e.business_id = b.id and e.event_type = 'business.backfilled'
   );

-- Only unassigned listings are linked. A transferred or deliberately assigned
-- listing is left untouched.
with changed as (
  update public.listings l
     set business_id = b.id
    from public.businesses b
    join bos_services_backfill_candidates c on c.owner_id = b.owner_user_id
   where b.owner_user_id = l.owner_id
     and b.module_type = 'services'
     and b.backfill_source = 'services_provider_backfill_v1'
     and public.business_module_for_listing(l.category_id, l.entity_type) = 'services'
     and l.business_id is null
  returning l.id, l.owner_id, l.business_id
)
insert into public.business_audit_events
  (business_id, actor_user_id, event_type, target_user_id, before_state, after_state, reason)
select business_id, null, 'services.backfill.listing_linked', owner_id,
       jsonb_build_object('business_id', null),
       jsonb_build_object('business_id', business_id, 'listing_id', id),
       'Legacy services provider backfill: unassigned listing linked'
  from changed;

-- Only unassigned bookings belonging to a verified backfill business are
-- linked. Existing non-null ownership, including transferred records, is never
-- overwritten.
with changed as (
  update public.service_bookings sb
     set business_id = l.business_id
    from public.listings l
    join public.businesses b on b.id = l.business_id
    join bos_services_backfill_candidates c on c.owner_id = b.owner_user_id
   where sb.listing_id = l.id
     and sb.business_id is null
     and b.module_type = 'services'
     and b.backfill_source = 'services_provider_backfill_v1'
  returning sb.id, sb.listing_id, l.business_id, b.owner_user_id as owner_id
)
insert into public.business_audit_events
  (business_id, actor_user_id, event_type, target_user_id, before_state, after_state, reason)
select business_id, null, 'services.backfill.booking_linked', owner_id,
       jsonb_build_object('business_id', null),
       jsonb_build_object('business_id', business_id, 'booking_id', id, 'listing_id', listing_id),
       'Legacy services provider backfill: unassigned booking linked'
  from changed;

-- Runtime service rows are linked only when unassigned and only for verified
-- backfill candidates.
with changed as (
  update public.service_provider_schedules s
     set business_id = b.id
    from public.businesses b
    join bos_services_backfill_candidates c on c.owner_id = b.owner_user_id
   where b.owner_user_id = s.provider_id
     and b.module_type = 'services'
     and b.backfill_source = 'services_provider_backfill_v1'
     and s.business_id is null
  returning s.provider_id, s.business_id
)
insert into public.business_audit_events
  (business_id, actor_user_id, event_type, target_user_id, before_state, after_state, reason)
select business_id, null, 'services.backfill.schedule_linked', provider_id,
       jsonb_build_object('business_id', null),
       jsonb_build_object('business_id', business_id, 'provider_id', provider_id),
       'Legacy services provider backfill: schedule linked'
  from changed;

with changed as (
  update public.service_provider_credentials c
     set business_id = b.id
    from public.businesses b
    join bos_services_backfill_candidates cand on cand.owner_id = b.owner_user_id
   where b.owner_user_id = c.provider_id
     and b.module_type = 'services'
     and b.backfill_source = 'services_provider_backfill_v1'
     and c.business_id is null
  returning c.id, c.provider_id, c.business_id
)
insert into public.business_audit_events
  (business_id, actor_user_id, event_type, target_user_id, before_state, after_state, reason)
select business_id, null, 'services.backfill.credentials_linked', provider_id,
       jsonb_build_object('business_id', null),
       jsonb_build_object('business_id', business_id, 'provider_id', provider_id, 'credential_id', id),
       'Legacy services provider backfill: credentials linked'
  from changed;

with changed as (
  update public.service_provider_blackouts bl
     set business_id = b.id
    from public.businesses b
    join bos_services_backfill_candidates c on c.owner_id = b.owner_user_id
   where b.owner_user_id = bl.provider_id
     and b.module_type = 'services'
     and b.backfill_source = 'services_provider_backfill_v1'
     and bl.business_id is null
  returning bl.id, bl.provider_id, bl.business_id
)
insert into public.business_audit_events
  (business_id, actor_user_id, event_type, target_user_id, before_state, after_state, reason)
select business_id, null, 'services.backfill.blackout_linked', provider_id,
       jsonb_build_object('business_id', null),
       jsonb_build_object('business_id', business_id, 'provider_id', provider_id, 'blackout_id', id),
       'Legacy services provider backfill: blackout linked'
  from changed;

commit;

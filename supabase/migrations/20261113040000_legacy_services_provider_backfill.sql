-- Legacy services-provider business backfill.
--
-- The provider module gate now requires an approved business membership for
-- /api/services/provider and /api/services/workers. Phase 2 already created a
-- provisional business for every owner with a mapped listing, including
-- services listings. Providers that only have schedule/credentials/blackout/
-- worker/booking rows (or whose listing pre-dates the mapping) had no services
-- business and would be locked out of their existing workspace.
--
-- This backfill is deterministic, idempotent, provisional and audited:
--   * one approved services business per affected active provider;
--   * owner membership and approved module access created explicitly;
--   * listings and services rows linked to the business where unambiguous;
--   * no prices, names or modules are inferred beyond services.
-- A Super Admin can still suspend or revoke any backfilled business.

with candidates as (
  select p.id as owner_id,
         coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), 'Services provider') as owner_name
    from public.profiles p
   where p.role = 'provider'
     and p.account_status = 'active'
     and not exists (
       select 1
         from public.business_members m
         join public.businesses b on b.id = m.business_id
        where m.user_id = p.id
          and m.status = 'active'
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
     )
)
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
from candidates
on conflict (business_ref) do nothing;

insert into public.business_members (business_id, user_id, role, status, accepted_at)
select b.id, b.owner_user_id, 'owner', 'active', now()
  from public.businesses b
 where b.backfill_source = 'services_provider_backfill_v1'
on conflict (business_id, user_id) do update set role = 'owner', status = 'active';

insert into public.business_module_access (business_id, module_type, enabled, approval_status, approved_at)
select b.id, 'services', true, 'approved', now()
  from public.businesses b
 where b.backfill_source = 'services_provider_backfill_v1'
on conflict (business_id, module_type) do update
  set enabled = true,
      approval_status = 'approved',
      approved_at = coalesce(public.business_module_access.approved_at, now());

insert into public.business_audit_events (business_id, event_type, after_state, reason)
select b.id, 'business.backfilled',
       jsonb_build_object('business_ref', b.business_ref, 'module_type', b.module_type, 'owner_user_id', b.owner_user_id),
       'Legacy services provider backfill; provisional approved workspace'
  from public.businesses b
 where b.backfill_source = 'services_provider_backfill_v1'
   and not exists (
     select 1 from public.business_audit_events e
      where e.business_id = b.id and e.event_type = 'business.backfilled'
   );

update public.listings l
   set business_id = b.id
  from public.businesses b
 where b.owner_user_id = l.owner_id
   and b.module_type = 'services'
   and b.backfill_source = 'services_provider_backfill_v1'
   and public.business_module_for_listing(l.category_id, l.entity_type) = 'services'
   and l.business_id is distinct from b.id;

update public.service_bookings sb
   set business_id = l.business_id
  from public.listings l
 where l.id = sb.listing_id
   and l.business_id is not null
   and sb.business_id is distinct from l.business_id;

update public.service_provider_schedules s
   set business_id = b.id
  from public.businesses b
 where b.owner_user_id = s.provider_id
   and b.module_type = 'services'
   and b.backfill_source = 'services_provider_backfill_v1'
   and s.business_id is distinct from b.id;

update public.service_provider_credentials c
   set business_id = b.id
  from public.businesses b
 where b.owner_user_id = c.provider_id
   and b.module_type = 'services'
   and b.backfill_source = 'services_provider_backfill_v1'
   and c.business_id is distinct from b.id;

update public.service_provider_blackouts bl
   set business_id = b.id
  from public.businesses b
 where b.owner_user_id = bl.provider_id
   and b.module_type = 'services'
   and b.backfill_source = 'services_provider_backfill_v1'
   and bl.business_id is distinct from b.id;

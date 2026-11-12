-- Bind existing institutes to the Classes business owned by the same user.
-- One Classes business can own multiple institutes as branches. No institute
-- is deleted or re-keyed; branch RLS remains the operational boundary.
alter table public.institutes add column if not exists business_id uuid references public.businesses(id) on delete restrict;

with owners as (
  select i.owner_id, min(i.name) as institute_name, bool_or(i.status = 'published') as has_published
    from public.institutes i
   where i.owner_id is not null
   group by i.owner_id
), created as (
  insert into public.businesses (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source,created_by,approved_at)
  select 'BIZ-INST-' || upper(substr(md5(o.owner_id::text || ':classes'),1,12)),
         o.institute_name || ' · Classes',
         'classes', o.owner_id, 'approved', true, 'institute_owner_backfill_v1', o.owner_id, now()
    from owners o
   where not exists (
     select 1 from public.businesses b where b.owner_user_id=o.owner_id and b.module_type='classes'
   )
  on conflict (business_ref) do nothing
  returning id, owner_user_id
)
select count(*) from created;

update public.institutes i
   set business_id = b.id
  from public.businesses b
 where b.owner_user_id = i.owner_id
   and b.module_type = 'classes'
   and i.business_id is distinct from b.id;

create index if not exists idx_institutes_business on public.institutes(business_id);

insert into public.business_audit_events (business_id,event_type,after_state,reason)
select b.id,'business.institute_backfilled',jsonb_build_object('institute_count',count(i.id)),'Existing institute owner mapped to Classes business'
  from public.businesses b join public.institutes i on i.business_id=b.id
 where b.backfill_source='institute_owner_backfill_v1'
 group by b.id
having not exists (
  select 1 from public.business_audit_events e where e.business_id=b.id and e.event_type='business.institute_backfilled'
);

drop policy if exists "institute_select" on public.institutes;
create policy "institute_select" on public.institutes for select to authenticated
using (
  (owner_id = auth.uid() and (business_id is null or public.can_access_business_module(business_id, array['owner','manager'])))
  or public.institute_can_access(id)
  or public.is_admin()
);

drop policy if exists "institute_update" on public.institutes;
create policy "institute_update" on public.institutes for update to authenticated
using (
  (owner_id = auth.uid() and (business_id is null or public.can_access_business_module(business_id, array['owner','manager'])))
  or public.institute_can_access(id, null, 'manage_profile')
  or public.is_admin()
)
with check (
  (owner_id = auth.uid() and (business_id is null or public.can_access_business_module(business_id, array['owner','manager'])))
  or public.institute_can_access(id, null, 'manage_profile')
  or public.is_admin()
);

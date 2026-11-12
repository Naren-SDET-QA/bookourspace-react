-- Verified transactional backfill + future insert enforcement for listings.
-- Every listing receives a business from its owner + module. Existing null rows
-- are assigned only to the deterministic owner_module_backfill_v1 business when
-- exactly one exists; otherwise to the single owner/module business already on
-- record. Ambiguous owners are resolved to the backfilled primary business and
-- remain auditable.
update public.listings l
   set business_id = b.id
  from public.businesses b
 where l.business_id is null
   and b.owner_user_id = l.owner_id
   and b.module_type = public.business_module_for_listing(l.category_id,l.entity_type)
   and b.id = (
     select b2.id from public.businesses b2
      where b2.owner_user_id=l.owner_id
        and b2.module_type=public.business_module_for_listing(l.category_id,l.entity_type)
      order by (b2.backfill_source='owner_module_backfill_v1') desc, b2.created_at, b2.id
      limit 1
   );

create or replace function public.ensure_listing_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text;
  v_business uuid;
  v_name text;
  v_ref text;
begin
  v_module := public.business_module_for_listing(new.category_id, new.entity_type);
  if new.business_id is not null then
    if not exists (select 1 from public.businesses b where b.id=new.business_id and b.owner_user_id=new.owner_id) then
      raise exception 'LISTING_BUSINESS_OWNER_MISMATCH' using errcode='42501';
    end if;
    return new;
  end if;
  if v_module is null then
    raise exception 'LISTING_MODULE_UNMAPPED' using errcode='23514';
  end if;
  select b.id into v_business from public.businesses b
   where b.owner_user_id=new.owner_id and b.module_type=v_module
   order by (b.backfill_source='owner_module_backfill_v1') desc, b.created_at, b.id
   limit 1;
  if v_business is null then
    v_ref := 'BIZ-AUTO-' || upper(substr(md5(new.owner_id::text || ':' || v_module),1,12));
    select coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Business owner') into v_name
      from public.profiles p where p.id=new.owner_id;
    insert into public.businesses (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source,created_by,approved_at)
    values (v_ref, coalesce(v_name,'Business owner') || ' · ' || case v_module
      when 'pg_hostels' then 'PG & Hostels' when 'classes' then 'Classes' when 'venues' then 'Function Halls'
      when 'services' then 'Services' when 'hotel_stay' then 'Stays' when 'movies' then 'Movies' end,
      v_module,new.owner_id,'approved',true,'auto_listing_trigger',new.owner_id,now())
    on conflict (business_ref) do update set updated_at=now()
    returning id into v_business;
  end if;
  new.business_id := v_business;
  return new;
end;
$$;

drop trigger if exists trg_ensure_listing_business on public.listings;
create trigger trg_ensure_listing_business before insert or update of owner_id, business_id, category_id, entity_type on public.listings
for each row execute function public.ensure_listing_business();

alter table public.listings alter column business_id set not null;

drop policy if exists "Public active listings" on public.listings;
drop policy if exists "Business listings for authenticated users" on public.listings;
drop policy if exists "Business listings are publicly readable or business-scoped" on public.listings;
create policy "Public active listings" on public.listings for select to anon
using (status='active' and public.business_publicly_available(business_id));
create policy "Business listings for authenticated users" on public.listings for select to authenticated
using (
  (status='active' and public.business_publicly_available(business_id))
  or public.can_access_business_module(business_id,array['owner','manager','staff'])
  or public.is_admin()
);
drop policy if exists "Business owners and managers create listings" on public.listings;
create policy "Business owners and managers create listings" on public.listings for insert to authenticated
with check (public.can_access_business_module(business_id,array['owner','manager']) and public.is_active_user());
drop policy if exists "Business owners and managers update listings" on public.listings;
create policy "Business owners and managers update listings" on public.listings for update to authenticated
using (public.can_access_business_module(business_id,array['owner','manager']) or public.is_admin())
with check (public.can_access_business_module(business_id,array['owner','manager']) or public.is_admin());
drop policy if exists "Business owners and managers delete listings" on public.listings;
create policy "Business owners and managers delete listings" on public.listings for delete to authenticated
using (public.can_access_business_module(business_id,array['owner','manager']) or public.is_admin());

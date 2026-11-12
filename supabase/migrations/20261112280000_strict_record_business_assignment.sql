-- Derive business_id from the authoritative listing/booking before writes, so
-- no new NULL-business transactional row can bypass business RLS.
create or replace function public.ensure_record_business()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_business uuid;
begin
  if new.business_id is not null then return new; end if;
  if tg_table_name in ('service_bookings','venue_bookings','bookings','stay_properties') then
    select l.business_id into v_business from public.listings l where l.id=new.listing_id limit 1;
  elsif tg_table_name in ('payment_intents','pg_invoices','pg_payment_claims') then
    select b.business_id into v_business from public.bookings b where b.id=new.booking_id::text limit 1;
    if v_business is null and new.listing_id is not null then
      select l.business_id into v_business from public.listings l where l.id=new.listing_id limit 1;
    end if;
  elsif tg_table_name in ('service_payment_intents','service_payment_claims') then
    select b.business_id into v_business from public.service_bookings b where b.id=new.booking_id limit 1;
  elsif tg_table_name='venue_payment_intents' then
    select b.business_id into v_business from public.venue_bookings b where b.id=new.booking_id limit 1;
  end if;
  if v_business is not null then new.business_id := v_business; end if;
  return new;
end $$;

do $$ begin
  if to_regclass('public.bookings') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.bookings';
    execute 'create trigger trg_ensure_record_business before insert or update on public.bookings for each row execute function public.ensure_record_business()';
  end if;
  if to_regclass('public.service_bookings') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.service_bookings';
    execute 'create trigger trg_ensure_record_business before insert or update on public.service_bookings for each row execute function public.ensure_record_business()';
  end if;
  if to_regclass('public.venue_bookings') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.venue_bookings';
    execute 'create trigger trg_ensure_record_business before insert or update on public.venue_bookings for each row execute function public.ensure_record_business()';
  end if;
  if to_regclass('public.stay_properties') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.stay_properties';
    execute 'create trigger trg_ensure_record_business before insert or update on public.stay_properties for each row execute function public.ensure_record_business()';
  end if;
  if to_regclass('public.payment_intents') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.payment_intents';
    execute 'create trigger trg_ensure_record_business before insert or update on public.payment_intents for each row execute function public.ensure_record_business()';
  end if;
  if to_regclass('public.service_payment_intents') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.service_payment_intents';
    execute 'create trigger trg_ensure_record_business before insert or update on public.service_payment_intents for each row execute function public.ensure_record_business()';
  end if;
  if to_regclass('public.venue_payment_intents') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.venue_payment_intents';
    execute 'create trigger trg_ensure_record_business before insert or update on public.venue_payment_intents for each row execute function public.ensure_record_business()';
  end if;
end $$;

-- Remove legacy NULL-business branches now that writes are assigned.
drop policy if exists "Business members read service bookings" on public.service_bookings;
create policy "Business members read service bookings" on public.service_bookings for select to authenticated
using (customer_id=(select auth.uid()) or public.can_access_business_module(business_id,array['owner','manager','staff','accountant']) or public.is_admin());
drop policy if exists "Business members update service bookings" on public.service_bookings;
create policy "Business members update service bookings" on public.service_bookings for update to authenticated
using (customer_id=(select auth.uid()) or public.can_access_business_module(business_id,array['owner','manager','staff']) or public.is_admin())
with check (customer_id=(select auth.uid()) or public.can_access_business_module(business_id,array['owner','manager','staff']) or public.is_admin());

drop policy if exists "Business members read venue bookings" on public.venue_bookings;
create policy "Business members read venue bookings" on public.venue_bookings for select to authenticated
using (customer_user_id=(select auth.uid()) or public.can_access_business_module(business_id,array['owner','manager','staff','accountant']) or public.is_admin());

drop policy if exists "Customers and business finance read venue payment intents" on public.venue_payment_intents;
create policy "Customers and business finance read venue payment intents" on public.venue_payment_intents for select to authenticated
using (customer_user_id=(select auth.uid()) or public.can_access_business_module(business_id,array['owner','manager','accountant']) or public.is_admin());

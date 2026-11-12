-- Repair ensure_record_business(): 20261112280000 read `new.listing_id` for the
-- shared ('payment_intents','pg_invoices','pg_payment_claims') branch, but
-- public.pg_payment_claims has no listing_id column (only booking_id). Any
-- claim whose booking resolved to a NULL business raised
-- 42703 record "new" has no field "listing_id" and aborted the insert/update.
--
-- Each table now has its own branch, so no branch reads a column that does not
-- exist on that relation.

create or replace function public.ensure_record_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
begin
  if new.business_id is not null then
    return new;
  end if;

  if tg_table_name in ('service_bookings', 'venue_bookings', 'bookings', 'stay_properties') then
    select l.business_id into v_business
      from public.listings l
     where l.id = new.listing_id
     limit 1;

  elsif tg_table_name = 'pg_payment_claims' then
    -- Claims identify their booking only; there is no listing_id column.
    select b.business_id into v_business
      from public.bookings b
     where b.id = new.booking_id::text
     limit 1;

  elsif tg_table_name in ('payment_intents', 'pg_invoices') then
    select b.business_id into v_business
      from public.bookings b
     where b.id = new.booking_id::text
     limit 1;
    if v_business is null and new.listing_id is not null then
      select l.business_id into v_business
        from public.listings l
       where l.id = new.listing_id
       limit 1;
    end if;

  elsif tg_table_name in ('service_payment_intents', 'service_payment_claims') then
    select b.business_id into v_business
      from public.service_bookings b
     where b.id = new.booking_id
     limit 1;

  elsif tg_table_name = 'venue_payment_intents' then
    select b.business_id into v_business
      from public.venue_bookings b
     where b.id = new.booking_id
     limit 1;
  end if;

  if v_business is not null then
    new.business_id := v_business;
  end if;
  return new;
end $$;

do $$
begin
  if to_regclass('public.pg_payment_claims') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.pg_payment_claims';
    execute 'create trigger trg_ensure_record_business before insert or update on public.pg_payment_claims for each row execute function public.ensure_record_business()';
  end if;
  if to_regclass('public.payment_intents') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.payment_intents';
    execute 'create trigger trg_ensure_record_business before insert or update on public.payment_intents for each row execute function public.ensure_record_business()';
  end if;
  if to_regclass('public.pg_invoices') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.pg_invoices';
    execute 'create trigger trg_ensure_record_business before insert or update on public.pg_invoices for each row execute function public.ensure_record_business()';
  end if;
end $$;

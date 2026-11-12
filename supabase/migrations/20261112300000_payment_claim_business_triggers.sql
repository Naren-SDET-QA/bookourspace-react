-- Claims/invoices written by providers/customers inherit the business from their
-- booking; without this the strict business read policy hides the new claim.
update public.service_payment_claims c set business_id=b.business_id
  from public.service_bookings b where b.id=c.booking_id and c.business_id is null;
update public.pg_payment_claims c set business_id=b.business_id
  from public.bookings b where b.id=c.booking_id::text and c.business_id is null;
update public.pg_invoices i set business_id=b.business_id
  from public.bookings b where b.id=i.booking_id::text and i.business_id is null;
do $$ begin
  if to_regclass('public.service_payment_claims') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.service_payment_claims';
    execute 'create trigger trg_ensure_record_business before insert or update on public.service_payment_claims for each row execute function public.ensure_record_business()';
  end if;
  if to_regclass('public.pg_payment_claims') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.pg_payment_claims';
    execute 'create trigger trg_ensure_record_business before insert or update on public.pg_payment_claims for each row execute function public.ensure_record_business()';
  end if;
  if to_regclass('public.pg_invoices') is not null then
    execute 'drop trigger if exists trg_ensure_record_business on public.pg_invoices';
    execute 'create trigger trg_ensure_record_business before insert or update on public.pg_invoices for each row execute function public.ensure_record_business()';
  end if;
end $$;

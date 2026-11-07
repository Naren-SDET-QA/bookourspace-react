-- Provider ownership coherence for the legacy booking/enquiry tables.
--
-- public.bookings.listing_id, public.bookings.provider_id,
-- public.enquiries.listing_id and public.enquiries.provider_id are untyped
-- TEXT columns with no foreign key. The RLS INSERT policies only prove that
-- user_id = auth.uid(), so a client could persist a booking whose provider_id
-- is another provider's auth UUID and inject rows into that provider's queue
-- (the provider read policy matches provider_id = auth.uid()::text).
--
-- A plain foreign key cannot be added here without breaking the current
-- application: catalogue bookings reference listings that exist only in the
-- seeded catalogue and are not rows in public.listings, and provider_id is a
-- catalogue slug (for example 'prov-103') rather than an auth UUID. Both shapes
-- are legitimate today.
--
-- The guard below is therefore conditional and strictly narrower than a slug
-- ban: it only rejects a write when provider_id names a real profile but is not
-- the owner of the referenced listing. A spoofed victim UUID always resolves to
-- a profile, so spoofing is blocked; catalogue slugs and the listing owner's own
-- UUID continue to work unchanged.
--
-- Additive and idempotent.

begin;

-- Ownership lookups filter on these columns; owner_id/verified_by are already
-- covered by 20261103120000_marketplace_foreign_key_indexes.sql.
create index if not exists idx_bookings_listing_id on public.bookings (listing_id);
create index if not exists idx_bookings_provider_id on public.bookings (provider_id);
create index if not exists idx_enquiries_listing_id on public.enquiries (listing_id);
create index if not exists idx_enquiries_provider_id on public.enquiries (provider_id);

create or replace function public.enforce_booking_provider_ownership()
returns trigger
language plpgsql
-- SECURITY DEFINER is required: the identity lookup below must see the
-- provider's profile row even though the writing customer's RLS scope cannot
-- read an unrelated profile. The function only reads and raises; it never
-- writes, so elevation cannot be composed into a privilege escalation.
security definer
set search_path = public, pg_temp
as $$
declare
  listing_owner text;
begin
  -- Missing/blank provider ids are rejected by the column's NOT NULL/CHECK
  -- constraints elsewhere; nothing to verify here.
  if new.provider_id is null or btrim(new.provider_id) = '' then
    return new;
  end if;

  -- Catalogue-era identifier (for example 'prov-103'): not an auth profile, so
  -- there is no profile identity that could be spoofed.
  if not exists (
    select 1 from public.profiles profile where profile.id::text = new.provider_id
  ) then
    return new;
  end if;

  select listing.owner_id::text into listing_owner
    from public.listings listing
   where listing.id = new.listing_id;

  if listing_owner is null or listing_owner <> new.provider_id then
    raise exception
      using message = 'BOOKING_PROVIDER_LISTING_MISMATCH',
            errcode = '42501',
            detail = 'provider_id names a profile that does not own the referenced listing';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_enquiry_provider_ownership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  listing_owner text;
begin
  if new.provider_id is null or btrim(new.provider_id) = '' then
    return new;
  end if;

  if not exists (
    select 1 from public.profiles profile where profile.id::text = new.provider_id
  ) then
    return new;
  end if;

  select listing.owner_id::text into listing_owner
    from public.listings listing
   where listing.id = new.listing_id;

  if listing_owner is null or listing_owner <> new.provider_id then
    raise exception
      using message = 'ENQUIRY_PROVIDER_LISTING_MISMATCH',
            errcode = '42501',
            detail = 'provider_id names a profile that does not own the referenced listing';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_booking_provider_ownership() from public, anon, authenticated;
revoke all on function public.enforce_enquiry_provider_ownership() from public, anon, authenticated;

drop trigger if exists trg_enforce_booking_provider_ownership on public.bookings;
create trigger trg_enforce_booking_provider_ownership
  before insert or update of listing_id, provider_id on public.bookings
  for each row execute function public.enforce_booking_provider_ownership();

drop trigger if exists trg_enforce_enquiry_provider_ownership on public.enquiries;
create trigger trg_enforce_enquiry_provider_ownership
  before insert or update of listing_id, provider_id on public.enquiries
  for each row execute function public.enforce_enquiry_provider_ownership();

comment on function public.enforce_booking_provider_ownership() is
  'Rejects a booking whose provider_id is a real profile that does not own the referenced listing. Catalogue slugs are preserved.';
comment on function public.enforce_enquiry_provider_ownership() is
  'Rejects an enquiry whose provider_id is a real profile that does not own the referenced listing. Catalogue slugs are preserved.';

commit;

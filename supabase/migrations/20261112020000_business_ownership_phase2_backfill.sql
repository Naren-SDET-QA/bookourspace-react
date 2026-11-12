-- Phase 2: deterministic business_id backfill.
-- Only owner+module and listing→booking→payment relationships are used.
-- No business name, price, address or module is inferred beyond the existing
-- category/entity mapping. Anything unresolved is reported for manual review.

alter table public.enquiries add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.reviews add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.media_assets add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table if exists public.service_provider_blackouts add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table if exists public.service_provider_schedules add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table if exists public.service_provider_credentials add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.provider_registration_requests add column if not exists business_id uuid references public.businesses(id) on delete set null;

create index if not exists idx_enquiries_business on public.enquiries (business_id);
create index if not exists idx_reviews_business on public.reviews (business_id);
create index if not exists idx_media_assets_business on public.media_assets (business_id);

-- One provisional business per existing owner + module. This is deterministic;
-- multiple brands of the same module under one owner are flagged as provisional
-- in metadata and must be split by the owner/admin after review.
with pairs as (
  select l.owner_id,
         public.business_module_for_listing(l.category_id, l.entity_type) as module_type,
         count(*)::int as listing_count,
         min(l.created_at) as first_listing_at
    from public.listings l
   where l.owner_id is not null
     and public.business_module_for_listing(l.category_id, l.entity_type) is not null
   group by l.owner_id, public.business_module_for_listing(l.category_id, l.entity_type)
), named as (
  select p.*, coalesce(nullif(trim(pr.full_name), ''), nullif(trim(pr.email), ''), 'Business owner') as owner_name
    from pairs p
    join public.profiles pr on pr.id = p.owner_id
)
insert into public.businesses (
  business_ref, name, module_type, owner_user_id, approval_status, is_enabled,
  backfill_source, metadata, created_by, approved_at
)
select
  'BIZ-' || upper(substr(md5(owner_id::text || ':' || module_type), 1, 12)),
  owner_name || ' · ' || case module_type
    when 'pg_hostels' then 'PG & Hostels'
    when 'classes' then 'Classes'
    when 'venues' then 'Function Halls'
    when 'services' then 'Services'
    when 'hotel_stay' then 'Stays'
    when 'movies' then 'Movies'
  end,
  module_type, owner_id, 'approved', true,
  'owner_module_backfill_v1',
  jsonb_build_object('provisional', true, 'listing_count', listing_count, 'first_listing_at', first_listing_at),
  owner_id, now()
from named
on conflict (business_ref) do nothing;

insert into public.business_members (business_id, user_id, role, status, accepted_at)
select b.id, b.owner_user_id, 'owner', 'active', now()
  from public.businesses b
 where b.backfill_source = 'owner_module_backfill_v1'
on conflict (business_id, user_id) do update set role = 'owner', status = 'active';

insert into public.business_module_access (business_id, module_type, enabled, approval_status, approved_at)
select b.id, b.module_type, true, 'approved', now()
  from public.businesses b
 where b.backfill_source = 'owner_module_backfill_v1'
on conflict (business_id, module_type) do update
  set enabled = true, approval_status = 'approved', approved_at = coalesce(public.business_module_access.approved_at, now());

insert into public.business_audit_events (business_id, event_type, after_state, reason)
select b.id, 'business.backfilled',
       jsonb_build_object('business_ref', b.business_ref, 'module_type', b.module_type, 'owner_user_id', b.owner_user_id),
       'Deterministic owner + module backfill; provisional business grouping'
  from public.businesses b
 where b.backfill_source = 'owner_module_backfill_v1'
   and not exists (
     select 1 from public.business_audit_events e
      where e.business_id = b.id and e.event_type = 'business.backfilled'
   );

update public.listings l
   set business_id = b.id
  from public.businesses b
 where b.owner_user_id = l.owner_id
   and b.module_type = public.business_module_for_listing(l.category_id, l.entity_type)
   and b.backfill_source = 'owner_module_backfill_v1'
   and l.business_id is distinct from b.id;

update public.bookings x set business_id = l.business_id
  from public.listings l where l.id = x.listing_id and x.business_id is distinct from l.business_id and l.business_id is not null;
update public.service_bookings x set business_id = l.business_id
  from public.listings l where l.id = x.listing_id and x.business_id is distinct from l.business_id and l.business_id is not null;
update public.venue_bookings x set business_id = l.business_id
  from public.listings l where l.id = x.listing_id and x.business_id is distinct from l.business_id and l.business_id is not null;
update public.stay_properties x set business_id = l.business_id
  from public.listings l where l.id = x.listing_id and x.business_id is distinct from l.business_id and l.business_id is not null;
update public.enquiries x set business_id = l.business_id
  from public.listings l where l.id = x.listing_id and x.business_id is distinct from l.business_id and l.business_id is not null;
update public.reviews x set business_id = l.business_id
  from public.listings l where l.id = x.listing_id and x.business_id is distinct from l.business_id and l.business_id is not null;
update public.provider_contact_settings x set business_id = l.business_id
  from public.listings l where l.id = x.listing_id and x.business_id is distinct from l.business_id and l.business_id is not null;
update public.media_assets x set business_id = l.business_id
  from public.listings l where x.parent_type = 'listing' and x.parent_id = l.id and x.business_id is distinct from l.business_id and l.business_id is not null;

-- Payments are mapped only through their authoritative booking/listing row.
update public.payment_intents x set business_id = b.business_id
  from public.bookings b where b.id = x.booking_id and b.business_id is not null and x.business_id is distinct from b.business_id;
update public.payment_intents x set business_id = l.business_id
  from public.listings l where l.id = x.listing_id and l.business_id is not null and x.business_id is null;
update public.pg_invoices x set business_id = b.business_id
  from public.bookings b where b.id = x.booking_id and b.business_id is not null and x.business_id is distinct from b.business_id;
update public.pg_invoices x set business_id = l.business_id
  from public.listings l where l.id = x.listing_id and l.business_id is not null and x.business_id is null;
update public.pg_payment_claims x set business_id = b.business_id
  from public.bookings b where b.id = x.booking_id and b.business_id is not null and x.business_id is distinct from b.business_id;
update public.service_payment_intents x set business_id = b.business_id
  from public.service_bookings b where b.id = x.booking_id and b.business_id is not null and x.business_id is distinct from b.business_id;
update public.service_payment_claims x set business_id = b.business_id
  from public.service_bookings b where b.id = x.booking_id and b.business_id is not null and x.business_id is distinct from b.business_id;
update public.venue_payment_intents x set business_id = b.business_id
  from public.venue_bookings b where b.id = x.booking_id and b.business_id is not null and x.business_id is distinct from b.business_id;

-- Ambiguity report: records that cannot be mapped without guessing.
insert into public.business_backfill_review (table_name, record_id, reason, owner_user_id, module_type)
select 'listings', id, 'missing_owner_or_module_mapping', owner_id, null
  from public.listings
 where business_id is null
on conflict do nothing;
insert into public.business_backfill_review (table_name, record_id, reason, owner_user_id, module_type)
select 'bookings', id, 'listing_without_business_mapping', null, null
  from public.bookings where business_id is null
on conflict do nothing;
insert into public.business_backfill_review (table_name, record_id, reason, owner_user_id, module_type)
select 'service_bookings', id::text, 'listing_without_business_mapping', provider_id, null
  from public.service_bookings where business_id is null
on conflict do nothing;
insert into public.business_backfill_review (table_name, record_id, reason, owner_user_id, module_type)
select 'venue_bookings', id::text, 'listing_without_business_mapping', owner_user_id, null
  from public.venue_bookings where business_id is null
on conflict do nothing;
insert into public.business_backfill_review (table_name, record_id, reason, owner_user_id, module_type)
select 'payment_intents', id, 'booking_or_listing_without_business_mapping', user_id, null
  from public.payment_intents where business_id is null
on conflict do nothing;
insert into public.business_backfill_review (table_name, record_id, reason, owner_user_id, module_type)
select 'profiles', p.id::text, 'provider_without_listing_module_relationship', p.id, null
  from public.profiles p
 where p.role = 'provider'
   and not exists (select 1 from public.listings l where l.owner_id = p.id)
on conflict do nothing;

create index if not exists idx_businesses_owner on public.businesses (owner_user_id, module_type);
create index if not exists idx_business_members_business_user on public.business_members (business_id, user_id);

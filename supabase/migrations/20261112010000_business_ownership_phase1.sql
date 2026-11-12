-- Phase 1: independent business ownership foundation.
-- Additive, locally tested only. No hosted database is modified by this file.

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  business_ref text not null unique,
  name text not null,
  module_type text not null check (module_type in ('pg_hostels','classes','venues','services','hotel_stay','movies')),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','suspended','revoked')),
  is_enabled boolean not null default true,
  backfill_source text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_ref_length check (length(business_ref) between 6 and 80),
  constraint businesses_name_length check (length(trim(name)) between 2 and 160)
);

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','manager','staff','accountant')),
  status text not null default 'active' check (status in ('invited','active','suspended','revoked')),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_email text,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists idx_business_members_user on public.business_members (user_id, status);
create index if not exists idx_business_members_business on public.business_members (business_id, role, status);

create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager','staff','accountant')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, email, status)
);

create table if not exists public.business_module_access (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  module_type text not null check (module_type in ('pg_hostels','classes','venues','services','hotel_stay','movies')),
  enabled boolean not null default true,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','suspended','revoked')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (business_id, module_type)
);

create table if not exists public.business_audit_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_business_audit_business_time on public.business_audit_events (business_id, created_at desc);

create table if not exists public.business_backfill_review (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  reason text not null,
  owner_user_id uuid,
  module_type text,
  created_at timestamptz not null default now(),
  unique (table_name, record_id, reason)
);

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_invitations enable row level security;
alter table public.business_module_access enable row level security;
alter table public.business_audit_events enable row level security;
alter table public.business_backfill_review enable row level security;

revoke all on public.businesses, public.business_members, public.business_invitations, public.business_module_access from public, anon;
revoke all on public.business_audit_events from public, anon;
revoke insert, update, delete on public.business_audit_events from authenticated;
grant select on public.businesses, public.business_members, public.business_invitations, public.business_module_access, public.business_audit_events to authenticated;
grant insert, update on public.businesses, public.business_members, public.business_invitations, public.business_module_access to authenticated;
grant select, insert on public.business_backfill_review to authenticated;

create or replace function public.business_role(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
    from public.business_members m
   where m.business_id = p_business_id
     and m.user_id = auth.uid()
     and m.status = 'active'
   limit 1
$$;

create or replace function public.is_business_member(p_business_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.business_members m
     where m.business_id = p_business_id
       and m.user_id = auth.uid()
       and m.status = 'active'
       and (p_roles is null or m.role = any(p_roles))
  )
$$;

create or replace function public.can_access_business(p_business_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
      from public.business_members m
      join public.businesses b on b.id = m.business_id
     where m.business_id = p_business_id
       and m.user_id = auth.uid()
       and m.status = 'active'
       and b.is_enabled = true
       and b.approval_status = 'approved'
       and (p_roles is null or m.role = any(p_roles))
  )
$$;

create or replace function public.business_module_enabled(p_business_id uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.business_module_access a
      join public.businesses b on b.id = a.business_id
     where a.business_id = p_business_id
       and a.module_type = p_module
       and a.enabled = true
       and a.approval_status = 'approved'
       and b.is_enabled = true
       and b.approval_status = 'approved'
  )
$$;

-- Protected audit trigger. Audit rows cannot be updated or deleted by clients.
create or replace function public.record_business_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_actor uuid := auth.uid();
begin
  v_business_id := coalesce(
    case when tg_table_name = 'businesses' then (to_jsonb(new)->>'id')::uuid else (to_jsonb(new)->>'business_id')::uuid end,
    case when tg_table_name = 'businesses' then (to_jsonb(old)->>'id')::uuid else (to_jsonb(old)->>'business_id')::uuid end
  );
  insert into public.business_audit_events (business_id, actor_user_id, event_type, before_state, after_state)
  values (
    v_business_id,
    v_actor,
    lower(tg_table_name) || '.' || lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_business_audit on public.businesses;
create trigger trg_business_audit after insert or update on public.businesses for each row execute function public.record_business_audit();
drop trigger if exists trg_business_member_audit on public.business_members;
create trigger trg_business_member_audit after insert or update on public.business_members for each row execute function public.record_business_audit();
drop trigger if exists trg_business_access_audit on public.business_module_access;
create trigger trg_business_access_audit after insert or update on public.business_module_access for each row execute function public.record_business_audit();

-- Owner membership is created atomically with the business.
create or replace function public.ensure_business_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_members (business_id, user_id, role, status, accepted_at)
  values (new.id, new.owner_user_id, 'owner', 'active', now())
  on conflict (business_id, user_id) do update set role = 'owner', status = 'active';
  insert into public.business_module_access (business_id, module_type, enabled, approval_status, approved_at)
  values (new.id, new.module_type, new.approval_status = 'approved', new.approval_status, case when new.approval_status = 'approved' then now() else null end)
  on conflict (business_id, module_type) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_business_owner_membership on public.businesses;
create trigger trg_business_owner_membership after insert on public.businesses for each row execute function public.ensure_business_owner_membership();

-- Owners may update business profile details, but only Super Admin can change
-- approval/enabled/owner fields. This closes a direct-PostgREST escalation path.
create or replace function public.guard_business_privileged_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.owner_user_id is distinct from old.owner_user_id
       or new.approval_status is distinct from old.approval_status
       or new.is_enabled is distinct from old.is_enabled
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.suspended_at is distinct from old.suspended_at
       or new.revoked_at is distinct from old.revoked_at then
      raise exception 'BUSINESS_PRIVILEGED_FIELDS_ADMIN_ONLY';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_business_privileged_changes on public.businesses;
create trigger trg_guard_business_privileged_changes before update on public.businesses
for each row execute function public.guard_business_privileged_changes();

-- RLS: business members see their business; admins see all. No cross-business reads.
drop policy if exists "Business members read their businesses" on public.businesses;
create policy "Business members read their businesses" on public.businesses for select to authenticated
using (public.is_business_member(id) or public.is_admin());

drop policy if exists "Business owners create their own business" on public.businesses;
create policy "Business owners create their own business" on public.businesses for insert to authenticated
with check (owner_user_id = (select auth.uid()) and public.is_active_user());

drop policy if exists "Business owners update safe fields" on public.businesses;
create policy "Business owners update safe fields" on public.businesses for update to authenticated
using (public.is_business_member(id, array['owner']) or public.is_admin())
with check (public.is_business_member(id, array['owner']) or public.is_admin());

drop policy if exists "Business members read members" on public.business_members;
create policy "Business members read members" on public.business_members for select to authenticated
using (public.is_business_member(business_id) or public.is_admin());

drop policy if exists "Owners and admins add non-owner members" on public.business_members;
create policy "Owners and admins add non-owner members" on public.business_members for insert to authenticated
with check (
  public.is_admin()
  or (public.is_business_member(business_id, array['owner']) and role <> 'owner')
);

drop policy if exists "Owners and admins update non-owner members" on public.business_members;
create policy "Owners and admins update non-owner members" on public.business_members for update to authenticated
using (public.is_admin() or (public.is_business_member(business_id, array['owner']) and role <> 'owner'))
with check (public.is_admin() or (public.is_business_member(business_id, array['owner']) and role <> 'owner'));

drop policy if exists "Business members read invitations" on public.business_invitations;
create policy "Business members read invitations" on public.business_invitations for select to authenticated
using (public.is_business_member(business_id, array['owner','manager']) or public.is_admin());

drop policy if exists "Owners create invitations" on public.business_invitations;
create policy "Owners create invitations" on public.business_invitations for insert to authenticated
with check (public.is_business_member(business_id, array['owner']) or public.is_admin());

drop policy if exists "Owners revoke invitations" on public.business_invitations;
create policy "Owners revoke invitations" on public.business_invitations for update to authenticated
using (public.is_business_member(business_id, array['owner']) or public.is_admin())
with check (public.is_business_member(business_id, array['owner']) or public.is_admin());

drop policy if exists "Business members read module access" on public.business_module_access;
create policy "Business members read module access" on public.business_module_access for select to authenticated
using (public.is_business_member(business_id) or public.is_admin());

drop policy if exists "Only super admins write module access" on public.business_module_access;
create policy "Only super admins write module access" on public.business_module_access for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Business members read audit" on public.business_audit_events;
create policy "Business members read audit" on public.business_audit_events for select to authenticated
using (public.is_business_member(business_id) or public.is_admin());

-- Phase 1 adds nullable business references; Phase 2 backfills them.
alter table public.listings add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.bookings add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.service_bookings add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.stay_properties add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.venue_bookings add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.payment_intents add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.pg_invoices add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.pg_payment_claims add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.service_payment_intents add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.service_payment_claims add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.venue_payment_intents add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.provider_contact_settings add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.provider_registration_requests add column if not exists business_id uuid references public.businesses(id) on delete set null;

alter table public.provider_registration_requests drop constraint if exists provider_registration_requests_provider_type_check;
alter table public.provider_registration_requests add constraint provider_registration_requests_provider_type_check
  check (provider_type = any (array['pg_hostels','classes','venues','services','hotel_stay','movies']));

create or replace function public.business_module_for_listing(p_category_id text, p_entity_type text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_category_id,'')) like 'pg-%' or lower(coalesce(p_category_id,'')) = 'pg_hostels' or lower(coalesce(p_entity_type,'')) = 'pg' then 'pg_hostels'
    when lower(coalesce(p_category_id,'')) like 'class-%' or lower(coalesce(p_category_id,'')) in ('classes') or lower(coalesce(p_entity_type,'')) in ('class','course') then 'classes'
    when lower(coalesce(p_category_id,'')) like 'venue-%' or lower(coalesce(p_category_id,'')) in ('venues') or lower(coalesce(p_entity_type,'')) = 'venue' then 'venues'
    when lower(coalesce(p_category_id,'')) like 'movie-%' or lower(coalesce(p_category_id,'')) in ('movies') or lower(coalesce(p_entity_type,'')) = 'movie' then 'movies'
    when lower(coalesce(p_category_id,'')) like 'hotel-%' or lower(coalesce(p_category_id,'')) in ('hotel_stay','stay-hotel') or lower(coalesce(p_entity_type,'')) = 'stay' then 'hotel_stay'
    when lower(coalesce(p_category_id,'')) in ('services','cat-1') or lower(coalesce(p_entity_type,'')) = 'service' then 'services'
    else null
  end
$$;

create index if not exists idx_listings_business on public.listings (business_id);
create index if not exists idx_bookings_business on public.bookings (business_id);
create index if not exists idx_service_bookings_business on public.service_bookings (business_id);
create index if not exists idx_stay_properties_business on public.stay_properties (business_id);
create index if not exists idx_venue_bookings_business on public.venue_bookings (business_id);

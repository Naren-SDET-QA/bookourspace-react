-- Per-member access scopes.
--
-- A business member can be limited to specific modules (PG inventory, stays,
-- services, ...) and, inside a section-aware module, to specific provider
-- workspace sections. This is what lets one staff account hold "PG only" and
-- another "Stays, reservations and payments only" without separate accounts.
--
-- Semantics:
--   * no row for a member        -> full access to the business (unchanged)
--   * a row                      -> only allowed_modules are usable
--   * allowed_sections[module]   -> missing key or empty array means every
--                                   section of that module stays available
--   * the owner is never restrictable (enforced by trigger below)

create table if not exists public.business_member_access (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  allowed_modules text[] not null default '{}'::text[],
  allowed_sections jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id),
  constraint business_member_access_modules_known check (
    allowed_modules <@ array['pg_hostels','classes','venues','services','hotel_stay','movies']::text[]
  ),
  constraint business_member_access_sections_object check (jsonb_typeof(allowed_sections) = 'object')
);

create index if not exists idx_business_member_access_user on public.business_member_access (user_id);

-- Owners can never be locked out of their own business.
create or replace function public.guard_business_member_access()
returns trigger
language plpgsql
set search_path = public
as $body$
begin
  if exists (
    select 1 from public.business_members m
     where m.business_id = new.business_id and m.user_id = new.user_id and m.role = 'owner'
  ) then
    raise exception 'OWNER_ACCESS_CANNOT_BE_RESTRICTED' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$body$;

drop trigger if exists trg_guard_business_member_access on public.business_member_access;
create trigger trg_guard_business_member_access before insert or update on public.business_member_access
for each row execute function public.guard_business_member_access();

revoke all on function public.guard_business_member_access() from public, anon;

alter table public.business_member_access enable row level security;

grant select on public.business_member_access to authenticated;
grant insert, update, delete on public.business_member_access to authenticated;

drop policy if exists "Members read their own access scope" on public.business_member_access;
create policy "Members read their own access scope" on public.business_member_access for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_business_member(business_id, array['owner','manager'])
  or public.is_admin()
);

drop policy if exists "Owners and managers grant access scopes" on public.business_member_access;
create policy "Owners and managers grant access scopes" on public.business_member_access for insert to authenticated
with check (public.is_business_member(business_id, array['owner','manager']) or public.is_admin());

drop policy if exists "Owners and managers update access scopes" on public.business_member_access;
create policy "Owners and managers update access scopes" on public.business_member_access for update to authenticated
using (public.is_business_member(business_id, array['owner','manager']) or public.is_admin())
with check (public.is_business_member(business_id, array['owner','manager']) or public.is_admin());

drop policy if exists "Owners and managers revoke access scopes" on public.business_member_access;
create policy "Owners and managers revoke access scopes" on public.business_member_access for delete to authenticated
using (public.is_business_member(business_id, array['owner','manager']) or public.is_admin());
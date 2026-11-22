-- Centralized user access control: provenance, defaults, audit and repairs.
--
-- Additive and non-destructive. It changes no existing grant row's effective
-- meaning, revokes no access and deletes nothing. It adds:
--
--   1. `grant_source` on both grant tables, so the console and the health
--      checker can tell a manual grant from a signup default or a repair.
--   2. A one-time backfill that materialises today's *implicit* customer access
--      (no grant rows meant "every enabled module, every action") as explicit
--      full grants. Existing accounts therefore keep exactly the access they
--      have now, and the application can deny an unverified state safely.
--   3. Signup defaults: a new customer receives VIEW on every enabled
--      category, and nothing else. A new non-owner business member receives
--      VIEW on their business's module. Both are SECURITY DEFINER triggers
--      because authenticated sessions cannot write the grant tables directly.
--   4. `access_control_audit` (account status, presets, repairs) and
--      `access_control_repairs` (preview, apply, rollback) with RLS: admins may
--      read, no browser role may write. The server owns every mutation.
--
-- Super Admin is never restricted by these tables and is never granted a
-- default row: the engine short-circuits an active super administrator.
--
-- Rollback: drop the two triggers and their functions, drop the two new tables,
-- drop the `grant_source` columns and their constraints, and delete the rows
-- with grant_source = 'legacy_backfill' if an operator wants the previous
-- implicit state back. Nothing in this migration changes another table's policy
-- or role.

begin;

-- ---------------------------------------------------------------------------
-- 1. Provenance
-- ---------------------------------------------------------------------------
alter table public.customer_module_access
  add column if not exists grant_source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'customer_module_access_grant_source_chk'
       and conrelid = 'public.customer_module_access'::regclass
  ) then
    alter table public.customer_module_access
      add constraint customer_module_access_grant_source_chk
      check (grant_source in ('manual','signup_default','legacy_backfill','repair'));
  end if;
end
$$;

alter table public.business_member_access
  add column if not exists grant_source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'business_member_access_grant_source_chk'
       and conrelid = 'public.business_member_access'::regclass
  ) then
    alter table public.business_member_access
      add constraint business_member_access_grant_source_chk
      check (grant_source in ('manual','signup_default','legacy_backfill','repair'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Preserve existing implicit access explicitly
-- ---------------------------------------------------------------------------
-- Before this migration a customer with zero rows could use every enabled
-- module with every action. Writing that as an explicit full grant keeps the
-- effective access identical while making the state verifiable.
with inserted as (
  insert into public.customer_module_access
    (user_id, module_key, allowed_sections, allowed_actions, granted_by, grant_source)
  select profile.id,
         flags.module_key,
         '[]'::jsonb,
         '["view","create","edit","delete","approve","manage"]'::jsonb,
         null,
         'legacy_backfill'
    from public.profiles profile
    join public.platform_module_flags flags on flags.is_enabled
   where profile.role = 'customer'
     and profile.account_status = 'active'
     and not exists (
       select 1 from public.customer_module_access existing
        where existing.user_id = profile.id
     )
  on conflict (user_id, module_key) do nothing
  returning user_id
)
select count(*) as backfilled_customers from inserted;

-- ---------------------------------------------------------------------------
-- 3. Signup defaults
-- ---------------------------------------------------------------------------
-- Customers: VIEW on every enabled, active category. Never create/edit/delete/
-- approve/manage. `on conflict do nothing` means a re-run cannot widen or
-- overwrite an administrator's explicit choice.
create or replace function private.seed_default_customer_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'customer' then
    return new;
  end if;

  insert into public.customer_module_access
    (user_id, module_key, allowed_sections, allowed_actions, grant_source)
  select new.id,
         flags.module_key,
         '[]'::jsonb,
         '["view"]'::jsonb,
         'signup_default'
    from public.platform_module_flags flags
   where flags.is_enabled
     and flags.module_key in ('pg','hotels','services','movies','classes','function_hall','ecommerce')
  on conflict (user_id, module_key) do nothing;

  return new;
end;
$$;

revoke all on function private.seed_default_customer_access() from public, anon, authenticated;

drop trigger if exists trg_seed_default_customer_access on public.profiles;
create trigger trg_seed_default_customer_access
  after insert on public.profiles
  for each row execute function private.seed_default_customer_access();

-- Providers: a non-owner member starts with VIEW on the business's own module.
-- Owners bypass the member grant entirely and are skipped.
create or replace function private.seed_default_business_member_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  module_key text;
begin
  if new.role = 'owner' or new.status <> 'active' then
    return new;
  end if;

  select module_type into module_key
    from public.businesses
   where id = new.business_id;

  if module_key is null then
    return new;
  end if;

  insert into public.business_member_access
    (business_id, user_id, allowed_modules, allowed_sections, allowed_actions, updated_by, grant_source)
  values (
    new.business_id,
    new.user_id,
    array[module_key],
    '{}'::jsonb,
    jsonb_build_object(module_key, jsonb_build_array('view')),
    null,
    'signup_default'
  )
  on conflict (business_id, user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.seed_default_business_member_access() from public, anon, authenticated;

drop trigger if exists trg_seed_default_business_member_access on public.business_members;
create trigger trg_seed_default_business_member_access
  after insert on public.business_members
  for each row execute function private.seed_default_business_member_access();

-- ---------------------------------------------------------------------------
-- 4. Account-level audit
-- ---------------------------------------------------------------------------
create table if not exists public.access_control_audit (
  id             bigint generated always as identity primary key,
  actor_user_id  uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action         text not null,
  before_state   jsonb,
  after_state    jsonb,
  reason         text,
  repair_id      uuid,
  created_at     timestamptz not null default now()
);

create index if not exists idx_access_control_audit_target
  on public.access_control_audit (target_user_id, created_at desc);

alter table public.access_control_audit enable row level security;
revoke all on table public.access_control_audit from public, anon, authenticated;
grant select on table public.access_control_audit to authenticated;

drop policy if exists "Admins read access control audit" on public.access_control_audit;
create policy "Admins read access control audit"
  on public.access_control_audit for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Repair previews, applications and rollbacks
-- ---------------------------------------------------------------------------
create table if not exists public.access_control_repairs (
  id                    uuid primary key default gen_random_uuid(),
  status                text not null default 'preview'
    check (status in ('preview','applied','rolled_back')),
  report                jsonb not null,
  plan                  jsonb not null,
  requires_approval     boolean not null default false,
  approved_destructive  boolean not null default false,
  created_by            uuid references public.profiles(id) on delete set null,
  applied_by            uuid references public.profiles(id) on delete set null,
  rolled_back_by        uuid references public.profiles(id) on delete set null,
  applied_state         jsonb,
  created_at            timestamptz not null default now(),
  applied_at            timestamptz,
  rolled_back_at        timestamptz
);

create index if not exists idx_access_control_repairs_status
  on public.access_control_repairs (status, created_at desc);

alter table public.access_control_repairs enable row level security;
revoke all on table public.access_control_repairs from public, anon, authenticated;
grant select on table public.access_control_repairs to authenticated;

drop policy if exists "Admins read access control repairs" on public.access_control_repairs;
create policy "Admins read access control repairs"
  on public.access_control_repairs for select to authenticated
  using (public.is_admin());

-- The server writes these tables with the database owner connection. Removing
-- every browser write privilege means no future RLS policy mistake can turn
-- into a client write path for permissions or repairs.
revoke insert, update, delete on table public.access_control_audit from authenticated, anon;
revoke insert, update, delete on table public.access_control_repairs from authenticated, anon;

commit;

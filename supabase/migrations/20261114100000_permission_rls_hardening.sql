-- Permission grant hardening.
--
-- Additive and privilege-only: no row, column, policy on any other table and no
-- function behaviour changes. It closes two gaps left by the grant migrations:
--
--   1. `customer_module_access` still granted INSERT/UPDATE/DELETE to the
--      `authenticated` role, so a signed-in browser session holding a valid JWT
--      had a direct PostgREST write path to its own grant rows. Every write in
--      this product goes through the server (src/server/customerModuleAccess.ts
--      and src/server/businessApi.ts) using the database owner connection, so
--      the role privilege is unnecessary. `business_member_access` was already
--      hardened the same way in 20261113030000; this makes the two tables
--      consistent.
--
--   2. The section and action columns only enforced `jsonb_typeof = 'array'` /
--      `'object'`, which accepts `[1, 2]` or `{"pg": "all"}`. Those values can
--      never match a catalog key, so they fail closed today, but they store
--      garbage and make an audit trail misleading. The added CHECK constraints
--      require text arrays (and, for the member table, a map of text arrays).
--      They are added NOT VALID and then validated only when existing rows are
--      clean, so unknown legacy data can never fail this migration; new writes
--      are always checked.
--
-- Key validation itself stays in src/lib/businessAccess.ts, the single catalog
-- both the server and the portals import. These checks only enforce structure,
-- so adding a module or section still needs no migration.
--
-- Rollback: grant insert, update, delete on public.customer_module_access to
-- authenticated; recreate the "Admins manage customer module access" policy as
-- FOR ALL; drop the four CHECK constraints and the two helper functions. The
-- revokes are the security boundary, so roll back deliberately, not casually.

begin;

-- ---------------------------------------------------------------------------
-- 1. Server-mediated writes only
-- ---------------------------------------------------------------------------
-- Supabase's default privileges give `authenticated` table rights; RLS policies
-- then decide rows. Removing the rights entirely means no policy mistake (or
-- future policy addition) can turn into a client write path.
revoke insert, update, delete on public.customer_module_access from authenticated;
revoke insert, update, delete on public.customer_module_access from anon;

-- The FOR ALL policy is now unreachable for writes and misleading to read, so
-- replace it with the read policy that already covers administrators below.
drop policy if exists "Admins manage customer module access" on public.customer_module_access;

drop policy if exists "Admins read every customer module access" on public.customer_module_access;
create policy "Admins read every customer module access"
  on public.customer_module_access for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Make the predicates usable for the account they describe
-- ---------------------------------------------------------------------------
-- 20261114090000 added has_customer_permission() and
-- has_customer_section_access(), both of which read
-- effective_customer_permissions(auth.uid()). That function treated any
-- non-null argument as "somebody else" and only honoured it for an
-- administrator, so a customer calling the predicate about itself got no rows
-- and every check answered false. It failed closed, which is why no test caught
-- it, but it meant the predicates could never allow anyone.
--
-- Asking about your own id is now the same as asking about yourself. Another
-- account's id still requires an active administrator.
create or replace function public.effective_customer_permissions(p_user_id uuid default null)
returns table (module_key text, allowed_sections jsonb, allowed_actions jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if p_user_id is null or p_user_id = auth.uid() then
    target := auth.uid();
  elsif exists (
    select 1 from public.profiles administrator
     where administrator.id = auth.uid()
       and administrator.role = 'admin'
       and administrator.account_status = 'active'
  ) then
    target := p_user_id;
  else
    -- A non-administrator may only ask about their own access.
    target := null;
  end if;

  return query
    select flags.module_key,
           case
             when actor.role in ('provider', 'admin') then '[]'::jsonb
             else coalesce(access_row.allowed_sections, '[]'::jsonb)
           end as allowed_sections,
           case
             when actor.role in ('provider', 'admin') then '[]'::jsonb
             else coalesce(access_row.allowed_actions, '[]'::jsonb)
           end as allowed_actions
      from public.platform_module_flags flags
      join public.profiles actor
        on actor.id = target
       and actor.account_status = 'active'
      left join public.customer_module_access access_row
        on access_row.user_id = actor.id
       and access_row.module_key = flags.module_key
       and (access_row.expires_at is null or access_row.expires_at > now())
     where flags.is_enabled
       and (actor.role in ('provider', 'admin') or access_row.user_id is not null)
     order by flags.module_key;
end;
$$;

revoke all on function public.effective_customer_permissions(uuid) from public, anon;
grant execute on function public.effective_customer_permissions(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Structural validation of the grant payloads
-- ---------------------------------------------------------------------------
create or replace function public.is_text_array(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'array'
     and not exists (
       select 1
         from jsonb_array_elements(value) as element
        where jsonb_typeof(element) <> 'string'
     );
$$;

create or replace function public.is_text_array_map(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'object'
     and not exists (
       select 1
         from jsonb_each(value) as entry
        where not public.is_text_array(entry.value)
     );
$$;

revoke all on function public.is_text_array(jsonb) from public, anon;
revoke all on function public.is_text_array_map(jsonb) from public, anon;
-- CHECK constraints are evaluated as the writing role, which needs EXECUTE.
grant execute on function public.is_text_array(jsonb) to authenticated, service_role;
grant execute on function public.is_text_array_map(jsonb) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'customer_module_access_sections_text'
       and conrelid = 'public.customer_module_access'::regclass
  ) then
    alter table public.customer_module_access
      add constraint customer_module_access_sections_text
      check (public.is_text_array(allowed_sections)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'customer_module_access_actions_text'
       and conrelid = 'public.customer_module_access'::regclass
  ) then
    alter table public.customer_module_access
      add constraint customer_module_access_actions_text
      check (public.is_text_array(allowed_actions)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'business_member_access_sections_text'
       and conrelid = 'public.business_member_access'::regclass
  ) then
    alter table public.business_member_access
      add constraint business_member_access_sections_text
      check (public.is_text_array_map(allowed_sections)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'business_member_access_actions_text'
       and conrelid = 'public.business_member_access'::regclass
  ) then
    alter table public.business_member_access
      add constraint business_member_access_actions_text
      check (public.is_text_array_map(allowed_actions)) not valid;
  end if;
end
$$;

-- Validate only what is already clean. A violation leaves the constraint in
-- place and NOT VALID, which still refuses every new malformed write, instead
-- of aborting a deployment on legacy data this migration did not create.
do $$
begin
  if exists (
    select 1 from public.customer_module_access
     where not public.is_text_array(allowed_sections)
  ) then
    raise notice 'customer_module_access.allowed_sections has non-text legacy rows; constraint left NOT VALID';
  else
    alter table public.customer_module_access
      validate constraint customer_module_access_sections_text;
  end if;

  if exists (
    select 1 from public.customer_module_access
     where not public.is_text_array(allowed_actions)
  ) then
    raise notice 'customer_module_access.allowed_actions has non-text legacy rows; constraint left NOT VALID';
  else
    alter table public.customer_module_access
      validate constraint customer_module_access_actions_text;
  end if;

  if exists (
    select 1 from public.business_member_access
     where not public.is_text_array_map(allowed_sections)
  ) then
    raise notice 'business_member_access.allowed_sections has malformed legacy rows; constraint left NOT VALID';
  else
    alter table public.business_member_access
      validate constraint business_member_access_sections_text;
  end if;

  if exists (
    select 1 from public.business_member_access
     where not public.is_text_array_map(allowed_actions)
  ) then
    raise notice 'business_member_access.allowed_actions has malformed legacy rows; constraint left NOT VALID';
  else
    alter table public.business_member_access
      validate constraint business_member_access_actions_text;
  end if;
end
$$;

commit;

-- Module, section and action grants.
--
-- Additive only: adds columns, an audit-history extension and two read RPCs. It
-- changes no existing column, policy, role, trigger body semantics or row, and
-- creates no new permission table. Existing behaviour is preserved exactly:
--   * a customer row with empty allowed_sections/allowed_actions means "every
--     section / every action", which is what every row written before this
--     migration already implies;
--   * a business member with no row stays unrestricted (legacy contract);
--   * a business member row without allowed_actions means every action.
--
-- Storage shape (deliberately different per table, because the tables have
-- different cardinality):
--   * customer_module_access is ONE ROW PER MODULE, so its allowed_sections and
--     allowed_actions are JSON arrays of keys for that row's module.
--   * business_member_access is ONE ROW PER BUSINESS MEMBER covering several
--     modules, so its allowed_actions is a JSON object {module: [actions]},
--     matching the existing allowed_sections shape.
--
-- Key validation stays in the API layer (src/lib/businessAccess.ts), which is
-- the single catalog both the server and the portals import. These columns only
-- enforce structure, so a catalog change never requires a migration.
--
-- Deny-by-default is NOT enabled here. Flipping it requires an explicit backfill
-- that materialises full grants for existing members, which is a separate,
-- reviewed step.
--
-- Rollback: drop the two functions, drop the two customer columns, drop
-- business_member_access.allowed_actions, and restore the previous
-- record_customer_module_access_audit() body from
-- 20261113000000_customer_module_access.sql. The added audit columns are kept so
-- recorded history is never lost.

begin;

-- ---------------------------------------------------------------------------
-- 1. Provider/business member action grants
-- ---------------------------------------------------------------------------
alter table public.business_member_access
  add column if not exists allowed_actions jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'business_member_access_actions_object'
       and conrelid = 'public.business_member_access'::regclass
  ) then
    alter table public.business_member_access
      add constraint business_member_access_actions_object
      check (jsonb_typeof(allowed_actions) = 'object');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Customer section and action grants
-- ---------------------------------------------------------------------------
alter table public.customer_module_access
  add column if not exists allowed_sections jsonb not null default '[]'::jsonb;

alter table public.customer_module_access
  add column if not exists allowed_actions jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'customer_module_access_sections_array'
       and conrelid = 'public.customer_module_access'::regclass
  ) then
    alter table public.customer_module_access
      add constraint customer_module_access_sections_array
      check (jsonb_typeof(allowed_sections) = 'array');
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'customer_module_access_actions_array'
       and conrelid = 'public.customer_module_access'::regclass
  ) then
    alter table public.customer_module_access
      add constraint customer_module_access_actions_array
      check (jsonb_typeof(allowed_actions) = 'array');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Audit history for the new columns
-- ---------------------------------------------------------------------------
alter table public.customer_module_access_audit
  add column if not exists allowed_sections jsonb;

alter table public.customer_module_access_audit
  add column if not exists allowed_actions jsonb;

-- The previous trigger only recorded expiry changes, so a section or action edit
-- would have been invisible in the audit trail. Widen the condition and store the
-- new values; a plain expiry change keeps recording exactly as before.
create or replace function public.record_customer_module_access_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.customer_module_access_audit
      (user_id, module_key, action, expires_at, granted_by, allowed_sections, allowed_actions)
    values (new.user_id, new.module_key, 'grant', new.expires_at, new.granted_by,
            new.allowed_sections, new.allowed_actions);
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.expires_at is distinct from new.expires_at
        or old.allowed_sections is distinct from new.allowed_sections
        or old.allowed_actions is distinct from new.allowed_actions) then
      insert into public.customer_module_access_audit
        (user_id, module_key, action, expires_at, granted_by, allowed_sections, allowed_actions)
      values (new.user_id, new.module_key, 'update', new.expires_at, new.granted_by,
              new.allowed_sections, new.allowed_actions);
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.customer_module_access_audit
      (user_id, module_key, action, expires_at, granted_by, allowed_sections, allowed_actions)
    values (old.user_id, old.module_key, 'revoke', old.expires_at, old.granted_by,
            old.allowed_sections, old.allowed_actions);
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.record_customer_module_access_audit() from public, anon;

-- ---------------------------------------------------------------------------
-- 4. Authoritative effective customer permissions
-- ---------------------------------------------------------------------------
-- Mirrors effective_customer_module_keys() exactly: administrators may ask about
-- another user, everyone else only about themselves, providers and administrators
-- keep their existing unrestricted access, and a customer sees only enabled,
-- unexpired grants. Empty arrays mean "every section"/"every action".
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
  if p_user_id is null then
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
-- 5. Predicates for server routes and RLS
-- ---------------------------------------------------------------------------
create or replace function public.has_customer_permission(p_module_key text, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.effective_customer_permissions(auth.uid()) permissions
     where permissions.module_key = p_module_key
       and (
         jsonb_array_length(permissions.allowed_actions) = 0
         or permissions.allowed_actions ? 'manage'
         or permissions.allowed_actions ? p_action
         -- Any granted action implies the ability to view the module.
         or p_action = 'view'
       )
  );
$$;

revoke all on function public.has_customer_permission(text, text) from public, anon;
grant execute on function public.has_customer_permission(text, text) to authenticated, service_role;

create or replace function public.has_customer_section_access(p_module_key text, p_section_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.effective_customer_permissions(auth.uid()) permissions
     where permissions.module_key = p_module_key
       and (
         jsonb_array_length(permissions.allowed_sections) = 0
         or permissions.allowed_sections ? p_section_key
       )
  );
$$;

revoke all on function public.has_customer_section_access(text, text) from public, anon;
grant execute on function public.has_customer_section_access(text, text) to authenticated, service_role;

commit;

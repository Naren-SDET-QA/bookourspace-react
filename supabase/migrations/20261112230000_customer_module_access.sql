-- ============================================================================
-- Customer-specific module access.
--
-- Additive only: creates two new tables, one trigger, one helper predicate and
-- one read RPC. It changes no existing table, policy, role or module flag and
-- deletes no records. Safe to run against a fresh or existing project.
--
-- Roles are unchanged (`customer`, `provider`, `admin`). This table layers a
-- per-customer *module* allow-list on top of the global `platform_module_flags`
-- gate. Providers and administrators are not constrained by it: their access
-- continues to follow their existing role/ownership authorization.
--
-- Enforcement boundary
--  * The allow-list rows themselves are protected by RLS: customers can read
--    only their own rows, administrators can read all, and writes require an
--    active administrator. There is no insert policy for an anonymous or
--    customer session, so a customer can never grant themselves a module.
--  * `public.effective_customer_module_keys()` is the authoritative answer the
--    server and browser both use. It consults `auth.uid()` (or an explicit id
--    when called by an administrator), the account role/status, the expiry
--    timestamp and the global module flag in one statement.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Grant rows
-- ---------------------------------------------------------------------------
create table if not exists public.customer_module_access (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  module_key  text not null,
  expires_at  timestamptz,
  granted_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint customer_module_access_key_chk
    check (module_key in ('services','hotels','pg','function_hall','classes','movies','ecommerce')),
  constraint customer_module_access_user_module_unique
    unique (user_id, module_key)
);

create index if not exists idx_customer_module_access_user
  on public.customer_module_access (user_id);
create index if not exists idx_customer_module_access_module
  on public.customer_module_access (module_key);

alter table public.customer_module_access enable row level security;
revoke all on table public.customer_module_access from public, anon;

drop policy if exists "Customers read their own module access" on public.customer_module_access;
create policy "Customers read their own module access"
  on public.customer_module_access for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Admins manage customer module access" on public.customer_module_access;
create policy "Admins manage customer module access"
  on public.customer_module_access for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Audit history
-- ---------------------------------------------------------------------------
create table if not exists public.customer_module_access_audit (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  module_key  text not null,
  action      text not null check (action in ('grant','revoke','update')),
  expires_at  timestamptz,
  granted_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_customer_module_access_audit_user
  on public.customer_module_access_audit (user_id, created_at desc);

alter table public.customer_module_access_audit enable row level security;
revoke all on table public.customer_module_access_audit from public, anon;

drop policy if exists "Admins read module access audit" on public.customer_module_access_audit;
create policy "Admins read module access audit"
  on public.customer_module_access_audit for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Audit trigger (records grant / revoke / expiry change)
-- ---------------------------------------------------------------------------
create or replace function public.record_customer_module_access_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.customer_module_access_audit
      (user_id, module_key, action, expires_at, granted_by)
    values (new.user_id, new.module_key, 'grant', new.expires_at, new.granted_by);
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.expires_at is distinct from new.expires_at) then
      insert into public.customer_module_access_audit
        (user_id, module_key, action, expires_at, granted_by)
      values (new.user_id, new.module_key, 'update', new.expires_at, new.granted_by);
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.customer_module_access_audit
      (user_id, module_key, action, expires_at, granted_by)
    values (old.user_id, old.module_key, 'revoke', old.expires_at, old.granted_by);
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.record_customer_module_access_audit() from public, anon;

drop trigger if exists trg_customer_module_access_audit on public.customer_module_access;
create trigger trg_customer_module_access_audit
  after insert or update or delete on public.customer_module_access
  for each row execute function public.record_customer_module_access_audit();

-- ---------------------------------------------------------------------------
-- 4. Authoritative effective module keys
-- ---------------------------------------------------------------------------
create or replace function public.effective_customer_module_keys(p_user_id uuid default null)
returns setof text
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
    select flags.module_key
      from public.platform_module_flags flags
     where flags.is_enabled
       and (
         exists (
           select 1 from public.profiles actor
            where actor.id = target
              and actor.account_status = 'active'
              and actor.role in ('provider', 'admin')
         )
         or exists (
           select 1
             from public.profiles actor
             join public.customer_module_access access_row
               on access_row.user_id = actor.id
              and access_row.module_key = flags.module_key
              and (access_row.expires_at is null or access_row.expires_at > now())
            where actor.id = target
              and actor.account_status = 'active'
              and actor.role = 'customer'
         )
       )
     order by flags.module_key;
end;
$$;

revoke all on function public.effective_customer_module_keys(uuid) from public, anon;
grant execute on function public.effective_customer_module_keys(uuid) to authenticated;

-- Boolean predicate for future RLS use on module-scoped objects.
create or replace function public.has_customer_module_access(p_module_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.effective_customer_module_keys(auth.uid()) keys
     where keys = p_module_key
  );
$$;

revoke all on function public.has_customer_module_access(text) from public, anon;
grant execute on function public.has_customer_module_access(text) to authenticated;

commit;

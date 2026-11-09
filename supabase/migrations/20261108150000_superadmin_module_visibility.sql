-- Module visibility is a platform-wide customer-facing control. Keep public
-- reads, but route all writes through the authenticated server API, which
-- rechecks the active Super Admin profile and appends an audit event.
begin;

alter table public.platform_module_flags enable row level security;

drop policy if exists "Only admins may write module flags" on public.platform_module_flags;
drop policy if exists "Only active admins may write module flags" on public.platform_module_flags;

-- Remove direct client writes regardless of legacy grants or PUBLIC ACLs.
-- The table remains publicly readable through its existing SELECT policy;
-- mutations go through the server route, which verifies the current
-- Super Admin profile and writes an audit event in the same transaction.
revoke all privileges on table public.platform_module_flags from public, anon, authenticated;
grant select on table public.platform_module_flags to anon, authenticated;

commit;

-- Allow active Services/Stay screens to refresh when an authorized admin
-- changes module visibility or owner-contact availability. This table is small
-- and changes rarely; subscriptions are mounted only while those screens are open.
-- Repeat the authorization policy here so deactivated admin profiles lose
-- database write access too; client-side checks are only for feedback.
grant select on public.platform_module_flags to anon, authenticated;
grant insert, update, delete on public.platform_module_flags to authenticated;

drop policy if exists "Only admins may write module flags" on public.platform_module_flags;
drop policy if exists "Only active admins may write module flags" on public.platform_module_flags;
create policy "Only active admins may write module flags"
  on public.platform_module_flags for all
  to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.account_status = 'active'
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.account_status = 'active'
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'platform_module_flags'
     ) then
    alter publication supabase_realtime add table public.platform_module_flags;
  end if;
end;
$$;

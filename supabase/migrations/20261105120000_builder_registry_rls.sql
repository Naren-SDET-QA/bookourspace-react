-- The builder registries are public read-only metadata, but 20261105060000
-- added SELECT policies without enabling RLS. Policies are inert while RLS is
-- off, so PostgREST served those tables to anon/authenticated with only table
-- grants as the boundary. Enable RLS and keep the reviewed public-read policy;
-- writes stay revoked.
--
-- Forward-only and idempotent. Local candidate pending separate Mumbai
-- approval.
begin;

alter table public.platform_component_registry enable row level security;
alter table public.platform_field_types enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'platform_component_registry'
       and policyname = 'Public reads builder component registry'
  ) then
    create policy "Public reads builder component registry"
      on public.platform_component_registry
      for select to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'platform_field_types'
       and policyname = 'Public reads builder field types'
  ) then
    create policy "Public reads builder field types"
      on public.platform_field_types
      for select to anon, authenticated
      using (true);
  end if;
end $$;

revoke insert, update, delete on public.platform_component_registry from anon, authenticated;
revoke insert, update, delete on public.platform_field_types from anon, authenticated;

commit;

-- Restore client read access to the static Live Builder registries.
--
-- The tables already grant SELECT to anon/authenticated and retain RLS, but
-- without SELECT policies PostgREST returns no rows. These registries contain
-- reviewed component and field-type metadata only. Keep writes revoked.
-- Local corrective migration only; do not apply to the hosted database until
-- separately approved.
begin;

drop policy if exists "Public reads builder component registry"
  on public.platform_component_registry;
create policy "Public reads builder component registry"
  on public.platform_component_registry
  for select to anon, authenticated
  using (true);

drop policy if exists "Public reads builder field types"
  on public.platform_field_types;
create policy "Public reads builder field types"
  on public.platform_field_types
  for select to anon, authenticated
  using (true);

commit;

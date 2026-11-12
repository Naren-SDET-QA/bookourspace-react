drop policy if exists "Super admins create businesses" on public.businesses;
create policy "Super admins create businesses" on public.businesses for insert to authenticated
with check (public.is_admin());

-- Keep self-service profile repair limited to mutable customer-owned fields.
-- Identity, email, and authorization role come from Supabase Auth and the
-- trusted Google profile provisioning function, not client-supplied INSERTs.
begin;

revoke insert (email, role) on table public.profiles from public, anon, authenticated;
grant insert (id, full_name, phone) on table public.profiles to authenticated;

drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can create own customer profile" on public.profiles;
create policy "Users can create own customer profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id and role = 'customer');

commit;

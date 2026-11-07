-- Keep anonymous class discovery independent from the admin authorization
-- helper. public.is_admin() is intentionally not executable by anon.
-- Authenticated owners and active administrators retain access to their rows.

begin;

drop policy if exists "Active batches of approved courses are public"
  on public.class_batches;
drop policy if exists "Owners and admins can read class batches"
  on public.class_batches;

create policy "Active batches of approved courses are public"
  on public.class_batches
  for select
  to anon, authenticated
  using (
    status = 'active'
    and exists (
      select 1
        from public.listings listing
       where listing.id = class_batches.listing_id
         and listing.status = 'active'
    )
  );

create policy "Owners and admins can read class batches"
  on public.class_batches
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.listings listing
       where listing.id = class_batches.listing_id
         and listing.owner_id = (select auth.uid())
    )
    or public.is_admin()
  );

commit;

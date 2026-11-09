-- Split the ready-public media SELECT rule from the authenticated-owner rule.
-- The prior combined policy referenced is_active_user() for anon as well as
-- authenticated callers. That routine is intentionally not executable by anon,
-- so Storage could raise permission denied while evaluating the public read.
-- This forward-only correction preserves the exact row predicates and adds no
-- grants or write policies.
begin;

drop policy if exists "Ready listing media and owned originals are readable" on storage.objects;
drop policy if exists "Ready public listing media is readable" on storage.objects;
drop policy if exists "Active owners read their public media originals" on storage.objects;

create policy "Ready public listing media is readable"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'bos-public-media'
    and exists (
      select 1
        from public.media_assets asset
       where asset.bucket_id = storage.objects.bucket_id
         and asset.privacy = 'public'
         and asset.processing_status = 'ready'
         and (
           asset.object_path = storage.objects.name
           or exists (
             select 1
               from jsonb_array_elements(asset.variants) variant
              where variant->>'object_path' = storage.objects.name
           )
         )
    )
  );

create policy "Active owners read their public media originals"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'bos-public-media'
    and (select auth.uid()) is not null
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (select public.is_active_user())
  );

commit;

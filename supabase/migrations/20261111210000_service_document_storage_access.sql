-- Booking documents are uploaded by customers (prescriptions, ID proofs,
-- grocery order documents). The existing private-document policies only
-- admitted provider/admin uploaders, so a customer upload would be denied
-- before the metadata row could be registered.
--
-- This forward-only policy keeps the private bucket private:
--   * upload is limited to an active user's own path prefix;
--   * reads remain owner/Super-Admin only;
--   * no public, provider-wide or cross-customer read is granted.
begin;

do $storage$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'drop policy if exists "Booking parties upload private documents" on storage.objects';
  execute $policy$
    create policy "Booking parties upload private documents"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'bos-private-documents'
        and split_part(name, '/', 1) = (select auth.uid())::text
        and (select public.is_active_user())
      )
  $policy$;
end
$storage$;

do $media$
begin
  if to_regclass('public.media_assets') is null then
    return;
  end if;

  execute 'drop policy if exists "Active booking parties register private documents" on public.media_assets';
  execute $policy$
    create policy "Active booking parties register private documents"
      on public.media_assets for insert to authenticated
      with check (
        owner_id = (select auth.uid())
        and (select public.is_active_user())
        and processing_status = 'quarantined'
        and display_order >= 0
        and bucket_id = 'bos-private-documents'
        and privacy = 'private'
        and media_kind in ('document', 'text', 'image')
        and split_part(object_path, '/', 1) = (select auth.uid())::text
      )
  $policy$;
end
$media$;

commit;

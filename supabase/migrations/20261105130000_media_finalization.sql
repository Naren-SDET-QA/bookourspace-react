-- Complete the private-media lifecycle.
--
-- Uploads are written to private Storage buckets by an authenticated provider
-- and registered as `quarantined`. The browser cannot update that status
-- directly. This function performs the trusted transition: it verifies the
-- stored object and every declared derivative against the owning Auth user,
-- the registered size/type, and the Storage metadata before publishing.
--
-- This is metadata validation, not a malware scanner. Objects remain in private
-- buckets and are served only through short-lived signed URLs.
begin;

create or replace function public.finalize_media_asset(p_asset_id uuid)
returns public.media_assets
language plpgsql
security definer
set search_path = pg_catalog, public, storage, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_asset public.media_assets%rowtype;
  v_object storage.objects%rowtype;
  v_variant jsonb;
  v_variant_path text;
  v_variant_object storage.objects%rowtype;
  v_mime text;
begin
  if p_asset_id is null or v_actor is null then
    raise exception 'MEDIA_FINALIZATION_REQUIRES_AUTHENTICATED_OWNER'
      using errcode = '42501';
  end if;

  if not public.is_active_user() then
    raise exception 'MEDIA_FINALIZATION_REQUIRES_ACTIVE_ACCOUNT'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.profiles p
     where p.id = v_actor
       and p.role in ('provider', 'admin')
  ) then
    raise exception 'MEDIA_FINALIZATION_REQUIRES_PROVIDER_OR_ADMIN'
      using errcode = '42501';
  end if;

  select *
    into v_asset
    from public.media_assets
   where id = p_asset_id
     and owner_id = v_actor
   for update;

  if not found then
    raise exception 'MEDIA_ASSET_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_asset.processing_status = 'ready' then
    return v_asset;
  end if;

  if v_asset.processing_status <> 'quarantined' then
    raise exception 'MEDIA_ASSET_STATUS_NOT_FINALIZABLE'
      using errcode = '23514';
  end if;

  if split_part(v_asset.object_path, '/', 1) <> v_actor::text then
    raise exception 'MEDIA_ASSET_OBJECT_PREFIX_DOES_NOT_MATCH_OWNER'
      using errcode = '42501';
  end if;

  select *
    into v_object
    from storage.objects
   where bucket_id = v_asset.bucket_id
     and name = v_asset.object_path;

  if not found then
    raise exception 'MEDIA_OBJECT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if split_part(v_object.name, '/', 1) <> v_actor::text then
    raise exception 'MEDIA_OBJECT_PREFIX_DOES_NOT_MATCH_OWNER'
      using errcode = '42501';
  end if;

  v_mime := lower(coalesce(v_object.metadata->>'mimetype', ''));
  if v_asset.media_kind = 'image' and v_mime not like 'image/%' then
    raise exception 'MEDIA_OBJECT_TYPE_MISMATCH'
      using errcode = '23514';
  elsif v_asset.media_kind = 'video' and v_mime not like 'video/%' then
    raise exception 'MEDIA_OBJECT_TYPE_MISMATCH'
      using errcode = '23514';
  elsif v_asset.media_kind = 'audio' and v_mime not like 'audio/%' then
    raise exception 'MEDIA_OBJECT_TYPE_MISMATCH'
      using errcode = '23514';
  elsif v_asset.media_kind = 'document' and v_mime not in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) then
    raise exception 'MEDIA_OBJECT_TYPE_MISMATCH'
      using errcode = '23514';
  elsif v_asset.media_kind = 'text' and v_mime <> 'text/plain' then
    raise exception 'MEDIA_OBJECT_TYPE_MISMATCH'
      using errcode = '23514';
  end if;

  if coalesce(v_object.metadata->>'size', '') !~ '^[0-9]+$' then
    raise exception 'MEDIA_OBJECT_SIZE_MISMATCH'
      using errcode = '23514';
  end if;
  if (v_object.metadata->>'size')::bigint <> v_asset.file_size_bytes then
    raise exception 'MEDIA_OBJECT_SIZE_MISMATCH'
      using errcode = '23514';
  end if;

  if jsonb_typeof(v_asset.variants) <> 'array' then
    raise exception 'MEDIA_VARIANTS_METADATA_INVALID'
      using errcode = '23514';
  end if;

  for v_variant in
    select value from jsonb_array_elements(v_asset.variants)
  loop
    v_variant_path := v_variant->>'object_path';
    if v_variant_path is null
       or length(v_variant_path) < 1
       or length(v_variant_path) > 512
       or split_part(v_variant_path, '/', 1) <> v_actor::text then
      raise exception 'MEDIA_VARIANT_PATH_INVALID'
        using errcode = '23514';
    end if;

    select *
      into v_variant_object
      from storage.objects
     where bucket_id = v_asset.bucket_id
       and name = v_variant_path;

    if not found then
      raise exception 'MEDIA_VARIANT_OBJECT_NOT_FOUND'
        using errcode = 'P0002';
    end if;

    if lower(coalesce(v_variant_object.metadata->>'mimetype', ''))
       not in ('image/webp', 'image/avif') then
      raise exception 'MEDIA_VARIANT_TYPE_INVALID'
        using errcode = '23514';
    end if;
  end loop;

  update public.media_assets
     set processing_status = 'ready',
         updated_at = now()
   where id = v_asset.id
     and owner_id = v_actor
     and processing_status = 'quarantined'
  returning * into v_asset;

  if not found then
    raise exception 'MEDIA_FINALIZATION_CONFLICT'
      using errcode = '40001';
  end if;

  return v_asset;
end;
$$;

revoke all on function public.finalize_media_asset(uuid) from public, anon;
grant execute on function public.finalize_media_asset(uuid) to authenticated, service_role;

-- The public media bucket remains private. Anonymous image requests may sign
-- the original object and every derivative that belongs to a ready public
-- asset; no unrelated object in the bucket becomes readable.
do $storage$
begin
  if to_regclass('storage.objects') is null
     or to_regclass('public.media_assets') is null then
    return;
  end if;

  execute 'drop policy if exists "Ready listing media and owned originals are readable" on storage.objects';
  execute $policy$
    create policy "Ready listing media and owned originals are readable"
      on storage.objects for select to anon, authenticated
      using (
        bucket_id = 'bos-public-media'
        and (
          exists (
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
          or (
            (select auth.uid()) is not null
            and split_part(name, '/', 1) = (select auth.uid())::text
            and (select public.is_active_user())
          )
        )
      )
  $policy$;
end;
$storage$;

commit;

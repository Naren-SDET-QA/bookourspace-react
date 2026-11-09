-- Server-owned media validation boundary.
--
-- The HTTP server verifies the Google JWT, active provider profile, Storage
-- bytes, signatures, full image decoding, dimensions, checksums and derivatives.
-- This migration removes the client-callable metadata-only finalizer and
-- exposes a service-role-only transition for that trusted server process.
-- PREPARED LOCALLY ONLY: do not apply without the user's separate approval.
begin;

revoke all on function public.finalize_media_asset(uuid) from public, anon, authenticated;
grant execute on function public.finalize_media_asset(uuid) to service_role;

create or replace function public.finalize_media_asset_server(
  p_asset_id uuid,
  p_owner_id uuid,
  p_sha256 text,
  p_width integer,
  p_height integer
)
returns public.media_assets
language plpgsql
security definer
set search_path = pg_catalog, public, storage, auth
as $$
declare
  v_asset public.media_assets%rowtype;
  v_object storage.objects%rowtype;
begin
  if auth.role() <> 'service_role'
     or p_asset_id is null
     or p_owner_id is null
     or p_sha256 is null
     or p_width is null
     or p_height is null
     or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_width not between 1 and 12000
     or p_height not between 1 and 12000
     or p_width::bigint * p_height::bigint > 40000000 then
    raise exception 'MEDIA_SERVER_VALIDATION_REQUIRED' using errcode = '42501';
  end if;

  select * into v_asset
    from public.media_assets
   where id = p_asset_id and owner_id = p_owner_id
   for update;
  if not found then
    raise exception 'MEDIA_ASSET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_asset.processing_status = 'ready' then return v_asset; end if;
  if v_asset.processing_status <> 'quarantined'
     or v_asset.media_kind <> 'image'
     or v_asset.bucket_id <> 'bos-public-media'
     or v_asset.checksum_sha256 <> p_sha256 then
    raise exception 'MEDIA_ASSET_SERVER_CHECK_MISMATCH' using errcode = '23514';
  end if;
  if split_part(v_asset.object_path, '/', 1) <> p_owner_id::text then
    raise exception 'MEDIA_ASSET_OBJECT_PREFIX_DOES_NOT_MATCH_OWNER' using errcode = '42501';
  end if;
  select * into v_object from storage.objects
   where bucket_id = v_asset.bucket_id and name = v_asset.object_path;
  if not found
     or coalesce(v_object.metadata->>'size', '') !~ '^[0-9]+$'
     or (v_object.metadata->>'size')::bigint <> v_asset.file_size_bytes then
    raise exception 'MEDIA_OBJECT_SIZE_MISMATCH' using errcode = '23514';
  end if;

  update public.media_assets
     set processing_status = 'ready', width = p_width, height = p_height, updated_at = now()
   where id = v_asset.id and owner_id = p_owner_id and processing_status = 'quarantined'
  returning * into v_asset;
  if not found then raise exception 'MEDIA_FINALIZATION_CONFLICT' using errcode = '40001'; end if;
  return v_asset;
end;
$$;

revoke all on function public.finalize_media_asset_server(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.finalize_media_asset_server(uuid, uuid, text, integer, integer)
  to service_role;

commit;

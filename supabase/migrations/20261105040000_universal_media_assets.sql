-- Universal media metadata and Storage access rules.
-- Prepared locally only. Do not apply until the hosted project, backup,
-- bucket configuration and recovery point have been separately approved.
begin;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  module_key text not null check (char_length(module_key) between 2 and 64),
  parent_type text not null check (char_length(parent_type) between 2 and 64),
  parent_id text check (parent_id is null or char_length(parent_id) <= 128),
  bucket_id text not null check (bucket_id in ('bos-public-media', 'bos-private-documents')),
  object_path text not null check (char_length(object_path) between 1 and 512),
  media_kind text not null check (media_kind in ('image', 'video', 'audio', 'document', 'text')),
  media_format text not null check (media_format in (
    'jpeg', 'png', 'webp', 'avif', 'heic', 'gif', 'svg', 'mp4', 'mov', 'webm',
    'mp3', 'wav', 'aac', 'm4a', 'pdf', 'docx', 'xlsx', 'pptx', 'txt'
  )),
  privacy text not null check (privacy in ('public', 'private')),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 104857600),
  width integer check (width is null or width between 1 and 100000),
  height integer check (height is null or height between 1 and 100000),
  duration_ms bigint check (duration_ms is null or duration_ms between 0 and 604800000),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array' and pg_column_size(variants) <= 65536),
  display_order smallint not null default 0 check (display_order between 0 and 1000),
  alt_text text not null default '' check (char_length(alt_text) <= 500),
  caption text not null default '' check (char_length(caption) <= 1000),
  processing_status text not null default 'quarantined' check (processing_status in ('quarantined', 'processing', 'ready', 'rejected', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_bucket_privacy_check check (
    (bucket_id = 'bos-public-media' and privacy = 'public') or
    (bucket_id = 'bos-private-documents' and privacy = 'private')
  ),
  constraint media_assets_object_unique unique (bucket_id, object_path)
);

create index if not exists media_assets_owner_recent
  on public.media_assets (owner_id, created_at desc);
create index if not exists media_assets_parent_order
  on public.media_assets (module_key, parent_type, parent_id, display_order)
  where processing_status = 'ready' and privacy = 'public';
create index if not exists media_assets_checksum_owner
  on public.media_assets (owner_id, checksum_sha256)
  where checksum_sha256 is not null;

alter table public.media_assets enable row level security;
revoke all on public.media_assets from public, anon, authenticated;
grant select, insert on public.media_assets to authenticated;
grant select on public.media_assets to anon;

drop policy if exists "Ready public media is readable" on public.media_assets;
create policy "Ready public media is readable"
  on public.media_assets for select to anon, authenticated
  using (privacy = 'public' and processing_status = 'ready');

drop policy if exists "Owners and Super Admins read media metadata" on public.media_assets;
create policy "Owners and Super Admins read media metadata"
  on public.media_assets for select to authenticated
  using (
    owner_id = (select auth.uid())
    or ((select public.is_active_user()) and (select public.is_current_user_super_admin()))
  );

drop policy if exists "Active providers register quarantined media" on public.media_assets;
create policy "Active providers register quarantined media"
  on public.media_assets for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.is_active_user())
    and processing_status = 'quarantined'
    and display_order >= 0
    and (
      (bucket_id = 'bos-public-media' and privacy = 'public' and media_kind in ('image', 'video', 'audio'))
      or (bucket_id = 'bos-private-documents' and privacy = 'private' and media_kind in ('document', 'text'))
    )
    and split_part(object_path, '/', 1) = (select auth.uid())::text
  );

-- The standalone disposable PostgreSQL suite does not create Supabase's
-- Storage schema. Keep that test environment usable while requiring the
-- existing Storage service when actually provisioning hosted uploads.
do $storage$
declare
  public_types text[] := array[
    'image/jpeg','image/png','image/webp','image/avif','image/heic','image/gif','image/svg+xml',
    'video/mp4','video/quicktime','video/webm','audio/mpeg','audio/wav','audio/aac','audio/mp4'
  ]::text[];
  private_types text[] := array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]::text[];
  valid_bucket boolean;
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Supabase Storage schema is absent; media metadata is prepared but uploads remain disabled.';
    return;
  end if;

  -- Private buckets prevent direct object access. Public listing media is
  -- exposed only by signed URLs after a server-side processor marks it ready.
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('bos-public-media', 'bos-public-media', false, 104857600, $1)
    on conflict (id) do nothing
  $sql$ using public_types;
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('bos-private-documents', 'bos-private-documents', false, 26214400, $1)
    on conflict (id) do nothing
  $sql$ using private_types;

  execute $sql$
    select exists (
      select 1 from storage.buckets where id = 'bos-public-media'
        and name = 'bos-public-media' and public = false and file_size_limit = 104857600
        and allowed_mime_types @> $1 and $1 @> allowed_mime_types
    )
  $sql$ into valid_bucket using public_types;
  if not valid_bucket then raise exception 'BOS_PUBLIC_MEDIA_BUCKET_CONFIGURATION_MISMATCH'; end if;
  execute $sql$
    select exists (
      select 1 from storage.buckets where id = 'bos-private-documents'
        and name = 'bos-private-documents' and public = false and file_size_limit = 26214400
        and allowed_mime_types @> $1 and $1 @> allowed_mime_types
    )
  $sql$ into valid_bucket using private_types;
  if not valid_bucket then raise exception 'BOS_PRIVATE_DOCUMENT_BUCKET_CONFIGURATION_MISMATCH'; end if;

  execute 'drop policy if exists "Public listing media is readable" on storage.objects';
  execute 'drop policy if exists "Ready listing media and owned originals are readable" on storage.objects';
  execute $sql$
    create policy "Ready listing media and owned originals are readable"
      on storage.objects for select to anon, authenticated
      using (
        bucket_id = 'bos-public-media'
        and (
          exists (
            select 1 from public.media_assets asset
            where asset.bucket_id = storage.objects.bucket_id
              and asset.object_path = storage.objects.name
              and asset.privacy = 'public' and asset.processing_status = 'ready'
          )
          or (
            (select auth.uid()) is not null
            and split_part(name, '/', 1) = (select auth.uid())::text
            and (select public.is_active_user())
          )
        )
      )
  $sql$;

  execute 'drop policy if exists "Owners upload public listing media" on storage.objects';
  execute $sql$
    create policy "Owners upload public listing media"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'bos-public-media'
        and split_part(name, '/', 1) = (select auth.uid())::text
        and (select public.is_active_user())
        and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('provider', 'admin'))
      )
  $sql$;

  execute 'drop policy if exists "Owners upload private documents" on storage.objects';
  execute $sql$
    create policy "Owners upload private documents"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'bos-private-documents'
        and split_part(name, '/', 1) = (select auth.uid())::text
        and (select public.is_active_user())
        and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('provider', 'admin'))
      )
  $sql$;

  execute 'drop policy if exists "Owners and Super Admins read private documents" on storage.objects';
  execute $sql$
    create policy "Owners and Super Admins read private documents"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'bos-private-documents'
        and (
          split_part(name, '/', 1) = (select auth.uid())::text
          or ((select public.is_active_user()) and (select public.is_current_user_super_admin()))
        )
      )
  $sql$;
end;
$storage$;

-- No client update/delete policy is intentionally provided. Replacements use
-- unique object paths; deletion and retention cleanup require an audited,
-- server-authorized lifecycle operation.

commit;

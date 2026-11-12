\set ON_ERROR_STOP on
-- ============================================================================
-- Media finalization test
--
-- Runs only on the disposable local cluster after the full migration set.
-- Proves that only the trusted service role can transition a quarantined asset
-- after the server has decoded and checked all bytes. Storage ownership,
-- size, checksum and variant byte validation are covered by the API tests.
-- and that anon can read the original + variants only after publication.
-- ============================================================================

insert into auth.users (id, email, raw_user_meta_data)
values
  ('44444444-4444-4444-8444-444444444444', 'media-owner@example.test',
   '{"full_name":"Media Owner"}'::jsonb),
  ('66666666-6666-4666-8666-666666666666', 'media-other@example.test',
   '{"full_name":"Media Other"}'::jsonb),
  ('77777777-7777-4777-8777-777777777777', 'media-superadmin@example.test',
   '{"full_name":"Media Super Admin"}'::jsonb)
on conflict (id) do nothing;

update public.profiles
   set role = 'provider', account_status = 'active', verified = true
 where id in (
   '44444444-4444-4444-8444-444444444444',
   '66666666-6666-4666-8666-666666666666'
 );
update public.profiles
   set role = 'admin', account_status = 'active', verified = true, is_super_admin = true
 where id = '77777777-7777-4777-8777-777777777777';

insert into public.media_assets (
  id, owner_id, module_key, parent_type, parent_id, bucket_id, object_path,
  media_kind, media_format, privacy, file_size_bytes, width, height,
  checksum_sha256, variants, display_order, alt_text, caption, processing_status
)
values (
  '55555555-5555-4555-8555-555555555551',
  '44444444-4444-4444-8444-444444444444',
  'services', 'provider_listing', 'listing-media-test', 'bos-public-media',
  '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-a/original.jpg',
  'image', 'jpeg', 'public', 1000, 800, 600,
  repeat('a', 64),
  jsonb_build_array(jsonb_build_object(
    'object_path', '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-a/w160.webp',
    'width', 160, 'height', 120, 'mime_type', 'image/webp', 'file_size_bytes', 100
  )),
  0, 'Validated image', '', 'quarantined'
)
on conflict (id) do nothing;

insert into public.media_assets (
  id, owner_id, module_key, parent_type, parent_id, bucket_id, object_path,
  media_kind, media_format, privacy, file_size_bytes, width, height,
  checksum_sha256, variants, display_order, alt_text, caption, processing_status
)
values (
  '55555555-5555-4555-8555-555555555552',
  '44444444-4444-4444-8444-444444444444',
  'services', 'provider_listing', 'listing-media-test', 'bos-public-media',
  '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-b/original.jpg',
  'image', 'jpeg', 'public', 999, 800, 600,
  repeat('b', 64), '[]'::jsonb, 1, 'Size mismatch', '', 'quarantined'
)
on conflict (id) do nothing;

-- A single module-neutral listing repository serves the six customer modules.
-- Attach each test reference to an active listing so anonymous image reads
-- prove listing publication rather than merely media finalization.
insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
values
  ('listing-media-test', '44444444-4444-4444-8444-444444444444', 'Published Services image', 'services', 'test', 'service', 0, 'quote', 'active',
   jsonb_build_object('images', jsonb_build_array('storage://bos-public-media/44444444-4444-4444-8444-444444444444/services/provider_listing/asset-a/original.jpg'))),
  ('listing-media-draft', '44444444-4444-4444-8444-444444444444', 'Pending image', 'services', 'test', 'service', 0, 'quote', 'pending_approval',
   jsonb_build_object('images', jsonb_build_array('storage://bos-public-media/44444444-4444-4444-8444-444444444444/services/provider_listing/asset-c/original.jpg')))
on conflict (id) do nothing;

with module_fixtures(module_key, entity_type) as (values
  ('pg_hostels', 'property'), ('classes', 'course'), ('venues', 'venue'),
  ('hotel_stay', 'property')
), assets as (
  select module_key, entity_type,
         md5('media-policy-' || module_key)::uuid as asset_id,
         '44444444-4444-4444-8444-444444444444/' || module_key || '/provider_listing/' || module_key || '/original.jpg' as object_path,
         'listing-media-' || module_key as listing_id
    from module_fixtures
)
insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
select listing_id, '44444444-4444-4444-8444-444444444444', 'Published ' || module_key || ' image',
       module_key, 'test', entity_type, 0, 'quote', 'active',
       jsonb_build_object('images', jsonb_build_array('storage://bos-public-media/' || object_path))
  from assets
on conflict (id) do nothing;

with module_fixtures(module_key, entity_type) as (values
  ('pg_hostels', 'property'), ('classes', 'course'), ('venues', 'venue'),
  ('hotel_stay', 'property')
), assets as (
  select module_key, md5('media-policy-' || module_key)::uuid as asset_id,
         '44444444-4444-4444-8444-444444444444/' || module_key || '/provider_listing/' || module_key || '/original.jpg' as object_path,
         '44444444-4444-4444-8444-444444444444/' || module_key || '/provider_listing/' || module_key || '/w160.webp' as variant_path,
         'listing-media-' || module_key as listing_id
    from module_fixtures
)
insert into public.media_assets (
  id, owner_id, module_key, parent_type, parent_id, bucket_id, object_path,
  media_kind, media_format, privacy, file_size_bytes, width, height,
  checksum_sha256, variants, display_order, alt_text, caption, processing_status
)
select asset_id, '44444444-4444-4444-8444-444444444444', module_key, 'provider_listing', listing_id,
       'bos-public-media', object_path, 'image', 'jpeg', 'public', 1000, 800, 600,
       md5(module_key) || md5(module_key),
       jsonb_build_array(jsonb_build_object('object_path', variant_path, 'width', 160, 'height', 120, 'mime_type', 'image/webp', 'file_size_bytes', 100)),
       0, 'Published module image', '', 'ready'
  from assets
on conflict (id) do nothing;

insert into public.media_assets (
  id, owner_id, module_key, parent_type, parent_id, bucket_id, object_path,
  media_kind, media_format, privacy, file_size_bytes, checksum_sha256, variants,
  display_order, processing_status
)
values (
  '55555555-5555-4555-8555-555555555553', '44444444-4444-4444-8444-444444444444',
  'services', 'provider_listing', 'listing-media-draft', 'bos-public-media',
  '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-c/original.jpg',
  'image', 'jpeg', 'public', 1000, repeat('c', 64), '[]'::jsonb, 2, 'ready'
), (
  '55555555-5555-4555-8555-555555555554', '44444444-4444-4444-8444-444444444444',
  'services', 'provider_listing', 'missing-listing', 'bos-public-media',
  '44444444-4444-4444-8444-555555555554/services/provider_listing/asset-d/original.jpg',
  'image', 'jpeg', 'public', 1000, repeat('d', 64), '[]'::jsonb, 3, 'ready'
)
on conflict (id) do nothing;

insert into public.media_assets (
  id, owner_id, module_key, parent_type, parent_id, bucket_id, object_path,
  media_kind, media_format, privacy, file_size_bytes, checksum_sha256, variants,
  display_order, processing_status
)
values (
  '55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777777',
  'branding', 'live_builder_banner', 'home', 'bos-public-media',
  '77777777-7777-4777-8777-777777777777/branding/live_builder_banner/home/banner.jpg',
  'image', 'jpeg', 'public', 1000, repeat('e', 64), '[]'::jsonb, 0, 'ready'
), (
  '55555555-5555-4555-8555-555555555556', '77777777-7777-4777-8777-777777777777',
  'movies', 'category_asset', 'movies-discovery', 'bos-public-media',
  '77777777-7777-4777-8777-777777777777/movies/category_asset/movies-discovery/poster.jpg',
  'image', 'jpeg', 'public', 1000, repeat('f', 64), '[]'::jsonb, 0, 'ready'
), (
  '55555555-5555-4555-8555-555555555557', '44444444-4444-4444-8444-444444444444',
  'profile', 'profile_avatar', '44444444-4444-4444-8444-444444444444', 'bos-public-media',
  '44444444-4444-4444-8444-444444444444/profile/profile_avatar/self/avatar.jpg',
  'image', 'jpeg', 'public', 1000, repeat('1', 64), '[]'::jsonb, 0, 'ready'
)
on conflict (id) do nothing;

update public.profiles
   set avatar_url = 'storage://bos-public-media/44444444-4444-4444-8444-444444444444/profile/profile_avatar/self/avatar.jpg'
 where id = '44444444-4444-4444-8444-444444444444';

insert into storage.objects (bucket_id, name, owner, metadata)
values
  (
    'bos-private-profile-media',
    '44444444-4444-4444-8444-444444444444/profile/profile_avatar/avatar.jpg',
    '44444444-4444-4444-8444-444444444444',
    '{"mimetype":"image/jpeg","size":1000}'::jsonb
  ),
  (
    'bos-public-media',
    '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-a/original.jpg',
    '44444444-4444-4444-8444-444444444444',
    '{"mimetype":"image/jpeg","size":1000}'::jsonb
  ),
  (
    'bos-public-media',
    '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-a/w160.webp',
    '44444444-4444-4444-8444-444444444444',
    '{"mimetype":"image/webp","size":100}'::jsonb
  ),
  (
    'bos-public-media',
    '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-b/original.jpg',
    '44444444-4444-4444-8444-444444444444',
    '{"mimetype":"image/jpeg","size":1000}'::jsonb
  ),
  (
    'bos-public-media',
    '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-c/original.jpg',
    '44444444-4444-4444-8444-444444444444',
    '{"mimetype":"image/jpeg","size":1000}'::jsonb
  ),
  (
    'bos-public-media',
    '44444444-4444-4444-8444-555555555554/services/provider_listing/asset-d/original.jpg',
    '44444444-4444-4444-8444-444444444444',
    '{"mimetype":"image/jpeg","size":1000}'::jsonb
  ),
  (
    'bos-public-media',
    '77777777-7777-4777-8777-777777777777/branding/live_builder_banner/home/banner.jpg',
    '77777777-7777-4777-8777-777777777777',
    '{"mimetype":"image/jpeg","size":1000}'::jsonb
  ),
  (
    'bos-public-media',
    '77777777-7777-4777-8777-777777777777/movies/category_asset/movies-discovery/poster.jpg',
    '77777777-7777-4777-8777-777777777777',
    '{"mimetype":"image/jpeg","size":1000}'::jsonb
  ),
  (
    'bos-public-media',
    '44444444-4444-4444-8444-444444444444/profile/profile_avatar/self/avatar.jpg',
    '44444444-4444-4444-8444-444444444444',
    '{"mimetype":"image/jpeg","size":1000}'::jsonb
  ),
  (
    'bos-private-documents',
    '44444444-4444-4444-8444-444444444444/services/provider_listing/id.pdf',
    '44444444-4444-4444-8444-444444444444',
    '{"mimetype":"application/pdf","size":100}'::jsonb
  )
on conflict (bucket_id, name) do nothing;

with module_fixtures(module_key) as (values
  ('pg_hostels'), ('classes'), ('venues'), ('hotel_stay')
), assets as (
  select module_key,
         '44444444-4444-4444-8444-444444444444/' || module_key || '/provider_listing/' || module_key || '/original.jpg' as original_path,
         '44444444-4444-4444-8444-444444444444/' || module_key || '/provider_listing/' || module_key || '/w160.webp' as variant_path
    from module_fixtures
)
insert into storage.objects (bucket_id, name, owner, metadata)
select 'bos-public-media', original_path, '44444444-4444-4444-8444-444444444444'::uuid, '{"mimetype":"image/jpeg","size":1000}'::jsonb from assets
union all
select 'bos-public-media', variant_path, '44444444-4444-4444-8444-444444444444'::uuid, '{"mimetype":"image/webp","size":100}'::jsonb from assets
on conflict (bucket_id, name) do nothing;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

do $$
begin
  set local role authenticated;
  begin
    perform public.finalize_media_asset('55555555-5555-4555-8555-555555555551');
    raise exception 'FAIL authenticated caller invoked metadata-only finalizer';
  exception when insufficient_privilege then
    raise notice 'PASS authenticated caller cannot bypass server byte inspection';
  end;
  reset role;
end $$;

do $$
declare
  finalized_status text;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  set local role service_role;
  select (public.finalize_media_asset_server(
    '55555555-5555-4555-8555-555555555551',
    '44444444-4444-4444-8444-444444444444', repeat('a', 64), 800, 600
  )).processing_status
    into finalized_status;
  reset role;
  if finalized_status is distinct from 'ready' then
    raise exception 'FAIL finalize did not publish the validated asset';
  end if;
  if (select processing_status from public.media_assets
       where id = '55555555-5555-4555-8555-555555555551') is distinct from 'ready' then
    raise exception 'FAIL finalized asset was not persisted as ready';
  end if;
  raise notice 'PASS validated media asset transitions to ready';
end $$;

do $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', false);
  set local role service_role;
  begin
    perform public.finalize_media_asset_server(
      '55555555-5555-4555-8555-555555555551',
      '66666666-6666-4666-8666-666666666666', repeat('a', 64), 800, 600
    );
    raise exception 'FAIL another user finalized the asset';
  exception when no_data_found then
    if position('MEDIA_ASSET_NOT_FOUND' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS another user cannot finalize the asset';
  end;
  reset role;
end $$;

do $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', false);
  set local role service_role;
  begin
    perform public.finalize_media_asset_server(
      '55555555-5555-4555-8555-555555555552',
      '44444444-4444-4444-8444-444444444444', repeat('b', 64), 800, 600
    );
    raise exception 'FAIL size-mismatched asset was finalized';
  exception when check_violation then
    if position('MEDIA_OBJECT_SIZE_MISMATCH' in sqlerrm) = 0 then raise; end if;
    raise notice 'PASS stored object size mismatch is refused';
  end;
  reset role;
end $$;

do $$
declare
  invalid_case record;
begin
  perform set_config('request.jwt.claim.role', 'service_role', false);
  set local role service_role;
  for invalid_case in
    select null::text as checksum, 800::integer as width, 600::integer as height
    union all select repeat('a', 64), null::integer, 600::integer
    union all select repeat('a', 64), 800::integer, null::integer
  loop
    begin
      perform public.finalize_media_asset_server(
        '55555555-5555-4555-8555-555555555551',
        '44444444-4444-4444-8444-444444444444',
        invalid_case.checksum, invalid_case.width, invalid_case.height
      );
      raise exception 'FAIL null media validation input was accepted';
    exception when insufficient_privilege then
      if position('MEDIA_SERVER_VALIDATION_REQUIRED' in sqlerrm) = 0 then raise; end if;
    end;
  end loop;
  reset role;
  raise notice 'PASS null checksum, width and height are refused';
end $$;

do $$
declare
  visible_objects integer;
  visible_profile_avatar integer;
  quarantined_visible_objects integer;
  published_module_assets integer;
  unpublished_visible_objects integer;
begin
  if exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Ready listing media and owned originals are readable'
  ) then
    raise exception 'FAIL combined storage read policy still present';
  end if;
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Published public media objects are readable'
  ) then
    raise exception 'FAIL publication-scoped public media policy missing';
  end if;
  if has_function_privilege('anon', 'public.is_active_user()', 'EXECUTE') then
    raise exception 'FAIL anon can execute is_active_user';
  end if;

  -- Anonymous catalog reads must not inherit a leftover owner JWT. The public
  -- Storage SELECT policy has to succeed without calling is_active_user().
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  set local role anon;

  select count(*) into visible_objects
    from storage.objects
   where bucket_id = 'bos-public-media'
     and name ~ '^44444444-4444-4444-8444-444444444444/(pg_hostels|classes|venues|services|hotel_stay)/provider_listing/';

  select count(*) into visible_profile_avatar
    from storage.objects
   where bucket_id = 'bos-public-media'
     and name = '44444444-4444-4444-8444-444444444444/profile/profile_avatar/self/avatar.jpg';

  select count(*) into published_module_assets
    from public.media_assets
   where object_path in (
     '44444444-4444-4444-8444-444444444444/profile/profile_avatar/self/avatar.jpg',
     '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-a/original.jpg',
     '44444444-4444-4444-8444-444444444444/pg_hostels/provider_listing/pg_hostels/original.jpg',
     '44444444-4444-4444-8444-444444444444/classes/provider_listing/classes/original.jpg',
     '44444444-4444-4444-8444-444444444444/venues/provider_listing/venues/original.jpg',
     '44444444-4444-4444-8444-444444444444/hotel_stay/provider_listing/hotel_stay/original.jpg'
   );

  select count(*) into quarantined_visible_objects
    from storage.objects
   where bucket_id = 'bos-public-media'
     and name = '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-b/original.jpg';

  select count(*) into unpublished_visible_objects
    from storage.objects
   where bucket_id = 'bos-public-media'
     and name in (
       '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-c/original.jpg',
       '44444444-4444-4444-8444-555555555554/services/provider_listing/asset-d/original.jpg',
       '77777777-7777-4777-8777-777777777777/branding/live_builder_banner/home/banner.jpg',
       '77777777-7777-4777-8777-777777777777/movies/category_asset/movies-discovery/poster.jpg'
     );

  reset role;

  if visible_objects is distinct from 10 then
    raise exception 'FAIL anon cannot read originals and responsive variants for the five booking modules';
  end if;
  if published_module_assets is distinct from 6 then
    raise exception 'FAIL anon media metadata query returned unpublished or missing rows';
  end if;
  if visible_profile_avatar is distinct from 1 then
    raise exception 'FAIL public provider avatar projection did not authorize its own image';
  end if;
  if quarantined_visible_objects is distinct from 0 then
    raise exception 'FAIL anon can read a quarantined image';
  end if;
  if unpublished_visible_objects is distinct from 0 then
    raise exception 'FAIL anon can read draft, orphan, or unpublished banner media';
  end if;
  raise notice 'PASS anon can read published listing images for PG, Classes, Venues, Services, and Stays';
  raise notice 'PASS anon can read only the provider avatar exposed by the public profile projection';
  raise notice 'PASS anon cannot read quarantined, pending-listing, orphan, unpublished banner, or Movies media';
end $$;

-- The Super Admin publication RPC is the only route for a public banner or
-- category asset. It writes a durable audit row; no direct table DML is granted.
do $$
begin
  if has_column_privilege('anon', 'public.media_assets', 'id', 'SELECT')
     or has_column_privilege('anon', 'public.media_assets', 'owner_id', 'SELECT')
     or has_column_privilege('anon', 'public.media_assets', 'parent_id', 'SELECT')
     or has_column_privilege('anon', 'public.media_assets', 'checksum_sha256', 'SELECT')
     or has_column_privilege('anon', 'public.media_assets', 'caption', 'SELECT') then
    raise exception 'FAIL anon media grants expose identifiers or private metadata';
  end if;
  if not has_column_privilege('anon', 'public.media_assets', 'variants', 'SELECT')
     or not has_column_privilege('anon', 'public.media_assets', 'object_path', 'SELECT') then
    raise exception 'FAIL anon media grants cannot resolve approved image variants';
  end if;
  raise notice 'PASS anon media grants expose only fields needed for approved image resolution';
end $$;

do $$
declare
  after_publish integer;
begin
  perform set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true);
  perform set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    perform public.set_media_asset_publication(
      '55555555-5555-4555-8555-555555555555', 'banner', 'home', true, 'Customer must not publish media'
    );
    raise exception 'FAIL customer publication request succeeded';
  exception when insufficient_privilege then
    raise notice 'PASS signed-in customer cannot publish media';
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', true);
  perform set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    insert into public.media_asset_publications (media_asset_id, publication_kind, scope_key, published_by)
    values ('55555555-5555-4555-8555-555555555555', 'banner', 'home', auth.uid());
    raise exception 'FAIL direct publication table write succeeded';
  exception when insufficient_privilege then
    raise notice 'PASS direct publication table DML is denied';
  end;
  perform public.set_media_asset_publication(
    '55555555-5555-4555-8555-555555555555', 'banner', 'home', true, 'Local disposable test publication'
  );
  perform public.set_media_asset_publication(
    '55555555-5555-4555-8555-555555555556', 'category_asset', 'movies-discovery', true, 'Local Movies discovery artwork publication'
  );
  reset role;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  set local role anon;
  select count(*) into after_publish from storage.objects
   where bucket_id = 'bos-public-media'
     and name in (
       '77777777-7777-4777-8777-777777777777/branding/live_builder_banner/home/banner.jpg',
       '77777777-7777-4777-8777-777777777777/movies/category_asset/movies-discovery/poster.jpg'
     );
  reset role;
  if after_publish <> 2 then raise exception 'FAIL Super Admin published banner and Movies artwork did not become readable'; end if;

  if (select count(*) from public.media_asset_publication_audit
       where media_asset_id = '55555555-5555-4555-8555-555555555555'
         and actor_id = '77777777-7777-4777-8777-777777777777' and action = 'publish') <> 1 then
    raise exception 'FAIL publication audit event missing';
  end if;
  if (select count(*) from public.media_asset_publication_audit
       where media_asset_id = '55555555-5555-4555-8555-555555555556'
         and actor_id = '77777777-7777-4777-8777-777777777777' and action = 'publish') <> 1 then
    raise exception 'FAIL Movies artwork publication audit event missing';
  end if;
  raise notice 'PASS Super Admin published a banner and Movies discovery artwork with durable audit events';
end $$;

do $$
begin
  if has_function_privilege('anon', 'public.finalize_media_asset(uuid)', 'EXECUTE') then
    raise exception 'FAIL anon can execute the finalization routine';
  end if;
  if has_function_privilege('authenticated', 'public.finalize_media_asset(uuid)', 'EXECUTE') then
    raise exception 'FAIL authenticated can execute the metadata-only finalization routine';
  end if;
  if not has_function_privilege('service_role', 'public.finalize_media_asset_server(uuid,uuid,text,integer,integer)', 'EXECUTE') then
    raise exception 'FAIL service role cannot execute the trusted finalization routine';
  end if;
  raise notice 'PASS client finalization is revoked and the trusted routine is service-role-only';
end $$;

do $$
declare
  owner_quarantined integer;
  owner_private integer;
  owner_private_profile integer;
  other_quarantined integer;
  other_ready integer;
  other_private_profile integer;
  superadmin_objects integer;
  anon_private integer;
  insert_policies integer;
  mutating_policies integer;
begin
  select count(*) into insert_policies
    from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and cmd = 'INSERT';
  select count(*) into mutating_policies
    from pg_policies
   where schemaname = 'storage'
     and tablename = 'objects'
     and cmd in ('UPDATE', 'DELETE', 'ALL');
  if insert_policies is distinct from 4 then
    raise exception 'FAIL storage insert policy count changed';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname='Owners upload private profile images' and cmd='INSERT'
       and with_check like '%bos-private-profile-media%'
       and with_check like '%auth.uid%'
  ) then
    raise exception 'FAIL private profile image upload policy is missing or not owner-scoped';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and cmd='INSERT' and policyname='Booking parties upload private documents') then
    raise exception 'FAIL booking-party private document upload policy is missing';
  end if;
  if mutating_policies is distinct from 0 then
    raise exception 'FAIL storage gained update or delete policies';
  end if;

  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
  perform set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  select count(*) into owner_quarantined
    from storage.objects
   where bucket_id = 'bos-public-media'
     and name = '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-b/original.jpg';
  select count(*) into owner_private
    from storage.objects
   where bucket_id = 'bos-private-documents'
     and name = '44444444-4444-4444-8444-444444444444/services/provider_listing/id.pdf';
  select count(*) into owner_private_profile
    from storage.objects
   where bucket_id = 'bos-private-profile-media'
     and name = '44444444-4444-4444-8444-444444444444/profile/profile_avatar/avatar.jpg';
  begin
    insert into public.media_assets (
      id, owner_id, module_key, parent_type, parent_id, bucket_id, object_path,
      media_kind, media_format, privacy, file_size_bytes, checksum_sha256, variants,
      display_order, processing_status
    ) values (
      '55555555-5555-4555-8555-555555555558',
      '66666666-6666-4666-8666-666666666666', 'profile', 'profile_avatar',
      '66666666-6666-4666-8666-666666666666', 'bos-private-profile-media',
      '66666666-6666-4666-8666-666666666666/profile/profile_avatar/foreign.jpg',
      'image', 'jpeg', 'private', 1000, repeat('8', 64), '[]'::jsonb, 0, 'quarantined'
    );
    raise exception 'FAIL user inserted profile media for another owner';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true);
  perform set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into other_quarantined
    from storage.objects
   where bucket_id = 'bos-public-media'
     and name = '44444444-4444-4444-8444-444444444444/services/provider_listing/asset-b/original.jpg';
  select count(*) into other_private_profile
    from storage.objects
   where bucket_id = 'bos-private-profile-media'
     and name = '44444444-4444-4444-8444-444444444444/profile/profile_avatar/avatar.jpg';
  select count(*) into other_ready
    from storage.objects
   where bucket_id = 'bos-public-media'
     and name ~ '^44444444-4444-4444-8444-444444444444/(pg_hostels|classes|venues|services|hotel_stay)/provider_listing/';
  reset role;

  perform set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', true);
  perform set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into superadmin_objects from storage.objects where bucket_id = 'bos-public-media';
  reset role;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  set local role anon;
  select count(*) into anon_private
    from storage.objects
   where bucket_id = 'bos-private-documents';
  reset role;

  if owner_quarantined is distinct from 1 then
    raise exception 'FAIL owner cannot read their quarantined original';
  end if;
  if owner_private is distinct from 1 then
    raise exception 'FAIL owner cannot read their private document';
  end if;
  if owner_private_profile is distinct from 1 then
    raise exception 'FAIL owner cannot read their private profile image';
  end if;
  if other_quarantined is distinct from 0 then
    raise exception 'FAIL another user can read a quarantined original';
  end if;
  if other_private_profile is distinct from 0 then
    raise exception 'FAIL another user can read a private profile image';
  end if;
  if other_ready is distinct from 10 then
    raise exception 'FAIL customer cannot read five-module published listing image set';
  end if;
  if superadmin_objects is distinct from 16 then
    raise exception 'FAIL active Super Admin cannot inspect all 16 public-media test objects';
  end if;
  if anon_private is distinct from 0 then
    raise exception 'FAIL anon can read private documents';
  end if;
  raise notice 'PASS owner can read quarantined originals and private documents';
  raise notice 'PASS other users cannot read quarantined or private files';
  raise notice 'PASS profile image storage is private and owner scoped';
  raise notice 'PASS profile media metadata rejects cross-owner inserts';
  raise notice 'PASS authenticated catalog readers still see ready public media';
  raise notice 'PASS active Super Admin can inspect public media for moderation';
  raise notice 'PASS storage write policies were not widened';
end $$;

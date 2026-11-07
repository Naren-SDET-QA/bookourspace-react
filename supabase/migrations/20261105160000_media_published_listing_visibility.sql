-- Restrict public media to published listing references, approved provider
-- avatar projections, and explicitly published banner/category assets.
-- Forward-only: no media rows or Storage objects are changed or deleted.
begin;

create table if not exists public.media_asset_publications (
  media_asset_id uuid primary key references public.media_assets(id) on delete restrict,
  publication_kind text not null check (publication_kind in ('banner', 'category_asset')),
  scope_key text not null check (char_length(scope_key) between 1 and 128),
  published_at timestamptz not null default now(),
  published_by uuid not null references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  check (revoked_at is null or revoked_at >= published_at)
);

alter table public.media_asset_publications enable row level security;
revoke all on public.media_asset_publications from public, anon, authenticated;
grant select (media_asset_id, publication_kind, scope_key, published_at, revoked_at)
  on public.media_asset_publications to anon, authenticated;
drop policy if exists "Active media publications are readable" on public.media_asset_publications;
create policy "Active media publications are readable"
  on public.media_asset_publications for select to anon, authenticated
  using (revoked_at is null);

create table if not exists public.media_asset_publication_audit (
  id bigint generated always as identity primary key,
  media_asset_id uuid not null references public.media_assets(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('publish', 'unpublish')),
  publication_kind text not null check (publication_kind in ('banner', 'category_asset')),
  scope_key text not null check (char_length(scope_key) between 1 and 128),
  reason text not null check (char_length(reason) between 1 and 500),
  occurred_at timestamptz not null default now()
);
alter table public.media_asset_publication_audit enable row level security;
revoke all on public.media_asset_publication_audit from public, anon, authenticated;

create or replace function public.set_media_asset_publication(
  p_asset_id uuid,
  p_publication_kind text,
  p_scope_key text,
  p_publish boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_asset public.media_assets%rowtype;
begin
  if v_actor is null or not public.is_active_user()
     or not public.is_current_user_super_admin() then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_asset_id is null or p_publication_kind is null or p_publish is null
     or p_publication_kind not in ('banner', 'category_asset')
     or p_scope_key is null or char_length(p_scope_key) not between 1 and 128
     or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'INVALID_MEDIA_PUBLICATION';
  end if;

  select * into v_asset
    from public.media_assets
   where id = p_asset_id
     and bucket_id = 'bos-public-media'
     and privacy = 'public'
     and processing_status = 'ready'
   for update;
  if not found then raise exception 'READY_PUBLIC_MEDIA_REQUIRED' using errcode = '23514'; end if;
  if (p_publication_kind = 'banner' and v_asset.parent_type <> 'live_builder_banner')
     or (p_publication_kind = 'category_asset' and v_asset.parent_type <> 'category_asset') then
    raise exception 'MEDIA_PUBLICATION_CONTEXT_MISMATCH' using errcode = '23514';
  end if;

  if p_publish then
    insert into public.media_asset_publications
      (media_asset_id, publication_kind, scope_key, published_at, published_by, revoked_at, updated_at)
    values (p_asset_id, p_publication_kind, p_scope_key, now(), v_actor, null, now())
    on conflict (media_asset_id) do update
      set publication_kind = excluded.publication_kind,
          scope_key = excluded.scope_key,
          published_at = excluded.published_at,
          published_by = excluded.published_by,
          revoked_at = null,
          updated_at = excluded.updated_at;
  else
    update public.media_asset_publications
       set revoked_at = now(), updated_at = now()
     where media_asset_id = p_asset_id
       and revoked_at is null;
  end if;

  insert into public.media_asset_publication_audit
    (media_asset_id, actor_id, action, publication_kind, scope_key, reason)
  values (p_asset_id, v_actor, case when p_publish then 'publish' else 'unpublish' end,
          p_publication_kind, p_scope_key, btrim(p_reason));
end;
$$;
revoke all on function public.set_media_asset_publication(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.set_media_asset_publication(uuid, text, text, boolean, text) to authenticated;

drop policy if exists "Ready public media is readable" on public.media_assets;
drop policy if exists "Published public media is readable" on public.media_assets;
create policy "Published public media is readable"
  on public.media_assets for select to anon, authenticated
  using (
    privacy = 'public' and processing_status = 'ready'
    and (
      (
        parent_type = 'provider_listing'
        and exists (
          select 1 from public.listings l
           where l.id = media_assets.parent_id
             and l.owner_id = media_assets.owner_id
             and l.status = 'active'
             and jsonb_typeof(l.payload->'images') = 'array'
             and (l.payload->'images') @> jsonb_build_array(
               'storage://' || media_assets.bucket_id || '/' || media_assets.object_path
             )
        )
      )
      or (
        parent_type = 'profile_avatar'
        and parent_id = owner_id::text
        and exists (
          select 1 from public.public_provider_profiles p
           where p.id = media_assets.owner_id
             and p.avatar_url = 'storage://' || media_assets.bucket_id || '/' || media_assets.object_path
        )
      )
      or exists (
        select 1 from public.media_asset_publications publication
         where publication.media_asset_id = media_assets.id
           and publication.revoked_at is null
      )
    )
  );

-- Anonymous clients need only the fields used to resolve ready variant paths.
-- Keep asset IDs, owner IDs, parent identifiers, checksums, captions, and
-- private metadata out of the anonymous Data API.
revoke select on public.media_assets from anon;
grant select (bucket_id, object_path, variants, privacy, processing_status)
  on public.media_assets to anon;

drop policy if exists "Ready public listing media is readable" on storage.objects;
drop policy if exists "Published public media objects are readable" on storage.objects;
create policy "Published public media objects are readable"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'bos-public-media'
    and exists (
      select 1 from public.media_assets asset
       where asset.bucket_id = storage.objects.bucket_id
         and asset.privacy = 'public'
         and asset.processing_status = 'ready'
         and (
           asset.object_path = storage.objects.name
           or exists (
             select 1 from jsonb_array_elements(asset.variants) variant
              where variant->>'object_path' = storage.objects.name
           )
         )
    )
  );

drop policy if exists "Active owners read their public media originals" on storage.objects;
drop policy if exists "Owners and Super Admins inspect public media" on storage.objects;
create policy "Owners and Super Admins inspect public media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'bos-public-media'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or ((select public.is_active_user()) and (select public.is_current_user_super_admin()))
    )
  );

commit;

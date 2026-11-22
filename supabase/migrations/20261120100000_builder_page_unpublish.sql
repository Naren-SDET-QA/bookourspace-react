-- =============================================================================
-- Builder page unpublish
--
-- Retraction was previously only expressible as a rollback to an older
-- published version, which always left *something* published. A Super Admin
-- needs to be able to take a page down entirely: the public surface stops
-- serving the document, the row stays in history, and the change is audited.
--
-- This widens the status vocabulary and adds the RPC. It is additive: no row is
-- dropped and every existing status keeps its meaning.
-- =============================================================================
begin;

alter table public.platform_page_versions
  drop constraint if exists platform_page_versions_status_check;

alter table public.platform_page_versions
  add constraint platform_page_versions_status_check
  check (status in ('draft','published','superseded_draft','unpublished'));

-- Published rows are immutable apart from one audited transition: a Super Admin
-- may retire the live document by moving it to 'unpublished'. The content,
-- numbering and provenance stay frozen, and the row is never deleted, so this
-- widens the state machine without weakening the immutability guarantee.
create or replace function public.guard_builder_page_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.builder_validate_page_document(new.page_key, new.document);
    if new.schema_version < 1 or new.schema_version > 100 then
      raise exception 'BUILDER_SCHEMA_UNSUPPORTED';
    end if;
    if (new.status = 'published') <> (new.published_at is not null) then
      raise exception 'BUILDER_PUBLISH_TIMESTAMP_INVALID';
    end if;
    return new;
  end if;
  if old.status = 'published' and new.status = 'unpublished' then
    if new.id <> old.id
       or new.page_key <> old.page_key
       or new.version_number <> old.version_number
       or new.document <> old.document
       or new.schema_version <> old.schema_version
       or new.summary <> old.summary
       or new.created_by is distinct from old.created_by
       or new.created_at <> old.created_at
       or new.source_version_id is distinct from old.source_version_id
       or new.published_at is not null
       or new.published_by is not null then
      raise exception 'BUILDER_VERSION_IMMUTABLE';
    end if;
    return new;
  end if;
  if old.status <> 'draft'
     or new.id <> old.id
     or new.page_key <> old.page_key
     or new.version_number <> old.version_number
     or new.document <> old.document
     or new.schema_version <> old.schema_version
     or new.summary <> old.summary
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at
     or new.source_version_id is distinct from old.source_version_id
     or new.status not in ('published','superseded_draft') then
    raise exception 'BUILDER_VERSION_IMMUTABLE';
  end if;
  if (new.status = 'published') <> (new.published_at is not null) then
    raise exception 'BUILDER_PUBLISH_TIMESTAMP_INVALID';
  end if;
  return new;
end;
$$;

create or replace function public.builder_unpublish_page(
  p_actor uuid,
  p_page_key text,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.builder_actor_role(p_actor);
  v_max bigint;
  v_row public.platform_page_versions;
begin
  if v_role is distinct from 'super_admin' then
    raise exception 'BUILDER_SUPER_ADMIN_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtext('builder_page:' || p_page_key)::bigint);
  select max(version_number) into v_max
    from public.platform_page_versions
   where page_key = p_page_key and status = 'published';
  if v_max is null then
    raise exception 'BUILDER_PAGE_NOT_PUBLISHED';
  end if;
  if p_expected_version is not null and p_expected_version <> v_max then
    raise exception 'BUILDER_VERSION_CONFLICT';
  end if;
  -- A rollback leaves the version it came from published, so a retraction must
  -- clear every published row for the page. Demoting only the newest row would
  -- silently keep serving an older document.
  update public.platform_page_versions
     set status = 'unpublished',
         published_at = null,
         published_by = null,
         updated_at = now()
   where page_key = p_page_key and status = 'published';
  select * into v_row
    from public.platform_page_versions
   where page_key = p_page_key and version_number = v_max;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'page_unpublished', 'page', p_page_key, v_row.version_number,
    'Unpublished version ' || v_row.version_number,
    jsonb_build_object('versionId', v_row.id)
  );
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.builder_unpublish_page(uuid, text, bigint) from public, anon, authenticated;

commit;

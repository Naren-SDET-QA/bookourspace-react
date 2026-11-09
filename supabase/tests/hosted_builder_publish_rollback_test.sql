\set ON_ERROR_STOP on
-- ============================================================================
-- Hosted Live Builder publish -> customer visibility -> rollback.
--
-- WRITE TEST. Run only through run_hosted_builder_publish_rollback.sh --apply
-- after separate approval for hosted migrations and test-data writes.
--
-- It refuses to run if the selected page already has a draft, so it never
-- supersedes a real editor draft. It appends a copy-published version, checks
-- anonymous visibility, then appends a rollback version. Nothing is deleted.
-- ============================================================================

\if :{?bos_actor}
\else
  do $$ begin raise exception 'HOSTED_BUILDER_ACTOR_REQUIRED'; end $$;
\endif
\if :{?bos_page_key}
\else
  do $$ begin raise exception 'HOSTED_BUILDER_PAGE_KEY_REQUIRED'; end $$;
\endif

do $$
declare
  v_actor uuid := :'bos_actor'::uuid;
  v_page_key text := :'bos_page_key';
  v_snapshot public.platform_page_versions%rowtype;
  v_max bigint;
  v_draft jsonb;
  v_published jsonb;
  v_rollback jsonb;
  v_new_version bigint;
  v_rollback_version bigint;
  v_visible integer;
  v_audit integer;
begin
  if v_page_key not in ('pg_hostels','classes','venues','services','hotel_stay','movies') then
    raise exception 'HOSTED_BUILDER_PAGE_KEY_INVALID';
  end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = v_actor
       and p.is_super_admin is true
       and p.role = 'admin'
       and p.account_status = 'active'
       and p.verified is true
  ) then
    raise exception 'HOSTED_BUILDER_ACTOR_NOT_ACTIVE_SUPER_ADMIN';
  end if;

  if exists (
    select 1 from public.platform_page_versions
     where page_key = v_page_key and status = 'draft'
  ) then
    raise exception 'HOSTED_BUILDER_TEST_REQUIRES_NO_DRAFT';
  end if;

  select * into v_snapshot
    from public.platform_page_versions
   where page_key = v_page_key and status = 'published'
   order by version_number desc
   limit 1;
  if not found then
    raise exception 'HOSTED_BUILDER_TEST_REQUIRES_PUBLISHED_BASELINE';
  end if;

  select coalesce(max(version_number), 0) into v_max
    from public.platform_page_versions where page_key = v_page_key;

  v_draft := public.builder_save_page_draft(
    v_actor,
    v_page_key,
    v_snapshot.document,
    'Hosted publish/rollback test copy of version ' || v_snapshot.version_number,
    v_max
  );
  v_published := public.builder_publish_page(v_actor, v_page_key, (v_draft->>'id')::uuid);
  v_new_version := (v_published->>'version_number')::bigint;

  execute 'set local role anon';
  select count(*) into v_visible
    from public.platform_page_versions
   where page_key = v_page_key
     and version_number = v_new_version
     and status = 'published';
  execute 'reset role';
  if v_visible <> 1 then
    raise exception 'HOSTED_BUILDER_CUSTOMER_VISIBILITY_FAILED';
  end if;

  v_rollback := public.builder_rollback_page(v_actor, v_page_key, v_snapshot.id);
  v_rollback_version := (v_rollback->>'version_number')::bigint;

  execute 'set local role anon';
  select count(*) into v_visible
    from public.platform_page_versions
   where page_key = v_page_key
     and version_number = v_rollback_version
     and status = 'published'
     and document = v_snapshot.document;
  execute 'reset role';
  if v_visible <> 1 then
    raise exception 'HOSTED_BUILDER_ROLLBACK_VISIBILITY_FAILED';
  end if;

  select count(*) into v_audit
    from public.platform_builder_audit
   where target_kind = 'page'
     and target_key = v_page_key
     and version_number in (v_new_version, v_rollback_version)
     and action in ('page_draft_saved','page_published','page_rolled_back');
  if v_audit < 3 then
    raise exception 'HOSTED_BUILDER_AUDIT_INCOMPLETE';
  end if;

  raise notice 'PASS hosted builder publish version=% rollback_version=% customer_visible=2 audit_rows=%',
    v_new_version, v_rollback_version, v_audit;
end $$;

-- ============================================================================
-- Entity (module) rollback for the Universal Live Builder.
--
-- Restoring a module schema follows the same append-only rule as pages: the
-- target version is copied forward into a new published version, the previous
-- published version is retained, and the undo is auditable. Only a verified
-- Super Admin may roll back, and only the application server may call the
-- function because it is revoked from anon and authenticated.
--
-- Local-only until the owner approves a hosted apply.
-- ============================================================================
begin;

create or replace function public.builder_rollback_entity(
  p_actor uuid,
  p_entity_key text,
  p_target_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.builder_actor_role(p_actor);
  v_target public.platform_entity_versions;
  v_number bigint;
  v_row public.platform_entity_versions;
begin
  if v_role is distinct from 'super_admin' then raise exception 'BUILDER_SUPER_ADMIN_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('builder_entity:' || p_entity_key)::bigint);

  select * into v_target
    from public.platform_entity_versions
   where id = p_target_version_id and entity_key = p_entity_key and status = 'published';
  if not found then raise exception 'BUILDER_TARGET_VERSION_NOT_FOUND'; end if;

  select coalesce(max(version_number), 0) + 1 into v_number
    from public.platform_entity_versions where entity_key = p_entity_key;

  update public.platform_entity_versions
     set status = 'superseded_draft', updated_at = now()
   where entity_key = p_entity_key and status = 'draft';

  insert into public.platform_entity_versions
    (entity_key, version_number, status, schema, summary, created_by,
     published_at, published_by, source_version_id)
  values (
    p_entity_key, v_number, 'published', v_target.schema,
    left('Rollback to version ' || v_target.version_number, 500), p_actor,
    now(), p_actor, v_target.id
  )
  returning * into v_row;

  update public.platform_entities
     set status = 'published', current_version_id = v_row.id, updated_at = now()
   where key = p_entity_key;

  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'entity_rolled_back', 'entity', p_entity_key, v_number,
    'Rolled back to version ' || v_target.version_number,
    jsonb_build_object('sourceVersionId', v_target.id)
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.builder_rollback_entity(uuid, text, uuid) from public, anon, authenticated;

commit;

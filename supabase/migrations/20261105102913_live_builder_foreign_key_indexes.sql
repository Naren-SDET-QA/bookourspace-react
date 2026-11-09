-- Index the referencing columns introduced by the Live Builder migrations.
-- Additive and idempotent; no existing row, policy, grant, or constraint is
-- changed. Local-only candidate pending separate Mumbai approval.
begin;

create index if not exists idx_platform_admin_module_settings_updated_by
  on public.platform_admin_module_settings (updated_by);
create index if not exists idx_platform_entities_created_by
  on public.platform_entities (created_by);
create index if not exists idx_platform_entities_current_version_id
  on public.platform_entities (current_version_id);
create index if not exists idx_platform_entity_records_created_by
  on public.platform_entity_records (created_by);
create index if not exists idx_platform_entity_records_updated_by
  on public.platform_entity_records (updated_by);
create index if not exists idx_platform_entity_versions_created_by
  on public.platform_entity_versions (created_by);
create index if not exists idx_platform_entity_versions_published_by
  on public.platform_entity_versions (published_by);
create index if not exists idx_platform_entity_versions_source_version_id
  on public.platform_entity_versions (source_version_id);
create index if not exists idx_platform_live_page_config_created_by
  on public.platform_live_page_config (created_by);
create index if not exists idx_platform_live_page_config_published_by
  on public.platform_live_page_config (published_by);
create index if not exists idx_platform_live_page_config_source_version_id
  on public.platform_live_page_config (source_version_id);
create index if not exists idx_platform_page_versions_created_by
  on public.platform_page_versions (created_by);
create index if not exists idx_platform_page_versions_published_by
  on public.platform_page_versions (published_by);
create index if not exists idx_platform_page_versions_source_version_id
  on public.platform_page_versions (source_version_id);

commit;

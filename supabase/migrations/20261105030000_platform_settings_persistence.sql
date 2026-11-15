-- ============================================================================
-- Live page configuration and the 17 admin module settings move from the JSON
-- compatibility store into PostgreSQL.
--
-- Design mirrors 20261105020000_universal_live_builder.sql:
--   * version rows are append-only; a draft is deleted/superseded, a publish
--     flips one row, and a rollback writes a new published row that points at
--     the restored version;
--   * every write goes through a SECURITY DEFINER function whose actor is
--     verified against public.profiles, so a browser cannot spoof an admin;
--   * RLS lets anonymous clients read only published page configuration, and
--     lets only active admins read module settings;
--   * every mutation appends to the immutable public.platform_builder_audit.
--
-- This migration is local-only until the owner approves a hosted apply.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- Admin module registry (the 17 console modules)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admin_module_registry (
  module_key text primary key check (module_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (char_length(label) between 1 and 80),
  sort_order integer not null check (sort_order >= 0)
);

insert into public.platform_admin_module_registry (module_key, label, sort_order) values
  ('user_management',      'User management',              10),
  ('payment_management',   'Payment management',           20),
  ('ad_management',        'Ad management',                30),
  ('analytics_performance','Analytics & performance',      40),
  ('reports_analytics',    'Reports & analytics',          50),
  ('theme_management',     'Theme management',             60),
  ('integrations',         'Integrations',                 70),
  ('data_management',      'Data management',              80),
  ('announcements_status', 'Announcements & status',       90),
  ('dashboard',            'Dashboard',                   100),
  ('content_management',   'Content management',          110),
  ('listings_venues',      'Listings & venues',           120),
  ('bookings_events',      'Bookings & events',           130),
  ('feature_management',   'Feature management',          140),
  ('audit_logs',           'Audit logs',                  150),
  ('notifications_mgmt',   'Notifications management',    160),
  ('app_settings',         'App settings',                170)
on conflict (module_key) do update
  set label = excluded.label,
      sort_order = excluded.sort_order;

create table if not exists public.platform_admin_module_settings (
  module_key text primary key references public.platform_admin_module_registry(module_key) on delete restrict,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 262144),
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Live page configuration version stream
-- ---------------------------------------------------------------------------
create table if not exists public.platform_live_page_config (
  id uuid primary key default gen_random_uuid(),
  version_number bigint not null check (version_number > 0),
  state text not null check (state in ('draft', 'published')),
  config jsonb not null check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 1048576),
  summary text not null default 'Saved draft changes' check (char_length(summary) between 1 and 500),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  source_version_id uuid references public.platform_live_page_config(id) on delete restrict,
  constraint platform_live_page_config_number_unique unique (version_number),
  constraint platform_live_page_config_published_at_check check ((state = 'published') = (published_at is not null))
);

-- One draft at a time: the unique index keys on the state value itself, so a
-- second draft insert fails instead of silently shadowing the first.
create unique index if not exists platform_live_page_config_one_draft
  on public.platform_live_page_config (state) where state = 'draft';
create index if not exists platform_live_page_config_published_lookup
  on public.platform_live_page_config (version_number desc) where state = 'published';

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.platform_admin_module_registry enable row level security;
alter table public.platform_admin_module_settings enable row level security;
alter table public.platform_live_page_config enable row level security;

revoke all on public.platform_admin_module_registry from anon, authenticated;
revoke all on public.platform_admin_module_settings from anon, authenticated;
revoke all on public.platform_live_page_config from anon, authenticated;

grant select on public.platform_admin_module_registry to authenticated;
grant select on public.platform_admin_module_settings to authenticated;
grant select on public.platform_live_page_config to anon, authenticated;

drop policy if exists "Signed-in users read the admin module registry" on public.platform_admin_module_registry;
create policy "Signed-in users read the admin module registry"
  on public.platform_admin_module_registry for select to authenticated
  using (true);

drop policy if exists "Admins read admin module settings" on public.platform_admin_module_settings;
create policy "Admins read admin module settings"
  on public.platform_admin_module_settings for select to authenticated
  using ((select public.is_admin()));

-- Published configuration is public; drafts and history stay admin-only.
drop policy if exists "Published live page config is public" on public.platform_live_page_config;
create policy "Published live page config is public"
  on public.platform_live_page_config for select to anon, authenticated
  using (state = 'published');

drop policy if exists "Admins read every live page config version" on public.platform_live_page_config;
create policy "Admins read every live page config version"
  on public.platform_live_page_config for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Live page config RPCs
-- ---------------------------------------------------------------------------
create or replace function public.platform_live_page_save_draft(
  p_actor uuid,
  p_config jsonb,
  p_summary text default 'Saved draft changes'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.builder_actor_role(p_actor);
  v_number bigint;
  v_row public.platform_live_page_config;
begin
  if v_role is null then raise exception 'BUILDER_ADMIN_REQUIRED'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' or pg_column_size(p_config) > 1048576 then
    raise exception 'LIVE_PAGE_CONFIG_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtext('live_page_config')::bigint);
  select coalesce(max(version_number), 0) + 1 into v_number
    from public.platform_live_page_config;
  delete from public.platform_live_page_config where state = 'draft';
  insert into public.platform_live_page_config (version_number, state, config, summary, created_by)
  values (
    v_number, 'draft', p_config,
    left(coalesce(nullif(trim(p_summary), ''), 'Saved draft changes'), 500), p_actor
  )
  returning * into v_row;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'live_page_draft_saved', 'page', 'live_page_config', v_number,
    v_row.summary, jsonb_build_object('bytes', pg_column_size(p_config))
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.platform_live_page_publish(
  p_actor uuid,
  p_version_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.builder_actor_role(p_actor);
  v_row public.platform_live_page_config;
begin
  if v_role is distinct from 'super_admin' then raise exception 'BUILDER_SUPER_ADMIN_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('live_page_config')::bigint);
  select * into v_row
    from public.platform_live_page_config
   where state = 'draft'
     and (p_version_id is null or id = p_version_id)
   order by version_number desc
   limit 1
   for update;
  if not found then raise exception 'BUILDER_DRAFT_NOT_FOUND'; end if;
  update public.platform_live_page_config
     set state = 'published', published_at = now(), published_by = p_actor
   where id = v_row.id
  returning * into v_row;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'live_page_published', 'page', 'live_page_config', v_row.version_number,
    v_row.summary, jsonb_build_object('versionId', v_row.id)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.platform_live_page_rollback(
  p_actor uuid,
  p_target_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.builder_actor_role(p_actor);
  v_target public.platform_live_page_config;
  v_number bigint;
  v_row public.platform_live_page_config;
begin
  if v_role is distinct from 'super_admin' then raise exception 'BUILDER_SUPER_ADMIN_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('live_page_config')::bigint);
  select * into v_target
    from public.platform_live_page_config
   where id = p_target_version_id and state = 'published';
  if not found then raise exception 'BUILDER_TARGET_VERSION_NOT_FOUND'; end if;
  select coalesce(max(version_number), 0) + 1 into v_number
    from public.platform_live_page_config;
  delete from public.platform_live_page_config where state = 'draft';
  insert into public.platform_live_page_config
    (version_number, state, config, summary, created_by, published_at, published_by, source_version_id)
  values (
    v_number, 'published', v_target.config,
    left('Rollback to version ' || v_target.version_number, 500),
    p_actor, now(), p_actor, v_target.id
  )
  returning * into v_row;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'live_page_rolled_back', 'page', 'live_page_config', v_number,
    'Rolled back to version ' || v_target.version_number,
    jsonb_build_object('sourceVersionId', v_target.id)
  );
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin module settings RPC
-- ---------------------------------------------------------------------------
create or replace function public.platform_admin_save_module_settings(
  p_actor uuid,
  p_module_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.builder_actor_role(p_actor);
  v_row public.platform_admin_module_settings;
begin
  if v_role is null then raise exception 'BUILDER_ADMIN_REQUIRED'; end if;
  if not exists (
    select 1 from public.platform_admin_module_registry where module_key = p_module_key
  ) then
    raise exception 'ADMIN_MODULE_UNKNOWN';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or pg_column_size(p_payload) > 262144 then
    raise exception 'ADMIN_MODULE_PAYLOAD_INVALID';
  end if;
  insert into public.platform_admin_module_settings (module_key, payload, revision, updated_by)
  values (p_module_key, p_payload, 1, p_actor)
  on conflict (module_key) do update
    set payload = excluded.payload,
        revision = public.platform_admin_module_settings.revision + 1,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_row;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'admin_module_settings_saved', 'settings', p_module_key, v_row.revision,
    'Saved settings for ' || p_module_key, jsonb_build_object('bytes', pg_column_size(p_payload))
  );
  return to_jsonb(v_row);
end;
$$;

-- Only the application server (direct PostgreSQL connection) may execute these.
revoke all on function public.platform_live_page_save_draft(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.platform_live_page_publish(uuid, uuid) from public, anon, authenticated;
revoke all on function public.platform_live_page_rollback(uuid, uuid) from public, anon, authenticated;
revoke all on function public.platform_admin_save_module_settings(uuid, text, jsonb) from public, anon, authenticated;

commit;

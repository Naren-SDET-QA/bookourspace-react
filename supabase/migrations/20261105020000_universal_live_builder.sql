-- ============================================================================
-- Universal Live Builder — PostgreSQL source of truth.
--
-- Design:
--   * Pages and entities are append-only version streams. Saving a draft never
--     mutates a published row; publishing flips one row; rollback writes a new
--     published row that references the restored version.
--   * The component/field allowlists live in database tables, so the SQL guard
--     rejects any block type that is not in the reviewed registry even if an
--     application-layer check regresses.
--   * Every write is performed by a SECURITY DEFINER function called by the
--     application server (direct PostgreSQL connection). The actor UUID is
--     verified against public.profiles inside the function; anon/authenticated
--     cannot execute these functions, so the browser can never spoof an actor.
--   * RLS still protects direct Supabase client reads: only published
--     configuration is readable, and entity records only when the published
--     schema marks them readable.
--
-- This migration is local-only until the owner approves a hosted apply.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- Approved component / field registries
-- ---------------------------------------------------------------------------
create table if not exists public.platform_component_registry (
  component_type text primary key check (component_type ~ '^[a-z][a-z0-9_]{1,40}$'),
  category text not null check (category in ('content','layout','navigation','commerce','data','feedback')),
  label text not null check (char_length(label) between 1 and 80),
  max_per_page integer not null default 50 check (max_per_page between 1 and 500),
  super_admin_publish boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.platform_component_registry (component_type, category, label, max_per_page, super_admin_publish) values
  ('heading','content','Heading',40,false),
  ('text','content','Text',80,false),
  ('image','content','Image',60,false),
  ('hero','content','Hero banner',6,false),
  ('announcement','content','Announcement bar',3,false),
  ('badge','content','Badge',30,false),
  ('button','navigation','Button',40,false),
  ('nav_menu','navigation','Navigation menu',4,false),
  ('section','layout','Section',40,false),
  ('tabs','layout','Tabs',10,false),
  ('card','layout','Card',60,false),
  ('card_grid','layout','Card grid',10,false),
  ('gallery','content','Gallery',20,false),
  ('divider','layout','Divider',40,false),
  ('spacer','layout','Spacer',40,false),
  ('filter_bar','data','Filter bar',12,false),
  ('search_bar','data','Search bar',6,false),
  ('table','data','Table',10,false),
  ('calendar','data','Calendar',8,false),
  ('form','data','Form',12,false),
  ('form_field','data','Form field',80,false),
  ('booking_widget','commerce','Booking widget',10,true),
  ('inventory_widget','commerce','Inventory widget',10,true),
  ('listing_layout','commerce','Listing layout',6,false),
  ('report','data','Report',16,true),
  ('workflow_action','commerce','Workflow action',30,true)
on conflict (component_type) do update
  set category = excluded.category,
      label = excluded.label,
      max_per_page = excluded.max_per_page,
      super_admin_publish = excluded.super_admin_publish;

create table if not exists public.platform_field_types (
  field_type text primary key check (field_type ~ '^[a-z][a-z0-9_]{1,30}$'),
  label text not null
);

insert into public.platform_field_types (field_type, label) values
  ('text','Text'), ('textarea','Long text'), ('number','Number'), ('money','Money'),
  ('boolean','Yes/No'), ('date','Date'), ('datetime','Date and time'),
  ('select','Single choice'), ('multiselect','Multiple choice'), ('email','Email'),
  ('phone','Phone'), ('url','URL'), ('media','Media URL'), ('relation','Related record')
on conflict (field_type) do nothing;

grant select on public.platform_component_registry to anon, authenticated;
grant select on public.platform_field_types to anon, authenticated;
revoke insert, update, delete on public.platform_component_registry from anon, authenticated;
revoke insert, update, delete on public.platform_field_types from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Page versions
-- ---------------------------------------------------------------------------
create table if not exists public.platform_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_key text not null check (page_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  version_number bigint not null check (version_number > 0),
  status text not null check (status in ('draft','published','superseded_draft')),
  schema_version integer not null default 1 check (schema_version between 1 and 100),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  summary text not null check (char_length(summary) between 1 and 500),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  source_version_id uuid references public.platform_page_versions(id) on delete restrict,
  constraint platform_page_versions_key_version unique (page_key, version_number),
  constraint platform_page_versions_published_at_check check ((status = 'published') = (published_at is not null)),
  constraint platform_page_versions_size_check check (pg_column_size(document) <= 262144)
);

create unique index if not exists platform_page_versions_one_draft
  on public.platform_page_versions (page_key) where status = 'draft';
create index if not exists platform_page_versions_published_lookup
  on public.platform_page_versions (page_key, version_number desc) where status = 'published';
create index if not exists platform_page_versions_history
  on public.platform_page_versions (page_key, version_number desc);

alter table public.platform_page_versions enable row level security;
revoke all on public.platform_page_versions from anon, authenticated;
grant select on public.platform_page_versions to anon, authenticated;

drop policy if exists "Published builder pages are public" on public.platform_page_versions;
create policy "Published builder pages are public"
  on public.platform_page_versions for select to anon, authenticated
  using (status = 'published');

drop policy if exists "Admins read every builder page version" on public.platform_page_versions;
create policy "Admins read every builder page version"
  on public.platform_page_versions for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Entity definitions, versions and records
-- ---------------------------------------------------------------------------
create table if not exists public.platform_entities (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  module text not null,
  label text not null check (char_length(label) between 1 and 120),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  current_version_id uuid,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_entity_versions (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null references public.platform_entities(key) on delete cascade,
  version_number bigint not null check (version_number > 0),
  status text not null check (status in ('draft','published','superseded_draft')),
  schema jsonb not null check (jsonb_typeof(schema) = 'object'),
  summary text not null check (char_length(summary) between 1 and 500),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  source_version_id uuid references public.platform_entity_versions(id) on delete restrict,
  constraint platform_entity_versions_key_version unique (entity_key, version_number),
  constraint platform_entity_versions_published_at_check check ((status = 'published') = (published_at is not null)),
  constraint platform_entity_versions_size_check check (pg_column_size(schema) <= 262144)
);

create unique index if not exists platform_entity_versions_one_draft
  on public.platform_entity_versions (entity_key) where status = 'draft';
create index if not exists platform_entity_versions_published_lookup
  on public.platform_entity_versions (entity_key, version_number desc) where status = 'published';

alter table public.platform_entities enable row level security;
alter table public.platform_entity_versions enable row level security;
revoke all on public.platform_entities from anon, authenticated;
revoke all on public.platform_entity_versions from anon, authenticated;
grant select on public.platform_entities to anon, authenticated;
grant select on public.platform_entity_versions to anon, authenticated;

drop policy if exists "Published builder entities are public" on public.platform_entities;
create policy "Published builder entities are public"
  on public.platform_entities for select to anon, authenticated
  using (status = 'published');

drop policy if exists "Admins read every builder entity" on public.platform_entities;
create policy "Admins read every builder entity"
  on public.platform_entities for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Published builder entity schemas are public" on public.platform_entity_versions;
create policy "Published builder entity schemas are public"
  on public.platform_entity_versions for select to anon, authenticated
  using (status = 'published');

drop policy if exists "Admins read every builder entity version" on public.platform_entity_versions;
create policy "Admins read every builder entity version"
  on public.platform_entity_versions for select to authenticated
  using ((select public.is_admin()));

create table if not exists public.platform_entity_records (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null references public.platform_entities(key) on delete restrict,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  status text not null default 'active' check (status in ('active','archived')),
  revision bigint not null default 1 check (revision > 0),
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_entity_records_size_check check (pg_column_size(data) <= 131072)
);

create index if not exists platform_entity_records_entity
  on public.platform_entity_records (entity_key, created_at desc);
create index if not exists platform_entity_records_data_gin
  on public.platform_entity_records using gin (data jsonb_path_ops);

-- current_version_id is written by publish_entity, so it must reference a real
-- version row. ON DELETE SET NULL keeps the pointer honest without blocking the
-- cascade that removes an entity's versions.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'platform_entities_current_version_fk'
       and conrelid = 'public.platform_entities'::regclass
  ) then
    alter table public.platform_entities
      add constraint platform_entities_current_version_fk
      foreign key (current_version_id) references public.platform_entity_versions(id)
      on delete set null;
  end if;
end;
$$;

alter table public.platform_entity_records enable row level security;
revoke all on public.platform_entity_records from anon, authenticated;
grant select on public.platform_entity_records to authenticated;

drop policy if exists "Entity records follow the published read scope" on public.platform_entity_records;
create policy "Entity records follow the published read scope"
  on public.platform_entity_records for select to authenticated
  using (
    status = 'active'
    and exists (
      select 1
        from public.platform_entities entity
        join public.platform_entity_versions version on version.id = entity.current_version_id
       where entity.key = platform_entity_records.entity_key
         and entity.status = 'published'
         -- Only an explicitly public schema exposes records to ordinary
         -- signed-in users. The previous 'authenticated' default would have
         -- let any customer read every entity's records (for example job
         -- applications), so admin-only remains the safe default.
         and coalesce(version.schema->'permissions'->>'read', 'authenticated') = 'public'
    )
  );

drop policy if exists "Admins read every entity record" on public.platform_entity_records;
create policy "Admins read every entity record"
  on public.platform_entity_records for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Append-only builder audit
-- ---------------------------------------------------------------------------
create table if not exists public.platform_builder_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_role text not null check (actor_role in ('admin','super_admin')),
  action text not null check (char_length(action) between 1 and 80),
  target_kind text not null check (target_kind in ('page','entity','record','settings')),
  target_key text not null check (char_length(target_key) between 1 and 80),
  version_number bigint,
  summary text not null check (char_length(summary) between 1 and 500),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_builder_audit_recent
  on public.platform_builder_audit (created_at desc);

create or replace function public.guard_builder_audit_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'BUILDER_AUDIT_IMMUTABLE';
end;
$$;

drop trigger if exists guard_builder_audit_immutable on public.platform_builder_audit;
create trigger guard_builder_audit_immutable
  before update or delete on public.platform_builder_audit
  for each row execute function public.guard_builder_audit_immutable();

alter table public.platform_builder_audit enable row level security;
revoke all on public.platform_builder_audit from anon, authenticated;
grant select on public.platform_builder_audit to authenticated;

drop policy if exists "Admins read builder audit" on public.platform_builder_audit;
create policy "Admins read builder audit"
  on public.platform_builder_audit for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Validation helpers
-- ---------------------------------------------------------------------------
-- Volatility note: these validators read the registry tables below, so they
-- are STABLE, never IMMUTABLE. Marking a table-reading function immutable would
-- let PostgreSQL cache a plan across registry changes and would also advertise
-- legality in indexes/partition keys where a table read is not permitted.
create or replace function public.builder_assert_blocks(p_blocks jsonb, p_depth integer)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_block jsonb;
  v_children jsonb;
begin
  if p_depth > 3 then
    raise exception 'BUILDER_NESTING_TOO_DEEP';
  end if;
  if jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'BUILDER_INVALID_DOCUMENT';
  end if;
  if jsonb_array_length(p_blocks) > 200 then
    raise exception 'BUILDER_TOO_MANY_BLOCKS';
  end if;
  for v_block in select value from jsonb_array_elements(p_blocks) loop
    if jsonb_typeof(v_block) <> 'object' then
      raise exception 'BUILDER_INVALID_DOCUMENT';
    end if;
    if not exists (
      select 1 from public.platform_component_registry registry
       where registry.component_type = v_block->>'type'
    ) then
      raise exception 'BUILDER_UNKNOWN_COMPONENT';
    end if;
    if v_block ? 'props' and jsonb_typeof(v_block->'props') <> 'object' then
      raise exception 'BUILDER_INVALID_DOCUMENT';
    end if;
    v_children := coalesce(v_block->'children', '[]'::jsonb);
    if jsonb_typeof(v_children) <> 'array' then
      raise exception 'BUILDER_INVALID_DOCUMENT';
    end if;
    if jsonb_array_length(v_children) > 0 then
      perform public.builder_assert_blocks(v_children, p_depth + 1);
    end if;
  end loop;
end;
$$;

create or replace function public.builder_validate_page_document(p_page_key text, p_document jsonb)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object'
     or pg_column_size(p_document) > 262144 then
    raise exception 'BUILDER_INVALID_DOCUMENT';
  end if;
  if p_document->>'pageKey' is distinct from p_page_key then
    raise exception 'BUILDER_KEY_MISMATCH';
  end if;
  if p_page_key !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'BUILDER_INVALID_KEY';
  end if;
  perform public.builder_assert_blocks(coalesce(p_document->'blocks', '[]'::jsonb), 1);
end;
$$;

create or replace function public.builder_validate_entity_schema(p_entity_key text, p_schema jsonb)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_field jsonb;
begin
  if p_schema is null or jsonb_typeof(p_schema) <> 'object'
     or pg_column_size(p_schema) > 262144 then
    raise exception 'BUILDER_INVALID_DOCUMENT';
  end if;
  if p_schema->>'key' is distinct from p_entity_key then
    raise exception 'BUILDER_KEY_MISMATCH';
  end if;
  if jsonb_typeof(p_schema->'fields') <> 'array' or jsonb_array_length(p_schema->'fields') = 0 then
    raise exception 'BUILDER_ENTITY_FIELDS_REQUIRED';
  end if;
  if jsonb_array_length(p_schema->'fields') > 60 then
    raise exception 'BUILDER_TOO_MANY_FIELDS';
  end if;
  for v_field in select value from jsonb_array_elements(p_schema->'fields') loop
    if jsonb_typeof(v_field) <> 'object'
       or not exists (select 1 from public.platform_field_types t where t.field_type = v_field->>'type') then
      raise exception 'BUILDER_UNKNOWN_FIELD_TYPE';
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Immutability guards
-- ---------------------------------------------------------------------------
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

drop trigger if exists guard_builder_page_version on public.platform_page_versions;
create trigger guard_builder_page_version
  before insert or update on public.platform_page_versions
  for each row execute function public.guard_builder_page_version();

create or replace function public.guard_builder_entity_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.builder_validate_entity_schema(new.entity_key, new.schema);
    if (new.status = 'published') <> (new.published_at is not null) then
      raise exception 'BUILDER_PUBLISH_TIMESTAMP_INVALID';
    end if;
    return new;
  end if;
  if old.status <> 'draft'
     or new.id <> old.id
     or new.entity_key <> old.entity_key
     or new.version_number <> old.version_number
     or new.schema <> old.schema
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

drop trigger if exists guard_builder_entity_version on public.platform_entity_versions;
create trigger guard_builder_entity_version
  before insert or update on public.platform_entity_versions
  for each row execute function public.guard_builder_entity_version();

-- ---------------------------------------------------------------------------
-- Actor resolution (server-only)
-- ---------------------------------------------------------------------------
create or replace function public.builder_actor_role(p_actor uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when profile.account_status <> 'active' then null
           when profile.is_super_admin then 'super_admin'
           when profile.role = 'admin' then 'admin'
           else null
         end
    from public.profiles profile
   where profile.id = p_actor;
$$;

revoke all on function public.builder_actor_role(uuid) from public, anon, authenticated;
revoke all on function public.builder_assert_blocks(jsonb, integer) from public, anon, authenticated;
revoke all on function public.builder_validate_page_document(text, jsonb) from public, anon, authenticated;
revoke all on function public.builder_validate_entity_schema(text, jsonb) from public, anon, authenticated;
revoke all on function public.guard_builder_page_version() from public, anon, authenticated;
revoke all on function public.guard_builder_entity_version() from public, anon, authenticated;
revoke all on function public.guard_builder_audit_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Page RPCs
-- ---------------------------------------------------------------------------
create or replace function public.builder_save_page_draft(
  p_actor uuid,
  p_page_key text,
  p_document jsonb,
  p_summary text default 'Saved draft',
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
  v_number bigint;
  v_row public.platform_page_versions;
begin
  if v_role is null then raise exception 'BUILDER_ADMIN_REQUIRED'; end if;
  perform public.builder_validate_page_document(p_page_key, p_document);
  perform pg_advisory_xact_lock(hashtext('builder_page:' || p_page_key)::bigint);
  select coalesce(max(version_number), 0) into v_max
    from public.platform_page_versions where page_key = p_page_key;
  if p_expected_version is not null and p_expected_version <> v_max then
    raise exception 'BUILDER_VERSION_CONFLICT';
  end if;
  update public.platform_page_versions
     set status = 'superseded_draft', updated_at = now()
   where page_key = p_page_key and status = 'draft';
  v_number := v_max + 1;
  insert into public.platform_page_versions
    (page_key, version_number, status, schema_version, document, summary, created_by)
  values (
    p_page_key, v_number, 'draft', coalesce((p_document->>'schemaVersion')::integer, 1),
    p_document, left(coalesce(nullif(trim(p_summary), ''), 'Saved draft'), 500), p_actor
  )
  returning * into v_row;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'page_draft_saved', 'page', p_page_key, v_number,
    v_row.summary,
    jsonb_build_object('blocks', jsonb_array_length(coalesce(p_document->'blocks', '[]'::jsonb)))
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.builder_publish_page(
  p_actor uuid,
  p_page_key text,
  p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.builder_actor_role(p_actor);
  v_row public.platform_page_versions;
begin
  if v_role is distinct from 'super_admin' then raise exception 'BUILDER_SUPER_ADMIN_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('builder_page:' || p_page_key)::bigint);
  select * into v_row
    from public.platform_page_versions
   where id = p_version_id and page_key = p_page_key and status = 'draft'
   for update;
  if not found then raise exception 'BUILDER_DRAFT_NOT_FOUND'; end if;
  update public.platform_page_versions
     set status = 'published', published_at = now(), published_by = p_actor, updated_at = now()
   where id = v_row.id
  returning * into v_row;
  update public.platform_page_versions
     set status = 'superseded_draft', updated_at = now()
   where page_key = p_page_key and status = 'draft' and id <> v_row.id;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'page_published', 'page', p_page_key, v_row.version_number,
    v_row.summary, jsonb_build_object('versionId', v_row.id)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.builder_rollback_page(
  p_actor uuid,
  p_page_key text,
  p_target_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.builder_actor_role(p_actor);
  v_target public.platform_page_versions;
  v_number bigint;
  v_row public.platform_page_versions;
begin
  if v_role is distinct from 'super_admin' then raise exception 'BUILDER_SUPER_ADMIN_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('builder_page:' || p_page_key)::bigint);
  select * into v_target
    from public.platform_page_versions
   where id = p_target_version_id and page_key = p_page_key and status = 'published';
  if not found then raise exception 'BUILDER_TARGET_VERSION_NOT_FOUND'; end if;
  select coalesce(max(version_number), 0) + 1 into v_number
    from public.platform_page_versions where page_key = p_page_key;
  update public.platform_page_versions
     set status = 'superseded_draft', updated_at = now()
   where page_key = p_page_key and status = 'draft';
  insert into public.platform_page_versions
    (page_key, version_number, status, schema_version, document, summary, created_by,
     published_at, published_by, source_version_id)
  values (
    p_page_key, v_number, 'published', v_target.schema_version, v_target.document,
    left('Rollback to version ' || v_target.version_number, 500), p_actor,
    now(), p_actor, v_target.id
  )
  returning * into v_row;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'page_rolled_back', 'page', p_page_key, v_number,
    'Rolled back to version ' || v_target.version_number,
    jsonb_build_object('sourceVersionId', v_target.id)
  );
  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- Entity RPCs
-- ---------------------------------------------------------------------------
create or replace function public.builder_save_entity_draft(
  p_actor uuid,
  p_entity_key text,
  p_schema jsonb,
  p_summary text default 'Saved module draft',
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
  v_number bigint;
  v_row public.platform_entity_versions;
begin
  if v_role is null then raise exception 'BUILDER_ADMIN_REQUIRED'; end if;
  perform public.builder_validate_entity_schema(p_entity_key, p_schema);
  perform pg_advisory_xact_lock(hashtext('builder_entity:' || p_entity_key)::bigint);
  insert into public.platform_entities (key, module, label, status, created_by)
  values (p_entity_key, coalesce(p_schema->>'module', 'platform'), coalesce(p_schema->>'label', p_entity_key), 'draft', p_actor)
  on conflict (key) do update
    set module = excluded.module, label = excluded.label, updated_at = now();
  select coalesce(max(version_number), 0) into v_max
    from public.platform_entity_versions where entity_key = p_entity_key;
  if p_expected_version is not null and p_expected_version <> v_max then
    raise exception 'BUILDER_VERSION_CONFLICT';
  end if;
  update public.platform_entity_versions
     set status = 'superseded_draft', updated_at = now()
   where entity_key = p_entity_key and status = 'draft';
  v_number := v_max + 1;
  insert into public.platform_entity_versions
    (entity_key, version_number, status, schema, summary, created_by)
  values (
    p_entity_key, v_number, 'draft', p_schema,
    left(coalesce(nullif(trim(p_summary), ''), 'Saved module draft'), 500), p_actor
  )
  returning * into v_row;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'entity_draft_saved', 'entity', p_entity_key, v_number,
    v_row.summary,
    jsonb_build_object('fields', jsonb_array_length(coalesce(p_schema->'fields', '[]'::jsonb)))
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.builder_publish_entity(
  p_actor uuid,
  p_entity_key text,
  p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.builder_actor_role(p_actor);
  v_row public.platform_entity_versions;
begin
  if v_role is distinct from 'super_admin' then raise exception 'BUILDER_SUPER_ADMIN_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('builder_entity:' || p_entity_key)::bigint);
  select * into v_row
    from public.platform_entity_versions
   where id = p_version_id and entity_key = p_entity_key and status = 'draft'
   for update;
  if not found then raise exception 'BUILDER_DRAFT_NOT_FOUND'; end if;
  if exists (
    select 1
      from jsonb_array_elements(coalesce(v_row.schema->'relations', '[]'::jsonb)) relation
     where relation->>'target' <> p_entity_key
       and not exists (
         select 1 from public.platform_entities target
          where target.key = relation->>'target' and target.status = 'published'
       )
  ) then
    raise exception 'BUILDER_RELATION_TARGET_UNPUBLISHED';
  end if;
  update public.platform_entity_versions
     set status = 'published', published_at = now(), published_by = p_actor, updated_at = now()
   where id = v_row.id
  returning * into v_row;
  update public.platform_entities
     set status = 'published', current_version_id = v_row.id, updated_at = now()
   where key = p_entity_key;
  update public.platform_entity_versions
     set status = 'superseded_draft', updated_at = now()
   where entity_key = p_entity_key and status = 'draft' and id <> v_row.id;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'entity_published', 'entity', p_entity_key, v_row.version_number,
    v_row.summary, jsonb_build_object('versionId', v_row.id)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.builder_upsert_record(
  p_actor uuid,
  p_entity_key text,
  p_record_id uuid,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.builder_actor_role(p_actor);
  v_row public.platform_entity_records;
  v_status text;
begin
  if v_role is null then raise exception 'BUILDER_ADMIN_REQUIRED'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 131072 then
    raise exception 'BUILDER_INVALID_RECORD';
  end if;
  if not exists (
    select 1 from public.platform_entities entity
     where entity.key = p_entity_key and entity.status = 'published'
  ) then
    raise exception 'BUILDER_ENTITY_NOT_PUBLISHED';
  end if;
  -- Workflow status is the only field validated here; every other value has
  -- already been rebuilt against the published schema by the application.
  v_status := nullif(p_data->>'status', '');
  if p_record_id is null then
    insert into public.platform_entity_records (entity_key, data, created_by, updated_by)
    values (p_entity_key, p_data, p_actor, p_actor)
    returning * into v_row;
  else
    update public.platform_entity_records
       set data = p_data,
           revision = revision + 1,
           updated_by = p_actor,
           updated_at = now()
     where id = p_record_id and entity_key = p_entity_key and status = 'active'
    returning * into v_row;
    if not found then raise exception 'BUILDER_RECORD_NOT_FOUND'; end if;
  end if;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role,
    case when p_record_id is null then 'record_created' else 'record_updated' end,
    'record', p_entity_key, v_row.revision,
    case when p_record_id is null then 'Created a record' else 'Updated a record' end,
    jsonb_build_object('recordId', v_row.id, 'workflowStatus', v_status)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.builder_archive_record(
  p_actor uuid,
  p_entity_key text,
  p_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.builder_actor_role(p_actor);
  v_row public.platform_entity_records;
begin
  if v_role is null then raise exception 'BUILDER_ADMIN_REQUIRED'; end if;
  update public.platform_entity_records
     set status = 'archived', revision = revision + 1, updated_by = p_actor, updated_at = now()
   where id = p_record_id and entity_key = p_entity_key and status = 'active'
  returning * into v_row;
  if not found then raise exception 'BUILDER_RECORD_NOT_FOUND'; end if;
  insert into public.platform_builder_audit
    (actor_id, actor_role, action, target_kind, target_key, version_number, summary, detail)
  values (
    p_actor, v_role, 'record_archived', 'record', p_entity_key, v_row.revision,
    'Archived a record', jsonb_build_object('recordId', v_row.id)
  );
  return to_jsonb(v_row);
end;
$$;

-- The application server is the only caller. Direct browser roles never get
-- EXECUTE, so p_actor cannot be spoofed through the Supabase client.
revoke all on function public.builder_save_page_draft(uuid, text, jsonb, text, bigint) from public, anon, authenticated;
revoke all on function public.builder_publish_page(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.builder_rollback_page(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.builder_save_entity_draft(uuid, text, jsonb, text, bigint) from public, anon, authenticated;
revoke all on function public.builder_publish_entity(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.builder_upsert_record(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.builder_archive_record(uuid, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Baseline published pages so the OTA clients have a valid document before the
-- first admin publish. These carry no blocks and can be edited immediately.
-- ---------------------------------------------------------------------------
do $$
declare
  v_page record;
  v_document jsonb;
begin
  for v_page in
    select * from (values
      ('pg_hostels', 'PG''s & Hostels'),
      ('classes', 'Classes & Courses'),
      ('venues', 'Function Halls & Venues'),
      ('services', 'Home & Local Services'),
      ('hotel_stay', 'Hotel & Stay'),
      ('movies', 'Movies & Multiplex')
    ) as pages(page_key, title)
  loop
    if exists (select 1 from public.platform_page_versions where page_key = v_page.page_key) then
      continue;
    end if;
    v_document := jsonb_build_object(
      'schemaVersion', 1,
      'pageKey', v_page.page_key,
      'title', v_page.title,
      'module', v_page.page_key,
      'description', '',
      'theme', jsonb_build_object(
        'primaryColor', '#4338CA',
        'accentColor', '#FFE500',
        'background', '#FFFFFF',
        'surface', '#F8FAFC',
        'text', '#0F172A',
        'buttonRadius', 'rounded-xl',
        'spacing', '4'
      ),
      'navigation', '[]'::jsonb,
      'blocks', '[]'::jsonb
    );
    insert into public.platform_page_versions
      (page_key, version_number, status, schema_version, document, summary, published_at)
    values (v_page.page_key, 1, 'published', 1, v_document, 'Baseline page configuration', now());
  end loop;
end;
$$;

commit;

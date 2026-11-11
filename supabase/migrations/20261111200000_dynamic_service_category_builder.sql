-- ============================================================================
-- Dynamic Service Category Builder.
--
-- The three delivery services (Human Help, Medicine Delivery and Water Bottle
-- Delivery) keep their existing booking, tracking, OTP and RLS tables. This
-- migration adds a Super-Admin-managed catalog on top of them:
--
--   * append-only category configuration versions with draft/publish/rollback,
--   * tenant-scoped, append-only audit history,
--   * custom booking fields and required documents,
--   * licensed-pharmacy credentials and prescription review,
--   * config-driven tracking/OTP/delivery-confirmation switches.
--
-- Medicine is a regulated category. Its licensed-pharmacy and prescription
-- requirements are applied inside the database (save, insert and review paths)
-- so disabling an admin toggle can never remove them.
--
-- Additive only: no existing booking, listing, profile or payment row is
-- rewritten, and no hosted project is modified by this file.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Small, auditable helpers.
-- ---------------------------------------------------------------------------
create or replace function public.service_catalog_current_tenant()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.tenant_id', true), ''), 'default');
$$;

grant execute on function public.service_catalog_current_tenant() to anon, authenticated, service_role;

create or replace function public.service_catalog_actor_role(p_actor uuid)
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

revoke all on function public.service_catalog_actor_role(uuid) from public, anon, authenticated;
grant execute on function public.service_catalog_actor_role(uuid) to service_role;

-- Medicine detection is deliberately independent of the admin-controlled
-- toggles. Renaming the category cannot decouple it from its legal duties.
create or replace function public.service_catalog_is_medicine(p_category_id text, p_config jsonb)
returns boolean
language sql
immutable
as $$
  select
    coalesce(lower(p_category_id), '') ~ '(medicine|pharmacy|prescription|drug)'
    or coalesce(lower(p_config->>'deliveryKind'), '') = 'medicine_delivery'
    or coalesce(lower(p_config->>'name'), '') ~ '(medicine|pharmacy|prescription|drug)'
    or coalesce((p_config->>'requiresLicensedPharmacy')::boolean, false);
$$;

create or replace function public.service_catalog_apply_hard_rules(p_category_id text, p_config jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_config jsonb := coalesce(p_config, '{}'::jsonb);
  v_docs jsonb;
  v_result jsonb := '[]'::jsonb;
  v_doc jsonb;
  v_found boolean := false;
  v_prescription jsonb := jsonb_build_object(
    'key', 'prescription',
    'label', 'Doctor prescription',
    'required', true,
    'verificationRequired', true,
    'acceptedTypes', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png')
  );
begin
  if not public.service_catalog_is_medicine(p_category_id, v_config) then
    return v_config;
  end if;

  if jsonb_typeof(v_config->'toggles') <> 'object' then
    v_config := jsonb_set(v_config, '{toggles}', '{}'::jsonb, true);
  end if;
  if jsonb_typeof(v_config->'approvalWorkflow') <> 'object' then
    v_config := jsonb_set(v_config, '{approvalWorkflow}', '{}'::jsonb, true);
  end if;
  if jsonb_typeof(v_config->'documents') <> 'array' then
    v_config := jsonb_set(v_config, '{documents}', '[]'::jsonb, true);
  end if;

  v_config := jsonb_set(v_config, '{deliveryKind}', '"medicine_delivery"'::jsonb, true);
  v_config := jsonb_set(v_config, '{requiresLicensedPharmacy}', 'true'::jsonb, true);
  v_config := jsonb_set(v_config, '{toggles,prescriptionVerification}', 'true'::jsonb, true);
  v_config := jsonb_set(v_config, '{toggles,documentVerification}', 'true'::jsonb, true);
  v_config := jsonb_set(v_config, '{approvalWorkflow,requiresDocumentVerification}', 'true'::jsonb, true);

  for v_doc in select value from jsonb_array_elements(v_config->'documents') loop
    if v_doc->>'key' = 'prescription' then
      v_found := true;
      v_doc := v_doc || jsonb_build_object('required', true, 'verificationRequired', true);
      if jsonb_typeof(v_doc->'acceptedTypes') <> 'array' or jsonb_array_length(v_doc->'acceptedTypes') = 0 then
        v_doc := v_doc || jsonb_build_object('acceptedTypes', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png'));
      end if;
    end if;
    v_result := v_result || jsonb_build_array(v_doc);
  end loop;

  if not v_found then
    v_result := v_result || jsonb_build_array(v_prescription);
  end if;

  return jsonb_set(v_config, '{documents}', v_result, true);
end;
$$;

create or replace function public.service_catalog_validate_config(p_category_id text, p_config jsonb)
returns void
language plpgsql
immutable
as $$
declare
  v_key text;
  v_field jsonb;
  v_document jsonb;
  v_mode text;
  v_amount numeric;
  v_keys text[] := array['name','description','icon','imageUrl','accentColor','deliveryKind','bookingType',
                         'providerAssignment','deliveryModes','pricing','recurring','toggles','fields','documents',
                         'approvalWorkflow','validation','legacyCategoryIds','requiresLicensedPharmacy','schemaVersion'];
  v_field_types text[] := array['text','textarea','number','select','multiselect','checkbox','date','phone','email','document'];
begin
  if p_category_id is null or p_category_id !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'SERVICE_CATALOG_INVALID_KEY';
  end if;
  if jsonb_typeof(p_config) <> 'object' then
    raise exception 'SERVICE_CATALOG_INVALID_CONFIG';
  end if;
  if pg_column_size(p_config) > 65536 then
    raise exception 'SERVICE_CATALOG_CONFIG_TOO_LARGE';
  end if;
  if coalesce(p_config->>'schemaVersion', '1') !~ '^[0-9]+$'
     or (p_config->>'schemaVersion')::integer not between 1 and 100 then
    raise exception 'SERVICE_CATALOG_SCHEMA_UNSUPPORTED';
  end if;
  for v_key in select jsonb_object_keys(p_config) loop
    if not (v_key = any (v_keys)) then
      raise exception 'SERVICE_CATALOG_UNKNOWN_FIELD';
    end if;
  end loop;

  if length(trim(coalesce(p_config->>'name', ''))) not between 1 and 120 then
    raise exception 'SERVICE_CATALOG_INVALID_NAME';
  end if;
  if length(coalesce(p_config->>'description', '')) > 500 then
    raise exception 'SERVICE_CATALOG_INVALID_DESCRIPTION';
  end if;
  if coalesce(p_config->>'icon', '') !~ '^[a-z][a-z0-9-]{1,39}$' then
    raise exception 'SERVICE_CATALOG_INVALID_ICON';
  end if;
  if not (coalesce(p_config->>'imageUrl', '') = ''
          or (coalesce(p_config->>'imageUrl', '') ~ '^https://[^\s]+$' and length(p_config->>'imageUrl') <= 2048
              and coalesce(p_config->>'imageUrl', '') !~* '^(data|javascript|file|vbscript):')) then
    raise exception 'SERVICE_CATALOG_INVALID_IMAGE';
  end if;
  if not (coalesce(p_config->>'accentColor', '') = '' or coalesce(p_config->>'accentColor', '') ~ '^#[0-9A-Fa-f]{6}$') then
    raise exception 'SERVICE_CATALOG_INVALID_COLOR';
  end if;
  if coalesce(p_config->>'deliveryKind', '') not in ('human_help', 'medicine_delivery', 'water_delivery') then
    raise exception 'SERVICE_CATALOG_INVALID_DELIVERY_KIND';
  end if;
  if coalesce(p_config->>'bookingType', '') not in ('on_demand', 'scheduled', 'recurring') then
    raise exception 'SERVICE_CATALOG_INVALID_BOOKING_TYPE';
  end if;
  if coalesce(p_config->>'providerAssignment', '') not in ('customer_selects', 'platform_managed', 'admin_assigns') then
    raise exception 'SERVICE_CATALOG_INVALID_ASSIGNMENT';
  end if;
  if jsonb_typeof(p_config->'deliveryModes') is distinct from 'array'
     or jsonb_array_length(p_config->'deliveryModes') not between 1 and 4
     or exists (select 1 from jsonb_array_elements_text(p_config->'deliveryModes') as mode(value)
                 where value not in ('on_site', 'home_delivery', 'pickup', 'digital')) then
    raise exception 'SERVICE_CATALOG_INVALID_DELIVERY_MODES';
  end if;

  if jsonb_typeof(p_config->'pricing') is distinct from 'object' then
    raise exception 'SERVICE_CATALOG_INVALID_PRICING';
  end if;
  v_mode := coalesce(p_config->'pricing'->>'mode', '');
  if v_mode not in ('fixed', 'per_unit', 'quote') then
    raise exception 'SERVICE_CATALOG_INVALID_PRICING';
  end if;
  if coalesce(p_config->'pricing'->>'currency', 'INR') <> 'INR' then
    raise exception 'SERVICE_CATALOG_INVALID_PRICING';
  end if;
  if v_mode <> 'quote' then
    v_amount := coalesce((p_config->'pricing'->>'amount')::numeric, -1);
    if v_amount < 0 or v_amount > 10000000 then
      raise exception 'SERVICE_CATALOG_INVALID_PRICING';
    end if;
  end if;
  if length(coalesce(p_config->'pricing'->>'unit', '')) > 40 then
    raise exception 'SERVICE_CATALOG_INVALID_PRICING';
  end if;
  if coalesce((p_config->'pricing'->>'minQuantity')::integer, 1) not between 1 and 999
     or coalesce((p_config->'pricing'->>'maxQuantity')::integer, 1) not between 1 and 999
     or coalesce((p_config->'pricing'->>'maxQuantity')::integer, 1) < coalesce((p_config->'pricing'->>'minQuantity')::integer, 1) then
    raise exception 'SERVICE_CATALOG_INVALID_QUANTITY';
  end if;

  if jsonb_typeof(p_config->'recurring') is distinct from 'object' then
    raise exception 'SERVICE_CATALOG_INVALID_RECURRING';
  end if;
  if coalesce((p_config->'recurring'->>'maxOccurrences')::integer, 1) not between 1 and 365 then
    raise exception 'SERVICE_CATALOG_INVALID_RECURRING';
  end if;
  if jsonb_typeof(p_config->'recurring'->'frequencies') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements_text(p_config->'recurring'->'frequencies') as frequency(value)
                 where value not in ('daily', 'weekly', 'monthly')) then
    raise exception 'SERVICE_CATALOG_INVALID_RECURRING';
  end if;

  if jsonb_typeof(p_config->'toggles') is distinct from 'object' then
    raise exception 'SERVICE_CATALOG_INVALID_TOGGLES';
  end if;
  for v_key in select jsonb_object_keys(p_config->'toggles') loop
    if v_key not in ('gpsTracking','liveMap','customerOtp','prescriptionVerification','documentVerification','payment','deliveryConfirmation') then
      raise exception 'SERVICE_CATALOG_INVALID_TOGGLES';
    end if;
    if jsonb_typeof(p_config->'toggles'->v_key) <> 'boolean' then
      raise exception 'SERVICE_CATALOG_INVALID_TOGGLES';
    end if;
  end loop;

  if jsonb_typeof(p_config->'fields') is distinct from 'array' or jsonb_array_length(p_config->'fields') > 40 then
    raise exception 'SERVICE_CATALOG_TOO_MANY_FIELDS';
  end if;
  for v_field in select value from jsonb_array_elements(p_config->'fields') loop
    if coalesce(v_field->>'key', '') !~ '^[a-z][a-zA-Z0-9_]{1,39}$' then
      raise exception 'SERVICE_CATALOG_INVALID_FIELD_KEY';
    end if;
    if length(trim(coalesce(v_field->>'label', ''))) not between 1 and 120 then
      raise exception 'SERVICE_CATALOG_INVALID_FIELD_LABEL';
    end if;
    if coalesce(v_field->>'type', '') <> all (v_field_types) then
      raise exception 'SERVICE_CATALOG_INVALID_FIELD_TYPE';
    end if;
    if jsonb_typeof(coalesce(v_field->'required', 'false'::jsonb)) <> 'boolean' then
      raise exception 'SERVICE_CATALOG_INVALID_FIELD_REQUIRED';
    end if;
    if coalesce((v_field->>'maxLength')::integer, 0) not between 0 and 4000 then
      raise exception 'SERVICE_CATALOG_INVALID_FIELD_LENGTH';
    end if;
    if v_field->>'type' in ('select', 'multiselect') then
      if jsonb_typeof(v_field->'options') is distinct from 'array'
         or jsonb_array_length(v_field->'options') not between 1 and 60 then
        raise exception 'SERVICE_CATALOG_INVALID_FIELD_OPTIONS';
      end if;
      if exists (select 1 from jsonb_array_elements_text(v_field->'options') as option(value) where length(trim(value)) not between 1 and 80) then
        raise exception 'SERVICE_CATALOG_INVALID_FIELD_OPTIONS';
      end if;
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_config->'fields') as field(value))
     <> (select count(distinct value->>'key') from jsonb_array_elements(p_config->'fields') as field(value)) then
    raise exception 'SERVICE_CATALOG_DUPLICATE_FIELD_KEY';
  end if;

  if jsonb_typeof(p_config->'documents') is distinct from 'array' or jsonb_array_length(p_config->'documents') > 20 then
    raise exception 'SERVICE_CATALOG_TOO_MANY_DOCUMENTS';
  end if;
  for v_document in select value from jsonb_array_elements(p_config->'documents') loop
    if coalesce(v_document->>'key', '') !~ '^[a-z][a-zA-Z0-9_]{1,39}$' then
      raise exception 'SERVICE_CATALOG_INVALID_DOCUMENT_KEY';
    end if;
    if length(trim(coalesce(v_document->>'label', ''))) not between 1 and 120 then
      raise exception 'SERVICE_CATALOG_INVALID_DOCUMENT_LABEL';
    end if;
    if jsonb_typeof(coalesce(v_document->'required', 'false'::jsonb)) <> 'boolean'
       or jsonb_typeof(coalesce(v_document->'verificationRequired', 'false'::jsonb)) <> 'boolean' then
      raise exception 'SERVICE_CATALOG_INVALID_DOCUMENT_FLAGS';
    end if;
    if jsonb_typeof(coalesce(v_document->'acceptedTypes', '[]'::jsonb)) <> 'array' then
      raise exception 'SERVICE_CATALOG_INVALID_DOCUMENT_TYPES';
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_config->'documents') as document(value))
     <> (select count(distinct value->>'key') from jsonb_array_elements(p_config->'documents') as document(value)) then
    raise exception 'SERVICE_CATALOG_DUPLICATE_DOCUMENT_KEY';
  end if;

  if jsonb_typeof(p_config->'approvalWorkflow') is distinct from 'object' then
    raise exception 'SERVICE_CATALOG_INVALID_APPROVAL';
  end if;
  if jsonb_typeof(p_config->'validation') is distinct from 'object' then
    raise exception 'SERVICE_CATALOG_INVALID_VALIDATION';
  end if;
  if coalesce((p_config->'validation'->>'maxAdvanceDays')::integer, 30) not between 1 and 365
     or coalesce((p_config->'validation'->>'minLeadTimeMinutes')::integer, 0) not between 0 and 10080 then
    raise exception 'SERVICE_CATALOG_INVALID_VALIDATION';
  end if;
  if jsonb_typeof(p_config->'legacyCategoryIds') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements_text(p_config->'legacyCategoryIds') as legacy(value)
                 where value !~ '^[a-zA-Z0-9_-]{1,80}$') then
    raise exception 'SERVICE_CATALOG_INVALID_LEGACY_IDS';
  end if;
end;
$$;

revoke all on function public.service_catalog_is_medicine(text, jsonb) from public, anon, authenticated;
revoke all on function public.service_catalog_apply_hard_rules(text, jsonb) from public, anon, authenticated;
revoke all on function public.service_catalog_validate_config(text, jsonb) from public, anon, authenticated;
grant execute on function public.service_catalog_is_medicine(text, jsonb) to service_role;
grant execute on function public.service_catalog_apply_hard_rules(text, jsonb) to service_role;
grant execute on function public.service_catalog_validate_config(text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Category heads and append-only versions.
-- ---------------------------------------------------------------------------
create table if not exists public.service_category_configs (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,40}$'),
  tenant_id text not null default 'default' check (tenant_id ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  enabled boolean not null default false,
  current_version_id uuid,
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_category_configs_tenant
  on public.service_category_configs (tenant_id, enabled, updated_at desc);

create table if not exists public.service_category_config_versions (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references public.service_category_configs(id) on delete cascade,
  tenant_id text not null,
  version_number bigint not null check (version_number > 0),
  status text not null check (status in ('draft', 'published', 'superseded_draft')),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  summary text not null check (char_length(summary) between 1 and 500),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  source_version_id uuid references public.service_category_config_versions(id) on delete restrict,
  constraint service_category_config_versions_key_version unique (category_id, version_number),
  constraint service_category_config_versions_published_check check ((status = 'published') = (published_at is not null)),
  constraint service_category_config_versions_size_check check (pg_column_size(config) <= 65536)
);

create unique index if not exists service_category_config_versions_one_draft
  on public.service_category_config_versions (category_id) where status = 'draft';
create index if not exists service_category_config_versions_published
  on public.service_category_config_versions (category_id, version_number desc) where status = 'published';
create index if not exists service_category_config_versions_tenant
  on public.service_category_config_versions (tenant_id, category_id, version_number desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'service_category_configs_current_version_fk'
       and conrelid = 'public.service_category_configs'::regclass
  ) then
    alter table public.service_category_configs
      add constraint service_category_configs_current_version_fk
      foreign key (current_version_id) references public.service_category_config_versions(id)
      on delete set null;
  end if;
end;
$$;

create table if not exists public.service_category_config_audit (
  id bigint generated always as identity primary key,
  tenant_id text not null default 'default',
  category_id text not null,
  version_number bigint,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('super_admin', 'admin', 'system')),
  action text not null check (action in (
    'category_created', 'draft_saved', 'category_published', 'category_rolled_back',
    'category_enabled', 'category_disabled', 'document_reviewed', 'credential_reviewed',
    'booking_assigned'
  )),
  summary text not null check (char_length(summary) between 1 and 500),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_category_config_audit_category
  on public.service_category_config_audit (tenant_id, category_id, created_at desc);

create or replace function public.service_catalog_guard_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant text;
begin
  if tg_op = 'INSERT' then
    select tenant_id into v_tenant from public.service_category_configs where id = new.category_id;
    if v_tenant is null or v_tenant <> new.tenant_id then
      raise exception 'SERVICE_CATALOG_TENANT_MISMATCH';
    end if;
    new.config := public.service_catalog_apply_hard_rules(new.category_id, new.config);
    perform public.service_catalog_validate_config(new.category_id, new.config);
    if (new.status = 'published') <> (new.published_at is not null) then
      raise exception 'SERVICE_CATALOG_PUBLISH_TIMESTAMP_INVALID';
    end if;
    return new;
  end if;

  if old.status <> 'draft'
     or new.id <> old.id
     or new.category_id <> old.category_id
     or new.tenant_id <> old.tenant_id
     or new.version_number <> old.version_number
     or new.config <> old.config
     or new.summary <> old.summary
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at
     or new.source_version_id is distinct from old.source_version_id
     or new.status not in ('published', 'superseded_draft') then
    raise exception 'SERVICE_CATALOG_VERSION_IMMUTABLE';
  end if;
  if (new.status = 'published') <> (new.published_at is not null) then
    raise exception 'SERVICE_CATALOG_PUBLISH_TIMESTAMP_INVALID';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_service_category_version on public.service_category_config_versions;
create trigger guard_service_category_version
  before insert or update on public.service_category_config_versions
  for each row execute function public.service_catalog_guard_version();

create or replace function public.service_catalog_audit_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'SERVICE_CATALOG_AUDIT_IMMUTABLE';
end;
$$;

drop trigger if exists guard_service_category_audit on public.service_category_config_audit;
create trigger guard_service_category_audit
  before update or delete on public.service_category_config_audit
  for each row execute function public.service_catalog_audit_immutable();

revoke all on function public.service_catalog_guard_version() from public, anon, authenticated;
revoke all on function public.service_catalog_audit_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS: published/enabled configuration is public; drafts never are.
-- ---------------------------------------------------------------------------
alter table public.service_category_configs enable row level security;
alter table public.service_category_config_versions enable row level security;
alter table public.service_category_config_audit enable row level security;

revoke all on public.service_category_configs from public, anon, authenticated;
revoke all on public.service_category_config_versions from public, anon, authenticated;
revoke all on public.service_category_config_audit from public, anon, authenticated;
grant select on public.service_category_configs to anon, authenticated;
grant select on public.service_category_config_versions to anon, authenticated;
grant select on public.service_category_config_audit to authenticated;

drop policy if exists "Enabled service categories are public" on public.service_category_configs;
create policy "Enabled service categories are public"
  on public.service_category_configs for select to anon, authenticated
  using (
    enabled = true
    and tenant_id = public.service_catalog_current_tenant()
  );

drop policy if exists "Admins read every service category" on public.service_category_configs;
create policy "Admins read every service category"
  on public.service_category_configs for select to authenticated
  using (
    tenant_id = public.service_catalog_current_tenant()
    and public.is_admin()
  );

drop policy if exists "Published service category versions are public" on public.service_category_config_versions;
create policy "Published service category versions are public"
  on public.service_category_config_versions for select to anon, authenticated
  using (
    status = 'published'
    and tenant_id = public.service_catalog_current_tenant()
  );

drop policy if exists "Admins read every service category version" on public.service_category_config_versions;
create policy "Admins read every service category version"
  on public.service_category_config_versions for select to authenticated
  using (
    tenant_id = public.service_catalog_current_tenant()
    and public.is_admin()
  );

drop policy if exists "Admins read service catalog audit" on public.service_category_config_audit;
create policy "Admins read service catalog audit"
  on public.service_category_config_audit for select to authenticated
  using (
    tenant_id = public.service_catalog_current_tenant()
    and public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- 4. Provider credentials (medicine needs a verified pharmacy licence).
-- ---------------------------------------------------------------------------
create table if not exists public.service_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'default' check (tenant_id ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  category_id text references public.service_category_configs(id) on delete set null,
  credential_type text not null check (credential_type in ('pharmacy_license', 'professional_license', 'other')),
  license_number text not null check (char_length(trim(license_number)) between 3 and 120),
  issuing_authority text check (issuing_authority is null or char_length(issuing_authority) <= 160),
  expires_on date,
  document_reference text check (
    document_reference is null
    or (char_length(document_reference) between 8 and 2048 and document_reference ~ '^(storage://|https://)')
  ),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_provider_credentials_review_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('verified', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index if not exists uniq_service_provider_credential
  on public.service_provider_credentials (provider_id, credential_type, coalesce(category_id, ''));
create index if not exists idx_service_provider_credentials_queue
  on public.service_provider_credentials (tenant_id, status, created_at, id);

alter table public.service_provider_credentials enable row level security;
revoke all on public.service_provider_credentials from public, anon, authenticated;
grant select, insert on public.service_provider_credentials to authenticated;

drop policy if exists "Providers read their own credentials" on public.service_provider_credentials;
create policy "Providers read their own credentials"
  on public.service_provider_credentials for select to authenticated
  using (
    provider_id = (select auth.uid())
    and tenant_id = public.service_catalog_current_tenant()
  );

drop policy if exists "Admins read every provider credential" on public.service_provider_credentials;
create policy "Admins read every provider credential"
  on public.service_provider_credentials for select to authenticated
  using (
    tenant_id = public.service_catalog_current_tenant()
    and public.is_admin()
  );

drop policy if exists "Providers submit their own pending credential" on public.service_provider_credentials;
create policy "Providers submit their own pending credential"
  on public.service_provider_credentials for insert to authenticated
  with check (
    provider_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and tenant_id = public.service_catalog_current_tenant()
    and public.is_active_user()
  );

create or replace function public.service_provider_has_license(p_provider_id uuid, p_category_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.service_provider_credentials credential
     where credential.provider_id = p_provider_id
       and credential.credential_type = 'pharmacy_license'
       and credential.status = 'verified'
       and (credential.expires_on is null or credential.expires_on >= current_date)
       and (credential.category_id is null or credential.category_id = p_category_id)
  );
$$;

revoke all on function public.service_provider_has_license(uuid, text) from public, anon;
grant execute on function public.service_provider_has_license(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Booking-scoped dynamic values and documents.
-- ---------------------------------------------------------------------------
alter table public.service_bookings
  add column if not exists category_config_id text,
  add column if not exists category_config_version integer,
  add column if not exists config_snapshot jsonb,
  add column if not exists quantity integer not null default 1,
  add column if not exists recurrence_frequency text not null default 'none',
  add column if not exists recurrence_occurrences integer,
  add column if not exists payment_enabled boolean not null default true,
  add column if not exists assignment_mode text not null default 'customer_selects',
  add column if not exists delivery_mode text not null default 'on_site';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'service_bookings_category_config_fk'
       and conrelid = 'public.service_bookings'::regclass
  ) then
    alter table public.service_bookings
      add constraint service_bookings_category_config_fk
      foreign key (category_config_id) references public.service_category_configs(id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'service_bookings_category_config_version_check'
       and conrelid = 'public.service_bookings'::regclass
  ) then
    alter table public.service_bookings
      add constraint service_bookings_category_config_version_check
      check (category_config_version is null or category_config_version > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'service_bookings_config_snapshot_size_check'
       and conrelid = 'public.service_bookings'::regclass
  ) then
    alter table public.service_bookings
      add constraint service_bookings_config_snapshot_size_check
      check (config_snapshot is null or pg_column_size(config_snapshot) <= 65536);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'service_bookings_quantity_check'
       and conrelid = 'public.service_bookings'::regclass
  ) then
    alter table public.service_bookings
      add constraint service_bookings_quantity_check check (quantity between 1 and 999);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'service_bookings_recurrence_frequency_check'
       and conrelid = 'public.service_bookings'::regclass
  ) then
    alter table public.service_bookings
      add constraint service_bookings_recurrence_frequency_check
      check (recurrence_frequency in ('none', 'daily', 'weekly', 'monthly'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'service_bookings_recurrence_occurrences_check'
       and conrelid = 'public.service_bookings'::regclass
  ) then
    alter table public.service_bookings
      add constraint service_bookings_recurrence_occurrences_check
      check (recurrence_occurrences is null or recurrence_occurrences between 1 and 365);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'service_bookings_assignment_mode_check'
       and conrelid = 'public.service_bookings'::regclass
  ) then
    alter table public.service_bookings
      add constraint service_bookings_assignment_mode_check
      check (assignment_mode in ('customer_selects', 'platform_managed', 'admin_assigns'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'service_bookings_delivery_mode_check'
       and conrelid = 'public.service_bookings'::regclass
  ) then
    alter table public.service_bookings
      add constraint service_bookings_delivery_mode_check
      check (delivery_mode in ('on_site', 'home_delivery', 'pickup', 'digital'));
  end if;
end;
$$;

create table if not exists public.service_booking_field_values (
  booking_id uuid primary key references public.service_bookings(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_booking_field_values_size_check check (pg_column_size(data) <= 65536)
);

create table if not exists public.service_booking_documents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  document_key text not null check (document_key ~ '^[a-z][a-zA-Z0-9_]{1,39}$'),
  document_reference text not null check (
    char_length(document_reference) between 8 and 2048
    and document_reference ~ '^(storage://|https://)'
    and document_reference !~* '^(data|javascript|file|vbscript):'
  ),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  mime_type text check (mime_type is null or char_length(mime_type) <= 120),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_booking_documents_unique_key unique (booking_id, document_key),
  constraint service_booking_documents_review_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('verified', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create index if not exists idx_service_booking_documents_booking
  on public.service_booking_documents (booking_id, created_at, id);
create index if not exists idx_service_booking_documents_queue
  on public.service_booking_documents (status, created_at, id);

alter table public.service_booking_field_values enable row level security;
alter table public.service_booking_documents enable row level security;

revoke all on public.service_booking_field_values from public, anon, authenticated;
revoke all on public.service_booking_documents from public, anon, authenticated;
grant select, insert, update on public.service_booking_field_values to authenticated;
grant select, insert, update on public.service_booking_documents to authenticated;

drop policy if exists "Booking parties read service field values" on public.service_booking_field_values;
create policy "Booking parties read service field values"
  on public.service_booking_field_values for select to authenticated
  using (exists (
    select 1 from public.service_bookings booking
     where booking.id = service_booking_field_values.booking_id
       and (booking.customer_id = (select auth.uid()) or booking.provider_id = (select auth.uid()) or public.is_admin())
  ));

drop policy if exists "Customer submits service field values" on public.service_booking_field_values;
create policy "Customer submits service field values"
  on public.service_booking_field_values for insert to authenticated
  with check (
    exists (
      select 1 from public.service_bookings booking
       where booking.id = service_booking_field_values.booking_id
         and booking.customer_id = (select auth.uid())
         and booking.status in ('requested', 'accepted')
    )
    and public.is_active_user()
  );

drop policy if exists "Booking parties read service documents" on public.service_booking_documents;
create policy "Booking parties read service documents"
  on public.service_booking_documents for select to authenticated
  using (exists (
    select 1 from public.service_bookings booking
     where booking.id = service_booking_documents.booking_id
       and (booking.customer_id = (select auth.uid()) or booking.provider_id = (select auth.uid()) or public.is_admin())
  ));

drop policy if exists "Customer uploads service documents" on public.service_booking_documents;
create policy "Customer uploads service documents"
  on public.service_booking_documents for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and exists (
      select 1 from public.service_bookings booking
       where booking.id = service_booking_documents.booking_id
         and booking.customer_id = (select auth.uid())
         and booking.status in ('requested', 'accepted')
    )
    and public.is_active_user()
  );

-- ---------------------------------------------------------------------------
-- 6. Delivery profile gains config-derived switches. Legacy rows keep their
--    previous behaviour because every new column has a backwards-safe default.
-- ---------------------------------------------------------------------------
alter table public.service_delivery_profiles
  add column if not exists category_id text,
  add column if not exists live_map_enabled boolean not null default true,
  add column if not exists otp_enabled boolean not null default true,
  add column if not exists delivery_confirmation_enabled boolean not null default false,
  add column if not exists delivery_confirmed_at timestamptz,
  add column if not exists prescription_required boolean not null default false;

update public.service_delivery_profiles
   set prescription_required = (service_kind = 'medicine_delivery')
 where prescription_required is false and service_kind = 'medicine_delivery';

alter table public.service_delivery_profiles drop constraint if exists water_recurrence_meta;
alter table public.service_delivery_profiles
  add constraint service_recurrence_meta
  check (recurrence_rule = 'none' or service_kind = 'water_delivery' or category_id is not null);

create or replace function public.ensure_service_delivery_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := lower(coalesce(new.category_id, '') || ' ' || coalesce(new.subcategory, ''));
  v_kind text;
  v_config jsonb := case when jsonb_typeof(new.config_snapshot) = 'object' then new.config_snapshot else '{}'::jsonb end;
  v_recurrence text;
begin
  v_kind := coalesce(nullif(v_config->>'deliveryKind', ''), '');
  if v_kind not in ('human_help', 'medicine_delivery', 'water_delivery') then
    v_kind := case
      when v_text ~ '(medicine|pharmacy|medical|prescription|tablet|drug)' then 'medicine_delivery'
      when v_text ~ '(water|bottle|can|tanker|mineral)' then 'water_delivery'
      else 'human_help'
    end;
  end if;
  if public.service_catalog_is_medicine(new.category_config_id, v_config) then
    v_kind := 'medicine_delivery';
  end if;

  v_recurrence := case new.recurrence_frequency
    when 'daily' then 'daily'
    when 'weekly' then 'weekly'
    when 'monthly' then 'custom'
    else 'none'
  end;
  if v_recurrence <> 'none' and v_kind <> 'water_delivery' and new.category_config_id is null then
    v_recurrence := 'none';
  end if;

  insert into public.service_delivery_profiles (
    booking_id, service_kind, prescription_status, recurrence_rule, category_id,
    tracking_enabled, live_map_enabled, otp_enabled, delivery_confirmation_enabled, prescription_required
  )
  values (
    new.id,
    v_kind,
    case when v_kind = 'medicine_delivery' then 'pending' else 'not_required' end,
    v_recurrence,
    new.category_config_id,
    coalesce((v_config->'toggles'->>'gpsTracking')::boolean, true),
    coalesce((v_config->'toggles'->>'liveMap')::boolean, true),
    coalesce((v_config->'toggles'->>'customerOtp')::boolean, true),
    coalesce((v_config->'toggles'->>'deliveryConfirmation')::boolean, false),
    v_kind = 'medicine_delivery'
  )
  on conflict (booking_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_ensure_service_delivery_profile on public.service_bookings;
create trigger trg_ensure_service_delivery_profile
  after insert on public.service_bookings
  for each row execute function public.ensure_service_delivery_profile();

-- ---------------------------------------------------------------------------
-- 7. Booking requirements: required fields/documents and medicine licensing.
--    A deferred constraint trigger sees the booking, its values and documents
--    at COMMIT, so they can be written in one server transaction.
-- ---------------------------------------------------------------------------
create or replace function public.service_booking_requirements_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config jsonb := new.config_snapshot;
  v_data jsonb := '{}'::jsonb;
  v_required jsonb;
begin
  if v_config is null or jsonb_typeof(v_config) <> 'object' then
    v_config := '{}'::jsonb;
  end if;

  if jsonb_typeof(v_config->'documents') = 'array' then
    for v_required in
      select value from jsonb_array_elements(v_config->'documents')
       where coalesce((value->>'required')::boolean, false)
    loop
      if not exists (
        select 1 from public.service_booking_documents document
         where document.booking_id = new.id
           and document.document_key = v_required->>'key'
      ) then
        raise exception 'SERVICE_REQUIRED_DOCUMENTS_MISSING' using errcode = '23514';
      end if;
    end loop;
  end if;

  select data into v_data from public.service_booking_field_values where booking_id = new.id;
  v_data := coalesce(v_data, '{}'::jsonb);
  if jsonb_typeof(v_config->'fields') = 'array' then
    for v_required in
      select value from jsonb_array_elements(v_config->'fields')
       where coalesce((value->>'required')::boolean, false)
    loop
      if not (v_data ? (v_required->>'key'))
         or nullif(trim(coalesce(v_data->>(v_required->>'key'), '')), '') is null then
        raise exception 'SERVICE_REQUIRED_FIELDS_MISSING' using errcode = '23514';
      end if;
    end loop;
  end if;

  if public.service_catalog_is_medicine(
       coalesce(new.category_config_id, ''),
       v_config || jsonb_build_object('name', coalesce(new.category_id, '') || ' ' || coalesce(new.subcategory, ''))
     ) then
    if not exists (
      select 1 from public.service_booking_documents document
       where document.booking_id = new.id and document.document_key = 'prescription'
    ) then
      raise exception 'MEDICINE_PRESCRIPTION_REQUIRED' using errcode = '23514';
    end if;
    if not public.service_provider_has_license(
         new.provider_id,
         coalesce(new.category_config_id, 'medicine_delivery')
       ) then
      raise exception 'LICENSED_PHARMACY_REQUIRED' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_service_booking_requirements on public.service_bookings;
create constraint trigger trg_service_booking_requirements
  after insert or update of category_config_id, config_snapshot on public.service_bookings
  deferrable initially deferred
  for each row execute function public.service_booking_requirements_check();

create or replace function public.service_booking_config_immutable_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.category_config_id is distinct from old.category_config_id
     or new.category_config_version is distinct from old.category_config_version
     or new.config_snapshot is distinct from old.config_snapshot
     or new.quantity is distinct from old.quantity
     or new.recurrence_frequency is distinct from old.recurrence_frequency
     or new.recurrence_occurrences is distinct from old.recurrence_occurrences
     or new.payment_enabled is distinct from old.payment_enabled
     or new.assignment_mode is distinct from old.assignment_mode
     or new.delivery_mode is distinct from old.delivery_mode then
    raise exception 'SERVICE_BOOKING_CONFIG_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_booking_config_immutable on public.service_bookings;
create trigger trg_service_booking_config_immutable
  before update on public.service_bookings
  for each row execute function public.service_booking_config_immutable_guard();

create or replace function public.service_booking_category_transition_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config jsonb := new.config_snapshot;
  v_profile public.service_delivery_profiles%rowtype;
  v_role text;
  v_required jsonb;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if v_config is null or jsonb_typeof(v_config) <> 'object' then
    if new.status = 'completed' then
      select * into v_profile from public.service_delivery_profiles where booking_id = new.id;
      if found and v_profile.service_kind = 'medicine_delivery' and v_profile.prescription_status <> 'verified' then
        raise exception 'PRESCRIPTION_NOT_VERIFIED' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  select case when profile.is_super_admin then 'super_admin' else profile.role end
    into v_role
    from public.profiles profile
   where profile.id = auth.uid();

  select * into v_profile from public.service_delivery_profiles where booking_id = new.id;

  if new.status = 'accepted' and old.status = 'requested'
     and coalesce((v_config->'approvalWorkflow'->>'requiresAdminApproval')::boolean, false)
     and v_role is distinct from 'admin' and v_role is distinct from 'super_admin' then
    raise exception 'ADMIN_APPROVAL_REQUIRED' using errcode = '42501';
  end if;

  if new.status = 'completed' then
    if public.service_catalog_is_medicine(new.category_config_id, v_config) then
      if not found or v_profile.prescription_status <> 'verified' then
        raise exception 'PRESCRIPTION_NOT_VERIFIED' using errcode = '42501';
      end if;
    end if;
    if found and v_profile.delivery_confirmation_enabled and v_profile.delivery_confirmed_at is null then
      raise exception 'DELIVERY_CONFIRMATION_REQUIRED' using errcode = '42501';
    end if;
    if coalesce((v_config->'approvalWorkflow'->>'requiresDocumentVerification')::boolean, false)
       and jsonb_typeof(v_config->'documents') = 'array' then
      for v_required in
        select value from jsonb_array_elements(v_config->'documents')
         where coalesce((value->>'verificationRequired')::boolean, false)
           and coalesce((value->>'required')::boolean, false)
      loop
        if not exists (
          select 1 from public.service_booking_documents document
           where document.booking_id = new.id
             and document.document_key = v_required->>'key'
             and document.status = 'verified'
        ) then
          raise exception 'SERVICE_DOCUMENTS_NOT_VERIFIED' using errcode = '42501';
        end if;
      end loop;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_service_booking_category_transition on public.service_bookings;
create trigger trg_service_booking_category_transition
  before update of status on public.service_bookings
  for each row execute function public.service_booking_category_transition_guard();

-- Payment must stay off when the category has disabled it, even if someone
-- calls the payment RPC directly from an authenticated Supabase client.
create or replace function public.service_payment_toggle_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.service_bookings booking
     where booking.id = new.booking_id and booking.payment_enabled = false
  ) then
    raise exception 'PAYMENT_DISABLED_FOR_SERVICE' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_payment_toggle_guard on public.service_payment_intents;
create trigger trg_service_payment_toggle_guard
  before insert on public.service_payment_intents
  for each row execute function public.service_payment_toggle_guard();

-- ---------------------------------------------------------------------------
-- 8. Replace tracking RPCs so category switches are authoritative, and add
--    delivery confirmation.
-- ---------------------------------------------------------------------------
create or replace function public.create_delivery_otp(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.service_bookings%rowtype;
  v_profile public.service_delivery_profiles%rowtype;
  v_code text;
  v_bytes bytea;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_booking from public.service_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.customer_id <> auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_booking.status not in ('accepted', 'in_progress') then raise exception 'TRACKING_NOT_ACTIVE'; end if;
  select * into v_profile from public.service_delivery_profiles where booking_id = p_booking_id;
  if not found or v_profile.tracking_enabled is not true then raise exception 'TRACKING_NOT_ACTIVE'; end if;
  if v_profile.otp_enabled is not true then raise exception 'OTP_DISABLED_FOR_SERVICE'; end if;
  if v_profile.prescription_required and v_profile.prescription_status <> 'verified' then
    raise exception 'PRESCRIPTION_NOT_VERIFIED';
  end if;

  v_bytes := gen_random_bytes(3);
  v_code := lpad((((get_byte(v_bytes, 0) * 65536) + (get_byte(v_bytes, 1) * 256) + get_byte(v_bytes, 2)) % 1000000)::text, 6, '0');

  insert into public.service_delivery_otps (booking_id, code_hash, expires_at, created_by)
  values (p_booking_id, encode(digest(v_code, 'sha256'), 'hex'), now() + interval '10 minutes', auth.uid())
  on conflict (booking_id) do update
    set code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        consumed_at = null,
        attempts = 0,
        created_by = excluded.created_by,
        created_at = now();

  insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
  values (p_booking_id, auth.uid(), 'otp_generated', 'Single-use in-app OTP generated');
  return v_code;
end;
$$;

create or replace function public.verify_delivery_otp(p_booking_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.service_bookings%rowtype;
  v_otp public.service_delivery_otps%rowtype;
  v_profile public.service_delivery_profiles%rowtype;
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_booking from public.service_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.provider_id <> auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_booking.status not in ('accepted', 'in_progress') then raise exception 'TRACKING_NOT_ACTIVE'; end if;
  select * into v_otp from public.service_delivery_otps where booking_id = p_booking_id for update;
  if not found then raise exception 'OTP_NOT_FOUND'; end if;
  if v_otp.consumed_at is not null then raise exception 'OTP_ALREADY_USED'; end if;
  if v_otp.expires_at <= now() then raise exception 'OTP_EXPIRED'; end if;
  if v_otp.attempts >= v_otp.max_attempts then raise exception 'OTP_ATTEMPTS_EXCEEDED'; end if;
  if length(v_code) <> 6 then raise exception 'OTP_INVALID'; end if;

  if encode(digest(v_code, 'sha256'), 'hex') <> v_otp.code_hash then
    update public.service_delivery_otps set attempts = attempts + 1 where booking_id = p_booking_id;
    return false;
  end if;

  update public.service_delivery_otps set consumed_at = now(), attempts = attempts + 1 where booking_id = p_booking_id;
  insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
  values (p_booking_id, auth.uid(), 'otp_verified', 'Single-use OTP verified');

  select * into v_profile from public.service_delivery_profiles where booking_id = p_booking_id for update;
  if found and v_profile.delivery_confirmation_enabled and v_profile.delivery_confirmed_at is null then
    update public.service_delivery_profiles
       set delivery_confirmed_at = now(), updated_at = now()
     where booking_id = p_booking_id;
    insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
    values (p_booking_id, auth.uid(), 'status_changed', 'Delivery confirmed by handover OTP');
  end if;
  return true;
end;
$$;

revoke all on function public.create_delivery_otp(uuid) from public, anon;
revoke all on function public.verify_delivery_otp(uuid, text) from public, anon;
grant execute on function public.create_delivery_otp(uuid) to authenticated;
grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;

-- When OTP is deliberately disabled, the provider still needs a deliberate
-- handover confirmation before the booking can complete if that toggle is on.
create or replace function public.confirm_service_delivery(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.service_bookings%rowtype;
  v_profile public.service_delivery_profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_booking from public.service_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.provider_id <> auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_booking.status not in ('accepted', 'in_progress') then raise exception 'TRACKING_NOT_ACTIVE'; end if;
  select * into v_profile from public.service_delivery_profiles where booking_id = p_booking_id for update;
  if not found then raise exception 'DELIVERY_PROFILE_NOT_FOUND'; end if;
  if v_profile.delivery_confirmation_enabled is not true then
    raise exception 'DELIVERY_CONFIRMATION_NOT_REQUIRED';
  end if;
  if v_profile.prescription_required and v_profile.prescription_status <> 'verified' then
    raise exception 'PRESCRIPTION_NOT_VERIFIED';
  end if;
  if v_profile.otp_enabled is true and v_profile.delivery_confirmed_at is null then
    raise exception 'OTP_REQUIRED_FOR_CONFIRMATION';
  end if;
  if v_profile.delivery_confirmed_at is null then
    update public.service_delivery_profiles
       set delivery_confirmed_at = now(), updated_at = now()
     where booking_id = p_booking_id;
    insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
    values (p_booking_id, auth.uid(), 'status_changed', 'Delivery confirmed by assigned provider');
  end if;
  return true;
end;
$$;

revoke all on function public.confirm_service_delivery(uuid) from public, anon;
grant execute on function public.confirm_service_delivery(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Super Admin catalog RPCs. Only the application server connection may
--    execute them; the actor is re-derived from profiles inside each function.
-- ---------------------------------------------------------------------------
create or replace function public.service_catalog_save_draft(
  p_actor uuid,
  p_tenant text,
  p_category_id text,
  p_config jsonb,
  p_summary text default 'Saved draft',
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.service_catalog_actor_role(p_actor);
  v_config jsonb;
  v_max bigint;
  v_number bigint;
  v_created boolean := false;
  v_row public.service_category_config_versions;
  v_tenant text := coalesce(nullif(trim(p_tenant), ''), 'default');
begin
  if v_role is distinct from 'super_admin' then raise exception 'SERVICE_CATALOG_SUPER_ADMIN_REQUIRED'; end if;
  if p_category_id is null or p_category_id !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'SERVICE_CATALOG_INVALID_KEY'; end if;
  if v_tenant !~ '^[a-z0-9][a-z0-9_-]{0,39}$' then raise exception 'SERVICE_CATALOG_INVALID_TENANT'; end if;

  v_config := public.service_catalog_apply_hard_rules(p_category_id, p_config);
  perform public.service_catalog_validate_config(p_category_id, v_config);

  insert into public.service_category_configs (id, tenant_id, enabled, created_by, updated_by)
  values (p_category_id, v_tenant, false, p_actor, p_actor)
  on conflict (id) do nothing;
  if found then
    v_created := true;
  end if;

  if not exists (
    select 1 from public.service_category_configs
     where id = p_category_id and tenant_id = v_tenant
  ) then
    raise exception 'SERVICE_CATALOG_TENANT_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtext('service_category:' || p_category_id)::bigint);
  select coalesce(max(version_number), 0) into v_max
    from public.service_category_config_versions where category_id = p_category_id;
  if p_expected_version is not null and p_expected_version <> v_max then
    raise exception 'SERVICE_CATALOG_VERSION_CONFLICT';
  end if;

  update public.service_category_config_versions
     set status = 'superseded_draft', updated_at = now()
   where category_id = p_category_id and status = 'draft';

  v_number := v_max + 1;
  insert into public.service_category_config_versions
    (category_id, tenant_id, version_number, status, config, summary, created_by)
  values (
    p_category_id, v_tenant, v_number, 'draft', v_config,
    left(coalesce(nullif(trim(p_summary), ''), 'Saved draft'), 500), p_actor
  )
  returning * into v_row;

  update public.service_category_configs
     set updated_by = p_actor, updated_at = now()
   where id = p_category_id;

  insert into public.service_category_config_audit
    (tenant_id, category_id, version_number, actor_id, actor_role, action, summary, detail)
  values (
    v_tenant, p_category_id, v_number, p_actor, v_role,
    case when v_created then 'category_created' else 'draft_saved' end,
    v_row.summary,
    jsonb_build_object(
      'deliveryKind', v_config->>'deliveryKind',
      'bookingType', v_config->>'bookingType',
      'fields', coalesce(jsonb_array_length(v_config->'fields'), 0),
      'documents', coalesce(jsonb_array_length(v_config->'documents'), 0)
    )
  );

  return jsonb_build_object(
    'categoryId', p_category_id,
    'tenantId', v_tenant,
    'versionId', v_row.id,
    'versionNumber', v_number,
    'status', v_row.status,
    'config', v_row.config,
    'summary', v_row.summary,
    'createdAt', v_row.created_at
  );
end;
$$;

create or replace function public.service_catalog_publish(
  p_actor uuid,
  p_tenant text,
  p_category_id text,
  p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.service_catalog_actor_role(p_actor);
  v_tenant text := coalesce(nullif(trim(p_tenant), ''), 'default');
  v_row public.service_category_config_versions;
begin
  if v_role is distinct from 'super_admin' then raise exception 'SERVICE_CATALOG_SUPER_ADMIN_REQUIRED'; end if;
  if p_version_id is null then raise exception 'SERVICE_CATALOG_VERSION_NOT_FOUND'; end if;
  select * into v_row
    from public.service_category_config_versions
   where id = p_version_id and category_id = p_category_id and tenant_id = v_tenant
   for update;
  if not found then raise exception 'SERVICE_CATALOG_VERSION_NOT_FOUND'; end if;
  if v_row.status <> 'draft' then raise exception 'SERVICE_CATALOG_VERSION_NOT_DRAFT'; end if;

  update public.service_category_config_versions
     set status = 'published', published_at = now(), published_by = p_actor, updated_at = now()
   where id = p_version_id and status = 'draft'
   returning * into v_row;
  if not found then raise exception 'SERVICE_CATALOG_VERSION_NOT_DRAFT'; end if;

  update public.service_category_configs
     set current_version_id = p_version_id, enabled = true, updated_by = p_actor, updated_at = now()
   where id = p_category_id and tenant_id = v_tenant;
  if not found then raise exception 'SERVICE_CATALOG_NOT_FOUND'; end if;

  insert into public.service_category_config_audit
    (tenant_id, category_id, version_number, actor_id, actor_role, action, summary, detail)
  values (
    v_tenant, p_category_id, v_row.version_number, p_actor, v_role, 'category_published',
    left('Published version ' || v_row.version_number || ': ' || v_row.summary, 500),
    jsonb_build_object('versionId', v_row.id)
  );

  return jsonb_build_object(
    'categoryId', p_category_id,
    'tenantId', v_tenant,
    'versionId', v_row.id,
    'versionNumber', v_row.version_number,
    'status', v_row.status,
    'config', v_row.config,
    'summary', v_row.summary,
    'publishedAt', v_row.published_at
  );
end;
$$;

create or replace function public.service_catalog_rollback(
  p_actor uuid,
  p_tenant text,
  p_category_id text,
  p_target_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.service_catalog_actor_role(p_actor);
  v_tenant text := coalesce(nullif(trim(p_tenant), ''), 'default');
  v_target public.service_category_config_versions;
  v_max bigint;
  v_row public.service_category_config_versions;
begin
  if v_role is distinct from 'super_admin' then raise exception 'SERVICE_CATALOG_SUPER_ADMIN_REQUIRED'; end if;
  select * into v_target
    from public.service_category_config_versions
   where id = p_target_version_id and category_id = p_category_id and tenant_id = v_tenant;
  if not found or v_target.status <> 'published' then
    raise exception 'SERVICE_CATALOG_VERSION_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext('service_category:' || p_category_id)::bigint);
  select coalesce(max(version_number), 0) into v_max
    from public.service_category_config_versions where category_id = p_category_id;
  update public.service_category_config_versions
     set status = 'superseded_draft', updated_at = now()
   where category_id = p_category_id and status = 'draft';

  insert into public.service_category_config_versions
    (category_id, tenant_id, version_number, status, config, summary, created_by,
     published_at, published_by, source_version_id)
  values (
    p_category_id, v_tenant, v_max + 1, 'published',
    public.service_catalog_apply_hard_rules(p_category_id, v_target.config),
    left('Rollback to version ' || v_target.version_number, 500), p_actor,
    now(), p_actor, v_target.id
  )
  returning * into v_row;

  update public.service_category_configs
     set current_version_id = v_row.id, updated_by = p_actor, updated_at = now()
   where id = p_category_id and tenant_id = v_tenant;
  if not found then raise exception 'SERVICE_CATALOG_NOT_FOUND'; end if;

  insert into public.service_category_config_audit
    (tenant_id, category_id, version_number, actor_id, actor_role, action, summary, detail)
  values (
    v_tenant, p_category_id, v_row.version_number, p_actor, v_role, 'category_rolled_back',
    left('Rolled back to version ' || v_target.version_number, 500),
    jsonb_build_object('sourceVersionId', v_target.id, 'newVersionId', v_row.id)
  );

  return jsonb_build_object(
    'categoryId', p_category_id,
    'tenantId', v_tenant,
    'versionId', v_row.id,
    'versionNumber', v_row.version_number,
    'status', v_row.status,
    'config', v_row.config,
    'summary', v_row.summary,
    'publishedAt', v_row.published_at
  );
end;
$$;

create or replace function public.service_catalog_set_enabled(
  p_actor uuid,
  p_tenant text,
  p_category_id text,
  p_enabled boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.service_catalog_actor_role(p_actor);
  v_tenant text := coalesce(nullif(trim(p_tenant), ''), 'default');
  v_reason text := trim(coalesce(p_reason, ''));
  v_row public.service_category_configs;
begin
  if v_role is distinct from 'super_admin' then raise exception 'SERVICE_CATALOG_SUPER_ADMIN_REQUIRED'; end if;
  if length(v_reason) < 5 then raise exception 'SERVICE_CATALOG_REASON_REQUIRED'; end if;
  update public.service_category_configs
     set enabled = coalesce(p_enabled, false), updated_by = p_actor, updated_at = now()
   where id = p_category_id and tenant_id = v_tenant
   returning * into v_row;
  if not found then raise exception 'SERVICE_CATALOG_NOT_FOUND'; end if;
  insert into public.service_category_config_audit
    (tenant_id, category_id, version_number, actor_id, actor_role, action, summary, detail)
  values (
    v_tenant, p_category_id, null, p_actor, v_role,
    case when v_row.enabled then 'category_enabled' else 'category_disabled' end,
    left((case when v_row.enabled then 'Enabled: ' else 'Disabled: ' end) || v_reason, 500),
    jsonb_build_object('enabled', v_row.enabled)
  );
  return jsonb_build_object('categoryId', p_category_id, 'tenantId', v_tenant, 'enabled', v_row.enabled);
end;
$$;

create or replace function public.service_catalog_review_document(
  p_actor uuid,
  p_tenant text,
  p_document_id uuid,
  p_status text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.service_catalog_actor_role(p_actor);
  v_tenant text := coalesce(nullif(trim(p_tenant), ''), 'default');
  v_note text := trim(coalesce(p_note, ''));
  v_document public.service_booking_documents;
  v_booking public.service_bookings;
  v_config_tenant text;
begin
  if v_role not in ('admin', 'super_admin') then raise exception 'SERVICE_CATALOG_ADMIN_REQUIRED'; end if;
  if p_status not in ('verified', 'rejected') then raise exception 'SERVICE_CATALOG_INVALID_REVIEW_STATUS'; end if;
  if length(v_note) < 5 then raise exception 'SERVICE_CATALOG_REVIEW_NOTE_REQUIRED'; end if;

  select * into v_document from public.service_booking_documents where id = p_document_id for update;
  if not found then raise exception 'SERVICE_DOCUMENT_NOT_FOUND'; end if;
  select * into v_booking from public.service_bookings where id = v_document.booking_id;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.category_config_id is not null then
    select tenant_id into v_config_tenant from public.service_category_configs where id = v_booking.category_config_id;
    if v_config_tenant is distinct from v_tenant then raise exception 'SERVICE_CATALOG_TENANT_MISMATCH'; end if;
  end if;

  update public.service_booking_documents
     set status = p_status, reviewed_by = p_actor, reviewed_at = now(), review_note = v_note, updated_at = now()
   where id = p_document_id
   returning * into v_document;

  if v_document.document_key = 'prescription' and v_booking.category_config_id is not null then
    update public.service_delivery_profiles
       set prescription_status = case when p_status = 'verified' then 'verified' else 'rejected' end,
           prescription_reference = case when p_status = 'verified' then v_document.document_reference else prescription_reference end,
           updated_at = now()
     where booking_id = v_booking.id
       and service_kind = 'medicine_delivery';
    insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
    values (v_booking.id, p_actor, 'prescription_verified', 'Prescription review: ' || p_status);
  end if;

  insert into public.service_category_config_audit
    (tenant_id, category_id, version_number, actor_id, actor_role, action, summary, detail)
  values (
    v_tenant, coalesce(v_booking.category_config_id, 'uncategorized'), v_booking.category_config_version,
    p_actor, v_role, 'document_reviewed',
    left('Document ' || v_document.document_key || ' ' || p_status || ': ' || v_note, 500),
    jsonb_build_object('bookingId', v_booking.id, 'documentId', v_document.id, 'status', p_status)
  );

  return jsonb_build_object(
    'documentId', v_document.id,
    'bookingId', v_document.booking_id,
    'documentKey', v_document.document_key,
    'status', v_document.status,
    'reviewNote', v_document.review_note,
    'reviewedAt', v_document.reviewed_at
  );
end;
$$;

create or replace function public.service_catalog_review_credential(
  p_actor uuid,
  p_tenant text,
  p_credential_id uuid,
  p_status text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.service_catalog_actor_role(p_actor);
  v_tenant text := coalesce(nullif(trim(p_tenant), ''), 'default');
  v_note text := trim(coalesce(p_note, ''));
  v_row public.service_provider_credentials;
begin
  if v_role not in ('admin', 'super_admin') then raise exception 'SERVICE_CATALOG_ADMIN_REQUIRED'; end if;
  if p_status not in ('verified', 'rejected') then raise exception 'SERVICE_CATALOG_INVALID_REVIEW_STATUS'; end if;
  if length(v_note) < 5 then raise exception 'SERVICE_CATALOG_REVIEW_NOTE_REQUIRED'; end if;

  update public.service_provider_credentials
     set status = p_status, reviewed_by = p_actor, reviewed_at = now(), review_note = v_note, updated_at = now()
   where id = p_credential_id and tenant_id = v_tenant
   returning * into v_row;
  if not found then raise exception 'SERVICE_CREDENTIAL_NOT_FOUND'; end if;

  insert into public.service_category_config_audit
    (tenant_id, category_id, version_number, actor_id, actor_role, action, summary, detail)
  values (
    v_tenant, coalesce(v_row.category_id, 'uncategorized'), null, p_actor, v_role, 'credential_reviewed',
    left('Credential ' || v_row.credential_type || ' ' || p_status || ': ' || v_note, 500),
    jsonb_build_object('credentialId', v_row.id, 'providerId', v_row.provider_id, 'status', p_status)
  );

  return jsonb_build_object(
    'credentialId', v_row.id,
    'providerId', v_row.provider_id,
    'credentialType', v_row.credential_type,
    'status', v_row.status,
    'reviewNote', v_row.review_note,
    'reviewedAt', v_row.reviewed_at
  );
end;
$$;

revoke all on function public.service_catalog_save_draft(uuid, text, text, jsonb, text, bigint) from public, anon, authenticated;
revoke all on function public.service_catalog_publish(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.service_catalog_rollback(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.service_catalog_set_enabled(uuid, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.service_catalog_review_document(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.service_catalog_review_credential(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.service_catalog_save_draft(uuid, text, text, jsonb, text, bigint) to service_role;
grant execute on function public.service_catalog_publish(uuid, text, text, uuid) to service_role;
grant execute on function public.service_catalog_rollback(uuid, text, text, uuid) to service_role;
grant execute on function public.service_catalog_set_enabled(uuid, text, text, boolean, text) to service_role;
grant execute on function public.service_catalog_review_document(uuid, text, uuid, text, text) to service_role;
grant execute on function public.service_catalog_review_credential(uuid, text, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Realtime for published category changes where Supabase is present.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_category_configs') then
      alter publication supabase_realtime add table public.service_category_configs;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_category_config_versions') then
      alter publication supabase_realtime add table public.service_category_config_versions;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Baseline, non-demo category configuration. Prices are deliberately
--     "quote" because no provider has published a real price yet.
-- ---------------------------------------------------------------------------
insert into public.service_category_configs (id, tenant_id, enabled)
values
  ('human_help', 'default', true),
  ('medicine_delivery', 'default', true),
  ('water_delivery', 'default', true)
on conflict (id) do nothing;

do $$
declare
  v_id text;
  v_config jsonb;
  v_version uuid;
  v_summary text;
begin
  v_id := 'human_help';
  if not exists (select 1 from public.service_category_config_versions where category_id = v_id) then
    v_config := $config${
      "schemaVersion": 1,
      "name": "Human Help",
      "description": "Everyday help from verified local partners: errands, queues, pickups and small tasks.",
      "icon": "heart-handshake",
      "imageUrl": "",
      "accentColor": "#0f766e",
      "deliveryKind": "human_help",
      "bookingType": "on_demand",
      "providerAssignment": "customer_selects",
      "deliveryModes": ["on_site"],
      "pricing": {"mode": "quote", "amount": 0, "currency": "INR", "unit": "per task", "quantityEnabled": true, "minQuantity": 1, "maxQuantity": 10},
      "recurring": {"enabled": false, "frequencies": ["weekly"], "defaultFrequency": "weekly", "maxOccurrences": 12},
      "toggles": {"gpsTracking": true, "liveMap": true, "customerOtp": true, "prescriptionVerification": false, "documentVerification": false, "payment": true, "deliveryConfirmation": true},
      "fields": [
        {"key": "taskType", "label": "What kind of help?", "type": "select", "required": true, "options": ["Errand", "Queue standing", "Shopping pickup", "Document pickup", "Other"]},
        {"key": "taskDetails", "label": "Details", "type": "textarea", "required": true, "maxLength": 500}
      ],
      "documents": [],
      "approvalWorkflow": {"requiresProviderAcceptance": true, "requiresDocumentVerification": false, "requiresAdminApproval": false},
      "validation": {"minLeadTimeMinutes": 30, "maxAdvanceDays": 30, "requiresServiceAddress": true, "requiresPhone": true, "notesRequired": false},
      "legacyCategoryIds": []
    }$config$::jsonb;
    v_summary := 'Baseline Human Help configuration';
    insert into public.service_category_config_versions
      (category_id, tenant_id, version_number, status, config, summary, published_at)
    values (v_id, 'default', 1, 'published', public.service_catalog_apply_hard_rules(v_id, v_config), v_summary, now())
    returning id into v_version;
    update public.service_category_configs set current_version_id = v_version where id = v_id;
  end if;

  v_id := 'medicine_delivery';
  if not exists (select 1 from public.service_category_config_versions where category_id = v_id) then
    v_config := $config${
      "schemaVersion": 1,
      "name": "Medicine Delivery",
      "description": "Prescription medicines delivered by a licensed pharmacy. A doctor's prescription is verified before handover.",
      "icon": "pill",
      "imageUrl": "",
      "accentColor": "#7c3aed",
      "deliveryKind": "medicine_delivery",
      "bookingType": "scheduled",
      "providerAssignment": "customer_selects",
      "deliveryModes": ["home_delivery", "pickup"],
      "pricing": {"mode": "quote", "amount": 0, "currency": "INR", "unit": "per order", "quantityEnabled": true, "minQuantity": 1, "maxQuantity": 5},
      "recurring": {"enabled": false, "frequencies": ["weekly"], "defaultFrequency": "weekly", "maxOccurrences": 12},
      "toggles": {"gpsTracking": true, "liveMap": true, "customerOtp": true, "prescriptionVerification": true, "documentVerification": true, "payment": true, "deliveryConfirmation": true},
      "fields": [
        {"key": "deliveryPreference", "label": "Delivery or pickup", "type": "select", "required": true, "options": ["Home delivery", "Pharmacy pickup"]},
        {"key": "medicineNotes", "label": "Notes for the pharmacist", "type": "textarea", "required": false, "maxLength": 500}
      ],
      "documents": [
        {"key": "prescription", "label": "Doctor prescription", "required": true, "verificationRequired": true, "acceptedTypes": ["application/pdf", "image/jpeg", "image/png"]}
      ],
      "approvalWorkflow": {"requiresProviderAcceptance": true, "requiresDocumentVerification": true, "requiresAdminApproval": false},
      "validation": {"minLeadTimeMinutes": 60, "maxAdvanceDays": 14, "requiresServiceAddress": true, "requiresPhone": true, "notesRequired": false},
      "legacyCategoryIds": [],
      "requiresLicensedPharmacy": true
    }$config$::jsonb;
    v_summary := 'Baseline licensed-pharmacy Medicine configuration';
    insert into public.service_category_config_versions
      (category_id, tenant_id, version_number, status, config, summary, published_at)
    values (v_id, 'default', 1, 'published', public.service_catalog_apply_hard_rules(v_id, v_config), v_summary, now())
    returning id into v_version;
    update public.service_category_configs set current_version_id = v_version where id = v_id;
  end if;

  v_id := 'water_delivery';
  if not exists (select 1 from public.service_category_config_versions where category_id = v_id) then
    v_config := $config${
      "schemaVersion": 1,
      "name": "Water Bottle Delivery",
      "description": "Drinking-water cans and bottles delivered to your door, with optional recurring schedules.",
      "icon": "droplets",
      "imageUrl": "",
      "accentColor": "#0284c7",
      "deliveryKind": "water_delivery",
      "bookingType": "recurring",
      "providerAssignment": "customer_selects",
      "deliveryModes": ["home_delivery"],
      "pricing": {"mode": "quote", "amount": 0, "currency": "INR", "unit": "per can", "quantityEnabled": true, "minQuantity": 1, "maxQuantity": 20},
      "recurring": {"enabled": true, "frequencies": ["daily", "weekly", "monthly"], "defaultFrequency": "weekly", "maxOccurrences": 26},
      "toggles": {"gpsTracking": true, "liveMap": true, "customerOtp": true, "prescriptionVerification": false, "documentVerification": false, "payment": true, "deliveryConfirmation": true},
      "fields": [
        {"key": "bottleSize", "label": "Bottle size", "type": "select", "required": true, "options": ["20L can", "1L bottle", "500ml bottle"]},
        {"key": "deliveryInstructions", "label": "Delivery instructions", "type": "textarea", "required": false, "maxLength": 300}
      ],
      "documents": [],
      "approvalWorkflow": {"requiresProviderAcceptance": true, "requiresDocumentVerification": false, "requiresAdminApproval": false},
      "validation": {"minLeadTimeMinutes": 60, "maxAdvanceDays": 30, "requiresServiceAddress": true, "requiresPhone": true, "notesRequired": false},
      "legacyCategoryIds": []
    }$config$::jsonb;
    v_summary := 'Baseline Water Bottle Delivery configuration';
    insert into public.service_category_config_versions
      (category_id, tenant_id, version_number, status, config, summary, published_at)
    values (v_id, 'default', 1, 'published', public.service_catalog_apply_hard_rules(v_id, v_config), v_summary, now())
    returning id into v_version;
    update public.service_category_configs set current_version_id = v_version where id = v_id;
  end if;

  insert into public.service_category_config_audit
    (tenant_id, category_id, actor_role, action, summary, detail)
  select 'default', config.id, 'system', 'category_published',
         'Baseline category published', jsonb_build_object('seed', true)
    from public.service_category_configs config
   where config.id in ('human_help', 'medicine_delivery', 'water_delivery')
     and not exists (
       select 1 from public.service_category_config_audit audit
        where audit.category_id = config.id and audit.tenant_id = 'default'
     );
end;
$$;

comment on table public.service_category_configs is
  'Super Admin-managed service category heads. Only enabled published configurations are customer-visible.';
comment on table public.service_category_config_versions is
  'Append-only service category configuration versions with draft/publish/rollback. Medicine hard rules are applied by trigger.';
comment on table public.service_booking_documents is
  'Private document references for a booking. Only an admin can verify or reject; medicine prescriptions gate handover OTPs.';
comment on table public.service_provider_credentials is
  'Provider licences. A verified, unexpired pharmacy licence is required for medicine bookings.';

commit;

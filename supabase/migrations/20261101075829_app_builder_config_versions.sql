-- Versioned, centrally persisted App Builder configuration.
-- Draft/publish/rollback are append-oriented and authorized by Supabase Auth
-- profile state. This migration is a local draft and has not been cloud-applied.

create table if not exists public.platform_config_versions (
  id uuid primary key default gen_random_uuid(),
  config_key text not null default 'global' check (config_key = 'global'),
  version_number bigint not null check (version_number > 0),
  status text not null check (status in ('draft', 'published', 'superseded_draft')),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  summary text not null check (char_length(summary) between 1 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  source_version_id uuid references public.platform_config_versions(id) on delete restrict,
  constraint platform_config_versions_key_version unique (config_key, version_number),
  constraint platform_config_versions_published_at_check
    check ((status = 'published') = (published_at is not null))
);

create unique index if not exists platform_config_versions_one_draft
  on public.platform_config_versions (config_key) where status = 'draft';
create index if not exists platform_config_versions_published_history
  on public.platform_config_versions (config_key, version_number desc)
  where status = 'published';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public'
          and tablename = 'platform_config_versions'
     ) then
    alter publication supabase_realtime add table public.platform_config_versions;
  end if;
end;
$$;

alter table public.platform_config_versions enable row level security;
revoke all on public.platform_config_versions from public, anon, authenticated;
grant select on public.platform_config_versions to anon, authenticated;
grant insert, update on public.platform_config_versions to authenticated;

drop policy if exists "Published app configuration is readable" on public.platform_config_versions;
create policy "Published app configuration is readable"
  on public.platform_config_versions for select to anon, authenticated
  using (status = 'published');

drop policy if exists "Active admins can read all app configuration versions" on public.platform_config_versions;
create policy "Active admins can read all app configuration versions"
  on public.platform_config_versions for select to authenticated
  using ((select public.is_admin()) and (select public.is_active_user()));

drop policy if exists "Active admins can create app configuration versions" on public.platform_config_versions;
create policy "Active admins can create app configuration versions"
  on public.platform_config_versions for insert to authenticated
  with check (
    (select public.is_admin()) and (select public.is_active_user())
    and created_by = (select auth.uid())
  );

drop policy if exists "Active admins can transition app configuration drafts" on public.platform_config_versions;
create policy "Active admins can transition app configuration drafts"
  on public.platform_config_versions for update to authenticated
  using (
    (select public.is_admin()) and (select public.is_active_user()) and status = 'draft'
  )
  with check (
    (select public.is_admin()) and (select public.is_active_user())
    and status in ('published', 'superseded_draft')
  );

-- A strict allowlist keeps the visual config data-only. React text stays text;
-- external destinations and images must use HTTPS; no executable action fields
-- or arbitrary HTML/JavaScript payloads are accepted.
create or replace function public.is_valid_app_builder_config(p_config jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_page jsonb;
  v_section jsonb;
  v_value jsonb;
  v_override jsonb;
  v_page_id text;
  v_key text;
  v_allowed_pages text[] := array['pg_hostels','classes','venues','services','hotel_stay','movies'];
  v_allowed_sections text[] := array[
    'top_announcements','custom_page_hero','spotlight_subcategories',
    'filter_and_quick_actions','spotlight_showcase','trending_near_me',
    'search_date_range_filter','listings_grid','recently_viewed'
  ];
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object'
     or pg_column_size(p_config) > 262144
     or not (p_config ?& array['globalBrandName','globalTagline','globalAnnouncementBarText',
       'globalSupportLink','pages','domOverrides']) then
    return false;
  end if;

  for v_key in select jsonb_object_keys(p_config) loop
    if v_key <> all(array['versionId','lastPublishedAt','publishedBy','globalBrandName',
      'globalTagline','globalAnnouncementBarText','globalSupportLink','pages','domOverrides']) then
      return false;
    end if;
  end loop;
  if jsonb_typeof(p_config->'pages') <> 'object'
     or jsonb_typeof(p_config->'domOverrides') <> 'object'
     or (select count(*) from jsonb_object_keys(p_config->'pages')) <> 6
     or (select count(*) from jsonb_object_keys(p_config->'domOverrides')) > 200
     or jsonb_typeof(p_config->'globalBrandName') <> 'string'
     or jsonb_typeof(p_config->'globalTagline') <> 'string'
     or jsonb_typeof(p_config->'globalAnnouncementBarText') <> 'string'
     or jsonb_typeof(p_config->'globalSupportLink') <> 'string'
     or char_length(coalesce(p_config->>'globalBrandName','')) not between 1 and 100
     or char_length(coalesce(p_config->>'globalTagline','')) > 300
     or char_length(coalesce(p_config->>'globalAnnouncementBarText','')) > 500
     or char_length(coalesce(p_config->>'globalSupportLink','')) > 500
     or coalesce(p_config->>'globalSupportLink','') !~* '^https://'
     or (p_config->>'globalSupportLink') ~* '^(javascript|data|vbscript):' then
    return false;
  end if;

  for v_page_id, v_page in select key, value from jsonb_each(p_config->'pages') loop
    if v_page_id <> all(v_allowed_pages) or jsonb_typeof(v_page) <> 'object'
       or v_page->>'pageId' <> v_page_id
       or jsonb_typeof(v_page->'pageName') <> 'string'
       or jsonb_typeof(v_page->'icon') <> 'string'
       or jsonb_typeof(v_page->'heroBanner') <> 'object'
       or jsonb_typeof(v_page->'labelsAndButtons') <> 'object'
       or jsonb_typeof(v_page->'sections') <> 'array'
       or jsonb_typeof(v_page->'colors') <> 'object'
       or jsonb_typeof(v_page->'categories') <> 'array'
       or jsonb_typeof(v_page->'formOptions') <> 'array' then
      return false;
    end if;
    if char_length(v_page->>'pageName') > 120 or char_length(v_page->>'icon') > 20 then return false; end if;
    if not (v_page->'heroBanner' ?& array['visible','badgeText','headline','subheadline','imageUrl',
      'ctaButtonText','ctaButtonLinkOrAction','secondaryButtonText','bgColorFrom','bgColorTo','textColor'])
       or jsonb_typeof(v_page->'heroBanner'->'visible') <> 'boolean'
       or not (v_page->'labelsAndButtons' ?& array['pageHeadingTitle','pageSubheading','primaryBookButtonLabel',
         'secondaryEnquireButtonLabel','filterButtonLabel','postFreeListingButtonLabel','emptyStateTitle',
         'emptyStateSubtitle','promoRibbonText','promoRibbonLink'])
       or not (v_page->'colors' ?& array['primaryColor','accentColor','cardBorderColor','badgeBgColor','buttonRadius'])
       or exists (select 1 from jsonb_each(v_page->'heroBanner') h
          where h.key <> 'visible' and jsonb_typeof(h.value) <> 'string')
       or exists (select 1 from jsonb_each(v_page->'labelsAndButtons') l
          where jsonb_typeof(l.value) <> 'string')
       or exists (select 1 from jsonb_each(v_page->'colors') c
          where jsonb_typeof(c.value) <> 'string') then return false; end if;
    for v_key in select jsonb_object_keys(v_page) loop
      if v_key <> all(array['pageId','pageName','icon','heroBanner','labelsAndButtons',
        'sections','colors','categories','formOptions']) then return false; end if;
    end loop;
    for v_key in select jsonb_object_keys(v_page->'heroBanner') loop
      if v_key <> all(array['visible','badgeText','headline','subheadline','imageUrl',
        'ctaButtonText','ctaButtonLinkOrAction','secondaryButtonText','bgColorFrom','bgColorTo','textColor']) then
        return false;
      end if;
    end loop;
    if exists (select 1 from jsonb_each_text(v_page->'heroBanner') h
      where h.key in ('bgColorFrom','bgColorTo','textColor') and h.value !~ '^#[0-9A-Fa-f]{6}$') then
      return false;
    end if;
    for v_key in select jsonb_object_keys(v_page->'labelsAndButtons') loop
      if v_key <> all(array['pageHeadingTitle','pageSubheading','primaryBookButtonLabel',
        'secondaryEnquireButtonLabel','filterButtonLabel','postFreeListingButtonLabel',
        'emptyStateTitle','emptyStateSubtitle','promoRibbonText','promoRibbonLink']) then
        return false;
      end if;
    end loop;
    for v_key in select jsonb_object_keys(v_page->'colors') loop
      if v_key <> all(array['primaryColor','accentColor','cardBorderColor','badgeBgColor','buttonRadius']) then
        return false;
      end if;
    end loop;
    if jsonb_array_length(v_page->'sections') > 32
       or jsonb_array_length(v_page->'categories') > 100
       or jsonb_array_length(v_page->'formOptions') > 50 then return false; end if;

    for v_section in select value from jsonb_array_elements(v_page->'sections') loop
      if jsonb_typeof(v_section) <> 'object'
         or v_section->>'id' <> all(v_allowed_sections)
         or jsonb_typeof(v_section->'label') <> 'string'
         or jsonb_typeof(v_section->'visible') <> 'boolean'
         or jsonb_typeof(v_section->'order') <> 'number'
         or (v_section - array['id','label','visible','order']) <> '{}'::jsonb then
        return false;
      end if;
    end loop;
    for v_section in select value from jsonb_array_elements(v_page->'categories') loop
      if jsonb_typeof(v_section) <> 'object'
         or (v_section - array['id','label','icon','visible','featuredBadge']) <> '{}'::jsonb
         or jsonb_typeof(v_section->'id') <> 'string'
         or jsonb_typeof(v_section->'label') <> 'string'
         or jsonb_typeof(v_section->'icon') <> 'string'
         or (v_section ? 'featuredBadge' and jsonb_typeof(v_section->'featuredBadge') <> 'string')
         or char_length(coalesce(v_section->>'label','')) > 100
         or jsonb_typeof(v_section->'visible') <> 'boolean' then return false; end if;
    end loop;
    for v_section in select value from jsonb_array_elements(v_page->'formOptions') loop
      if jsonb_typeof(v_section) <> 'object'
         or (v_section - array['id','fieldLabel','fieldType','required','options']) <> '{}'::jsonb
         or jsonb_typeof(v_section->'id') <> 'string'
         or jsonb_typeof(v_section->'fieldLabel') <> 'string'
         or v_section->>'fieldType' <> all(array['select','radio','checkbox','chips'])
         or jsonb_typeof(v_section->'required') <> 'boolean'
         or jsonb_typeof(v_section->'options') <> 'array'
         or char_length(coalesce(v_section->>'fieldLabel','')) > 120
         or jsonb_array_length(v_section->'options') > 100 then return false; end if;
      for v_value in select value from jsonb_array_elements(v_section->'options') loop
        if jsonb_typeof(v_value) <> 'string' then return false; end if;
      end loop;
    end loop;
    if exists (select 1 from jsonb_object_keys(v_page->'colors') k
      where k <> all(array['primaryColor','accentColor','cardBorderColor','badgeBgColor','buttonRadius']))
       or coalesce(v_page->'colors'->>'buttonRadius','') not in ('rounded-lg','rounded-xl','rounded-2xl','rounded-full')
       or exists (select 1 from jsonb_each_text(v_page->'colors') c
         where c.key <> 'buttonRadius' and c.value !~ '^#[0-9A-Fa-f]{6}$') then return false; end if;

    if coalesce(v_page->'heroBanner'->>'imageUrl','') <> ''
       and v_page->'heroBanner'->>'imageUrl' !~* '^https://' then return false; end if;
    if coalesce(v_page->'heroBanner'->>'ctaButtonLinkOrAction','') <> ''
       and v_page->'heroBanner'->>'ctaButtonLinkOrAction' !~* '^(https://|/|#)' then return false; end if;
    if coalesce(v_page->'labelsAndButtons'->>'promoRibbonLink','') <> ''
       and v_page->'labelsAndButtons'->>'promoRibbonLink' !~* '^(https://|/|#)' then return false; end if;
  end loop;
  if exists (select 1 from jsonb_object_keys(p_config->'pages') k where k <> all(v_allowed_pages)) then
    return false;
  end if;

  for v_key, v_override in select key, value from jsonb_each(p_config->'domOverrides') loop
    if jsonb_typeof(v_override) <> 'object'
       or v_override->>'selectorKey' <> v_key
       or v_key !~ '^[A-Za-z0-9_-]{1,120}$'
       or v_override->>'pageId' <> all(v_allowed_pages)
       or jsonb_typeof(v_override->'originalText') <> 'string'
       or coalesce(v_override->>'tagName','') !~ '^(DIV|SPAN|P|H1|H2|H3|H4|H5|H6|BUTTON|A|IMG|SECTION|LABEL|LI|UL|OL|STRONG|EM|SMALL|B|I)$'
       or (v_override ? 'customText' and jsonb_typeof(v_override->'customText') <> 'string')
       or (v_override ? 'customImageUrl' and jsonb_typeof(v_override->'customImageUrl') <> 'string')
       or (v_override ? 'customHref' and jsonb_typeof(v_override->'customHref') <> 'string')
       or (v_override ? 'customBgColor' and jsonb_typeof(v_override->'customBgColor') <> 'string')
       or (v_override ? 'customTextColor' and jsonb_typeof(v_override->'customTextColor') <> 'string')
       or (v_override ? 'hidden' and jsonb_typeof(v_override->'hidden') <> 'boolean')
       or (v_override ? 'updatedAt' and jsonb_typeof(v_override->'updatedAt') <> 'string')
       or char_length(coalesce(v_override->>'originalText','')) > 120
       or (v_override ? 'customImageUrl' and coalesce(v_override->>'customImageUrl','') <> ''
           and v_override->>'customImageUrl' !~* '^https://')
       or (v_override ? 'customHref' and coalesce(v_override->>'customHref','') <> ''
           and v_override->>'customHref' !~* '^(https://|/|#)')
       or char_length(coalesce(v_override->>'customText','')) > 500
       or (v_override - array['selectorKey','tagName','pageId','originalText','customText',
         'customImageUrl','customHref','customBgColor','customTextColor','hidden','updatedAt']) <> '{}'::jsonb then
      return false;
    end if;
    if (v_override ? 'customBgColor' and coalesce(v_override->>'customBgColor','') <> ''
          and v_override->>'customBgColor' !~ '^#[0-9A-Fa-f]{6}$')
       or (v_override ? 'customTextColor' and coalesce(v_override->>'customTextColor','') <> ''
          and v_override->>'customTextColor' !~ '^#[0-9A-Fa-f]{6}$') then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.guard_app_builder_config_version_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_valid_app_builder_config(new.config)
       or (new.status = 'draft' and new.published_at is not null)
       or (new.status = 'published' and (new.published_at is null or new.source_version_id is null))
       or new.status = 'superseded_draft' then
      raise exception 'APP_CONFIG_VERSION_INVALID';
    end if;
    return new;
  end if;
  if old.status <> 'draft'
     or new.id <> old.id
     or new.config_key <> old.config_key
     or new.version_number <> old.version_number
     or new.config <> old.config
     or new.summary <> old.summary
     or new.created_by <> old.created_by
     or new.created_at <> old.created_at
     or new.source_version_id is distinct from old.source_version_id
     or new.status not in ('published','superseded_draft') then
    raise exception 'APP_CONFIG_VERSION_IMMUTABLE';
  end if;
  if (new.status = 'published') <> (new.published_at is not null) then
    raise exception 'APP_CONFIG_PUBLISH_TIMESTAMP_INVALID';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_app_builder_config_version_update on public.platform_config_versions;
create trigger guard_app_builder_config_version_update
  before insert or update on public.platform_config_versions
  for each row execute function public.guard_app_builder_config_version_update();

create or replace function public.save_app_builder_config_draft(p_config jsonb, p_summary text default 'Saved draft')
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_number bigint;
  v_row public.platform_config_versions;
begin
  if v_uid is null or not public.is_admin() or not public.is_active_user() then
    raise exception 'APP_CONFIG_ADMIN_REQUIRED';
  end if;
  if not public.is_valid_app_builder_config(p_config) then
    raise exception 'APP_CONFIG_SCHEMA_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtext('platform_config_versions:global')::bigint);
  update public.platform_config_versions set status = 'superseded_draft'
   where config_key = 'global' and status = 'draft';
  select coalesce(max(version_number), 0) + 1 into v_number
    from public.platform_config_versions where config_key = 'global';
  insert into public.platform_config_versions
    (config_key,version_number,status,config,summary,created_by)
  values ('global',v_number,'draft',p_config,left(coalesce(nullif(trim(p_summary),''),'Saved draft'),500),v_uid)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.publish_app_builder_config_draft(p_draft_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.platform_config_versions;
begin
  if v_uid is null or not public.is_admin() or not public.is_active_user() then
    raise exception 'APP_CONFIG_ADMIN_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtext('platform_config_versions:global')::bigint);
  update public.platform_config_versions
     set status = 'published', published_at = now()
   where id = p_draft_id and config_key = 'global' and status = 'draft'
  returning * into v_row;
  if not found then raise exception 'APP_CONFIG_DRAFT_NOT_FOUND'; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.rollback_app_builder_config(p_target_version_id uuid, p_summary text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_target public.platform_config_versions;
  v_row public.platform_config_versions;
  v_number bigint;
begin
  if v_uid is null or not public.is_admin() or not public.is_active_user() then
    raise exception 'APP_CONFIG_ADMIN_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtext('platform_config_versions:global')::bigint);
  select * into v_target from public.platform_config_versions
   where id = p_target_version_id and config_key = 'global' and status = 'published';
  if not found then raise exception 'APP_CONFIG_TARGET_VERSION_NOT_FOUND'; end if;
  update public.platform_config_versions set status = 'superseded_draft'
   where config_key = 'global' and status = 'draft';
  select coalesce(max(version_number), 0) + 1 into v_number
    from public.platform_config_versions where config_key = 'global';
  insert into public.platform_config_versions
    (config_key,version_number,status,config,summary,created_by,published_at,source_version_id)
  values (
    'global',v_number,'published',v_target.config,
    left(coalesce(nullif(trim(p_summary),''),'Rollback to version '||v_target.version_number),500),
    v_uid,now(),v_target.id
  ) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.is_valid_app_builder_config(jsonb) from public, anon, authenticated;
revoke all on function public.guard_app_builder_config_version_update() from public, anon, authenticated;
revoke all on function public.save_app_builder_config_draft(jsonb,text) from public, anon;
revoke all on function public.publish_app_builder_config_draft(uuid) from public, anon;
revoke all on function public.rollback_app_builder_config(uuid,text) from public, anon;
grant execute on function public.save_app_builder_config_draft(jsonb,text) to authenticated;
grant execute on function public.publish_app_builder_config_draft(uuid) to authenticated;
grant execute on function public.rollback_app_builder_config(uuid,text) to authenticated;
grant execute on function public.is_valid_app_builder_config(jsonb) to authenticated;

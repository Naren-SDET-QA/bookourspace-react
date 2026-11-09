-- Append-only, PostgreSQL-backed audit trail for the Live Edit / App Builder
-- configuration.
--
-- Every draft save, publish and rollback that mutates
-- public.platform_config_versions now records an audit event. The actor is
-- derived server-side from auth.uid() (the verified JWT subject) inside a
-- SECURITY DEFINER trigger — never from the client payload — and the role and
-- email are read from public.profiles at the moment of the write. Clients have
-- no INSERT/UPDATE/DELETE privilege on the table, so the trail can only be
-- produced by the trusted trigger, and a guard trigger rejects any attempt to
-- rewrite or remove an existing event.
--
-- Version persistence, publish and rollback behaviour are unchanged: this
-- migration only observes those writes.

begin;

create table if not exists public.app_builder_audit_events (
  id uuid primary key default gen_random_uuid(),
  config_key text not null default 'global' check (config_key = 'global'),
  version_id uuid not null references public.platform_config_versions(id) on delete restrict,
  version_number bigint not null check (version_number > 0),
  action text not null check (action in ('save_draft', 'publish', 'rollback')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null check (actor_role in ('admin', 'service', 'unknown')),
  actor_email text,
  -- 'session' = auth.uid() from the verified request JWT;
  -- 'created_by' = trusted server write with no end-user session (service role).
  actor_source text not null check (actor_source in ('session', 'created_by')),
  summary text not null check (char_length(summary) between 1 and 500),
  source_version_id uuid references public.platform_config_versions(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists app_builder_audit_events_recent
  on public.app_builder_audit_events (created_at desc);
create index if not exists app_builder_audit_events_version
  on public.app_builder_audit_events (version_id);

alter table public.app_builder_audit_events enable row level security;

-- No client write privilege at all: the SECURITY DEFINER trigger is the only
-- writer, so an event cannot be forged, altered or replayed by an app session.
revoke all on table public.app_builder_audit_events from public, anon, authenticated;
grant select on table public.app_builder_audit_events to authenticated;

drop policy if exists "Active admins read App Builder audit events" on public.app_builder_audit_events;
create policy "Active admins read App Builder audit events"
  on public.app_builder_audit_events for select to authenticated
  using ((select public.is_admin()) and (select public.is_active_user()));

create or replace function public.record_app_builder_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_actor uuid := auth.uid();
  v_actor uuid;
  v_source text;
  v_role text;
  v_email text;
  v_action text;
begin
  if tg_op = 'UPDATE' then
    -- Only a draft becoming published is an audited transition. The side effect
    -- that supersedes an older draft is bookkeeping, not an actor action.
    if old.status <> 'draft' or new.status <> 'published' then
      return new;
    end if;
    v_action := 'publish';
  else
    if new.status = 'draft' then
      v_action := 'save_draft';
    elsif new.status = 'published' and new.source_version_id is not null then
      v_action := 'rollback';
    else
      return new;
    end if;
  end if;

  if v_session_actor is not null then
    v_actor := v_session_actor;
    v_source := 'session';
  else
    v_actor := new.created_by;
    v_source := 'created_by';
  end if;

  select profile.role, profile.email into v_role, v_email
    from public.profiles profile
   where profile.id = v_actor;

  insert into public.app_builder_audit_events
    (config_key, version_id, version_number, action, actor_user_id, actor_role,
     actor_email, actor_source, summary, source_version_id)
  values
    (new.config_key, new.id, new.version_number, v_action, v_actor,
     coalesce(nullif(v_role, ''), case when v_source = 'session' then 'unknown' else 'service' end),
     v_email, v_source, new.summary, new.source_version_id);

  return new;
end;
$$;

create or replace function public.reject_app_builder_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'APP_BUILDER_AUDIT_APPEND_ONLY';
end;
$$;

drop trigger if exists app_builder_audit_events_record on public.platform_config_versions;
create trigger app_builder_audit_events_record
  after insert or update on public.platform_config_versions
  for each row execute function public.record_app_builder_audit_event();

drop trigger if exists app_builder_audit_events_append_only on public.app_builder_audit_events;
create trigger app_builder_audit_events_append_only
  before update or delete on public.app_builder_audit_events
  for each row execute function public.reject_app_builder_audit_mutation();

drop trigger if exists app_builder_audit_events_no_truncate on public.app_builder_audit_events;
create trigger app_builder_audit_events_no_truncate
  before truncate on public.app_builder_audit_events
  for each statement execute function public.reject_app_builder_audit_mutation();

revoke all on function public.record_app_builder_audit_event() from public, anon, authenticated;
revoke all on function public.reject_app_builder_audit_mutation() from public, anon, authenticated;

commit;

-- ============================================================================
-- BookOurSpace Super Admin bootstrap — OWNER-RUN ONLY
--
-- Wraps private.bootstrap_super_admin() (20261105114000 + guards) in an
-- operator-friendly, confirmation-gated transaction.
--
-- The underlying routine already requires:
--   * a database-owner session (postgres / supabase_admin)
--   * a confirmed Google Auth user
--   * an active profile
--   * a reason of 5..1000 characters
-- and writes one user_access_audit_events row. This script adds:
--   * an explicit dry run that rolls the whole transaction back
--   * a confirmation token so an accidental paste cannot promote anyone
--   * a single target resolved from the owner-verified Auth UUID or email
--
-- Usage (after explicit owner approval):
--
-- Pass exactly one target: the verified Google Auth UUID or its email.
-- Prefer the UUID so the owner-approved target cannot change if an email is
-- later reassigned.
--
--   # dry run
--   psql "$BOS_OWNER_DATABASE_URL" \
--     -v bootstrap_user_id='00000000-0000-4000-8000-000000000000' \
--     -v bootstrap_confirm=DRY-RUN \
--     -v bootstrap_note='2026-11-05 approved by owner' \
--     -f supabase/bootstrap_super_admin.sql
--
--   # apply
--   psql "$BOS_OWNER_DATABASE_URL" \
--     -v bootstrap_user_id='00000000-0000-4000-8000-000000000000' \
--     -v bootstrap_confirm=BOOTSTRAP-SUPER-ADMIN \
--     -v bootstrap_note='2026-11-05 approved by owner' \
--     -f supabase/bootstrap_super_admin.sql
--
-- Email mode remains available for an existing workflow, but it must resolve
-- exactly one Auth user. Run it as the owner connection, never through
-- PostgREST, the browser or the application server.
-- ============================================================================

\set ON_ERROR_STOP on

\if :{?bootstrap_email}
\else
  select set_config('bos.bootstrap_email', '', false);
\endif

\if :{?bootstrap_user_id}
\else
  select set_config('bos.bootstrap_user_id', '', false);
\endif

\if :{?bootstrap_confirm}
\else
  do $$ begin raise exception 'BOOTSTRAP_CONFIRMATION_REQUIRED: pass -v bootstrap_confirm=DRY-RUN or BOOTSTRAP-SUPER-ADMIN'; end $$;
\endif

\if :{?bootstrap_note}
\else
  do $$ begin raise exception 'BOOTSTRAP_NOTE_REQUIRED: pass -v bootstrap_note=...'; end $$;
\endif

\if :{?bootstrap_email}
  select set_config('bos.bootstrap_email', :'bootstrap_email', false);
\endif
\if :{?bootstrap_user_id}
  select set_config('bos.bootstrap_user_id', :'bootstrap_user_id', false);
\endif
select set_config('bos.bootstrap_confirm', :'bootstrap_confirm', false),
       set_config('bos.bootstrap_note', :'bootstrap_note', false);

do $$
begin
  if coalesce(current_setting('bos.bootstrap_confirm', true), '')
     not in ('DRY-RUN', 'BOOTSTRAP-SUPER-ADMIN') then
    raise exception 'BOOTSTRAP_CONFIRMATION_INVALID: use DRY-RUN or BOOTSTRAP-SUPER-ADMIN'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(current_setting('bos.bootstrap_email', true), '')), '') is null
     and nullif(btrim(coalesce(current_setting('bos.bootstrap_user_id', true), '')), '') is null then
    raise exception 'BOOTSTRAP_TARGET_REQUIRED: pass exactly one of bootstrap_user_id or bootstrap_email'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(current_setting('bos.bootstrap_email', true), '')), '') is not null
     and nullif(btrim(coalesce(current_setting('bos.bootstrap_user_id', true), '')), '') is not null then
    raise exception 'BOOTSTRAP_TARGET_AMBIGUOUS: pass only bootstrap_user_id or bootstrap_email'
      using errcode = '42501';
  end if;
end $$;

begin;

-- Resolve exactly one Auth identity, refusing unknown, malformed and
-- ambiguous targets before the promoting routine runs.
do $$
declare
  v_email text := lower(btrim(coalesce(current_setting('bos.bootstrap_email', true), '')));
  v_uid_text text := btrim(coalesce(current_setting('bos.bootstrap_user_id', true), ''));
  v_count integer;
  v_uid uuid;
begin
  if v_uid_text <> '' then
    begin
      v_uid := v_uid_text::uuid;
    exception when invalid_text_representation then
      raise exception 'BOOTSTRAP_USER_ID_INVALID: bootstrap_user_id must be a UUID'
        using errcode = '22023';
    end;
    select count(*) into v_count from auth.users where id = v_uid;
    if v_count = 0 then
      raise exception 'BOOTSTRAP_TARGET_NOT_FOUND: no Auth user has id %', v_uid
        using errcode = 'P0002';
    end if;
  else
    select count(*) into v_count
      from auth.users
     where lower(email) = v_email;
    if v_count = 0 then
      raise exception 'BOOTSTRAP_TARGET_NOT_FOUND: no Auth user has email %', v_email
        using errcode = 'P0002';
    end if;
    if v_count > 1 then
      raise exception 'BOOTSTRAP_TARGET_NOT_UNIQUE: % Auth users have email %', v_count, v_email
        using errcode = 'P0002';
    end if;
    select id into v_uid
      from auth.users
     where lower(email) = v_email
     order by id
     limit 1;
  end if;
  perform set_config('bos.target_uid', v_uid::text, false);
end $$;

select *
  from private.bootstrap_super_admin(
    current_setting('bos.target_uid')::uuid,
    current_setting('bos.bootstrap_note', true)
  );

select case
         when current_setting('bos.bootstrap_confirm', true) = 'BOOTSTRAP-SUPER-ADMIN'
         then 'true' else 'false'
       end as bos_commit
\gset

\if :bos_commit
commit;
\echo 'COMMITTED: Super Admin bootstrap applied'
\else
rollback;
\echo 'ROLLED BACK: dry run, no changes written'
\endif

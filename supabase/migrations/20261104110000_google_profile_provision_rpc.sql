-- Let the server provision/update only the caller's public profile after it
-- has verified a Google session. Identity and email come from auth.uid() and
-- auth.users; callers cannot choose a profile id, email, role or status.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

drop function if exists private.provision_google_profile(text, text, text);

create function private.provision_google_profile(
  p_full_name text default null,
  p_avatar_url text default null,
  p_google_sub text default null
)
returns table (
  profile_id uuid,
  email text,
  full_name text,
  role text,
  account_status text,
  avatar_url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  auth_email text;
begin
  if actor_id is null then
    raise exception 'VERIFIED_AUTH_ID_REQUIRED' using errcode = '28000';
  end if;

  select lower(nullif(btrim(users.email), ''))
    into auth_email
    from auth.users users
   where users.id = actor_id;

  if auth_email is null then
    raise exception 'AUTH_USER_NOT_FOUND' using errcode = '28000';
  end if;

  return query
  insert into public.profiles as existing
    (id, email, full_name, role, account_status, verified, avatar_url, google_sub, last_login_at)
  values
    (actor_id, auth_email, nullif(left(btrim(coalesce(p_full_name, '')), 120), ''),
     'customer', 'active', true, nullif(left(btrim(coalesce(p_avatar_url, '')), 2048), ''),
     nullif(left(btrim(coalesce(p_google_sub, '')), 255), ''), now())
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(existing.full_name, ''), excluded.full_name),
    avatar_url = coalesce(excluded.avatar_url, existing.avatar_url),
    google_sub = coalesce(existing.google_sub, excluded.google_sub),
    last_login_at = now(),
    updated_at = now()
  where existing.account_status = 'active'
    and (existing.google_sub is null or excluded.google_sub is null or existing.google_sub = excluded.google_sub)
  returning existing.id, existing.email, existing.full_name, existing.role,
            existing.account_status, existing.avatar_url;

  if not found then
    raise exception 'PROFILE_IDENTITY_CONFLICT_OR_INACTIVE' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.provision_google_profile(text, text, text) from public, anon;
grant execute on function private.provision_google_profile(text, text, text) to authenticated;

commit;

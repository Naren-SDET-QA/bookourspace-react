-- Idempotently create profiles for Google Auth users who existed before the
-- public schema/trigger was installed. Never update an existing profile: its
-- role, status, verification and any legitimate prior state remain authoritative.
-- Run only after baseline + all reviewed migrations have been installed.
begin;

insert into public.profiles (
  id,
  email,
  full_name,
  phone,
  role,
  google_sub,
  avatar_url,
  account_status,
  verified,
  last_login_at
)
select
  users.id,
  lower(nullif(btrim(users.email), '')),
  coalesce(
    nullif(left(btrim(coalesce(users.raw_user_meta_data->>'full_name', users.raw_user_meta_data->>'name', '')), 120), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'Marketplace User'
  ),
  nullif(left(btrim(coalesce(users.raw_user_meta_data->>'phone', '')), 40), ''),
  'customer',
  nullif(left(btrim(coalesce(
    google_identity.identity_data->>'sub',
    google_identity.identity_data->>'provider_id'
  )), 255), ''),
  nullif(left(btrim(coalesce(
    users.raw_user_meta_data->>'avatar_url',
    users.raw_user_meta_data->>'picture',
    ''
  )), 2048), ''),
  case when users.email_confirmed_at is not null then 'active' else 'pending_verification' end,
  users.email_confirmed_at is not null,
  users.last_sign_in_at
from auth.users as users
join lateral (
  select identities.identity_data
  from auth.identities as identities
  where identities.user_id = users.id
    and identities.provider = 'google'
  order by coalesce(
    (to_jsonb(identities)->>'last_sign_in_at')::timestamptz,
    (to_jsonb(identities)->>'last_sign_in')::timestamptz
  ) desc nulls last
  limit 1
) as google_identity on true
where nullif(btrim(users.email), '') is not null
on conflict (id) do nothing;

commit;

-- Replace the owner-security profile view with an invoker-security view over a
-- separate public-only projection table. Keep the original relation name and
-- column contract, while never granting anon/authenticated access to private
-- profile columns. Safe to reapply in local idempotency tests.
begin;

create schema if not exists private;

create table if not exists public.public_provider_profile_projection (
  id uuid primary key references public.profiles(id) on delete cascade,
  full_name text,
  avatar_url text,
  city text,
  verified boolean not null default true check (verified is true)
);

alter table public.public_provider_profile_projection enable row level security;
revoke all on table public.public_provider_profile_projection from public, anon, authenticated;
grant select on table public.public_provider_profile_projection to anon, authenticated;
drop policy if exists "Public verified provider projection is readable"
  on public.public_provider_profile_projection;
create policy "Public verified provider projection is readable"
  on public.public_provider_profile_projection
  for select to anon, authenticated
  using (true);

create or replace function private.sync_public_provider_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.public_provider_profile_projection where id = old.id;
    return old;
  end if;

  if new.role = 'provider'
     and new.account_status = 'active'
     and new.verified is true then
    insert into public.public_provider_profile_projection (id, full_name, avatar_url, city, verified)
    values (new.id, new.full_name, new.avatar_url, new.city, true)
    on conflict (id) do update set
      full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      city = excluded.city,
      verified = true;
  else
    delete from public.public_provider_profile_projection where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_public_provider_profile() from public, anon, authenticated;

drop trigger if exists sync_public_provider_profile_after_write on public.profiles;
create trigger sync_public_provider_profile_after_write
  after insert or update on public.profiles
  for each row execute function private.sync_public_provider_profile();
drop trigger if exists sync_public_provider_profile_after_delete on public.profiles;
create trigger sync_public_provider_profile_after_delete
  after delete on public.profiles
  for each row execute function private.sync_public_provider_profile();

insert into public.public_provider_profile_projection (id, full_name, avatar_url, city, verified)
select id, full_name, avatar_url, city, true
  from public.profiles
 where role = 'provider'
   and account_status = 'active'
   and verified is true
on conflict (id) do update set
  full_name = excluded.full_name,
  avatar_url = excluded.avatar_url,
  city = excluded.city,
  verified = true;

create or replace view public.public_provider_profiles
with (security_barrier = true, security_invoker = true)
as
  select id, full_name, avatar_url, city, verified
    from public.public_provider_profile_projection;
revoke all on table public.public_provider_profiles from public;
grant select on table public.public_provider_profiles to anon, authenticated;

commit;

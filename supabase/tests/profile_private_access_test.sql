-- Profile privacy and least-privilege regression checks. Run only against the
-- disposable local PostgreSQL cluster created by run_local_validation.sh.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('91111111-1111-4111-8111-111111111111', 'profile-customer@example.test', '{}'),
  ('92222222-2222-4222-8222-222222222222', 'profile-provider@example.test', '{}'),
  ('93333333-3333-4333-8333-333333333333', 'profile-admin@example.test', '{}'),
  ('94444444-4444-4444-8444-444444444444', 'profile-unrelated@example.test', '{}')
on conflict (id) do nothing;

update public.profiles set
  role = case id
    when '92222222-2222-4222-8222-222222222222'::uuid then 'provider'
    when '93333333-3333-4333-8333-333333333333'::uuid then 'admin'
    else 'customer'
  end,
  account_status = 'active',
  verified = true,
  full_name = case id
    when '91111111-1111-4111-8111-111111111111'::uuid then 'Test Customer'
    when '92222222-2222-4222-8222-222222222222'::uuid then 'Test Provider'
    when '93333333-3333-4333-8333-333333333333'::uuid then 'Test Admin'
    else 'Unrelated User'
  end,
  phone = '555-0100'
where id in (
  '91111111-1111-4111-8111-111111111111',
  '92222222-2222-4222-8222-222222222222',
  '93333333-3333-4333-8333-333333333333',
  '94444444-4444-4444-8444-444444444444'
);

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, status)
values ('profile-privacy-listing', '92222222-2222-4222-8222-222222222222', 'Private access test', 'services', 'test', 'service', 0, 'active')
on conflict (id) do nothing;
insert into public.bookings (
  id, user_id, listing_id, listing_title, provider_id, customer_name,
  customer_phone, scheduled_date, scheduled_time, amount, status
) values (
  'profile-privacy-booking', '91111111-1111-4111-8111-111111111111',
  'profile-privacy-listing', 'Private access test', '92222222-2222-4222-8222-222222222222',
  'Test Customer', '555-0100', '2027-07-01', '10:00', 0, 'confirmed'
) on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91111111-1111-4111-8111-111111111111', true);
do $$ begin
  if not exists (select 1 from public.profiles where id = auth.uid() and email = 'profile-customer@example.test') then
    raise exception 'FAIL customer cannot read own profile';
  end if;
  if not exists (select 1 from public.profiles where id = '92222222-2222-4222-8222-222222222222') then
    raise exception 'FAIL customer cannot read booking provider profile';
  end if;
  if exists (select 1 from public.profiles where id = '94444444-4444-4444-8444-444444444444') then
    raise exception 'FAIL customer can read unrelated private profile';
  end if;
  if exists (
    select 1
    from pg_class relation
    cross join lateral aclexplode(relation.relacl) privilege
    where relation.oid = 'public.profiles'::regclass
      and privilege.grantee = (select oid from pg_roles where rolname = current_user)
      and privilege.privilege_type = 'SELECT'
  ) then
    raise exception 'FAIL authenticated retains table-wide profiles SELECT';
  end if;
  if has_column_privilege(current_user, 'public.profiles', 'role', 'UPDATE')
     or has_column_privilege(current_user, 'public.profiles', 'account_status', 'UPDATE') then
    raise exception 'FAIL authenticated can update protected role/status columns';
  end if;
  if not has_column_privilege(current_user, 'public.profiles', 'full_name', 'UPDATE')
     or not has_column_privilege(current_user, 'public.profiles', 'phone', 'UPDATE') then
    raise exception 'FAIL authenticated cannot update allowed own profile fields';
  end if;
  if has_table_privilege(current_user, 'public.profiles', 'DELETE') then
    raise exception 'FAIL authenticated can delete profiles';
  end if;
  if has_column_privilege(current_user, 'public.profiles', 'role', 'INSERT')
     or has_column_privilege(current_user, 'public.profiles', 'email', 'INSERT') then
    raise exception 'FAIL authenticated can supply profile email or role on INSERT';
  end if;
  raise notice 'PASS customer reads self and booking provider only; protected profile writes denied';
  raise notice 'PASS customer cannot supply private email or authorization role on profile INSERT';
  raise notice 'PASS profile UPDATE is limited to name/phone and DELETE is denied';
end $$;

update public.profiles set full_name='Edited Customer', phone='555-0101'
 where id=auth.uid();
do $$ begin
  if not exists (select 1 from public.profiles where id=auth.uid() and full_name='Edited Customer' and phone='555-0101') then
    raise exception 'FAIL customer cannot update own allowed fields';
  end if;
  raise notice 'PASS customer can update own display name and phone';
end $$;

select set_config('request.jwt.claim.sub', '92222222-2222-4222-8222-222222222222', true);
do $$ begin
  if not exists (select 1 from public.profiles where id = auth.uid() and phone = '555-0100') then
    raise exception 'FAIL provider cannot read own profile';
  end if;
  if not exists (select 1 from public.profiles where id = '91111111-1111-4111-8111-111111111111') then
    raise exception 'FAIL provider cannot read booking customer profile';
  end if;
  if exists (select 1 from public.profiles where id = '94444444-4444-4444-8444-444444444444') then
    raise exception 'FAIL provider can read unrelated private profile';
  end if;
  raise notice 'PASS provider reads self and booking customer only';
end $$;

select set_config('request.jwt.claim.sub', '93333333-3333-4333-8333-333333333333', true);
do $$ begin
  if (select count(id) from public.profiles where id in (
    '91111111-1111-4111-8111-111111111111',
    '92222222-2222-4222-8222-222222222222',
    '93333333-3333-4333-8333-333333333333',
    '94444444-4444-4444-8444-444444444444'
  )) <> 4 then
    raise exception 'FAIL active admin cannot read all profiles';
  end if;
  if not exists (select 1 from public.profiles where id = '94444444-4444-4444-8444-444444444444' and email = 'profile-unrelated@example.test') then
    raise exception 'FAIL active admin cannot read profile private fields';
  end if;
  raise notice 'PASS active admin reads private profiles across users';
end $$;

reset role;
do $$ begin
  if (select array_agg(column_name order by ordinal_position)::text
        from information_schema.columns
       where table_schema='public' and table_name='public_provider_profiles')
     <> '{id,full_name,avatar_url,city,verified}' then
    raise exception 'FAIL public provider projection contains unexpected columns';
  end if;
  if has_table_privilege('anon', 'public.profiles', 'SELECT')
     or has_column_privilege('anon', 'public.profiles', 'email', 'SELECT')
     or has_column_privilege('anon', 'public.profiles', 'phone', 'SELECT') then
    raise exception 'FAIL anon has direct private profile access';
  end if;
  raise notice 'PASS public provider projection exposes only five approved columns';
end $$;

update public.profiles set full_name='Projection Sync Name'
 where id='92222222-2222-4222-8222-222222222222';
do $$ begin
  if not exists (select 1 from public.public_provider_profiles
                  where id='92222222-2222-4222-8222-222222222222'
                    and full_name='Projection Sync Name') then
    raise exception 'FAIL provider projection did not sync an approved field update';
  end if;
  raise notice 'PASS approved provider profile fields remain synchronized';
end $$;

update public.profiles set verified=false
 where id='92222222-2222-4222-8222-222222222222';
do $$ begin
  if exists (select 1 from public.public_provider_profiles
              where id='92222222-2222-4222-8222-222222222222') then
    raise exception 'FAIL unverified provider remains in public projection';
  end if;
end $$;
update public.profiles set verified=true, role='provider', account_status='active'
 where id='92222222-2222-4222-8222-222222222222';

set local role authenticated;
select set_config('request.jwt.claim.sub', '91111111-1111-4111-8111-111111111111', true);
do $$ begin
  if not exists (select 1 from public.public_provider_profiles
                  where id='92222222-2222-4222-8222-222222222222') then
    raise exception 'FAIL authenticated customer cannot read safe provider projection';
  end if;
  if has_table_privilege(current_user, 'public.public_provider_profiles', 'INSERT')
     or has_table_privilege(current_user, 'public.public_provider_profiles', 'UPDATE')
     or has_table_privilege(current_user, 'public.public_provider_profiles', 'DELETE') then
    raise exception 'FAIL authenticated can write public provider projection';
  end if;
  raise notice 'PASS customer reads only the RLS-protected public provider projection';
end $$;

reset role;
set local role anon;
do $$ begin
  if has_column_privilege(current_user, 'public.profiles', 'id', 'SELECT') then
    raise exception 'FAIL anon can read profiles table';
  end if;
  if not exists (select 1 from public.public_provider_profiles where id = '92222222-2222-4222-8222-222222222222') then
    raise exception 'FAIL anon cannot read safe public provider projection';
  end if;
  if has_table_privilege(current_user, 'public.public_provider_profiles', 'INSERT')
     or has_table_privilege(current_user, 'public.public_provider_profiles', 'UPDATE')
     or has_table_privilege(current_user, 'public.public_provider_profiles', 'DELETE') then
    raise exception 'FAIL anon can write public provider projection';
  end if;
  raise notice 'PASS anon can only read safe public provider projection';
end $$;

reset role;
rollback;

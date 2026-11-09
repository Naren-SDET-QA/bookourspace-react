\set ON_ERROR_STOP on
begin;
\set uid '99999999-9999-4999-8999-999999999999'
insert into auth.users(id,email) values (:'uid','close-me@example.test')
on conflict (id) do update set email=excluded.email;
insert into public.profiles(id,email,full_name,role,account_status)
values (:'uid','close-me@example.test','Close Me','customer','active')
on conflict (id) do update set email=excluded.email, full_name=excluded.full_name,
  account_status='active', role='customer';
insert into auth.sessions(id,user_id) values ('99999999-9999-4999-8999-999999999998',:'uid');
insert into public.payment_intents(id,user_id,purpose,listing_id,amount_paise,merchant_vpa,upi_uri,idempotency_key,expires_at)
values ('closure-retention-fixture',:'uid','stay_booking','fixture-listing',10000,'merchant@example.test',
  'upi://pay?pa=merchant@example.test','closure-retention-fixture',now()+interval '1 hour')
on conflict (id) do nothing;

select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
begin
  if has_function_privilege(current_user,'public.close_account_server(uuid,timestamp with time zone,text)','EXECUTE') then
    raise exception 'FAIL authenticated can invoke privileged closure routine';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select public.close_account_server(:'uid'::uuid,now(),'local-closure-test');
reset role;

do $$
begin
  if not exists(select 1 from public.profiles where id='99999999-9999-4999-8999-999999999999' and account_status='closed'
      and full_name='Closed account' and email like 'closed+%@account.invalid' and phone is null and avatar_url is null and cover_url is null) then
    raise exception 'FAIL profile not closed and scrubbed';
  end if;
  if exists(select 1 from auth.sessions where user_id='99999999-9999-4999-8999-999999999999') then
    raise exception 'FAIL account sessions were not revoked';
  end if;
  if not exists(select 1 from auth.users where id='99999999-9999-4999-8999-999999999999' and banned_until > now()+interval '99 years') then
    raise exception 'FAIL Auth user was not blocked from future sign-in';
  end if;
  if not exists(select 1 from public.account_closure_audit where profile_id='99999999-9999-4999-8999-999999999999' and retained_financial_records) then
    raise exception 'FAIL closure audit row missing';
  end if;
  if not exists(select 1 from public.payment_intents where id='closure-retention-fixture') then
    raise exception 'FAIL financial record was not retained';
  end if;
  raise notice 'PASS recent authenticated closure scrubs profile PII, revokes sessions, blocks sign-in, audits action and retains payment record';
end $$;

-- Model an already-issued JWT whose expiration is still in the future. Auth
-- refresh sessions have been revoked, but RLS must still deny protected writes
-- while this token remains cryptographically unexpired.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '99999999-9999-4999-8999-999999999999',
  'role', 'authenticated',
  'exp', extract(epoch from now() + interval '1 hour')::bigint
)::text, true);
set local role authenticated;
do $$
begin
  if auth.uid() <> '99999999-9999-4999-8999-999999999999'::uuid then
    raise exception 'FAIL unexpired JWT fixture did not retain the closed account identity';
  end if;
  if extract(epoch from now())::bigint >= (current_setting('request.jwt.claims')::jsonb->>'exp')::bigint then
    raise exception 'FAIL unexpired JWT fixture unexpectedly expired';
  end if;
  if public.is_active_user() then
    raise exception 'FAIL closed account still passes the active-user guard';
  end if;
  if exists(select 1 from public.profiles where id=auth.uid()) then
    raise exception 'FAIL closed account with an unexpired JWT read its own profile';
  end if;
  begin
    insert into public.provider_registration_requests
      (user_id, request_id, provider_type, business_name, contact_phone, city, area)
    values (auth.uid(), gen_random_uuid(), 'services', 'Closed account fixture', '1234567890', 'District', 'Village');
    raise exception 'FAIL closed account with an unexpired JWT submitted a provider registration';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into storage.objects (bucket_id, name)
    values ('bos-private-profile-media', auth.uid()::text || '/profile_avatar/closed-account.webp');
    raise exception 'FAIL closed account with an unexpired JWT uploaded profile media';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'PASS unexpired JWT cannot read profile, register or upload after account closure';
end $$;
reset role;

rollback;

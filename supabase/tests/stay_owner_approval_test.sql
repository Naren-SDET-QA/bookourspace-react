-- Disposable PostgreSQL fixture only. The runner has no Supabase connection.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-000000000001', 'owner@example.test', '{}'),
  ('a1000000-0000-4000-8000-000000000002', 'superadmin@example.test', '{}'),
  ('a1000000-0000-4000-8000-000000000003', 'customer@example.test', '{}')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role, account_status, verified, is_super_admin) values
  ('a1000000-0000-4000-8000-000000000001', 'owner@example.test', 'Stay Owner', 'customer', 'active', false, false),
  ('a1000000-0000-4000-8000-000000000002', 'superadmin@example.test', 'Reviewer', 'admin', 'active', true, true),
  ('a1000000-0000-4000-8000-000000000003', 'customer@example.test', 'Customer', 'customer', 'active', false, false)
on conflict (id) do update set role = excluded.role, account_status = excluded.account_status,
  verified = excluded.verified, is_super_admin = excluded.is_super_admin;

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
create temporary table stay_owner_draft_result as
select public.create_stay_owner_draft('Local Approval Stay', 'Local Approval Stay', 'Pune', 'hotel', 'Central', 'Fixture address') as result;
do $$
declare v_listing text := (select result->>'listingId' from stay_owner_draft_result);
        v_property uuid := (select (result->>'propertyId')::uuid from stay_owner_draft_result);
        v_room uuid;
begin
  update public.stay_properties set base_price_paise = 250000 where id = v_property;
  insert into public.stay_room_types (property_id, name, max_adults, base_price_paise)
  values (v_property, 'Standard', 2, 250000) returning id into v_room;
  insert into public.stay_units (room_type_id, label) values (v_room, '101');
end $$;
select public.save_stay_listing_documents(
  (select result->>'listingId' from stay_owner_draft_result),
  '{"images":["storage://bos-public-media/stay/test-cover.webp"],"verificationDocuments":[{"kind":"gst_certificate"},{"kind":"property_ownership"},{"kind":"government_id"}]}'::jsonb
);
select public.submit_stay_listing_for_review((select result->>'listingId' from stay_owner_draft_result));

do $$
declare v_listing text := (select result->>'listingId' from stay_owner_draft_result);
begin
  begin
    insert into public.bookings (
      id, user_id, listing_id, listing_title, provider_id, customer_name,
      customer_phone, scheduled_date, scheduled_time, amount, status, payload
    ) values (
      'unapproved-stay-checkout-test', 'a1000000-0000-4000-8000-000000000001',
      v_listing, 'Local Approval Stay', 'a1000000-0000-4000-8000-000000000001',
      'Guest', '555-0101', '2027-01-10', 'nightly', 2500, 'confirmed',
      '{"source":"stay_checkout"}'::jsonb
    );
    raise exception 'FAIL: stay checkout was accepted before owner and listing approval';
  exception when insufficient_privilege then
    if sqlerrm <> 'STAY_NOT_PUBLICLY_BOOKABLE' then raise; end if;
    raise notice 'PASS: checkout insert is denied until owner verification, listing approval and public inventory are valid';
  end;
end $$;

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.review_stay_listing((select result->>'listingId' from stay_owner_draft_result), 'approve', '', false);
    raise exception 'FAIL: customer approved a stay';
  exception when sqlstate '42501' then
    if sqlerrm <> 'SUPER_ADMIN_REQUIRED' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.review_stay_listing((select result->>'listingId' from stay_owner_draft_result), 'approve', 'Documents reviewed', false);
do $$
declare v_listing text := (select result->>'listingId' from stay_owner_draft_result);
begin
  if not exists (
    select 1 from public.listings l join public.stay_properties p on p.listing_id = l.id
     where l.id = v_listing and l.status = 'active' and l.is_verified
       and l.verified_by = 'a1000000-0000-4000-8000-000000000002'
       and l.payload->>'stayLifecycle' = 'approved' and p.is_active
  ) then raise exception 'FAIL: Super Admin approval did not publish verified property'; end if;
  if not exists (select 1 from public.profiles p where p.id = 'a1000000-0000-4000-8000-000000000001'
       and p.role = 'provider' and p.verified and p.account_status = 'active') then
    raise exception 'FAIL: approved owner was not verified as provider'; end if;
  if not public.stay_listing_is_publicly_bookable(v_listing) then raise exception 'FAIL: public booking gate denied approved property'; end if;
  if (select count(*) from public.user_access_audit_events where target_user_id = 'a1000000-0000-4000-8000-000000000001' and action in ('set_provider','verify')) <> 2 then
    raise exception 'FAIL: provider role/verification audit rows missing'; end if;
  if (select count(*) from public.stay_listing_review_events where listing_id = v_listing and action = 'approve' and actor_user_id = 'a1000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'FAIL: durable approval event missing'; end if;
  raise notice 'PASS: customer approval denied; Super Admin approval activates verified listing, owner role, and audit trails';
end $$;
rollback;

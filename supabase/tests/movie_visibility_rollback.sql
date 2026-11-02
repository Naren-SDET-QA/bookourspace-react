-- Executed inside a transaction by scripts/validate-movie-db.ts; ALL fixtures roll back.
insert into cinema_private.bootstrap_admins(email) values('cinema-bootstrap-test@example.invalid');
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000104','cinema-bootstrap-test@example.invalid');
do $$begin
  if exists(select 1 from cinema_private.admin_permissions where user_id='00000000-0000-4000-8000-000000000104') then raise exception 'Unverified bootstrap account granted access'; end if;
end$$;
update auth.users set email_confirmed_at=now() where id='00000000-0000-4000-8000-000000000104';
do $$begin
  if not exists(select 1 from cinema_private.admin_permissions where user_id='00000000-0000-4000-8000-000000000104' and role='super_admin') then raise exception 'Verified bootstrap missing'; end if;
end$$;
-- Revoke the fixture directly as database owner; the one-time bootstrap must not override it.
update cinema_private.admin_permissions set role='admin',can_manage_visibility=false where user_id='00000000-0000-4000-8000-000000000104';
update auth.users set email_confirmed_at=now() where id='00000000-0000-4000-8000-000000000104';
do $$begin
  if exists(select 1 from cinema_private.admin_permissions where user_id='00000000-0000-4000-8000-000000000104' and role='super_admin') then raise exception 'Bootstrap restored revoked access'; end if;
end$$;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-000000000101','cinema-super-test@example.invalid'),
('00000000-0000-4000-8000-000000000102','cinema-admin-test@example.invalid'),
('00000000-0000-4000-8000-000000000103','cinema-user-test@example.invalid');
insert into cinema_private.admin_permissions(user_id,role,can_manage_visibility) values
('00000000-0000-4000-8000-000000000101','super_admin',true),
('00000000-0000-4000-8000-000000000102','admin',true);

set local role service_role;
select public.sync_movie_catalog(
'[{"id":"__visibility_test_t1","name":"Visibility test Hyderabad","state":"Telangana","city":"Hyderabad"},{"id":"__visibility_test_t2","name":"Visibility test Bengaluru","state":"Karnataka","city":"Bengaluru"},{"id":"__visibility_test_t3","name":"Visibility test Vijayawada","state":"Andhra Pradesh","city":"Vijayawada"}]',
'[{"id":"__visibility_test_m1","title":"Visibility test movie","language":"Telugu"}]',
'[{"id":"__visibility_test_s1","theatre_id":"__visibility_test_t1","movie_id":"__visibility_test_m1","starts_at":"2099-01-01T12:00:00Z"},{"id":"__visibility_test_s2","theatre_id":"__visibility_test_t2","movie_id":"__visibility_test_m1","starts_at":"2099-01-01T12:00:00Z"}]');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
  if exists(select 1 from public.movies_now_showing()) then raise exception 'New sync records must start hidden'; end if;
end$$;
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
set local role authenticated;
select public.manage_movie_visibility('theatre','[{"id":"__visibility_test_t1","visible":true,"version":0},{"id":"__visibility_test_t2","visible":true,"version":0}]','Initial approval');
select public.manage_movie_visibility('movie','[{"id":"__visibility_test_m1","visible":true,"version":0}]','Approve movie');
select public.manage_movie_visibility('showtime','[{"id":"__visibility_test_s1","visible":true,"version":0},{"id":"__visibility_test_s2","visible":true,"version":0}]','Approve shows');
do $$begin
  if (select count(*) from public.movie_admin_catalog('theatre','','','','Visibility test')) <> 3 then raise exception 'Admin dashboard state coverage failed'; end if;
  begin
    perform public.manage_movie_admin_permission('00000000-0000-4000-8000-000000000103','super_admin',true,-1,'Self escalation');
    raise exception 'Admin escalated privilege';
  exception when insufficient_privilege then null; end;
end$$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
  if (select count(*) from public.movies_now_showing()) <> 2 then raise exception 'Enabled public shows missing'; end if;
  if (select count(*) from public.movies_now_showing('Karnataka')) <> 1 then raise exception 'State filter failed'; end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
select public.manage_movie_visibility('theatre','[{"id":"__visibility_test_t1","visible":false,"version":1}]','Temporarily closed');
do $$begin
  begin
    perform public.manage_movie_visibility('theatre','[{"id":"__visibility_test_t1","visible":true,"version":1}]','Stale browser update');
    raise exception 'Stale version accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.manage_movie_visibility('theatre','[{"id":"__visibility_test_t2","visible":false,"version":1},{"id":"__visibility_test_t1","visible":true,"version":0}]','Atomic bulk change');
    raise exception 'Stale bulk accepted';
  exception when serialization_failure then null; end;
end$$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
  if (select count(*) from public.movies_now_showing()) <> 1 then raise exception 'Theatre visibility did not cascade'; end if;
  if exists(select 1 from public.movie_theatres where id='__visibility_test_t1') then raise exception 'Direct theatre RLS leak'; end if;
  if exists(select 1 from public.movie_showtimes where id='__visibility_test_s1') then raise exception 'Direct showtime RLS leak'; end if;
  if exists(select 1 from public.movies_now_showing('','Hyderabad')) then raise exception 'Location search leaked disabled theatre'; end if;
  if exists(select 1 from public.movies_now_showing('','','Visibility test Hyderabad')) then raise exception 'Keyword search leaked disabled theatre'; end if;
end$$;
reset role;
set local role service_role;
select public.sync_movie_catalog('[{"id":"__visibility_test_t1","name":"Visibility test Hyderabad refreshed","state":"Telangana","city":"Hyderabad","is_visible":true}]','[]','[]');
do $$begin
  begin
    update public.movie_theatres set is_visible=true where id='__visibility_test_t1';
    raise exception 'Sync identity changed visibility';
  exception when insufficient_privilege then null; end;
end$$;
reset role;
do $$begin
  if (select is_visible from public.movie_theatres where id='__visibility_test_t1') then raise exception 'Sync re-enabled disabled theatre'; end if;
  if not (select is_visible from public.movie_theatres where id='__visibility_test_t2') then raise exception 'Bulk rollback lost sibling'; end if;
end$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
set local role authenticated;
do $$begin
  begin
    perform public.manage_movie_visibility('theatre','[{"id":"__visibility_test_t1","visible":true,"version":2}]','Unauthorized user');
    raise exception 'Ordinary user changed visibility';
  exception when insufficient_privilege then null; end;
  begin
    insert into cinema_private.admin_permissions(user_id,role) values(auth.uid(),'super_admin');
    raise exception 'Direct permission write accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.movie_visibility_audit();
    raise exception 'Ordinary user read audit';
  exception when insufficient_privilege then null; end;
end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
set local role authenticated;
select public.manage_movie_admin_permission('00000000-0000-4000-8000-000000000102','admin',false,0,'Revoke access');
do $$begin
  begin
    perform public.manage_movie_admin_permission('00000000-0000-4000-8000-000000000101','admin',true,0,'Remove last super');
    raise exception 'Last Super Admin removed';
  exception when invalid_parameter_value then null; end;
  if not exists(select 1 from public.movie_visibility_audit() where actor_id='00000000-0000-4000-8000-000000000102' and previous_value='true' and new_value='false' and reason='Temporarily closed') then raise exception 'Visibility audit missing'; end if;
end$$;
select public.manage_movie_visibility('movie','[{"id":"__visibility_test_m1","visible":false,"version":1}]','Withdraw movie');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
  if exists(select 1 from public.movies_now_showing()) then raise exception 'Movie disable did not hide shows'; end if;
  if exists(select 1 from public.movie_titles) then raise exception 'Direct movie RLS leak'; end if;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select public.manage_movie_visibility('movie','[{"id":"__visibility_test_m1","visible":true,"version":2}]','Restore movie');
select public.manage_movie_visibility('showtime','[{"id":"__visibility_test_s2","visible":false,"version":1}]','Cancel screening');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
  if exists(select 1 from public.movies_now_showing()) then raise exception 'Showtime disable failed'; end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
set local role authenticated;
do $$begin
  begin
    perform public.manage_movie_visibility('theatre','[{"id":"__visibility_test_t1","visible":true,"version":2}]','Revoked admin');
    raise exception 'Revoked admin changed visibility';
  exception when insufficient_privilege then null; end;
end$$;
reset role;
select 'PASS: hierarchy, search, direct RLS, admin/super-admin, revocation, audit, sync preservation, stale updates and bulk rollback' as validation;

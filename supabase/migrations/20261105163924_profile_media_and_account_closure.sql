-- Prepared locally for review. Do not apply to any hosted project without approval.
begin;

alter table public.media_assets drop constraint if exists media_assets_bucket_privacy_check;
alter table public.media_assets drop constraint if exists media_assets_bucket_id_check;
alter table public.media_assets add constraint media_assets_bucket_privacy_check check (
  (bucket_id = 'bos-public-media' and privacy = 'public') or
  (bucket_id in ('bos-private-documents','bos-private-profile-media') and privacy = 'private')
);
alter table public.media_assets add constraint media_assets_bucket_id_check
  check (bucket_id in ('bos-public-media','bos-private-documents','bos-private-profile-media'));
alter table public.profiles add column if not exists cover_url text;
grant select (cover_url) on public.profiles to authenticated;

drop policy if exists "Customers register private profile images" on public.media_assets;
create policy "Customers register private profile images" on public.media_assets for insert to authenticated
with check (
  owner_id=(select auth.uid()) and (select public.is_active_user())
  and processing_status='quarantined' and display_order >= 0
  and split_part(object_path,'/',1)=(select auth.uid())::text
  and bucket_id='bos-private-profile-media' and privacy='private' and media_kind='image'
  and parent_type in ('profile_avatar','profile_cover') and parent_id=(select auth.uid())::text
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='customer')
);

do $storage$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
    values ('bos-private-profile-media','bos-private-profile-media',false,10485760,
      array['image/jpeg','image/png','image/webp','image/avif','image/heic','image/gif']::text[])
    on conflict (id) do update set
      name=excluded.name, public=false, file_size_limit=excluded.file_size_limit,
      allowed_mime_types=excluded.allowed_mime_types;
    execute 'drop policy if exists "Owners read private profile images" on storage.objects';
    execute $p$create policy "Owners read private profile images" on storage.objects for select to authenticated
      using (bucket_id='bos-private-profile-media' and split_part(name,'/',1)=(select auth.uid())::text
       and (select public.is_active_user()))$p$;
    execute 'drop policy if exists "Owners upload private profile images" on storage.objects';
    execute $p$create policy "Owners upload private profile images" on storage.objects for insert to authenticated
      with check (bucket_id='bos-private-profile-media' and split_part(name,'/',1)=(select auth.uid())::text
       and (select public.is_active_user()))$p$;
  end if;
end;
$storage$;

create or replace function public.set_profile_media_asset_server(p_asset_id uuid,p_owner_id uuid,p_slot text)
returns void language plpgsql security definer set search_path='' as $$
declare v_asset public.media_assets%rowtype;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_slot not in ('avatar','cover') then raise exception 'PROFILE_MEDIA_SLOT_INVALID'; end if;
  select * into v_asset from public.media_assets where id=p_asset_id and owner_id=p_owner_id
    and parent_id=p_owner_id::text and parent_type=case p_slot when 'avatar' then 'profile_avatar' else 'profile_cover' end
    and bucket_id='bos-private-profile-media' and privacy='private' and media_kind='image' and processing_status='ready' for update;
  if not found then raise exception 'PROFILE_MEDIA_ASSET_NOT_READY'; end if;
  update public.profiles set
    avatar_url=case when p_slot='avatar' then 'storage://bos-private-profile-media/'||v_asset.object_path else avatar_url end,
    cover_url=case when p_slot='cover' then 'storage://bos-private-profile-media/'||v_asset.object_path else cover_url end,
    updated_at=now()
    where id=p_owner_id and account_status='active';
  if not found then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
end; $$;
revoke all on function public.set_profile_media_asset_server(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_profile_media_asset_server(uuid,uuid,text) to service_role;

create table if not exists public.account_closure_audit (
  id bigint generated always as identity primary key,
  profile_id uuid not null,
  closed_at timestamptz not null default now(),
  prior_role text not null,
  retained_financial_records boolean not null default true,
  request_id text
);
alter table public.account_closure_audit enable row level security;
revoke all on public.account_closure_audit from public,anon,authenticated;
grant select,insert on public.account_closure_audit to service_role;

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('active','suspended','blocked','pending_verification','closed')) not valid;
alter table public.profiles validate constraint profiles_account_status_check;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active');
$$;
revoke all on function public.is_active_user() from public,anon;
grant execute on function public.is_active_user() to authenticated,service_role;

-- An unexpired JWT keeps its subject until token expiry. Keep the existing
-- security-definer policy helper and deny identities banned by account closure
-- through auth.users, avoiding a recursive lookup into profiles RLS.
create or replace function public.can_read_private_profile(target_profile_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists (
    select 1 from auth.users closed_viewer
    where closed_viewer.id=(select auth.uid()) and closed_viewer.banned_until>now()
  ) and case
    -- The owner path must not fall through to profile lookups when closed:
    -- that would recursively evaluate this SELECT policy during UPDATE checks.
    when target_profile_id=(select auth.uid()) then true
    when exists (
      select 1 from auth.users closed_target
      where closed_target.id=target_profile_id and closed_target.banned_until>now()
    ) then false
    else coalesce(
    exists (
      select 1 from public.profiles administrator
      where administrator.id=(select auth.uid()) and administrator.role='admin'
        and administrator.account_status='active'
    )
    or (
      exists (
        select 1 from public.profiles actor
        where actor.id=(select auth.uid()) and actor.account_status='active'
      ) and (
        exists (
          select 1 from public.service_bookings booking
          where (booking.customer_id=(select auth.uid()) and booking.provider_id=target_profile_id)
             or (booking.provider_id=(select auth.uid()) and booking.customer_id=target_profile_id)
        )
        or exists (
          select 1 from public.venue_bookings booking
          where (booking.customer_user_id=(select auth.uid()) and booking.owner_user_id=target_profile_id)
             or (booking.owner_user_id=(select auth.uid()) and booking.customer_user_id=target_profile_id)
        )
        or exists (
          select 1 from public.class_enrollments enrollment
          join public.class_batches batch on batch.id=enrollment.batch_id
          join public.listings listing on listing.id=batch.listing_id
          where (enrollment.student_id=target_profile_id and listing.owner_id=(select auth.uid()))
             or (enrollment.student_id=(select auth.uid()) and listing.owner_id=target_profile_id)
        )
        or exists (
          select 1 from public.bookings booking
          join public.listings listing on listing.id=booking.listing_id
          where (booking.user_id=(select auth.uid()) and listing.owner_id=target_profile_id)
             or (booking.user_id=target_profile_id and listing.owner_id=(select auth.uid()))
        )
        or exists (
          select 1 from public.stay_allocations allocation
          join public.stay_units unit on unit.id=allocation.unit_id
          join public.stay_room_types room_type on room_type.id=unit.room_type_id
          join public.stay_properties property on property.id=room_type.property_id
          where allocation.status in ('held','confirmed')
            and ((allocation.guest_user_id=(select auth.uid()) and property.owner_user_id=target_profile_id)
              or (allocation.guest_user_id=target_profile_id and property.owner_user_id=(select auth.uid())))
        )
      )
    ), false)
  end;
$$;
revoke all on function public.can_read_private_profile(uuid) from public,anon;
grant execute on function public.can_read_private_profile(uuid) to authenticated,service_role;

create or replace function public.close_account_server(p_owner_id uuid,p_auth_time timestamptz,p_request_id text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_profile public.profiles%rowtype;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_auth_time is null or p_auth_time < now()-interval '10 minutes' or p_auth_time > now()+interval '1 minute'
    then raise exception 'RECENT_AUTHENTICATION_REQUIRED'; end if;
  select * into v_profile from public.profiles where id=p_owner_id for update;
  if not found or v_profile.account_status<>'active' then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  if v_profile.role in ('super_admin','superadmin') or coalesce(v_profile.is_super_admin,false)
    then raise exception 'SUPER_ADMIN_CLOSURE_REQUIRES_SEPARATE_REVIEW'; end if;
  insert into public.account_closure_audit(profile_id,prior_role,request_id)
    values(p_owner_id,v_profile.role,left(p_request_id,128));
  delete from auth.sessions where user_id=p_owner_id;
  update auth.users set banned_until=greatest(coalesce(banned_until,now()),now()+interval '100 years'),updated_at=now()
    where id=p_owner_id;
  update public.profiles set account_status='closed',email='closed+'||p_owner_id::text||'@account.invalid',
    full_name='Closed account',phone=null,avatar_url=null,cover_url=null,city=null,google_sub=null,updated_at=now()
    where id=p_owner_id;
end; $$;
revoke all on function public.close_account_server(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.close_account_server(uuid,timestamptz,text) to service_role;

commit;


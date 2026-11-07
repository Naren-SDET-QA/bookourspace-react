-- Keep role activation behind an Admin-checked transaction after private
-- profile column writes are revoked from authenticated clients.
begin;

create or replace function private.review_provider_registration(
  p_registration_id uuid,
  p_decision text,
  p_review_note text default ''
)
returns setof public.provider_registration_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  registration public.provider_registration_requests%rowtype;
  target_profile public.profiles%rowtype;
begin
  if actor_id is null or not exists (
    select 1 from public.profiles administrator
     where administrator.id = actor_id
       and administrator.role = 'admin'
       and administrator.account_status = 'active'
  ) then
    raise exception using message = 'FORBIDDEN_ADMIN_REQUIRED', errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception using message = 'INVALID_REVIEW_DECISION', errcode = '22023';
  end if;

  select * into registration
    from public.provider_registration_requests request
   where request.id = p_registration_id
   for update;
  if not found then return; end if;

  if registration.status <> 'pending' then
    if registration.status = p_decision then
      return next registration;
      return;
    end if;
    raise exception using message = 'PROVIDER_REGISTRATION_ALREADY_REVIEWED', errcode = '23514';
  end if;

  select * into target_profile
    from public.profiles profile
   where profile.id = registration.user_id
   for update;
  if not found or target_profile.account_status <> 'active'
     or target_profile.role not in ('customer', 'provider') then
    raise exception using message = 'REGISTRATION_PROFILE_NOT_ELIGIBLE', errcode = '23514';
  end if;

  if p_decision = 'approved' and target_profile.role = 'customer' then
    update public.profiles
       set role = 'provider', updated_at = now()
     where id = target_profile.id;
  end if;

  return query
    update public.provider_registration_requests request
       set status = p_decision,
           review_note = nullif(left(btrim(coalesce(p_review_note, '')), 1000), ''),
           reviewed_by = actor_id,
           reviewed_at = now(),
           updated_at = now()
     where request.id = p_registration_id and request.status = 'pending'
     returning request.*;
end;
$$;

revoke all on function private.review_provider_registration(uuid, text, text) from public, anon;
grant execute on function private.review_provider_registration(uuid, text, text) to authenticated;

commit;

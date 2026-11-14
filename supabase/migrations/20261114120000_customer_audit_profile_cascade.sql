-- Deleting a profile cascaded into public.customer_module_access, and the
-- DELETE branch of record_customer_module_access_audit() then tried to record a
-- 'revoke' row for a user_id that had already been deleted. The audit table's
-- foreign key rejected it, so the whole account deletion failed with 23503:
-- an account holding any module grant could not be removed.
--
-- The same cascade also removes that user's audit history, so when the profile
-- is already gone there is nothing left for the trigger to record. It now
-- returns without writing, which keeps ordinary revokes audited exactly as
-- before while letting account deletion complete.
--
-- The rest of the function is unchanged from
-- 20261114090000_module_section_action_grants.sql.

begin;

create or replace function public.record_customer_module_access_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.customer_module_access_audit
      (user_id, module_key, action, expires_at, granted_by, allowed_sections, allowed_actions)
    values (new.user_id, new.module_key, 'grant', new.expires_at, new.granted_by,
            new.allowed_sections, new.allowed_actions);
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.expires_at is distinct from new.expires_at
        or old.allowed_sections is distinct from new.allowed_sections
        or old.allowed_actions is distinct from new.allowed_actions) then
      insert into public.customer_module_access_audit
        (user_id, module_key, action, expires_at, granted_by, allowed_sections, allowed_actions)
      values (new.user_id, new.module_key, 'update', new.expires_at, new.granted_by,
              new.allowed_sections, new.allowed_actions);
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    -- No live profile means this delete is part of an account deletion: the
    -- user's history is going away with the account, so there is no row to add.
    if not exists (select 1 from public.profiles where id = old.user_id) then
      return old;
    end if;
    insert into public.customer_module_access_audit
      (user_id, module_key, action, expires_at, granted_by, allowed_sections, allowed_actions)
    values (old.user_id, old.module_key, 'revoke', old.expires_at, old.granted_by,
            old.allowed_sections, old.allowed_actions);
    return old;
  end if;
  return null;
end;
$$;

revoke all on function public.record_customer_module_access_audit() from public, anon;

commit;

# Secure Super Admin bootstrap (Mumbai)

This procedure is deliberately manual. The application never assigns Admin or
Super Admin from an email address, OAuth metadata, or a browser request.

1. Obtain explicit owner approval for the named person and retain that approval
   with the change record.
2. In the Mumbai Supabase Dashboard, confirm the project reference is
   `obkfgxjzlscungkhbyvq`. Find the user's Auth record and verify that Google is
   the identity provider and the email is verified. Copy the Auth UUID; do not
   identify the account by email in the update statement.
3. After the reviewed migrations are installed, use the SQL Editor as the
   trusted database owner. Substitute the reviewed Auth UUID and a meaningful
   reason. The guard prevents promoting a UUID that is not an active Google
   Auth account.

```sql
begin;
do $$
declare
  target_id uuid := 'REPLACE_WITH_OWNER_VERIFIED_AUTH_UUID';
  change_reason text := 'Owner approval reference: REPLACE_WITH_APPROVAL_ID';
begin
  if length(btrim(change_reason)) < 5 then
    raise exception 'A meaningful bootstrap reason is required';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = target_id
      and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data->>'provider', '') = 'google'
  ) then
    raise exception 'Target must be an email-verified Google Auth user';
  end if;
  update public.profiles
     set role = 'admin', is_super_admin = true, updated_at = now()
   where id = target_id and account_status = 'active';
  if not found then
    raise exception 'Target profile missing or inactive; no bootstrap completed';
  end if;
end;
$$;
commit;
```

Keep the approval record and SQL Editor execution result in the operational
change log. Never put an email address or a service-role key in source control.
To remove Super Admin access, use the owner-controlled SQL Editor to clear
`is_super_admin` and set an appropriate role, with a separately recorded
reason. Super Admin accounts cannot be changed through the application user
management endpoint.

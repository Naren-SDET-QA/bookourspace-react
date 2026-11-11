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
select *
  from private.bootstrap_super_admin(
    'REPLACE_WITH_OWNER_VERIFIED_AUTH_UUID'::uuid,
    'Owner approval reference: REPLACE_WITH_APPROVAL_ID'
  );
commit;
```

The routine refuses anything other than an email-verified Google Auth UUID,
refuses inactive profiles, refuses an account that is already a Super Admin,
and inserts a `bootstrap_grant` row into `user_access_audit_events` in the same
transaction. The audit row records `actor_type=database_owner`, the actual SQL
`session_user` role, the target UUID, previous/new state, and the supplied
approval reference/reason. It does not mislabel the target as the actor. Client
roles (`anon`, `authenticated`, `service_role`) have no
`EXECUTE` privilege; only the SQL Editor login (`postgres` / `supabase_admin`)
can run it. The audit table rejects update and delete, so a correction must be
appended rather than rewriting history.

The operator wrapper `supabase/bootstrap_super_admin.sql` accepts exactly one
target: preferably the owner-verified Auth UUID, or an email that resolves to
exactly one Auth user. Both paths call this same UUID function; the function
remains the authority. Run the UUID dry run first:

```bash
psql "$BOS_OWNER_DATABASE_URL" \
  -v bootstrap_user_id='REPLACE_WITH_OWNER_VERIFIED_AUTH_UUID' \
  -v bootstrap_confirm=DRY-RUN \
  -v bootstrap_note='Owner approval reference: REPLACE_WITH_APPROVAL_ID' \
  -f supabase/bootstrap_super_admin.sql
```

Then repeat with `bootstrap_confirm=BOOTSTRAP-SUPER-ADMIN` only after the dry
run reports the expected target and no mutation. Do not replace this with a
direct `profiles` update.

Keep the approval record and SQL Editor execution result in the operational
change log. Never put an email address or a service-role key in source control.
To remove Super Admin access, use the owner-controlled SQL Editor:

```sql
begin;
select *
  from private.revoke_super_admin(
    'REPLACE_WITH_OWNER_VERIFIED_AUTH_UUID'::uuid,
    'Owner approval reference: REPLACE_WITH_APPROVAL_ID'
  );
commit;
```

That writes a `bootstrap_revoke` audit row and clears `is_super_admin` while
leaving the profile role unchanged. Super Admin accounts cannot be changed
through the application user management endpoint.

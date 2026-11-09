-- Remaining SECURITY DEFINER surface after the four pending advisor migrations:
--   * PostgreSQL grants EXECUTE on new functions to PUBLIC; revoke that default
--     from every definer routine in public/private. Existing authenticated /
--     service_role grants are left in place.
--   * Pin search_path on any remaining definer routine that has none.
--   * Allow clients to resolve btree_gist objects after the extension moved
--     out of the API schema.
-- Local-only candidate; do not apply to Mumbai without separate approval.
begin;

grant usage on schema extensions to public;

do $$
declare
  definer record;
  configs text[];
  has_search_path boolean;
begin
  for definer in
    select p.oid, p.oid::regprocedure as signature, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.prosecdef
       and p.proname <> 'rls_auto_enable'
  loop
    execute format('revoke all on function %s from public', definer.signature);

    configs := coalesce(definer.proconfig, '{}'::text[]);
    select exists (
      select 1 from unnest(configs) as cfg(value)
       where cfg.value like 'search_path=%'
    ) into has_search_path;
    if not has_search_path then
      execute format(
        'alter function %s set search_path = public, pg_temp',
        definer.signature
      );
    end if;
  end loop;
end;
$$;

-- Baseline helpers used in RLS are fully schema-qualified. An empty
-- search_path removes the remaining advisor finding without changing
-- authorization.
alter function public.handle_new_user() set search_path = '';
alter function public.is_admin() set search_path = '';
alter function public.is_active_user() set search_path = '';

commit;

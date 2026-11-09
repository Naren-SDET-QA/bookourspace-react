#!/usr/bin/env bash
# Read-only hosted identity, migration history, RLS, and trigger preflight.
# This is deliberately a separate approval gate from migration installation,
# profile backfill, and backup. It never changes the hosted database.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/bos_target_guard.sh
. "$SCRIPT_DIR/lib/bos_target_guard.sh"
bos_load_target_config

[[ "${BOS_MUMBAI_READONLY_PREFLIGHT_APPROVED:-}" == "$BOS_APPROVED_REF" ]] \
  || bos_die "BLOCKED: read-only hosted identity preflight requires BOS_MUMBAI_READONLY_PREFLIGHT_APPROVED=$BOS_APPROVED_REF. No connection was attempted."
[[ -n "${BOS_MUMBAI_DATABASE_URL:-}" ]] \
  || bos_die 'BLOCKED: BOS_MUMBAI_DATABASE_URL is required. No connection was attempted.'
bos_assert_connection "$BOS_MUMBAI_DATABASE_URL"
command -v psql >/dev/null || bos_die 'BLOCKED: psql is required. No connection was attempted.'

export PGSSLMODE=require
export PGOPTIONS='-c default_transaction_read_only=on'
CONNECTION_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bos-mumbai-readonly.XXXXXX")"
chmod 700 "$CONNECTION_DIR"
CONNECTION_FILE="$CONNECTION_DIR/pg_service.conf"
PASSFILE="$CONNECTION_DIR/pgpass"
trap 'rm -rf "$CONNECTION_DIR"' EXIT
if ! python3 - "$CONNECTION_FILE" "$PASSFILE" <<'PY'
import os
import re
import sys
from urllib.parse import unquote, urlsplit

service_path, passfile_path = sys.argv[1:]
raw = os.environ.get('BOS_MUMBAI_DATABASE_URL', '')
try:
    uri = urlsplit(raw)
    host = uri.hostname or ''
    # libpq service files require an integer token, not a quoted string:
    #   port=5432    (valid)      port='5432'    (invalid integer value)
    port = str(int(uri.port or 5432))
    user = unquote(uri.username or '')
    password = unquote(uri.password or '')
    database = unquote(uri.path.lstrip('/')) or 'postgres'
    if uri.scheme not in ('postgres', 'postgresql') or not host or not user or not password:
        raise ValueError
    # Never allow a Unix-socket or loopback fallback; libpq uses the local
    # socket when host is empty or a filesystem path.
    if host.startswith('/') or host.lower() in ('localhost', '127.0.0.1', '::1', '[::1]'):
        raise ValueError
    values = (host, port, user, password, database, passfile_path)
    if any(any(ord(ch) < 32 or ord(ch) == 127 for ch in value) for value in values):
        raise ValueError
    if not re.fullmatch(r'[a-zA-Z0-9.-]+', host) or not port.isdigit():
        raise ValueError
    if not re.fullmatch(r'[a-zA-Z0-9._-]+', user) or not re.fullmatch(r'[a-zA-Z0-9._-]+', database):
        raise ValueError

    def pgpass_escape(value):
        return value.replace('\\', '\\\\').replace(':', '\\:')

    with open(service_path, 'w', encoding='utf-8') as service:
        service.write('[bos-mumbai-readonly]\n')
        service.write(f'host={host}\n')
        service.write(f'port={port}\n')
        service.write(f'dbname={database}\n')
        service.write(f'user={user}\n')
        service.write('sslmode=require\n')
    with open(passfile_path, 'w', encoding='utf-8') as passfile:
        passfile.write(':'.join(pgpass_escape(value) for value in (host, port, database, user, password)) + '\n')
    os.chmod(service_path, 0o600)
    os.chmod(passfile_path, 0o600)
except Exception:
    print('BLOCKED: could not prepare a secure PostgreSQL service/passfile; no connection attempted.', file=sys.stderr)
    sys.exit(1)
PY
then
  exit 2
fi
unset BOS_MUMBAI_DATABASE_URL
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGPASSWORD PGPASSFILE PGSERVICE
export PGSERVICEFILE="$CONNECTION_FILE"
export PGPASSFILE="$PASSFILE"
PSQL=(psql 'service=bos-mumbai-readonly' -X -v ON_ERROR_STOP=1 -P pager=off)

echo 'Read-only hosted identity and migration-history preflight'
echo "approved project ref: $BOS_APPROVED_REF"
"${PSQL[@]}" <<'SQL'
begin read only;
select 'connection' as check_name,
       current_database() as database_name,
       current_user as database_role,
       current_setting('server_version') as server_version;

select 'auth_user_count' as check_name, count(*)::text as result
from auth.users;

select 'google_auth_user_count' as check_name, count(distinct users.id)::text as result
from auth.users users
join auth.identities identities on identities.user_id=users.id
where identities.provider='google';

select 'auth_identity_provider_counts' as check_name,
       coalesce(jsonb_object_agg(provider, provider_count), '{}'::jsonb)::text as result
from (
  select provider, count(*)::text as provider_count
  from auth.identities group by provider
) providers;

select 'public_rls_status' as check_name,
       jsonb_build_object(
         'tables', count(*)::int,
         'rls_enabled', count(*) filter (where c.relrowsecurity)::int,
         'rls_disabled', count(*) filter (where not c.relrowsecurity)::int
       )::text as result
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r';

select 'rls_event_triggers' as check_name,
       coalesce(jsonb_agg(jsonb_build_object(
         'trigger', e.evtname,
         'enabled', e.evtenabled,
         'function', p.proname
       ) order by e.evtname), '[]'::jsonb)::text as result
from pg_event_trigger e
join pg_proc p on p.oid=e.evtfoid
where p.proname in ('ensure_rls', 'rls_auto_enable');

select 'sensitive_function_execute' as check_name,
       coalesce(jsonb_agg(jsonb_build_object(
         'function', p.proname,
         'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
         'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         'public_grant', exists (
           select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where a.grantee=0 and a.privilege_type='EXECUTE'
         )
       ) order by p.proname), '[]'::jsonb)::text as result
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('ensure_rls', 'rls_auto_enable', 'is_admin');
rollback;
SQL
HISTORY_EXISTS="$("${PSQL[@]}" -Atc "select to_regclass('supabase_migrations.schema_migrations') is not null")"
if [[ "$HISTORY_EXISTS" == 't' ]]; then
  "${PSQL[@]}" -c "begin read only; select 'migration_history_count' as check_name, count(*)::text as result from supabase_migrations.schema_migrations where version >= '00000000000000'; select 'history_versions' as check_name, coalesce(string_agg(version, ',' order by version), '') as result from supabase_migrations.schema_migrations where version >= '00000000000000'; rollback;"
else
  printf 'migration_history: table_absent\n'
fi
echo 'PASS: hosted catalog/auth identity inspection completed in a read-only transaction.'

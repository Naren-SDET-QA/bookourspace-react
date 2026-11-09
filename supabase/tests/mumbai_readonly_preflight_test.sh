#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PREFLIGHT="$ROOT/supabase/tests/mumbai_readonly_identity_preflight.sh"
APPROVED='obkfgxjzlscungkhbyvq'
SENTINEL='mock%3Asecret%5Cvalue'
TMP="$(mktemp -d "${TMPDIR:-/tmp}/bos-mumbai-preflight-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
cat > "$TMP/bin/psql" <<'PY'
#!/usr/bin/env python3
import os
import pathlib
import re
import subprocess
import sys

def fail(message):
    print('MOCK FAIL: ' + message, file=sys.stderr)
    raise SystemExit(91)

args = sys.argv[1:]
if any('://' in arg or 'mock:secret' in arg or 'mock%3Asecret' in arg for arg in args):
    fail('connection URI or secret appeared in psql arguments')
if 'BOS_MUMBAI_DATABASE_URL' in os.environ or 'PGPASSWORD' in os.environ:
    fail('URI/password remained in the psql environment')
if any(name in os.environ for name in ('PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGSERVICE')):
    fail('ambient libpq connection setting could override the verified service')
if not os.environ.get('PGPASSFILE'):
    fail('secure passfile is not selected')
if os.environ.get('PGSSLMODE') != 'require':
    fail('PGSSLMODE is not require')
if os.environ.get('PGOPTIONS') != '-c default_transaction_read_only=on':
    fail('default_transaction_read_only is not enforced')
if args[:1] != ['service=bos-mumbai-readonly']:
    fail('psql was not invoked through the named service')

service_file = pathlib.Path(os.environ['PGSERVICEFILE'])
if service_file.stat().st_mode & 0o777 != 0o600:
    fail('service file permissions are not 0600')
service = service_file.read_text()
expected_service = [
    "[bos-mumbai-readonly]",
    'host=aws-0-ap-south-1.pooler.supabase.com',
    'port=5432',
    'dbname=postgres',
    'user=postgres.obkfgxjzlscungkhbyvq',
    'sslmode=require',
]
if not all(line in service.splitlines() for line in expected_service):
    fail('service file does not contain the guarded remote endpoint and TLS mode')
if '://' in service or 'mock:secret' in service or 'mock%3Asecret' in service:
    fail('URI or secret appeared in the service file')

passfile_path = pathlib.Path(os.environ['PGPASSFILE'])
if passfile_path.stat().st_mode & 0o777 != 0o600:
    fail('passfile permissions are not 0600')
passfile = passfile_path.read_text()
if passfile != r'aws-0-ap-south-1.pooler.supabase.com:5432:postgres:postgres.obkfgxjzlscungkhbyvq:mock\:secret\\value' + '\n':
    fail('passfile did not preserve escaped credential fields')

libpq_marker = pathlib.Path(os.environ['MOCK_LIBPQ_MARKER'])
if not libpq_marker.exists():
    local_service_file = service_file.parent / 'libpq-local-service.conf'
    local_service_file.write_text(service.replace(
        'host=aws-0-ap-south-1.pooler.supabase.com', 'host=127.0.0.1', 1
    ))
    local_service_file.chmod(0o600)
    probe_env = os.environ | {
        'PGSERVICEFILE': str(local_service_file),
        'PGPASSFILE': str(passfile_path),
        'PGSSLMODE': 'require',
        'PGOPTIONS': '-c default_transaction_read_only=on',
        'PGCONNECT_TIMEOUT': '1',
    }
    probe = subprocess.run([
        os.environ['REAL_PSQL'], 'service=bos-mumbai-readonly', '-X', '-A', '-t',
        '-c', 'select current_setting(\'port\')'
    ], env=probe_env, capture_output=True, text=True, timeout=5)
    diagnostic = (probe.stdout + '\n' + probe.stderr).lower()
    if probe.returncode == 0:
        if probe.stdout.strip() != '5432':
            fail('real libpq connected locally but did not report integer port 5432')
    elif 'invalid integer value' in diagnostic or not re.search(r'port\s+5432\b', diagnostic):
        fail('real libpq did not parse the service port as integer 5432')
    # Regression: a quoted service port is not a valid libpq integer. Prove the
    # same parser rejects it so a future edit cannot reintroduce port='5432'.
    quoted_service = service.replace('port=5432', "port='5432'", 1)
    quoted_path = service_file.parent / 'libpq-quoted-port.conf'
    quoted_path.write_text(quoted_service)
    quoted_path.chmod(0o600)
    quoted_probe = subprocess.run([
        os.environ['REAL_PSQL'], 'service=bos-mumbai-readonly', '-X', '-A', '-t',
        '-c', 'select 1'
    ], env=probe_env | {'PGSERVICEFILE': str(quoted_path)}, capture_output=True, text=True, timeout=5)
    quoted_diagnostic = (quoted_probe.stdout + '\n' + quoted_probe.stderr).lower()
    if quoted_probe.returncode == 0 or 'invalid integer value' not in quoted_diagnostic:
        fail('quoted service port was not rejected as an invalid integer')
    libpq_marker.write_text('libpq parsed integer port 5432 using loopback only; quoted port rejected')
    print('PASS: quoted service port 5432 was rejected by real libpq')

input_sql = sys.stdin.read()
sql_batches = [input_sql] if input_sql else []
for index, arg in enumerate(args[:-1]):
    if arg in ('-c', '-Atc'):
        sql_batches.append(args[index + 1])
for batch in sql_batches:
    statements = [part.strip() for part in batch.split(';') if part.strip()]
    if not statements or any(not re.match(r'^(begin\s+read\s+only|select\b|rollback\b)', stmt, re.I) for stmt in statements):
        fail('non-SELECT or non-read-only transaction SQL found')
if input_sql and (not re.search(r'\bbegin\s+read\s+only\b', input_sql, re.I) or not re.search(r'\brollback\b', input_sql, re.I)):
    fail('catalog/Auth query batch is not wrapped in read-only transaction')

marker = pathlib.Path(os.environ['MOCK_PSQL_MARKER'])
marker.write_text(str(service_file) + '\n' + str(passfile_path) + '\n')
if '-Atc' in args:
    print('t')
elif '-c' in args:
    print('migration_history_count|38')
    print('history_versions|00000000000000,20261101000002')
PY
chmod 700 "$TMP/bin/psql"

if PATH="$TMP/bin:$PATH" MOCK_PSQL_MARKER="$TMP/should-not-run" \
   BOS_MUMBAI_DATABASE_URL="postgresql://postgres.$APPROVED:$SENTINEL@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" \
   bash "$PREFLIGHT" >"$TMP/no-approval.out" 2>&1; then
  echo 'FAIL: missing read-only approval was accepted' >&2
  exit 1
fi
grep -q 'No connection was attempted' "$TMP/no-approval.out"
[[ ! -e "$TMP/should-not-run" ]]
echo 'PASS: missing preflight approval stops before psql'

if PATH="$TMP/bin:$PATH" MOCK_PSQL_MARKER="$TMP/wrong-target-ran" \
   BOS_MUMBAI_READONLY_PREFLIGHT_APPROVED="$APPROVED" \
   BOS_MUMBAI_DATABASE_URL="postgresql://postgres:$SENTINEL@db.sfoizxarbljhldmkgsma.supabase.co:5432/postgres" \
   bash "$PREFLIGHT" >"$TMP/wrong-target.out" 2>&1; then
  echo 'FAIL: wrong project was accepted' >&2
  exit 1
fi
grep -q 'STALE Mumbai project' "$TMP/wrong-target.out"
[[ ! -e "$TMP/wrong-target-ran" ]]
echo 'PASS: wrong project is refused before psql'

REAL_PSQL="$(command -v psql)"
if [[ -z "$REAL_PSQL" ]]; then
  echo 'BLOCKED: real psql/libpq is required for the parser regression test' >&2
  exit 2
fi
if ! PATH="$TMP/bin:$PATH" MOCK_PSQL_MARKER="$TMP/psql-ran" \
   MOCK_LIBPQ_MARKER="$TMP/libpq-ran" REAL_PSQL="$REAL_PSQL" \
   BOS_MUMBAI_READONLY_PREFLIGHT_APPROVED="$APPROVED" \
   BOS_MUMBAI_DATABASE_URL="postgresql://postgres.$APPROVED:$SENTINEL@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" \
   bash "$PREFLIGHT" >"$TMP/approved.out" 2>&1; then
  echo 'FAIL: mocked approved preflight did not complete' >&2
  sed -e "s|$SENTINEL|<redacted>|g" -e 's|mock:secret\\value|<redacted>|g' "$TMP/approved.out" >&2
  exit 1
fi
[[ -f "$TMP/psql-ran" ]]
[[ -f "$TMP/libpq-ran" ]]
grep -q 'PASS: hosted catalog/auth identity inspection completed in a read-only transaction' "$TMP/approved.out"
echo 'PASS: real libpq parsed service port as integer 5432 using loopback only'
grep -q 'quoted port rejected' "$TMP/libpq-ran" || { echo 'FAIL: quoted-port regression did not run' >&2; exit 1; }
echo 'PASS: quoted service port 5432 was rejected by real libpq'
while IFS= read -r TEMP_FILE; do
  [[ ! -e "$TEMP_FILE" ]] || { echo 'FAIL: temporary connection file was not removed' >&2; exit 1; }
  [[ ! -d "$(dirname "$TEMP_FILE")" ]] || { echo 'FAIL: temporary connection directory was not removed' >&2; exit 1; }
done < "$TMP/psql-ran"
if grep -Fq "$SENTINEL" "$TMP/approved.out" || grep -Fq 'mock:secret\value' "$TMP/approved.out"; then
  echo 'FAIL: credential sentinel appeared in output' >&2
  exit 1
fi
echo 'PASS: verified pooler service/passfile, sslmode=require, read-only SQL, secret redaction, and cleanup'

echo 'ALL MUMBAI READ-ONLY PREFLIGHT MOCK TESTS PASSED'

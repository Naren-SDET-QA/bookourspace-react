#!/usr/bin/env bash
# =============================================================================
# Read-only guard: no plaintext database credential in the active env files.
#
# Enforces the property established by the backup hardening:
#   * no BOS_DATABASE_URL (a whole PostgreSQL URI) is stored in .env/.env.local —
#     the credential comes from the macOS Keychain service
#     (BOS_BACKUP_KEYCHAIN_SERVICE, default bos-production-backup),
#   * no password-shaped key holds a non-empty value,
#   * no key holds a URL whose userinfo carries a password (public https URLs
#     such as VITE_SUPABASE_URL are fine).
#
# It never prints a value: only key names and line numbers.
#
# Usage: bash supabase/tests/check_env_secrets.sh
# Exit:  0 clean; 2 nothing to check; 3 a plaintext credential is present.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

files=()
for f in .env .env.local; do
  [ -f "$f" ] && files+=("$f")
done
if [ "${#files[@]}" -eq 0 ]; then
  echo "nothing to check: neither .env nor .env.local exists."
  exit 2
fi

python3 - "${files[@]}" <<'PY'
import re, sys, urllib.parse

PASSWORD_KEY = re.compile(r'^(?:[A-Za-z0-9]*_)?(?:PASSWORD|PASSWD|PASS|PWD|PW|SECRET|TOKEN)$', re.I)
LINE = re.compile(r'^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.*)$')

problems = []


def unquote(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        return value[1:-1]
    return value


for path in sys.argv[1:]:
    with open(path, encoding="utf-8") as fh:
        for number, raw in enumerate(fh, 1):
            match = LINE.match(raw.rstrip("\n"))
            if not match:
                continue
            key, value = match.group(2), unquote(match.group(3).strip())
            if not value:
                continue
            if key == "BOS_DATABASE_URL":
                problems.append("%s:%d %s holds a whole PostgreSQL URI (use the Keychain)" % (path, number, key))
                continue
            if PASSWORD_KEY.match(key):
                problems.append("%s:%d %s holds a non-empty password value" % (path, number, key))
                continue
            if "://" in value:
                try:
                    parts = urllib.parse.urlsplit(value)
                except ValueError:
                    continue
                if parts.password:
                    problems.append("%s:%d %s embeds a password in a URL" % (path, number, key))

if problems:
    print("FAIL plaintext credential material found in the active env files:")
    for problem in problems:
        print("  " + problem)
    sys.exit(3)

print("PASS no plaintext database URI, password value or URL-embedded password in: %s" % ", ".join(sys.argv[1:]))
PY

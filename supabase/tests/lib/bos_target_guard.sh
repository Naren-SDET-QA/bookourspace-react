#!/usr/bin/env bash
# =============================================================================
# Shared approved-target guard for BookOurSpace database tooling.
#
# Source this file; do not execute it.
#
#   . "$(dirname "$0")/lib/bos_target_guard.sh"
#   bos_load_target_config
#   bos_require_approval
#   bos_assert_connection "$DATABASE_URL"
#
# Guarantees:
#   * only the ref in supabase/backup/react-target.conf is accepted,
#   * stale/legacy refs are refused by name,
#   * host must be the approved direct or pooler host exactly,
#   * pooler username must be postgres.<approved ref> (wrong tenant is refused),
#   * port must be 5432 (session mode; pg_dump cannot use transaction mode),
#   * a PostgreSQL URI is refused inside any password variable,
#   * no function ever prints a connection string, password or key.
#
# Violations exit 3 (target/authorisation), matching the existing scripts.
# =============================================================================

[ -n "${BOS_TARGET_GUARD_LOADED:-}" ] && return 0
BOS_TARGET_GUARD_LOADED=1

BOS_GUARD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BOS_GUARD_CONFIG="$BOS_GUARD_ROOT/supabase/backup/react-target.conf"

# Owner-approved recovery identity for the production React backup path.
# These public identifiers are pinned so an edited profile or environment
# override cannot silently switch the installer back to a retired keyring.
BOS_EXPECTED_RECOVERY_KEYRING='/Users/aa/.config/bookourspace/backup-gnupg-recovery-20261106'
BOS_EXPECTED_RECOVERY_FINGERPRINT='E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A'
BOS_EXPECTED_RECOVERY_KEYCHAIN_SERVICE='bos-backup-gpg-passphrase-recovery-20261106'

bos_die() { printf '%s\n' "$*" >&2; exit 3; }
bos_warn() { printf '%s\n' "$*" >&2; }

bos_cfg_get() { # key
  [ -r "$BOS_GUARD_CONFIG" ] || bos_die "REFUSED: target profile missing: supabase/backup/react-target.conf"
  awk -F= -v k="$1" '
    /^[[:space:]]*#/ { next }
    $1 == k { sub(/^[^=]*=/, ""); gsub(/\r$/, ""); print; exit }
  ' "$BOS_GUARD_CONFIG"
}

bos_load_target_config() {
  BOS_TARGET_PROFILE="$(bos_cfg_get BOS_TARGET_PROFILE)"
  BOS_APPROVED_REF="$(bos_cfg_get BOS_APPROVED_REF)"
  BOS_REGION="$(bos_cfg_get BOS_REGION)"
  BOS_DIRECT_HOST="$(bos_cfg_get BOS_DIRECT_HOST)"
  BOS_DIRECT_USER="$(bos_cfg_get BOS_DIRECT_USER)"
  BOS_POOLER_HOST="$(bos_cfg_get BOS_POOLER_HOST)"
  BOS_POOLER_USER="$(bos_cfg_get BOS_POOLER_USER)"
  BOS_DB_PORT="$(bos_cfg_get BOS_DB_PORT)"
  BOS_DB_NAME="$(bos_cfg_get BOS_DB_NAME)"
  BOS_SSLMODE="$(bos_cfg_get BOS_SSLMODE)"
  BOS_REJECTED_REFS="$(bos_cfg_get BOS_REJECTED_REFS)"
  BOS_KEYRING_DEFAULT="$(bos_cfg_get BOS_KEYRING_DEFAULT)"
  BOS_CONFIGURED_GPG_RECIPIENT="$(bos_cfg_get BOS_BACKUP_GPG_RECIPIENT)"
  BOS_CONFIGURED_GPG_PASSPHRASE_SERVICE="$(bos_cfg_get BOS_BACKUP_GPG_PASSPHRASE_SERVICE)"
  export BOS_TARGET_PROFILE BOS_APPROVED_REF BOS_REGION BOS_DIRECT_HOST BOS_DIRECT_USER \
         BOS_POOLER_HOST BOS_POOLER_USER BOS_DB_PORT BOS_DB_NAME BOS_SSLMODE BOS_REJECTED_REFS

  # The owner fingerprint and keyring path are public backup configuration,
  # never passphrases. Explicit environment values (including an empty value
  # used by guard tests to prove refusal) take precedence over this profile.
  if [ "${BOS_BACKUP_GNUPGHOME+x}" != x ] && [ -n "$BOS_KEYRING_DEFAULT" ]; then
    BOS_BACKUP_GNUPGHOME="$BOS_KEYRING_DEFAULT"
  fi
  if [ "${BOS_BACKUP_GPG_RECIPIENT+x}" != x ]; then
    BOS_BACKUP_GPG_RECIPIENT="$BOS_CONFIGURED_GPG_RECIPIENT"
  fi
  if [ "${BOS_BACKUP_GPG_PASSPHRASE_SERVICE+x}" != x ]; then
    BOS_BACKUP_GPG_PASSPHRASE_SERVICE="$BOS_CONFIGURED_GPG_PASSPHRASE_SERVICE"
  fi
  export BOS_BACKUP_GNUPGHOME BOS_BACKUP_GPG_RECIPIENT BOS_BACKUP_GPG_PASSPHRASE_SERVICE

  [ -n "$BOS_APPROVED_REF" ] || bos_die "REFUSED: BOS_APPROVED_REF is empty in the target profile."
  case "$BOS_APPROVED_REF" in
    *[!a-z0-9]*|'') bos_die "REFUSED: BOS_APPROVED_REF is not a valid project ref." ;;
  esac
  [ "${#BOS_APPROVED_REF}" -eq 20 ] || bos_die "REFUSED: BOS_APPROVED_REF must be 20 characters."
  [ "$BOS_TARGET_PROFILE" = "react" ] || bos_die "REFUSED: only the react target profile is approved."
}

# The migration installer calls this before it reads a database URL or starts a
# dump. Config and environment must resolve to the exact owner-approved key.
# A real encrypted dump/restore verification then proves that the Keychain item
# contains the matching passphrase without printing or exporting that secret.
bos_require_recovery_identity() {
  [ "$BOS_KEYRING_DEFAULT" = "$BOS_EXPECTED_RECOVERY_KEYRING" ] \
    || bos_die "REFUSED: canonical React backup profile has an unexpected GPG keyring."
  [ "$BOS_CONFIGURED_GPG_RECIPIENT" = "$BOS_EXPECTED_RECOVERY_FINGERPRINT" ] \
    || bos_die "REFUSED: canonical React backup profile has an unexpected GPG recipient fingerprint."
  [ "$BOS_CONFIGURED_GPG_PASSPHRASE_SERVICE" = "$BOS_EXPECTED_RECOVERY_KEYCHAIN_SERVICE" ] \
    || bos_die "REFUSED: canonical React backup profile has an unexpected GPG Keychain service."
  [ "${BOS_BACKUP_GNUPGHOME:-}" = "$BOS_EXPECTED_RECOVERY_KEYRING" ] \
    || bos_die "REFUSED: GPG keyring override differs from the approved recovery keyring."
  [ "${BOS_BACKUP_GPG_RECIPIENT:-}" = "$BOS_EXPECTED_RECOVERY_FINGERPRINT" ] \
    || bos_die "REFUSED: GPG fingerprint override differs from the approved recovery key."
  [ "${BOS_BACKUP_GPG_PASSPHRASE_SERVICE:-}" = "$BOS_EXPECTED_RECOVERY_KEYCHAIN_SERVICE" ] \
    || bos_die "REFUSED: GPG Keychain service override differs from the approved recovery item."
  [ -d "$BOS_EXPECTED_RECOVERY_KEYRING" ] \
    || bos_die "REFUSED: approved GPG recovery keyring is unavailable."
  local secret_fingerprint
  secret_fingerprint="$(GNUPGHOME="$BOS_EXPECTED_RECOVERY_KEYRING" gpg --batch --with-colons --list-secret-keys "$BOS_EXPECTED_RECOVERY_FINGERPRINT" 2>/dev/null | awk -F: '$1 == "fpr" { print $10; exit }')"
  [ "$secret_fingerprint" = "$BOS_EXPECTED_RECOVERY_FINGERPRINT" ] \
    || bos_die "REFUSED: approved secret-key fingerprint is not available in the configured keyring."
}

bos_require_approval() {
  [ "${BOS_BACKUP_AUTHORIZED:-}" = "backup-only" ] \
    || bos_die "REFUSED: missing approval. Set BOS_BACKUP_AUTHORIZED=backup-only. No connection was attempted."
}

bos_require_ref_confirmation() { # value supplied by operator [variable name for the message]
  local var_name="${2:-BOS_DEV_CONFIRM}"
  [ "${1:-}" = "$BOS_APPROVED_REF" ] \
    || bos_die "REFUSED: set ${var_name}=$BOS_APPROVED_REF to confirm the approved React target. No connection was attempted."
}

# Reject a PostgreSQL URI (or any URL) held in a variable that is meant to be a
# password. Never echoes the value.
bos_assert_password_is_bare() { # varname value
  local name="$1" value="${2:-}"
  [ -z "$value" ] && return 0
  case "$value" in
    *://*) bos_die "REFUSED: $name holds a PostgreSQL URI. A password variable must contain only the password; use Keychain or an interactive prompt." ;;
  esac
}

# Parse a connection URL without printing it.
# stdout: scheme|host|port|user|dbname|has_password|sslmode
bos_parse_url() { # url
  printf '%s\n' "$1" | python3 -c '
import sys, urllib.parse
raw = sys.stdin.readline().strip()
u = urllib.parse.urlsplit(raw)
q = urllib.parse.parse_qs(u.query)
print("|".join([
    u.scheme,
    u.hostname or "",
    str(u.port or ""),
    urllib.parse.unquote(u.username or ""),
    (u.path or "/").lstrip("/") or "postgres",
    "yes" if u.password else "no",
    (q.get("sslmode", [""])[0]),
]))
'
}

# bos_assert_connection <url>
# Refuses anything that is not the approved React target. Prints only a
# sanitised one-line identity (host/port/db), never the URL or its password.
bos_assert_connection() {
  local url="${1:-}"
  [ -n "$url" ] || bos_die "REFUSED: no database URL supplied. No connection was attempted."

  local parsed scheme host port user dbname has_pw sslmode
  parsed="$(bos_parse_url "$url")" || bos_die "REFUSED: the connection string could not be parsed."
  IFS='|' read -r scheme host port user dbname has_pw sslmode <<< "$parsed"

  case "$scheme" in
    postgres|postgresql) ;;
    *) bos_die "REFUSED: only postgres:// or postgresql:// URLs are accepted." ;;
  esac

  # Reject stale/legacy refs by name first, so the message is actionable.
  local token
  for token in $BOS_REJECTED_REFS; do
    case " $host $user " in
      *"$token"*)
        case "$token" in
          sfoizxarbljhldmkgsma) bos_die "REFUSED: connection names the STALE Mumbai project sfoizxarbljhldmkgsma. Approved target is $BOS_APPROVED_REF." ;;
          ezrxykyocgbolpaebnqx) bos_die "REFUSED: connection names the LEGACY Stockholm project ezrxykyocgbolpaebnqx. That project is preserved but is not a backup target; approved target is $BOS_APPROVED_REF." ;;
          *) bos_die "REFUSED: connection names a non-approved project ref. Approved target is $BOS_APPROVED_REF." ;;
        esac
        ;;
    esac
  done

  # Every 20-char ref token in host/user must be the approved ref.
  local refs
  refs="$(printf '%s %s' "$host" "$user" | grep -oE '[a-z0-9]{20}' | sort -u | tr '\n' ' ' | sed -E 's/ +$//')"
  [ "$refs" = "$BOS_APPROVED_REF" ] \
    || bos_die "REFUSED: connection must name exactly $BOS_APPROVED_REF (found: ${refs:-none})."

  if [ "$host" = "$BOS_POOLER_HOST" ]; then
    [ "$user" = "$BOS_POOLER_USER" ] \
      || bos_die "REFUSED: pooler username must be exactly $BOS_POOLER_USER (tenant is carried in the username)."
    [ "$port" = "$BOS_DB_PORT" ] \
      || bos_die "REFUSED: session pooler requires port $BOS_DB_PORT (transaction mode cannot run pg_dump)."
  elif [ "$host" = "$BOS_DIRECT_HOST" ]; then
    [ "$user" = "$BOS_DIRECT_USER" ] \
      || bos_die "REFUSED: direct connection username must be exactly $BOS_DIRECT_USER."
    [ -z "$port" ] || [ "$port" = "$BOS_DB_PORT" ] \
      || bos_die "REFUSED: direct connection must use port $BOS_DB_PORT."
  else
    bos_die "REFUSED: host does not match the approved React target ($BOS_POOLER_HOST or $BOS_DIRECT_HOST)."
  fi

  [ "$dbname" = "$BOS_DB_NAME" ] \
    || bos_die "REFUSED: database must be '$BOS_DB_NAME'."

  case "$sslmode" in
    ""|require|verify-ca|verify-full) ;;
    *) bos_die "REFUSED: sslmode must be require/verify-ca/verify-full." ;;
  esac
  if [ -z "$sslmode" ]; then
    bos_warn "NOTE: no sslmode in the URL; export PGSSLMODE=$BOS_SSLMODE before connecting."
  fi

  BOS_CONNECTION_HOST="$host"
  BOS_CONNECTION_PORT="$port"
  BOS_CONNECTION_DB="$dbname"
  BOS_CONNECTION_VIA="direct"; [ "$host" = "$BOS_POOLER_HOST" ] && BOS_CONNECTION_VIA="pooler"
  bos_warn "target verified: ref=$BOS_APPROVED_REF via=$BOS_CONNECTION_VIA host=$host port=${port:-$BOS_DB_PORT} db=$dbname password_present=$has_pw"
}

# Prepare libpq without placing the password in child argv or on disk. The
# approved URI is parsed through stdin; only the password-free DSN is retained
# as an argv value, and PGPASSWORD exists only in process memory.
bos_prepare_libpq_auth() { # approved_database_url
  local raw_url="${1:-}" fields
  [ -n "$raw_url" ] || bos_die "REFUSED: no database URL supplied for libpq."
  fields="$(printf '%s' "$raw_url" | python3 -c '
import sys
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit
raw = sys.stdin.read()
try:
    u = urlsplit(raw)
    if u.scheme not in ("postgres", "postgresql") or not u.hostname:
        raise ValueError
    username = unquote(u.username or "")
    password = unquote(u.password or "")
    if not username or not password or any(ord(c) < 32 or ord(c) == 127 for c in password):
        raise ValueError
    hostport = u.hostname
    if ":" in hostport and not hostport.startswith("["):
        hostport = "[" + hostport + "]"
    if u.port:
        hostport += ":" + str(u.port)
    safe_netloc = (u.username or "") + "@" + hostport
    safe_query = urlencode([(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True)
                            if k.lower() not in ("password", "passfile", "sslpassword")])
    safe_dsn = urlunsplit((u.scheme, safe_netloc, u.path, safe_query, ""))
    sys.stdout.write(safe_dsn + "\t" + password)
except Exception:
    sys.exit(1)
')" || bos_die "REFUSED: database URI could not be prepared securely for libpq."
  BOS_LIBPQ_DSN="${fields%%$'\t'*}"
  PGPASSWORD="${fields#*$'\t'}"
  [ -n "$BOS_LIBPQ_DSN" ] && [ -n "$PGPASSWORD" ] \
    || bos_die "REFUSED: database URI did not contain a usable password."
  export BOS_LIBPQ_DSN PGPASSWORD
  unset fields raw_url
}

# Encryption keyring must live outside both the archive tree and the repository.
bos_assert_keyring_separate() { # keyring_dir backup_root
  local keyring="${1:-}" root="${2:-}"
  [ -n "$keyring" ] && [ -n "$root" ] || bos_die "REFUSED: keyring and backup root must both be set."
  local kr rr
  kr="$(cd "$keyring" 2>/dev/null && pwd -P || printf '%s' "$keyring")"
  rr="$(cd "$root" 2>/dev/null && pwd -P || printf '%s' "$root")"
  case "$kr" in
    "$rr"|"$rr"/*) bos_die "REFUSED: the encryption keyring must not live inside the backup destination." ;;
  esac
  case "$kr" in
    "$BOS_GUARD_ROOT"|"$BOS_GUARD_ROOT"/*) bos_die "REFUSED: the encryption keyring must not live inside the repository." ;;
  esac
}

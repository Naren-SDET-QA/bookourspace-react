#!/usr/bin/env bash
# =============================================================================
# Read-only production backup for the React Supabase database — encrypted,
# Auth-preserving and restore-verified.
#
# GATED: refuses unless ALL of these are supplied by the operator, because a
# production dump is a separately approved operation:
#
#   BOS_BACKUP_AUTHORIZED=backup-only             explicit backup-only authorisation
#   BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq     exact project-reference confirmation
#   BOS_PRODUCTION_DATABASE_URL=postgresql://...  optional; otherwise Keychain
#   BOS_BACKUP_KEYCHAIN_SERVICE=bos-production-backup (default Keychain service)
#   BOS_BACKUP_GPG_RECIPIENT=<fingerprint>        owner key; no plaintext archive
#   BOS_BACKUP_KEYCHAIN_SERVICE=bos-production-backup (default Keychain service)
#
# Target enforcement: supabase/tests/lib/bos_target_guard.sh.
# Encryption: supabase/tests/lib/bos_backup_crypto.sh (owner keyring must live
# outside the archive and outside the repository).
#
# Archive layout (a directory, so verify_backup_archive.sh can audit it):
#   backup.dump.gpg          encrypted custom-format dump (plaintext removed)
#   schema.sql               schema-only dump for review
#   toc.txt                  pg_restore table of contents
#   identity-preflight.txt   server identity + read-only session marker
#   restore-verification.txt restore counts, incl. auth.users / auth.identities
#   encryption.txt           recipient fingerprint + plaintext checksum
#   SHA256SUMS               covers every artefact above
#
# Usage:
#   BOS_BACKUP_AUTHORIZED=backup-only BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq \
#   BOS_BACKUP_GPG_RECIPIENT=<FPR> \
#     bash supabase/tests/backup_production_readonly.sh ~/BookOurSpace_Backups/react/prod-<UTC>
#   (the exact target URI is read in memory from the bos-production-backup Keychain item)
#
# Self-test (disposable local database, throwaway keyring, no hosted access):
#   BOS_BACKUP_SELFTEST=1 BOS_BACKUP_GPG_RECIPIENT=<FPR> \
#   BOS_BACKUP_GNUPGHOME=/tmp/throwaway bash supabase/tests/backup_production_readonly.sh
#
# Exit: 0 verified; 2 usage; 3 wrong/unsafe target or approval; 4 dump/scope;
#       5 checksum/encryption; 6 restore or verification failure.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C
umask 077

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
# shellcheck source=lib/bos_target_guard.sh
. "$REPO_ROOT/supabase/tests/lib/bos_target_guard.sh"
bos_load_target_config
# shellcheck source=lib/bos_backup_crypto.sh
. "$REPO_ROOT/supabase/tests/lib/bos_backup_crypto.sh"
PROD_REF="$BOS_APPROVED_REF"
BACKUP_ROOT="${BOS_BACKUP_ROOT:-$HOME/BookOurSpace_Backups/react}"
GPG_RECIPIENT="${BOS_BACKUP_GPG_RECIPIENT:-}"

free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'
}

# dump -> scope check -> checksums -> isolated restore -> auth compare ->
# encrypt -> remove plaintext -> rewrite checksums.
# prod_backup <database_url> <archive_dir> <label> [run_privacy_tests]
prod_backup() {
  local url="$1" dir="$2" label="$3" privacy="${4:-yes}"
  local restore_root restore_port restore_data
  [ -n "${BOS_LIBPQ_DSN:-}" ] && url="$BOS_LIBPQ_DSN"
  # Any exit from this function must remove transient plaintext. The caller
  # receives only the encrypted archive after successful verification.
  trap 'rm -f -- "$dir/backup.dump"' RETURN

  mkdir -p "$dir" && chmod 700 "$dir" || return 4
  if [ -e "$dir/backup.dump" ] || [ -e "$dir/backup.dump.gpg" ]; then
    echo "REFUSED: $dir already holds a dump; refusing to overwrite a backup." >&2
    return 2
  fi

  echo "=== 0. identity / read-only preflight ==="
  local IDENTITY_ROW
  if ! IDENTITY_ROW="$(PGOPTIONS='-c default_transaction_read_only=on' psql "$url" -tAc \
        "select current_database() || ' | user=' || current_user || ' | server=' || current_setting('server_version')" 2>/dev/null)"; then
    echo "FAILED: cannot verify database identity or read-only permission; no dump was taken." >&2
    return 3
  fi
  [ -n "$IDENTITY_ROW" ] || { echo "FAILED: identity preflight returned no row; no dump was taken." >&2; return 3; }
  echo "identity: $IDENTITY_ROW"
  {
    printf 'identity=%s\n' "$IDENTITY_ROW"
    printf 'session_read_only=on (PGOPTIONS default_transaction_read_only)\n'
    printf 'project_ref=%s\n' "$PROD_REF"
  } > "$dir/identity-preflight.txt"
  chmod 600 "$dir/identity-preflight.txt"

  echo "=== 1. dump (read-only, $label) ==="
  if ! PGOPTIONS="-c default_transaction_read_only=on" pg_dump "$url" \
        --format=custom --no-owner --no-privileges --file "$dir/backup.dump" 2> "$dir/dump.err"; then
    echo "pg_dump failed:" >&2
    sed -e 's#postgres\(ql\)\?://[^ ]*#<redacted>#g' "$dir/dump.err" >&2
    return 4
  fi
  if ! PGOPTIONS="-c default_transaction_read_only=on" pg_dump "$url" --schema-only \
      --no-owner --no-privileges --file "$dir/schema.sql" 2>> "$dir/dump.err"; then
    echo "FAILED: schema-only dump did not complete; no verified archive was produced." >&2
    return 4
  fi
  if ! pg_restore --list "$dir/backup.dump" > "$dir/toc.txt" 2>/dev/null; then
    echo "FAILED: custom-format dump could not be inspected; no verified archive was produced." >&2
    return 4
  fi

  # Auth preservation: without auth.users/auth.identities data every Google
  # sign-in is lost and the archive cannot be a recovery anchor.
  if ! grep -qE 'TABLE DATA auth users([[:space:]]|$)' "$dir/toc.txt" \
     || ! grep -qE 'TABLE DATA auth identities([[:space:]]|$)' "$dir/toc.txt"; then
    echo "FAILED: dump must contain both auth.users and auth.identities data." >&2
    return 4
  fi

  echo "=== 2. checksums ==="
  ( cd "$dir" && shasum -a 256 backup.dump schema.sql toc.txt identity-preflight.txt > SHA256SUMS ) || return 5
  ( cd "$dir" && shasum -a 256 -c SHA256SUMS >/dev/null 2>&1 ) || {
    echo "FAILED: checksum verification did not match." >&2; return 5; }

  echo "=== 3. isolated restore into a disposable local cluster ==="
  restore_root="$(mktemp -d "${TMPDIR:-/tmp}/bos-prod-restore.XXXXXX")" || return 6
  restore_data="$restore_root/pgdata"
  restore_port="$(free_port)"
  cleanup_restore() {
    pg_ctl -D "$restore_data" -m fast -w stop >/dev/null 2>&1 || true
    rm -rf "$restore_root"
    # Never leave an unencrypted dump behind if restore/verification fails.
    rm -f -- "$dir/backup.dump"
  }
  # shellcheck disable=SC2064
  trap cleanup_restore RETURN

  initdb -D "$restore_data" -U postgres --auth=trust > "$restore_root/initdb.log" 2>&1 \
    || { echo "FAILED: initdb" >&2; return 6; }
  pg_ctl -D "$restore_data" -o "-p $restore_port -k /tmp -c listen_addresses=127.0.0.1" \
    -l "$restore_root/pg.log" start >/dev/null 2>&1 \
    || { echo "FAILED: throwaway cluster start" >&2; return 6; }
  local i
  for i in $(seq 1 60); do
    PGSSLMODE=disable psql -h 127.0.0.1 -p "$restore_port" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
    sleep 0.5
  done
  PGSSLMODE=disable psql -h 127.0.0.1 -p "$restore_port" -U postgres -q -c 'create database bos_prod_restore' \
    || { echo "FAILED: create restore database" >&2; return 6; }
  if ! PGSSLMODE=disable psql -h 127.0.0.1 -p "$restore_port" -U postgres -d bos_prod_restore -q -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
SQL
  then
    echo "FAILED: create Supabase-compatible restore roles" >&2
    return 6
  fi

  # Supabase's hosted database carries the supabase_vault extension and vault
  # schema. The disposable local cluster has no such extension; exclude only those
  # managed objects so the public/auth schema and data can still be restore-verified.
  if ! pg_restore -l "$dir/backup.dump" 2>/dev/null \
        | awk '!/supabase_vault/ && !/SCHEMA - vault/ && !/TABLE DATA vault /' \
        > "$restore_root/restore.toc"; then
    echo "FAILED: could not prepare a filtered restore TOC" >&2
    return 6
  fi
  if ! PGSSLMODE=disable pg_restore --no-owner --exit-on-error -L "$restore_root/restore.toc" \
        -d "postgresql://postgres@127.0.0.1:$restore_port/bos_prod_restore" "$dir/backup.dump" \
        > "$restore_root/restore.log" 2>&1; then
    echo "FAILED: pg_restore --exit-on-error; last lines:" >&2
    grep -iE 'error' "$restore_root/restore.log" | head -5 >&2
    return 6
  fi

  local rq=(env PGSSLMODE=disable psql -h 127.0.0.1 -p "$restore_port" -U postgres -d bos_prod_restore -tAc)
  local r_tables r_rls r_policies r_auth_users r_auth_identities r_profiles
  local r_storage_tables r_storage_buckets r_storage_objects
  r_tables="$("${rq[@]}" "select count(*) from pg_tables where schemaname='public'")"
  r_rls="$("${rq[@]}" "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity")"
  r_policies="$("${rq[@]}" "select count(*) from pg_policies where schemaname='public'")"
  r_auth_users="$("${rq[@]}" "select count(*) from auth.users" 2>/dev/null || echo absent)"
  r_auth_identities="$("${rq[@]}" "select count(*) from auth.identities" 2>/dev/null || echo absent)"
  r_profiles="$("${rq[@]}" "select count(*) from public.profiles" 2>/dev/null || echo absent)"
  r_storage_tables="$("${rq[@]}" "select count(*) from pg_tables where schemaname='storage'")"
  r_storage_buckets=0; r_storage_objects=0
  if [ "$("${rq[@]}" "select to_regclass('storage.buckets') is not null")" = 't' ]; then
    r_storage_buckets="$("${rq[@]}" 'select count(*) from storage.buckets')"
  fi
  if [ "$("${rq[@]}" "select to_regclass('storage.objects') is not null")" = 't' ]; then
    r_storage_objects="$("${rq[@]}" 'select count(*) from storage.objects')"
  fi

  local s_tables s_rls s_policies s_auth_users s_auth_identities
  local s_storage_tables s_storage_buckets s_storage_objects
  s_tables="$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select count(*) from pg_tables where schemaname='public'" 2>/dev/null | tr -d ' ')"
  s_rls="$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity" 2>/dev/null | tr -d ' ')"
  s_policies="$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select count(*) from pg_policies where schemaname='public'" 2>/dev/null | tr -d ' ')"
  s_auth_users="$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select count(*) from auth.users" 2>/dev/null | tr -d ' ' || echo absent)"
  s_auth_identities="$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select count(*) from auth.identities" 2>/dev/null | tr -d ' ' || echo absent)"
  s_storage_tables="$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select count(*) from pg_tables where schemaname='storage'" 2>/dev/null | tr -d ' ' || echo unavailable)"
  s_storage_buckets=0; s_storage_objects=0
  if [ "$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select to_regclass('storage.buckets') is not null" 2>/dev/null | tr -d ' ')" = 't' ]; then
    s_storage_buckets="$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc 'select count(*) from storage.buckets' 2>/dev/null | tr -d ' ' || echo unavailable)"
  fi
  if [ "$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select to_regclass('storage.objects') is not null" 2>/dev/null | tr -d ' ')" = 't' ]; then
    s_storage_objects="$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc 'select count(*) from storage.objects' 2>/dev/null | tr -d ' ' || echo unavailable)"
  fi

  {
    printf 'target=%s\n' "$label"
    printf 'dump_scope=all schemas readable by the backup role (public, auth, storage metadata, supabase_migrations)\n'
    printf 'auth_tables_in_dump=%s\n' "$(grep -cE 'TABLE (DATA )?auth[[:space:]]' "$dir/toc.txt" 2>/dev/null || true)"
    printf 'storage_metadata_tables_in_dump=%s\n' "$(grep -cE 'TABLE (DATA )?storage[[:space:]]' "$dir/toc.txt" 2>/dev/null || true)"
    printf 'supabase_migrations_tables_in_dump=%s\n' "$(grep -cE 'TABLE (DATA )?supabase_migrations[[:space:]]' "$dir/toc.txt" 2>/dev/null || true)"
    printf 'storage_binary_objects=EXCLUDED (object bytes live in Supabase Storage, not in PostgreSQL)\n'
    printf 'source_public_tables=%s\n' "${s_tables:-unavailable}"
    printf 'source_rls_tables=%s\n' "${s_rls:-unavailable}"
    printf 'source_policies=%s\n' "${s_policies:-unavailable}"
    printf 'source_auth_users=%s\n' "${s_auth_users:-absent}"
    printf 'source_auth_identities=%s\n' "${s_auth_identities:-absent}"
    printf 'source_storage_tables=%s\n' "${s_storage_tables:-unavailable}"
    printf 'source_storage_buckets=%s\n' "${s_storage_buckets:-unavailable}"
    printf 'source_storage_objects=%s\n' "${s_storage_objects:-unavailable}"
    printf 'restored_public_tables=%s\n' "$r_tables"
    printf 'restored_rls_tables=%s\n' "$r_rls"
    printf 'restored_policies=%s\n' "$r_policies"
    printf 'restored_auth_users=%s\n' "$r_auth_users"
    printf 'restored_auth_identities=%s\n' "$r_auth_identities"
    printf 'restored_storage_tables=%s\n' "$r_storage_tables"
    printf 'restored_storage_buckets=%s\n' "$r_storage_buckets"
    printf 'restored_storage_objects=%s\n' "$r_storage_objects"
    printf 'restored_public_profiles=%s\n' "$r_profiles"
    printf 'backup_dir=%s\n' "$dir"
  } | tee "$dir/restore-verification.txt"
  chmod 600 "$dir/restore-verification.txt"

  if ! [[ "${s_tables:-}" =~ ^[0-9]+$ ]] || ! [[ "${r_tables:-}" =~ ^[0-9]+$ ]] \
     || [ "$s_tables" != "$r_tables" ]; then
    echo "FAILED: restored table count $r_tables != source $s_tables" >&2
    return 6
  fi
  if [ -n "${s_policies:-}" ] && [ "$s_policies" != "$r_policies" ]; then
    echo "FAILED: restored policy count $r_policies != source $s_policies" >&2
    return 6
  fi
  if ! [[ "${s_rls:-}" =~ ^[0-9]+$ ]] || [ "$s_rls" != "$r_rls" ]; then
    echo "FAILED: restored RLS-enabled relation count $r_rls != source $s_rls" >&2
    return 6
  fi
  if [ "$r_auth_users" = "absent" ] || [ "${r_auth_users:-0}" -lt 1 ]; then
    echo "FAILED: auth.users did not survive the restore (sign-in data loss)." >&2
    return 6
  fi
  if [ "$r_auth_identities" = "absent" ] || [ "${r_auth_identities:-0}" -lt 1 ]; then
    echo "FAILED: auth.identities did not survive the restore (provider linkage loss)." >&2
    return 6
  fi
  if [ "$s_auth_users" = absent ] || [ "$s_auth_identities" = absent ] \
     || [ "$s_auth_users" != "$r_auth_users" ] || [ "$s_auth_identities" != "$r_auth_identities" ]; then
    echo "FAILED: Auth user/identity counts did not survive the isolated restore." >&2
    return 6
  fi
  if ! [[ "${s_storage_tables:-}" =~ ^[0-9]+$ ]] || [ "$s_storage_tables" != "$r_storage_tables" ] \
     || [ "${s_storage_buckets:-unavailable}" != "$r_storage_buckets" ] \
     || [ "${s_storage_objects:-unavailable}" != "$r_storage_objects" ]; then
    echo "FAILED: Storage metadata table/bucket/object counts did not survive the isolated restore." >&2
    return 6
  fi
  if [ "$s_storage_tables" -gt 0 ]; then
    grep -qE 'TABLE DATA storage buckets([[:space:]]|$)' "$dir/toc.txt" \
      && grep -qE 'TABLE DATA storage objects([[:space:]]|$)' "$dir/toc.txt" \
      || { echo "FAILED: Storage metadata tables exist but their data is absent from the dump." >&2; return 4; }
  fi

  local restored_profiles
  restored_profiles="$("${rq[@]}" "select to_regclass('public.profiles') is not null")"
  if [ "$privacy" = "yes" ] && [ "$restored_profiles" = 't' ] \
     && [ -f "$REPO_ROOT/supabase/tests/profile_private_access_test.sql" ]; then
    echo "=== 3b. privacy assertions on the restored copy ==="
    local privacy_out
    privacy_out="$(psql -h 127.0.0.1 -p "$restore_port" -U postgres -d bos_prod_restore -q -v ON_ERROR_STOP=1 \
      -f "$REPO_ROOT/supabase/tests/profile_private_access_test.sql" 2>&1)"
    printf '%s\n' "$privacy_out" | grep -E 'PASS|FAILED' || true
    if printf '%s\n' "$privacy_out" | grep -q 'FAILED'; then
      echo "FAILED: privacy assertions failed on the restored copy." >&2
      return 6
    fi
  fi

  echo "=== 4. encrypting with the owner key (no plaintext archive is kept) ==="
  bos_crypto_assert_separation "$dir"
  bos_assert_keyring_separate "$(bos_crypto_keyring)" "$BACKUP_ROOT"
  local plain_sha
  plain_sha="$(shasum -a 256 "$dir/backup.dump" | cut -d' ' -f1)"
  bos_crypto_encrypt "$dir/backup.dump" "$dir/backup.dump.gpg" || return 5
  bos_crypto_verify "$dir/backup.dump.gpg" || return 5
  bos_crypto_roundtrip "$dir/backup.dump.gpg" "$plain_sha" || return 5
  {
    printf 'encryption=openpgp\n'
    printf 'recipient_fingerprint=%s\n' "$(bos_crypto_fingerprint)"
    printf 'dump_plaintext_sha256=%s\n' "$plain_sha"
    printf 'keyring=%s (outside the archive and the repository)\n' "$(bos_crypto_keyring)"
  } > "$dir/encryption.txt"
  chmod 600 "$dir/encryption.txt"
  rm -f "$dir/backup.dump"
  ( cd "$dir" && shasum -a 256 backup.dump.gpg schema.sql toc.txt identity-preflight.txt \
      restore-verification.txt encryption.txt > SHA256SUMS ) || return 5
  ( cd "$dir" && shasum -a 256 -c SHA256SUMS >/dev/null 2>&1 ) || {
    echo "FAILED: post-encryption checksum verification did not match." >&2; return 5; }
  echo "    encrypted artefact: $dir/backup.dump.gpg (plaintext removed)"
  return 0
}

# -----------------------------------------------------------------------------
# Self-test: proves the production pipeline on a disposable database.
# -----------------------------------------------------------------------------
if [ "${BOS_BACKUP_SELFTEST:-}" = "1" ]; then
  ROOT="$(mktemp -d "${TMPDIR:-/tmp}/bos-prod-selftest.XXXXXX")" || exit 1
  DATA="$ROOT/pgdata"; PORT="$(free_port)"; OUT="$ROOT/archive"
  cleanup_self() { pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$ROOT"; }
  trap cleanup_self EXIT
  echo "=== SELF-TEST (disposable local database; NOT a hosted backup) ==="
  bos_crypto_require_recipient || exit 5
  initdb -D "$DATA" -U postgres --auth=trust > "$ROOT/initdb.log" 2>&1 || { echo "SELF-TEST FAILED: initdb"; exit 1; }
  pg_ctl -D "$DATA" -o "-p $PORT -k $ROOT -c listen_addresses=127.0.0.1" -l "$ROOT/pg.log" start >/dev/null 2>&1 \
    || { echo "SELF-TEST FAILED: start"; exit 1; }
  for _ in $(seq 1 60); do psql -h 127.0.0.1 -p "$PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break; sleep 0.5; done
  psql -h 127.0.0.1 -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1 <<'SQL' || { echo "SELF-TEST FAILED: fixture"; exit 1; }
create database bos_prod_selftest;
\connect bos_prod_selftest
create schema auth;
create table auth.users (id uuid primary key, email text not null);
create table auth.identities (id uuid primary key, user_id uuid not null, provider text not null);
create schema storage;
create table storage.buckets (id text primary key, name text not null);
create table storage.objects (id uuid primary key, bucket_id text not null references storage.buckets(id), name text not null, metadata jsonb);
insert into auth.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'selftest@example.test');
insert into auth.identities values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'google');
insert into storage.buckets values ('media', 'media');
insert into storage.objects values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'media', 'fixture.jpg', '{"size":12}');
create table public.selftest_bookings (id int primary key, amount numeric not null);
insert into public.selftest_bookings values (1, 100), (2, 250);
alter table public.selftest_bookings enable row level security;
create policy selftest_read on public.selftest_bookings for select using (true);
create database bos_first_install;
\connect bos_first_install
create schema auth;
create table auth.users (id uuid primary key, email text not null);
create table auth.identities (id uuid primary key, user_id uuid not null, provider text not null);
create schema storage;
create table storage.buckets (id text primary key, name text not null);
create table storage.objects (id uuid primary key, bucket_id text not null references storage.buckets(id), name text not null, metadata jsonb);
insert into auth.users values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'first-install@example.test');
insert into auth.identities values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'google');
insert into storage.buckets values ('first-install', 'first-install');
insert into storage.objects values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'first-install', 'fixture.jpg', '{"size":12}');
SQL
  if ! prod_backup "postgresql://postgres@127.0.0.1:$PORT/bos_prod_selftest" "$OUT" "selftest" no; then
    echo "SELF-TEST FAILED: production pipeline returned an error" >&2
    exit 1
  fi
  if ! bash "$REPO_ROOT/supabase/tests/verify_backup_archive.sh" "$OUT" "$PROD_REF" --require-encryption; then
    echo "SELF-TEST FAILED: archive verifier rejected the production archive" >&2
    exit 1
  fi
  if ! prod_backup "postgresql://postgres@127.0.0.1:$PORT/bos_first_install" "$ROOT/first-install-archive" "first-install-empty-public-schema" no; then
    echo "SELF-TEST FAILED: Auth-only first-install backup pipeline returned an error" >&2
    exit 1
  fi
  if ! bash "$REPO_ROOT/supabase/tests/verify_backup_archive.sh" "$ROOT/first-install-archive" "$PROD_REF" --require-encryption; then
    echo "SELF-TEST FAILED: Auth-only first-install archive verifier rejected the archive" >&2
    exit 1
  fi
  echo "SELF-TEST PASS: first-install archive with zero public tables preserves and restores Auth"
  echo "SELF-TEST PASS: encrypted, Auth-preserving, restore-verified archive passes verify_backup_archive.sh"
  echo "NOTE: this validates the production backup tooling only; it is not a backup of $PROD_REF."
  exit 0
fi

# -----------------------------------------------------------------------------
# Guarded real run.
# -----------------------------------------------------------------------------
if [ "${BOS_BACKUP_AUTHORIZED:-}" != "backup-only" ]; then
  cat >&2 <<'MSG'
REFUSED: a production database dump requires explicit backup-only authorisation.
Set BOS_BACKUP_AUTHORIZED=backup-only together with BOS_PROD_REF_CONFIRM and
BOS_BACKUP_GPG_RECIPIENT. The approved target URI is read from Keychain unless
BOS_PRODUCTION_DATABASE_URL is explicitly supplied. No connection was attempted.
MSG
  exit 3
fi
bos_require_ref_confirmation "${BOS_PROD_REF_CONFIRM:-}" BOS_PROD_REF_CONFIRM
DATABASE_URL="${BOS_PRODUCTION_DATABASE_URL:-}"
KEYCHAIN_SERVICE="${BOS_BACKUP_KEYCHAIN_SERVICE:-bos-production-backup}"
if [ -z "$DATABASE_URL" ] && command -v security >/dev/null 2>&1; then
  DATABASE_URL="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || true)"
fi
if [ -z "$DATABASE_URL" ]; then
  echo "REFUSED: no database URL was supplied and the configured Keychain item was unavailable. No connection was attempted." >&2
  exit 3
fi
bos_assert_connection "$DATABASE_URL"
bos_prepare_libpq_auth "$DATABASE_URL"
unset DATABASE_URL BOS_PRODUCTION_DATABASE_URL
export PGSSLMODE="${PGSSLMODE:-$BOS_SSLMODE}"

if [ "${BOS_BACKUP_GUARD_ONLY:-}" = "1" ]; then
  echo "GUARDS PASS: Keychain/environment credential loaded in memory, backup-only approval and exact ref verified, no connection attempted."
  exit 0
fi

OUT_DIR="${1:-}"
if [ -z "$OUT_DIR" ]; then
  echo "usage: BOS_BACKUP_AUTHORIZED=backup-only BOS_PROD_REF_CONFIRM=$PROD_REF BOS_BACKUP_GPG_RECIPIENT=<FPR> BOS_PRODUCTION_DATABASE_URL=... bash $0 <archive-directory>" >&2
  exit 2
fi

# No plaintext archive path exists: encryption is mandatory, checked before connecting.
if [ -z "$GPG_RECIPIENT" ]; then
  echo "REFUSED: encrypted OpenPGP backup is required for the approved React project; set BOS_BACKUP_GPG_RECIPIENT and its external owner keyring. No connection was attempted." >&2
  exit 5
fi
bos_crypto_require_recipient || exit 5

if ! prod_backup "$BOS_LIBPQ_DSN" "$OUT_DIR" "$PROD_REF" yes; then
  echo "BACKUP FAILED for $PROD_REF; nothing was declared PASS. See $OUT_DIR" >&2
  exit 6
fi

echo "=== 5. offline archive verification ==="
bash "$REPO_ROOT/supabase/tests/verify_backup_archive.sh" "$OUT_DIR" "$PROD_REF" --require-encryption || exit 6

echo "=== verdict ==="
echo "PASS encrypted dump + Auth preservation + isolated restore verified for $PROD_REF"
echo "archive: $OUT_DIR (mode 700, outside the repository)"
echo "NOTE: hosted backup schedule / PITR window must still be read from the project dashboard."

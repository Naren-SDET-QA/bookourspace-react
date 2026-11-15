#!/usr/bin/env bash
# =============================================================================
# BookOurSpace — React production Supabase backup + verification
#
# Target: ONLY the approved React project in supabase/backup/react-target.conf
# (obkfgxjzlscungkhbyvq, ap-south-1), enforced by supabase/tests/lib/
# bos_target_guard.sh. Stale Mumbai and legacy Stockholm refs are refused by
# name; this script refuses to connect to any other project.
#
# Defaults: ~/BookOurSpace_Backups/react/<ref>-<UTC>/, mode 700, umask 077.
# Required for a real hosted run: BOS_BACKUP_GPG_RECIPIENT=<fingerprint>
# encrypts the dump with the OWNER key and removes the plaintext copy. Only the
# disposable local selftest may run without it. The keyring is read from
# BOS_BACKUP_GNUPGHOME (default ~/.config/bookourspace/backup-gnupg) and must
# live outside both the archive tree and this repository;
# supabase/tests/lib/bos_backup_crypto.sh enforces that.
#
# Real run (only when a read-only PostgreSQL credential exists):
#   BOS_BACKUP_AUTHORIZED=backup-only \
#   BOS_BACKUP_DATABASE_URL='postgres://readonly@.../postgres' \
#   BOS_DEV_CONFIRM=obkfgxjzlscungkhbyvq \
#   BOS_BACKUP_GPG_RECIPIENT=<owner-fingerprint> \
#     bash supabase/tests/run_dev_backup.sh
#
# The real run additionally requires ALL of:
#   BOS_BACKUP_AUTHORIZED=backup-only   explicit backup-only authorisation
#   BOS_DEV_CONFIRM=obkfgxjzlscungkhbyvq  exact target confirmation
#   a connection string whose host/user names exactly that ref (no other ref),
#   uses the approved host/port/database and the tenant-correct pooler username
# PGSSLMODE is forced to require when the URL omits sslmode.
# PostgreSQL sessions used for the dump are forced read-only via PGOPTIONS.
#
# Self-test (proves dump -> checksum -> isolated restore without any hosted
# access; explicitly NOT a backup of the hosted database):
#   BOS_BACKUP_SELFTEST=1 bash supabase/tests/run_dev_backup.sh
# Guard-only (validates the authorisation/ref logic without connecting):
#   BOS_BACKUP_GUARD_ONLY=1 BOS_BACKUP_AUTHORIZED=backup-only ... bash ...
#
# Exit: 0 verified; 2 no URL; 3 wrong/unsafe target; 4 dump failed;
#       5 checksum mismatch; 6 restore/verification failed.
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
DEV_REF="$BOS_APPROVED_REF"

DATABASE_URL="${BOS_BACKUP_DATABASE_URL:-${BOS_DEV_DATABASE_URL:-}}"
KEYCHAIN_SERVICE="${BOS_BACKUP_KEYCHAIN_SERVICE:-bos-production-backup}"
BACKUP_ROOT="${BOS_BACKUP_ROOT:-$HOME/BookOurSpace_Backups/react}"
GPG_RECIPIENT="${BOS_BACKUP_GPG_RECIPIENT:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'
}

# -----------------------------------------------------------------------------
# Dump, checksum, restore into a throwaway cluster, compare counts.
# run_backup <database_url> <target_dir> <label>
# -----------------------------------------------------------------------------
run_backup() {
  local url="$1" dir="$2" label="$3"
  local restore_root restore_port restore_data
  [ -n "${BOS_LIBPQ_DSN:-}" ] && url="$BOS_LIBPQ_DSN"
  mkdir -p "$dir" && chmod 700 "$dir" || return 4

  echo "=== 1. dump ($label, password never printed) ==="
  if ! PGOPTIONS="-c default_transaction_read_only=on" pg_dump "$url" --format=custom --no-owner --no-acl \
        --file "$dir/backup.dump" 2>"$dir/dump.err"; then
    echo "FAILED: pg_dump did not complete; see $dir/dump.err" >&2
    return 4
  fi
  if ! PGOPTIONS="-c default_transaction_read_only=on" pg_dump "$url" --schema-only --no-owner --no-acl \
      --file "$dir/schema.sql" 2>>"$dir/dump.err"; then
    echo "FAILED: schema-only dump did not complete." >&2
    rm -f -- "$dir/backup.dump"
    return 4
  fi
  if ! pg_restore --list "$dir/backup.dump" > "$dir/toc.txt" 2>/dev/null; then
    echo "FAILED: custom-format dump could not be inspected." >&2
    rm -f -- "$dir/backup.dump"
    return 4
  fi
  if ! grep -qE 'TABLE DATA auth users([[:space:]]|$)' "$dir/toc.txt" \
     || ! grep -qE 'TABLE DATA auth identities([[:space:]]|$)' "$dir/toc.txt"; then
    echo "FAILED: backup must contain both auth.users and auth.identities data." >&2
    return 4
  fi

  echo "=== 2. checksums ==="
  ( cd "$dir" && shasum -a 256 backup.dump schema.sql toc.txt > SHA256SUMS ) || return 5
  if ! ( cd "$dir" && shasum -a 256 -c SHA256SUMS >/dev/null 2>&1 ); then
    echo "FAILED: checksum verification did not match." >&2
    return 5
  fi

  echo "=== 3. isolated restore into a disposable local cluster ==="
  restore_root="$(mktemp -d "${TMPDIR:-/tmp}/bos-restore.XXXXXX")" || return 6
  restore_data="$restore_root/pgdata"
  restore_port="$(free_port)"
  cleanup_restore() {
    pg_ctl -D "$restore_data" -m fast -w stop >/dev/null 2>&1 || true
    rm -rf "$restore_root"
  }
  trap cleanup_restore RETURN

  initdb -D "$restore_data" -U postgres --auth=trust > "$restore_root/initdb.log" 2>&1 || { echo "FAILED: initdb" >&2; return 6; }
  pg_ctl -D "$restore_data" -o "-p $restore_port -k /tmp -c listen_addresses=127.0.0.1" -l "$restore_root/pg.log" start >/dev/null 2>&1 \
    || { echo "FAILED: throwaway cluster start" >&2; return 6; }
  local i
  for i in $(seq 1 60); do
    PGSSLMODE=disable psql -h 127.0.0.1 -p "$restore_port" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
    sleep 0.5
  done
  PGSSLMODE=disable psql -h 127.0.0.1 -p "$restore_port" -U postgres -q -c 'create database bos_restore' \
    || { echo "FAILED: create restore database" >&2; return 6; }
  if ! PGSSLMODE=disable psql -h 127.0.0.1 -p "$restore_port" -U postgres -d bos_restore -q -v ON_ERROR_STOP=1 <<'SQL'
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

  if ! PGSSLMODE=disable pg_restore --no-owner --no-acl --exit-on-error \
        -d "postgres://postgres@127.0.0.1:$restore_port/bos_restore" \
        "$dir/backup.dump" > "$restore_root/restore.log" 2>&1; then
    echo "FAILED: pg_restore --exit-on-error; last lines:" >&2
    tail -5 "$restore_root/restore.log" >&2
    return 6
  fi

  local rq=(env PGSSLMODE=disable psql -h 127.0.0.1 -p "$restore_port" -U postgres -d bos_restore -tAc)
  local r_tables r_rls r_policies r_rows r_auth_users r_auth_identities r_profiles
  local r_storage_tables r_storage_buckets r_storage_objects
  r_tables="$("${rq[@]}" "select count(*) from pg_tables where schemaname='public'")"
  r_rls="$("${rq[@]}" "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity")"
  r_policies="$("${rq[@]}" "select count(*) from pg_policies where schemaname='public'")"
  r_rows="$("${rq[@]}" "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables")"
  # Auth preservation: Google sign-in lives in auth.users/auth.identities and the
  # public.profiles mirror. Counted on the restored copy, never printed per row.
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

  # Source-side counts when the credential can read the catalog (read-only).
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

  # Dump scope: auth/storage are metadata only; object bytes live outside PostgreSQL.
  local auth_tables storage_tables migrations_table
  auth_tables="$(grep -cE 'TABLE (DATA )?auth[[:space:]]' "$dir/toc.txt" 2>/dev/null || true)"
  storage_tables="$(grep -cE 'TABLE (DATA )?storage[[:space:]]' "$dir/toc.txt" 2>/dev/null || true)"
  migrations_table="$(grep -cE 'TABLE (DATA )?supabase_migrations[[:space:]]' "$dir/toc.txt" 2>/dev/null || true)"

  {
    echo "target=$label"
    echo "dump_scope=all schemas readable by the backup role (public, auth, storage metadata, supabase_migrations)"
    echo "auth_tables_in_dump=${auth_tables:-0}"
    echo "storage_metadata_tables_in_dump=${storage_tables:-0}"
    echo "supabase_migrations_tables_in_dump=${migrations_table:-0}"
    echo "storage_binary_objects=EXCLUDED (object bytes live in Supabase Storage, not in PostgreSQL)"
    echo "source_public_tables=${s_tables:-unavailable}"
    echo "source_rls_tables=${s_rls:-unavailable}"
    echo "source_policies=${s_policies:-unavailable}"
    echo "source_auth_users=$s_auth_users"
    echo "source_auth_identities=$s_auth_identities"
    echo "source_storage_tables=${s_storage_tables:-unavailable}"
    echo "source_storage_buckets=${s_storage_buckets:-unavailable}"
    echo "source_storage_objects=${s_storage_objects:-unavailable}"
    echo "restored_public_tables=$r_tables"
    echo "restored_rls_tables=$r_rls"
    echo "restored_policies=$r_policies"
    echo "restored_approx_rows=$r_rows"
    echo "restored_auth_users=$r_auth_users"
    echo "restored_auth_identities=$r_auth_identities"
    echo "restored_storage_tables=$r_storage_tables"
    echo "restored_storage_buckets=$r_storage_buckets"
    echo "restored_storage_objects=$r_storage_objects"
    echo "restored_public_profiles=$r_profiles"
    echo "backup_dir=$dir"
  } | tee "$dir/restore-verification.txt"

  if ! [[ "${s_tables:-}" =~ ^[0-9]+$ ]] || ! [[ "${r_tables:-}" =~ ^[0-9]+$ ]] \
     || [ "$s_tables" != "$r_tables" ]; then
    echo "FAILED: restored public table count $r_tables != source $s_tables." >&2
    return 6
  fi
  if [ -n "${s_policies:-}" ] && [ "$s_policies" != "$r_policies" ]; then
    echo "FAILED: restored policy count $r_policies != source $s_policies" >&2
    return 6
  fi
  if ! [[ "${s_rls:-}" =~ ^[0-9]+$ ]] || [ "$s_rls" != "$r_rls" ]; then
    echo "FAILED: restored RLS relation count $r_rls != source $s_rls" >&2
    return 6
  fi
  # When the dump carried auth tables, the restored copy must still carry the
  # users/identities rows; an empty auth schema means sign-in data was lost.
  if [ "${auth_tables:-0}" -gt 0 ]; then
    if [ "$r_auth_users" = "absent" ] || [ "${r_auth_users:-0}" -lt 1 ]; then
      echo "FAILED: auth.users did not survive the restore (auth data loss)." >&2
      return 6
    fi
  fi
  if [ "$s_auth_users" = absent ] || [ "$s_auth_identities" = absent ] \
     || [ "$r_auth_users" = absent ] || [ "$r_auth_identities" = absent ] \
     || ! [[ "$s_auth_users" =~ ^[0-9]+$ ]] || ! [[ "$s_auth_identities" =~ ^[0-9]+$ ]] \
     || ! [[ "$r_auth_users" =~ ^[0-9]+$ ]] || ! [[ "$r_auth_identities" =~ ^[0-9]+$ ]] \
     || [ "$s_auth_users" -lt 1 ] || [ "$s_auth_identities" -lt 1 ] \
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

  if [ -n "$GPG_RECIPIENT" ]; then
    echo "=== 4. encrypting dump with the owner key ==="
    # Key custody: the keyring must sit outside the archive and the repository.
    bos_crypto_assert_separation "$dir"
    bos_assert_keyring_separate "$(bos_crypto_keyring)" "$BACKUP_ROOT"
    local plain_sha
    plain_sha="$(shasum -a 256 "$dir/backup.dump" | cut -d' ' -f1)"
    bos_crypto_encrypt "$dir/backup.dump" "$dir/backup.dump.gpg"
    bos_crypto_verify "$dir/backup.dump.gpg"
    bos_crypto_roundtrip "$dir/backup.dump.gpg" "$plain_sha"
    { echo "encryption=openpgp"
      echo "recipient_fingerprint=$(bos_crypto_fingerprint)"
      echo "dump_plaintext_sha256=$plain_sha"
      echo "keyring=$(bos_crypto_keyring) (outside the archive and the repository)"
    } > "$dir/encryption.txt"
    chmod 600 "$dir/encryption.txt"
    rm -f "$dir/backup.dump"
    ( cd "$dir" && shasum -a 256 backup.dump.gpg schema.sql toc.txt encryption.txt \
        restore-verification.txt identity-preflight.txt > SHA256SUMS ) || return 5
    ( cd "$dir" && shasum -a 256 -c SHA256SUMS >/dev/null 2>&1 ) || return 5
    echo "    plaintext removed and verified removable; encrypted artefact: $dir/backup.dump.gpg"
  fi
  return 0
}

# -----------------------------------------------------------------------------
# Self-test: proves the whole pipeline on a disposable database.
# -----------------------------------------------------------------------------
if [ "${BOS_BACKUP_SELFTEST:-}" = "1" ]; then
  ROOT="$(mktemp -d "${TMPDIR:-/tmp}/bos-backup-selftest.XXXXXX")" || exit 1
  DATA="$ROOT/pgdata"; PORT="$(free_port)"; OUT="$ROOT/out"
  cleanup_self() { pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$ROOT"; }
  trap cleanup_self EXIT
  echo "=== SELF-TEST (disposable local database; NOT a hosted backup) ==="
  initdb -D "$DATA" -U postgres --auth=trust > "$ROOT/initdb.log" 2>&1 || { echo "SELF-TEST FAILED: initdb"; exit 1; }
  pg_ctl -D "$DATA" -o "-p $PORT -k $ROOT -c listen_addresses=127.0.0.1" -l "$ROOT/pg.log" start >/dev/null 2>&1 \
    || { echo "SELF-TEST FAILED: start"; exit 1; }
  for _ in $(seq 1 60); do psql -h 127.0.0.1 -p "$PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break; sleep 0.5; done
  mkdir -m 700 -p "$OUT"
  SELFTEST_IDENTITY="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -tAc \
    "select current_database() || ' | user=' || current_user || ' | server=' || current_setting('server_version')")"
  printf 'identity=%s\nsession_read_only=on (PGOPTIONS default_transaction_read_only)\nproject_ref=%s\n' \
    "$SELFTEST_IDENTITY" "$DEV_REF" > "$OUT/identity-preflight.txt"
  chmod 600 "$OUT/identity-preflight.txt"
  psql -h 127.0.0.1 -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1 <<'SQL' || { echo "SELF-TEST FAILED: fixture"; exit 1; }
create database bos_selftest;
\connect bos_selftest
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
  if ! run_backup "postgres://postgres@127.0.0.1:$PORT/bos_selftest" "$OUT" "selftest"; then
    echo "SELF-TEST FAILED: pipeline returned an error"; exit 1
  fi
  if [ -n "$GPG_RECIPIENT" ] && ! bash "$REPO_ROOT/supabase/tests/verify_backup_archive.sh" "$OUT" "$DEV_REF" --require-encryption; then
    echo "SELF-TEST FAILED: encrypted archive verifier rejected the dev backup"; exit 1
  fi
  FIRST_INSTALL_OUT="$ROOT/first-install-out"
  mkdir -m 700 -p "$FIRST_INSTALL_OUT"
  FIRST_INSTALL_IDENTITY="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -tAc \
    "select current_database() || ' | user=' || current_user || ' | server=' || current_setting('server_version')")"
  printf 'identity=%s\nsession_read_only=on (PGOPTIONS default_transaction_read_only)\nproject_ref=%s\n' \
    "$FIRST_INSTALL_IDENTITY" "$DEV_REF" > "$FIRST_INSTALL_OUT/identity-preflight.txt"
  chmod 600 "$FIRST_INSTALL_OUT/identity-preflight.txt"
  if ! run_backup "postgres://postgres@127.0.0.1:$PORT/bos_first_install" "$FIRST_INSTALL_OUT" "first-install-empty-public-schema"; then
    echo "SELF-TEST FAILED: first-install backup pipeline returned an error"; exit 1
  fi
  if [ -n "$GPG_RECIPIENT" ] && ! bash "$REPO_ROOT/supabase/tests/verify_backup_archive.sh" "$FIRST_INSTALL_OUT" "$DEV_REF" --require-encryption; then
    echo "SELF-TEST FAILED: first-install archive verifier rejected the dev backup"; exit 1
  fi
  CHECK="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d bos_selftest -tAc 'select count(*) from public.selftest_bookings')"
  RESTORED_TABLES="$(grep '^restored_public_tables=' "$OUT/restore-verification.txt" | cut -d= -f2)"
  if [ "$RESTORED_TABLES" = "1" ] && [ "$CHECK" = "2" ]; then
    echo "SELF-TEST PASS: dump, SHA-256 verification and isolated restore reproduced the schema"
    echo "SELF-TEST PASS: first-install zero-public-table backup preserved Auth user and Google identity"
    echo "NOTE: this validates the backup tooling only; it is not a backup of $DEV_REF."
    exit 0
  fi
  echo "SELF-TEST FAILED: restored tables=$RESTORED_TABLES expected=1" >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# Guarded real run.
# -----------------------------------------------------------------------------
# Approval, exact-ref confirmation and connection shape are all enforced by the
# shared guard: stale/legacy refs, mismatched hosts, wrong pooler username,
# transaction-mode port, wrong database and sslmode=disable are all refused.
bos_require_approval
bos_require_ref_confirmation "${BOS_DEV_CONFIRM:-}"
if [ -z "$DATABASE_URL" ] && command -v security >/dev/null 2>&1; then
  DATABASE_URL="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || true)"
fi
if [ -z "$DATABASE_URL" ]; then
  echo "BLOCKED: no database URL was supplied and the configured Keychain item was unavailable. No hosted backup was attempted." >&2
  exit 2
fi
bos_assert_connection "$DATABASE_URL"
bos_prepare_libpq_auth "$DATABASE_URL"
unset DATABASE_URL BOS_BACKUP_DATABASE_URL BOS_DEV_DATABASE_URL
export PGSSLMODE="${PGSSLMODE:-$BOS_SSLMODE}"

if [ "${BOS_BACKUP_GUARD_ONLY:-}" = "1" ]; then
  echo "GUARDS PASS: Keychain/environment credential loaded in memory, backup-only approval and exact ref verified, no connection attempted."
  exit 0
fi

if [ -z "$GPG_RECIPIENT" ]; then
  echo "REFUSED: encrypted OpenPGP backup is required for the approved React project; configure BOS_BACKUP_GPG_RECIPIENT and its external owner keyring." >&2
  exit 5
fi
bos_crypto_require_recipient

TARGET_DIR="$BACKUP_ROOT/$DEV_REF-$STAMP"
mkdir -p "$TARGET_DIR" && chmod 700 "$TARGET_DIR" || exit 4
# A failed encryption/restore/verifier step must never leave a hosted plaintext
# dump behind. This trap is installed only after the guarded real-run gates.
trap 'if [ -n "${TARGET_DIR:-}" ]; then rm -f -- "$TARGET_DIR/backup.dump"; fi' EXIT

# Identity preflight: prove the connection is usable read-only before dumping.
# Errors are suppressed so a malformed URL can never echo credentials.
echo "=== 0. identity / read-only preflight ==="
if ! IDENTITY_ROW="$(PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -tAc "select current_database() || ' | user=' || current_user || ' | server=' || current_setting('server_version')" 2>/dev/null)"; then
  echo "FAILED: cannot verify database identity or read-only permission; no dump was taken." >&2
  exit 3
fi
if [ -z "$IDENTITY_ROW" ]; then
  echo "FAILED: identity preflight returned no row; no dump was taken." >&2
  exit 3
fi
echo "identity: $IDENTITY_ROW"
printf 'identity=%s\nsession_read_only=on (PGOPTIONS default_transaction_read_only)\nproject_ref=%s\n' "$IDENTITY_ROW" "$DEV_REF" > "$TARGET_DIR/identity-preflight.txt"

if ! run_backup "$BOS_LIBPQ_DSN" "$TARGET_DIR" "$DEV_REF"; then
  echo "BACKUP FAILED for $DEV_REF; nothing was declared PASS. See $TARGET_DIR" >&2
  exit 6
fi
if ! bash "$REPO_ROOT/supabase/tests/verify_backup_archive.sh" "$TARGET_DIR" "$DEV_REF" --require-encryption; then
  echo "ARCHIVE VERIFICATION FAILED for $DEV_REF; the archive is encrypted and Auth-verified but failed independent audit." >&2
  exit 6
fi

echo "=== verdict ==="
echo "PASS dump + SHA-256 + isolated restore verified for $DEV_REF"
echo "backup: $TARGET_DIR (mode 700, outside the repository)"
echo "NOTE: this is a hosted logical backup; the disposable local database only proves restorability."

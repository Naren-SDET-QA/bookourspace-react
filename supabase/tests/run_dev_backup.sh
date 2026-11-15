#!/usr/bin/env bash
# =============================================================================
# BookOurSpace — React production Supabase backup + verification
#
# Target: ezrxykyocgbolpaebnqx (the React/Vite project only; the Flutter
# database is out of scope). This script never connects to any other project.
#
# Defaults: ~/BookOurSpace_Backups/react/<ref>-<UTC>/, mode 700, umask 077.
# Optional: BOS_BACKUP_GPG_RECIPIENT=<key id> encrypts the dump with GPG and
#           removes the plaintext copy (encrypted OR access-restricted is
#           satisfied by the 700 directory alone; GPG is defence in depth).
#
# Real run (only when a read-only PostgreSQL credential exists):
#   BOS_BACKUP_DATABASE_URL='postgres://readonly@.../postgres' \
#   BOS_DEV_CONFIRM=ezrxykyocgbolpaebnqx \
#     bash supabase/tests/run_dev_backup.sh
#
# The real run additionally requires ALL of:
#   BOS_BACKUP_AUTHORIZED=backup-only   explicit backup-only authorisation
#   BOS_DEV_CONFIRM=ezrxykyocgbolpaebnqx  exact target confirmation
#   a connection string whose host/user names exactly that ref (no other ref)
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

DEV_REF=ezrxykyocgbolpaebnqx
DATABASE_URL="${BOS_BACKUP_DATABASE_URL:-${BOS_DEV_DATABASE_URL:-}}"
KEYCHAIN_SERVICE="${BOS_BACKUP_KEYCHAIN_SERVICE:-bos-production-backup}"
if [ -z "$DATABASE_URL" ] && command -v security >/dev/null 2>&1; then
  DATABASE_URL="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || true)"
  if [ -n "$DATABASE_URL" ]; then
    echo "credential: loaded from macOS Keychain service '$KEYCHAIN_SERVICE' (value never displayed)."
  fi
fi
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
  mkdir -p "$dir" && chmod 700 "$dir" || return 4

  echo "=== 1. dump ($label, password never printed) ==="
  if ! PGOPTIONS="-c default_transaction_read_only=on" pg_dump "$url" --format=custom --no-owner --no-acl \
        --file "$dir/backup.dump" 2>"$dir/dump.err"; then
    echo "FAILED: pg_dump did not complete; see $dir/dump.err" >&2
    return 4
  fi
  PGOPTIONS="-c default_transaction_read_only=on" pg_dump "$url" --schema-only --no-owner --no-acl \
    --file "$dir/schema.sql" 2>>"$dir/dump.err" || true
  pg_restore --list "$dir/backup.dump" > "$dir/toc.txt" 2>/dev/null || true

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
    psql -h 127.0.0.1 -p "$restore_port" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
    sleep 0.5
  done
  psql -h 127.0.0.1 -p "$restore_port" -U postgres -q -c 'create database bos_restore' \
    || { echo "FAILED: create restore database" >&2; return 6; }

  if ! pg_restore --no-owner --no-acl --exit-on-error \
        -d "postgres://postgres@127.0.0.1:$restore_port/bos_restore" \
        "$dir/backup.dump" > "$restore_root/restore.log" 2>&1; then
    echo "FAILED: pg_restore --exit-on-error; last lines:" >&2
    tail -5 "$restore_root/restore.log" >&2
    return 6
  fi

  local rq=(psql -h 127.0.0.1 -p "$restore_port" -U postgres -d bos_restore -tAc)
  local r_tables r_rls r_policies r_rows
  r_tables="$("${rq[@]}" "select count(*) from pg_tables where schemaname='public'")"
  r_rls="$("${rq[@]}" "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity")"
  r_policies="$("${rq[@]}" "select count(*) from pg_policies where schemaname='public'")"
  r_rows="$("${rq[@]}" "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables")"

  # Source-side counts when the credential can read the catalog (read-only).
  local s_tables s_rls s_policies
  s_tables="$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select count(*) from pg_tables where schemaname='public'" 2>/dev/null | tr -d ' ')"
  s_rls="$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity" 2>/dev/null | tr -d ' ')"
  s_policies="$(PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -tAc "select count(*) from pg_policies where schemaname='public'" 2>/dev/null | tr -d ' ')"

  # Dump scope: auth/storage are metadata only; object bytes live outside PostgreSQL.
  local auth_tables storage_tables migrations_table
  auth_tables="$(grep -cE 'TABLE (DATA )?auth\.' "$dir/toc.txt" 2>/dev/null || true)"
  storage_tables="$(grep -cE 'TABLE (DATA )?storage\.' "$dir/toc.txt" 2>/dev/null || true)"
  migrations_table="$(grep -cE 'TABLE (DATA )?supabase_migrations\.' "$dir/toc.txt" 2>/dev/null || true)"

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
    echo "restored_public_tables=$r_tables"
    echo "restored_rls_tables=$r_rls"
    echo "restored_policies=$r_policies"
    echo "restored_approx_rows=$r_rows"
    echo "backup_dir=$dir"
  } | tee "$dir/restore-verification.txt"

  if [ "${r_tables:-0}" -lt 1 ]; then
    echo "FAILED: restored database has no public tables; the dump is not usable." >&2
    return 6
  fi
  if [ -n "${s_tables:-}" ] && [ "$s_tables" != "$r_tables" ]; then
    echo "FAILED: restored table count $r_tables != source $s_tables" >&2
    return 6
  fi
  if [ -n "${s_policies:-}" ] && [ "$s_policies" != "$r_policies" ]; then
    echo "FAILED: restored policy count $r_policies != source $s_policies" >&2
    return 6
  fi

  if [ -n "$GPG_RECIPIENT" ]; then
    echo "=== 4. encrypting dump with GPG ($GPG_RECIPIENT) ==="
    if ! gpg --batch --yes --trust-model always --recipient "$GPG_RECIPIENT" \
          --output "$dir/backup.dump.gpg" --encrypt "$dir/backup.dump"; then
      echo "FAILED: GPG encryption failed; plaintext dump retained." >&2
      return 5
    fi
    rm -f "$dir/backup.dump"
    ( cd "$dir" && shasum -a 256 backup.dump.gpg schema.sql toc.txt > SHA256SUMS )
    ( cd "$dir" && shasum -a 256 -c SHA256SUMS >/dev/null 2>&1 ) || return 5
    echo "    plaintext removed; encrypted artefact: $dir/backup.dump.gpg"
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
  psql -h 127.0.0.1 -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1 <<'SQL' || { echo "SELF-TEST FAILED: fixture"; exit 1; }
create database bos_selftest;
\connect bos_selftest
create table public.selftest_bookings (id int primary key, amount numeric not null);
insert into public.selftest_bookings values (1, 100), (2, 250);
alter table public.selftest_bookings enable row level security;
create policy selftest_read on public.selftest_bookings for select using (true);
SQL
  if ! run_backup "postgres://postgres@127.0.0.1:$PORT/bos_selftest" "$OUT" "selftest"; then
    echo "SELF-TEST FAILED: pipeline returned an error"; exit 1
  fi
  CHECK="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d bos_selftest -tAc 'select count(*) from public.selftest_bookings')"
  RESTORED_TABLES="$(grep '^restored_public_tables=' "$OUT/restore-verification.txt" | cut -d= -f2)"
  if [ "$RESTORED_TABLES" = "1" ] && [ "$CHECK" = "2" ]; then
    echo "SELF-TEST PASS: dump, SHA-256 verification and isolated restore reproduced the schema"
    echo "NOTE: this validates the backup tooling only; it is not a backup of $DEV_REF."
    exit 0
  fi
  echo "SELF-TEST FAILED: restored tables=$RESTORED_TABLES expected=1" >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# Guarded real run.
# -----------------------------------------------------------------------------
if [ -z "$DATABASE_URL" ]; then
  echo "BLOCKED: BOS_BACKUP_DATABASE_URL is not set. No hosted backup was attempted." >&2
  exit 2
fi
if [ "${BOS_BACKUP_AUTHORIZED:-}" != "backup-only" ]; then
  echo "BLOCKED: production backup requires explicit authorisation." >&2
  echo "         set BOS_BACKUP_AUTHORIZED=backup-only (backup only; no writes, no migrations)." >&2
  exit 3
fi
if [ "${BOS_DEV_CONFIRM:-}" != "$DEV_REF" ]; then
  echo "BLOCKED: set BOS_DEV_CONFIRM=$DEV_REF to confirm the React production target." >&2
  exit 3
fi
case "$DATABASE_URL" in
  *prod*|*PROD*) echo "REFUSED: the connection string looks like a production target." >&2; exit 3 ;;
esac

# Exact project-reference verification: the host (direct connection) or the
# username (pooler connection) must contain this ref and no other ref.
HOSTPART="$(printf '%s' "$DATABASE_URL" | sed -E 's|^[a-zA-Z0-9+.-]+://([^@/]*@)?([^/:?]+).*|\2|')"
USERPART="$(printf '%s' "$DATABASE_URL" | sed -E 's|^[a-zA-Z0-9+.-]+://([^@/]*)@.*|\1|' | sed -E 's|:.*$||')"
REFS="$(printf '%s %s' "$HOSTPART" "$USERPART" | grep -oE '[a-z]{20}' | sort -u | tr '\n' ' ' | sed -E 's/ +$//')"
if [ "$REFS" != "$DEV_REF" ]; then
  echo "REFUSED: connection host/user must name exactly $DEV_REF (found: ${REFS:-none})." >&2
  exit 3
fi

if [ "${BOS_BACKUP_GUARD_ONLY:-}" = "1" ]; then
  echo "GUARDS PASS: backup-only authorised, exact ref verified, read-only dump enforced, no connection attempted."
  exit 0
fi

TARGET_DIR="$BACKUP_ROOT/$DEV_REF-$STAMP"
mkdir -p "$TARGET_DIR" && chmod 700 "$TARGET_DIR" || exit 4

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

if ! run_backup "$DATABASE_URL" "$TARGET_DIR" "$DEV_REF"; then
  echo "BACKUP FAILED for $DEV_REF; nothing was declared PASS. See $TARGET_DIR" >&2
  exit 6
fi

echo "=== verdict ==="
echo "PASS dump + SHA-256 + isolated restore verified for $DEV_REF"
echo "backup: $TARGET_DIR (mode 700, outside the repository)"
echo "NOTE: this is a hosted logical backup; the disposable local database only proves restorability."

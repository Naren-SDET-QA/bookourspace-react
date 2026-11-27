#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

fail() { printf 'FAIL %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS %s\n' "$1"; }

# Parse complete migration statements. REVOKE is not treated as cancelling a
# GRANT: any client GRANT remains contradictory source-level evidence.
client_grants_for_table() {
  local table="$1"; shift
  perl -0777 - "$table" "$@" <<'PERL'
use strict; use warnings;
my $target = lc $ARGV[0]; $target =~ s/^"|"$//g; shift @ARGV;
my $id = qr/(?:"(?:[^"]|"")+"|[a-z_][a-z0-9_\$]*)/i;
for my $file (@ARGV) {
  open my $fh, '<', $file or die "$file: $!"; local $/; my $sql = <$fh>;
  $sql =~ s/--[^\n]*//g; $sql =~ s{/\*.*?\*/}{}gs;
  for my $statement (split /;/, $sql) {
    $statement =~ s/\s+/ /g; $statement =~ s/^\s+|\s+$//g;
    next unless $statement =~ /^grant\s+/i;
    next unless $statement =~ /^grant\s+(?:all(?:\s+privileges)?|[a-z][a-z ]*(?:\s*,\s*[a-z][a-z ]*)*)\s+on\s+(?:table\s+)?(?:$id\s*\.\s*)?($id)\s+to\s+(.+?)\s*(?:with\s+grant\s+option)?$/i;
    my ($object, $grantees) = ($1, $2); $object =~ s/^"|"$//g;
    next unless lc($object) eq $target;
    for my $grantee (split /\s*,\s*/, $grantees) {
      $grantee =~ s/^\s+|\s+$//g; $grantee =~ s/^"|"$//g;
      if (lc($grantee) eq 'public' || lc($grantee) eq 'anon' || lc($grantee) eq 'authenticated') {
        print "$file: $statement\n"; last;
      }
    }
  }
}
PERL
}

assert_no_client_grant() {
  local table="$1"; shift; local hits
  hits="$(client_grants_for_table "$table" "$@")"
  test -z "$hits" || fail "$table has client GRANT(s): $hits"
}

assert_client_grant_detected() {
  local table="$1"; shift; local hits
  hits="$(client_grants_for_table "$table" "$@")"
  test -n "$hits" || fail "parser missed expected client GRANT for $table"
}

assert_backfill_review_owner_only_plan() {
  local source="supabase/migrations/20261112010000_business_ownership_phase1.sql"
  local candidate="supabase/migrations/20261127170000_business_backfill_review_server_only.sql"
  rg -qi '^grant\s+select\s*,\s*insert\s+on\s+(table\s+)?public\.business_backfill_review\s+to\s+authenticated\s*;' "$source" \
    || fail "original business_backfill_review grant not found at expected source"
  rg -Uqi 'revoke\s+all\s+privileges\s+on\s+(table\s+)?public\.business_backfill_review\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;' "$candidate" \
    || fail "owner-only business_backfill_review migration proposal missing"
  [[ "$candidate" > "$source" ]] || fail "business_backfill_review revoke must follow the original grant"

  local grant_hits
  grant_hits="$(rg -n -i '^\s*grant\b.*\bbusiness_backfill_review\b' supabase/migrations || true)"
  test "$(printf '%s\n' "$grant_hits" | sed '/^$/d' | wc -l | tr -d ' ')" -eq 1 \
    || fail "unexpected re-grant of business_backfill_review privileges: $grant_hits"
}

self_test() {
  local tmp="$(mktemp -d "${TMPDIR:-/tmp}/bos-security-contract.XXXXXX")"
  trap "rm -rf '$tmp'" EXIT
  cat >"$tmp/unsafe.sql" <<'SQL'
GRANT
  SELECT, INSERT
ON TABLE "public"."quoted_table"
TO "authenticated", anon;
SQL
  cat >"$tmp/safe.sql" <<'SQL'
REVOKE ALL PRIVILEGES ON public.safe_table FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.safe_table TO service_role;
SQL
  assert_client_grant_detected quoted_table "$tmp/unsafe.sql"
  assert_no_client_grant safe_table "$tmp/safe.sql"
  pass "parser detects multiline quoted comma-separated client GRANT"
  pass "parser accepts server-only ALL PRIVILEGES grant after client REVOKE"
}

if [[ "${1:-}" == "--self-test" ]]; then self_test; exit 0; fi

contracts=(
  "account_closure_audit|supabase/migrations/20261105163924_profile_media_and_account_closure.sql"
  "india_locations|supabase/migrations/20261107183158_india_location_catalog_search.sql"
  "media_asset_publication_audit|supabase/migrations/20261105160000_media_published_listing_visibility.sql"
  "service_delivery_otps|supabase/migrations/20261111190000_universal_delivery_tracking.sql"
  "user_access_audit_events|supabase/migrations/20261104160000_super_admin_role_management.sql"
  "venue_payment_events|supabase/migrations/20261103173631_venue_booking_inventory.sql"
  "api_rate_limit_windows|supabase/migrations/20261108140000_distributed_api_rate_limits.sql"
)

for contract in "${contracts[@]}"; do
  table="${contract%%|*}"; file="${contract#*|}"
  test -f "$file" || fail "$table migration missing: $file"
  rg -qi "enable row level security" "$file" || fail "$table RLS enablement missing"
  [[ "$table" != api_rate_limit_windows ]] || rg -qi "force row level security" "$file" || fail "$table FORCE RLS missing"
  files=( $(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort) )
  assert_no_client_grant "$table" "${files[@]}"
done
assert_backfill_review_owner_only_plan
pass "seven no-policy tables have no client GRANT; business_backfill_review has an ordered owner-only migration proposal"

catalog=supabase/migrations/20261111200000_dynamic_service_category_builder.sql
for fn in service_catalog_is_medicine service_catalog_apply_hard_rules service_catalog_validate_config; do
  rg -q "revoke all on function public.${fn}" "$catalog" || fail "$fn client revoke missing"
done
module=supabase/migrations/20261112010000_business_ownership_phase1.sql
rg -q "create or replace function public.business_module_for_listing" "$module" || fail "business_module_for_listing missing"
if sed -n '/create or replace function public.business_module_for_listing/,/\$\$;/p' "$module" | rg -qi "security definer"; then
  fail "business_module_for_listing became SECURITY DEFINER"
fi
pass "local helper execution contracts are pinned"

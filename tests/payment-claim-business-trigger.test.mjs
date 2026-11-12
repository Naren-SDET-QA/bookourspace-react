import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const repair = read('supabase/migrations/20261113020000_payment_claim_business_trigger.sql');
const legacy = read('supabase/migrations/20261112280000_strict_record_business_assignment.sql');

function branchFor(tableName) {
  const marker = `elsif tg_table_name = '${tableName}' then`;
  const start = repair.indexOf(marker);
  assert.notEqual(start, -1, `${tableName} must have its own branch`);
  const rest = repair.slice(start + marker.length);
  const next = rest.search(/\n\s*elsif |\n  end if;/);
  return next === -1 ? rest : rest.slice(0, next);
}

test('the legacy shared branch is what caused the 42703', () => {
  assert.match(legacy, /tg_table_name in \('payment_intents','pg_invoices','pg_payment_claims'\)/);
  assert.match(legacy, /new\.listing_id/);
});

test('pg_payment_claims has its own branch that never reads listing_id', () => {
  const branch = branchFor('pg_payment_claims');
  assert.doesNotMatch(branch, /new\.listing_id/);
  assert.match(branch, /new\.booking_id::text/);
  assert.match(branch, /from public\.bookings/);
});

test('payment_intents and pg_invoices keep the listing fallback they support', () => {
  const marker = "elsif tg_table_name in ('payment_intents', 'pg_invoices') then";
  const start = repair.indexOf(marker);
  assert.notEqual(start, -1);
  const branch = repair.slice(start, repair.indexOf("elsif tg_table_name in ('service_payment_intents'", start));
  assert.match(branch, /new\.booking_id::text/);
  assert.match(branch, /new\.listing_id/);
});

test('the repaired function is rebuilt for every affected payment table', () => {
  for (const table of ['pg_payment_claims', 'payment_intents', 'pg_invoices']) {
    assert.match(
      repair,
      new RegExp(`create trigger trg_ensure_record_business before insert or update on public\\.${table}`),
      `${table} must keep its ensure_record_business trigger`,
    );
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20261113000000_customer_module_access.sql');

test('authenticated can read the access tables so RLS is the boundary', () => {
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.customer_module_access to authenticated;/,
  );
  assert.match(
    migration,
    /grant select on table public\.customer_module_access_audit to authenticated;/,
  );
});

test('customer write policies are still absent and admin management stays admin-only', () => {
  assert.doesNotMatch(migration, /create policy [^;]*customer_module_access[^;]*for insert to authenticated/i);
  assert.doesNotMatch(migration, /create policy [^;]*customer_module_access[^;]*for update to authenticated/i);
  assert.match(
    migration,
    /create policy "Admins manage customer module access"[\s\S]*?using \(public\.is_admin\(\)\)[\s\S]*?with check \(public\.is_admin\(\)\)/,
  );
  assert.match(
    migration,
    /create policy "Admins read module access audit"[\s\S]*?using \(public\.is_admin\(\)\)/,
  );
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildShowtimeFilters } from '../src/server/moviesShowtimesApi.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const MIGRATED = { approvalStatus: true, state: true };
const PENDING_MIGRATION = { approvalStatus: false, state: false };

test('before the approval migration, public filters never reference missing columns', () => {
  const { clauses, values } = buildShowtimeFilters(PENDING_MIGRATION, {
    includeHidden: false,
    state: 'Telangana',
    city: 'Hyderabad',
    area: 'Madhapur',
    pincode: '500081',
  });
  assert.equal(clauses.some((clause) => clause.includes('approval_status')), false);
  assert.equal(clauses.some((clause) => clause.startsWith('state =')), false);
  assert.equal(clauses.includes('is_visible is true'), true);
  assert.deepEqual(values, ['Hyderabad', '%Madhapur%', '500081']);
});

test('after the approval migration, the approval gate and state filter are applied', () => {
  const { clauses, values } = buildShowtimeFilters(MIGRATED, {
    includeHidden: false,
    state: 'Telangana',
    city: null,
    area: null,
    pincode: null,
  });
  assert.equal(clauses.includes("approval_status = 'approved'"), true);
  assert.equal(clauses.includes('state = $1'), true);
  assert.deepEqual(values, ['Telangana']);
});

test('includeHidden keeps hidden rows but never gates them on approval', () => {
  const { clauses } = buildShowtimeFilters(MIGRATED, { includeHidden: true, providerUserId: 'owner-1' });
  assert.equal(clauses.some((clause) => clause.includes('approval_status')), false);
  assert.equal(clauses.some((clause) => clause.includes('is_visible is true')), false);
  assert.equal(clauses.some((clause) => clause.includes('owner_id = $1::uuid')), true);
});

test('the migration grandfathers already-visible screens instead of hiding them', () => {
  const migration = read('supabase/migrations/20261112330000_movies_state_approval.sql');
  assert.match(migration, /case when is_visible then 'approved' else 'pending' end/);
  assert.doesNotMatch(migration, /approval_status='pending',\s*is_visible=false/);
  assert.match(migration, /approval_status in \('pending','approved','disabled'\)/);
});

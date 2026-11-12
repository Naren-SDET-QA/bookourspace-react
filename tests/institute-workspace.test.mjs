import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261111192224_institute_owner_workspace.sql'), 'utf8');
const repository = fs.readFileSync(path.join(root, 'src/server/instituteWorkspaceRepository.ts'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/server/instituteWorkspaceApi.ts'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/components/InstituteOwnerDashboard.tsx'), 'utf8');
const clientApi = fs.readFileSync(path.join(root, 'src/lib/instituteApi.ts'), 'utf8');

function test(name, callback) {
  try {
    callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

console.log('\ninstitute workspace');

test('migration creates the institute workspace data model', () => {
  for (const table of ['institutes', 'institute_branches', 'institute_members', 'institute_faculty', 'institute_admissions', 'institute_attendance_sessions', 'institute_attendance_records', 'institute_fee_ledger']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, 'i'));
  }
  assert.match(migration, /alter table public\.listings add column if not exists institute_id/i);
  assert.match(migration, /alter table public\.class_batches add column if not exists institute_id/i);
});

test('database authorization and financial verification are server-side', () => {
  assert.match(migration, /institute_can_access/);
  assert.match(migration, /public\.is_admin\(\)/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /institute_record_fee_payment/);
  assert.match(migration, /for update/i);
  assert.match(migration, /verified_by = auth\.uid\(\)/);
  assert.doesNotMatch(migration, /service_role/i);
});

test('repository uses verified sessions and real source rows', () => {
  assert.match(repository, /SET LOCAL ROLE authenticated/);
  assert.match(repository, /request\.jwt\.claim\.sub/);
  assert.match(repository, /class_batch_availability/);
  assert.match(repository, /institute_record_fee_payment/);
  assert.match(repository, /select .*from public\.enquiries/s);
  assert.match(repository, /select .*from public\.reviews/s);
});

test('API exposes CRUD and operational actions', () => {
  for (const route of ['/api/institute/workspace', '/api/institute/memberships', '/api/institute/:id/courses', '/api/institute/:id/batches', '/api/institute/:id/attendance', '/api/institute/fees/', '/api/institute/:id/admissions', '/api/institute/:id/enquiries']) {
    assert.match(api, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(clientApi, /buildAuthHeaders/);
});

test('UI covers institute operations without fabricated fallback metrics', () => {
  for (const section of ['Institute profile', 'Branches', 'Courses', 'Batches & timings', 'Faculty', 'Admissions', 'Enrolled students', 'Attendance', 'Fees & collection', 'Enquiries', 'Reviews', 'Analytics', 'Notifications', 'Reports', 'Settings']) {
    assert.match(ui, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(ui, /Not configured/);
  assert.match(ui, /Create institute profile/);
  assert.match(ui, /Faculty/);
  assert.match(ui, /Branch/);
  assert.match(ui, /sm:hidden/);
  assert.match(ui, /overflow-x-auto.*sm:block/);
});

test('every institute navigation destination has a render branch', () => {
  const ids = [...ui.matchAll(/\{ id: '([^']+)'/g)].map((match) => match[1]);
  for (const id of ids) {
    assert.match(ui, new RegExp(`section === '${id}'`), `missing render branch for ${id}`);
  }
  for (const label of ['Classes / courses', 'Faculty', 'Calendar & holidays', 'Admissions', 'Fees & collection', 'Certificates']) {
    assert.match(ui, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('provider workspace navigation is reachable at narrow widths', () => {
  const provider = fs.readFileSync(path.join(root, 'src/components/ProviderDashboard.tsx'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'src/components/ProviderPortalShell.tsx'), 'utf8');
  // The shared provider shell owns navigation at every width: a persistent
  // sidebar above the md breakpoint and a drawer below it. Modules must not add
  // a second selector or nested sidebar of their own.
  assert.match(provider, /<ProviderPortalShell/);
  assert.match(provider, /onNavigate=\{navigatePortalModule\}/);
  assert.match(shell, /aria-label="Open navigation"/);
  assert.match(shell, /aria-label="Provider portal navigation"/);
  assert.match(shell, /md:hidden/);
});

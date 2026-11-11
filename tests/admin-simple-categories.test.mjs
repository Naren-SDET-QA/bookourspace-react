import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/AdminDashboard.tsx', import.meta.url), 'utf8');

test('the simple Manage Categories studio is additive and keeps the advanced editor', () => {
  assert.match(source, /id: 'manage_categories', label: 'Manage Categories'/);
  assert.match(source, /contentSubTab === 'manage_categories'/);
  assert.match(source, /Simple catalog editor/);
  assert.match(source, /Advanced Editor/);
  assert.match(source, /setContentSubTab\('categories'\)/);
  assert.match(source, /handleSaveSimpleCategory/);
  assert.match(source, /handleToggleSimpleCategory/);
  // The original advanced category editor still exists with its controls.
  assert.match(source, /contentSubTab === 'categories'/);
  assert.match(source, /All Categories/);
  assert.match(source, /Dynamic Custom Fields/);
  assert.match(source, /handleAddSubcategory/);
  assert.match(source, /handleCreateCustomField/);
});

test('the simple studio uses the existing category mutations, not a parallel store', () => {
  assert.match(source, /updateCategory,/);
  assert.match(source, /updateCategory\(activeCategory\.id/);
  assert.match(source, /addSubcategoryToCategory/);
  assert.match(source, /deleteSubcategoryFromCategory/);
  assert.match(source, /setSubcategoryEnabled/);
});

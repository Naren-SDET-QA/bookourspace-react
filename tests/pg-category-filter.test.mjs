import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('PG cards respect the header category and subcategory selection', () => {
  const pg = source('src/components/PGSectionExperience.tsx');
  const app = source('src/App.tsx');
  assert.match(pg, /selectedCategory = 'all'/);
  assert.match(pg, /selectedSubcategory = 'all'/);
  assert.match(pg, /listing\.categoryId !== categoryId/);
  assert.match(pg, /haystack\.includes\(subcategory\)/);
  assert.match(app, /selectedCategory=\{selectedCategory\}/);
  assert.match(app, /selectedSubcategory=\{selectedSubcategory\}/);
});

test('Service Apartments has demo inventory so its filter is not empty', () => {
  const demo = source('src/data/demoPgListings.ts');
  assert.match(demo, /category: 'pg-service-apartments'/);
  assert.match(demo, /Hitech City Service Apartments/);
});

test('the generic demo card is hidden while a category filter is active', () => {
  const app = source('src/App.tsx');
  assert.match(app, /DEMO_DATA_ENABLED && demoCardSection && selectedCategory === 'all'/);
});

test('category checks persist and unchecking the selected category clears it', () => {
  const bar = source('src/components/CraftoTopServicesBar.tsx');
  assert.match(bar, /bos_category_checklist_v1/);
  assert.match(bar, /bos_category_checklist_touched_v1/);
  assert.match(bar, /JSON\.stringify\(checkedCategoriesBySection\)/);
  assert.match(bar, /checklistActive/);
  assert.match(bar, /exists && selectedCategory === catId/);
  assert.match(bar, /onSelectCategory\('all'\)/);
});

test('admin can switch the category bar between single and multiple lines', () => {
  const admin = source('src/components/AdminDashboard.tsx');
  const bar = source('src/components/CraftoTopServicesBar.tsx');
  const store = source('src/utils/adminEnterpriseStore.ts');
  assert.match(admin, /Category bar layout/);
  assert.match(admin, /\['single', 'Single line'\]/);
  assert.match(admin, /\['multi', 'Multiple lines'\]/);
  assert.match(store, /categoryBarLayout: 'single' \| 'multi'/);
  assert.match(store, /categoryBarLayout: 'single'/);
  assert.match(store, /bos-admin-content-settings-changed/);
  assert.match(bar, /categoryBarLayout === 'multi'/);
  assert.match(bar, /flex-nowrap overflow-x-auto/);
  assert.match(bar, /flex-wrap overflow-visible/);
});

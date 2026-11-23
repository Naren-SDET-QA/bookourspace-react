import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('PG and Classes no longer render the Style 1/2/3 switcher', () => {
  const pg = source('src/components/PGSectionExperience.tsx');
  const classes = source('src/components/ClassesTimingsExperience.tsx');
  assert.doesNotMatch(pg, /<SectionStyleTabs/);
  assert.doesNotMatch(classes, /<SectionStyleTabs/);
  assert.match(pg, /PG is locked to Style 3/);
  // Classes now ships Style 3 and Style 4 (Style 4 is the marketplace default);
  // the retired Style 1/2 switcher is still gone.
  assert.doesNotMatch(classes, /SectionStyleTabs/);
});

test('the public hash cannot re-enable PG or Classes Style 1/2', () => {
  const app = source('src/App.tsx');
  assert.match(app, /if \(section === 'pg'\) return \{ \.\.\.withServices, pg: 'style3' \}/);
  assert.match(app, /if \(style === 4\) return \{ \.\.\.withServices, classes: 'style4' \}/);
  assert.match(app, /if \(style === 3\) return \{ \.\.\.withServices, classes: 'style3' \}/);
  assert.match(app, /return \{ \.\.\.withServices, classes: 'style4' \};/);
  assert.match(app, /decision\.classesStyle === 'style4' \? 'style4' : 'style3'/);
});

test('the admin style panel locks PG and Classes and leaves other sections switchable', () => {
  const admin = source('src/components/AdminDashboard.tsx');
  assert.match(admin, /PG is locked to Style 3/);
  assert.match(admin, /Classes opens in Style 4/);
  assert.equal((admin.match(/Style 1 &amp; 2 disabled/g) || []).length, 2);
  assert.match(admin, /BookOurSpace Stay[\s\S]{0,500}\[['"]old['"], 'Style 1'\]/);
  assert.match(admin, /BookOurSpace Venues[\s\S]{0,500}Style 1 &amp; 3 disabled/);
});

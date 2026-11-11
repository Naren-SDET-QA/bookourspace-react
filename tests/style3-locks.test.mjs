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
  assert.match(classes, /Classes are locked to Style 3/);
});

test('the public hash cannot re-enable PG or Classes Style 1/2', () => {
  const app = source('src/App.tsx');
  assert.match(app, /if \(section === 'pg'\) return \{ \.\.\.base, pg: 'style3' \}/);
  assert.match(app, /if \(section === 'classes'\) return \{ \.\.\.base, classes: 'style3' \}/);
  assert.match(app, /\{ \.\.\.previous, classes: 'style3' \}/);
});

test('the admin style panel locks PG and Classes and leaves other sections switchable', () => {
  const admin = source('src/components/AdminDashboard.tsx');
  assert.match(admin, /PG and Classes are locked to Style 3/);
  assert.equal((admin.match(/Style 1 &amp; 2 disabled/g) || []).length, 2);
  assert.match(admin, /BookOurSpace Stay[\s\S]{0,500}\[['"]old['"], 'Style 1'\]/);
  assert.match(admin, /BookOurSpace Venues[\s\S]{0,500}Style 1 &amp; 3 disabled/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const app = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

test('a protected deep link is re-applied once the session and entry gate settle', () => {
  // The hash effect re-runs when the authoritative session resolves and it
  // classifies the hash through the shared router instead of the raw string.
  assert.match(app, /const decision = resolveSectionHashNavigation\(window\.location\.hash, appliedSectionHashRef\.current\);/);
  assert.match(app, /\}, \[isAdminSession, authUser, instituteAccessChecked, hasInstituteAccess/);
});

test('the retry keeps the router authority rules instead of trusting the hash', () => {
  // Admin only for a verified admin session.
  assert.match(app, /if \(!isAdminSession\) \{\s*setActiveView\('marketplace'\);\s*return;/);
  // Provider only for provider/admin, or a customer with institute access.
  assert.match(app, /!\['provider', 'admin'\]\.includes\(authUser\.role\)/);
  assert.match(app, /authUser\.role === 'customer' && instituteAccessChecked && hasInstituteAccess/);
  // The role/view may only be granted after the session is known.
  assert.match(app, /decision\.action === 'admin'\) \{[\s\S]{0,500}if \(!authUser\) return;/);
});

test('the retry only acts when the view does not already match', () => {
  // Signed-out visitors keep the deep link so it applies after hydrate, and no
  // branch grants a role as a side effect of the hash.
  assert.ok((app.match(/if \(!authUser\) return;/g) || []).length >= 2);
  assert.doesNotMatch(app, /setUserRole\('admin'\);\s*\n\s*window\.location\.hash/);
});

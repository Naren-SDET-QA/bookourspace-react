import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const app = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

test('a protected deep link is re-applied once the session and entry gate settle', () => {
  // The retry must wait for both signals, otherwise it repeats the very race it fixes.
  assert.match(app, /if \(!authoritativeSessionChecked \|\| entryExperience !== 'ready'\) return;/);
  assert.match(app, /const providerDeepLink = hash === 'provider' \|\| hash === 'provider_portal'/);
});

test('the retry keeps the router authority rules instead of trusting the hash', () => {
  // Admin only for a verified admin session.
  assert.match(app, /if \(isAdminSession && activeView !== 'admin_console'\) \{/);
  // Provider only for provider/admin, or a customer with institute access.
  assert.match(app, /const mayOpenProvider = Boolean\(authUser\) && \(/);
  assert.match(app, /authUser\?\.role === 'provider'/);
  assert.match(app, /authUser\?\.role === 'customer' && instituteAccessChecked && hasInstituteAccess/);
  // It may never set a role from the hash alone.
  assert.doesNotMatch(app, /setUserRole\('admin'\);(?:(?!authUser|isAdminSession)[\s\S]){0,120}window\.location\.hash/);
});

test('the retry only acts when the view does not already match', () => {
  assert.match(app, /if \(mayOpenProvider && activeView !== 'provider_portal'\) \{/);
});

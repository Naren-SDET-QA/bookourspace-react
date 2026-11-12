/**
 * Source-level guards for the email OTP login surface.
 *
 * These are deliberately string-level checks: the browser journey itself is
 * covered by the API contract test and Playwright, while these keep the
 * security-shaped UI rules from silently regressing during refactors.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('the login screen keeps the split welcome layout, the BOS logo and email OTP', async () => {
  const page = await read('src/components/SimpleLoginPage.tsx');
  assert.match(page, /Welcome Back/);
  assert.match(page, /BOSOfficialLogo/);
  assert.match(page, /What you can do with your BookOurSpace account/);
  assert.match(page, /requestEmailOtp/);
  assert.match(page, /requestSupabaseEmailOtp/, 'Supabase-native delivery fallback must remain available');
  assert.match(page, /completeEmailOtpSignIn/);
  assert.match(page, /OTP_LENGTH = 6/);
  assert.match(page, /inputMode="email"/);
  assert.match(page, /one-time-code/);
  assert.doesNotMatch(page, /type="tel"/, 'mobile OTP was replaced by email OTP');
  assert.doesNotMatch(page, /phone number/i, 'mobile OTP was replaced by email OTP');
});

test('guest browsing is only rendered when the administrator enabled it', async () => {
  const page = await read('src/components/SimpleLoginPage.tsx');
  assert.match(page, /const guestAvailable = config\?\.guestLoginEnabled === true/);
  assert.match(page, /guestAvailable && onContinueAsGuest/);

  const entry = await read('src/components/BookOurSpaceEntryExperience.tsx');
  assert.match(entry, /guestLoginEnabled = false/);
  assert.match(entry, /guestLoginEnabled && \(/);
  assert.match(entry, /entry-continue-guest/);
});

test('the app wires the public sign-in config into the entry and login surfaces', async () => {
  const app = await read('src/App.tsx');
  assert.match(app, /fetchAuthAccessConfig/);
  assert.match(app, /config={authAccessConfig}/);
  assert.match(app, /guestLoginEnabled={authAccessConfig\?\.guestLoginEnabled === true}/);
  assert.match(app, /onAuthSuccess|onSignedIn/);
});

test('the administrator sees a sign-in access section and can save switches', async () => {
  const admin = await read('src/components/AdminDashboard.tsx');
  assert.match(admin, /AdminAuthAccessSettings/);
  const component = await read('src/components/AdminAuthAccessSettings.tsx');
  assert.match(component, /Allow guest browsing/);
  assert.match(component, /Email one-time code sign-in/);
  assert.match(component, /Google sign-in/);
  assert.match(component, /fetchAdminAuthAccessSettings/);
  assert.match(component, /saveAdminAuthAccessSettings/);
});

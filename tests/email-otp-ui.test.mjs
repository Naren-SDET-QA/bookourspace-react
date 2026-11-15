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

test('the login screen keeps the BOS logo, the email OTP flow and the new hero heading', async () => {
  const page = await read('src/components/CustomerLoginExperience.tsx');
  assert.match(page, /Book Spaces for Every Occasion/);
  assert.match(page, /BOSOfficialLogo/);
  assert.match(page, /requestEmailOtp/);
  assert.match(page, /requestSupabaseEmailOtp/, 'Supabase-native delivery fallback must remain available');
  assert.match(page, /completeEmailOtpSignIn/);
  assert.match(page, /OTP_LENGTH = 6/);
  assert.match(page, /inputMode="email"/);
  assert.match(page, /one-time-code/);

  // Both the first-visit entry screen and #login render the same experience.
  const login = await read('src/components/SimpleLoginPage.tsx');
  assert.match(login, /CustomerLoginExperience/);
  const entry = await read('src/components/BookOurSpaceEntryExperience.tsx');
  assert.match(entry, /CustomerLoginExperience/);
});

test('the mobile tab is present but never fakes a completed sign-in', async () => {
  const page = await read('src/components/CustomerLoginExperience.tsx');
  assert.match(page, /Mobile OTP/);
  assert.match(page, /\+91/);
  assert.match(page, /inputMode="numeric"/);
  // The send action stays disabled and says so, because the server's verified
  // session exchange accepts only google and email identities.
  assert.match(page, /bos-mobile-otp-unavailable/);
  assert.match(page, /disabled\n\s+aria-describedby="bos-mobile-otp-unavailable"/);
  // No fabricated phone session: no phone OTP request, no session install.
  assert.doesNotMatch(page, /phone-otp|signInWithOtp\(\{\s*phone/);
  assert.doesNotMatch(page, /verifyOtp\(\{[^}]*type:\s*'sms'/);
});

test('guest browsing is only offered when the administrator enabled it', async () => {
  const page = await read('src/components/CustomerLoginExperience.tsx');
  assert.match(page, /const guestAvailable = guestLoginEnabled \|\| config\?\.guestLoginEnabled === true/);
  assert.match(page, /onGuest && \(guestAvailable \?/);
  assert.match(page, /Guest browsing is turned off by the administrator/);

  const entry = await read('src/components/BookOurSpaceEntryExperience.tsx');
  assert.match(entry, /guestLoginEnabled = false/);
});

test('the app wires the public sign-in config into the entry and login surfaces', async () => {
  const app = await read('src/App.tsx');
  assert.match(app, /fetchAuthAccessConfig/);
  assert.match(app, /config={authAccessConfig}/);
  assert.match(app, /guestLoginEnabled={authAccessConfig\?\.guestLoginEnabled === true}/);
  assert.match(app, /onAuthSuccess|onSignedIn/);
  // Entry-screen service shortcuts open a module as a guest; they never sign in.
  assert.match(app, /onSelectService=/);
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

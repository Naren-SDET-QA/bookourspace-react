import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { launchGoogleOAuthWindow } from '../src/lib/googleOAuthLauncher.ts';

test('an open OAuth window receives the authorize URL', () => {
  const navigated = [];
  const redirects = [];
  const outcome = launchGoogleOAuthWindow({
    window: { location: { replace: (url) => navigated.push(url) }, close: () => undefined },
    url: 'https://project.supabase.co/auth/v1/authorize?provider=google',
    redirect: (url) => redirects.push(url),
  });
  assert.equal(outcome, 'popup');
  assert.deepEqual(navigated, ['https://project.supabase.co/auth/v1/authorize?provider=google']);
  assert.deepEqual(redirects, []);
});

test('a blocked popup falls back to a full-page redirect with the same URL', () => {
  const redirects = [];
  const outcome = launchGoogleOAuthWindow({
    window: null,
    url: 'https://project.supabase.co/auth/v1/authorize?provider=google',
    redirect: (url) => redirects.push(url),
  });
  assert.equal(outcome, 'redirect');
  assert.deepEqual(redirects, ['https://project.supabase.co/auth/v1/authorize?provider=google']);
});

test('a window that cannot be navigated falls back to a redirect instead of dropping the sign-in', () => {
  const redirects = [];
  let closed = false;
  const outcome = launchGoogleOAuthWindow({
    window: {
      location: {
        replace: () => {
          throw new Error('The window was closed.');
        },
      },
      close: () => {
        closed = true;
      },
    },
    url: 'https://project.supabase.co/auth/v1/authorize?provider=google',
    redirect: (url) => redirects.push(url),
  });
  assert.equal(outcome, 'redirect');
  assert.equal(closed, true);
  assert.deepEqual(redirects, ['https://project.supabase.co/auth/v1/authorize?provider=google']);
});

test('an empty authorize URL never starts a navigation', () => {
  let redirected = false;
  const outcome = launchGoogleOAuthWindow({
    window: null,
    url: '   ',
    redirect: () => {
      redirected = true;
    },
  });
  assert.equal(outcome, 'redirect');
  assert.equal(redirected, false);
});

test('every Google entry point opens its window before it awaits the authorize URL', async () => {
  const [context, modal] = await Promise.all([
    readFile(new URL('../src/context/MarketplaceContext.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SupabaseAuthModal.tsx', import.meta.url), 'utf8'),
  ]);
  for (const source of [context, modal]) {
    const openIndex = source.indexOf("window.open(\n      'about:blank'");
    const awaitIndex = source.indexOf('await signInWithSupabaseGoogleOAuth');
    assert.ok(openIndex > 0, 'the OAuth window must be opened explicitly');
    assert.ok(awaitIndex > 0, 'the authorize URL must be requested');
    assert.ok(
      openIndex < awaitIndex,
      'the window must be opened before the authorize URL is awaited, otherwise the browser blocks it'
    );
    assert.match(source, /launchGoogleOAuthWindow\(/);
  }
});

test('the browser role switcher cannot grant an elevated role without a server verified identity', async () => {
  const [context, navbar] = await Promise.all([
    readFile(new URL('../src/context/MarketplaceContext.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8'),
  ]);
  const roleGuard = context.slice(
    context.indexOf('const setUserRole = (role: UserRole)'),
    context.indexOf('const [supabaseUser,')
  );
  assert.match(roleGuard, /authUser\?\.role === role/);
  assert.doesNotMatch(roleGuard, /setUserRoleState\('admin'\)|setUserRoleState\('provider'\)/);
  assert.match(navbar, /authUser\?\.role === role/);
});

test('a missing RLS profile never changes the role the server verified', async () => {
  const context = await readFile(new URL('../src/context/MarketplaceContext.tsx', import.meta.url), 'utf8');
  const profileBranch = context.slice(
    context.indexOf('if (mounted && remoteProfile)'),
    context.indexOf('if (mounted && remoteBookings')
  );
  assert.doesNotMatch(
    profileBranch,
    /setUserRoleState\('customer'\)/,
    'an unavailable RLS profile must not downgrade a server verified role'
  );
});

test('the profile save reports honestly when the durable profile was not written', async () => {
  const [context, modal, client] = await Promise.all([
    readFile(new URL('../src/context/MarketplaceContext.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SupabaseAuthModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/supabaseClient.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(client, /accountUpdated/);
  assert.match(context, /persisted: updated\.accountUpdated \? 'account_only' : 'none'/);
  assert.match(modal, /marketplace profile could not be saved/);
  assert.match(
    modal,
    /if \(result\.persisted === 'profile'\) \{\s*\n\s*setInfoMsg\('Profile updated!'\);/,
    'the success message must only be shown when the durable profile was written'
  );
});

test('a Supabase sign-out revokes the authoritative session on the server', async () => {
  const context = await readFile(new URL('../src/context/MarketplaceContext.tsx', import.meta.url), 'utf8');
  const signedOut = context.slice(
    context.indexOf("if (event === 'SIGNED_OUT')"),
    context.indexOf("void loadRlsData(session?.user ?? null);")
  );
  assert.match(signedOut, /logoutAuthoritativeSession\(\)/);
  assert.match(signedOut, /bos_authoritative_session_token/);
});

test('the client never treats a Supabase access token as an application session', async () => {
  const client = await readFile(new URL('../src/lib/supabaseClient.ts', import.meta.url), 'utf8');
  const authHeaders = client.slice(
    client.indexOf('export function buildAuthHeaders'),
    client.indexOf('export async function authenticateWithGoogleServer')
  );
  assert.match(authHeaders, /getStoredAuthoritativeSessionToken\(\)/);
  assert.doesNotMatch(authHeaders, /access_token/);
});

test('Supabase hydration and SIGNED_IN share one authoritative verification per access token', async () => {
  const context = await readFile(new URL('../src/context/MarketplaceContext.tsx', import.meta.url), 'utf8');
  assert.match(context, /googleSessionSyncInFlight/);
  assert.match(context, /googleSessionSyncCache/);
  assert.match(context, /inFlight\?\.accessToken === accessToken/);
  assert.match(context, /cached\?\.accessToken === accessToken/);
  assert.match(context, /googleSessionSyncCache\.current = null/);
});

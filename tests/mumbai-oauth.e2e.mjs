/**
 * Offline validation of the Google OAuth path for the Mumbai Supabase project.
 *
 * A local stand-in for Supabase Auth plays the role of the identity provider,
 * so the whole path can be proven without a real Google sign-in:
 *
 *   1. the OAuth redirect the browser would follow is generated correctly;
 *   2. the auth callback URL is derived from the configured project;
 *   3. only a verified Google identity is accepted;
 *   4. a new Google identity provisions a customer automatically;
 *   5. the same identity signing in again does not create a second account;
 *   6. a customer cannot reach administrator-only routes;
 *   7. an expired session is refused;
 *   8. logging out revokes the session.
 *
 * A real Google sign-in is NOT exercised here and is reported as BLOCKED.
 */

import crypto from 'node:crypto';

const [, , baseUrl, authBaseUrl, sessionSecret, databaseUrl] = process.argv;

const failed = [];
let checks = 0;

function check(name, ok, detail = '') {
  checks += 1;
  if (!ok) failed.push(name);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

const GOOGLE_UUID = '77777777-8888-4999-8888-777777777777';

async function setIdentity(identity) {
  const response = await fetch(`${authBaseUrl}/__control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(identity),
  });
  if (!response.ok) throw new Error('could not set the test identity');
}

async function call(method, path, { token, body, headers } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 200) }; }
  return { status: response.status, body: parsed };
}

/** A Supabase-style access token. Only its length matters to the verifier. */
const accessToken = (label) => `fake-supabase-access-token-${label}-${'x'.repeat(40)}`;

function googleIdentity({ id = GOOGLE_UUID, email = 'new.customer@example.test', verified = true } = {}) {
  return {
    id,
    email,
    email_confirmed_at: verified ? new Date().toISOString() : null,
    app_metadata: { provider: 'google', providers: ['google'] },
    identities: [{ provider: 'google', identity_data: { sub: `google-oauth2|${id}`, email, full_name: 'New Customer' } }],
    user_metadata: { full_name: 'New Customer', avatar_url: 'https://example.test/avatar.png' },
  };
}

async function main() {
  console.log('Mumbai OAuth phase — offline validation of the Google sign-in path');

  // 1. The OAuth redirect the browser is sent to.
  const urlRoute = await call('GET', '/api/auth/google/url');
  check('the OAuth URL route is available', urlRoute.status === 200 && urlRoute.body?.ok === true, JSON.stringify(urlRoute.body));
  const authorizeUrl = String(urlRoute.body?.supabaseAuthorizeUrl || '');
  check('the redirect targets the configured Supabase project authorize endpoint',
    authorizeUrl.includes('/auth/v1/authorize?provider=google'), authorizeUrl.slice(0, 120));
  check('the redirect asks for the Google provider only',
    /[?&]provider=google(&|$)/.test(authorizeUrl), authorizeUrl.slice(0, 160));
  check('the post-login redirect returns to the React application',
    String(urlRoute.body?.callbackUrl || '').endsWith('/auth/callback'), String(urlRoute.body?.callbackUrl));
  check('the server reports the auth callback of the configured project',
    typeof urlRoute.body?.supabaseAuthCallbackUrl === 'string' && urlRoute.body.supabaseAuthCallbackUrl.endsWith('/auth/v1/callback'),
    String(urlRoute.body?.supabaseAuthCallbackUrl));

  // 2. A password-style identity is refused: Google only.
  await setIdentity({
    id: GOOGLE_UUID,
    email: 'not.google@example.test',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    identities: [{ provider: 'email', identity_data: { sub: 'email-sub' } }],
    user_metadata: {},
  });
  const nonGoogle = await call('POST', '/api/auth/google/authenticate', { token: accessToken('non-google') });
  check('a non-Google identity is refused', nonGoogle.status === 401 && nonGoogle.body?.error === 'INVALID_GOOGLE_SESSION', JSON.stringify(nonGoogle.body));

  // 3. An unverified e-mail is refused.
  await setIdentity(googleIdentity({ id: '88888888-8888-4888-8888-888888888888', email: 'unverified@example.test', verified: false }));
  const unverified = await call('POST', '/api/auth/google/authenticate', { token: accessToken('unverified') });
  check('an unverified Google e-mail is refused', unverified.status === 401 && unverified.body?.error === 'INVALID_GOOGLE_SESSION', JSON.stringify(unverified.body));

  // 4. A missing session is refused.
  const noSession = await call('POST', '/api/auth/google/authenticate', {});
  check('a request without a Supabase session is refused', noSession.status === 401, JSON.stringify(noSession.body));

  // 5. A new Google identity provisions a customer.
  await setIdentity(googleIdentity());
  const provisioned = await call('POST', '/api/auth/google/authenticate', {
    token: accessToken('new'),
    body: { requestedRole: 'admin', role: 'admin' },
  });
  check('a new Google identity is signed in',
    [200, 201].includes(provisioned.status) && provisioned.body?.ok === true, JSON.stringify(provisioned.body).slice(0, 300));
  check('the first sign-in is reported as a new user', provisioned.body?.isNewUser === true, String(provisioned.body?.isNewUser));
  check('the new session is a customer session',
    provisioned.body?.claims?.role === 'customer' || provisioned.body?.user?.role === 'customer',
    String(JSON.stringify(provisioned.body?.claims || provisioned.body?.user) || '').slice(0, 200));
  const sessionToken = String(provisioned.body?.sessionToken || '');
  check('the session token is issued', sessionToken.includes('.'), 'no session token');

  // 6. The same identity signing in again must not create a second account.
  const again = await call('POST', '/api/auth/google/authenticate', { token: accessToken('new') });
  check('the same Google identity signs in again',
    [200, 201].includes(again.status) && again.body?.ok === true, JSON.stringify(again.body).slice(0, 200));
  check('a returning Google user is not treated as a new registration',
    again.body?.isNewUser === false, String(again.body?.isNewUser));
  check('the existing account is reused, not duplicated',
    again.body?.user?.id === provisioned.body?.user?.id, `${again.body?.user?.id} vs ${provisioned.body?.user?.id}`);

  // 7. The session answers with the role from the authoritative database.
  const me = await call('GET', '/api/auth/me', { token: sessionToken });
  check('the session reports the role from the database', me.status === 200 && me.body?.claims?.role === 'customer', JSON.stringify(me.body?.claims));
  const afterRefresh = await call('GET', '/api/auth/me', { token: sessionToken });
  check('the signed session restores the same account after a page refresh',
    afterRefresh.status === 200 && afterRefresh.body?.user?.id === provisioned.body?.user?.id,
    `${afterRefresh.status} ${afterRefresh.body?.user?.id}`);

  // 8. A customer cannot reach an administrator-only route.
  const adminRoute = await call('GET', '/api/admin/pg/bookings', { token: sessionToken });
  check('a customer is refused an administrator-only route',
    adminRoute.status === 403, `${adminRoute.status} ${JSON.stringify(adminRoute.body).slice(0, 160)}`);

  // 9. A customer cannot obtain the super administrator scope.
  const superAdmin = await call('POST', '/api/auth/super-admin/session', { token: sessionToken });
  check('a customer cannot obtain a super administrator session',
    superAdmin.status === 403, `${superAdmin.status} ${JSON.stringify(superAdmin.body).slice(0, 160)}`);

  // 10. An expired session is refused.
  const expiredPayload = Buffer.from(JSON.stringify({
    userId: 'LEGACY-customer',
    supabaseUserId: GOOGLE_UUID,
    email: 'new.customer@example.test',
    name: 'New Customer',
    role: 'customer',
    authProvider: 'google',
    issuedAt: Date.now() - 7200000,
    expiresAt: Date.now() - 3600000,
  })).toString('base64url');
  const expiredToken = `${expiredPayload}.${crypto.createHmac('sha256', `${sessionSecret}:SESSION_TOKEN_V2`).update(expiredPayload).digest('hex')}`;
  const expired = await call('GET', '/api/auth/me', { token: expiredToken });
  check('an expired session is refused', expired.status === 401, `${expired.status} ${JSON.stringify(expired.body).slice(0, 160)}`);

  // 11. Logging out revokes the session.
  const logout = await call('POST', '/api/auth/logout', { token: sessionToken });
  check('logout succeeds', logout.status === 200 && logout.body?.ok === true, JSON.stringify(logout.body));
  const afterLogout = await call('GET', '/api/auth/me', { token: sessionToken });
  check('the session is refused after logout', afterLogout.status === 401, `${afterLogout.status} ${JSON.stringify(afterLogout.body).slice(0, 160)}`);
}

await main();

console.log(`Mumbai OAuth phase: ${checks - failed.length}/${checks} checks passed`);
if (failed.length) {
  console.error(`failed checks: ${failed.join(' | ')}`);
  process.exitCode = 1;
}

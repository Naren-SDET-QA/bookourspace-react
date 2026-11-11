import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifySupabaseEmailIdentity, verifySupabaseGoogleIdentity } from '../src/server/supabaseGoogleIdentity.ts';

const UUID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'verified-email-otp-access-token';

function fakeFetch(user) {
  return async () => ({
    ok: true,
    async json() { return user; },
  });
}

test('verified Supabase email OTP identities are accepted without becoming Google identities', async () => {
  const identity = await verifySupabaseEmailIdentity({
    projectUrl: 'https://example.supabase.co',
    publishableKey: 'publishable-key',
    accessToken: TOKEN,
    fetchImpl: fakeFetch({
      id: UUID,
      email: 'guest@example.test',
      email_confirmed_at: '2026-11-11T10:00:00.000Z',
      app_metadata: { provider: 'email' },
      identities: [{ provider: 'email' }],
      user_metadata: { full_name: 'Email Guest' },
    }),
  });
  assert.deepEqual(identity, {
    id: UUID,
    email: 'guest@example.test',
    provider: 'email_otp',
    name: 'Email Guest',
  });
});

test('email OTP verification does not accept a Google-only identity and Google verification stays separate', async () => {
  const user = {
    id: UUID,
    email: 'guest@example.test',
    email_confirmed_at: '2026-11-11T10:00:00.000Z',
    app_metadata: { provider: 'google' },
    identities: [{ provider: 'google', identity_data: { sub: 'google-sub' } }],
  };
  const emailIdentity = await verifySupabaseEmailIdentity({
    projectUrl: 'https://example.supabase.co',
    publishableKey: 'publishable-key',
    accessToken: TOKEN,
    fetchImpl: fakeFetch(user),
  });
  const googleIdentity = await verifySupabaseGoogleIdentity({
    projectUrl: 'https://example.supabase.co',
    publishableKey: 'publishable-key',
    accessToken: TOKEN,
    fetchImpl: fakeFetch(user),
  });
  assert.equal(emailIdentity, null);
  assert.equal(googleIdentity?.googleSub, 'google-sub');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { EmailOtpService } from '../src/server/emailOtpAuth.ts';

/**
 * SEC-05 regression coverage.
 *
 * The email one-time-code budgets used to live in per-process Maps, so a second
 * Cloud Run instance started with a fresh budget. These tests hand two service
 * instances one shared limiter (the database-backed limiter in production) and
 * prove the budget is consumed across instances, while the in-process fallback
 * still enforces the same limits when no limiter is configured.
 */

const CONFIG = {
  projectUrl: 'https://example.supabase.co',
  publishableKey: 'publishable-test-key',
  secretKey: 'secret-test-key',
  resendApiKey: 'resend-test-key',
  resendFrom: 'BookOurSpace <signin@example.test>',
};

/** Records the raw buckets so a test can assert what left the process. */
function sharedLimiter() {
  const windows = new Map();
  return {
    keys: [],
    async consume(bucketKey, limit, windowSeconds) {
      this.keys.push(bucketKey);
      const key = `${bucketKey}\0${windowSeconds}`;
      const count = (windows.get(key) || 0) + 1;
      windows.set(key, count);
      return {
        allowed: count <= limit,
        retryAfterSeconds: Math.max(1, Math.round(windowSeconds / 2)),
      };
    },
  };
}

function fakeFetch({ verifyStatus = 200 } = {}) {
  return async (url) => {
    const target = String(url);
    if (target.includes('/auth/v1/admin/users')) return new Response('{}', { status: 200 });
    if (target.includes('/auth/v1/admin/generate_link')) {
      return new Response(JSON.stringify({ email_otp: '123456' }), { status: 200 });
    }
    if (target.includes('/emails')) return new Response('{"id":"email_1"}', { status: 200 });
    if (target.includes('/auth/v1/verify')) {
      if (verifyStatus !== 200) return new Response('{"error":"invalid"}', { status: verifyStatus });
      return new Response(
        JSON.stringify({ access_token: 'a'.repeat(40), refresh_token: 'b'.repeat(40) }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 200 });
  };
}

function service(extra = {}) {
  return new EmailOtpService({ ...CONFIG, fetchImpl: fakeFetch(extra.fetch ?? {}), ...extra });
}

test('the per-email hourly budget is shared across Cloud Run instances', async () => {
  const limiter = sharedLimiter();
  const instanceA = service({ rateLimiter: limiter });
  const instanceB = service({ rateLimiter: limiter });

  for (let index = 0; index < 5; index += 1) {
    const result = await instanceA.requestCode('Customer@Example.test', '203.0.113.10');
    assert.equal(result.ok, true, `request ${index + 1} must be allowed`);
  }

  // Different process, same email: the sixth send of the hour is denied.
  const blocked = await instanceB.requestCode('customer@example.test', '203.0.113.10');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.error, 'OTP_RATE_LIMITED');
  assert.ok(blocked.retryAfterSeconds >= 1);

  // The service hands the limiter a scoped key, not an address string; the
  // server adapter HMACs that key before it reaches PostgreSQL.
  assert.ok(limiter.keys.some((key) => key.startsWith('email:')), 'email budget keyed by email scope');
  assert.ok(limiter.keys.some((key) => key.startsWith('ip:')), 'address budget keyed by ip scope');
});

test('the per-IP hourly budget is shared across Cloud Run instances', async () => {
  const limiter = sharedLimiter();
  const instanceA = service({ rateLimiter: limiter });
  const instanceB = service({ rateLimiter: limiter });

  for (let index = 0; index < 20; index += 1) {
    const result = await instanceA.requestCode(`guest${index}@example.test`, '198.51.100.7');
    assert.equal(result.ok, true, `request ${index + 1} must be allowed`);
  }

  const blocked = await instanceB.requestCode('guest-new@example.test', '198.51.100.7');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.error, 'OTP_RATE_LIMITED');

  // Another address keeps its own budget (and a fresh email, so the shared
  // per-email cooldown cannot be what allows it).
  const otherIp = await instanceB.requestCode('another-guest@example.test', '198.51.100.8');
  assert.equal(otherIp.ok, true);
});

test('the verification attempt budget is shared across Cloud Run instances', async () => {
  const limiter = sharedLimiter();
  const instanceA = service({ rateLimiter: limiter, fetch: { verifyStatus: 401 } });
  const instanceB = service({ rateLimiter: limiter, fetch: { verifyStatus: 401 } });

  for (let index = 0; index < 10; index += 1) {
    const result = await instanceA.verifyCode('locked@example.test', '000000', '203.0.113.20');
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.equal(result.error, 'EMAIL_OTP_INVALID');
  }

  const blocked = await instanceB.verifyCode('locked@example.test', '000000', '203.0.113.20');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.error, 'OTP_ATTEMPTS_EXCEEDED');
});

test('a limiter outage fails closed instead of allowing unlimited codes', async () => {
  const brokenLimiter = {
    async consume() {
      throw new Error('RATE_LIMIT_DATABASE_DOWN');
    },
  };
  const result = await service({ rateLimiter: brokenLimiter }).requestCode('customer@example.test', '203.0.113.30');
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.error, 'OTP_RATE_LIMIT_UNAVAILABLE');

  const verify = await service({ rateLimiter: brokenLimiter }).verifyCode(
    'customer@example.test',
    '123456',
    '203.0.113.30',
  );
  assert.equal(verify.ok, false);
  assert.equal(verify.status, 503);
  assert.equal(verify.error, 'OTP_RATE_LIMIT_UNAVAILABLE');
});

test('without a limiter the in-process fallback still enforces the same hourly budget', async () => {
  const local = service();

  for (let index = 0; index < 5; index += 1) {
    const result = await local.requestCode('fallback@example.test', '203.0.113.40');
    assert.equal(result.ok, true, `request ${index + 1} must be allowed`);
  }

  const blocked = await local.requestCode('fallback@example.test', '203.0.113.40');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.error, 'OTP_RATE_LIMITED');

  // A different email from the same address still gets its own hourly budget.
  const otherEmail = await local.requestCode('second@example.test', '203.0.113.40');
  assert.equal(otherEmail.ok, true);
});

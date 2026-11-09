import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { STAY, TEST_HMAC_SECRET, USERS, startStaysHarness, type StaysHarness } from './stays-e2e-harness';

const FOREIGN_PROVIDER = {
  id: '5a7b0000-1111-4222-8333-000000000006',
  userId: 'USR-FOREIGN-PROVIDER',
  email: 'foreign.provider@example.test',
  name: 'Foreign Provider Test',
  role: 'provider',
  phone: '+91 90000 20006',
};

let harness: StaysHarness;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  harness = await startStaysHarness();
  await harness.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, $2, jsonb_build_object('full_name', $3::text)) on conflict (id) do nothing`,
    [FOREIGN_PROVIDER.id, FOREIGN_PROVIDER.email, FOREIGN_PROVIDER.name],
  );
  await harness.query(
    `update public.profiles set role='provider', account_status='active' where id=$1::uuid`,
    [FOREIGN_PROVIDER.id],
  );
});

test.afterAll(async () => {
  await harness?.stop();
});

function sessionToken(user: typeof USERS[keyof typeof USERS] | typeof FOREIGN_PROVIDER): string {
  const payload = Buffer.from(JSON.stringify({
    userId: user.userId,
    supabaseUserId: 'authId' in user ? user.authId : user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60 * 60_000,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', `${TEST_HMAC_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function createPass(expiry: string | null = new Date(Date.now() + 90 * 86_400_000).toISOString()) {
  const bookingId = `legacy-pass-${crypto.randomUUID()}`;
  const passCode = `LEG-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const listingId = STAY.listingId;
  const scheduledDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const seats = ['A1', 'A2'];
  const canonical = [passCode, bookingId, listingId, scheduledDate, [...seats].sort().join(',')].join('|');
  const signature = crypto.createHmac('sha256', `${TEST_HMAC_SECRET}:QR_PASS`).update(canonical).digest('hex').slice(0, 24).toUpperCase();
  const payload = {
    passCode,
    seats,
    ...(expiry ? { expiresAtIso: expiry } : {}),
    timeSlot: 'Test check-in window',
    screenName: 'Local test screen',
    customerAddress: 'PRIVATE TEST ADDRESS',
    customerEmail: 'private@example.test',
  };
  return { bookingId, passCode, listingId, scheduledDate, seats, signature, token: `${passCode}.${signature}`, payload };
}

async function seedPass(expiry?: string | null) {
  const pass = createPass(expiry);
  await harness.query(
    `insert into public.bookings
       (id, user_id, listing_id, listing_title, provider_id, customer_name, customer_phone,
        scheduled_date, scheduled_time, amount, status, payload, payment_mode, payment_status,
        qr_signature, qr_pass_token)
     values ($1, $2::uuid, $3, 'Synthetic Test Listing', 'provider-test', 'Synthetic Guest',
             '9000000000', $4, '10:00', 0, 'confirmed', $5::jsonb,
             'pay_after_service', 'pay_later', $6, $7)`,
    [pass.bookingId, USERS.customerA.authId, pass.listingId, pass.scheduledDate, JSON.stringify(pass.payload), pass.signature, pass.token],
  );
  return pass;
}

async function scan(token: string, actor?: typeof USERS[keyof typeof USERS] | typeof FOREIGN_PROVIDER, extra: Record<string, unknown> = {}) {
  const response = await fetch(`${harness.apiUrl}/api/passes/verify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(actor ? { authorization: `Bearer ${sessionToken(actor)}` } : {}),
    },
    body: JSON.stringify({ passToken: token, markCheckedIn: true, verifierRole: 'admin', ...extra }),
  });
  return { status: response.status, body: await response.json() };
}

test('anonymous pass verification is denied', async () => {
  const pass = await seedPass();
  const result = await scan(pass.token);
  expect(result.status).toBe(401);
  expect(result.body.error).toBe('UNAUTHORIZED_SESSION');
});

test('missing pass token and signature are rejected', async () => {
  const response = await fetch(`${harness.apiUrl}/api/passes/verify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${sessionToken(USERS.provider)}`,
    },
    body: JSON.stringify({ markCheckedIn: true }),
  });
  expect(response.status).toBe(400);
  expect((await response.json()).error).toBe('MISSING_PASS_CODE_OR_SIGNATURE');
});

test('foreign provider cannot scan a listing they do not own', async () => {
  const pass = await seedPass();
  const result = await scan(pass.token, FOREIGN_PROVIDER);
  expect(result.status).toBe(403);
  expect(result.body.error).toBe('FORBIDDEN_NOT_LISTING_OWNER');
});

test('customer cannot elevate with a client-supplied verifierRole', async () => {
  const pass = await seedPass();
  const result = await scan(pass.token, USERS.customerA, { verifierRole: 'admin' });
  expect(result.status).toBe(403);
  expect(result.body.error).toBe('PROVIDER_OR_ADMIN_REQUIRED');
});

test('expired QR and missing expiry are rejected', async () => {
  const expired = await seedPass('2000-01-01T00:00:00.000Z');
  const expiredResult = await scan(expired.token, USERS.provider);
  expect(expiredResult.status).toBe(403);
  expect(expiredResult.body.error).toBe('TICKET_EXPIRED');

  const noExpiry = await seedPass(null);
  const missingResult = await scan(noExpiry.token, USERS.provider);
  expect(missingResult.status).toBe(403);
  expect(missingResult.body.error).toBe('TICKET_EXPIRY_REQUIRED');
});

test('tampered QR signature is rejected', async () => {
  const pass = await seedPass();
  const tampered = `${pass.passCode}.${pass.signature.slice(0, -1)}${pass.signature.endsWith('0') ? '1' : '0'}`;
  const result = await scan(tampered, USERS.provider);
  expect(result.status).toBe(403);
  expect(result.body.error).toBe('INVALID_OR_FORGED_QR_SIGNATURE');
});

test('owner check-in is atomic, audited, minimal, and cannot be replayed', async () => {
  const pass = await seedPass();
  const [first, concurrent] = await Promise.all([
    scan(pass.token, USERS.provider),
    scan(pass.token, USERS.provider),
  ]);
  expect([first.status, concurrent.status].sort()).toEqual([200, 409]);
  const accepted = first.status === 200 ? first : concurrent;
  const rejected = first.status === 409 ? first : concurrent;
  expect(rejected.body.error).toBe('PASS_ALREADY_USED');
  expect(accepted.body.booking.customerName).toBe('Synthetic Guest');
  expect(accepted.body.booking.passCode).toBe(pass.passCode);
  for (const privateField of ['qrPassToken', 'qrSignature', 'customerPhone', 'customerAddress', 'customerEmail']) {
    expect(accepted.body.booking).not.toHaveProperty(privateField);
    expect(accepted.body).not.toHaveProperty(privateField);
  }
  const audits = await harness.query(
    `select detail, actor from public.stay_audit_events
      where event='legacy_pass_checked_in' and detail->>'bookingId'=$1`,
    [pass.bookingId],
  );
  expect(audits).toHaveLength(1);
  expect(String(audits[0].actor)).toBe(USERS.provider.authId);
  expect(audits[0].detail.actorRole).toBe('provider');
  expect(audits[0].detail.action).toBe('check_in');
  expect(audits[0].detail.previousState).toBe('confirmed');
  expect(audits[0].detail.newState).toBe('checked_in');
  expect(audits[0].detail.reason).toBeTruthy();
  expect(JSON.stringify(audits[0].detail)).not.toContain(pass.token);

  const replay = await scan(pass.token, USERS.provider);
  expect(replay.status).toBe(409);
  expect(replay.body.error).toBe('PASS_ALREADY_USED');
});

test('active database Admin can verify a pass and client verifierRole cannot override identity', async () => {
  const pass = await seedPass();
  const result = await scan(pass.token, USERS.admin, { markCheckedIn: false, verifierRole: 'provider' });
  expect(result.status).toBe(200);
  expect(result.body.verified).toBe(true);
  expect(result.body.booking).not.toHaveProperty('qrPassToken');
});

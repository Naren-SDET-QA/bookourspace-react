import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import pg from 'pg';

/**
 * Classes & Training end-to-end HTTP test against a disposable local
 * PostgreSQL database and the real Express server.
 *
 * Covered: trainer creates a course batch, admin approval, public discovery,
 * student enrollment with a recorded pay-at-institute obligation, duplicate and
 * replay protection, forged price rejection, capacity limits, waitlist, role
 * and ownership isolation, online-payment fail-closed behaviour, trainer
 * roster, cancellation policy and restart persistence.
 */

const { Pool } = pg;
const databaseAvailable = Boolean(process.env.BOS_LISTINGS_DATABASE_URL);
const dbTest = databaseAvailable ? test : test.skip;
const connectionString = process.env.BOS_LISTINGS_DATABASE_URL;
const TEST_HMAC_SECRET = 'bos-local-class-enrollment-test-secret';

const provider = '7f1d2c33-1111-4111-8111-000000000001';
const customerA = '7f1d2c33-1111-4111-8111-000000000002';
const customerB = '7f1d2c33-1111-4111-8111-000000000003';
const customerC = '7f1d2c33-1111-4111-8111-000000000004';
const admin = '7f1d2c33-1111-4111-8111-000000000005';
const otherProvider = '7f1d2c33-1111-4111-8111-000000000006';

const COURSE_ID = 'class-e2e-course';

let pool;
let child;
let tempDir;
let storePath;
let serverUrl;
let serverStderr = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

function sessionToken({ authId, role, userId, email }) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    supabaseUserId: authId,
    email,
    name: `${role} class test`,
    googleSub: `google-${authId}`,
    phone: '+91 90000 00000',
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 10 * 60_000,
  })).toString('base64url');
  const signature = createHmac('sha256', `${TEST_HMAC_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

const tokens = {
  provider: sessionToken({ authId: provider, role: 'provider', userId: 'USR-CLS-P', email: 'class-provider@example.test' }),
  customerA: sessionToken({ authId: customerA, role: 'customer', userId: 'USR-CLS-A', email: 'class-a@example.test' }),
  customerB: sessionToken({ authId: customerB, role: 'customer', userId: 'USR-CLS-B', email: 'class-b@example.test' }),
  customerC: sessionToken({ authId: customerC, role: 'customer', userId: 'USR-CLS-C', email: 'class-c@example.test' }),
  admin: sessionToken({ authId: admin, role: 'admin', userId: 'USR-CLS-ADMIN', email: 'class-admin@example.test' }),
  otherProvider: sessionToken({ authId: otherProvider, role: 'provider', userId: 'USR-CLS-P2', email: 'class-provider2@example.test' }),
};

async function startServer() {
  const port = await freePort();
  serverUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: TEST_HMAC_SECRET,
      BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
      BOS_LISTINGS_DATABASE_URL: connectionString,
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { serverStderr += chunk; });

  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`test server exited before listening (${child.exitCode})`);
    try {
      const response = await fetch(`${serverUrl}/api/auth/me`);
      if (response.status === 401) return;
    } catch {
      // Local app boot only.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('test server did not become ready');
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const processToStop = child;
  child = undefined;
  processToStop.kill('SIGTERM');
  await new Promise((resolve) => processToStop.once('exit', resolve));
}

async function request(method, url, token, body) {
  let businessId = '';
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
      if (payload.role === 'provider' && payload.supabaseUserId) {
        const business = await pool.query(
          `select b.id from public.businesses b join public.business_members m on m.business_id=b.id
            where b.owner_user_id=$1 and m.user_id=$1 and m.status='active' and b.approval_status='approved'
            order by b.created_at limit 1`,
          [payload.supabaseUserId],
        );
        businessId = business.rows[0]?.id || '';
      }
    } catch { /* normal auth failure */ }
  }
  const response = await fetch(`${serverUrl}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(businessId ? { 'x-business-id': businessId } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function seedDatabase() {
  pool = new Pool({ connectionString, max: 4 });
  await pool.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'class-provider@example.test', '{}'::jsonb),
       ($2, 'class-a@example.test', '{}'::jsonb),
       ($3, 'class-b@example.test', '{}'::jsonb),
       ($4, 'class-c@example.test', '{}'::jsonb),
       ($5, 'class-admin@example.test', '{}'::jsonb),
       ($6, 'class-provider2@example.test', '{}'::jsonb)
     on conflict (id) do nothing`,
    [provider, customerA, customerB, customerC, admin, otherProvider],
  );
  await pool.query(
    `update public.profiles set role = 'provider', account_status = 'active' where id = any($1::uuid[])`,
    [[provider, otherProvider]],
  );
  await pool.query(
    `update public.profiles set role = 'admin', account_status = 'active' where id = any($1::uuid[])`,
    [[admin]],
  );
  await pool.query(
    `update public.profiles set role = 'customer', account_status = 'active' where id = any($1::uuid[])`,
    [[customerA, customerB, customerC]],
  );
  await pool.query(`delete from public.class_enrollments`);
  await pool.query(`delete from public.class_batches`);
  await pool.query(
    `delete from public.listings where id in ($1, $2)`,
    [COURSE_ID, 'class-e2e-other'],
  );
  for (const [owner, label] of [[provider, 'Class Provider'], [otherProvider, 'Other Class Provider']]) {
    const ref = `BIZ-CLASS-${owner.replaceAll('-', '').toUpperCase()}`;
    await pool.query(
      `insert into public.businesses (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source,created_by,approved_at)
       values ($1,$2,'classes',$3,'approved',true,'integration_test',$3,now())
       on conflict (business_ref) do update set is_enabled=true, approval_status='approved'`,
      [ref, `${label} Integration Business`, owner],
    );
  }
  await pool.query(
    `insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
     values
       ($1, $2, 'E2E Algebra Course', 'class-academic', 'Academic', 'course', 5000, 'per course', 'active', '{}'::jsonb),
       ($3, $2, 'E2E Other Course', 'class-software', 'Software & IT', 'course', 3000, 'per course', 'active', '{}'::jsonb)`,
    [COURSE_ID, provider, 'class-e2e-other'],
  );
}

async function batchAvailability(batchId) {
  const result = await pool.query(
    `select confirmed_count, waitlist_count, seats_left, waitlist_left
       from public.class_batch_availability($1)`,
    [batchId],
  );
  return result.rows[0];
}

async function enrollmentCount() {
  const result = await pool.query(`select count(*)::int as count from public.class_enrollments`);
  return result.rows[0].count;
}

async function createBatch(token, overrides = {}) {
  return request('POST', `/api/provider/classes/listings/${COURSE_ID}/batches`, token, {
    title: 'Morning Batch',
    deliveryMode: 'hybrid',
    feeUnit: 'month',
    onlineFee: 4000,
    offlineFee: 5000,
    capacity: 2,
    waitlistCapacity: 0,
    startDate: null,
    daysOfWeek: 'Mon-Fri',
    startTime: '07:00',
    endTime: '09:00',
    area: 'Test Area',
    facultyName: 'Test Faculty',
    facultyExperience: '10 years',
    ...overrides,
  });
}

after(async () => {
  await stopServer();
  if (pool) await pool.end().catch(() => {});
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

dbTest('classes trainer → admin approval → student enrollment → cancellation', async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bos-class-e2e-'));
  storePath = path.join(tempDir, 'authoritative-store.json');
  await seedDatabase();
  await startServer();

  // 1. Trainer creates a batch: always pending, never public.
  const created = await createBatch(tokens.provider);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.batch.status, 'pending_approval');
  const batchId = created.data.batch.id;

  const anonAdminExecute = await pool.query(
    `select has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') as allowed`,
  );
  assert.equal(anonAdminExecute.rows[0].allowed, false, 'anonymous role must not execute the admin authorization helper');
  const publicReadPolicy = await pool.query(
    `select roles, qual
       from pg_policies
      where schemaname = 'public'
        and tablename = 'class_batches'
        and policyname = 'Active batches of approved courses are public'`,
  );
  assert.equal(String(publicReadPolicy.rows[0]?.roles), '{anon,authenticated}');
  assert.doesNotMatch(publicReadPolicy.rows[0]?.qual || '', /is_admin/i, 'anonymous discovery policy must not call the admin helper');

  const hidden = await request('GET', `/api/classes/listings/${COURSE_ID}/batches`);
  assert.equal(hidden.status, 200, JSON.stringify({
    request: { method: 'GET', path: `/api/classes/listings/${COURSE_ID}/batches` },
    response: { status: hidden.status, body: hidden.data },
    backend: serverStderr.split('\n').filter((line) => line.includes('[class-enrollments] repository failure') || line.includes('at ')),
  }));
  assert.equal(hidden.data.batches.length, 0, 'an unapproved batch must not be public');

  // 2. A student cannot enroll before approval.
  const beforeApproval = await request('POST', '/api/classes/enrollments', tokens.customerA, {
    batchId,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  assert.equal(beforeApproval.status, 404);
  assert.equal(beforeApproval.data.error, 'BATCH_NOT_AVAILABLE');

  // 3. Only an admin can publish, and only with an audit reason.
  const noReason = await request('PATCH', `/api/admin/classes/batches/${batchId}/review`, tokens.admin, {
    decision: 'active',
  });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.data.error, 'AUDIT_REASON_REQUIRED');

  const providerPublish = await request('PATCH', `/api/admin/classes/batches/${batchId}/review`, tokens.provider, {
    decision: 'active',
    reason: 'self approve',
  });
  assert.equal(providerPublish.status, 403);

  const approved = await request('PATCH', `/api/admin/classes/batches/${batchId}/review`, tokens.admin, {
    decision: 'active',
    reason: 'calendar and faculty verified',
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  assert.equal(approved.data.batch.status, 'active');

  const visible = await request('GET', `/api/classes/listings/${COURSE_ID}/batches`);
  assert.equal(visible.data.batches.length, 1);
  assert.equal(visible.data.batches[0].seatsLeft, 2);

  // 4. Student enrolls with pay-at-institute; a forged amount is ignored.
  const requestId = randomUUID();
  const enrolled = await request('POST', '/api/classes/enrollments', tokens.customerA, {
    batchId,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId,
    feeAmount: 1,
    status: 'confirmed',
    paymentStatus: 'verified',
    seatSequence: 99,
  });
  assert.equal(enrolled.status, 201, JSON.stringify(enrolled.data));
  assert.equal(enrolled.data.enrollment.status, 'confirmed');
  assert.equal(enrolled.data.enrollment.paymentStatus, 'obligation_recorded');
  assert.equal(Number(enrolled.data.enrollment.feeAmount), 5000, 'fee must come from the batch row');
  assert.equal(Number(enrolled.data.enrollment.seatSequence), 1);

  // 5. Replay is idempotent; a new request is a duplicate.
  const replay = await request('POST', '/api/classes/enrollments', tokens.customerA, {
    batchId,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId,
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.idempotent, true);

  const duplicate = await request('POST', '/api/classes/enrollments', tokens.customerA, {
    batchId,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.error, 'DUPLICATE_ENROLLMENT');

  // 6. Online payment fails closed; no paid enrollment is created.
  // Customer C has no enrollment in this batch, so the payment rule — not the
  // duplicate rule — is what rejects the request.
  const countBeforeOnline = await enrollmentCount();
  const online = await request('POST', '/api/classes/enrollments', tokens.customerC, {
    batchId,
    deliveryMode: 'online',
    paymentMode: 'online',
    requestId: randomUUID(),
  });
  assert.equal(online.status, 503);
  assert.equal(online.data.error, 'ONLINE_PAYMENT_PROVIDER_NOT_CONFIGURED');
  assert.equal(await enrollmentCount(), countBeforeOnline, 'no enrollment may be created without verified payment');

  // 7. Authorization: anonymous 401, provider cannot enroll.
  const anonymous = await request('POST', '/api/classes/enrollments', null, {
    batchId,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  assert.equal(anonymous.status, 401);

  const providerEnroll = await request('POST', '/api/classes/enrollments', tokens.provider, {
    batchId,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  assert.equal(providerEnroll.status, 403);

  // 8. Capacity: second seat fills the batch; third student is refused.
  const second = await request('POST', '/api/classes/enrollments', tokens.customerB, {
    batchId,
    deliveryMode: 'online',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  assert.equal(second.status, 201, JSON.stringify(second.data));
  assert.equal(Number(second.data.enrollment.seatSequence), 2);
  assert.equal(Number(second.data.enrollment.feeAmount), 4000, 'online fee is a separate server value');

  const third = await request('POST', '/api/classes/enrollments', tokens.customerC, {
    batchId,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  assert.equal(third.status, 409);
  assert.equal(third.data.error, 'BATCH_FULL');
  assert.equal((await batchAvailability(batchId)).confirmed_count, 2);

  // 9. Trainer roster and student isolation.
  const roster = await request('GET', '/api/provider/classes/enrollments', tokens.provider);
  assert.equal(roster.status, 200);
  assert.equal(roster.data.enrollments.length, 2);
  assert.ok(roster.data.enrollments.every((entry) => entry.courseTitle === 'E2E Algebra Course'));

  const otherProviderRoster = await request('GET', '/api/provider/classes/enrollments', tokens.otherProvider);
  assert.equal(otherProviderRoster.status, 200, JSON.stringify(otherProviderRoster.data));
  assert.equal(otherProviderRoster.data.enrollments.length, 0, 'another trainer must not see this roster');

  // 9b. A trainer cannot attach a batch calendar to another trainer's course.
  const foreignBatch = await createBatch(tokens.otherProvider, { title: 'Foreign Trainer Batch' });
  assert.equal(foreignBatch.status, 403);
  assert.equal(foreignBatch.data.error, 'FORBIDDEN_NOT_COURSE_OWNER');

  const mineA = await request('GET', '/api/classes/enrollments', tokens.customerA);
  assert.equal(mineA.status, 200);
  assert.equal(mineA.data.enrollments.length, 1);
  assert.equal(mineA.data.enrollments[0].studentId, customerA);

  const mineB = await request('GET', '/api/classes/enrollments', tokens.customerB);
  assert.equal(mineB.data.enrollments.length, 1);
  assert.notEqual(mineB.data.enrollments[0].studentId, customerA);

  // 10. A trainer cannot publish their own batch through the provider route.
  const selfPublish = await request('PATCH', `/api/provider/classes/batches/${batchId}`, tokens.provider, {
    status: 'active',
  });
  assert.equal(selfPublish.status, 400);
  assert.equal(selfPublish.data.error, 'INVALID_BATCH_STATUS');

  // 11. Cancellation follows policy and releases the seat.
  const cancel = await request('POST', `/api/classes/enrollments/${mineA.data.enrollments[0].id}/cancel`, tokens.customerA, {
    reason: 'schedule clash',
  });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.data));
  assert.equal(cancel.data.enrollment.status, 'cancelled');
  assert.equal(cancel.data.paymentSettled, false);
  assert.equal(Number(cancel.data.refundAmount), 0);
  assert.equal((await batchAvailability(batchId)).seats_left, 1);

  const foreignCancel = await request(
    'POST',
    `/api/classes/enrollments/${mineB.data.enrollments[0].id}/cancel`,
    tokens.customerA,
    { reason: 'not mine' },
  );
  assert.equal(foreignCancel.status, 403);

  // 12. Waitlist support on a filled batch.
  const waitlistBatch = await createBatch(tokens.provider, {
    title: 'Weekend Batch',
    capacity: 1,
    waitlistCapacity: 1,
    deliveryMode: 'offline',
    onlineFee: 0,
    offlineFee: 2500,
  });
  assert.equal(waitlistBatch.status, 201);
  const waitlistBatchId = waitlistBatch.data.batch.id;
  await request('PATCH', `/api/admin/classes/batches/${waitlistBatchId}/review`, tokens.admin, {
    decision: 'active',
    reason: 'weekend calendar verified',
  });

  const seat = await request('POST', '/api/classes/enrollments', tokens.customerC, {
    batchId: waitlistBatchId,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  assert.equal(seat.status, 201);
  const waitlisted = await request('POST', '/api/classes/enrollments', tokens.customerA, {
    batchId: waitlistBatchId,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  assert.equal(waitlisted.status, 201);
  assert.equal(waitlisted.data.enrollment.status, 'waitlisted');
  assert.equal(Number(waitlisted.data.enrollment.waitlistPosition), 1);
  const waitlistFull = await request('POST', '/api/classes/enrollments', tokens.customerB, {
    batchId: waitlistBatchId,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  assert.equal(waitlistFull.status, 409);
  assert.equal(waitlistFull.data.error, 'BATCH_FULL');

  // 13. Concurrency: two students race for one seat.
  const raceBatch = await createBatch(tokens.provider, {
    title: 'Race Batch',
    capacity: 1,
    deliveryMode: 'offline',
    onlineFee: 0,
    offlineFee: 1500,
  });
  const raceBatchId = raceBatch.data.batch.id;
  await request('PATCH', `/api/admin/classes/batches/${raceBatchId}/review`, tokens.admin, {
    decision: 'active',
    reason: 'race calendar verified',
  });
  const race = await Promise.all([
    request('POST', '/api/classes/enrollments', tokens.customerA, {
      batchId: raceBatchId,
      deliveryMode: 'offline',
      paymentMode: 'pay_at_institute',
      requestId: randomUUID(),
    }),
    request('POST', '/api/classes/enrollments', tokens.customerB, {
      batchId: raceBatchId,
      deliveryMode: 'offline',
      paymentMode: 'pay_at_institute',
      requestId: randomUUID(),
    }),
  ]);
  const raceStatuses = race.map((entry) => entry.status).sort();
  assert.deepEqual(raceStatuses, [201, 409], JSON.stringify(race.map((entry) => entry.data)));
  const raceAvailability = await batchAvailability(raceBatchId);
  assert.equal(raceAvailability.confirmed_count, 1, 'the last seat can only go to one student');
  assert.equal(raceAvailability.seats_left, 0);

  // 14. Restart persistence: enrollment history survives a server restart.
  const beforeRestart = await request('GET', '/api/classes/enrollments', tokens.customerA);
  await stopServer();
  await startServer();
  const afterRestart = await request('GET', '/api/classes/enrollments', tokens.customerA);
  assert.equal(afterRestart.status, 200);
  assert.equal(afterRestart.data.enrollments.length, beforeRestart.data.enrollments.length);
  assert.ok(
    afterRestart.data.enrollments.some((entry) => entry.status === 'cancelled'),
    'cancelled enrollment history must persist',
  );
  assert.ok(
    afterRestart.data.enrollments.some((entry) => entry.status === 'waitlisted'),
    'waitlisted enrollment must persist',
  );
});

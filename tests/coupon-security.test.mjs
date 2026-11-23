/**
 * SEC-04 — coupons and redemption security.
 *
 * These are behavioural tests, not source-shape assertions. They mount the real
 * `registerCouponApi` on a real Express server against the disposable
 * PostgreSQL cluster the unit runner provisions (baseline + every migration),
 * then drive it over HTTP and inspect the database directly.
 *
 * Coverage: server-authoritative pricing (the browser cannot choose the
 * subtotal), activation/expiry, minimum subtotal, global and per-user limits,
 * duplicate redemption, booking ownership, exact paise rounding, idempotent
 * retries, authorization, database outages, RLS/grants, database constraints,
 * audit rows, and parallel redemption under a coupon-row lock.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { Client, Pool } from 'pg';

import { registerCouponApi } from '../src/server/couponApi.ts';
import { couponDiscountPaise, numericToHundredths } from '../src/lib/couponMath.ts';
import {
  HELPER_CONVENIENCE_FEE_PAISE,
  HELPER_HOURLY_RATE_PAISE,
  HELPER_PLATFORM_FEE_PAISE,
  helperSubtotalPaise,
  helperSubtotalRupees,
} from '../src/lib/helperPricing.ts';

const DATABASE_URL =
  process.env.BOS_TEST_DATABASE_URL
  || process.env.BOS_LISTINGS_DATABASE_URL
  || '';
const SKIP = DATABASE_URL
  ? false
  : 'BOS_TEST_DATABASE_URL is not configured (no disposable database)';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FEES = HELPER_PLATFORM_FEE_PAISE + HELPER_CONVENIENCE_FEE_PAISE;

/** 2 hours × 1 helper + fees = ₹239.00, the journey's default quote. */
const DEFAULT_JOB = { durationId: '2', helpers: 1 };
const DEFAULT_SUBTOTAL_PAISE = 2 * HELPER_HOURLY_RATE_PAISE + FEES;

/* ------------------------------------------------------------------ helpers */

/** The session layer is not under test here; headers stand in for a cookie. */
function verifySession(request) {
  const userId = String(request.headers['x-test-user'] || '');
  const role = String(request.headers['x-test-role'] || 'customer');
  if (!UUID_RE.test(userId)) return null;
  if (!['customer', 'provider', 'admin'].includes(role)) return null;
  return { userId, role };
}

async function withApi(run) {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 16 });
  const app = express();
  app.use(express.json());
  registerCouponApi(app, { pool, verifySession });
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ origin, pool });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

async function postCoupon(origin, action, body, actor = {}) {
  const headers = { 'content-type': 'application/json' };
  if (actor.userId) headers['x-test-user'] = actor.userId;
  headers['x-test-role'] = actor.role || 'customer';
  const response = await fetch(`${origin}/api/coupons/${action}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, body: payload, cacheControl: response.headers.get('cache-control') };
}

/** `SEC04`-prefixed so a test can remove exactly its own fixtures. */
async function createCoupon(pool, overrides = {}) {
  const coupon = {
    code: `SEC04${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
    discount_percent: '10.00',
    min_subtotal: '0.00',
    max_discount: null,
    starts_at: null,
    expires_at: null,
    max_redemptions: null,
    active: true,
    ...overrides,
  };
  await pool.query(
    `insert into public.coupons
       (code, discount_percent, min_subtotal, max_discount, starts_at, expires_at, max_redemptions, active)
     values ($1, $2, $3, $4, coalesce($5::timestamptz, now()), $6, $7, $8)`,
    [
      coupon.code,
      coupon.discount_percent,
      coupon.min_subtotal,
      coupon.max_discount,
      coupon.starts_at,
      coupon.expires_at,
      coupon.max_redemptions,
      coupon.active,
    ],
  );
  return coupon.code;
}

async function resetFixtures(pool) {
  await pool.query(
    `delete from public.coupon_redemptions r
      using public.coupons c
      where r.coupon_id = c.id and c.code like 'SEC04%'`,
  );
  await pool.query(`delete from public.coupons where code like 'SEC04%'`);
}

async function redemptionRows(pool, code) {
  const { rows } = await pool.query(
    `select r.user_id, r.booking_id, r.subtotal, r.discount, r.redeemed_at
       from public.coupon_redemptions r
       join public.coupons c on c.id = r.coupon_id
      where c.code = $1
      order by r.redeemed_at`,
    [code],
  );
  return rows;
}

async function runFixtures(run) {
  await withApi(async ({ origin, pool }) => {
    await resetFixtures(pool);
    try {
      await run({ origin, pool });
    } finally {
      await resetFixtures(pool);
    }
  });
}

/* ------------------------------------------------- server-owned price table */

test('helper pricing is the server-side subtotal source of truth', () => {
  assert.equal(helperSubtotalPaise(DEFAULT_JOB), DEFAULT_SUBTOTAL_PAISE);
  assert.equal(helperSubtotalRupees(DEFAULT_JOB), 239);
  assert.equal(helperSubtotalPaise({ durationId: '1', helpers: 1 }), HELPER_HOURLY_RATE_PAISE + FEES);
  assert.equal(helperSubtotalPaise({ durationId: '4', helpers: 2 }), 8 * 2 * HELPER_HOURLY_RATE_PAISE + FEES);
  // Nothing a browser can invent becomes a price.
  for (const bad of [
    { durationId: '9', helpers: 1 },
    { durationId: '2', helpers: 0 },
    { durationId: '2', helpers: 11 },
    { durationId: '2', helpers: 1.5 },
    { durationId: '2', helpers: 'many' },
    { durationId: '', helpers: 1 },
    { helpers: 1 },
    {},
    null,
  ]) {
    assert.equal(helperSubtotalPaise(bad), null, JSON.stringify(bad));
  }
});

test('coupon maths is exact in paise and bounded by cap, subtotal and percent', () => {
  assert.equal(numericToHundredths('239.00'), 23900);
  assert.equal(numericToHundredths('0.05'), 5);
  assert.equal(numericToHundredths('1.234'), null);
  assert.equal(numericToHundredths('-1.00'), null);
  assert.equal(numericToHundredths(null), null);

  assert.equal(couponDiscountPaise({ subtotalPaise: 23900, discountPercent: '10.00', maxDiscount: null }), 2390);
  // 33.33% of ₹239.00 = ₹79.6587 → ₹79.66 (round half up in integer paise).
  assert.equal(couponDiscountPaise({ subtotalPaise: 23900, discountPercent: '33.33', maxDiscount: null }), 7966);
  // ₹0.005 is not a representable rupee amount; the DB stores 2 decimals only.
  assert.equal(couponDiscountPaise({ subtotalPaise: 5, discountPercent: '10.00', maxDiscount: null }), 1);
  assert.equal(couponDiscountPaise({ subtotalPaise: 23900, discountPercent: '100.00', maxDiscount: null }), 23900);
  assert.equal(couponDiscountPaise({ subtotalPaise: 23900, discountPercent: '10.00', maxDiscount: '5.00' }), 500);
  assert.equal(couponDiscountPaise({ subtotalPaise: 23900, discountPercent: '10.00', maxDiscount: '10000.00' }), 2390);
  assert.equal(couponDiscountPaise({ subtotalPaise: 23900, discountPercent: '0.00', maxDiscount: null }), null);
  assert.equal(couponDiscountPaise({ subtotalPaise: 23900, discountPercent: '101.00', maxDiscount: null }), null);
  assert.equal(couponDiscountPaise({ subtotalPaise: -1, discountPercent: '10.00', maxDiscount: null }), null);
  assert.equal(couponDiscountPaise({ subtotalPaise: 23900, discountPercent: null, maxDiscount: null }), null);
});

/* ----------------------------------------------------------- server rules */

test('activation window and expiry are enforced on the server', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const user = randomUUID();
    const expired = await createCoupon(pool, { expires_at: new Date(Date.now() - 60_000).toISOString() });
    const future = await createCoupon(pool, { starts_at: new Date(Date.now() + 3_600_000).toISOString() });
    const paused = await createCoupon(pool, { active: false });
    const live = await createCoupon(pool);

    for (const code of [expired, future, paused]) {
      const result = await postCoupon(origin, 'validate', { code, ...DEFAULT_JOB }, { userId: user });
      assert.equal(result.status, 422, code);
      assert.equal(result.body.error, 'COUPON_INVALID', code);
      assert.equal(result.cacheControl, 'no-store');
    }
    const ok = await postCoupon(origin, 'validate', { code: live, ...DEFAULT_JOB }, { userId: user });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.discount, 23.9);

    // The same rules gate redemption, not just validation.
    for (const code of [expired, future, paused]) {
      const result = await postCoupon(origin, 'redeem', { code, bookingId: `BOS-${randomUUID()}`, ...DEFAULT_JOB }, { userId: user });
      assert.equal(result.status, 422, code);
    }
    assert.equal((await redemptionRows(pool, live)).length, 0);
  });
});

test('minimum booking subtotal is measured on the server-priced subtotal', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const user = randomUUID();
    const minSubtotal = await createCoupon(pool, { min_subtotal: '500.00' });
    const boundary = await createCoupon(pool, { min_subtotal: '239.00' });

    const tooSmall = await postCoupon(origin, 'validate', { code: minSubtotal, ...DEFAULT_JOB }, { userId: user });
    assert.equal(tooSmall.status, 422);
    assert.equal(tooSmall.body.error, 'COUPON_MIN_SUBTOTAL');

    const atBoundary = await postCoupon(origin, 'validate', { code: boundary, ...DEFAULT_JOB }, { userId: user });
    assert.equal(atBoundary.status, 200);
    assert.equal(atBoundary.body.subtotal, 239);
  });
});

test('a client-supplied subtotal cannot change the discount or pass the minimum', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const user = randomUUID();
    const code = await createCoupon(pool, { min_subtotal: '200.00' });

    // ₹999,999 of invented subtotal buys nothing: the body price is ignored.
    const inflated = await postCoupon(origin, 'validate', {
      code, ...DEFAULT_JOB, subtotal: 999999, discount: 999999, discount_percent: 100, max_discount: 999999,
    }, { userId: user });
    assert.equal(inflated.status, 200);
    assert.equal(inflated.body.subtotal, 239);
    assert.equal(inflated.body.discount, 23.9);

    const bookingId = `BOS-${randomUUID()}`;
    const redeemed = await postCoupon(origin, 'redeem', {
      code, bookingId, ...DEFAULT_JOB, subtotal: 999999, discount: 999999,
    }, { userId: user });
    assert.equal(redeemed.status, 200);
    assert.equal(redeemed.body.discount, 23.9);

    const [row] = await redemptionRows(pool, code);
    assert.equal(Number(row.subtotal), 239);
    assert.equal(Number(row.discount), 23.9);
    assert.equal(row.booking_id, bookingId);
    assert.equal(String(row.user_id), user);

    // A genuinely small job cannot clear a ₹200 minimum by lying about price.
    const underMinimum = await postCoupon(origin, 'validate', {
      code, durationId: '1', helpers: 1, subtotal: 999999,
    }, { userId: randomUUID() });
    assert.equal(underMinimum.status, 422);
    assert.equal(underMinimum.body.error, 'COUPON_MIN_SUBTOTAL');
  });
});

test('global redemption limit and per-user limit are enforced', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const first = randomUUID();
    const second = randomUUID();
    const limited = await createCoupon(pool, { max_redemptions: 1 });

    const firstRedeem = await postCoupon(origin, 'redeem', {
      code: limited, bookingId: `BOS-${randomUUID()}`, ...DEFAULT_JOB,
    }, { userId: first });
    assert.equal(firstRedeem.status, 200);

    const secondRedeem = await postCoupon(origin, 'redeem', {
      code: limited, bookingId: `BOS-${randomUUID()}`, ...DEFAULT_JOB,
    }, { userId: second });
    assert.equal(secondRedeem.status, 422);
    assert.equal(secondRedeem.body.error, 'COUPON_LIMIT_REACHED');

    const secondValidate = await postCoupon(origin, 'validate', { code: limited, ...DEFAULT_JOB }, { userId: second });
    assert.equal(secondValidate.status, 422);
    assert.equal(secondValidate.body.error, 'COUPON_LIMIT_REACHED');

    const perUser = await createCoupon(pool);
    const firstBooking = `BOS-${randomUUID()}`;
    assert.equal((await postCoupon(origin, 'redeem', { code: perUser, bookingId: firstBooking, ...DEFAULT_JOB }, { userId: first })).status, 200);
    const again = await postCoupon(origin, 'redeem', { code: perUser, bookingId: `BOS-${randomUUID()}`, ...DEFAULT_JOB }, { userId: first });
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'COUPON_ALREADY_REDEEMED');
    assert.equal((await redemptionRows(pool, perUser)).length, 1);
  });
});

test('a booking discounted for one account cannot be claimed by another', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const owner = randomUUID();
    const stranger = randomUUID();
    const code = await createCoupon(pool);
    const bookingId = `BOS-${randomUUID()}`;

    assert.equal((await postCoupon(origin, 'redeem', { code, bookingId, ...DEFAULT_JOB }, { userId: owner })).status, 200);
    const stolen = await postCoupon(origin, 'redeem', { code, bookingId, ...DEFAULT_JOB }, { userId: stranger });
    assert.equal(stolen.status, 409);
    assert.equal(stolen.body.error, 'COUPON_BOOKING_ALREADY_DISCOUNTED');

    const rows = await redemptionRows(pool, code);
    assert.equal(rows.length, 1);
    assert.equal(String(rows[0].user_id), owner);
  });
});

test('a retried redemption is idempotent instead of double-counting', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const user = randomUUID();
    const code = await createCoupon(pool, { max_redemptions: 1 });
    const bookingId = `BOS-${randomUUID()}`;

    const first = await postCoupon(origin, 'redeem', { code, bookingId, ...DEFAULT_JOB }, { userId: user });
    assert.equal(first.status, 200);
    assert.equal(first.body.idempotent, undefined);

    const replay = await postCoupon(origin, 'redeem', { code, bookingId, ...DEFAULT_JOB }, { userId: user });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.idempotent, true);
    assert.equal(replay.body.discount, first.body.discount);
    assert.equal(replay.body.subtotal, first.body.subtotal);
    assert.equal((await redemptionRows(pool, code)).length, 1);
  });
});

test('only a signed-in customer can validate or redeem', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const code = await createCoupon(pool);
    const booking = { code, bookingId: `BOS-${randomUUID()}`, ...DEFAULT_JOB };

    const anonymous = await postCoupon(origin, 'validate', { code, ...DEFAULT_JOB });
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error, 'UNAUTHORIZED_SESSION');

    for (const role of ['provider', 'admin']) {
      const staff = await postCoupon(origin, 'redeem', booking, { userId: randomUUID(), role });
      assert.equal(staff.status, 401, role);
    }
    const nonUuid = await postCoupon(origin, 'validate', { code, ...DEFAULT_JOB }, { userId: 'not-a-uuid' });
    assert.equal(nonUuid.status, 401);
    assert.equal((await redemptionRows(pool, code)).length, 0);
  });
});

test('malformed and unbookable requests are rejected before any database work', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const user = randomUUID();
    const code = await createCoupon(pool);
    const bookingId = `BOS-${randomUUID()}`;

    const cases = [
      { code: 'ab', ...DEFAULT_JOB },
      { code: 'has space', ...DEFAULT_JOB },
      { code, durationId: '9', helpers: 1 },
      { code, durationId: '2', helpers: 0 },
      { code, durationId: '2', helpers: 12 },
      { code, durationId: '2', helpers: 2.5 },
      { code },
    ];
    for (const body of cases) {
      const result = await postCoupon(origin, 'validate', body, { userId: user });
      assert.equal(result.status, 400, JSON.stringify(body));
      assert.equal(result.body.error, 'INVALID_COUPON_INPUT');
    }
    for (const badBooking of [undefined, '', '!!', 'a'.repeat(200)]) {
      const result = await postCoupon(origin, 'redeem', { code, bookingId: badBooking, ...DEFAULT_JOB }, { userId: user });
      assert.equal(result.status, 400, String(badBooking));
    }
    assert.equal((await redemptionRows(pool, code)).length, 0);
    assert.ok(bookingId);
  });
});

test('a database outage fails closed with 503 instead of granting a discount', async () => {
  const failingPool = {
    async query() { throw new Error('connection refused'); },
    async connect() { throw new Error('connection refused'); },
  };
  const app = express();
  app.use(express.json());
  registerCouponApi(app, { pool: failingPool, verifySession });
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const user = randomUUID();
    for (const action of ['validate', 'redeem']) {
      const result = await postCoupon(origin, action, {
        code: 'HELPER10', ...DEFAULT_JOB, bookingId: `BOS-${randomUUID()}`,
      }, { userId: user });
      assert.equal(result.status, 503, action);
      assert.equal(result.body.error, 'COUPON_DATABASE_UNAVAILABLE');
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

/* --------------------------------------------------- database-level guards */

test('RLS, revoked grants and constraints protect the coupon tables', { skip: SKIP }, async (t) => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  t.after(async () => { await client.end(); });

  const policies = await client.query(
    `select count(*)::int as count from pg_policies
      where schemaname = 'public' and tablename in ('coupons', 'coupon_redemptions')`,
  );
  assert.equal(policies.rows[0].count, 0, 'no policy may expose coupon rows to a browser role');

  for (const role of ['authenticated', 'anon']) {
    for (const statement of [
      'select * from public.coupons',
      'select * from public.coupon_redemptions',
      "insert into public.coupon_redemptions (coupon_id, user_id, booking_id, subtotal, discount) values (gen_random_uuid(), gen_random_uuid(), 'BOS-1', 1, 1)",
      "update public.coupons set discount_percent = 100",
      'delete from public.coupon_redemptions',
    ]) {
      await client.query('begin');
      try {
        await client.query(`set local role ${role}`);
        await assert.rejects(() => client.query(statement), (error) => error.code === '42501', `${role}: ${statement}`);
      } finally {
        await client.query('rollback');
      }
    }
  }

  // Direct writes that bypass the API still cannot forge money or a booking id.
  const couponId = (
    await client.query(
      `insert into public.coupons (code, discount_percent) values ($1, 10) returning id`,
      [`SEC04${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`],
    )
  ).rows[0].id;
  try {
    await assert.rejects(
      () => client.query(
        `insert into public.coupon_redemptions (coupon_id, user_id, booking_id, subtotal, discount)
         values ($1, $2, 'BOS-direct', 100, 300)`,
        [couponId, randomUUID()],
      ),
      (error) => error.code === '23514',
      'discount above subtotal must be refused',
    );
    await assert.rejects(
      () => client.query(
        `insert into public.coupon_redemptions (coupon_id, user_id, booking_id, subtotal, discount)
         values ($1, $2, 'bad booking id %', 100, 10)`,
        [couponId, randomUUID()],
      ),
      (error) => error.code === '23514',
      'malformed booking ids must be refused',
    );
  } finally {
    await client.query('delete from public.coupons where id = $1', [couponId]);
  }
});

/* ------------------------------------------------------------- concurrency */

/** Fire `tasks` concurrently and keep every response. */
function parallel(tasks) {
  return Promise.all(tasks.map((task) => task()));
}

test('parallel redemptions cannot exceed the per-user limit', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const user = randomUUID();
    const code = await createCoupon(pool, { max_redemptions: null });
    const results = await parallel(
      Array.from({ length: 8 }, (_, index) => () => postCoupon(origin, 'redeem', {
        code, bookingId: `BOS-${user.slice(0, 8)}-${index}`, ...DEFAULT_JOB,
      }, { userId: user })),
    );
    const statuses = results.map((result) => result.status);
    assert.equal(statuses.filter((status) => status === 200).length, 1, statuses.join(','));
    assert.equal(statuses.filter((status) => status === 409).length, 7, statuses.join(','));
    for (const result of results.filter((entry) => entry.status === 409)) {
      assert.equal(result.body.error, 'COUPON_ALREADY_REDEEMED');
    }
    assert.equal((await redemptionRows(pool, code)).length, 1);
  });
});

test('parallel redemptions cannot exceed max_redemptions', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const code = await createCoupon(pool, { max_redemptions: 1 });
    const results = await parallel(
      Array.from({ length: 8 }, () => () => postCoupon(origin, 'redeem', {
        code, bookingId: `BOS-${randomUUID()}`, ...DEFAULT_JOB,
      }, { userId: randomUUID() })),
    );
    const statuses = results.map((result) => result.status);
    assert.equal(statuses.filter((status) => status === 200).length, 1, statuses.join(','));
    assert.equal(statuses.filter((status) => status === 422).length, 7, statuses.join(','));
    for (const result of results.filter((entry) => entry.status === 422)) {
      assert.equal(result.body.error, 'COUPON_LIMIT_REACHED');
    }
    assert.equal((await redemptionRows(pool, code)).length, 1);
  });
});

test('a hot limit of three is never exceeded by sixteen parallel redemptions', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const code = await createCoupon(pool, { max_redemptions: 3 });
    const results = await parallel(
      Array.from({ length: 16 }, () => () => postCoupon(origin, 'redeem', {
        code, bookingId: `BOS-${randomUUID()}`, ...DEFAULT_JOB,
      }, { userId: randomUUID() })),
    );
    const statuses = results.map((result) => result.status);
    assert.equal(statuses.filter((status) => status === 200).length, 3, statuses.join(','));
    assert.equal(statuses.filter((status) => status === 422).length, 13, statuses.join(','));
    assert.equal((await redemptionRows(pool, code)).length, 3);
  });
});

test('parallel claims on one booking keep a single owner and one discount', { skip: SKIP }, async () => {
  await runFixtures(async ({ origin, pool }) => {
    const code = await createCoupon(pool);
    const bookingId = `BOS-${randomUUID()}`;
    const users = Array.from({ length: 8 }, () => randomUUID());
    const results = await parallel(
      users.map((user) => () => postCoupon(origin, 'redeem', { code, bookingId, ...DEFAULT_JOB }, { userId: user })),
    );
    const successes = results.filter((result) => result.status === 200);
    assert.equal(successes.length, 1, results.map((result) => result.status).join(','));
    assert.equal(results.filter((result) => result.status === 409).length, 7);
    const rows = await redemptionRows(pool, code);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].booking_id, bookingId);
    assert.ok(users.includes(String(rows[0].user_id)));
  });
});

test('the unique indexes block a second redemption for a user or a booking', { skip: SKIP }, async (t) => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  t.after(async () => { await client.end(); });

  const code = `SEC04${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const { rows: [coupon] } = await client.query(
    `insert into public.coupons (code, discount_percent) values ($1, 10) returning id`,
    [code],
  );
  const firstUser = randomUUID();
  const secondUser = randomUUID();
  try {
    await client.query(
      `insert into public.coupon_redemptions (coupon_id, user_id, booking_id, subtotal, discount)
       values ($1, $2, 'BOS-unique-1', 100, 10)`,
      [coupon.id, firstUser],
    );

    // Same user, a different booking: the per-user index refuses it.
    await assert.rejects(
      () => client.query(
        `insert into public.coupon_redemptions (coupon_id, user_id, booking_id, subtotal, discount)
         values ($1, $2, 'BOS-unique-2', 100, 10)`,
        [coupon.id, firstUser],
      ),
      (error) => error.code === '23505' && error.constraint === 'coupon_redemptions_user_coupon_unique',
      'a user may hold only one redemption per coupon',
    );

    // Different user, the same booking: the booking index refuses it.
    await assert.rejects(
      () => client.query(
        `insert into public.coupon_redemptions (coupon_id, user_id, booking_id, subtotal, discount)
         values ($1, $2, 'BOS-unique-1', 100, 10)`,
        [coupon.id, secondUser],
      ),
      (error) => error.code === '23505' && error.constraint === 'coupon_redemptions_booking_unique',
      'a booking may carry only one discount',
    );

    const { rows } = await client.query(
      'select count(*)::int as count from public.coupon_redemptions where coupon_id = $1',
      [coupon.id],
    );
    assert.equal(rows[0].count, 1);
  } finally {
    await client.query('delete from public.coupon_redemptions where coupon_id = $1', [coupon.id]);
    await client.query('delete from public.coupons where id = $1', [coupon.id]);
  }
});

test('a failure inside the redemption transaction rolls back and fails closed', async () => {
  const statements = [];
  let released = false;
  const client = {
    async query(sql) {
      statements.push(String(sql).trim());
      const text = String(sql);
      if (/^select id, discount_percent/i.test(text.trim())) {
        return {
          rows: [{
            id: '00000000-0000-0000-0000-000000000001',
            discount_percent: '10.00',
            min_subtotal: '0.00',
            max_discount: null,
            max_redemptions: null,
          }],
        };
      }
      if (/from public\.coupon_redemptions\s+where coupon_id = \$1 and \(user_id/i.test(text)) return { rows: [] };
      if (/^select count\(\*\)::int as count/i.test(text.trim())) return { rows: [{ count: 0 }] };
      if (/^insert into public\.coupon_redemptions/i.test(text.trim())) throw new Error('connection reset by peer');
      return { rows: [] };
    },
    release() { released = true; },
  };
  const pool = {
    async query() { throw new Error('unexpected pool query'); },
    async connect() { return client; },
  };
  const app = express();
  app.use(express.json());
  registerCouponApi(app, { pool, verifySession });
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await postCoupon(origin, 'redeem', {
      code: 'HELPER10', bookingId: `BOS-${randomUUID()}`, ...DEFAULT_JOB,
    }, { userId: randomUUID() });
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'COUPON_DATABASE_UNAVAILABLE');
    assert.equal(statements[0], 'begin');
    assert.ok(statements.includes('rollback'), 'the aborted transaction is rolled back');
    assert.equal(statements.includes('commit'), false, 'a failed redemption never commits');
    assert.equal(released, true, 'the pooled client is returned');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

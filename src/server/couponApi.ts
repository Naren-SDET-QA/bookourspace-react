import type express from 'express';
import type { Pool } from 'pg';
import { couponDiscountPaise, numericToHundredths } from '../lib/couponMath';
import { helperSubtotalPaise } from '../lib/helperPricing';

/**
 * SEC-04 — customer coupons.
 *
 * Two rules drive this file:
 *
 * 1. The browser never supplies money. The subtotal is priced from
 *    `src/lib/helperPricing.ts` (the same table the UI renders), and the
 *    discount is derived from `coupons` inside PostgreSQL.
 * 2. A redemption is a serialized, idempotent transaction. The coupon row is
 *    locked before the limit count, so parallel redemptions cannot both pass the
 *    check; the unique indexes are the second line of defence; and a retry of
 *    the same (coupon, user, booking) returns the stored result instead of an
 *    error, so a network retry can never leave a paid booking undiscounted or
 *    double-redeemed.
 */

type CouponActor = { userId: string; role: 'customer' | 'provider' | 'admin' };
type VerifySession = (request: express.Request) => CouponActor | null;

const COUPON_CODE = /^[A-Z0-9_-]{3,64}$/;
const BOOKING_ID = /^[A-Za-z0-9_-]{3,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A refusal with an HTTP status and a stable machine-readable code. */
class CouponRefusal extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

type CouponRow = {
  id: string;
  discount_percent: string;
  min_subtotal: string;
  max_discount: string | null;
  max_redemptions: number | null;
  redemption_count?: number;
  already_redeemed?: boolean;
};

type RedemptionRow = {
  user_id: string;
  booking_id: string;
  subtotal: string;
  discount: string;
};

function send(response: express.Response, status: number, payload: Record<string, unknown>): void {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(payload);
}

/** Only a signed-in customer can hold a redemption; a staff role cannot. */
function customerActor(actor: CouponActor | null): actor is CouponActor {
  return Boolean(actor && actor.role === 'customer' && UUID.test(String(actor.userId)));
}

function readCode(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase();
  return COUPON_CODE.test(code) ? code : null;
}

function readBookingId(value: unknown): string | null {
  const bookingId = String(value ?? '').trim();
  return BOOKING_ID.test(bookingId) ? bookingId : null;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
}

/**
 * Apply every server-side coupon rule to an already-priced subtotal. Throws a
 * `CouponRefusal` so both endpoints report the same reason for the same state.
 */
function priceCoupon(input: {
  coupon: CouponRow;
  subtotalPaise: number;
  redemptionCount: number;
  alreadyRedeemed: boolean;
}): number {
  const { coupon, subtotalPaise, redemptionCount, alreadyRedeemed } = input;
  if (alreadyRedeemed) throw new CouponRefusal(422, 'COUPON_ALREADY_REDEEMED');
  const minimumPaise = numericToHundredths(coupon.min_subtotal);
  if (minimumPaise === null || subtotalPaise < minimumPaise) throw new CouponRefusal(422, 'COUPON_MIN_SUBTOTAL');
  const limit = coupon.max_redemptions === null ? null : Number(coupon.max_redemptions);
  if (limit !== null && Number.isFinite(limit) && redemptionCount >= limit) {
    throw new CouponRefusal(422, 'COUPON_LIMIT_REACHED');
  }
  const discountPaise = couponDiscountPaise({
    subtotalPaise,
    discountPercent: coupon.discount_percent,
    maxDiscount: coupon.max_discount,
  });
  if (discountPaise === null) throw new CouponRefusal(422, 'COUPON_INVALID');
  return discountPaise;
}

/** A raced insert can still lose to a completed one; answer from the stored row. */
async function storedRedemption(
  pool: Pool,
  userId: string,
  bookingId: string,
): Promise<RedemptionRow | null> {
  const { rows } = await pool.query(
    `select user_id, booking_id, subtotal, discount
       from public.coupon_redemptions
      where booking_id = $1 and user_id = $2::uuid
      limit 1`,
    [bookingId, userId],
  );
  return (rows[0] as RedemptionRow | undefined) ?? null;
}

export function registerCouponApi(app: express.Express, deps: { pool: Pool; verifySession: VerifySession }): void {
  app.post('/api/coupons/validate', async (request, response) => {
    const actor = deps.verifySession(request);
    if (!customerActor(actor)) return send(response, 401, { ok: false, error: 'UNAUTHORIZED_SESSION' });
    const code = readCode(request.body?.code);
    const subtotalPaise = helperSubtotalPaise({
      durationId: request.body?.durationId,
      helpers: request.body?.helpers,
    });
    if (!code || subtotalPaise === null) {
      return send(response, 400, { ok: false, error: 'INVALID_COUPON_INPUT' });
    }
    try {
      const { rows } = await deps.pool.query(
        `select c.id, c.discount_percent, c.min_subtotal, c.max_discount, c.max_redemptions,
                (select count(*)::int from public.coupon_redemptions r where r.coupon_id = c.id) as redemption_count,
                exists(select 1 from public.coupon_redemptions r where r.coupon_id = c.id and r.user_id = $2::uuid) as already_redeemed
           from public.coupons c
          where c.code = $1 and c.active and c.starts_at <= now()
            and (c.expires_at is null or c.expires_at > now())
          limit 1`,
        [code, actor.userId],
      );
      const coupon = rows[0] as CouponRow | undefined;
      if (!coupon) throw new CouponRefusal(422, 'COUPON_INVALID');
      const discountPaise = priceCoupon({
        coupon,
        subtotalPaise,
        redemptionCount: Number(coupon.redemption_count || 0),
        alreadyRedeemed: coupon.already_redeemed === true,
      });
      return send(response, 200, {
        ok: true,
        code,
        subtotal: subtotalPaise / 100,
        discount: discountPaise / 100,
      });
    } catch (error) {
      if (error instanceof CouponRefusal) return send(response, error.status, { ok: false, error: error.code });
      return send(response, 503, { ok: false, error: 'COUPON_DATABASE_UNAVAILABLE' });
    }
  });

  app.post('/api/coupons/redeem', async (request, response) => {
    const actor = deps.verifySession(request);
    if (!customerActor(actor)) return send(response, 401, { ok: false, error: 'UNAUTHORIZED_SESSION' });
    const code = readCode(request.body?.code);
    const bookingId = readBookingId(request.body?.bookingId);
    const subtotalPaise = helperSubtotalPaise({
      durationId: request.body?.durationId,
      helpers: request.body?.helpers,
    });
    if (!code || !bookingId || subtotalPaise === null) {
      return send(response, 400, { ok: false, error: 'INVALID_COUPON_INPUT' });
    }

    let client;
    try {
      client = await deps.pool.connect();
    } catch {
      return send(response, 503, { ok: false, error: 'COUPON_DATABASE_UNAVAILABLE' });
    }

    try {
      await client.query('begin');
      // The lock serializes every redemption of this coupon, so the limit count
      // below cannot be read from a snapshot that another transaction also read.
      const couponResult = await client.query(
        `select id, discount_percent, min_subtotal, max_discount, max_redemptions
           from public.coupons
          where code = $1 and active and starts_at <= now()
            and (expires_at is null or expires_at > now())
          for update`,
        [code],
      );
      const coupon = couponResult.rows[0] as CouponRow | undefined;
      if (!coupon) throw new CouponRefusal(422, 'COUPON_INVALID');

      // Idempotency and booking ownership, read under the same lock.
      const existing = await client.query(
        `select user_id, booking_id, subtotal, discount
           from public.coupon_redemptions
          where coupon_id = $1 and (user_id = $2::uuid or booking_id = $3)`,
        [coupon.id, actor.userId, bookingId],
      );
      const rows = existing.rows as RedemptionRow[];
      const own = rows.find((row) => String(row.user_id) === actor.userId);
      if (own) {
        if (String(own.booking_id) !== bookingId) throw new CouponRefusal(409, 'COUPON_ALREADY_REDEEMED');
        const replay = {
          ok: true,
          code,
          subtotal: Number(own.subtotal),
          discount: Number(own.discount),
          idempotent: true,
        };
        await client.query('commit');
        return send(response, 200, replay);
      }
      if (rows.length > 0) throw new CouponRefusal(409, 'COUPON_BOOKING_ALREADY_DISCOUNTED');

      const count = await client.query(
        'select count(*)::int as count from public.coupon_redemptions where coupon_id = $1',
        [coupon.id],
      );
      const discountPaise = priceCoupon({
        coupon,
        subtotalPaise,
        redemptionCount: Number((count.rows[0] as { count: number }).count),
        alreadyRedeemed: false,
      });

      await client.query(
        `insert into public.coupon_redemptions (coupon_id, user_id, booking_id, subtotal, discount)
         values ($1, $2::uuid, $3, $4, $5)`,
        [
          coupon.id,
          actor.userId,
          bookingId,
          (subtotalPaise / 100).toFixed(2),
          (discountPaise / 100).toFixed(2),
        ],
      );
      await client.query('commit');
      return send(response, 200, {
        ok: true,
        code,
        subtotal: subtotalPaise / 100,
        discount: discountPaise / 100,
      });
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      if (error instanceof CouponRefusal) return send(response, error.status, { ok: false, error: error.code });
      if (isUniqueViolation(error)) {
        const stored = await storedRedemption(deps.pool, actor.userId, bookingId).catch(() => null);
        if (stored) {
          return send(response, 200, {
            ok: true,
            code,
            subtotal: Number(stored.subtotal),
            discount: Number(stored.discount),
            idempotent: true,
          });
        }
        return send(response, 409, { ok: false, error: 'COUPON_BOOKING_ALREADY_DISCOUNTED' });
      }
      return send(response, 503, { ok: false, error: 'COUPON_DATABASE_UNAVAILABLE' });
    } finally {
      client.release();
    }
  });
}

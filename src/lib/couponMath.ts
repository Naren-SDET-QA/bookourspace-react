/**
 * Exact coupon arithmetic in paise.
 *
 * Every money column is `numeric(12,2)` and arrives from PostgreSQL as a string;
 * converting through binary floating point first would let a 33.33% discount on
 * ₹239.00 round in either direction depending on the platform. Everything below
 * works on integers (paise and hundredths of a percent), so the result is the
 * same on every host.
 */

/** Parse a non-negative `numeric(12,2)` value into hundredths (₹1.00 → 100). */
export function numericToHundredths(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
}

export function couponDiscountPaise(input: {
  subtotalPaise: number;
  /** `coupons.discount_percent` as returned by PostgreSQL. */
  discountPercent: unknown;
  /** `coupons.max_discount` as returned by PostgreSQL, or null. */
  maxDiscount: unknown;
}): number | null {
  const { subtotalPaise } = input;
  if (!Number.isInteger(subtotalPaise) || subtotalPaise < 0) return null;
  const percentHundredths = numericToHundredths(input.discountPercent);
  if (percentHundredths === null || percentHundredths <= 0 || percentHundredths > 10_000) return null;
  const raw = Math.round((subtotalPaise * percentHundredths) / 10_000);
  const cap = input.maxDiscount === null || input.maxDiscount === undefined
    ? Number.POSITIVE_INFINITY
    : numericToHundredths(input.maxDiscount);
  if (cap === null) return null;
  return Math.max(0, Math.min(raw, cap, subtotalPaise));
}

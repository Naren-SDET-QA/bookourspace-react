/**
 * Server-of-record pricing for the "Need Helper" journey.
 *
 * SEC-04: the coupon API prices a booking from this table instead of trusting a
 * subtotal supplied by the browser, so a client cannot choose the amount a
 * percentage discount is calculated against. `HelperJourney` imports the same
 * table, so the quoted total and the server's discount cannot drift apart.
 */

export interface HelperDuration {
  /** Stable identifier the booking form submits. */
  id: string;
  hours: number;
}

export const HELPER_DURATIONS: readonly HelperDuration[] = [
  { id: '1', hours: 1 },
  { id: '2', hours: 2 },
  { id: '3', hours: 3 },
  { id: '4', hours: 8 },
];

/** ₹99 / hour, in paise. */
export const HELPER_HOURLY_RATE_PAISE = 9_900;
export const HELPER_PLATFORM_FEE_PAISE = 2_900;
export const HELPER_CONVENIENCE_FEE_PAISE = 1_200;
export const HELPER_MAX_HELPERS = 10;

export function helperDurationHours(durationId: unknown): number | null {
  const id = String(durationId ?? '').trim();
  const match = HELPER_DURATIONS.find((entry) => entry.id === id);
  return match ? match.hours : null;
}

export function helperCount(helpers: unknown): number | null {
  const count = typeof helpers === 'number' ? helpers : Number(String(helpers ?? '').trim());
  if (!Number.isInteger(count) || count < 1 || count > HELPER_MAX_HELPERS) return null;
  return count;
}

/**
 * Authoritative subtotal in paise, or null when the request does not describe a
 * bookable helper job. Unknown durations, fractional/free/oversized helper
 * counts and missing fields are all refused rather than priced.
 */
export function helperSubtotalPaise(input: { durationId?: unknown; helpers?: unknown }): number | null {
  const hours = helperDurationHours(input?.durationId);
  const helpers = helperCount(input?.helpers);
  if (hours === null || helpers === null) return null;
  return hours * helpers * HELPER_HOURLY_RATE_PAISE
    + HELPER_PLATFORM_FEE_PAISE
    + HELPER_CONVENIENCE_FEE_PAISE;
}

export function helperSubtotalRupees(input: { durationId?: unknown; helpers?: unknown }): number | null {
  const paise = helperSubtotalPaise(input);
  return paise === null ? null : paise / 100;
}

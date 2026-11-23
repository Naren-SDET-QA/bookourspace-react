-- SEC-04 defence in depth. The API is the only intended writer, and the
-- database now refuses a redemption row that claims more discount than the
-- subtotal it was calculated from, or a booking reference the API would have
-- rejected. Redemption rows stay append-only for every client-facing role so an
-- audit trail cannot be rewritten by a browser session.

alter table public.coupon_redemptions
  drop constraint if exists coupon_redemptions_discount_le_subtotal;
alter table public.coupon_redemptions
  add constraint coupon_redemptions_discount_le_subtotal check (discount <= subtotal);

alter table public.coupon_redemptions
  drop constraint if exists coupon_redemptions_booking_id_format;
alter table public.coupon_redemptions
  add constraint coupon_redemptions_booking_id_format
  check (booking_id ~ '^[A-Za-z0-9_-]{3,128}$');

revoke all on public.coupons from anon, authenticated;
revoke all on public.coupon_redemptions from anon, authenticated;

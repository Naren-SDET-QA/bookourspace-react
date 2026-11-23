-- SEC-04: coupon discounts are server-owned and redemptions are idempotently
-- unique per user and coupon.  The API is the only intended write path.
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_percent numeric(5,2) not null,
  min_subtotal numeric(12,2) not null default 0,
  max_discount numeric(12,2),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  max_redemptions integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint coupons_code_normalized check (code = upper(trim(code))),
  constraint coupons_discount_percent_check check (discount_percent > 0 and discount_percent <= 100),
  constraint coupons_min_subtotal_check check (min_subtotal >= 0),
  constraint coupons_max_discount_check check (max_discount is null or max_discount >= 0),
  constraint coupons_redemptions_check check (max_redemptions is null or max_redemptions > 0)
);
create unique index if not exists coupons_code_unique on public.coupons (code);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  user_id uuid not null,
  booking_id text not null,
  subtotal numeric(12,2) not null,
  discount numeric(12,2) not null,
  redeemed_at timestamptz not null default now(),
  constraint coupon_redemptions_subtotal_check check (subtotal >= 0),
  constraint coupon_redemptions_discount_check check (discount >= 0)
);
create unique index if not exists coupon_redemptions_user_coupon_unique
  on public.coupon_redemptions (coupon_id, user_id);
create unique index if not exists coupon_redemptions_booking_unique
  on public.coupon_redemptions (booking_id);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
revoke all on public.coupons from anon, authenticated;
revoke all on public.coupon_redemptions from anon, authenticated;

-- The helper journey's launch offer is data, not client code. Operators can
-- deactivate or replace it without shipping a frontend change.
insert into public.coupons (code, discount_percent, max_discount)
values ('HELPER10', 10, null)
on conflict (code) do nothing;

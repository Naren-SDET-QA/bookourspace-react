-- ============================================================================
-- SUPABASE POSTGRESQL SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- Run this script in your Supabase SQL Editor.
-- All database operations require authenticated access and enforce RLS.
-- ============================================================================

-- 1. PROFILES TABLE (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'provider', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Automatic profile creation trigger on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Marketplace User'),
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. LISTINGS TABLE (PGs, Hostels, Venues, Movies, Services, Classes)
CREATE TABLE IF NOT EXISTS public.listings (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category_id TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  price_unit TEXT NOT NULL DEFAULT 'per month',
  status TEXT NOT NULL DEFAULT 'pending_approval',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active listings are viewable by everyone, owners view own" ON public.listings;
CREATE POLICY "Active listings are viewable by everyone, owners view own"
  ON public.listings FOR SELECT
  USING (status = 'active' OR auth.uid() = owner_id);

DROP POLICY IF EXISTS "Authenticated users can create their own listings" ON public.listings;
CREATE POLICY "Authenticated users can create their own listings"
  ON public.listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update their own listings" ON public.listings;
CREATE POLICY "Owners can update their own listings"
  ON public.listings FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete their own listings" ON public.listings;
CREATE POLICY "Owners can delete their own listings"
  ON public.listings FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);


-- 3. BOOKINGS TABLE (Protected by RLS for Authenticated Users)
CREATE TABLE IF NOT EXISTS public.bookings (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  listing_title TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view their own bookings" ON public.bookings;
CREATE POLICY "Authenticated users can view their own bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can create their own bookings" ON public.bookings;
CREATE POLICY "Authenticated users can create their own bookings"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can update their own bookings" ON public.bookings;
CREATE POLICY "Authenticated users can update their own bookings"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 4. ENQUIRIES TABLE (Protected by RLS for Authenticated Users)
CREATE TABLE IF NOT EXISTS public.enquiries (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  listing_title TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view their own enquiries" ON public.enquiries;
CREATE POLICY "Authenticated users can view their own enquiries"
  ON public.enquiries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can create enquiries" ON public.enquiries;
CREATE POLICY "Authenticated users can create enquiries"
  ON public.enquiries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- 5. REVIEWS TABLE (Public Read, Authenticated Insert/Update/Delete via RLS)
CREATE TABLE IF NOT EXISTS public.reviews (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  rating NUMERIC NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
CREATE POLICY "Reviews are viewable by everyone"
  ON public.reviews FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert their own reviews" ON public.reviews;
CREATE POLICY "Authenticated users can insert their own reviews"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can update their own reviews" ON public.reviews;
CREATE POLICY "Authenticated users can update their own reviews"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can delete their own reviews" ON public.reviews;
CREATE POLICY "Authenticated users can delete their own reviews"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- 6. TRANSACTIONS TABLE (Strict Owner RLS)
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tx_type TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  invoice_number TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  tx_date TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;
CREATE POLICY "Users can view their own transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own transactions" ON public.transactions;
CREATE POLICY "Users can insert their own transactions"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- 7. USER FAVORITES TABLE (Strict Owner RLS)
CREATE TABLE IF NOT EXISTS public.user_favorites (
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own favorites" ON public.user_favorites;
CREATE POLICY "Users can view their own favorites"
  ON public.user_favorites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own favorites" ON public.user_favorites;
CREATE POLICY "Users can insert their own favorites"
  ON public.user_favorites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own favorites" ON public.user_favorites;
CREATE POLICY "Users can delete their own favorites"
  ON public.user_favorites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS policies do not grant table privileges. Without these, signed-in stay
-- wishlist sync fails with "permission denied for table user_favorites" on a
-- locally built database that has no Supabase default privileges.
GRANT SELECT, INSERT, DELETE ON public.user_favorites TO authenticated;


-- 8. USER & ADMIN MODULE CONFIGURATIONS TABLE (Strict Owner RLS for All App Modules)
CREATE TABLE IF NOT EXISTS public.user_module_configs (
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  config_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, module_key)
);

ALTER TABLE public.user_module_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own module configs" ON public.user_module_configs;
CREATE POLICY "Users can view their own module configs"
  ON public.user_module_configs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own module configs" ON public.user_module_configs;
CREATE POLICY "Users can insert their own module configs"
  ON public.user_module_configs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own module configs" ON public.user_module_configs;
CREATE POLICY "Users can update their own module configs"
  ON public.user_module_configs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own module configs" ON public.user_module_configs;
CREATE POLICY "Users can delete their own module configs"
  ON public.user_module_configs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ============================================================================
-- 9. PRODUCTION HARDENING MIGRATION (NON-DESTRUCTIVE / ADDITIVE)
--    - Prevent Role Self-Escalation on public.profiles
--    - Atomic Seat Locks with UNIQUE (listing_id, show_date, show_time, seat_id)
--    - Booking Idempotency Keys & Cryptographic QR Signatures
--    - Server-Side UPI Payment Verification Ledger (UTR Anti-Replay)
--    - Customer / Provider / Admin Role Isolation RLS Policies
-- ============================================================================

-- Helper function to check if the current authenticated user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Prevent regular users from self-escalating their own role to 'admin'
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
      OR public.is_admin()
    )
  );

-- Additive columns on public.bookings for idempotency, payment verification, and QR signing
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pay_later'
  CHECK (payment_status IN ('pay_later', 'pending_verification', 'verified', 'failed', 'refunded'));
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_utr TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS qr_signature TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS qr_pass_token TEXT;

-- Customer / Provider / Admin isolation on bookings
DROP POLICY IF EXISTS "Providers can view bookings for their listings" ON public.bookings;
CREATE POLICY "Providers can view bookings for their listings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    provider_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = public.bookings.listing_id
        AND l.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Providers and admins can update booking status" ON public.bookings;
CREATE POLICY "Providers and admins can update booking status"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    provider_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = public.bookings.listing_id
        AND l.owner_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    provider_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = public.bookings.listing_id
        AND l.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Customer / Provider / Admin isolation on enquiries
DROP POLICY IF EXISTS "Providers and admins can view enquiries for their listings" ON public.enquiries;
CREATE POLICY "Providers and admins can view enquiries for their listings"
  ON public.enquiries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = public.enquiries.listing_id
        AND l.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Admins can manage all listings (approve/reject pending_approval listings)
DROP POLICY IF EXISTS "Admins can manage all listings" ON public.listings;
CREATE POLICY "Admins can manage all listings"
  ON public.listings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 9A. AUTHORITATIVE SEAT LOCKS TABLE (Prevents Double-Booking Concurrent Seats)
CREATE TABLE IF NOT EXISTS public.seat_locks (
  id TEXT PRIMARY KEY DEFAULT ('lock-' || gen_random_uuid()::text),
  listing_id TEXT NOT NULL,
  show_date TEXT NOT NULL,
  show_time TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'booked')),
  booking_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, show_date, show_time, seat_id)
);

ALTER TABLE public.seat_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active seat locks" ON public.seat_locks;
CREATE POLICY "Anyone can view active seat locks"
  ON public.seat_locks FOR SELECT
  TO anon, authenticated
  USING (status = 'booked' OR expires_at > NOW());

DROP POLICY IF EXISTS "Authenticated users can hold own seats" ON public.seat_locks;
CREATE POLICY "Authenticated users can hold own seats"
  ON public.seat_locks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can update own seat locks" ON public.seat_locks;
CREATE POLICY "Authenticated users can update own seat locks"
  ON public.seat_locks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- 9B. SERVER-SIDE UPI PAYMENT VERIFICATION LEDGER (UTR Anti-Replay & Settlement)
CREATE TABLE IF NOT EXISTS public.payment_verifications (
  id TEXT PRIMARY KEY DEFAULT ('pay-' || gen_random_uuid()::text),
  intent_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  merchant_vpa TEXT NOT NULL,
  utr_number TEXT UNIQUE,
  gateway_signature TEXT,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'pending_reconciliation', 'verified', 'rejected')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own payment verifications" ON public.payment_verifications;
CREATE POLICY "Users can view own payment verifications"
  ON public.payment_verifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- 9C. ATOMIC PL/pgSQL RPC: HOLD MOVIE SEATS WITH ROW-LEVEL CONFLICT DETECTION
CREATE OR REPLACE FUNCTION public.hold_movie_seats_atomic(
  p_listing_id TEXT,
  p_show_date TEXT,
  p_show_time TEXT,
  p_seats TEXT[],
  p_session_id TEXT,
  p_ttl_seconds INT DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seat TEXT;
  v_conflict_seats TEXT[] := '{}';
  v_expires TIMESTAMPTZ := NOW() + make_interval(secs => GREATEST(60, p_ttl_seconds));
BEGIN
  -- 1. Purge expired temporary holds for this show
  DELETE FROM public.seat_locks
  WHERE listing_id = p_listing_id
    AND show_date = p_show_date
    AND show_time = p_show_time
    AND status = 'held'
    AND expires_at <= NOW();

  -- 2. Check for any conflicts (seats already booked or held by another session)
  SELECT array_agg(seat_id)
  INTO v_conflict_seats
  FROM public.seat_locks
  WHERE listing_id = p_listing_id
    AND show_date = p_show_date
    AND show_time = p_show_time
    AND seat_id = ANY(p_seats)
    AND (
      status = 'booked'
      OR (status = 'held' AND session_id <> p_session_id AND expires_at > NOW())
    );

  IF v_conflict_seats IS NOT NULL AND array_length(v_conflict_seats, 1) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'SEAT_CONFLICT',
      'conflictingSeats', v_conflict_seats
    );
  END IF;

  -- 3. Atomically upsert holds for each requested seat
  FOREACH v_seat IN ARRAY p_seats LOOP
    INSERT INTO public.seat_locks (
      listing_id, show_date, show_time, seat_id, user_id, session_id, status, expires_at
    )
    VALUES (
      p_listing_id, p_show_date, p_show_time, v_seat, auth.uid(), p_session_id, 'held', v_expires
    )
    ON CONFLICT (listing_id, show_date, show_time, seat_id)
    DO UPDATE SET
      expires_at = EXCLUDED.expires_at,
      user_id = COALESCE(EXCLUDED.user_id, public.seat_locks.user_id)
    WHERE public.seat_locks.status = 'held'
      AND public.seat_locks.session_id = p_session_id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'listingId', p_listing_id,
    'showDate', p_show_date,
    'showTime', p_show_time,
    'heldSeats', p_seats,
    'expiresAt', v_expires
  );
END;
$$;

-- 9D. ATOMIC PL/pgSQL RPC: CREATE BOOKING WITH IDEMPOTENCY & SEAT LOCK COMMIT
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  p_booking_id TEXT,
  p_idempotency_key TEXT,
  p_listing_id TEXT,
  p_listing_title TEXT,
  p_provider_id TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_address TEXT,
  p_scheduled_date TEXT,
  p_time_slot TEXT,
  p_total_amount NUMERIC,
  p_payment_status TEXT DEFAULT 'pay_later',
  p_payment_utr TEXT DEFAULT NULL,
  p_qr_signature TEXT DEFAULT NULL,
  p_qr_pass_token TEXT DEFAULT NULL,
  p_seats TEXT[] DEFAULT NULL,
  p_show_time TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_seat TEXT;
  v_conflict_seats TEXT[] := '{}';
BEGIN
  -- 1. Idempotency check: if idempotency_key already exists, return the original booking
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT * INTO v_existing
    FROM public.bookings
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotentReplay', true,
        'bookingId', v_existing.id,
        'status', v_existing.status,
        'paymentStatus', v_existing.payment_status,
        'qrPassToken', v_existing.qr_pass_token
      );
    END IF;
  END IF;

  -- 2. If movie seats are provided, atomically lock & transition them to 'booked'
  IF p_seats IS NOT NULL AND array_length(p_seats, 1) > 0 THEN
    DELETE FROM public.seat_locks
    WHERE listing_id = p_listing_id
      AND show_date = p_scheduled_date
      AND show_time = COALESCE(p_show_time, p_time_slot)
      AND status = 'held'
      AND expires_at <= NOW();

    SELECT array_agg(seat_id)
    INTO v_conflict_seats
    FROM public.seat_locks
    WHERE listing_id = p_listing_id
      AND show_date = p_scheduled_date
      AND show_time = COALESCE(p_show_time, p_time_slot)
      AND seat_id = ANY(p_seats)
      AND (
        status = 'booked'
        OR (status = 'held' AND session_id <> COALESCE(p_session_id, '') AND expires_at > NOW())
      );

    IF v_conflict_seats IS NOT NULL AND array_length(v_conflict_seats, 1) > 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'SEAT_ALREADY_BOOKED',
        'conflictingSeats', v_conflict_seats
      );
    END IF;

    FOREACH v_seat IN ARRAY p_seats LOOP
      INSERT INTO public.seat_locks (
        listing_id, show_date, show_time, seat_id, user_id, session_id, status, booking_id, expires_at
      )
      VALUES (
        p_listing_id,
        p_scheduled_date,
        COALESCE(p_show_time, p_time_slot),
        v_seat,
        auth.uid(),
        COALESCE(p_session_id, 'direct'),
        'booked',
        p_booking_id,
        NOW() + INTERVAL '365 days'
      )
      ON CONFLICT (listing_id, show_date, show_time, seat_id)
      DO UPDATE SET
        status = 'booked',
        booking_id = EXCLUDED.booking_id,
        expires_at = EXCLUDED.expires_at
      WHERE public.seat_locks.status = 'held'
        AND public.seat_locks.session_id = COALESCE(p_session_id, '');

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SEAT_ALREADY_BOOKED:%', v_seat;
      END IF;
    END LOOP;
  END IF;

  -- 3. Insert authoritative booking row
  INSERT INTO public.bookings (
    id,
    user_id,
    idempotency_key,
    listing_id,
    listing_title,
    provider_id,
    customer_name,
    customer_phone,
    customer_address,
    scheduled_date,
    time_slot,
    total_amount,
    status,
    payment_status,
    payment_utr,
    qr_signature,
    qr_pass_token,
    notes
  )
  VALUES (
    p_booking_id,
    auth.uid(),
    NULLIF(trim(COALESCE(p_idempotency_key, '')), ''),
    p_listing_id,
    p_listing_title,
    p_provider_id,
    p_customer_name,
    p_customer_phone,
    p_customer_address,
    p_scheduled_date,
    p_time_slot,
    p_total_amount,
    'confirmed',
    COALESCE(p_payment_status, 'pay_later'),
    p_payment_utr,
    p_qr_signature,
    p_qr_pass_token,
    p_notes
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotentReplay', false,
    'bookingId', p_booking_id,
    'status', 'confirmed',
    'paymentStatus', COALESCE(p_payment_status, 'pay_later'),
    'qrPassToken', p_qr_pass_token
  );
END;
$$;

-- 9E. ATOMIC STAY CANCELLATION (RLS-SAFE, NO REFUND SUCCESS CLAIM)
-- The provider webhook/reconciliation job must update payment_status to 'refunded'
-- after settlement. This function only records the customer-owned cancellation and
-- the refund initiation metadata in the existing booking payload JSONB.
CREATE OR REPLACE FUNCTION public.cancel_booking_atomic(
  p_booking_id TEXT,
  p_reason TEXT DEFAULT 'Customer requested cancellation',
  p_refund_amount NUMERIC DEFAULT 0,
  p_refund_status TEXT DEFAULT 'none'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED_SESSION');
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled',
    payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
      'cancelledAt', NOW(),
      'cancellationReason', LEFT(COALESCE(p_reason, 'Customer requested cancellation'), 240),
      'refundAmount', GREATEST(0, COALESCE(p_refund_amount, 0)),
      'refundStatus', CASE
        WHEN p_refund_status IN ('none', 'initiated', 'completed') THEN p_refund_status
        ELSE 'none'
      END
    )
  WHERE id = p_booking_id
    AND user_id = auth.uid()
    AND status <> 'cancelled'
  RETURNING id, status, payment_status, payload INTO v_booking;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'BOOKING_NOT_FOUND_OR_NOT_OWNED'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'bookingId', v_booking.id,
    'status', v_booking.status,
    'paymentStatus', v_booking.payment_status,
    'payload', v_booking.payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking_atomic(TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_booking_atomic(TEXT, TEXT, NUMERIC, TEXT) TO authenticated;


-- ============================================================================
-- 10. GOOGLE-ONLY OAUTH, ACCOUNT BLOCKING, NOTIFICATIONS & REALTIME MIGRATION
-- ============================================================================

-- 10A. Additive Google OAuth & Account Blocking Columns on public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active', 'suspended', 'blocked', 'pending_verification'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Hyderabad';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT NOW();

-- Helper function: returns TRUE only if the authenticated user is active (not blocked or suspended)
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.account_status NOT IN ('suspended', 'blocked')
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ),
    true
  );
$$;

-- Profile rows contain private contact details. Authenticated users can read
-- their own row here; the later profile privacy migration adds booking-party
-- access and a safe public provider projection.
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR (public.is_admin() AND public.is_active_user()));

-- Update handle_new_user() trigger: new Google users always begin as customers.
-- Automatically creates a Customer profile ('customer') for new Google OAuth users
-- (unless super admin allowlist) and strictly preserves existing roles and data on conflict.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    phone,
    role,
    google_sub,
    avatar_url,
    account_status,
    verified,
    last_login_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, 'User'), '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'customer',
    COALESCE(NEW.raw_user_meta_data->>'sub', NEW.raw_user_meta_data->>'provider_id'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    'active',
    true,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
    google_sub = COALESCE(EXCLUDED.google_sub, public.profiles.google_sub),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    last_login_at = NOW(),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Enforce account_status blocking on profiles update & allow Admin full user management
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((auth.uid() = id AND public.is_active_user()) OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (
      auth.uid() = id
      AND public.is_active_user()
      AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
      AND account_status = (SELECT p.account_status FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- Enforce active account check on listings mutations (blocked providers cannot insert/update listings)
DROP POLICY IF EXISTS "Authenticated users can create their own listings" ON public.listings;
CREATE POLICY "Authenticated users can create their own listings"
  ON public.listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id AND public.is_active_user());

DROP POLICY IF EXISTS "Owners can update their own listings" ON public.listings;
CREATE POLICY "Owners can update their own listings"
  ON public.listings FOR UPDATE
  TO authenticated
  USING ((auth.uid() = owner_id AND public.is_active_user()) OR public.is_admin())
  WITH CHECK ((auth.uid() = owner_id AND public.is_active_user()) OR public.is_admin());

-- Safe baseline profile permissions. Clients may edit only display name and
-- phone. Role, verification, account status and identity fields are never
-- client-writable, including before timestamped migrations are installed.
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, email, full_name, phone, role, avatar_url, account_status, verified, city, created_at, updated_at)
  ON TABLE public.profiles TO authenticated;
GRANT INSERT (id, full_name, phone) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, updated_at) ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can create own customer profile" ON public.profiles;
CREATE POLICY "Users can create own customer profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id AND role = 'customer');

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id AND public.is_active_user())
  WITH CHECK (
    auth.uid() = id
    AND public.is_active_user()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND account_status = (SELECT p.account_status FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "Owners can delete their own listings" ON public.listings;
CREATE POLICY "Owners can delete their own listings"
  ON public.listings FOR DELETE
  TO authenticated
  USING ((auth.uid() = owner_id AND public.is_active_user()) OR public.is_admin());

-- Enforce active account check on bookings creation
DROP POLICY IF EXISTS "Authenticated users can create their own bookings" ON public.bookings;
CREATE POLICY "Authenticated users can create their own bookings"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_active_user());

-- 10B. NOTIFICATIONS TABLE (Targeted & Broadcast Notifications with RLS)
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY DEFAULT ('notif-' || gen_random_uuid()::text),
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  target_role TEXT NOT NULL DEFAULT 'all_users'
    CHECK (target_role IN ('all_users', 'customer', 'customers', 'provider', 'providers', 'admin', 'vip_subscribers')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notif_type TEXT NOT NULL DEFAULT 'booking',
  read_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  link_id TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own or role-targeted notifications" ON public.notifications;
CREATE POLICY "Users can view their own or role-targeted notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    public.is_active_user()
    AND (
      recipient_user_id = auth.uid()
      OR recipient_user_id IS NULL
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Authenticated active users and admins can create notifications" ON public.notifications;
CREATE POLICY "Authenticated active users and admins can create notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_user());

DROP POLICY IF EXISTS "Users can mark notifications read or admins can update" ON public.notifications;
CREATE POLICY "Users can mark notifications read or admins can update"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (public.is_active_user() AND (recipient_user_id = auth.uid() OR recipient_user_id IS NULL OR public.is_admin()))
  WITH CHECK (public.is_active_user() AND (recipient_user_id = auth.uid() OR recipient_user_id IS NULL OR public.is_admin()));

DROP POLICY IF EXISTS "Admins or owners can delete notifications" ON public.notifications;
CREATE POLICY "Admins or owners can delete notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (recipient_user_id = auth.uid() OR public.is_admin());

-- 10C. ENABLE SUPABASE REALTIME FOR MULTI-USER LIVE SYNC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.listings;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.seat_locks;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- ============================================================================
-- 11. MOVIES & CINEMA TICKETING MODULE (Screens, Refunds, Support, Cancellation RPC)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cinema_screens (
  id TEXT PRIMARY KEY,
  cinema_listing_id TEXT NOT NULL,
  cinema_title TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT 'Hyderabad',
  screen_name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT '4K Laser · Dolby Atmos',
  sound_system TEXT NOT NULL DEFAULT 'Dolby Atmos',
  total_seats INTEGER NOT NULL DEFAULT 80,
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  wheelchair_seats JSONB NOT NULL DEFAULT '["A1", "A8"]'::jsonb,
  showtimes JSONB NOT NULL DEFAULT '["10:15 AM", "01:30 PM", "04:45 PM", "07:50 PM", "10:45 PM"]'::jsonb,
  cancellation_allowed BOOLEAN NOT NULL DEFAULT true,
  cancellation_cutoff_minutes INTEGER NOT NULL DEFAULT 120,
  refund_percent INTEGER NOT NULL DEFAULT 80,
  convenience_fee_per_seat NUMERIC NOT NULL DEFAULT 28,
  gst_percent NUMERIC NOT NULL DEFAULT 18,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cinema_screens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cinema screens are viewable by everyone" ON public.cinema_screens;
CREATE POLICY "Cinema screens are viewable by everyone"
  ON public.cinema_screens FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Providers and admins can manage cinema screens" ON public.cinema_screens;
CREATE POLICY "Providers and admins can manage cinema screens"
  ON public.cinema_screens FOR ALL
  TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('provider', 'admin') AND p.account_status = 'active'
    )
  )
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('provider', 'admin') AND p.account_status = 'active'
    )
  );

CREATE TABLE IF NOT EXISTS public.movie_refunds (
  id TEXT PRIMARY KEY DEFAULT ('RFD-' || gen_random_uuid()::text),
  booking_id TEXT NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  pass_code TEXT NOT NULL,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  movie_title TEXT NOT NULL,
  original_amount NUMERIC NOT NULL,
  refund_amount NUMERIC NOT NULL,
  deduction_amount NUMERIC NOT NULL DEFAULT 0,
  refund_percent NUMERIC NOT NULL DEFAULT 80,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'pending_bank', 'rejected')),
  utr_reference TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.movie_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers view own refunds and admins/providers view all" ON public.movie_refunds;
CREATE POLICY "Customers view own refunds and admins/providers view all"
  ON public.movie_refunds FOR SELECT
  TO authenticated
  USING (
    customer_user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'provider'
    )
  );

CREATE TABLE IF NOT EXISTS public.movie_support_tickets (
  id TEXT PRIMARY KEY DEFAULT ('SUP-' || gen_random_uuid()::text),
  booking_id TEXT NOT NULL,
  pass_code TEXT,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  issue_category TEXT NOT NULL CHECK (issue_category IN ('refund_status', 'payment_deducted', 'seat_issue', 'qr_scan_help', 'other')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.movie_support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create and view own support tickets" ON public.movie_support_tickets;
CREATE POLICY "Users can create and view own support tickets"
  ON public.movie_support_tickets FOR SELECT
  TO authenticated
  USING (
    customer_user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'provider'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can insert movie support tickets" ON public.movie_support_tickets;
CREATE POLICY "Authenticated users can insert movie support tickets"
  ON public.movie_support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_user());

DROP POLICY IF EXISTS "Providers and admins can resolve movie support tickets" ON public.movie_support_tickets;
CREATE POLICY "Providers and admins can resolve movie support tickets"
  ON public.movie_support_tickets FOR UPDATE
  TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'provider'
    )
  );

-- Preserve cinema visibility if this legacy schema is installed after the standalone
-- Movies migration. The new feed never falls back to these legacy records.
DO $visibility_guard$
BEGIN
  IF to_regprocedure('cinema_private.is_public(text,text)') IS NOT NULL THEN
    DROP POLICY IF EXISTS movie_listing_visibility_guard ON public.listings;
    CREATE POLICY movie_listing_visibility_guard ON public.listings AS RESTRICTIVE
      FOR SELECT TO anon, authenticated USING (
        (category_id NOT LIKE 'movie-%' AND COALESCE(payload->'customFieldValues'->>'sectionType','') <> 'movies')
        OR cinema_private.is_admin()
      );
    DROP POLICY IF EXISTS movie_screen_visibility_guard ON public.cinema_screens;
    CREATE POLICY movie_screen_visibility_guard ON public.cinema_screens AS RESTRICTIVE
      FOR SELECT TO anon, authenticated USING (
        cinema_private.is_admin()
      );
  END IF;
END $visibility_guard$;





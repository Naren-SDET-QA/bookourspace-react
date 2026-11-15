-- Add explicit rural-service availability and admin-controlled verification
-- to the existing listings table. No new provider table or data backfill is
-- needed: category, price, location and descriptive details already live in
-- the existing listing columns/payload.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS provider_availability_status TEXT NOT NULL DEFAULT 'not_reported',
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_provider_availability_status_check;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_provider_availability_status_check
    CHECK (provider_availability_status IN ('not_reported', 'available', 'unavailable'));

-- Discovery is category + publication + recent update; keep that query indexed.
CREATE INDEX IF NOT EXISTS idx_listings_active_services_recent
  ON public.listings (category_id, created_at DESC)
  WHERE status = 'active';

-- A provider may report their own availability, but only an active admin may
-- change the trusted verification columns. Legacy payload.isVerified is not
-- authoritative and is intentionally not backfilled.
CREATE OR REPLACE FUNCTION public.guard_listing_verification_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_active_admin BOOLEAN :=
    public.is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.account_status = 'active'
    );
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' AND auth.uid() IS NOT NULL AND NOT v_active_admin THEN
      RAISE EXCEPTION 'LISTING_PUBLICATION_ADMIN_ONLY' USING ERRCODE = '42501';
    END IF;
    IF NEW.is_verified OR NEW.verified_at IS NOT NULL OR NEW.verified_by IS NOT NULL THEN
      IF auth.uid() IS NOT NULL AND NOT v_active_admin THEN
        RAISE EXCEPTION 'LISTING_VERIFICATION_ADMIN_ONLY' USING ERRCODE = '42501';
      END IF;
    END IF;

    IF NEW.is_verified THEN
      NEW.verified_at := COALESCE(NEW.verified_at, now());
      NEW.verified_by := COALESCE(NEW.verified_by, auth.uid());
    ELSE
      NEW.verified_at := NULL;
      NEW.verified_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'active'
     AND OLD.status IS DISTINCT FROM 'active'
     AND auth.uid() IS NOT NULL
     AND NOT v_active_admin THEN
    RAISE EXCEPTION 'LISTING_PUBLICATION_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF (NEW.is_verified, NEW.verified_at, NEW.verified_by)
       IS DISTINCT FROM (OLD.is_verified, OLD.verified_at, OLD.verified_by)
     AND auth.uid() IS NOT NULL
     AND NOT v_active_admin THEN
    RAISE EXCEPTION 'LISTING_VERIFICATION_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF v_active_admin AND NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    IF NEW.is_verified THEN
      NEW.verified_at := now();
      NEW.verified_by := auth.uid();
    ELSE
      NEW.verified_at := NULL;
      NEW.verified_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_listing_verification_fields ON public.listings;
CREATE TRIGGER trg_guard_listing_verification_fields
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.guard_listing_verification_fields();

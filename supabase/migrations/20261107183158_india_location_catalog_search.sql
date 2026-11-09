-- Compact server-side location catalog from the existing curated India dataset.
-- Search results are served through the bounded /api/locations API; client roles
-- receive no direct table access. Uncommon-place suggestions use an external
-- provider only when configured and are never cached or persisted.
BEGIN;

CREATE TABLE IF NOT EXISTS public.india_locations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  district text NOT NULL,
  state text NOT NULL,
  state_code text NOT NULL,
  location_type text NOT NULL CHECK (location_type IN ('city', 'town', 'village')),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_popular boolean NOT NULL DEFAULT false,
  aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
  normalized_name text NOT NULL DEFAULT '',
  normalized_district text NOT NULL DEFAULT '',
  normalized_state text NOT NULL DEFAULT '',
  search_document tsvector NOT NULL DEFAULT ''::tsvector,
  coordinates point,
  UNIQUE (normalized_name, normalized_district, normalized_state)
);

CREATE OR REPLACE FUNCTION public.refresh_india_location_search_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.normalized_name := lower(btrim(NEW.name));
  NEW.normalized_district := lower(btrim(NEW.district));
  NEW.normalized_state := lower(btrim(NEW.state));
  NEW.search_document :=
    pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(NEW.name, '')), 'A') ||
    pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(NEW.district, '')), 'B') ||
    pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(NEW.state, '')), 'C') ||
    pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(pg_catalog.array_to_string(NEW.aliases, ' '), '')), 'A');
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.coordinates := point(NEW.longitude, NEW.latitude);
  ELSE
    NEW.coordinates := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_india_location_search_document() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_india_location_search_document
  BEFORE INSERT OR UPDATE OF name, district, state, aliases, latitude, longitude ON public.india_locations
  FOR EACH ROW EXECUTE FUNCTION public.refresh_india_location_search_document();

CREATE INDEX IF NOT EXISTS idx_india_locations_search_gin
  ON public.india_locations USING gin (search_document);
CREATE INDEX IF NOT EXISTS idx_india_locations_state_district
  ON public.india_locations (normalized_state, normalized_district, normalized_name, id);
CREATE INDEX IF NOT EXISTS idx_india_locations_coordinates_gist
  ON public.india_locations USING gist (coordinates);

ALTER TABLE public.india_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.india_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.india_locations TO service_role;

INSERT INTO public.india_locations
  (name, district, state, state_code, location_type, latitude, longitude, is_popular, aliases)
VALUES
  ('Hyderabad', 'Hyderabad', 'Telangana', 'TG', 'city', 17.385, 78.4867, true, array['Hyd', 'Bhagyanagar']::text[]),
  ('Secunderabad', 'Hyderabad', 'Telangana', 'TG', 'city', 17.4399, 78.4983, true, array[]::text[]),
  ('Charminar', 'Hyderabad', 'Telangana', 'TG', 'city', 17.3616, 78.4747, false, array[]::text[]),
  ('Gachibowli', 'Hyderabad', 'Telangana', 'TG', 'town', 17.4401, 78.3489, false, array[]::text[]),
  ('Madhapur', 'Hyderabad', 'Telangana', 'TG', 'town', 17.4483, 78.3915, false, array[]::text[]),
  ('Hitech City', 'Hyderabad', 'Telangana', 'TG', 'town', 17.4435, 78.3772, false, array['HITEC City']::text[]),
  ('Kukatpally', 'Hyderabad', 'Telangana', 'TG', 'town', 17.4948, 78.3996, false, array[]::text[]),
  ('Shamshabad', 'Rangareddy', 'Telangana', 'TG', 'town', 17.2403, 78.4294, false, array[]::text[]),
  ('Kothur', 'Rangareddy', 'Telangana', 'TG', 'town', 17.1667, 78.3167, false, array[]::text[]),
  ('Kompally', 'Medchal-Malkajgiri', 'Telangana', 'TG', 'town', 17.5388, 78.4856, false, array[]::text[]),
  ('Medchal', 'Medchal-Malkajgiri', 'Telangana', 'TG', 'town', 17.6296, 78.4813, false, array[]::text[]),
  ('Sangareddy', 'Sangareddy', 'Telangana', 'TG', 'city', 17.6248, 78.0862, false, array[]::text[]),
  ('Warangal', 'Warangal', 'Telangana', 'TG', 'city', 17.9689, 79.5941, true, array[]::text[]),
  ('Hanamkonda', 'Warangal', 'Telangana', 'TG', 'city', 18.0098, 79.5591, false, array[]::text[]),
  ('Karimnagar', 'Karimnagar', 'Telangana', 'TG', 'city', 18.4386, 79.1288, false, array[]::text[]),
  ('Nizamabad', 'Nizamabad', 'Telangana', 'TG', 'city', 18.6725, 78.0941, false, array[]::text[]),
  ('Khammam', 'Khammam', 'Telangana', 'TG', 'city', 17.2473, 80.1514, false, array[]::text[]),
  ('Mahbubnagar', 'Mahbubnagar', 'Telangana', 'TG', 'city', 16.7488, 77.9854, false, array[]::text[]),
  ('Nalgonda', 'Nalgonda', 'Telangana', 'TG', 'city', 17.0575, 79.2685, false, array[]::text[]),
  ('Adilabad', 'Adilabad', 'Telangana', 'TG', 'city', 19.6641, 78.532, false, array[]::text[]),
  ('Ramagundam', 'Peddapalli', 'Telangana', 'TG', 'city', 18.7599, 79.474, false, array[]::text[]),
  ('Kothagudem', 'Bhadradri Kothagudem', 'Telangana', 'TG', 'city', 17.5514, 80.6179, false, array[]::text[]),
  ('Suryapet', 'Suryapet', 'Telangana', 'TG', 'city', 17.1405, 79.6209, false, array[]::text[]),
  ('Visakhapatnam', 'Visakhapatnam', 'Andhra Pradesh', 'AP', 'city', 17.6868, 83.2185, true, array['Vizag']::text[]),
  ('Gajuwaka', 'Visakhapatnam', 'Andhra Pradesh', 'AP', 'town', 17.689, 83.209, false, array[]::text[]),
  ('Madhurawada', 'Visakhapatnam', 'Andhra Pradesh', 'AP', 'town', 17.821, 83.344, false, array[]::text[]),
  ('Anakapalli', 'Anakapalli', 'Andhra Pradesh', 'AP', 'town', 17.6913, 83.0039, false, array[]::text[]),
  ('Vijayawada', 'NTR', 'Andhra Pradesh', 'AP', 'city', 16.5062, 80.648, true, array[]::text[]),
  ('Machilipatnam', 'Krishna', 'Andhra Pradesh', 'AP', 'city', 16.1875, 81.1389, false, array[]::text[]),
  ('Guntur', 'Guntur', 'Andhra Pradesh', 'AP', 'city', 16.3067, 80.4365, true, array[]::text[]),
  ('Tenali', 'Guntur', 'Andhra Pradesh', 'AP', 'city', 16.243, 80.64, false, array[]::text[]),
  ('Tirupati', 'Tirupati', 'Andhra Pradesh', 'AP', 'city', 13.6288, 79.4192, true, array['Tirumala']::text[]),
  ('Kurnool', 'Kurnool', 'Andhra Pradesh', 'AP', 'city', 15.8281, 78.0373, false, array[]::text[]),
  ('Rajahmundry', 'East Godavari', 'Andhra Pradesh', 'AP', 'city', 17.0005, 81.804, false, array['Rajamahendravaram']::text[]),
  ('Kakinada', 'Kakinada', 'Andhra Pradesh', 'AP', 'city', 16.9891, 82.2475, false, array[]::text[]),
  ('Nellore', 'Nellore', 'Andhra Pradesh', 'AP', 'city', 14.4426, 79.9865, false, array[]::text[]),
  ('Anantapur', 'Anantapur', 'Andhra Pradesh', 'AP', 'city', 14.6819, 77.6006, false, array[]::text[]),
  ('Kadapa', 'YSR Kadapa', 'Andhra Pradesh', 'AP', 'city', 14.4674, 78.8241, false, array[]::text[]),
  ('Chittoor', 'Chittoor', 'Andhra Pradesh', 'AP', 'city', 13.2172, 79.1003, false, array[]::text[]),
  ('Bhimavaram', 'West Godavari', 'Andhra Pradesh', 'AP', 'city', 16.5449, 81.5212, false, array[]::text[]),
  ('Eluru', 'Eluru', 'Andhra Pradesh', 'AP', 'city', 16.7107, 81.0952, false, array[]::text[]),
  ('Ongole', 'Prakasam', 'Andhra Pradesh', 'AP', 'city', 15.5057, 80.0499, false, array[]::text[]),
  ('Bengaluru', 'Bengaluru Urban', 'Karnataka', 'KA', 'city', 12.9716, 77.5946, true, array['Bangalore', 'BLR']::text[]),
  ('Koramangala', 'Bengaluru Urban', 'Karnataka', 'KA', 'town', 12.9352, 77.6245, false, array[]::text[]),
  ('Indiranagar', 'Bengaluru Urban', 'Karnataka', 'KA', 'town', 12.9784, 77.6408, false, array[]::text[]),
  ('Whitefield', 'Bengaluru Urban', 'Karnataka', 'KA', 'town', 12.9698, 77.75, false, array[]::text[]),
  ('HSR Layout', 'Bengaluru Urban', 'Karnataka', 'KA', 'town', 12.9121, 77.6446, false, array[]::text[]),
  ('Jayanagar', 'Bengaluru Urban', 'Karnataka', 'KA', 'town', 12.9308, 77.5838, false, array[]::text[]),
  ('Electronic City', 'Bengaluru Urban', 'Karnataka', 'KA', 'town', 12.8399, 77.677, false, array[]::text[]),
  ('Mysuru', 'Mysuru', 'Karnataka', 'KA', 'city', 12.2958, 76.6394, true, array['Mysore']::text[]),
  ('Mangaluru', 'Dakshina Kannada', 'Karnataka', 'KA', 'city', 12.9141, 74.856, true, array['Mangalore']::text[]),
  ('Ullal', 'Dakshina Kannada', 'Karnataka', 'KA', 'town', 12.8, 74.85, false, array[]::text[]),
  ('Hubballi', 'Dharwad', 'Karnataka', 'KA', 'city', 15.3647, 75.124, false, array['Hubli']::text[]),
  ('Dharwad', 'Dharwad', 'Karnataka', 'KA', 'city', 15.4589, 75.0078, false, array[]::text[]),
  ('Belagavi', 'Belagavi', 'Karnataka', 'KA', 'city', 15.8497, 74.4977, false, array['Belgaum']::text[]),
  ('Kalaburagi', 'Kalaburagi', 'Karnataka', 'KA', 'city', 17.3297, 76.8343, false, array['Gulbarga']::text[]),
  ('Ballari', 'Ballari', 'Karnataka', 'KA', 'city', 15.1394, 76.9214, false, array['Bellary']::text[]),
  ('Vijayapura', 'Vijayapura', 'Karnataka', 'KA', 'city', 16.8302, 75.71, false, array['Bijapur']::text[]),
  ('Shivamogga', 'Shivamogga', 'Karnataka', 'KA', 'city', 13.9299, 75.5681, false, array['Shimoga']::text[]),
  ('Tumakuru', 'Tumakuru', 'Karnataka', 'KA', 'city', 13.3379, 77.1173, false, array['Tumkur']::text[]),
  ('Davanagere', 'Davanagere', 'Karnataka', 'KA', 'city', 14.4644, 75.9218, false, array[]::text[]),
  ('Udupi', 'Udupi', 'Karnataka', 'KA', 'city', 13.3409, 74.7421, false, array[]::text[]),
  ('Hassan', 'Hassan', 'Karnataka', 'KA', 'city', 13.0068, 76.0996, false, array[]::text[]),
  ('Raichur', 'Raichur', 'Karnataka', 'KA', 'city', 16.2076, 77.3463, false, array[]::text[]),
  ('Mumbai', 'Mumbai Suburban', 'Maharashtra', 'MH', 'city', 19.076, 72.8777, true, array['Bombay']::text[]),
  ('Pune', 'Pune', 'Maharashtra', 'MH', 'city', 18.5204, 73.8567, true, array[]::text[]),
  ('Nagpur', 'Nagpur', 'Maharashtra', 'MH', 'city', 21.1458, 79.0882, false, array[]::text[]),
  ('Nashik', 'Nashik', 'Maharashtra', 'MH', 'city', 19.9975, 73.7898, false, array[]::text[]),
  ('Thane', 'Thane', 'Maharashtra', 'MH', 'city', 19.2183, 72.9781, false, array[]::text[]),
  ('New Delhi', 'New Delhi', 'Delhi', 'DL', 'city', 28.6139, 77.209, true, array['Delhi', 'NCR']::text[]),
  ('Saket', 'South Delhi', 'Delhi', 'DL', 'town', 28.5245, 77.2066, false, array[]::text[]),
  ('Chennai', 'Chennai', 'Tamil Nadu', 'TN', 'city', 13.0827, 80.2707, true, array['Madras']::text[]),
  ('Coimbatore', 'Coimbatore', 'Tamil Nadu', 'TN', 'city', 11.0168, 76.9558, false, array[]::text[]),
  ('Madurai', 'Madurai', 'Tamil Nadu', 'TN', 'city', 9.9252, 78.1198, false, array[]::text[]),
  ('Kolkata', 'Kolkata', 'West Bengal', 'WB', 'city', 22.5726, 88.3639, true, array['Calcutta']::text[]),
  ('Ahmedabad', 'Ahmedabad', 'Gujarat', 'GJ', 'city', 23.0225, 72.5714, false, array[]::text[]),
  ('Surat', 'Surat', 'Gujarat', 'GJ', 'city', 21.1702, 72.8311, false, array[]::text[]),
  ('Vadodara', 'Vadodara', 'Gujarat', 'GJ', 'city', 22.3072, 73.1812, false, array[]::text[]),
  ('Jaipur', 'Jaipur', 'Rajasthan', 'RJ', 'city', 26.9124, 75.7873, true, array[]::text[]),
  ('Jodhpur', 'Jodhpur', 'Rajasthan', 'RJ', 'city', 26.2389, 73.0243, false, array[]::text[]),
  ('Udaipur', 'Udaipur', 'Rajasthan', 'RJ', 'city', 24.5854, 73.7125, false, array[]::text[]),
  ('Lucknow', 'Lucknow', 'Uttar Pradesh', 'UP', 'city', 26.8467, 80.9462, false, array[]::text[]),
  ('Kanpur', 'Kanpur', 'Uttar Pradesh', 'UP', 'city', 26.4499, 80.3319, false, array[]::text[]),
  ('Noida', 'Gautam Buddha Nagar', 'Uttar Pradesh', 'UP', 'city', 28.5355, 77.391, true, array[]::text[]),
  ('Varanasi', 'Varanasi', 'Uttar Pradesh', 'UP', 'city', 25.3176, 82.9739, false, array[]::text[]),
  ('Agra', 'Agra', 'Uttar Pradesh', 'UP', 'city', 27.1767, 78.0081, false, array[]::text[]),
  ('Kochi', 'Ernakulam', 'Kerala', 'KL', 'city', 9.9312, 76.2673, true, array['Cochin']::text[]),
  ('Thiruvananthapuram', 'Thiruvananthapuram', 'Kerala', 'KL', 'city', 8.5241, 76.9366, false, array['Trivandrum']::text[]),
  ('Kozhikode', 'Kozhikode', 'Kerala', 'KL', 'city', 11.2588, 75.7804, false, array['Calicut']::text[]),
  ('Chandigarh', 'Chandigarh', 'Punjab', 'PB', 'city', 30.7333, 76.7794, false, array[]::text[]),
  ('Ludhiana', 'Ludhiana', 'Punjab', 'PB', 'city', 30.901, 75.8573, false, array[]::text[]),
  ('Amritsar', 'Amritsar', 'Punjab', 'PB', 'city', 31.634, 74.8723, false, array[]::text[]),
  ('Gurugram', 'Gurugram', 'Haryana', 'HR', 'city', 28.4595, 77.0266, true, array['Gurgaon']::text[]),
  ('Faridabad', 'Faridabad', 'Haryana', 'HR', 'city', 28.4089, 77.3178, false, array[]::text[])
ON CONFLICT (normalized_name, normalized_district, normalized_state) DO UPDATE SET
  state_code = EXCLUDED.state_code,
  location_type = EXCLUDED.location_type,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  is_popular = EXCLUDED.is_popular,
  aliases = EXCLUDED.aliases;

ANALYZE public.india_locations;
COMMIT;

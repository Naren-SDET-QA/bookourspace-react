DO $$
DECLARE
  v_count integer;
  v_size bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'india_locations' AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'FAIL: location table RLS is not enabled'; END IF;

  IF has_table_privilege('anon', 'public.india_locations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.india_locations', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: client roles can read the raw location table';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.india_locations', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: server service_role cannot read the location catalog';
  END IF;
  IF has_function_privilege('anon', 'public.search_india_locations(text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.search_india_locations(text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.search_india_locations(text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: server-only location search RPC grants are incorrect';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.search_india_locations(text,integer)'::regprocedure)
     OR NOT EXISTS (
       SELECT 1
         FROM pg_proc p
         CROSS JOIN LATERAL pg_options_to_table(p.proconfig) option_setting
        WHERE p.oid = 'public.search_india_locations(text,integer)'::regprocedure
          AND option_setting.option_name = 'search_path'
          -- PostgreSQL renders the pinned empty path as `""` in proconfig.
          -- Normalize the display form before asserting the empty value.
          AND trim(both '"' from option_setting.option_value) = ''
     ) THEN
    RAISE EXCEPTION 'FAIL: location search RPC must be invoker-safe with pinned empty search_path';
  END IF;

  SELECT count(*) INTO v_count FROM public.india_locations;
  IF v_count <> 94 THEN RAISE EXCEPTION 'FAIL: expected 94 migrated catalog rows, got %', v_count; END IF;
  IF EXISTS (
    SELECT 1 FROM public.india_locations
     GROUP BY normalized_name, normalized_district, normalized_state HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'FAIL: duplicate normalized locations exist'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.india_locations WHERE is_popular) THEN
    RAISE EXCEPTION 'FAIL: popular location fixture is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.india_locations WHERE search_document @@ to_tsquery('simple', 'hyder:*')) THEN
    RAISE EXCEPTION 'FAIL: prefix autocomplete does not find Hyderabad';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.india_locations WHERE search_document @@ to_tsquery('simple', 'vizag:*')) THEN
    RAISE EXCEPTION 'FAIL: alias autocomplete does not find Visakhapatnam';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.india_locations
     WHERE normalized_state = 'telangana' AND normalized_district = 'hyderabad'
       AND name = 'Gachibowli'
  ) THEN RAISE EXCEPTION 'FAIL: state/district filtered area search failed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.india_locations ORDER BY coordinates <-> point(78.4867, 17.385) LIMIT 1
  ) THEN RAISE EXCEPTION 'FAIL: nearest-city KNN lookup failed'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_india_locations_search_gin')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_india_locations_state_district')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_india_locations_coordinates_gist') THEN
    RAISE EXCEPTION 'FAIL: autocomplete, browse, or nearest-location index is missing';
  END IF;

  SELECT pg_total_relation_size('public.india_locations') INTO v_size;
  RAISE NOTICE 'PASS location catalog rows=%, client table/RPC access denied, service access granted, normalized uniqueness, prefix+alias search, district filter, and three access indexes; relation_bytes=%', v_count, v_size;
END;
$$;

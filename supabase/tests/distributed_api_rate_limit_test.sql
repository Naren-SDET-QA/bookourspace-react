\set ON_ERROR_STOP on
DO $$
begin
  if not has_function_privilege('service_role', 'private.consume_api_rate_limit(text,integer,integer)', 'EXECUTE') then
    raise exception 'FAIL service_role cannot execute distributed rate limit function';
  end if;
  raise notice 'PASS service_role is allowed to execute atomic limiter';

  if has_function_privilege('anon', 'private.consume_api_rate_limit(text,integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.consume_api_rate_limit(text,integer,integer)', 'EXECUTE') then
    raise exception 'FAIL client role can execute distributed rate limit function';
  end if;
  raise notice 'PASS anon and authenticated cannot execute limiter';

  if has_table_privilege('anon', 'private.api_rate_limit_windows', 'SELECT')
     or has_table_privilege('authenticated', 'private.api_rate_limit_windows', 'SELECT')
     or has_table_privilege('anon', 'private.api_rate_limit_windows', 'INSERT')
     or has_table_privilege('authenticated', 'private.api_rate_limit_windows', 'INSERT') then
    raise exception 'FAIL client role can access private rate limit buckets';
  end if;
  raise notice 'PASS client roles have no table access to rate-limit buckets';

  if not has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'FAIL existing authenticated private-schema usage was removed';
  end if;
  raise notice 'PASS existing private-schema usage remains intact for unrelated application RPCs';
end $$;

set role service_role;
DO $$
declare
  test_bucket text := pg_catalog.repeat(
    pg_catalog.md5(pg_catalog.clock_timestamp()::text || pg_catalog.random()::text),
    2
  );
  first_allowed boolean;
  second_allowed boolean;
  third_allowed boolean;
  stored_count integer;
begin
  select allowed into first_allowed from private.consume_api_rate_limit(test_bucket, 2, 3600);
  select allowed into second_allowed from private.consume_api_rate_limit(test_bucket, 2, 3600);
  select allowed into third_allowed from private.consume_api_rate_limit(test_bucket, 2, 3600);
  if not first_allowed or not second_allowed or third_allowed then
    raise exception 'FAIL atomic limiter threshold was not enforced';
  end if;
  select request_count into stored_count
    from private.api_rate_limit_windows where bucket_hash = test_bucket;
  if stored_count <> 3 then
    raise exception 'FAIL atomic limiter did not persist one counter update per request';
  end if;
  delete from private.api_rate_limit_windows where bucket_hash = test_bucket;
  raise notice 'PASS atomic counter allows the configured threshold and denies the next hit';

  begin
    perform * from private.consume_api_rate_limit(repeat('z', 64), 2, 0);
    raise exception 'FAIL invalid rate limit window was accepted';
  exception when sqlstate '22023' then
    raise notice 'PASS invalid limiter configuration is rejected';
  end;
end $$;
reset role;

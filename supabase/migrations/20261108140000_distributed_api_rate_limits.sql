-- Distributed API write rate limiting.
-- Bucket identifiers are application-side HMACs; raw addresses and request
-- payloads are never stored. API roles cannot read or mutate this table.
create schema if not exists private;
grant usage on schema private to service_role;

create table if not exists private.api_rate_limit_windows (
  bucket_hash text primary key
    check (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null,
  expires_at timestamptz not null
);

alter table private.api_rate_limit_windows enable row level security;
alter table private.api_rate_limit_windows force row level security;
revoke all on private.api_rate_limit_windows from public, anon, authenticated;
grant select, insert, update, delete on private.api_rate_limit_windows to service_role;
create index if not exists api_rate_limit_windows_expires_at_idx
  on private.api_rate_limit_windows (expires_at);

create or replace function private.consume_api_rate_limit(
  p_bucket_hash text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer, remaining integer)
language plpgsql
volatile
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
  v_expires_at timestamptz;
begin
  if p_bucket_hash is null or p_bucket_hash !~ '^[0-9a-f]{64}$'
     or p_max_requests < 1 or p_max_requests > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'RATE_LIMIT_ARGUMENT_INVALID';
  end if;

  v_window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(pg_catalog.date_part('epoch', v_now) / p_window_seconds) * p_window_seconds
  );
  v_expires_at := v_window_start + pg_catalog.make_interval(secs => p_window_seconds);

  -- Bounded opportunistic cleanup prevents an unbounded history while keeping
  -- each API request's maintenance work capped at 50 expired buckets.
  with expired as (
    select bucket_hash
      from private.api_rate_limit_windows
     where expires_at < v_now
     order by expires_at
     limit 50
     for update skip locked
  )
  delete from private.api_rate_limit_windows as stale
   using expired
   where stale.bucket_hash = expired.bucket_hash;

  insert into private.api_rate_limit_windows as current_bucket
    (bucket_hash, window_started_at, request_count, updated_at, expires_at)
  values (p_bucket_hash, v_window_start, 1, v_now, v_expires_at)
  on conflict (bucket_hash) do update
    set window_started_at = excluded.window_started_at,
        request_count = case
          when current_bucket.window_started_at = excluded.window_started_at
            then current_bucket.request_count + 1
          else 1
        end,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
  returning request_count, window_started_at + pg_catalog.make_interval(secs => p_window_seconds)
       into v_count, v_expires_at;

  return query select
    v_count <= p_max_requests,
    greatest(1, pg_catalog.ceil(pg_catalog.date_part('epoch', v_expires_at - v_now))::integer),
    greatest(0, p_max_requests - v_count);
end;
$function$;

revoke all on function private.consume_api_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function private.consume_api_rate_limit(text, integer, integer)
  to service_role;

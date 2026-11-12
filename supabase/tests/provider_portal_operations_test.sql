-- Local-only regression checks. Run through the existing local validation
-- harness after the migration is applied to a disposable database.

do $$
begin
  if to_regclass('public.provider_portal_memberships') is null then
    raise exception 'provider portal migration is not installed';
  end if;
  if to_regclass('public.service_worker_assignments') is null then
    raise exception 'worker assignment table is not installed';
  end if;
  if to_regclass('public.service_job_otps') is null then
    raise exception 'service OTP table is not installed';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'stay_allocations_no_overlap'
       and conrelid = 'public.stay_allocations'::regclass
  ) then
    raise exception 'stay double-booking exclusion constraint is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'service_worker_assignment_no_overlap'
       and conrelid = 'public.service_worker_assignments'::regclass
  ) then
    raise exception 'worker concurrency exclusion constraint is missing';
  end if;
  raise notice 'PASS provider portal schema, stay overlap and worker concurrency guards exist';
end $$;

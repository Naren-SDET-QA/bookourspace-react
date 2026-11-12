-- Local candidate migration for the shared Provider Portal operations layer.
-- Do not apply to hosted Supabase without explicit approval.
--
-- This migration is additive. It reuses the existing listings, stay inventory,
-- service bookings, profiles and Google/Supabase identity boundary.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- 1. Scoped provider portal access
-- ---------------------------------------------------------------------------
create table if not exists public.provider_portal_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  property_id uuid references public.stay_properties(id) on delete cascade,
  listing_id text references public.listings(id) on delete cascade,
  portal_role text not null check (portal_role in ('owner','manager','staff','accountant','super_admin')),
  permissions jsonb not null default '{"read":true}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  status text not null default 'active' check (status in ('invited','active','suspended','revoked')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_portal_membership_scope_chk check (property_id is not null or listing_id is not null),
  constraint provider_portal_membership_unique_scope unique (user_id, property_id, listing_id)
);

create index if not exists idx_provider_portal_memberships_user on public.provider_portal_memberships(user_id, status);
create index if not exists idx_provider_portal_memberships_property on public.provider_portal_memberships(property_id, status);
create index if not exists idx_provider_portal_memberships_listing on public.provider_portal_memberships(listing_id, status);
alter table public.provider_portal_memberships enable row level security;
revoke all on public.provider_portal_memberships from public, anon;
grant select on public.provider_portal_memberships to authenticated;
grant insert, update, delete on public.provider_portal_memberships to authenticated;

create or replace function public.provider_portal_can_access(
  p_property_id uuid default null,
  p_listing_id text default null,
  p_permission text default 'read'
) returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare v_profile public.profiles; v_membership public.provider_portal_memberships;
begin
  if auth.uid() is null then return false; end if;
  select * into v_profile from public.profiles where id = auth.uid() and account_status = 'active';
  if v_profile.id is null then return false; end if;
  if v_profile.role = 'admin' then return true; end if;
  select * into v_membership
    from public.provider_portal_memberships m
   where m.user_id = auth.uid() and m.status = 'active'
     and (p_property_id is null or m.property_id = p_property_id)
     and (p_listing_id is null or m.listing_id = p_listing_id)
     and (
       coalesce((m.permissions ->> p_permission)::boolean, false)
       or m.portal_role in ('owner','manager','super_admin') and p_permission in ('read','manage_inventory','manage_bookings','manage_workers','view_finance')
     )
   limit 1;
  return v_membership.id is not null;
end $$;

drop policy if exists provider_portal_memberships_read on public.provider_portal_memberships;
create policy provider_portal_memberships_read on public.provider_portal_memberships
for select to authenticated using (user_id = auth.uid() or invited_by = auth.uid() or public.is_admin());
drop policy if exists provider_portal_memberships_write on public.provider_portal_memberships;
create policy provider_portal_memberships_write on public.provider_portal_memberships
for all to authenticated using (public.is_admin() or invited_by = auth.uid()) with check (public.is_admin() or invited_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Stay rate plans, housekeeping and maintenance
-- ---------------------------------------------------------------------------
create table if not exists public.stay_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.stay_properties(id) on delete cascade,
  room_type_id uuid references public.stay_room_types(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  rule_kind text not null check (rule_kind in ('base','seasonal','weekend','hourly','event')),
  effective_dates daterange not null,
  hourly_rate_paise integer check (hourly_rate_paise is null or hourly_rate_paise >= 0),
  nightly_rate_paise integer check (nightly_rate_paise is null or nightly_rate_paise >= 0),
  multiplier numeric(7,4) not null default 1 check (multiplier > 0),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stay_pricing_rule_dates_chk check (not isempty(effective_dates)),
  constraint stay_pricing_rule_value_chk check (hourly_rate_paise is not null or nightly_rate_paise is not null or multiplier <> 1)
);
create index if not exists idx_stay_pricing_rules_property_dates on public.stay_pricing_rules(property_id, effective_dates) where is_active;
alter table public.stay_pricing_rules enable row level security;
revoke all on public.stay_pricing_rules from public, anon;
grant select, insert, update, delete on public.stay_pricing_rules to authenticated;
drop policy if exists stay_pricing_rules_scope on public.stay_pricing_rules;
create policy stay_pricing_rules_scope on public.stay_pricing_rules for all to authenticated
using (public.provider_portal_can_access(property_id, null, 'manage_inventory'))
with check (public.provider_portal_can_access(property_id, null, 'manage_inventory') and created_by = auth.uid());

create table if not exists public.stay_housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.stay_properties(id) on delete cascade,
  unit_id uuid references public.stay_units(id) on delete set null,
  booking_id text references public.bookings(id) on delete set null,
  task_type text not null check (task_type in ('turnover','cleaning','linen','inspection','maintenance')),
  status text not null default 'open' check (status in ('open','assigned','in_progress','done','cancelled')),
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_stay_housekeeping_queue on public.stay_housekeeping_tasks(property_id, status, due_at);
alter table public.stay_housekeeping_tasks enable row level security;
revoke all on public.stay_housekeeping_tasks from public, anon;
grant select, insert, update on public.stay_housekeeping_tasks to authenticated;
drop policy if exists stay_housekeeping_scope on public.stay_housekeeping_tasks;
create policy stay_housekeeping_scope on public.stay_housekeeping_tasks for all to authenticated
using (public.provider_portal_can_access(property_id, null, 'manage_inventory'))
with check (public.provider_portal_can_access(property_id, null, 'manage_inventory') and created_by = auth.uid());

create table if not exists public.stay_maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.stay_properties(id) on delete cascade,
  unit_id uuid references public.stay_units(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','assigned','in_progress','resolved','cancelled')),
  title text not null check (length(trim(title)) between 2 and 160),
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.stay_maintenance_tickets enable row level security;
revoke all on public.stay_maintenance_tickets from public, anon;
grant select, insert, update on public.stay_maintenance_tickets to authenticated;
drop policy if exists stay_maintenance_scope on public.stay_maintenance_tickets;
create policy stay_maintenance_scope on public.stay_maintenance_tickets for all to authenticated
using (public.provider_portal_can_access(property_id, null, 'manage_inventory'))
with check (public.provider_portal_can_access(property_id, null, 'manage_inventory') and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Service workers/helpers, concurrency-safe assignments and tracking
-- ---------------------------------------------------------------------------
create table if not exists public.service_workers (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  phone text not null check (length(trim(phone)) between 7 and 24),
  service_categories text[] not null default '{}',
  service_areas text[] not null default '{}',
  availability jsonb not null default '{}'::jsonb check (jsonb_typeof(availability) = 'object'),
  status text not null default 'pending' check (status in ('pending','approved','suspended','rejected')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_service_workers_provider_status on public.service_workers(provider_id, status);
alter table public.service_workers enable row level security;
revoke all on public.service_workers from public, anon;
grant select, insert, update on public.service_workers to authenticated;
drop policy if exists service_workers_scope on public.service_workers;
create policy service_workers_scope on public.service_workers for all to authenticated
using (provider_id = auth.uid() or public.is_admin())
with check (provider_id = auth.uid() or public.is_admin());

alter table public.service_bookings add column if not exists worker_id uuid references public.service_workers(id) on delete set null;
alter table public.service_bookings add column if not exists assigned_at timestamptz;
alter table public.service_bookings add column if not exists travelling_at timestamptz;
alter table public.service_bookings add column if not exists arrived_at timestamptz;
alter table public.service_bookings add column if not exists start_verified_at timestamptz;
alter table public.service_bookings drop constraint if exists service_bookings_status_check;
alter table public.service_bookings add constraint service_bookings_status_check check (status in ('requested','accepted','assigned','travelling','arrived','started','in_progress','completed','cancelled','rejected'));

create or replace function public.enforce_service_booking_guard()
returns trigger language plpgsql security invoker
as $$
declare actor_role text; allowed boolean;
begin
  if auth.uid() is null then new.updated_at := now(); return new; end if;
  select p.role into actor_role from public.profiles p where p.id=auth.uid();
  if new.booking_ref <> old.booking_ref or new.listing_id <> old.listing_id
     or new.customer_id <> old.customer_id or new.provider_id <> old.provider_id
     or new.category_id <> old.category_id or new.amount <> old.amount
     or new.currency <> old.currency or new.payment_mode <> old.payment_mode
     or new.idempotency_key <> old.idempotency_key then
    raise exception 'SERVICE_BOOKING_IMMUTABLE_FIELDS' using errcode='42501';
  end if;
  if new.scheduled_date <> old.scheduled_date or new.time_slot <> old.time_slot then
    if old.status not in ('requested','accepted') or actor_role not in ('provider','admin') then
      raise exception 'SERVICE_BOOKING_RESCHEDULE_NOT_ALLOWED' using errcode='42501';
    end if;
  end if;
  if new.status <> old.status then
    allowed := case old.status
      when 'requested' then new.status in ('accepted','rejected','cancelled')
      when 'accepted' then new.status in ('assigned','travelling','in_progress','cancelled')
      when 'assigned' then new.status in ('travelling','cancelled')
      when 'travelling' then new.status in ('arrived','cancelled')
      when 'arrived' then new.status in ('started','cancelled')
      when 'started' then new.status in ('completed','cancelled')
      when 'in_progress' then new.status in ('completed','cancelled')
      else false end;
    if not allowed then raise exception 'SERVICE_BOOKING_INVALID_TRANSITION' using errcode='42501'; end if;
    if actor_role='customer' and new.status <> 'cancelled' then raise exception 'SERVICE_BOOKING_CUSTOMER_TRANSITION_DENIED' using errcode='42501'; end if;
    if actor_role='provider' and new.status not in ('accepted','assigned','travelling','arrived','started','in_progress','completed','cancelled','rejected') then raise exception 'SERVICE_BOOKING_PROVIDER_TRANSITION_DENIED' using errcode='42501'; end if;
    if actor_role='provider' and new.status='cancelled' and old.status in ('started','in_progress') then raise exception 'SERVICE_BOOKING_PROVIDER_CANNOT_CANCEL_STARTED_JOB' using errcode='42501'; end if;
  end if;
  if new.payment_status='settled' and old.payment_status <> 'settled' and not public.is_admin() then raise exception 'SERVICE_PAYMENT_SETTLEMENT_ADMIN_ONLY' using errcode='42501'; end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists service_bookings_guard on public.service_bookings;
create trigger service_bookings_guard before update on public.service_bookings for each row execute function public.enforce_service_booking_guard();

create table if not exists public.service_worker_assignments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  worker_id uuid not null references public.service_workers(id) on delete restrict,
  job_window tstzrange not null,
  status text not null default 'active' check (status in ('active','released','completed','cancelled')),
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  constraint service_worker_assignment_window_chk check (not isempty(job_window))
);
alter table public.service_worker_assignments drop constraint if exists service_worker_assignment_no_overlap;
alter table public.service_worker_assignments add constraint service_worker_assignment_no_overlap
  exclude using gist (worker_id with =, job_window with &&) where (status = 'active');
create unique index if not exists uniq_active_worker_booking on public.service_worker_assignments(booking_id) where status='active';
create index if not exists idx_service_worker_assignments_worker on public.service_worker_assignments(worker_id, status, job_window);
alter table public.service_worker_assignments enable row level security;
revoke all on public.service_worker_assignments from public, anon;
grant select, insert, update on public.service_worker_assignments to authenticated;
drop policy if exists service_worker_assignments_scope on public.service_worker_assignments;
create policy service_worker_assignments_scope on public.service_worker_assignments for all to authenticated
using (exists (select 1 from public.service_bookings b where b.id=booking_id and (b.provider_id=auth.uid() or public.is_admin())))
with check (exists (select 1 from public.service_bookings b where b.id=booking_id and (b.provider_id=auth.uid() or public.is_admin())) and assigned_by=auth.uid());

create table if not exists public.service_job_tracking_sessions (
  booking_id uuid primary key references public.service_bookings(id) on delete cascade,
  worker_id uuid not null references public.service_workers(id) on delete restrict,
  consent_granted_at timestamptz not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz,
  stopped_at timestamptz,
  stop_reason text
);
create table if not exists public.service_job_locations (
  id bigserial primary key,
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  worker_id uuid not null references public.service_workers(id) on delete restrict,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  accuracy_m numeric(8,2) check (accuracy_m is null or accuracy_m >= 0),
  recorded_at timestamptz not null default now()
);
create index if not exists idx_service_job_locations_recent on public.service_job_locations(booking_id, recorded_at desc);
alter table public.service_job_tracking_sessions enable row level security;
alter table public.service_job_locations enable row level security;
revoke all on public.service_job_tracking_sessions, public.service_job_locations from public, anon;
grant select on public.service_job_tracking_sessions, public.service_job_locations to authenticated;
grant insert, update on public.service_job_tracking_sessions to authenticated;
grant insert on public.service_job_locations to authenticated;
drop policy if exists service_job_tracking_session_scope on public.service_job_tracking_sessions;
create policy service_job_tracking_session_scope on public.service_job_tracking_sessions for all to authenticated
using (exists (select 1 from public.service_bookings b where b.id=booking_id and (b.customer_id=auth.uid() or b.provider_id=auth.uid() or public.is_admin())))
with check (exists (select 1 from public.service_bookings b where b.id=booking_id and (b.provider_id=auth.uid() or public.is_admin())));
drop policy if exists service_job_locations_scope on public.service_job_locations;
create policy service_job_locations_scope on public.service_job_locations for select to authenticated
using (exists (select 1 from public.service_bookings b where b.id=booking_id and (b.customer_id=auth.uid() or b.provider_id=auth.uid() or public.is_admin())));
create policy service_job_locations_insert on public.service_job_locations for insert to authenticated
with check (exists (select 1 from public.service_bookings b where b.id=booking_id and b.provider_id=auth.uid() and b.worker_id=service_job_locations.worker_id and b.status in ('travelling','arrived','started','in_progress')));

-- ---------------------------------------------------------------------------
-- 4. Hashed, expiring, single-use service start OTPs
-- ---------------------------------------------------------------------------
create table if not exists public.service_job_otps (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  purpose text not null check (purpose in ('start','completion')),
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  max_attempts smallint not null default 5 check (max_attempts between 1 and 5),
  used_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index if not exists uniq_live_service_job_otp on public.service_job_otps(booking_id, purpose) where used_at is null;
alter table public.service_job_otps enable row level security;
revoke all on public.service_job_otps from public, anon, authenticated;

create or replace function public.issue_service_job_otp(p_booking_id uuid, p_purpose text default 'start')
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_booking public.service_bookings; v_code text; v_expires timestamptz := now() + interval '10 minutes';
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_booking from public.service_bookings where id=p_booking_id for update;
  if v_booking.id is null or (v_booking.provider_id <> auth.uid() and not public.is_admin()) then raise exception 'SERVICE_BOOKING_FORBIDDEN' using errcode='42501'; end if;
  if p_purpose not in ('start','completion') then raise exception 'INVALID_OTP_PURPOSE' using errcode='22023'; end if;
  if p_purpose='start' and v_booking.status not in ('accepted','assigned','travelling','arrived') then raise exception 'SERVICE_START_NOT_OPEN' using errcode='22023'; end if;
  v_code := lpad((floor(random()*900000)::int + 100000)::text, 6, '0');
  update public.service_job_otps set used_at=coalesce(used_at, now()) where booking_id=p_booking_id and purpose=p_purpose and used_at is null;
  insert into public.service_job_otps(booking_id,purpose,otp_hash,expires_at,created_by) values (p_booking_id,p_purpose,encode(digest(v_code,'sha256'),'hex'),v_expires,auth.uid());
  return jsonb_build_object('code',v_code,'expiresAt',v_expires);
end $$;

create or replace function public.verify_service_job_otp(p_booking_id uuid, p_purpose text, p_code text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_otp public.service_job_otps; v_booking public.service_bookings;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_booking from public.service_bookings where id=p_booking_id for share;
  if v_booking.id is null or (v_booking.customer_id <> auth.uid() and v_booking.provider_id <> auth.uid() and not public.is_admin()) then raise exception 'SERVICE_BOOKING_FORBIDDEN' using errcode='42501'; end if;
  select * into v_otp from public.service_job_otps where booking_id=p_booking_id and purpose=p_purpose and used_at is null order by created_at desc limit 1 for update;
  if v_otp.id is null or v_otp.expires_at <= now() or v_otp.attempts >= v_otp.max_attempts then return jsonb_build_object('verified',false,'reason','OTP_UNAVAILABLE'); end if;
  if encode(digest(coalesce(p_code,''),'sha256'),'hex') <> v_otp.otp_hash then update public.service_job_otps set attempts=attempts+1 where id=v_otp.id; return jsonb_build_object('verified',false,'reason','OTP_INVALID','attemptsRemaining',greatest(0,v_otp.max_attempts-v_otp.attempts-1)); end if;
  update public.service_job_otps set used_at=now() where id=v_otp.id;
  if p_purpose='start' then update public.service_bookings set start_verified_at=now(), status=case when status in ('accepted','assigned','travelling','arrived') then 'started' else status end where id=p_booking_id; end if;
  return jsonb_build_object('verified',true,'bookingId',p_booking_id);
end $$;
revoke all on function public.issue_service_job_otp(uuid,text), public.verify_service_job_otp(uuid,text,text) from public, anon;
grant execute on function public.issue_service_job_otp(uuid,text), public.verify_service_job_otp(uuid,text,text) to authenticated;

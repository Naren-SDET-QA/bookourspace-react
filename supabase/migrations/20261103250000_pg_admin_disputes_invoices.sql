-- PG & Hostels: administrator operations, disputes, offline collection claims
-- and server-backed invoices.
--
-- Additive only. It reuses public.bookings, public.payment_intents,
-- public.payment_provider_events and public.stay_allocations.
--
-- Money and evidence rules enforced here:
--   * An administrator can never mark an online payment as paid. Only a
--     provider-signed event can do that. What an administrator can do is
--     approve a claim that the OWNER collected the money at the property;
--     that is stored as `collected_offline`, never as `verified`.
--   * A fee waiver only ever reduces the amount owed on a reservation that has
--     not been paid and has no open payment intent. It can never reduce money
--     that was already collected.
--   * A refund is only *approved* here. The money itself moves when the
--     provider reconciles the refund, and only then is the bed released.
--   * Every administrator action carries a mandatory reason and is written to
--     an append-only audit table that no role, not even service_role, can
--     update or delete.
--   * An invoice states the money state that the database actually holds. A
--     receipt for an unpaid reservation is never marked paid.

-- -----------------------------------------------------------------------------
-- 0. Widen the booking payment states that this module needs
-- -----------------------------------------------------------------------------
-- `collected_offline` = the owner declared an off-platform collection and an
--                       administrator approved it. It is deliberately NOT
--                       `verified`, which only the provider can set.
-- `refund_pending`     = a refund was approved and is awaiting the provider.
alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check
  check (payment_status in ('pay_later', 'pending_verification', 'verified', 'failed',
                             'refunded', 'collected_offline', 'refund_pending'));

alter table public.bookings drop constraint if exists bookings_payment_mode_check;
alter table public.bookings add constraint bookings_payment_mode_check
  check (payment_mode in ('pay_later', 'pay_after_service', 'upi', 'razorpay'));

-- The intent table carries the same payment-mode vocabulary.
alter table public.payment_intents drop constraint if exists payment_intents_payment_mode_check;
alter table public.payment_intents add constraint payment_intents_payment_mode_check
  check (payment_mode in ('upi', 'pay_after_service', 'razorpay'));

-- -----------------------------------------------------------------------------
-- 1. Who is this actor for this reservation?
-- -----------------------------------------------------------------------------
create or replace function public.pg_booking_actor_role(p_booking_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_booking public.bookings;
  v_owner uuid;
begin
  if v_uid is null then return null; end if;
  -- A STABLE function may not take row locks, so this is a plain read.
  select * into v_profile from public.profiles where id = v_uid and account_status = 'active';
  if v_profile.id is null then return null; end if;
  select * into v_booking from public.bookings
   where id = p_booking_id and payload ->> 'source' = 'pg_booking';
  if v_booking.id is null then return null; end if;
  if v_profile.role = 'admin' then return 'admin'; end if;
  if v_booking.user_id = v_uid then return 'customer'; end if;
  select l.owner_id into v_owner from public.listings l where l.id = v_booking.listing_id;
  if v_owner = v_uid then return 'provider'; end if;
  return null;
end;
$$;

revoke all on function public.pg_booking_actor_role(text) from public, anon;
grant execute on function public.pg_booking_actor_role(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Append-only administrator audit trail
-- -----------------------------------------------------------------------------
create table if not exists public.pg_admin_audit (
  id          bigserial primary key,
  booking_id  text references public.bookings(id) on delete restrict,
  dispute_id  uuid,
  actor       uuid references public.profiles(id) on delete set null,
  actor_role  text not null check (actor_role in ('customer', 'provider', 'admin', 'system')),
  action      text not null,
  reason      text not null default '',
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_pg_admin_audit_booking on public.pg_admin_audit (booking_id, created_at desc);
create index if not exists idx_pg_admin_audit_action on public.pg_admin_audit (action, created_at desc);

alter table public.pg_admin_audit enable row level security;
revoke all on public.pg_admin_audit from public, anon, authenticated;
grant select on public.pg_admin_audit to authenticated, service_role;
grant insert on public.pg_admin_audit to service_role;

drop policy if exists "PG admin audit readable by booking parties" on public.pg_admin_audit;
create policy "PG admin audit readable by booking parties"
  on public.pg_admin_audit for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
       where b.id::text = pg_admin_audit.booking_id
         and b.payload ->> 'source' = 'pg_booking'
         and (
           b.user_id = auth.uid()
           or exists (select 1 from public.listings l where l.id = b.listing_id and l.owner_id = auth.uid())
         )
    )
  );

-- The audit trail is append-only for everybody, including service_role.
create or replace function public.pg_admin_audit_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'PG_AUDIT_IMMUTABLE' using errcode = '42501';
end;
$$;

drop trigger if exists trg_pg_admin_audit_immutable on public.pg_admin_audit;
create trigger trg_pg_admin_audit_immutable
  before update or delete on public.pg_admin_audit
  for each row execute function public.pg_admin_audit_immutable();

-- -----------------------------------------------------------------------------
-- 3. Disputes
-- -----------------------------------------------------------------------------
create table if not exists public.pg_booking_disputes (
  id                      uuid primary key default gen_random_uuid(),
  booking_id              text not null references public.bookings(id) on delete restrict,
  opened_by               uuid not null references public.profiles(id) on delete restrict,
  opener_role             text not null check (opener_role in ('customer', 'provider', 'admin')),
  category                text not null check (category in (
                            'payment_not_received', 'duplicate_charge', 'refund_delay',
                            'bed_unavailable', 'terms_not_honoured', 'other')),
  reason                  text not null check (length(btrim(reason)) between 10 and 2000),
  evidence                jsonb not null default '[]'::jsonb,
  amount_in_dispute_paise bigint check (amount_in_dispute_paise is null or amount_in_dispute_paise >= 0),
  status                  text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'rejected')),
  resolution              text,
  refund_approved_paise   bigint check (refund_approved_paise is null or refund_approved_paise >= 0),
  resolved_by             uuid references public.profiles(id) on delete restrict,
  resolved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint pg_dispute_resolution_shape check (
    status not in ('resolved', 'rejected')
    or (resolution is not null and length(btrim(resolution)) between 10 and 2000
        and resolved_by is not null and resolved_at is not null)
  )
);

-- One active dispute per reservation.
create unique index if not exists uniq_pg_booking_active_dispute
  on public.pg_booking_disputes (booking_id) where status in ('open', 'under_review');
create index if not exists idx_pg_booking_disputes_booking
  on public.pg_booking_disputes (booking_id, created_at desc);

alter table public.pg_booking_disputes enable row level security;
revoke all on public.pg_booking_disputes from public, anon, authenticated;
grant select on public.pg_booking_disputes to authenticated, service_role;

drop policy if exists "PG booking parties read disputes" on public.pg_booking_disputes;
create policy "PG booking parties read disputes"
  on public.pg_booking_disputes for select to authenticated
  using (public.pg_booking_actor_role(booking_id) is not null);

-- -----------------------------------------------------------------------------
-- 4. Offline collection claims (owner declares, administrator approves)
-- -----------------------------------------------------------------------------
create table if not exists public.pg_payment_claims (
  id            uuid primary key default gen_random_uuid(),
  booking_id    text not null references public.bookings(id) on delete restrict,
  claimed_by    uuid not null references public.profiles(id) on delete restrict,
  method        text not null check (method in ('cash', 'upi_to_owner', 'bank_transfer')),
  reference     text not null check (length(btrim(reference)) between 4 and 120),
  note          text check (note is null or length(note) <= 1000),
  amount_paise  bigint not null check (amount_paise > 0),
  evidence      jsonb not null default '[]'::jsonb,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_note text,
  decided_by    uuid references public.profiles(id) on delete restrict,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint pg_payment_claim_decision_shape check (
    status = 'pending'
    or (decision_note is not null and length(btrim(decision_note)) between 5 and 1000
        and decided_by is not null and decided_at is not null)
  )
);

create index if not exists idx_pg_payment_claims_booking on public.pg_payment_claims (booking_id, created_at desc);
create index if not exists idx_pg_payment_claims_pending on public.pg_payment_claims (status, created_at desc);

alter table public.pg_payment_claims enable row level security;
revoke all on public.pg_payment_claims from public, anon, authenticated;
grant select on public.pg_payment_claims to authenticated, service_role;

drop policy if exists "PG booking parties read payment claims" on public.pg_payment_claims;
create policy "PG booking parties read payment claims"
  on public.pg_payment_claims for select to authenticated
  using (public.pg_booking_actor_role(booking_id) is not null);

-- -----------------------------------------------------------------------------
-- 5. Server-backed invoices and receipts
-- -----------------------------------------------------------------------------
create table if not exists public.pg_invoices (
  id                      uuid primary key default gen_random_uuid(),
  invoice_number          text not null unique,
  booking_id              text not null references public.bookings(id) on delete restrict,
  kind                    text not null check (kind in ('booking_invoice', 'payment_receipt', 'refund_receipt')),
  status                  text not null check (status in (
                            'unpaid', 'payment_pending', 'paid', 'collected_offline', 'refunded', 'cancelled')),
  user_id                 uuid references public.profiles(id) on delete restrict,
  listing_id              text,
  listing_title           text,
  currency                text not null default 'INR',
  rent_paise              bigint not null default 0,
  deposit_paise           bigint not null default 0,
  tax_paise               bigint not null default 0,
  tax_percent             numeric(5,2) not null default 0,
  tax_applied             boolean not null default false,
  total_paise             bigint not null default 0,
  provider_paid_paise     bigint not null default 0,
  offline_collected_paise bigint not null default 0,
  refund_paise            bigint not null default 0,
  provider                text,
  provider_payment_id     text,
  issued_at               timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint pg_invoice_no_spurious_paid check (provider_paid_paise = 0 or status in ('paid', 'refunded')),
  constraint pg_invoice_amounts check (
    total_paise >= 0 and deposit_paise >= 0 and rent_paise >= 0 and tax_paise >= 0
    and provider_paid_paise >= 0 and offline_collected_paise >= 0 and refund_paise >= 0
  )
);

drop index if exists uniq_pg_invoice_booking_kind;
-- A new document is issued when the money state changes; the same document
-- is returned while nothing has changed.
create index if not exists idx_pg_invoices_booking_kind on public.pg_invoices (booking_id, kind, created_at desc);
create index if not exists idx_pg_invoices_booking on public.pg_invoices (booking_id, issued_at desc);

alter table public.pg_invoices enable row level security;
revoke all on public.pg_invoices from public, anon, authenticated;
grant select on public.pg_invoices to authenticated, service_role;

drop policy if exists "PG booking parties read invoices" on public.pg_invoices;
create policy "PG booking parties read invoices"
  on public.pg_invoices for select to authenticated
  using (public.pg_booking_actor_role(booking_id) is not null);

-- -----------------------------------------------------------------------------
-- 6. Disputes: open, review, resolve
-- -----------------------------------------------------------------------------
create or replace function public.pg_open_dispute(
  p_booking_id text,
  p_category text,
  p_reason text,
  p_evidence jsonb,
  p_amount_in_dispute_paise bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_role text;
  v_row public.pg_booking_disputes;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_profile from public.profiles where id = v_uid and account_status = 'active' for share;
  if v_profile.id is null then raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501'; end if;

  if p_category is null or p_category not in ('payment_not_received', 'duplicate_charge', 'refund_delay',
                                               'bed_unavailable', 'terms_not_honoured', 'other') then
    raise exception 'INVALID_DISPUTE_CATEGORY' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 or length(p_reason) > 2000 then
    raise exception 'INVALID_DISPUTE_REASON' using errcode = '22023';
  end if;
  if p_amount_in_dispute_paise is not null and p_amount_in_dispute_paise < 0 then
    raise exception 'INVALID_DISPUTE_AMOUNT' using errcode = '22023';
  end if;

  v_role := public.pg_booking_actor_role(p_booking_id);
  if v_role is null or v_role = 'admin' then
    -- An administrator opens a dispute on behalf of a party; record it as admin.
    if v_role is null then raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;

  if exists (select 1 from public.pg_booking_disputes d
              where d.booking_id = p_booking_id and d.status in ('open', 'under_review')) then
    raise exception 'PG_DISPUTE_ALREADY_OPEN' using errcode = '23505';
  end if;

  insert into public.pg_booking_disputes
    (booking_id, opened_by, opener_role, category, reason, evidence, amount_in_dispute_paise)
  values (
    p_booking_id, v_uid, v_role, p_category, trim(p_reason),
    coalesce(p_evidence, '[]'::jsonb), p_amount_in_dispute_paise
  )
  returning * into v_row;

  insert into public.pg_admin_audit (booking_id, dispute_id, actor, actor_role, action, reason, detail)
  values (p_booking_id, v_row.id, v_uid, v_role, 'dispute_opened', trim(p_reason),
          jsonb_build_object('category', p_category, 'amountInDisputePaise', p_amount_in_dispute_paise));

  return public.pg_dispute_json(v_row);
end;
$$;

revoke all on function public.pg_open_dispute(text, text, text, jsonb, bigint) from public, anon;
grant execute on function public.pg_open_dispute(text, text, text, jsonb, bigint) to authenticated, service_role;

create or replace function public.pg_review_dispute(p_dispute_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_row public.pg_booking_disputes;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_profile from public.profiles where id = v_uid and account_status = 'active' for share;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_note is null or length(btrim(p_note)) < 5 or length(p_note) > 2000 then
    raise exception 'INVALID_DISPUTE_NOTE' using errcode = '22023';
  end if;

  select * into v_row from public.pg_booking_disputes where id = p_dispute_id for update;
  if v_row.id is null then raise exception 'PG_DISPUTE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_row.status <> 'open' then raise exception 'PG_DISPUTE_NOT_REVIEWABLE' using errcode = '22023'; end if;

  update public.pg_booking_disputes
     set status = 'under_review', updated_at = now()
   where id = v_row.id
  returning * into v_row;

  insert into public.pg_admin_audit (booking_id, dispute_id, actor, actor_role, action, reason, detail)
  values (v_row.booking_id, v_row.id, v_uid, 'admin', 'dispute_under_review', trim(p_note), '{}'::jsonb);

  return public.pg_dispute_json(v_row);
end;
$$;

revoke all on function public.pg_review_dispute(uuid, text) from public, anon;
grant execute on function public.pg_review_dispute(uuid, text) to authenticated, service_role;

-- Resolving a dispute never moves money. When a refund is approved the
-- reservation is parked at `refund_pending`; the provider still has to
-- reconcile the refund before the bed is released.
create or replace function public.pg_resolve_dispute(
  p_dispute_id uuid,
  p_resolution text,
  p_refund_paise bigint,
  p_reject boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_row public.pg_booking_disputes;
  v_booking public.bookings;
  v_status text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_profile from public.profiles where id = v_uid and account_status = 'active' for share;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_resolution is null or length(btrim(p_resolution)) < 10 or length(p_resolution) > 2000 then
    raise exception 'INVALID_DISPUTE_RESOLUTION' using errcode = '22023';
  end if;
  if coalesce(p_reject, false) and coalesce(p_refund_paise, 0) > 0 then
    raise exception 'REFUND_NOT_ALLOWED_ON_REJECTION' using errcode = '22023';
  end if;
  if coalesce(p_refund_paise, 0) < 0 then
    raise exception 'INVALID_REFUND_AMOUNT' using errcode = '22023';
  end if;

  select * into v_row from public.pg_booking_disputes where id = p_dispute_id for update;
  if v_row.id is null then raise exception 'PG_DISPUTE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_row.status not in ('open', 'under_review') then
    raise exception 'PG_DISPUTE_ALREADY_RESOLVED' using errcode = '22023';
  end if;

  v_status := case when coalesce(p_reject, false) then 'rejected' else 'resolved' end;

  update public.pg_booking_disputes
     set status = v_status, resolution = trim(p_resolution),
         refund_approved_paise = case when coalesce(p_reject, false) then null else coalesce(p_refund_paise, 0) end,
         resolved_by = v_uid, resolved_at = now(), updated_at = now()
   where id = v_row.id
  returning * into v_row;

  if coalesce(p_refund_paise, 0) > 0 then
    select * into v_booking from public.bookings where id = v_row.booking_id for update;
    if v_booking.id is null then raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_booking.payment_status <> 'verified' then
      raise exception 'REFUND_REQUIRES_VERIFIED_PAYMENT' using errcode = '42501';
    end if;
    update public.bookings
       set status = 'cancellation_pending',
           payment_status = 'refund_pending',
           refund_paise = coalesce(p_refund_paise, 0),
           updated_at = now()
     where id = v_booking.id;
  end if;

  insert into public.pg_admin_audit (booking_id, dispute_id, actor, actor_role, action, reason, detail)
  values (v_row.booking_id, v_row.id, v_uid, 'admin',
          case when v_status = 'rejected' then 'dispute_rejected' else 'dispute_resolved' end,
          trim(p_resolution),
          jsonb_build_object('refundApprovedPaise', coalesce(p_refund_paise, 0)));

  return public.pg_dispute_json(v_row);
end;
$$;

revoke all on function public.pg_resolve_dispute(uuid, text, bigint, boolean) from public, anon;
grant execute on function public.pg_resolve_dispute(uuid, text, bigint, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Offline collection claim: owner declares, administrator approves
-- -----------------------------------------------------------------------------
create or replace function public.pg_submit_payment_claim(
  p_booking_id text,
  p_method text,
  p_reference text,
  p_note text,
  p_amount_paise bigint,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_role text;
  v_booking public.bookings;
  v_row public.pg_payment_claims;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_profile from public.profiles where id = v_uid and account_status = 'active' for share;
  if v_profile.id is null then raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501'; end if;

  if p_method is null or p_method not in ('cash', 'upi_to_owner', 'bank_transfer') then
    raise exception 'INVALID_CLAIM_METHOD' using errcode = '22023';
  end if;
  if p_reference is null or length(btrim(p_reference)) < 4 or length(p_reference) > 120 then
    raise exception 'INVALID_CLAIM_REFERENCE' using errcode = '22023';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'INVALID_CLAIM_AMOUNT' using errcode = '22023';
  end if;
  if p_amount_paise > 2000000000 then
    raise exception 'PG_AMOUNT_LIMIT_EXCEEDED' using errcode = '22003';
  end if;

  v_role := public.pg_booking_actor_role(p_booking_id);
  if v_role is null then raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_role <> 'provider' and v_role <> 'admin' then
    raise exception 'PG_CLAIM_NOT_PERMITTED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_booking.payment_status in ('verified', 'refunded', 'collected_offline') then
    raise exception 'PG_CLAIM_NOT_ALLOWED' using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_intents i
              where i.booking_id = p_booking_id and i.status in ('created', 'pending')) then
    raise exception 'PG_PAYMENT_PENDING' using errcode = '22023';
  end if;

  insert into public.pg_payment_claims
    (booking_id, claimed_by, method, reference, note, amount_paise, evidence)
  values (p_booking_id, v_uid, p_method, trim(p_reference), p_note, p_amount_paise,
          coalesce(p_evidence, '[]'::jsonb))
  returning * into v_row;

  insert into public.pg_admin_audit (booking_id, actor, actor_role, action, reason, detail)
  values (p_booking_id, v_uid, v_role, 'payment_claim_submitted', trim(p_reference),
          jsonb_build_object('method', p_method, 'amountPaise', p_amount_paise));

  return public.pg_claim_json(v_row);
end;
$$;

revoke all on function public.pg_submit_payment_claim(text, text, text, text, bigint, jsonb) from public, anon;
grant execute on function public.pg_submit_payment_claim(text, text, text, text, bigint, jsonb) to authenticated, service_role;

create or replace function public.pg_decide_payment_claim(
  p_claim_id uuid,
  p_decision text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_row public.pg_payment_claims;
  v_booking public.bookings;
  v_decision text := lower(coalesce(trim(p_decision), ''));
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_profile from public.profiles where id = v_uid and account_status = 'active' for share;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if v_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_CLAIM_DECISION' using errcode = '22023';
  end if;
  if p_note is null or length(btrim(p_note)) < 5 or length(p_note) > 1000 then
    raise exception 'INVALID_CLAIM_DECISION_NOTE' using errcode = '22023';
  end if;

  select * into v_row from public.pg_payment_claims where id = p_claim_id for update;
  if v_row.id is null then raise exception 'PG_CLAIM_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_row.status <> 'pending' then raise exception 'PG_CLAIM_ALREADY_DECIDED' using errcode = '22023'; end if;

  update public.pg_payment_claims
     set status = v_decision, decision_note = trim(p_note), decided_by = v_uid, decided_at = now(), updated_at = now()
   where id = v_row.id
  returning * into v_row;

  if v_decision = 'approved' then
    select * into v_booking from public.bookings where id = v_row.booking_id for update;
    if v_booking.id is null then raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_booking.payment_status in ('verified', 'refunded') then
      raise exception 'PG_CLAIM_NOT_ALLOWED' using errcode = '22023';
    end if;
    -- This is an owner-declared, administrator-approved collection. It is
    -- deliberately NOT `verified`: no provider reconciled this money.
    update public.bookings
       set payment_status = 'collected_offline',
           payment_utr = v_row.reference,
           updated_at = now()
     where id = v_booking.id;
  end if;

  insert into public.pg_admin_audit (booking_id, actor, actor_role, action, reason, detail)
  values (v_row.booking_id, v_uid, 'admin',
          case when v_decision = 'approved' then 'payment_claim_approved' else 'payment_claim_rejected' end,
          trim(p_note),
          jsonb_build_object('claimId', v_row.id, 'method', v_row.method,
                              'amountPaise', v_row.amount_paise, 'reference', v_row.reference));

  return public.pg_claim_json(v_row);
end;
$$;

revoke all on function public.pg_decide_payment_claim(uuid, text, text) from public, anon;
grant execute on function public.pg_decide_payment_claim(uuid, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. Administrator money operations: fee waiver and refund approval
-- -----------------------------------------------------------------------------
-- A waiver reduces the amount owed on a reservation that has not been paid
-- and has no open payment intent. It can never touch money that was
-- collected, and it can never make a payment look successful.
create or replace function public.pg_admin_waive_fee(
  p_booking_id text,
  p_amount_paise bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_booking public.bookings;
  v_total bigint;
  v_waived bigint;
  v_rent bigint;
  v_deposit bigint;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_profile from public.profiles where id = v_uid and account_status = 'active' for share;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 or length(p_reason) > 500 then
    raise exception 'ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'INVALID_WAIVER_AMOUNT' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.payload ->> 'source' <> 'pg_booking' then
    raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.payment_status in ('verified', 'refunded', 'collected_offline') then
    raise exception 'PG_WAIVER_REQUIRES_UNPAID_BOOKING' using errcode = '42501';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'PG_BOOKING_NOT_ADJUSTABLE' using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_intents i
              where i.booking_id = p_booking_id and i.status in ('created', 'pending')) then
    raise exception 'PG_PAYMENT_PENDING' using errcode = '22023';
  end if;

  v_total := coalesce(v_booking.total_paise, 0);
  if p_amount_paise >= v_total then
    raise exception 'INVALID_WAIVER_AMOUNT' using errcode = '22023';
  end if;

  v_rent := coalesce((v_booking.payload ->> 'rentPaise')::bigint, 0);
  v_deposit := coalesce((v_booking.payload ->> 'depositPaise')::bigint, 0);
  v_waived := p_amount_paise;

  -- A waiver reduces the deposit first, then the rent.
  if v_deposit >= v_waived then
    v_deposit := v_deposit - v_waived;
  else
    v_rent := greatest(0, v_rent - (v_waived - coalesce((v_booking.payload ->> 'depositPaise')::bigint, 0)));
    v_deposit := 0;
  end if;

  update public.bookings
     set total_paise = v_total - v_waived,
         amount = (v_total - v_waived) / 100.0,
         payload = payload || jsonb_build_object(
           'rentPaise', v_rent,
           'depositPaise', v_deposit,
           'totalDuePaise', v_total - v_waived,
           'waivedPaise', coalesce((v_booking.payload ->> 'waivedPaise')::bigint, 0) + v_waived,
           'waivers', coalesce(v_booking.payload -> 'waivers', '[]'::jsonb) || jsonb_build_array(
             jsonb_build_object('amountPaise', v_waived, 'reason', trim(p_reason),
                                'actor', v_uid::text, 'at', now())
           )
         ),
         updated_at = now()
   where id = v_booking.id
  returning * into v_booking;

  insert into public.pg_admin_audit (booking_id, actor, actor_role, action, reason, detail)
  values (p_booking_id, v_uid, 'admin', 'fee_waived', trim(p_reason),
          jsonb_build_object('waivedPaise', v_waived, 'totalBeforePaise', v_total,
                              'totalAfterPaise', v_booking.total_paise));

  return jsonb_build_object(
    'ok', true,
    'bookingId', v_booking.id,
    'waivedPaise', v_waived,
    'totalPaise', v_booking.total_paise,
    'rentPaise', v_rent,
    'depositPaise', v_deposit,
    'paymentStatus', v_booking.payment_status
  );
end;
$$;

revoke all on function public.pg_admin_waive_fee(text, bigint, text) from public, anon;
grant execute on function public.pg_admin_waive_fee(text, bigint, text) to authenticated, service_role;

-- Approving a refund never moves money. The reservation is parked at
-- `refund_pending` and the bed is released only when the provider confirms
-- the refund.
create or replace function public.pg_admin_approve_refund(
  p_booking_id text,
  p_amount_paise bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_booking public.bookings;
  v_intent public.payment_intents;
  v_amount bigint;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_profile from public.profiles where id = v_uid and account_status = 'active' for share;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 or length(p_reason) > 500 then
    raise exception 'ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'INVALID_REFUND_AMOUNT' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.payload ->> 'source' <> 'pg_booking' then
    raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.payment_status <> 'verified' then
    raise exception 'REFUND_REQUIRES_VERIFIED_PAYMENT' using errcode = '42501';
  end if;

  select * into v_intent
    from public.payment_intents
   where booking_id = p_booking_id
   order by created_at desc
   limit 1;
  if v_intent.id is null then raise exception 'PAYMENT_INTENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_intent.status <> 'verified' then
    raise exception 'PAYMENT_NOT_VERIFIED' using errcode = '42501';
  end if;

  v_amount := least(p_amount_paise, v_intent.amount_paise);
  if v_amount <= 0 then raise exception 'INVALID_REFUND_AMOUNT' using errcode = '22023'; end if;

  update public.bookings
     set status = 'cancellation_pending',
         payment_status = 'refund_pending',
         refund_paise = v_amount,
         updated_at = now()
   where id = v_booking.id
  returning * into v_booking;

  insert into public.pg_admin_audit (booking_id, actor, actor_role, action, reason, detail)
  values (p_booking_id, v_uid, 'admin', 'refund_approved', trim(p_reason),
          jsonb_build_object('refundApprovedPaise', v_amount, 'intentId', v_intent.id,
                              'inventoryReleased', false));

  return jsonb_build_object(
    'ok', true,
    'bookingId', v_booking.id,
    'intentId', v_intent.id,
    'refundApprovedPaise', v_amount,
    'paymentStatus', v_booking.payment_status,
    'bookingStatus', v_booking.status,
    'inventoryReleased', false,
    'note', 'Refund approved. The money moves only when the payment provider reconciles the refund.'
  );
end;
$$;

revoke all on function public.pg_admin_approve_refund(text, bigint, text) from public, anon;
grant execute on function public.pg_admin_approve_refund(text, bigint, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. Provider-bound settlement for PG (UPI and Razorpay)
-- -----------------------------------------------------------------------------
-- Unlike the generic stay settlement, this refuses an event whose provider
-- does not match the payment method the customer actually chose, and it
-- refuses a refund that the booking is not expecting.
create or replace function public.pg_settle_verified_payment(
  p_event_id text,
  p_intent_id text,
  p_booking_id text,
  p_event_type text,
  p_provider text,
  p_provider_reference text,
  p_amount_paise bigint,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The provider path has no end-user identity. `auth.uid()` is not used
  -- here on purpose: a transaction-local JWT claim GUC can hold an empty
  -- string on a pooled connection, which would break the cast to json.
  v_uid uuid := null;
  v_intent public.payment_intents;
  v_booking public.bookings;
  v_inserted int;
begin
  if p_event_id is null or p_intent_id is null or p_booking_id is null
     or p_provider is null or p_provider_reference is null or p_payload_hash is null then
    raise exception 'INVALID_PROVIDER_EVENT' using errcode = '22023';
  end if;
  if p_event_type not in ('payment.captured', 'payment.failed', 'refund.succeeded') then
    raise exception 'INVALID_PROVIDER_EVENT_TYPE' using errcode = '22023';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'INVALID_PROVIDER_EVENT' using errcode = '22023';
  end if;

  insert into public.payment_provider_events
    (event_id, provider, intent_id, event_type, payload_sha256, amount_paise)
  values (p_event_id, p_provider, p_intent_id, p_event_type, p_payload_hash, p_amount_paise)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_intent from public.payment_intents where id = p_intent_id for update;
  if v_intent.id is null then raise exception 'PAYMENT_INTENT_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'replayed', true, 'bookingId', v_booking.id,
                              'intentStatus', v_intent.status, 'bookingPaymentStatus', v_booking.payment_status);
  end if;

  if v_intent.booking_id is distinct from v_booking.id then
    raise exception 'PAYMENT_BINDING_MISMATCH' using errcode = '42501';
  end if;
  if v_intent.amount_paise <> p_amount_paise then
    raise exception 'PAYMENT_AMOUNT_MISMATCH' using errcode = '22023';
  end if;

  -- The provider must match the channel the customer chose, and the event
  -- must come from that same provider. A Razorpay event can never settle a
  -- UPI reservation and a UPI event can never settle a Razorpay one.
  if v_intent.provider <> p_provider then
    raise exception 'PAYMENT_PROVIDER_MISMATCH' using errcode = '42501';
  end if;
  if v_booking.payment_mode = 'upi' and v_intent.provider not in ('upi_sandbox', 'upi_webhook') then
    raise exception 'PAYMENT_PROVIDER_MISMATCH' using errcode = '42501';
  end if;
  if v_booking.payment_mode = 'razorpay' and v_intent.provider <> 'razorpay' then
    raise exception 'PAYMENT_PROVIDER_MISMATCH' using errcode = '42501';
  end if;
  if v_booking.payment_mode not in ('upi', 'razorpay') then
    raise exception 'PAYMENT_PROVIDER_MISMATCH' using errcode = '42501';
  end if;

  if p_event_type = 'payment.captured' then
    if v_intent.status not in ('created', 'pending') then
      raise exception 'PAYMENT_INTENT_NOT_SETTLEABLE' using errcode = '42501';
    end if;
    if v_intent.expires_at < now() then raise exception 'PAYMENT_INTENT_EXPIRED' using errcode = '22023'; end if;
    update public.payment_intents
       set status = 'verified', provider_payment_id = p_provider_reference, verified_at = now(), updated_at = now()
     where id = v_intent.id;
    update public.bookings
       set payment_status = 'verified', payment_utr = p_provider_reference, updated_at = now()
     where id = v_booking.id and payment_status <> 'verified';
  elsif p_event_type = 'payment.failed' then
    update public.payment_intents set status = 'failed', updated_at = now()
     where id = v_intent.id and status in ('created', 'pending');
    update public.bookings
       set payment_status = 'failed', updated_at = now()
     where id = v_booking.id and payment_status = 'pending_verification';
  else
    if v_intent.status <> 'verified' then
      raise exception 'PAYMENT_NOT_VERIFIED' using errcode = '42501';
    end if;
    if v_booking.payment_status <> 'refund_pending' then
      raise exception 'REFUND_NOT_EXPECTED' using errcode = '42501';
    end if;
    if coalesce(v_booking.refund_paise, 0) <> p_amount_paise then
      raise exception 'REFUND_AMOUNT_MISMATCH' using errcode = '22023';
    end if;
    update public.payment_intents
       set status = 'refunded', refund_paise = p_amount_paise, refunded_at = now(), updated_at = now()
     where id = v_intent.id;
    update public.bookings
       set payment_status = 'refunded', status = 'cancelled', cancelled_at = now(), updated_at = now()
     where id = v_booking.id;
    update public.stay_allocations
       set status = 'released', updated_at = now()
     where booking_id = v_booking.id and status in ('held', 'confirmed');
  end if;

  insert into public.pg_admin_audit (booking_id, actor, actor_role, action, reason, detail)
  values (v_booking.id, v_uid, 'system', 'provider_' || p_event_type, 'provider reconciliation',
          jsonb_build_object('intentId', v_intent.id, 'providerPaymentId', p_provider_reference,
                              'amountPaise', p_amount_paise));

  update public.payment_provider_events set processed_at = now() where event_id = p_event_id;

  select * into v_booking from public.bookings where id = p_booking_id;
  return jsonb_build_object('ok', true, 'replayed', false, 'bookingId', v_booking.id,
                            'intentStatus', v_intent.status, 'bookingPaymentStatus', v_booking.payment_status);
end;
$$;

revoke all on function public.pg_settle_verified_payment(text, text, text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.pg_settle_verified_payment(text, text, text, text, text, text, bigint, text) to service_role;

-- -----------------------------------------------------------------------------
-- 10. Server-backed invoices and receipts
-- -----------------------------------------------------------------------------
create or replace function public.pg_issue_invoice(
  p_booking_id text,
  p_kind text,
  p_tax_percent numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_booking public.bookings;
  v_intent public.payment_intents;
  v_claim public.pg_payment_claims;
  v_row public.pg_invoices;
  v_status text;
  v_rent bigint;
  v_deposit bigint;
  v_total bigint;
  v_tax numeric(5,2);
  v_tax_paise bigint;
  v_provider_paid bigint := 0;
  v_offline bigint := 0;
  v_refund bigint := 0;
  v_number text;
  v_existing public.pg_invoices;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_role := public.pg_booking_actor_role(p_booking_id);
  if v_role is null then raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;

  if p_kind is null or p_kind not in ('booking_invoice', 'payment_receipt', 'refund_receipt') then
    raise exception 'INVALID_INVOICE_KIND' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into v_intent
    from public.payment_intents
   where booking_id = p_booking_id
   order by created_at desc
   limit 1;

  select * into v_claim
    from public.pg_payment_claims
   where booking_id = p_booking_id and status = 'approved'
   order by created_at desc
   limit 1;

  v_rent := coalesce((v_booking.payload ->> 'rentPaise')::bigint, 0);
  v_deposit := coalesce((v_booking.payload ->> 'depositPaise')::bigint, 0);
  v_total := coalesce(v_booking.total_paise, v_rent + v_deposit);

  v_tax := round(coalesce(p_tax_percent, 0), 2);
  if v_tax < 0 or v_tax > 100 then v_tax := 0; end if;
  v_tax_paise := round(v_total * v_tax / 100.0)::bigint;

  -- The money state comes from the database, never from the caller.
  if v_booking.payment_status = 'verified' then
    v_status := 'paid';
    v_provider_paid := v_total + v_tax_paise;
  elsif v_booking.payment_status = 'refunded' then
    v_status := 'refunded';
    v_provider_paid := v_total + v_tax_paise;
    v_refund := coalesce(v_booking.refund_paise, 0);
  elsif v_booking.payment_status = 'collected_offline' then
    v_status := 'collected_offline';
    v_offline := coalesce(v_claim.amount_paise, 0) + v_tax_paise;
  elsif v_booking.payment_status = 'pending_verification' then
    v_status := 'payment_pending';
  elsif v_booking.status = 'cancelled' then
    v_status := 'cancelled';
  else
    v_status := 'unpaid';
  end if;

  if p_kind = 'refund_receipt' and v_refund <= 0 then
    raise exception 'NO_REFUND_TO_RECEIPT' using errcode = '22023';
  end if;

  -- The same document is returned while nothing has changed. A new document
  -- with a new number is issued as soon as the money state or the amount
  -- changes, so a document never contradicts the database.
  select * into v_existing
    from public.pg_invoices
   where booking_id = p_booking_id and kind = p_kind
   order by created_at desc
   limit 1;
  if v_existing.id is not null
     and v_existing.status = v_status
     and v_existing.total_paise = v_total + v_tax_paise
     and v_existing.provider_paid_paise = v_provider_paid
     and v_existing.offline_collected_paise = v_offline
     and v_existing.refund_paise = v_refund then
    return jsonb_build_object('ok', true, 'replayed', true) || public.pg_invoice_json(v_existing);
  end if;

  v_number := 'BOS-PG-' || upper(substr(replace(p_booking_id, '-', ''), 1, 10)) || '-' ||
              upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.pg_invoices (
    invoice_number, booking_id, kind, status, user_id, listing_id, listing_title,
    rent_paise, deposit_paise, tax_paise, tax_percent, tax_applied, total_paise,
    provider_paid_paise, offline_collected_paise, refund_paise, provider, provider_payment_id
  ) values (
    v_number, v_booking.id, p_kind, v_status, v_booking.user_id, v_booking.listing_id,
    v_booking.listing_title, v_rent, v_deposit, v_tax_paise, v_tax, v_tax > 0,
    v_total + v_tax_paise, v_provider_paid, v_offline, v_refund,
    v_intent.provider, coalesce(v_intent.provider_payment_id, v_booking.payment_utr)
  )
  returning * into v_row;

  insert into public.pg_admin_audit (booking_id, actor, actor_role, action, reason, detail)
  values (v_booking.id, v_uid, v_role, 'invoice_issued', 'customer request',
          jsonb_build_object('invoiceNumber', v_number, 'kind', p_kind, 'status', v_status));

  return jsonb_build_object('ok', true, 'replayed', false) || public.pg_invoice_json(v_row);
end;
$$;

revoke all on function public.pg_issue_invoice(text, text, numeric) from public, anon;
grant execute on function public.pg_issue_invoice(text, text, numeric) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 11. Administrator overview of PG reservations
-- -----------------------------------------------------------------------------
create or replace function public.pg_admin_booking_overview(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_profile from public.profiles where id = v_uid and account_status = 'active' for share;
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'createdAt' desc), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'bookingId', b.id,
      'listingId', b.listing_id,
      'listingTitle', b.listing_title,
      'customerUserId', b.user_id,
      'status', b.status,
      'paymentStatus', b.payment_status,
      'paymentMode', b.payment_mode,
      'paymentUtR', b.payment_utr,
      'rentPaise', coalesce((b.payload->>'rentPaise')::bigint, 0),
      'depositPaise', coalesce((b.payload->>'depositPaise')::bigint, 0),
      'waivedPaise', coalesce((b.payload->>'waivedPaise')::bigint, 0),
      'totalPaise', coalesce(b.total_paise, 0),
      'refundPaise', coalesce(b.refund_paise, 0),
      'moveIn', b.check_in,
      'moveOut', b.check_out,
      'createdAt', b.created_at,
      'intentId', (select i.id from public.payment_intents i where i.booking_id = b.id order by i.created_at desc limit 1),
      'intentStatus', (select i.status from public.payment_intents i where i.booking_id = b.id order by i.created_at desc limit 1),
      'disputeId', (select d.id from public.pg_booking_disputes d where d.booking_id = b.id order by d.created_at desc limit 1),
      'disputeStatus', (select d.status from public.pg_booking_disputes d where d.booking_id = b.id order by d.created_at desc limit 1),
      'claimId', (select c.id from public.pg_payment_claims c where c.booking_id = b.id order by c.created_at desc limit 1),
      'claimStatus', (select c.status from public.pg_payment_claims c where c.booking_id = b.id order by c.created_at desc limit 1),
      'invoiceNumber', (select inv.invoice_number from public.pg_invoices inv where inv.booking_id = b.id order by inv.created_at desc limit 1)
    ) as row_data
    from public.bookings b
    where b.payload ->> 'source' = 'pg_booking'
    order by b.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ) rows;

  return jsonb_build_object('ok', true, 'bookings', v_rows);
end;
$$;

revoke all on function public.pg_admin_booking_overview(integer) from public, anon;
grant execute on function public.pg_admin_booking_overview(integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 12. Razorpay (Test Mode) as a PG payment method
-- -----------------------------------------------------------------------------
-- The method is only offered when a Razorpay credential pair is configured.
-- The intent is created with provider = 'razorpay' so that the settlement
-- binding in pg_settle_verified_payment refuses any event that did not come
-- from Razorpay for a Razorpay reservation, and refuses a Razorpay event for
-- a UPI reservation.
--
-- The previous five-argument function is replaced, not overloaded, so there
-- is exactly one way to create a PG payment intent.
drop function if exists public.pg_create_payment_intent(text, text, text, text, text);

create or replace function public.pg_create_payment_intent(
  p_booking_id text,
  p_payment_mode text,
  p_idempotency_key text,
  p_merchant_vpa text,
  p_merchant_name text,
  p_provider_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_booking public.bookings;
  v_existing public.payment_intents;
  v_intent_id text;
  v_key text;
  v_amount bigint;
  v_upi_uri text;
  v_expires timestamptz;
  v_provider text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid for share;
  if v_profile.id is null or v_profile.account_status <> 'active' then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  if v_profile.role <> 'customer' then
    raise exception 'ACTIVE_CUSTOMER_REQUIRED' using errcode = '42501';
  end if;

  if p_payment_mode is null or p_payment_mode not in ('upi', 'pay_after_service', 'razorpay') then
    raise exception 'INVALID_PAYMENT_MODE' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 128 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if p_payment_mode = 'razorpay' and coalesce(trim(p_provider_reference), '') = '' then
    raise exception 'RAZORPAY_NOT_CONFIGURED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.payload ->> 'source' <> 'pg_booking' then
    raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.user_id <> v_uid then
    raise exception 'PG_BOOKING_NOT_OWNED' using errcode = '42501';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'PG_BOOKING_NOT_PAYABLE' using errcode = '22023';
  end if;
  if v_booking.payment_status in ('verified', 'collected_offline') then
    raise exception 'PG_BOOKING_ALREADY_PAID' using errcode = '22023';
  end if;

  -- Server-side amount. The booking total was computed by the database.
  v_amount := v_booking.total_paise;
  if v_amount is null or v_amount <= 0 then
    raise exception 'PG_AMOUNT_NOT_CONFIGURED' using errcode = '22023';
  end if;

  v_key := 'pg:' || v_uid::text || ':' || trim(p_idempotency_key);
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select * into v_existing
    from public.payment_intents
   where user_id = v_uid and idempotency_key = v_key;
  if v_existing.id is not null then
    if v_existing.booking_id <> p_booking_id
       or v_existing.amount_paise <> v_amount
       or v_existing.payment_mode <> p_payment_mode then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'bookingId', v_existing.booking_id,
      'intentId', v_existing.id,
      'paymentMode', v_existing.payment_mode,
      'status', v_existing.status,
      'amountPaise', v_existing.amount_paise,
      'upiUri', v_existing.upi_uri,
      'expiresAt', v_existing.expires_at,
      'bookingPaymentStatus', v_booking.payment_status
    );
  end if;

  if p_payment_mode = 'pay_after_service' then
    -- Pay at property: an explicit obligation, never an online payment.
    update public.bookings
       set payment_mode = 'pay_after_service', payment_status = 'pay_later', updated_at = now()
     where id = v_booking.id;

    update public.bookings
       set payload = payload || jsonb_build_object(
             'paymentObligation', jsonb_build_object(
               'mode', 'pay_after_service', 'amountPaise', v_amount,
               'recordedAt', now(), 'collectedOnline', false))
     where id = v_booking.id;

    perform public.pg_log_audit('pg_pay_at_property_selected', v_booking.id,
      jsonb_build_object('amountPaise', v_amount, 'actor', v_uid::text));

    return jsonb_build_object(
      'ok', true, 'replayed', false, 'bookingId', v_booking.id, 'intentId', null,
      'paymentMode', 'pay_after_service', 'status', 'pay_later', 'amountPaise', v_amount,
      'upiUri', null, 'bookingPaymentStatus', 'pay_later');
  end if;

  if p_payment_mode = 'upi' and coalesce(trim(p_merchant_vpa), '') = '' then
    raise exception 'MERCHANT_VPA_NOT_CONFIGURED' using errcode = '42501';
  end if;

  v_intent_id := 'pi_pg_' || replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + interval '30 minutes';

  if p_payment_mode = 'razorpay' then
    v_provider := 'razorpay';
    v_upi_uri := 'razorpay://order/' || trim(p_provider_reference);
  else
    v_provider := 'upi_sandbox';
    v_upi_uri := format(
      'upi://pay?pa=%s&pn=%s&am=%s&cu=INR&tn=%s&tr=%s',
      p_merchant_vpa,
      replace(coalesce(nullif(trim(p_merchant_name), ''), 'BookOurSpace'), ' ', '%20'),
      to_char(v_amount / 100.0, 'FM999999990.00'),
      replace('BookOurSpace PG ' || left(v_booking.id, 12), ' ', '%20'),
      v_intent_id
    );
  end if;

  insert into public.payment_intents (
    id, user_id, purpose, listing_id, room_type_id, booking_id,
    amount_paise, merchant_vpa, upi_uri, payment_mode, provider, status,
    idempotency_key, expires_at
  ) values (
    v_intent_id, v_uid, 'stay_booking', v_booking.listing_id, v_booking.room_type_id,
    v_booking.id, v_amount, coalesce(nullif(trim(p_merchant_vpa), ''), ''), v_upi_uri,
    p_payment_mode, v_provider, 'pending', v_key, v_expires
  );

  update public.bookings
     set payment_mode = p_payment_mode, payment_status = 'pending_verification', updated_at = now()
   where id = v_booking.id;

  perform public.pg_log_audit('pg_payment_intent_created', v_booking.id,
    jsonb_build_object('intentId', v_intent_id, 'amountPaise', v_amount,
                        'paymentMode', p_payment_mode, 'provider', v_provider,
                        'expiresAt', v_expires));

  return jsonb_build_object(
    'ok', true, 'replayed', false, 'bookingId', v_booking.id, 'intentId', v_intent_id,
    'paymentMode', p_payment_mode, 'provider', v_provider, 'status', 'pending_verification',
    'amountPaise', v_amount, 'upiUri', v_upi_uri, 'expiresAt', v_expires,
    'bookingPaymentStatus', 'pending_verification');
end;
$$;

revoke all on function public.pg_create_payment_intent(text, text, text, text, text, text) from public, anon;
grant execute on function public.pg_create_payment_intent(text, text, text, text, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 12b. Stable document shapes for the HTTP API
-- -----------------------------------------------------------------------------
create or replace function public.pg_dispute_json(p_row public.pg_booking_disputes)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'bookingId', p_row.booking_id,
    'openedBy', p_row.opened_by,
    'openerRole', p_row.opener_role,
    'category', p_row.category,
    'reason', p_row.reason,
    'evidence', p_row.evidence,
    'amountInDisputePaise', p_row.amount_in_dispute_paise,
    'status', p_row.status,
    'resolution', p_row.resolution,
    'refundApprovedPaise', p_row.refund_approved_paise,
    'resolvedBy', p_row.resolved_by,
    'resolvedAt', p_row.resolved_at,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at
  );
$$;

create or replace function public.pg_claim_json(p_row public.pg_payment_claims)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'bookingId', p_row.booking_id,
    'claimedBy', p_row.claimed_by,
    'method', p_row.method,
    'reference', p_row.reference,
    'note', p_row.note,
    'amountPaise', p_row.amount_paise,
    'evidence', p_row.evidence,
    'status', p_row.status,
    'decisionNote', p_row.decision_note,
    'decidedBy', p_row.decided_by,
    'decidedAt', p_row.decided_at,
    'createdAt', p_row.created_at
  );
$$;

create or replace function public.pg_invoice_json(p_row public.pg_invoices)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'invoiceNumber', p_row.invoice_number,
    'bookingId', p_row.booking_id,
    'kind', p_row.kind,
    'status', p_row.status,
    'userId', p_row.user_id,
    'listingId', p_row.listing_id,
    'listingTitle', p_row.listing_title,
    'currency', p_row.currency,
    'rentPaise', p_row.rent_paise,
    'depositPaise', p_row.deposit_paise,
    'taxPaise', p_row.tax_paise,
    'taxPercent', p_row.tax_percent,
    'taxApplied', p_row.tax_applied,
    'totalPaise', p_row.total_paise,
    'providerPaidPaise', p_row.provider_paid_paise,
    'offlineCollectedPaise', p_row.offline_collected_paise,
    'refundPaise', p_row.refund_paise,
    'provider', p_row.provider,
    'providerPaymentId', p_row.provider_payment_id,
    'issuedAt', p_row.issued_at
  );
$$;

revoke all on function public.pg_dispute_json(public.pg_booking_disputes) from public, anon;
revoke all on function public.pg_claim_json(public.pg_payment_claims) from public, anon;
revoke all on function public.pg_invoice_json(public.pg_invoices) from public, anon;

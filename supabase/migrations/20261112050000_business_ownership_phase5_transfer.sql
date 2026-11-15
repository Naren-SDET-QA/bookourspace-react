-- Phase 5: secure, two-step business ownership transfer.
create table if not exists public.business_ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete restrict,
  to_user_id uuid references public.profiles(id) on delete restrict,
  to_email text not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists idx_business_transfer_business on public.business_ownership_transfers (business_id, status);
alter table public.business_ownership_transfers enable row level security;
revoke all on public.business_ownership_transfers from public, anon;
grant select on public.business_ownership_transfers to authenticated;

drop policy if exists "Business owner or admin reads transfers" on public.business_ownership_transfers;
create policy "Business owner or admin reads transfers" on public.business_ownership_transfers for select to authenticated
using (public.is_business_member(business_id, array['owner']) or public.is_admin());

create or replace function public.record_business_transfer_audit()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.business_audit_events (business_id, actor_user_id, event_type, target_user_id, after_state, reason)
  values (new.business_id, auth.uid(), 'business.ownership_transfer.' || lower(new.status), new.to_user_id,
          jsonb_build_object('transfer_id', new.id, 'status', new.status), 'Ownership transfer lifecycle');
  return new;
end;
$$;
drop trigger if exists trg_business_transfer_audit on public.business_ownership_transfers;
create trigger trg_business_transfer_audit after insert or update on public.business_ownership_transfers for each row execute function public.record_business_transfer_audit();

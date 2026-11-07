-- Provider listing vertical slice: duplicate-request protection and owner reads.
--
-- The unique index is the duplicate-submission authority, not application
-- memory: two concurrent identical submits cannot both insert. Rows created
-- without a requestId store JSON null, which PostgreSQL allows to repeat.
--
-- Additive only. No existing row, policy or constraint is rewritten.

create unique index if not exists uniq_listings_owner_request_id
  on public.listings (owner_id, ((payload ->> 'requestId')));

create index if not exists idx_listings_owner_status_updated
  on public.listings (owner_id, status, updated_at desc);

comment on index public.uniq_listings_owner_request_id is
  'Idempotency guard for provider listing creates: one row per owner per requestId.';

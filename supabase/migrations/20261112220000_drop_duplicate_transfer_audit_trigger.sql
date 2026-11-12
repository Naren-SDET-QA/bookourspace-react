-- The transfer API writes actor-attributed request/accept audit rows explicitly.
-- The table trigger duplicated those rows with a null actor when the API runs as
-- the database owner. Drop the duplicate writer; the audit table remains
-- insert-only for authenticated clients and the API rows are immutable.
drop trigger if exists trg_business_transfer_audit on public.business_ownership_transfers;

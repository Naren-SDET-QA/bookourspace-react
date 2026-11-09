-- ============================================================================
-- 003: align provider contact RPCs with the real listings.id type
--
-- Problem
--   public.listings.id is TEXT (schema_and_rls.sql:66) and real identifiers are
--   not uuid-shaped (e.g. 'hotel-budget', 'listing-fixture-001').
--   Migration 002 declared:
--       provider_contact_details(p_listing_id uuid)
--       record_contact_click(p_listing_id uuid, p_channel text)
--   so any real listing id failed with "invalid input syntax for type uuid",
--   making Contact Owner unusable.
--
-- Why a DROP is required
--   `create or replace function` with a different parameter type creates an
--   ADDITIONAL overload instead of replacing anything. Leaving the uuid
--   overload in place would make calls such as
--   provider_contact_details('hotel-budget') ambiguous ("function is not
--   unique"), so the uuid overloads are dropped explicitly.
--
-- This migration does NOT modify 002 (which may already be applied elsewhere).
-- It is additive except for the two superseded overloads, which no dependent
-- object references.
--
-- Privacy rules are unchanged: a number is returned only when the owner has
-- recorded consent, the module permits owner contact, publish_<channel> is on,
-- AND that channel carries a verification timestamp.
-- ============================================================================

begin;

drop function if exists public.provider_contact_details(uuid);
drop function if exists public.record_contact_click(uuid, text);

-- ---------------------------------------------------------------------------
-- Contact details (read-only, safe for anon)
-- ---------------------------------------------------------------------------

create or replace function public.provider_contact_details(p_listing_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.provider_contact_settings;
  v_module public.platform_module_flags;
  v_result jsonb := jsonb_build_object('available', false);
begin
  if p_listing_id is null or length(btrim(p_listing_id)) = 0 then
    return v_result;
  end if;

  -- Consent is checked first: without an opted-in owner there is nothing to show,
  -- whatever the module flags say.
  select * into v_row from public.provider_contact_settings where listing_id = p_listing_id;
  if v_row is null or v_row.consent_recorded_at is null then
    return v_result;
  end if;

  select * into v_module from public.platform_module_flags where module_key = v_row.module_key;
  if v_module is null or not v_module.is_enabled or not v_module.allow_contact_owner then
    return v_result;
  end if;

  v_result := jsonb_build_object(
    'available', true,
    -- A published-but-unverified number is never disclosed.
    'phone', case when v_row.publish_phone and v_row.business_phone_verified_at is not null
                  then v_row.business_phone end,
    'whatsapp', case when v_row.publish_whatsapp and v_row.whatsapp_verified_at is not null
                     then v_row.whatsapp_number end,
    'disclaimer',
      'Bookings made outside BookOurSpace are not automatically confirmed by the platform.'
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contact click recording (authenticated only)
-- ---------------------------------------------------------------------------

create or replace function public.record_contact_click(p_listing_id text, p_channel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module public.platform_module_flags;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_channel is null or p_channel not in ('call','whatsapp') then
    raise exception 'INVALID_CHANNEL' using errcode = '22023';
  end if;

  if p_listing_id is null or length(btrim(p_listing_id)) = 0 then
    raise exception 'INVALID_LISTING_ID' using errcode = '22023';
  end if;

  select * into v_module
    from public.platform_module_flags f
    join public.provider_contact_settings s on s.module_key = f.module_key
   where s.listing_id = p_listing_id;

  if v_module is null or not v_module.is_enabled or not v_module.allow_contact_owner then
    raise exception 'CONTACT_OWNER_DISABLED' using errcode = '42501';
  end if;

  insert into public.provider_contact_events (listing_id, channel, actor_user_id)
  values (p_listing_id, p_channel, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: new functions are EXECUTE-able by PUBLIC by default, so strip that
-- implicit grant first and then grant deliberately.
-- ---------------------------------------------------------------------------

revoke all on function public.provider_contact_details(text) from public;
revoke all on function public.record_contact_click(text, text) from public;

-- Details are readable by anyone (they only ever expose opted-in, verified data).
grant execute on function public.provider_contact_details(text) to anon, authenticated;
-- Recording a click requires a real authenticated actor for the audit trail.
grant execute on function public.record_contact_click(text, text) to authenticated;

commit;

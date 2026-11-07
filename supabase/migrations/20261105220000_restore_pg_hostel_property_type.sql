-- Keep the Stays discovery property types while retaining the PG booking
-- workflow's shared stay_properties row type.
-- The later discovery migration replaced the earlier constraint and omitted
-- pg_hostel, which made the PG inventory RPC fail when it created a property.

begin;
-- 20261105170000 already installs this domain in the normal ordered path.
-- Keep this historical version ledgered, but avoid dropping and rebuilding an
-- equivalent CHECK (which takes an ACCESS EXCLUSIVE lock and rescans rows).
-- Repair only an absent/incomplete domain, and validate it before commit.
do $$
declare
  v_definition text;
  v_validated boolean;
begin
  select pg_catalog.pg_get_constraintdef(c.oid), c.convalidated
    into v_definition, v_validated
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.stay_properties'::regclass
     and c.conname = 'stay_properties_property_type_chk';

  if v_definition is null
     or not (v_definition ilike '%hotel%'
       and v_definition ilike '%resort%'
       and v_definition ilike '%homestay%'
       and v_definition ilike '%apartment%'
       and v_definition ilike '%villa%'
       and v_definition ilike '%guesthouse%'
       and v_definition ilike '%guest_house%'
       and v_definition ilike '%house%'
       and v_definition ilike '%flat%'
       and v_definition ilike '%lodge%'
       and v_definition ilike '%temple_stay%'
       and v_definition ilike '%pg_hostel%') then
    alter table public.stay_properties
      drop constraint if exists stay_properties_property_type_chk;
    alter table public.stay_properties
      add constraint stay_properties_property_type_chk
      check (property_type in (
        'hotel', 'resort', 'homestay', 'apartment', 'villa', 'guesthouse',
        'guest_house', 'house', 'flat', 'lodge', 'temple_stay', 'pg_hostel'
      )) not valid;
    alter table public.stay_properties
      validate constraint stay_properties_property_type_chk;
  elsif not v_validated then
    alter table public.stay_properties
      validate constraint stay_properties_property_type_chk;
  end if;
end $$;

commit;

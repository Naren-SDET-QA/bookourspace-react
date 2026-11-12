create or replace function public.business_module_for_listing(p_category_id text, p_entity_type text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_category_id,'')) like 'pg-%' or lower(coalesce(p_category_id,'')) in ('pg_hostels','pg') or lower(coalesce(p_entity_type,''))='pg' then 'pg_hostels'
    when lower(coalesce(p_category_id,'')) like 'class-%' or lower(coalesce(p_category_id,'')) in ('classes') or lower(coalesce(p_entity_type,'')) in ('class','course') then 'classes'
    when lower(coalesce(p_category_id,'')) like 'venue-%' or lower(coalesce(p_category_id,'')) in ('venues','venue') or lower(coalesce(p_entity_type,''))='venue' then 'venues'
    when lower(coalesce(p_category_id,'')) like 'movie-%' or lower(coalesce(p_category_id,'')) in ('movies','movie') or lower(coalesce(p_entity_type,''))='movie' then 'movies'
    when lower(coalesce(p_category_id,'')) like 'hotel-%' or lower(coalesce(p_category_id,'')) in ('hotel_stay','hotels','hotel','stay-hotel','stay_hotel','stays') or lower(coalesce(p_entity_type,'')) in ('stay','hotel') then 'hotel_stay'
    when lower(coalesce(p_category_id,'')) in ('services','cat-1','service') or lower(coalesce(p_entity_type,''))='service' then 'services'
    else null
  end
$$;

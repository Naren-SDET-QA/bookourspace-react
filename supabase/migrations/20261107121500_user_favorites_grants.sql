-- Stay wishlists are stored in public.user_favorites. The table had RLS policies
-- but no table privileges, so the signed-in wishlist endpoint failed locally
-- with "permission denied for table user_favorites" while guest/localStorage
-- saving silently masked it. Hosted Supabase usually supplies these grants via
-- project default privileges; granting explicitly keeps every environment equal.
grant select, insert, delete on public.user_favorites to authenticated;

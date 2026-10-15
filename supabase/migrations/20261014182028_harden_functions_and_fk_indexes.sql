-- Follow-ups from the Supabase advisors after the first migration.

-- Trigger functions are not meant to be called through /rest/v1/rpc.
-- sync_product_in_stock is SECURITY DEFINER, so make sure no API role can execute it.
revoke execute on function public.sync_product_in_stock() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Cover foreign keys used for joins and cascades.
create index products_brand_idx on public.products (brand_id) where brand_id is not null;
create index quote_requests_product_idx on public.quote_requests (product_id) where product_id is not null;

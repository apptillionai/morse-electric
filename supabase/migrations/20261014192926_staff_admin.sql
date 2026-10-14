-- Staff accounts and the policies behind the /admin back office.
--
-- Staff sign in with Supabase Auth (email + password). A user is staff only
-- if they have a row in public.staff, which only the service role (SQL editor
-- or a server script) can create. Every admin write goes through the signed-in
-- user's own session, so these policies are the real access control.

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.staff enable row level security;
revoke all on public.staff from anon, authenticated;
grant select on public.staff to authenticated;

create policy "Staff can read their own staff row" on public.staff
  for select to authenticated using (user_id = (select auth.uid()));

-- Lives outside the API-exposed schema so it can't be called via /rest/v1/rpc.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;

revoke all on function private.is_staff() from public, anon;
grant execute on function private.is_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Catalog: staff manage everything, including draft and archived products.
-- ---------------------------------------------------------------------------

grant insert, update, delete on public.categories, public.brands, public.products,
  public.product_images, public.product_documents to authenticated;
grant select, insert, update, delete on public.inventory to authenticated;

create policy "Staff manage categories" on public.categories
  for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "Staff manage brands" on public.brands
  for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "Staff manage products" on public.products
  for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "Staff manage product images" on public.product_images
  for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "Staff manage product documents" on public.product_documents
  for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "Staff manage inventory" on public.inventory
  for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Inbound requests: staff read and triage; nobody deletes (mark as spam).
-- ---------------------------------------------------------------------------

grant select, update on public.quote_requests, public.service_requests to authenticated;

create policy "Staff read quote requests" on public.quote_requests
  for select to authenticated using ((select private.is_staff()));
create policy "Staff update quote requests" on public.quote_requests
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "Staff read service requests" on public.service_requests
  for select to authenticated using ((select private.is_staff()));
create policy "Staff update service requests" on public.service_requests
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Storage: staff upload and remove catalog media. The buckets are public,
-- so reads need no policy.
-- ---------------------------------------------------------------------------

create policy "Staff upload catalog media" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('product-images', 'product-documents') and (select private.is_staff()));
create policy "Staff update catalog media" on storage.objects
  for update to authenticated
  using (bucket_id in ('product-images', 'product-documents') and (select private.is_staff()));
create policy "Staff delete catalog media" on storage.objects
  for delete to authenticated
  using (bucket_id in ('product-images', 'product-documents') and (select private.is_staff()));

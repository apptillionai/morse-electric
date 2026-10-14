-- Staff back-office policies: only users listed in public.staff can manage the
-- catalog, stock, requests and catalog media. Run with `supabase test db`.
begin;
create extension if not exists pgtap;
select plan(18);

insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'staff@example.invalid'),
  ('c1000000-0000-4000-8000-000000000002', 'customer@example.invalid');
insert into public.staff (user_id) values ('c1000000-0000-4000-8000-000000000001');

insert into public.categories (id, slug, name) values ('a2000000-0000-4000-8000-000000000001', 'zz-test', 'Test');
insert into public.products (id, sku, slug, name, category_id, status) values
  ('b2000000-0000-4000-8000-000000000001', 'ZZ-ACTIVE', 'zz-active', 'Active', 'a2000000-0000-4000-8000-000000000001', 'active'),
  ('b2000000-0000-4000-8000-000000000002', 'ZZ-DRAFT', 'zz-draft', 'Draft', 'a2000000-0000-4000-8000-000000000001', 'draft');
insert into public.quote_requests (id, name, email, details)
  values ('d2000000-0000-4000-8000-000000000001', 'Pat', 'pat@example.invalid', 'x');

-- Signed in, not staff ------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"c1000000-0000-4000-8000-000000000002"}';

select is((select count(*)::int from public.products where sku like 'ZZ-%'), 1, 'customers see only active products');
select is((select count(*)::int from public.quote_requests), 0, 'customers cannot read quote requests');
select is((select count(*)::int from public.inventory), 0, 'customers cannot read stock levels');
select throws_ok(
  $$insert into public.products (sku, slug, name, category_id) values ('ZZ-X', 'zz-x', 'X', 'a2000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'customers cannot add products'
);
select throws_ok(
  $$insert into public.staff (user_id) values ('c1000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'customers cannot make themselves staff'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('product-images', 'x.jpg')$$,
  '42501', null, 'customers cannot upload catalog media'
);
select is((select default_theme from public.site_settings), 'light', 'anyone signed in can read the default theme');
update public.site_settings set default_theme = 'dark';
reset role;
select is((select default_theme from public.site_settings), 'light', 'non-staff cannot change site settings');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"c1000000-0000-4000-8000-000000000002"}';

reset role;

-- Staff ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"c1000000-0000-4000-8000-000000000001"}';

select is((select count(*)::int from public.products where sku like 'ZZ-%'), 2, 'staff see draft products too');
select lives_ok(
  $$insert into public.products (sku, slug, name, category_id) values ('ZZ-NEW', 'zz-new', 'New', 'a2000000-0000-4000-8000-000000000001')$$,
  'staff can add products'
);
select lives_ok(
  $$insert into public.inventory (product_id, qty_on_hand) values ('b2000000-0000-4000-8000-000000000001', 4)$$,
  'staff can set stock'
);
select ok((select in_stock from public.products where sku = 'ZZ-ACTIVE'), 'stock trigger runs for staff writes');
select lives_ok(
  $$update public.quote_requests set status = 'quoted' where id = 'd2000000-0000-4000-8000-000000000001';
    insert into public.quote_request_notes (quote_request_id, notes) values ('d2000000-0000-4000-8000-000000000001', 'Called back')$$,
  'staff can triage quote requests'
);
select is((select status::text from public.quote_requests where id = 'd2000000-0000-4000-8000-000000000001'), 'quoted', 'quote status updated');
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('product-images', 'zz/x.jpg')$$,
  'staff can upload catalog media'
);
select lives_ok(
  $$delete from public.products where sku = 'ZZ-ACTIVE'$$,
  'staff can delete a product that has stock (cascades to inventory)'
);
select lives_ok($$update public.site_settings set default_theme = 'system'$$, 'staff can change the default theme');
select is((select default_theme from public.site_settings), 'system', 'default theme updated');

reset role;

select * from finish();
rollback;

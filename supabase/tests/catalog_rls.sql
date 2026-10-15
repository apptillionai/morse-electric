-- Row-level security and trigger checks for the catalog and request tables.
-- Run with `supabase test db` against a local stack.
begin;
create extension if not exists pgtap;
select plan(20);

insert into public.categories (id, slug, name)
values ('a1000000-0000-4000-8000-000000000001', 'electric-motors', 'Electric motors');

insert into public.products (id, sku, slug, name, category_id, status)
values
  ('b1000000-0000-4000-8000-000000000001', 'TEST-ACTIVE', 'test-active', 'Active motor',
   'a1000000-0000-4000-8000-000000000001', 'active'),
  ('b1000000-0000-4000-8000-000000000002', 'TEST-DRAFT', 'test-draft', 'Draft motor',
   'a1000000-0000-4000-8000-000000000001', 'draft');

insert into public.product_images (product_id, storage_path, credit)
values
  ('b1000000-0000-4000-8000-000000000001', 'active.jpg',
   '{"author": "A. Photographer", "license": "CC BY-SA 4.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Motor.jpg"}'),
  ('b1000000-0000-4000-8000-000000000002', 'draft.jpg', null);

select throws_ok(
  $$insert into public.product_images (product_id, storage_path, credit)
    values ('b1000000-0000-4000-8000-000000000001', 'x.jpg', '{"author": "A. Photographer"}')$$,
  '23514', null, 'a stock photo credit needs an author, license and source'
);
select throws_ok(
  $$insert into public.product_images (product_id, storage_path, credit)
    values ('b1000000-0000-4000-8000-000000000001', 'x.jpg', '"CC BY"')$$,
  '23514', null, 'a stock photo credit must be an object'
);

insert into public.inventory (product_id, qty_on_hand)
values ('b1000000-0000-4000-8000-000000000001', 3);

select ok(
  (select in_stock from public.products where sku = 'TEST-ACTIVE'),
  'inventory insert marks the product in stock'
);

update public.inventory set qty_reserved = 3 where product_id = 'b1000000-0000-4000-8000-000000000001';
select ok(
  not (select in_stock from public.products where sku = 'TEST-ACTIVE'),
  'reserving all stock marks the product out of stock'
);
update public.inventory set qty_reserved = 0 where product_id = 'b1000000-0000-4000-8000-000000000001';

insert into public.quote_requests (name, email, details) values ('Pat', 'pat@example.invalid', 'Need a motor');
insert into public.service_requests (equipment_type, name, email, phone, symptoms)
values ('motor', 'Sam', 'sam@example.invalid', '5550102000', 'Tripping breaker');

select ok(
  (select reference ~ '^Q-\d{4,}$' from public.quote_requests where email = 'pat@example.invalid'),
  'quote requests get a Q- reference'
);
select ok(
  (select reference ~ '^SR-\d{4,}$' from public.service_requests where email = 'sam@example.invalid'),
  'service requests get an SR- reference'
);

-- Anonymous visitors -------------------------------------------------------
set local role anon;

select is((select count(*)::int from public.products), 1, 'anon sees only active products');
select is((select sku from public.products), 'TEST-ACTIVE', 'the visible product is the active one');
select is((select count(*)::int from public.product_images), 1, 'anon sees only images of active products');
select is((select credit->>'author' from public.product_images), 'A. Photographer', 'anon can read stock photo credits');
select is((select count(*)::int from public.categories), 1, 'anon can read categories');
select throws_ok('select * from public.inventory', '42501', null, 'anon cannot read inventory quantities');
select throws_ok('select * from public.quote_requests', '42501', null, 'anon cannot read quote requests');
select throws_ok('select * from public.service_requests', '42501', null, 'anon cannot read service requests');
select throws_ok(
  $$insert into public.quote_requests (name, email) values ('x', 'x@example.invalid')$$,
  '42501', null, 'anon cannot insert quote requests directly'
);
select throws_ok(
  $$update public.products set name = 'hacked'$$,
  '42501', null, 'anon cannot modify products'
);
select throws_ok(
  'select public.sync_product_in_stock()',
  '42501', null, 'anon cannot call the security-definer stock trigger function'
);

reset role;

-- Signed-in customers get the same public view -----------------------------
set local role authenticated;

select is((select count(*)::int from public.products), 1, 'authenticated users see only active products');
-- Signed-in users hold table grants for the staff back office; RLS returns them nothing.
select is((select count(*)::int from public.quote_requests), 0, 'non-staff signed-in users see no quote requests');
delete from public.categories;
select is((select count(*)::int from public.categories where slug = 'electric-motors'), 1, 'non-staff signed-in users cannot delete categories');

reset role;

select * from finish();
rollback;

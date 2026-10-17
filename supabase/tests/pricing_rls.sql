-- Contractor and volume pricing: price breaks are well formed and below the
-- list price, staff manage tiers, customers see only their own tier and can't
-- put themselves on one.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap;
select plan(20);

insert into auth.users (id, email) values
  ('a6000000-0000-4000-8000-000000000001', 'staff@example.invalid'),
  ('a6000000-0000-4000-8000-000000000002', 'ann@example.invalid'),
  ('a6000000-0000-4000-8000-000000000003', 'bob@example.invalid');
insert into public.staff (user_id) values ('a6000000-0000-4000-8000-000000000001');
insert into public.price_tiers (id, name, discount_percent) values
  ('d6000000-0000-4000-8000-000000000001', 'Contractor', 10),
  ('d6000000-0000-4000-8000-000000000002', 'OEM', 15);
insert into public.customers (user_id, email, name, price_tier_id) values
  ('a6000000-0000-4000-8000-000000000002', 'ann@example.invalid', 'Ann', 'd6000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-000000000003', 'bob@example.invalid', 'Bob', null);
insert into public.categories (id, slug, name) values ('b6000000-0000-4000-8000-000000000001', 'motors', 'Motors');
insert into public.products (id, sku, slug, name, category_id, status, price_cents, price_breaks) values
  ('c6000000-0000-4000-8000-00000000000a', 'EM-5HP', 'em-5hp', '5 HP motor', 'b6000000-0000-4000-8000-000000000001', 'active',
   68900, '[{"min_qty": 5, "price_cents": 65000}, {"min_qty": 10, "price_cents": 62000}]');

-- Price breaks ---------------------------------------------------------------------
select is(
  (select jsonb_array_length(price_breaks) from public.products where id = 'c6000000-0000-4000-8000-00000000000a'),
  2, 'a product keeps its quantity prices'
);
select is(
  (select price_breaks from public.products where sku = 'EM-5HP'),
  '[{"min_qty": 5, "price_cents": 65000}, {"min_qty": 10, "price_cents": 62000}]'::jsonb,
  'quantity prices are stored as given'
);
select throws_ok(
  $$update public.products set price_breaks = '[{"min_qty": 5, "price_cents": 70000}]' where sku = 'EM-5HP'$$,
  '23514', null, 'a quantity price must be below the list price'
);
select throws_ok(
  $$update public.products set price_breaks = '[{"min_qty": 10, "price_cents": 65000}, {"min_qty": 5, "price_cents": 62000}]' where sku = 'EM-5HP'$$,
  '23514', null, 'quantity prices go up in quantity'
);
select throws_ok(
  $$update public.products set price_breaks = '[{"min_qty": 5, "price_cents": 62000}, {"min_qty": 10, "price_cents": 65000}]' where sku = 'EM-5HP'$$,
  '23514', null, 'each quantity price is below the one before'
);
select throws_ok(
  $$update public.products set price_breaks = '[{"min_qty": 1, "price_cents": 60000}]' where sku = 'EM-5HP'$$,
  '23514', null, 'a quantity price starts at 2 or more'
);
select throws_ok(
  $$update public.products set price_breaks = '[{"min_qty": 2.5, "price_cents": 60000}]' where sku = 'EM-5HP'$$,
  '23514', null, 'quantities are whole numbers'
);
select throws_ok(
  $$update public.products set price_breaks = '[{"min_qty": 5, "price_cents": 60000, "note": "x"}]' where sku = 'EM-5HP'$$,
  '23514', null, 'a quantity price has only a quantity and a price'
);
select throws_ok(
  $$update public.products set price_cents = 64000 where sku = 'EM-5HP'$$,
  '23514', null, 'the list price cannot drop below a quantity price'
);
select throws_ok(
  $$update public.products set price_cents = null where sku = 'EM-5HP'$$,
  '23514', null, 'a product priced on request has no quantity prices'
);
select lives_ok(
  $$update public.products set price_cents = null, price_breaks = '[]' where sku = 'EM-5HP'$$,
  'clearing both together is fine'
);
update public.products set price_cents = 68900, price_breaks = '[{"min_qty": 5, "price_cents": 65000}]' where sku = 'EM-5HP';

-- The public sees quantity prices, but no tiers -----------------------------------------
set local role anon;
select is(
  (select price_breaks -> 0 ->> 'price_cents' from public.products where sku = 'EM-5HP'),
  '65000', 'quantity prices are public, like the list price'
);
select throws_ok($$select * from public.price_tiers$$, '42501', null, 'the public cannot read price tiers');
reset role;

-- Signed in as Ann (on the Contractor tier) ---------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a6000000-0000-4000-8000-000000000002"}';
select is(
  (select array_agg(name) from public.price_tiers), array['Contractor'],
  'a customer sees only their own tier'
);
update public.customers set price_tier_id = 'd6000000-0000-4000-8000-000000000002' where user_id = 'a6000000-0000-4000-8000-000000000002';
select is(
  (select price_tier_id::text from public.customers), 'd6000000-0000-4000-8000-000000000001',
  'a customer cannot move themselves to another tier'
);
update public.price_tiers set discount_percent = 50 where id = 'd6000000-0000-4000-8000-000000000001';
select is(
  (select discount_percent from public.price_tiers), 10.00::numeric,
  'a customer cannot change their tier''s discount'
);
select throws_ok(
  $$insert into public.price_tiers (name, discount_percent) values ('Mine', 40)$$,
  '42501', null, 'a customer cannot add a tier'
);

-- Signed in as Bob (no tier) ---------------------------------------------------------
set local "request.jwt.claims" to '{"sub":"a6000000-0000-4000-8000-000000000003"}';
select is((select count(*)::int from public.price_tiers), 0, 'a customer without a tier sees none');

-- Staff ------------------------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub":"a6000000-0000-4000-8000-000000000001"}';
update public.customers set price_tier_id = 'd6000000-0000-4000-8000-000000000002' where user_id = 'a6000000-0000-4000-8000-000000000003';
select is(
  (select price_tier_id::text from public.customers where user_id = 'a6000000-0000-4000-8000-000000000003'),
  'd6000000-0000-4000-8000-000000000002', 'staff put a customer on a tier'
);
delete from public.price_tiers where id = 'd6000000-0000-4000-8000-000000000001';
select is(
  (select price_tier_id from public.customers where user_id = 'a6000000-0000-4000-8000-000000000002'), null,
  'removing a tier takes its customers back to list prices'
);

select * from finish();
rollback;

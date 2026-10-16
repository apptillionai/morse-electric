-- Net-30 terms: only staff set terms and limits, the credit check holds,
-- invoiced orders take stock and can be fulfilled or cancelled, and
-- business-account requests are staff-only.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap;
select plan(25);

insert into auth.users (id, email) values
  ('a2000000-0000-4000-8000-000000000001', 'staff@example.invalid'),
  ('a2000000-0000-4000-8000-000000000002', 'ann@example.invalid'),
  ('a2000000-0000-4000-8000-000000000003', 'bob@example.invalid');
insert into public.staff (user_id) values ('a2000000-0000-4000-8000-000000000001');
insert into public.customers (user_id, email, name, terms, credit_limit_cents) values
  ('a2000000-0000-4000-8000-000000000002', 'ann@example.invalid', 'Ann', 'net30', 30000),
  ('a2000000-0000-4000-8000-000000000003', 'bob@example.invalid', 'Bob', 'prepay', 0);
insert into public.categories (id, slug, name) values ('b2000000-0000-4000-8000-000000000001', 'motors', 'Motors');
insert into public.products (id, sku, slug, name, category_id, price_cents, status) values
  ('c2000000-0000-4000-8000-00000000000a', 'A-1', 'a-1', 'Motor A', 'b2000000-0000-4000-8000-000000000001', 10000, 'active');
insert into public.inventory (product_id, qty_on_hand) values ('c2000000-0000-4000-8000-00000000000a', 10);

create function pg_temp.new_order(p_id uuid, p_customer uuid, p_qty integer)
returns void language sql as $$
  insert into public.orders (id, customer_id, fulfillment, subtotal_cents, total_cents, expires_at)
    values (p_id, p_customer, 'ship', 10000 * p_qty, 10000 * p_qty, now() + interval '30 minutes');
  insert into public.order_items (order_id, product_id, sku, name, condition, unit_price_cents, quantity)
    values (p_id, 'c2000000-0000-4000-8000-00000000000a', 'A-1', 'Motor A', 'new', 10000, p_qty);
  select public.reserve_order_stock(p_id);
$$;
create function pg_temp.stock() returns text language sql as $$
  select qty_on_hand || '/' || qty_reserved from public.inventory where product_id = 'c2000000-0000-4000-8000-00000000000a';
$$;

-- Credit check ----------------------------------------------------------------
select pg_temp.new_order('d2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 2);
select is(public.place_net30_order('d2000000-0000-4000-8000-000000000001'), 'placed', 'an order within the credit limit is placed on account');
select is(
  (select status::text || ' ' || payment_method || ' ' || invoice_status from public.orders where id = 'd2000000-0000-4000-8000-000000000001'),
  'invoiced net30 open', 'it is invoiced, on Net-30, with an open invoice'
);
select is(pg_temp.stock(), '8/0', 'an invoiced order takes its stock');
select is(public.place_net30_order('d2000000-0000-4000-8000-000000000001'), 'not_placed', 'placing it twice does nothing');

select pg_temp.new_order('d2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 2);
select is(public.place_net30_order('d2000000-0000-4000-8000-000000000002'), 'over_limit', 'an order that would pass the credit limit is refused');
select is((select status::text from public.orders where id = 'd2000000-0000-4000-8000-000000000002'), 'checkout', 'a refused order stays in checkout');
select is(pg_temp.stock(), '8/2', 'its stock stays reserved until the checkout is cancelled');

select pg_temp.new_order('d2000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000002', 1);
select is(public.place_net30_order('d2000000-0000-4000-8000-000000000003'), 'placed', 'an order that fits exactly is placed');

update public.orders set invoice_status = 'paid' where id = 'd2000000-0000-4000-8000-000000000001';
select is(public.place_net30_order('d2000000-0000-4000-8000-000000000002'), 'placed', 'a paid invoice frees up credit');

select pg_temp.new_order('d2000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000003', 1);
select is(public.place_net30_order('d2000000-0000-4000-8000-000000000004'), 'not_on_terms', 'a customer without terms cannot order on account');
select pg_temp.new_order('d2000000-0000-4000-8000-000000000005', null, 1);
select is(public.place_net30_order('d2000000-0000-4000-8000-000000000005'), 'not_placed', 'a guest cannot order on account');

insert into public.account_requests (name, company, email, wants_terms) values ('Cara', 'Cara Farms', 'cara@example.invalid', true);

-- Signed in as the Net-30 customer Ann ----------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a2000000-0000-4000-8000-000000000002"}';

select is(public.my_open_balance_cents(), 30000, 'a customer sees their own open balance');
update public.customers set terms = 'net30', credit_limit_cents = 99999999 where user_id = 'a2000000-0000-4000-8000-000000000002';
select throws_ok(
  $$select public.place_net30_order('d2000000-0000-4000-8000-000000000004')$$,
  '42501', null, 'a customer cannot place an order on account themselves'
);
select is((select count(*)::int from public.account_requests), 0, 'a customer cannot read account requests');
reset role;
select is(
  (select credit_limit_cents from public.customers where user_id = 'a2000000-0000-4000-8000-000000000002'), 30000,
  'a customer cannot raise their own credit limit'
);

-- Signed in as Bob ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a2000000-0000-4000-8000-000000000003"}';
update public.customers set terms = 'net30' where user_id = 'a2000000-0000-4000-8000-000000000003';
reset role;
select is((select terms from public.customers where user_id = 'a2000000-0000-4000-8000-000000000003'), 'prepay', 'a customer cannot put themselves on terms');

-- Anonymous -------------------------------------------------------------------
set local role anon;
select throws_ok('select * from public.account_requests', '42501', null, 'anon cannot read account requests');
select throws_ok(
  $$insert into public.account_requests (name, company, email) values ('x', 'y', 'z@example.invalid')$$,
  '42501', null, 'anon cannot write account requests directly (the form uses the server)'
);

-- Staff -----------------------------------------------------------------------
reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a2000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$update public.customers set terms = 'net30', credit_limit_cents = 500000 where user_id = 'a2000000-0000-4000-8000-000000000003'$$,
  'staff put a customer on terms'
);
select is((select credit_limit_cents from public.customers where user_id = 'a2000000-0000-4000-8000-000000000003'), 500000, 'the limit is saved');
select is((select count(*)::int from public.account_requests), 1, 'staff read account requests');
select throws_ok(
  $$update public.orders set status = 'invoiced' where id = 'd2000000-0000-4000-8000-000000000004'$$,
  '42501', null, 'staff cannot mark an order invoiced by hand'
);
update public.orders set invoice_status = 'paid', stripe_invoice_id = 'in_fake' where id = 'd2000000-0000-4000-8000-000000000003';
select lives_ok(
  $$update public.orders set status = 'processing' where id = 'd2000000-0000-4000-8000-000000000003'$$,
  'staff start fulfilling an invoiced order'
);
select ok(public.staff_close_order('d2000000-0000-4000-8000-000000000002', 'cancelled', true), 'staff cancel an invoiced order');
reset role;
select is(
  (select coalesce(invoice_status, '-') || ' ' || coalesce(stripe_invoice_id, '-') from public.orders where id = 'd2000000-0000-4000-8000-000000000003'),
  'open -', 'staff cannot change an order''s invoice'
);

select * from finish();
rollback;

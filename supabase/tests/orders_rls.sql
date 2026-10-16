-- Online orders: stock moves with status exactly once, customers see only
-- their own orders, and only server code (or staff, through their action)
-- can place, cancel or refund one.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap;
select plan(62);

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'staff@example.invalid'),
  ('a1000000-0000-4000-8000-000000000002', 'ann@example.invalid'),
  ('a1000000-0000-4000-8000-000000000003', 'bob@example.invalid');
insert into public.staff (user_id) values ('a1000000-0000-4000-8000-000000000001');
insert into public.customers (user_id, email, name) values
  ('a1000000-0000-4000-8000-000000000002', 'ann@example.invalid', 'Ann'),
  ('a1000000-0000-4000-8000-000000000003', 'bob@example.invalid', 'Bob');
insert into public.categories (id, slug, name) values ('b1000000-0000-4000-8000-000000000001', 'motors', 'Motors');
insert into public.products (id, sku, slug, name, category_id, price_cents, status) values
  ('c1000000-0000-4000-8000-00000000000a', 'A-1', 'a-1', 'Motor A', 'b1000000-0000-4000-8000-000000000001', 10000, 'active'),
  ('c1000000-0000-4000-8000-00000000000b', 'B-1', 'b-1', 'Motor B', 'b1000000-0000-4000-8000-000000000001', 20000, 'active'),
  ('c1000000-0000-4000-8000-00000000000c', 'C-1', 'c-1', 'Reman motor C', 'b1000000-0000-4000-8000-000000000001', 30000, 'active');
insert into public.inventory (product_id, qty_on_hand) values
  ('c1000000-0000-4000-8000-00000000000a', 5),
  ('c1000000-0000-4000-8000-00000000000b', 1),
  ('c1000000-0000-4000-8000-00000000000c', 10);

create function pg_temp.new_order(p_id uuid, p_customer uuid, p_product uuid, p_qty integer)
returns void language sql as $$
  insert into public.orders (id, customer_id, fulfillment, subtotal_cents, total_cents, expires_at)
    values (p_id, p_customer, 'ship', 100 * p_qty, 100 * p_qty, now() + interval '30 minutes');
  insert into public.order_items (order_id, product_id, sku, name, condition, unit_price_cents, quantity)
    values (p_id, p_product, 'X', 'X', 'new', 100, p_qty);
$$;
create function pg_temp.stock(p_product uuid) returns text language sql as $$
  select qty_on_hand || '/' || qty_reserved from public.inventory where product_id = p_product;
$$;

-- Reserving -------------------------------------------------------------------
select pg_temp.new_order('d1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-00000000000a', 2);
select ok(public.reserve_order_stock('d1000000-0000-4000-8000-000000000001'), 'stock is reserved for a new checkout');
select is(pg_temp.stock('c1000000-0000-4000-8000-00000000000a'), '5/2', 'the reservation shows in qty_reserved');
select ok((select in_stock from public.products where sku = 'A-1'), 'a product with stock left stays in stock');

select pg_temp.new_order('d1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-00000000000b', 2);
select ok(not public.reserve_order_stock('d1000000-0000-4000-8000-000000000002'), 'a checkout for more than is available is refused');
select is(pg_temp.stock('c1000000-0000-4000-8000-00000000000b'), '1/0', 'a refused checkout reserves nothing');

-- Placing -------------------------------------------------------------------
select ok(public.place_order('d1000000-0000-4000-8000-000000000001', 'paid'), 'a paid checkout is placed');
select is(pg_temp.stock('c1000000-0000-4000-8000-00000000000a'), '3/0', 'placing takes the reserved stock off the shelf');
select is((select status::text from public.orders where id = 'd1000000-0000-4000-8000-000000000001'), 'paid', 'the order is paid');
select ok(not public.place_order('d1000000-0000-4000-8000-000000000001', 'paid'), 'placing twice does nothing');
select is(pg_temp.stock('c1000000-0000-4000-8000-00000000000a'), '3/0', 'a redelivered event takes no more stock');
select throws_ok(
  $$select public.place_order('d1000000-0000-4000-8000-000000000001', 'shipped')$$,
  'P0001', null, 'place_order only places'
);

-- Abandoned checkouts ---------------------------------------------------------
select pg_temp.new_order('d1000000-0000-4000-8000-000000000003', null, 'c1000000-0000-4000-8000-00000000000a', 1);
select public.reserve_order_stock('d1000000-0000-4000-8000-000000000003');
select ok(public.cancel_checkout('d1000000-0000-4000-8000-000000000003'), 'an expired checkout is cancelled');
select is(pg_temp.stock('c1000000-0000-4000-8000-00000000000a'), '3/0', 'cancelling releases the reservation');
select ok(not public.cancel_checkout('d1000000-0000-4000-8000-000000000003'), 'cancelling twice does nothing');
select ok(public.place_order('d1000000-0000-4000-8000-000000000003', 'paid'), 'a payment that arrives after expiry still places the order');
select is(pg_temp.stock('c1000000-0000-4000-8000-00000000000a'), '2/0', 'and takes its stock from what is on hand');

select pg_temp.new_order('d1000000-0000-4000-8000-000000000004', null, 'c1000000-0000-4000-8000-00000000000a', 1);
select public.reserve_order_stock('d1000000-0000-4000-8000-000000000004');
update public.orders set expires_at = now() - interval '2 hours' where id = 'd1000000-0000-4000-8000-000000000004';
select is(public.release_stale_checkouts(), 1, 'checkouts long past expiry are released');
select is(pg_temp.stock('c1000000-0000-4000-8000-00000000000a'), '2/0', 'their stock is free again');

-- ACH -------------------------------------------------------------------------
select pg_temp.new_order('d1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-00000000000a', 1);
select public.reserve_order_stock('d1000000-0000-4000-8000-000000000005');
select ok(public.place_order('d1000000-0000-4000-8000-000000000005', 'pending_payment'), 'an ACH order is placed while the debit clears');
select is(pg_temp.stock('c1000000-0000-4000-8000-00000000000a'), '1/0', 'an ACH order holds its stock');
select ok(public.mark_order_paid('d1000000-0000-4000-8000-000000000005'), 'a cleared debit marks it paid');
select ok(not public.mark_order_paid('d1000000-0000-4000-8000-000000000005'), 'marking paid twice does nothing');

select pg_temp.new_order('d1000000-0000-4000-8000-000000000006', null, 'c1000000-0000-4000-8000-00000000000a', 1);
select public.reserve_order_stock('d1000000-0000-4000-8000-000000000006');
select public.place_order('d1000000-0000-4000-8000-000000000006', 'pending_payment');
select ok(public.fail_order_payment('d1000000-0000-4000-8000-000000000006'), 'a failed debit cancels the order');
select is(pg_temp.stock('c1000000-0000-4000-8000-00000000000a'), '1/0', 'and puts its stock back');

-- Cores --------------------------------------------------------------------
create function pg_temp.new_core_order(p_id uuid, p_customer uuid, p_qty integer)
returns void language sql as $$
  select pg_temp.new_order(p_id, p_customer, 'c1000000-0000-4000-8000-00000000000c', p_qty);
  update public.order_items set core_charge_cents = 5000 where order_id = p_id;
  update public.orders set core_cents = 5000 * p_qty where id = p_id;
$$;
update public.site_settings set core_return_days = 10 where id = 1;
select pg_temp.new_core_order('d1000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000002', 2);
select public.reserve_order_stock('d1000000-0000-4000-8000-000000000007');
select is((select count(*)::int from public.core_returns), 0, 'no core is owed before the order is placed');
select ok(public.place_order('d1000000-0000-4000-8000-000000000007', 'paid'), 'an order with a core is placed');
select is(
  (select status::text || ' ' || quantity || ' x ' || core_charge_cents from public.core_returns where order_id = 'd1000000-0000-4000-8000-000000000007'),
  'awaiting 2 x 5000', 'placing opens a core return for the item'
);
select is(
  (select due_date from public.core_returns where order_id = 'd1000000-0000-4000-8000-000000000007'),
  (now() at time zone 'America/New_York')::date + 10, 'the core is due back after the return window in settings'
);
select pg_temp.new_order('d1000000-0000-4000-8000-000000000009', null, 'c1000000-0000-4000-8000-00000000000a', 1);
select public.reserve_order_stock('d1000000-0000-4000-8000-000000000009');
select public.place_order('d1000000-0000-4000-8000-000000000009', 'paid');
select is((select count(*)::int from public.core_returns where order_id = 'd1000000-0000-4000-8000-000000000009'), 0, 'items without a core charge owe no core');

select pg_temp.new_core_order('d1000000-0000-4000-8000-000000000008', null, 1);
select public.reserve_order_stock('d1000000-0000-4000-8000-000000000008');
select public.place_order('d1000000-0000-4000-8000-000000000008', 'paid');

insert into public.order_notes (order_id, notes) values ('d1000000-0000-4000-8000-000000000001', 'Ships Friday');
insert into public.stripe_events (id, type) values ('evt_1', 'checkout.session.completed');

-- Signed in as the customer Ann ----------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a1000000-0000-4000-8000-000000000002"}';

select is((select count(*)::int from public.orders), 3, 'a customer sees only their own orders');
select is((select count(*)::int from public.order_items), 3, 'a customer sees only items on their own orders');
select is((select count(*)::int from public.core_returns), 1, 'a customer sees only the cores on their own orders');
update public.core_returns set status = 'credited', credit_cents = 10000 where order_id = 'd1000000-0000-4000-8000-000000000007';
select is((select count(*)::int from public.order_notes), 0, 'a customer cannot read staff notes on orders');
select throws_ok('select * from public.stripe_events', '42501', null, 'a customer cannot read webhook events');
update public.orders set status = 'shipped', total_cents = 1 where id = 'd1000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.place_order('d1000000-0000-4000-8000-000000000002', 'paid')$$,
  '42501', null, 'a customer cannot place an order themselves'
);
select throws_ok(
  $$select public.staff_close_order('d1000000-0000-4000-8000-000000000001', 'refunded', true)$$,
  '42501', null, 'a customer cannot refund an order'
);
select throws_ok(
  $$insert into public.orders (fulfillment, subtotal_cents, total_cents) values ('ship', 0, 0)$$,
  '42501', null, 'a customer cannot create orders'
);
update public.customers set stripe_customer_id = 'cus_evil' where user_id = 'a1000000-0000-4000-8000-000000000002';
reset role;
select ok(
  (select status::text = 'paid' and total_cents = 200 from public.orders where id = 'd1000000-0000-4000-8000-000000000001'),
  'a customer cannot change their order'
);
select is(
  (select stripe_customer_id from public.customers where user_id = 'a1000000-0000-4000-8000-000000000002'), null,
  'a customer cannot set their Stripe customer'
);
select is(
  (select status::text from public.core_returns where order_id = 'd1000000-0000-4000-8000-000000000007'), 'awaiting',
  'a customer cannot mark their own core credited'
);

-- Anonymous -------------------------------------------------------------------
set local role anon;
select throws_ok('select * from public.orders', '42501', null, 'anon cannot read orders');
select throws_ok('select * from public.order_items', '42501', null, 'anon cannot read order items');
select throws_ok('select * from public.core_returns', '42501', null, 'anon cannot read core returns');

-- Staff -----------------------------------------------------------------------
reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a1000000-0000-4000-8000-000000000001"}';

select is((select count(*)::int from public.orders), 9, 'staff see every order');
select is((select count(*)::int from public.core_returns), 2, 'staff see every core');
select throws_ok(
  $$update public.core_returns set status = 'credited', credit_cents = 10000 where order_id = 'd1000000-0000-4000-8000-000000000007'$$,
  '42501', null, 'a core must be received before it is credited'
);
update public.core_returns set status = 'received', core_charge_cents = 1, quantity = 9 where order_id = 'd1000000-0000-4000-8000-000000000007';
select is(
  (select status::text || ' ' || quantity || ' x ' || core_charge_cents || ' ' || (received_at is not null) from public.core_returns where order_id = 'd1000000-0000-4000-8000-000000000007'),
  'received 2 x 5000 true', 'staff mark a core received, but cannot change what it was charged'
);
select throws_ok(
  $$update public.core_returns set status = 'credited' where order_id = 'd1000000-0000-4000-8000-000000000007'$$,
  '42501', null, 'crediting a core needs the credit amount'
);
select throws_ok(
  $$update public.core_returns set status = 'credited', credit_cents = 10001 where order_id = 'd1000000-0000-4000-8000-000000000007'$$,
  '42501', null, 'a core credit cannot exceed what was charged'
);
select lives_ok(
  $$update public.core_returns set status = 'credited', credit_cents = 10000, stripe_refund_id = 're_1' where order_id = 'd1000000-0000-4000-8000-000000000007'$$,
  'staff credit a received core'
);
select ok((select credited_at is not null from public.core_returns where order_id = 'd1000000-0000-4000-8000-000000000007'), 'crediting records when');
select throws_ok(
  $$update public.core_returns set status = 'awaiting' where order_id = 'd1000000-0000-4000-8000-000000000007'$$,
  '42501', null, 'a credited core stays credited'
);
select lives_ok(
  $$update public.core_returns set due_date = due_date + 14 where order_id = 'd1000000-0000-4000-8000-000000000008'$$,
  'staff can extend a core''s due date'
);
select ok(public.staff_close_order('d1000000-0000-4000-8000-000000000008', 'cancelled', true), 'staff cancel an order with an open core');
select is((select status::text from public.core_returns where order_id = 'd1000000-0000-4000-8000-000000000008'), 'cancelled', 'cancelling the order voids its open core');
select is((select count(*)::int from public.order_notes), 1, 'staff read order notes');
select lives_ok(
  $$update public.orders set status = 'shipped', carrier = 'UPS', tracking_number = '1Z999' where id = 'd1000000-0000-4000-8000-000000000001'$$,
  'staff mark an order shipped with tracking'
);
select throws_ok(
  $$update public.orders set status = 'cancelled' where id = 'd1000000-0000-4000-8000-000000000005'$$,
  '42501', null, 'staff cannot cancel by editing the status (stock would not move)'
);
update public.orders set total_cents = 1 where id = 'd1000000-0000-4000-8000-000000000005';
select ok(
  not public.staff_close_order('d1000000-0000-4000-8000-000000000001', 'cancelled', true),
  'a shipped order cannot be cancelled, only refunded'
);
select ok(public.staff_close_order('d1000000-0000-4000-8000-000000000005', 'cancelled', true), 'staff cancel an unshipped order');
reset role;
select is(pg_temp.stock('c1000000-0000-4000-8000-00000000000a'), '1/0', 'cancelling with restock puts the stock back');
select is((select total_cents from public.orders where id = 'd1000000-0000-4000-8000-000000000005'), 100, 'staff cannot change an order''s totals');

select * from finish();
rollback;

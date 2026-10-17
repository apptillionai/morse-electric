-- Payable quotes: staff price and send them, customers read only their own
-- sent quotes, only the customer's actions approve, decline or pay, and
-- quote orders don't move stock.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap;
select plan(40);

insert into auth.users (id, email) values
  ('a3000000-0000-4000-8000-000000000001', 'staff@example.invalid'),
  ('a3000000-0000-4000-8000-000000000002', 'ann@example.invalid'),
  ('a3000000-0000-4000-8000-000000000003', 'bob@example.invalid');
insert into public.staff (user_id) values ('a3000000-0000-4000-8000-000000000001');
insert into public.customers (user_id, email, name) values
  ('a3000000-0000-4000-8000-000000000002', 'ann@example.invalid', 'Ann'),
  ('a3000000-0000-4000-8000-000000000003', 'bob@example.invalid', 'Bob');
insert into public.categories (id, slug, name) values ('b3000000-0000-4000-8000-000000000001', 'motors', 'Motors');
insert into public.products (id, sku, slug, name, category_id, price_cents, status) values
  ('c3000000-0000-4000-8000-00000000000a', 'A-1', 'a-1', 'Motor A', 'b3000000-0000-4000-8000-000000000001', 10000, 'active');
insert into public.inventory (product_id, qty_on_hand) values ('c3000000-0000-4000-8000-00000000000a', 10);

insert into public.quote_requests (id, name, email, customer_id) values
  ('e3000000-0000-4000-8000-000000000001', 'Ann', 'ann@example.invalid', 'a3000000-0000-4000-8000-000000000002'),
  ('e3000000-0000-4000-8000-000000000002', 'Ann', 'ann@example.invalid', 'a3000000-0000-4000-8000-000000000002'),
  ('e3000000-0000-4000-8000-000000000003', 'Bob', 'bob@example.invalid', 'a3000000-0000-4000-8000-000000000003');
insert into public.service_requests (id, equipment_type, name, email, phone, symptoms, customer_id, status) values
  ('f3000000-0000-4000-8000-000000000001', 'motor', 'Ann', 'ann@example.invalid', '555-0100', 'Hums', 'a3000000-0000-4000-8000-000000000002', 'teardown'),
  ('f3000000-0000-4000-8000-000000000002', 'pump', 'Ann', 'ann@example.invalid', '555-0100', 'Leaks', 'a3000000-0000-4000-8000-000000000002', 'teardown');

create function pg_temp.stock() returns text language sql as $$
  select qty_on_hand || '/' || qty_reserved from public.inventory where product_id = 'c3000000-0000-4000-8000-00000000000a';
$$;

-- Signed in as staff ----------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a3000000-0000-4000-8000-000000000001"}';

insert into public.quotes (id, quote_request_id, customer_id, name, email, valid_until, token_hash, status, order_id)
  values ('93000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002',
          'Ann', 'ann@example.invalid', current_date + 30, repeat('1', 64), 'paid', null);
select is((select status::text from public.quotes where id = '93000000-0000-4000-8000-000000000001'), 'draft', 'a new quote always starts as a draft');
select lives_ok(
  $$insert into public.quote_lines (quote_id, product_id, sku, description, quantity, unit_price_cents, core_charge_cents)
    values ('93000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-00000000000a', 'A-1', 'Motor A', 2, 10000, 500)$$,
  'staff add lines to a draft'
);
select lives_ok(
  $$update public.quotes set status = 'sent', sent_at = now() where id = '93000000-0000-4000-8000-000000000001'$$,
  'staff send a quote'
);
select throws_ok(
  $$update public.quote_lines set unit_price_cents = 1 where quote_id = '93000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'the lines of a sent quote are fixed'
);
select throws_ok(
  $$update public.quotes set shipping_cents = 999 where id = '93000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'a sent quote''s terms are fixed'
);
select throws_ok(
  $$update public.quotes set status = 'paid' where id = '93000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'staff cannot mark a quote paid'
);
select throws_ok(
  $$update public.quotes set status = 'approved' where id = '93000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'staff cannot approve a quote for the customer'
);
select lives_ok(
  $$update public.quotes set status = 'draft' where id = '93000000-0000-4000-8000-000000000001';
    update public.quotes set shipping_cents = 2500, status = 'sent' where id = '93000000-0000-4000-8000-000000000001'$$,
  'staff take a quote back to draft, change it and send it again'
);
select throws_ok(
  $$insert into public.quotes (quote_request_id, name, email, valid_until, token_hash)
    values ('e3000000-0000-4000-8000-000000000001', 'Ann', 'ann@example.invalid', current_date + 30, repeat('2', 64))$$,
  '23505', null, 'a request has only one live quote'
);
select lives_ok(
  $$update public.quotes set token_hash = repeat('3', 64) where id = '93000000-0000-4000-8000-000000000001'$$,
  'staff can replace the link (resend)'
);

-- A second parts quote (to decline), two repair quotes and an unsent draft.
insert into public.quotes (id, quote_request_id, customer_id, name, email, valid_until, token_hash) values
  ('93000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002',
   'Ann', 'ann@example.invalid', current_date + 30, repeat('4', 64)),
  ('93000000-0000-4000-8000-000000000005', 'e3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003',
   'Bob', 'bob@example.invalid', current_date + 30, repeat('7', 64));
insert into public.quotes (id, service_request_id, customer_id, name, email, valid_until, token_hash) values
  ('93000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002',
   'Ann', 'ann@example.invalid', current_date + 30, repeat('5', 64)),
  ('93000000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002',
   'Ann', 'ann@example.invalid', current_date - 2, repeat('6', 64));
insert into public.quote_lines (quote_id, description, quantity, unit_price_cents) values
  ('93000000-0000-4000-8000-000000000003', 'Rewind and bearings', 1, 85000);
update public.quotes set status = 'sent' where id in (
  '93000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000004'
);

delete from public.quotes where id = '93000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.quotes where id = '93000000-0000-4000-8000-000000000002'),
  1, 'staff cannot delete a sent quote'
);

-- Signed in as Ann -------------------------------------------------------------
set local "request.jwt.claims" to '{"sub":"a3000000-0000-4000-8000-000000000002"}';

select is((select count(*)::int from public.quotes), 4, 'a customer reads their own sent quotes');
select is((select count(*)::int from public.quote_lines), 2, 'and their lines');
update public.quotes set status = 'approved' where id = '93000000-0000-4000-8000-000000000003';
select is(
  (select status::text from public.quotes where id = '93000000-0000-4000-8000-000000000003'),
  'sent', 'a customer cannot change a quote themselves'
);
select throws_ok(
  $$select public.respond_to_quote('93000000-0000-4000-8000-000000000003', true)$$,
  '42501', null, 'a customer cannot call the response function directly'
);
select throws_ok(
  $$insert into public.quotes (quote_request_id, name, email, valid_until, token_hash)
    values ('e3000000-0000-4000-8000-000000000002', 'Ann', 'ann@example.invalid', current_date + 30, repeat('8', 64))$$,
  '42501', null, 'a customer cannot create a quote'
);
select throws_ok(
  $$insert into public.quote_lines (quote_id, description, quantity, unit_price_cents)
    values ('93000000-0000-4000-8000-000000000003', 'Free', 1, 0)$$,
  '42501', null, 'a customer cannot add a line'
);

-- Signed in as Bob -------------------------------------------------------------
set local "request.jwt.claims" to '{"sub":"a3000000-0000-4000-8000-000000000003"}';
select is((select count(*)::int from public.quotes), 0, 'a customer cannot read another customer''s quotes, or their own drafts');
select is((select count(*)::int from public.quote_lines), 0, 'or their lines');

-- Anonymous --------------------------------------------------------------------
set local role anon;
select throws_ok($$select count(*) from public.quotes$$, '42501', null, 'the public cannot read quotes');

-- Responses (server code, as the service role) --------------------------------
reset role;
select is(public.respond_to_quote('93000000-0000-4000-8000-000000000001', true), false, 'a parts quote is not approved, it is paid');
select is(public.respond_to_quote('93000000-0000-4000-8000-000000000003', true), true, 'a customer approves a repair quote');
select is(
  (select q.status::text || ' ' || s.status::text from public.quotes q join public.service_requests s on s.id = q.service_request_id
   where q.id = '93000000-0000-4000-8000-000000000003'),
  'approved approved', 'the quote and the job are approved'
);
select is(public.respond_to_quote('93000000-0000-4000-8000-000000000003', false), false, 'an approved quote cannot then be declined');
select is(public.respond_to_quote('93000000-0000-4000-8000-000000000004', true), false, 'an expired repair quote cannot be approved');
select is(public.respond_to_quote('93000000-0000-4000-8000-000000000004', false, '  Too much  '), true, 'it can still be declined');
select is(
  (select q.decline_reason || ' / ' || s.status::text from public.quotes q join public.service_requests s on s.id = q.service_request_id
   where q.id = '93000000-0000-4000-8000-000000000004'),
  'Too much / declined', 'the reason is kept and the job is marked declined'
);
select is(public.respond_to_quote('93000000-0000-4000-8000-000000000002', false), true, 'a customer declines a parts quote');
select is(
  (select status::text from public.quote_requests where id = 'e3000000-0000-4000-8000-000000000002'),
  'lost', 'its request is marked lost'
);

-- Paying (server code) ----------------------------------------------------------
insert into public.orders (id, customer_id, quote_id, fulfillment, subtotal_cents, core_cents, shipping_cents, total_cents, expires_at)
  values ('d3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000001',
          'ship', 20000, 1000, 2500, 23500, now() + interval '30 minutes');
insert into public.order_items (order_id, product_id, sku, name, unit_price_cents, core_charge_cents, quantity)
  values ('d3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-00000000000a', 'A-1', 'Motor A', 10000, 500, 2),
         ('d3000000-0000-4000-8000-000000000001', null, null, 'Freight crate', 3000, 0, 1);
select is(public.reserve_order_stock('d3000000-0000-4000-8000-000000000001'), true, 'a quote order needs no stock reserved');
select is(pg_temp.stock(), '10/0', 'and reserves none');
select is(public.place_order('d3000000-0000-4000-8000-000000000001', 'paid'), true, 'a paid quote order is placed');
select is(pg_temp.stock(), '10/0', 'without taking stock');
select is(
  (select q.status::text || ' ' || (q.order_id = 'd3000000-0000-4000-8000-000000000001')::text || ' ' || r.status::text
   from public.quotes q join public.quote_requests r on r.id = q.quote_request_id where q.id = '93000000-0000-4000-8000-000000000001'),
  'paid true won', 'placing it marks the quote paid and the request won'
);
select is(
  (select count(*)::int from public.core_returns where order_id = 'd3000000-0000-4000-8000-000000000001'),
  1, 'a quoted core opens a core return'
);
select is(
  private.close_order('d3000000-0000-4000-8000-000000000001', 'refunded', 'staff', true) and pg_temp.stock() = '10/0',
  true, 'refunding a quote order with restock leaves stock alone'
);

-- A cart order still reserves stock as before.
insert into public.orders (id, fulfillment, subtotal_cents, total_cents, expires_at)
  values ('d3000000-0000-4000-8000-000000000002', 'pickup', 10000, 10000, now() + interval '30 minutes');
insert into public.order_items (order_id, product_id, sku, name, condition, unit_price_cents, quantity)
  values ('d3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-00000000000a', 'A-1', 'Motor A', 'new', 10000, 1);
select is(public.reserve_order_stock('d3000000-0000-4000-8000-000000000002') and pg_temp.stock() = '10/1', true, 'cart orders still reserve stock');

-- Staff again ---------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a3000000-0000-4000-8000-000000000001"}';
update public.orders set quote_id = null where id = 'd3000000-0000-4000-8000-000000000001';
select is(
  (select quote_id from public.orders where id = 'd3000000-0000-4000-8000-000000000001'),
  '93000000-0000-4000-8000-000000000001'::uuid, 'staff cannot detach an order from its quote'
);
select lives_ok(
  $$update public.quotes set status = 'withdrawn' where id = '93000000-0000-4000-8000-000000000003';
    insert into public.quotes (service_request_id, name, email, valid_until, token_hash)
      values ('f3000000-0000-4000-8000-000000000001', 'Ann', 'ann@example.invalid', current_date + 30, repeat('9', 64))$$,
  'withdrawing an approved quote lets staff write a new one'
);
delete from public.quotes where id = '93000000-0000-4000-8000-000000000005';
select is(
  (select count(*)::int from public.quotes where id = '93000000-0000-4000-8000-000000000005'),
  0, 'staff can delete a draft'
);

select * from finish();
rollback;

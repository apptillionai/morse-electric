-- Cross-reference keys and customer equipment lists: part numbers are
-- searchable however they're punctuated, customers keep only their own
-- equipment, and staff see everyone's.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap;
select plan(17);

insert into auth.users (id, email) values
  ('a4000000-0000-4000-8000-000000000001', 'staff@example.invalid'),
  ('a4000000-0000-4000-8000-000000000002', 'ann@example.invalid'),
  ('a4000000-0000-4000-8000-000000000003', 'bob@example.invalid'),
  ('a4000000-0000-4000-8000-000000000004', 'nobody@example.invalid');
insert into public.staff (user_id) values ('a4000000-0000-4000-8000-000000000001');
insert into public.customers (user_id, email, name) values
  ('a4000000-0000-4000-8000-000000000002', 'ann@example.invalid', 'Ann'),
  ('a4000000-0000-4000-8000-000000000003', 'bob@example.invalid', 'Bob');
insert into public.categories (id, slug, name) values ('b4000000-0000-4000-8000-000000000001', 'motors', 'Motors');
insert into public.products (id, sku, slug, name, category_id, mfr_part_number, cross_references, status) values
  ('c4000000-0000-4000-8000-00000000000a', 'EM-5HP-184T', 'em-5hp', '5 HP motor', 'b4000000-0000-4000-8000-000000000001',
   'EM3615T', '{"WEG 00518ET3E184T", "Marathon U-206"}', 'active');

-- Cross-reference keys ------------------------------------------------------------
select is(
  (select part_keys from public.products where id = 'c4000000-0000-4000-8000-00000000000a'),
  'em5hp184t em3615t weg 00518et3e184t marathon u206', 'part keys are lowercase letters and digits from every part number'
);
update public.products set cross_references = '{"Leeson 121.017"}' where id = 'c4000000-0000-4000-8000-00000000000a';
select ok(
  (select part_keys like '%leeson 121017' from public.products where id = 'c4000000-0000-4000-8000-00000000000a'),
  'changing the cross-references updates the keys'
);
select throws_ok(
  $$update public.products set cross_references = array_fill('x'::text, array[31]) where id = 'c4000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'a product has at most 30 cross-references'
);

set local role anon;
select is(
  (select count(*)::int from public.products where part_keys like '%em3615t%'),
  1, 'the public can search active products by part keys'
);
reset role;

insert into public.equipment (id, customer_id, label, make, hp) values
  ('e4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'Cooling tower fan', 'Baldor', 5),
  ('e4000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000003', 'Bob''s pump', null, null);
insert into public.service_requests (id, equipment_type, name, email, phone, symptoms, customer_id, equipment_id) values
  ('f4000000-0000-4000-8000-000000000001', 'motor', 'Ann', 'ann@example.invalid', '555-0100', 'Hot bearings',
   'a4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000001');

-- Signed in as Ann ------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a4000000-0000-4000-8000-000000000002"}';

select lives_ok(
  $$insert into public.equipment (id, customer_id, label, equipment_type, hp, rpm, frame)
    values ('e4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000002', 'Air compressor', 'motor', 10, 1760, '215T')$$,
  'a customer adds equipment to their own list'
);
select is((select count(*)::int from public.equipment), 2, 'a customer sees only their own equipment');
select throws_ok(
  $$insert into public.equipment (customer_id, label) values ('a4000000-0000-4000-8000-000000000003', 'Sneaky')$$,
  '42501', null, 'a customer cannot add equipment to someone else''s list'
);
update public.equipment set customer_id = 'a4000000-0000-4000-8000-000000000003', label = 'Air compressor (shop)'
  where id = 'e4000000-0000-4000-8000-000000000002';
select is(
  (select customer_id::text || ' ' || label from public.equipment where id = 'e4000000-0000-4000-8000-000000000002'),
  'a4000000-0000-4000-8000-000000000002 Air compressor (shop)', 'a customer can edit their unit but not give it away'
);
update public.equipment set label = 'Mine now' where id = 'e4000000-0000-4000-8000-000000000003';
delete from public.equipment where id = 'e4000000-0000-4000-8000-000000000003';
reset role;
select is(
  (select label from public.equipment where id = 'e4000000-0000-4000-8000-000000000003'),
  'Bob''s pump', 'a customer cannot change or delete someone else''s equipment'
);
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a4000000-0000-4000-8000-000000000002"}';
select is(
  (select count(*)::int from public.service_requests where equipment_id = 'e4000000-0000-4000-8000-000000000001'),
  1, 'a customer sees the repair history of their own unit'
);
select lives_ok(
  $$delete from public.equipment where id = 'e4000000-0000-4000-8000-000000000002'$$,
  'a customer removes a unit from their list'
);

-- Signed in as Bob -------------------------------------------------------------------
set local "request.jwt.claims" to '{"sub":"a4000000-0000-4000-8000-000000000003"}';
select is((select count(*)::int from public.equipment), 1, 'Bob sees only his own unit');

-- Signed in without a customer profile -------------------------------------------------
set local "request.jwt.claims" to '{"sub":"a4000000-0000-4000-8000-000000000004"}';
select throws_ok(
  $$insert into public.equipment (customer_id, label) values ('a4000000-0000-4000-8000-000000000004', 'Orphan')$$,
  '42501', null, 'a signed-in user without a customer profile cannot add equipment'
);

-- Anonymous ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select count(*) from public.equipment$$, '42501', null, 'the public cannot read equipment');

-- Staff --------------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a4000000-0000-4000-8000-000000000001"}';
select is((select count(*)::int from public.equipment), 2, 'staff see everyone''s equipment');
select lives_ok(
  $$insert into public.equipment (customer_id, label) values ('a4000000-0000-4000-8000-000000000003', 'Added by staff')$$,
  'staff can add equipment for a customer'
);

reset role;
delete from public.equipment where id = 'e4000000-0000-4000-8000-000000000001';
select is(
  (select equipment_id from public.service_requests where id = 'f4000000-0000-4000-8000-000000000001'),
  null, 'removing a unit keeps its repair jobs, unlinked'
);

select * from finish();
rollback;

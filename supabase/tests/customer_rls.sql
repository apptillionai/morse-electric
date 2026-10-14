-- Customer accounts: customers see and edit only their own profile, read only
-- their own requests (never staff notes) and upload only to their own folder.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap;
select plan(24);

insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'staff@example.invalid'),
  ('e1000000-0000-4000-8000-000000000002', 'ann@example.invalid'),
  ('e1000000-0000-4000-8000-000000000003', 'bob@example.invalid'),
  ('e1000000-0000-4000-8000-000000000004', 'nobody@example.invalid');
insert into public.staff (user_id) values ('e1000000-0000-4000-8000-000000000001');
insert into public.customers (user_id, email, name) values
  ('e1000000-0000-4000-8000-000000000002', 'ann@example.invalid', 'Ann'),
  ('e1000000-0000-4000-8000-000000000003', 'bob@example.invalid', 'Bob');
insert into public.quote_requests (id, name, email, details, customer_id) values
  ('f1000000-0000-4000-8000-000000000001', 'Ann', 'ann@example.invalid', 'x', 'e1000000-0000-4000-8000-000000000002'),
  ('f1000000-0000-4000-8000-000000000002', 'Bob', 'bob@example.invalid', 'x', 'e1000000-0000-4000-8000-000000000003'),
  ('f1000000-0000-4000-8000-000000000003', 'Guest', 'guest@example.invalid', 'x', null);
insert into public.service_requests (id, equipment_type, name, email, phone, symptoms, customer_id) values
  ('f2000000-0000-4000-8000-000000000001', 'motor', 'Ann', 'ann@example.invalid', '5550000000', 'hums', 'e1000000-0000-4000-8000-000000000002'),
  ('f2000000-0000-4000-8000-000000000002', 'pump', 'Bob', 'bob@example.invalid', '5550000000', 'leaks', 'e1000000-0000-4000-8000-000000000003');
insert into public.service_request_notes (service_request_id, notes)
  values ('f2000000-0000-4000-8000-000000000001', 'Customer is difficult');

-- Signed in as the customer Ann ----------------------------------------------
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e1000000-0000-4000-8000-000000000002"}';

select is((select count(*)::int from public.customers), 1, 'a customer sees only their own profile');
select is((select count(*)::int from public.quote_requests), 1, 'a customer sees only their own quote requests');
select is((select count(*)::int from public.service_requests), 1, 'a customer sees only their own service requests');
select is((select count(*)::int from public.service_request_notes), 0, 'a customer cannot read staff notes');
select is((select count(*)::int from public.quote_request_notes), 0, 'a customer cannot read quote notes');

update public.customers set phone = '555-0100', ship_city = 'Springfield' where user_id = 'e1000000-0000-4000-8000-000000000002';
select is((select phone from public.customers), '555-0100', 'a customer can edit their contact details');
update public.customers set tax_exempt = true, email = 'evil@example.invalid' where user_id = 'e1000000-0000-4000-8000-000000000002';
select ok((select not tax_exempt and email = 'ann@example.invalid' from public.customers), 'a customer cannot approve their own tax exemption or change their email');
select throws_ok(
  $$update public.customers set tax_cert_path = 'e1000000-0000-4000-8000-000000000003/x.pdf' where user_id = 'e1000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'a customer cannot point their certificate at another folder'
);
update public.customers set name = 'Mallory' where user_id = 'e1000000-0000-4000-8000-000000000003';
reset role;
select is((select name from public.customers where user_id = 'e1000000-0000-4000-8000-000000000003'), 'Bob', 'a customer cannot edit someone else''s profile');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e1000000-0000-4000-8000-000000000002"}';

update public.service_requests set status = 'closed' where id = 'f2000000-0000-4000-8000-000000000001';
reset role;
select is((select status::text from public.service_requests where id = 'f2000000-0000-4000-8000-000000000001'), 'received', 'a customer cannot change a request''s status');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e1000000-0000-4000-8000-000000000002"}';

select throws_ok(
  $$insert into public.customers (user_id, email, name) values ('e1000000-0000-4000-8000-000000000004', 'n@example.invalid', 'N')$$,
  '42501', null, 'a customer cannot create customer accounts'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('customer-documents', 'e1000000-0000-4000-8000-000000000002/cert.pdf')$$,
  'a customer can upload to their own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('customer-documents', 'e1000000-0000-4000-8000-000000000003/cert.pdf')$$,
  '42501', null, 'a customer cannot upload into another customer''s folder'
);

reset role;
insert into storage.objects (bucket_id, name) values ('customer-documents', 'e1000000-0000-4000-8000-000000000003/bob.pdf');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e1000000-0000-4000-8000-000000000002"}';
select is((select count(*)::int from storage.objects where bucket_id = 'customer-documents'), 1, 'a customer sees only their own documents');

-- Signed in, but not a customer (and not staff) ------------------------------
set local "request.jwt.claims" to '{"sub":"e1000000-0000-4000-8000-000000000004"}';
select is((select count(*)::int from public.customers), 0, 'a non-customer sees no profiles');
select is((select count(*)::int from public.service_requests), 0, 'a non-customer sees no service requests');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('customer-documents', 'e1000000-0000-4000-8000-000000000004/x.pdf')$$,
  '42501', null, 'a signed-in user without a customer profile cannot upload documents'
);

-- Anonymous -------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok('select * from public.customers', '42501', null, 'anon cannot read customers');
select throws_ok('select * from public.service_request_notes', '42501', null, 'anon cannot read staff notes');

-- Staff -----------------------------------------------------------------------
reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e1000000-0000-4000-8000-000000000001"}';
select is((select count(*)::int from public.customers), 2, 'staff see every customer');
select is((select count(*)::int from public.quote_requests), 3, 'staff see every quote request');
select lives_ok(
  $$update public.customers set tax_exempt = true where user_id = 'e1000000-0000-4000-8000-000000000002'$$,
  'staff can approve a tax exemption'
);
select ok((select tax_exempt from public.customers where user_id = 'e1000000-0000-4000-8000-000000000002'), 'tax exemption approved');
select is((select count(*)::int from storage.objects where bucket_id = 'customer-documents'), 2, 'staff can read every customer document');

select * from finish();
rollback;

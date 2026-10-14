-- Customer accounts (invite only).
--
-- Staff invite a customer from /admin; that creates the auth user (service
-- role, server-side) and a public.customers row. Signed-in customers can read
-- and edit their own profile, see their own quote and service requests, and
-- upload a tax-exemption certificate. Public sign-ups stay disabled.

create table public.customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  name text not null check (char_length(name) between 1 and 120),
  company text check (company is null or char_length(company) <= 160),
  phone text check (phone is null or char_length(phone) <= 40),
  ship_line1 text check (ship_line1 is null or char_length(ship_line1) <= 160),
  ship_line2 text check (ship_line2 is null or char_length(ship_line2) <= 160),
  ship_city text check (ship_city is null or char_length(ship_city) <= 80),
  ship_state text check (ship_state is null or char_length(ship_state) <= 40),
  ship_postal text check (ship_postal is null or char_length(ship_postal) <= 20),
  bill_same_as_ship boolean not null default true,
  bill_line1 text check (bill_line1 is null or char_length(bill_line1) <= 160),
  bill_line2 text check (bill_line2 is null or char_length(bill_line2) <= 160),
  bill_city text check (bill_city is null or char_length(bill_city) <= 80),
  bill_state text check (bill_state is null or char_length(bill_state) <= 40),
  bill_postal text check (bill_postal is null or char_length(bill_postal) <= 20),
  -- Set by staff once they've checked the certificate.
  tax_exempt boolean not null default false,
  tax_cert_path text check (tax_cert_path is null or char_length(tax_cert_path) <= 300),
  tax_cert_uploaded_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customers_email_key on public.customers (lower(email));
create index customers_invited_by_idx on public.customers (invited_by) where invited_by is not null;

create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- Customers may edit their contact details and addresses, but not their
-- identity, their tax-exempt approval or who invited them.
create or replace function private.guard_customer_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not (select private.is_staff()) then
    new.user_id := old.user_id;
    new.email := old.email;
    new.tax_exempt := old.tax_exempt;
    new.invited_by := old.invited_by;
    new.created_at := old.created_at;
    if new.tax_cert_path is not null and new.tax_cert_path not like old.user_id::text || '/%' then
      raise exception 'Certificate must be in the customer''s own folder' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_customer_update() from public, anon, authenticated;

create trigger customers_guard before update on public.customers
  for each row execute function private.guard_customer_update();

alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;
grant select, insert, update, delete on public.customers to authenticated;

create policy "Customers read their own profile; staff read all" on public.customers
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy "Customers update their own profile; staff update all" on public.customers
  for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()))
  with check (user_id = (select auth.uid()) or (select private.is_staff()));
create policy "Staff add customers" on public.customers
  for insert to authenticated with check ((select private.is_staff()));
create policy "Staff remove customers" on public.customers
  for delete to authenticated using ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Requests belong to a customer when they were sent while signed in (or were
-- linked by staff). Customers can read their own; only staff change them.
-- ---------------------------------------------------------------------------

alter table public.quote_requests
  add column customer_id uuid references public.customers (user_id) on delete set null;
alter table public.service_requests
  add column customer_id uuid references public.customers (user_id) on delete set null;
create index quote_requests_customer_idx on public.quote_requests (customer_id, created_at desc)
  where customer_id is not null;
create index service_requests_customer_idx on public.service_requests (customer_id, created_at desc)
  where customer_id is not null;

-- Widen the existing staff read policies (one policy per action keeps the
-- advisors happy and avoids evaluating two policies per row).
alter policy "Staff read quote requests" on public.quote_requests
  rename to "Customers read their own quote requests; staff read all";
alter policy "Customers read their own quote requests; staff read all" on public.quote_requests
  using (customer_id = (select auth.uid()) or (select private.is_staff()));
alter policy "Staff read service requests" on public.service_requests
  rename to "Customers read their own service requests; staff read all";
alter policy "Customers read their own service requests; staff read all" on public.service_requests
  using (customer_id = (select auth.uid()) or (select private.is_staff()));

-- Staff notes move to staff-only tables, because customers can now read
-- their own request rows and the notes must stay private. The old
-- staff_notes columns are removed by the next migration.
create table public.quote_request_notes (
  quote_request_id uuid primary key references public.quote_requests (id) on delete cascade,
  notes text not null check (char_length(notes) <= 4000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.service_request_notes (
  service_request_id uuid primary key references public.service_requests (id) on delete cascade,
  notes text not null check (char_length(notes) <= 4000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index quote_request_notes_updated_by_idx on public.quote_request_notes (updated_by) where updated_by is not null;
create index service_request_notes_updated_by_idx on public.service_request_notes (updated_by) where updated_by is not null;

insert into public.quote_request_notes (quote_request_id, notes)
  select id, staff_notes from public.quote_requests where staff_notes is not null and staff_notes <> '';
insert into public.service_request_notes (service_request_id, notes)
  select id, staff_notes from public.service_requests where staff_notes is not null and staff_notes <> '';

alter table public.quote_request_notes enable row level security;
alter table public.service_request_notes enable row level security;
revoke all on public.quote_request_notes, public.service_request_notes from anon, authenticated;
grant select, insert, update, delete on public.quote_request_notes, public.service_request_notes to authenticated;
create policy "Staff manage quote request notes" on public.quote_request_notes
  for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "Staff manage service request notes" on public.service_request_notes
  for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Private bucket for tax-exemption certificates: <user_id>/<file>.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-documents', 'customer-documents', false, 4194304,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "Customers upload to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customer-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.customers c where c.user_id = (select auth.uid()))
  );
create policy "Customers read their own documents; staff read all" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff()))
  );
create policy "Customers delete their own documents; staff delete all" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'customer-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff()))
  );

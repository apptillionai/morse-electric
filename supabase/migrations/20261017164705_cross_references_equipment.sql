-- Cross-reference search and customer equipment lists (Phase 2, step 5).
--
--   * products.cross_references: other part numbers the product replaces
--     (competitors', the original manufacturer's). part_keys holds the SKU,
--     manufacturer part # and cross-references as lowercase letters and
--     digits only, kept up to date by a trigger, so "EM-3615T", "em3615t" and
--     "EM 3615T" all find the same product. Public, like the rest of an active
--     product.
--   * equipment: a customer's own motors, pumps and so on, with nameplate
--     details. Customers keep their own list; staff see everyone's. A service
--     request can point at the unit it's for (service_requests.equipment_id),
--     which gives each unit its repair history.

alter table public.products
  add column cross_references text[] not null default '{}'
    check (cardinality(cross_references) <= 30),
  add column part_keys text not null default '';

create or replace function private.set_part_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.part_keys := lower(regexp_replace(
    concat_ws(' ', new.sku, new.mfr_part_number, nullif(array_to_string(new.cross_references, ' '), '')),
    '[^A-Za-z0-9 ]', '', 'g'
  ));
  return new;
end;
$$;
revoke all on function private.set_part_keys() from public, anon, authenticated;

create trigger products_part_keys before insert or update of sku, mfr_part_number, cross_references on public.products
  for each row execute function private.set_part_keys();

-- Fill part_keys for the products already there.
update public.products set cross_references = cross_references;

create index products_part_keys_trgm_idx on public.products using gin (part_keys extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Equipment lists
-- ---------------------------------------------------------------------------

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (user_id) on delete cascade,
  -- What the customer calls it: "Cooling tower fan #2".
  label text not null check (char_length(label) between 1 and 120),
  equipment_type public.equipment_type not null default 'motor',
  make text check (make is null or char_length(make) <= 120),
  model text check (model is null or char_length(model) <= 160),
  serial text check (serial is null or char_length(serial) <= 160),
  hp numeric(8, 3) check (hp is null or hp between 0 and 100000),
  rpm integer check (rpm is null or rpm between 0 and 100000),
  voltage text check (voltage is null or char_length(voltage) <= 60),
  frame text check (frame is null or char_length(frame) <= 20),
  enclosure public.enclosure_type,
  power public.power_supply,
  location text check (location is null or char_length(location) <= 160),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index equipment_customer_idx on public.equipment (customer_id, label);

create trigger equipment_updated_at before update on public.equipment
  for each row execute function public.set_updated_at();

-- A unit stays with the customer it was added for.
create or replace function private.guard_equipment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.id := old.id;
    new.customer_id := old.customer_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_equipment_update() from public, anon, authenticated;

create trigger equipment_guard before update on public.equipment
  for each row execute function private.guard_equipment_update();

alter table public.equipment enable row level security;
revoke all on public.equipment from anon, authenticated;
grant select, insert, update, delete on public.equipment to authenticated;

create policy "Customers read their own equipment; staff read all" on public.equipment
  for select to authenticated
  using (customer_id = (select auth.uid()) or (select private.is_staff()));
create policy "Customers add their own equipment; staff add any" on public.equipment
  for insert to authenticated
  with check (
    (customer_id = (select auth.uid()) and exists (select 1 from public.customers c where c.user_id = (select auth.uid())))
    or (select private.is_staff())
  );
create policy "Customers update their own equipment; staff update all" on public.equipment
  for update to authenticated
  using (customer_id = (select auth.uid()) or (select private.is_staff()))
  with check (customer_id = (select auth.uid()) or (select private.is_staff()));
create policy "Customers remove their own equipment; staff remove any" on public.equipment
  for delete to authenticated
  using (customer_id = (select auth.uid()) or (select private.is_staff()));

-- Which unit a repair is for. Set by server code when a signed-in customer
-- picks one of their own units on the service form, or by staff.
alter table public.service_requests
  add column equipment_id uuid references public.equipment (id) on delete set null;
create index service_requests_equipment_idx on public.service_requests (equipment_id) where equipment_id is not null;

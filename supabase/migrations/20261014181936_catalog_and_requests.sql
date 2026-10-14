-- Catalog (categories, brands, products, inventory, media) and inbound
-- quote / service requests for the Morse Electric Motor Co. site.
--
-- Access model:
--   * anon/authenticated may READ categories, brands and ACTIVE products
--     (plus their images and documents). Stock is exposed only as the
--     products.in_stock flag; exact quantities stay in `inventory`.
--   * quote_requests, service_requests and inventory have no public access.
--     The site writes requests with the service-role key from server code.
--   * Staff policies arrive with the admin back office.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create type public.product_condition as enum ('new', 'remanufactured', 'used_tested', 'exchange');
create type public.ship_class as enum ('parcel', 'ltl', 'pickup_only');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.enclosure_type as enum ('tefc', 'odp', 'tenv', 'xp', 'washdown', 'other');
create type public.power_supply as enum ('ac_1ph', 'ac_3ph', 'dc');

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Condition variants of the same unit (new / reman / exchange) share a family.
  family_key text,
  name text not null,
  description text,
  category_id uuid not null references public.categories (id) on delete restrict,
  brand_id uuid references public.brands (id) on delete set null,
  mfr_part_number text,
  condition public.product_condition not null default 'new',
  -- Null price means "price on request" (quote only).
  price_cents integer check (price_cents is null or price_cents >= 0),
  core_charge_cents integer check (core_charge_cents is null or core_charge_cents >= 0),
  ship_class public.ship_class not null default 'parcel',
  weight_lb numeric(8, 2) check (weight_lb is null or weight_lb >= 0),
  -- Typed, filterable nameplate fields.
  hp numeric(8, 3) check (hp is null or hp >= 0),
  rpm integer check (rpm is null or rpm >= 0),
  frame text,
  enclosure public.enclosure_type,
  power public.power_supply,
  voltage text,
  -- Everything else on the spec sheet, as [{"label": "...", "value": "..."}].
  specs jsonb not null default '[]'::jsonb check (jsonb_typeof(specs) = 'array'),
  -- Maintained from `inventory` by trigger; the only stock signal exposed publicly.
  in_stock boolean not null default false,
  featured boolean not null default false,
  status public.product_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_idx on public.products (category_id) where status = 'active';
create index products_family_idx on public.products (family_key) where family_key is not null;
create index products_hp_idx on public.products (hp);
create index products_rpm_idx on public.products (rpm);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index products_sku_trgm_idx on public.products using gin (sku extensions.gin_trgm_ops);
create index products_mfr_trgm_idx on public.products using gin (mfr_part_number extensions.gin_trgm_ops);

create table public.inventory (
  product_id uuid primary key references public.products (id) on delete cascade,
  qty_on_hand integer not null default 0 check (qty_on_hand >= 0),
  qty_reserved integer not null default 0 check (qty_reserved >= 0),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  alt text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

create table public.product_documents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label text not null,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_documents_product_idx on public.product_documents (product_id, sort_order);

create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger brands_updated_at before update on public.brands
  for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger inventory_updated_at before update on public.inventory
  for each row execute function public.set_updated_at();

create or replace function public.sync_product_in_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.products set in_stock = false where id = old.product_id;
    return old;
  end if;
  update public.products
    set in_stock = (new.qty_on_hand - new.qty_reserved) > 0
    where id = new.product_id;
  return new;
end;
$$;

create trigger inventory_sync_in_stock
  after insert or update or delete on public.inventory
  for each row execute function public.sync_product_in_stock();

-- ---------------------------------------------------------------------------
-- Inbound requests
-- ---------------------------------------------------------------------------

create type public.quote_status as enum ('new', 'quoted', 'won', 'lost', 'spam');
create type public.service_status as enum (
  'received', 'teardown', 'quoted', 'approved', 'in_repair', 'testing', 'ready', 'delivered', 'closed', 'spam'
);
create type public.equipment_type as enum (
  'motor', 'pump', 'blower', 'vacuum_pump', 'starter', 'alternator', 'other'
);

create sequence public.quote_request_number_seq start 1001;
create sequence public.service_request_number_seq start 1001;

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default ('Q-' || nextval('public.quote_request_number_seq')::text),
  status public.quote_status not null default 'new',
  name text not null check (char_length(name) between 1 and 120),
  company text check (company is null or char_length(company) <= 160),
  email text not null check (char_length(email) between 3 and 254),
  phone text check (phone is null or char_length(phone) <= 40),
  product_id uuid references public.products (id) on delete set null,
  product_sku text check (product_sku is null or char_length(product_sku) <= 80),
  quantity integer check (quantity is null or quantity between 1 and 10000),
  details text check (details is null or char_length(details) <= 4000),
  source_path text check (source_path is null or char_length(source_path) <= 500),
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quote_requests_status_idx on public.quote_requests (status, created_at desc);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default ('SR-' || nextval('public.service_request_number_seq')::text),
  status public.service_status not null default 'received',
  equipment_type public.equipment_type not null,
  name text not null check (char_length(name) between 1 and 120),
  company text check (company is null or char_length(company) <= 160),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null check (char_length(phone) between 7 and 40),
  make text check (make is null or char_length(make) <= 120),
  size text check (size is null or char_length(size) <= 60),
  model_serial text check (model_serial is null or char_length(model_serial) <= 160),
  symptoms text not null check (char_length(symptoms) between 1 and 4000),
  wants_pickup boolean not null default false,
  is_rush boolean not null default false,
  wants_replacement_quote boolean not null default false,
  source_path text check (source_path is null or char_length(source_path) <= 500),
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_requests_status_idx on public.service_requests (status, created_at desc);

create trigger quote_requests_updated_at before update on public.quote_requests
  for each row execute function public.set_updated_at();
create trigger service_requests_updated_at before update on public.service_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security and grants
-- ---------------------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.product_images enable row level security;
alter table public.product_documents enable row level security;
alter table public.quote_requests enable row level security;
alter table public.service_requests enable row level security;

revoke all on public.inventory, public.quote_requests, public.service_requests from anon, authenticated;
revoke all on public.categories, public.brands, public.products, public.product_images, public.product_documents
  from anon, authenticated;
grant select on public.categories, public.brands, public.products, public.product_images, public.product_documents
  to anon, authenticated;

create policy "Catalog categories are public" on public.categories
  for select to anon, authenticated using (true);

create policy "Brands are public" on public.brands
  for select to anon, authenticated using (true);

create policy "Active products are public" on public.products
  for select to anon, authenticated using (status = 'active');

create policy "Images of active products are public" on public.product_images
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p where p.id = product_id and p.status = 'active'
  ));

create policy "Documents of active products are public" on public.product_documents
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p where p.id = product_id and p.status = 'active'
  ));

-- Public buckets for catalog media; uploads are staff-only (service role for now).
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true), ('product-documents', 'product-documents', true)
on conflict (id) do nothing;

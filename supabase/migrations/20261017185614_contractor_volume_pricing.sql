-- Contractor and volume pricing (Phase 2, step 6).
--
--   * price_tiers: named discounts staff give to customers ("Contractor",
--     10% off). customers.price_tier_id puts a customer on a tier; customers
--     can see their own tier but can't choose or change it.
--   * products.price_breaks: quantity prices, e.g. 5 or more at $650 each.
--     A JSON array of {"min_qty", "price_cents"}, ascending by quantity, each
--     price below the one before and below the list price. Public, like the
--     list price. A product with no list price has no breaks.
--   * A customer pays the lower of their tier price and the quantity price,
--     never both discounts together. That's worked out in the app
--     (lib/orders/pricing.ts) when the cart is priced, and each order item
--     records the unit price actually charged, as before.

create table public.price_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  discount_percent numeric(4, 2) not null check (discount_percent > 0 and discount_percent <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index price_tiers_name_key on public.price_tiers (lower(name));

create trigger price_tiers_updated_at before update on public.price_tiers
  for each row execute function public.set_updated_at();

alter table public.customers
  add column price_tier_id uuid references public.price_tiers (id) on delete set null;
create index customers_price_tier_idx on public.customers (price_tier_id) where price_tier_id is not null;

-- Customers can't put themselves on a tier.
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
    new.stripe_customer_id := old.stripe_customer_id;
    new.terms := old.terms;
    new.credit_limit_cents := old.credit_limit_cents;
    new.price_tier_id := old.price_tier_id;
    if new.tax_cert_path is not null and new.tax_cert_path not like old.user_id::text || '/%' then
      raise exception 'Certificate must be in the customer''s own folder' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

alter table public.price_tiers enable row level security;
revoke all on public.price_tiers from anon, authenticated;
grant select, insert, update, delete on public.price_tiers to authenticated;

create policy "Customers read their own tier; staff read all" on public.price_tiers
  for select to authenticated
  using (
    (select private.is_staff())
    or id = (select c.price_tier_id from public.customers c where c.user_id = (select auth.uid()))
  );
create policy "Staff add tiers" on public.price_tiers
  for insert to authenticated with check ((select private.is_staff()));
create policy "Staff edit tiers" on public.price_tiers
  for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));
create policy "Staff remove tiers" on public.price_tiers
  for delete to authenticated using ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Quantity price breaks
-- ---------------------------------------------------------------------------

create or replace function private.valid_price_breaks(breaks jsonb, list_price integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  b jsonb;
  qty integer;
  price integer;
  last_qty integer := 1;
  last_price integer := list_price;
begin
  if jsonb_typeof(breaks) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(breaks) = 0 then
    return true;
  end if;
  if list_price is null or jsonb_array_length(breaks) > 5 then
    return false;
  end if;
  for b in select value from jsonb_array_elements(breaks) loop
    if jsonb_typeof(b) <> 'object'
       or (select count(*) from jsonb_object_keys(b)) <> 2
       or jsonb_typeof(b -> 'min_qty') <> 'number'
       or jsonb_typeof(b -> 'price_cents') <> 'number'
       or (b ->> 'min_qty') !~ '^[0-9]{1,4}$'
       or (b ->> 'price_cents') !~ '^[0-9]{1,9}$' then
      return false;
    end if;
    qty := (b ->> 'min_qty')::integer;
    price := (b ->> 'price_cents')::integer;
    if qty <= last_qty or price < 1 or price >= last_price then
      return false;
    end if;
    last_qty := qty;
    last_price := price;
  end loop;
  return true;
end;
$$;
-- A pure check that every role writing products (staff sessions, the service
-- role, stock triggers) runs, so it keeps the default execute grant.

alter table public.products
  add column price_breaks jsonb not null default '[]'::jsonb
    constraint products_price_breaks_valid check (private.valid_price_breaks(price_breaks, price_cents));

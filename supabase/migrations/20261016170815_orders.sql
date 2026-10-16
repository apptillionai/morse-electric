-- Online orders (Phase 2, step 1): cart → Stripe Checkout → order.
--
-- Flow:
--   1. Checkout creates an order in status 'checkout' with its items, and
--      reserves stock (inventory.qty_reserved) with reserve_order_stock().
--   2. The Stripe webhook places it with place_order(): 'paid' for cards,
--      'pending_payment' while an ACH debit clears. Placing moves the
--      reserved quantity out of qty_on_hand.
--   3. An abandoned checkout is cancelled with cancel_checkout(), which
--      releases the reservation (Stripe's expiry event, or
--      release_stale_checkouts() as a safety net).
--   4. Staff fulfil it (processing → shipped / ready_for_pickup →
--      completed) or cancel / refund it with staff_close_order().
--
-- Access model:
--   * Orders and items are written only by server code with the service-role
--     key, through the functions below so stock and status move together.
--   * Customers read their own orders and items. Staff read everything and
--     update fulfilment fields. Staff notes live in order_notes.
--   * The store is off until staff turn it on in /admin/settings.

-- ---------------------------------------------------------------------------
-- Store settings
-- ---------------------------------------------------------------------------

alter table public.site_settings
  add column store_enabled boolean not null default false,
  -- Parcel shipping by total weight: [{"max_lb": 10, "cents": 1500}, …],
  -- ascending. Heavier carts (or items without a weight) are pickup-only.
  add column shipping_rates jsonb not null default '[]'::jsonb
    check (jsonb_typeof(shipping_rates) = 'array' and jsonb_array_length(shipping_rates) <= 20);

-- ---------------------------------------------------------------------------
-- Customers: the Stripe customer used at checkout (tax-exempt status, saved
-- details). Only server code and staff set it.
-- ---------------------------------------------------------------------------

alter table public.customers
  add column stripe_customer_id text check (stripe_customer_id is null or char_length(stripe_customer_id) <= 100);

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
    if new.tax_cert_path is not null and new.tax_cert_path not like old.user_id::text || '/%' then
      raise exception 'Certificate must be in the customer''s own folder' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

create type public.order_status as enum (
  'checkout', 'pending_payment', 'paid', 'processing', 'shipped', 'ready_for_pickup', 'completed', 'cancelled', 'refunded'
);
create type public.fulfillment_method as enum ('ship', 'pickup');

create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('O-' || nextval('public.order_number_seq')::text),
  status public.order_status not null default 'checkout',
  customer_id uuid references public.customers (user_id) on delete set null,
  -- Contact details come from Stripe once the customer has paid.
  email text check (email is null or char_length(email) <= 254),
  name text check (name is null or char_length(name) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  fulfillment public.fulfillment_method not null,
  ship_name text check (ship_name is null or char_length(ship_name) <= 200),
  ship_line1 text check (ship_line1 is null or char_length(ship_line1) <= 200),
  ship_line2 text check (ship_line2 is null or char_length(ship_line2) <= 200),
  ship_city text check (ship_city is null or char_length(ship_city) <= 100),
  ship_state text check (ship_state is null or char_length(ship_state) <= 40),
  ship_postal text check (ship_postal is null or char_length(ship_postal) <= 20),
  ship_country text check (ship_country is null or char_length(ship_country) <= 2),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  payment_method text check (payment_method is null or payment_method in ('card', 'ach', 'net30', 'other')),
  stripe_checkout_session_id text unique check (stripe_checkout_session_id is null or char_length(stripe_checkout_session_id) <= 255),
  stripe_payment_intent_id text check (stripe_payment_intent_id is null or char_length(stripe_payment_intent_id) <= 255),
  carrier text check (carrier is null or char_length(carrier) <= 60),
  tracking_number text check (tracking_number is null or char_length(tracking_number) <= 100),
  cancel_reason text check (cancel_reason is null or cancel_reason in ('expired', 'payment_failed', 'staff')),
  expires_at timestamptz,
  paid_at timestamptz,
  shipped_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc) where customer_id is not null;

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- What was bought, copied at the time of sale so catalog edits never change
-- a past order.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  sku text not null check (char_length(sku) <= 80),
  name text not null check (char_length(name) <= 300),
  condition public.product_condition not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity between 1 and 999),
  weight_lb numeric(8, 2) check (weight_lb is null or weight_lb >= 0),
  sort_order integer not null default 0
);
create index order_items_order_idx on public.order_items (order_id, sort_order);
create index order_items_product_idx on public.order_items (product_id) where product_id is not null;

create table public.order_notes (
  order_id uuid primary key references public.orders (id) on delete cascade,
  notes text not null check (char_length(notes) <= 4000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index order_notes_updated_by_idx on public.order_notes (updated_by) where updated_by is not null;

-- Stripe webhook events already handled, so a redelivered event is skipped.
create table public.stripe_events (
  id text primary key check (char_length(id) <= 255),
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_notes enable row level security;
alter table public.stripe_events enable row level security;
revoke all on public.orders, public.order_items, public.order_notes, public.stripe_events from anon, authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select, insert, update, delete on public.order_notes to authenticated;

create policy "Customers read their own orders; staff read all" on public.orders
  for select to authenticated
  using (customer_id = (select auth.uid()) or (select private.is_staff()));
create policy "Staff update orders" on public.orders
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
-- An item is visible exactly when its order is.
create policy "Read items of orders the reader can see" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));
create policy "Staff manage order notes" on public.order_notes
  for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

-- Staff may update fulfilment fields, but status changes that move stock
-- (placing, cancelling, refunding) go through the functions below.
create or replace function private.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if new.status is distinct from old.status
       and (new.status in ('checkout', 'pending_payment', 'paid', 'cancelled', 'refunded')
            or old.status in ('checkout', 'pending_payment', 'cancelled', 'refunded')) then
      raise exception 'Use the cancel or refund action for that change' using errcode = '42501';
    end if;
    new.id := old.id;
    new.reference := old.reference;
    new.customer_id := old.customer_id;
    new.subtotal_cents := old.subtotal_cents;
    new.shipping_cents := old.shipping_cents;
    new.tax_cents := old.tax_cents;
    new.total_cents := old.total_cents;
    new.payment_method := old.payment_method;
    new.stripe_checkout_session_id := old.stripe_checkout_session_id;
    new.stripe_payment_intent_id := old.stripe_payment_intent_id;
    new.paid_at := old.paid_at;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_order_update() from public, anon, authenticated;

create trigger orders_guard before update on public.orders
  for each row execute function private.guard_order_update();

-- ---------------------------------------------------------------------------
-- Stock and status functions. They run as the owner so they can move stock,
-- and each one only acts from the status it expects, so calling it twice
-- (a redelivered webhook) changes nothing the second time.
-- ---------------------------------------------------------------------------

-- Quantity of each product on an order.
create or replace function private.order_quantities(p_order_id uuid)
returns table (product_id uuid, qty integer)
language sql
stable
set search_path = ''
as $$
  select oi.product_id, sum(oi.quantity)::integer
  from public.order_items oi
  where oi.order_id = p_order_id
  group by oi.product_id;
$$;

-- Reserve stock for a new checkout. All or nothing: false if anything is
-- short (or no longer in the catalog), and nothing is reserved.
create or replace function public.reserve_order_stock(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  short integer;
begin
  perform 1 from public.orders where id = p_order_id and status = 'checkout' for update;
  if not found then
    return false;
  end if;
  -- Lock in a fixed order so two checkouts can't deadlock.
  perform 1 from public.inventory i
    where i.product_id in (select q.product_id from private.order_quantities(p_order_id) q)
    order by i.product_id
    for update;
  select count(*) into short
    from private.order_quantities(p_order_id) q
    left join public.inventory i on i.product_id = q.product_id
    where i.product_id is null or i.qty_on_hand - i.qty_reserved < q.qty;
  if short > 0 then
    return false;
  end if;
  update public.inventory i
    set qty_reserved = i.qty_reserved + q.qty
    from private.order_quantities(p_order_id) q
    where i.product_id = q.product_id;
  return true;
end;
$$;

-- Payment went through (or an ACH debit started): place the order and take
-- the stock. Also rescues a checkout that was cancelled as abandoned just
-- before its payment arrived, taking the stock straight from what's on hand.
create or replace function public.place_order(p_order_id uuid, p_status public.order_status)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.order_status;
  previous_reason text;
begin
  if p_status not in ('paid', 'pending_payment') then
    raise exception 'place_order only sets paid or pending_payment';
  end if;
  select status, cancel_reason into previous, previous_reason from public.orders where id = p_order_id for update;
  if previous is null or not (previous = 'checkout' or (previous = 'cancelled' and previous_reason = 'expired')) then
    return false;
  end if;
  perform 1 from public.inventory i
    where i.product_id in (select q.product_id from private.order_quantities(p_order_id) q)
    order by i.product_id
    for update;
  update public.inventory i
    set qty_on_hand = greatest(i.qty_on_hand - q.qty, 0),
        qty_reserved = case when previous = 'checkout' then greatest(i.qty_reserved - q.qty, 0) else i.qty_reserved end
    from private.order_quantities(p_order_id) q
    where i.product_id = q.product_id;
  update public.orders
    set status = p_status,
        paid_at = case when p_status = 'paid' then now() end,
        cancel_reason = null,
        closed_at = null
    where id = p_order_id;
  return true;
end;
$$;

-- An ACH debit cleared.
create or replace function public.mark_order_paid(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders set status = 'paid', paid_at = now() where id = p_order_id and status = 'pending_payment';
  return found;
end;
$$;

-- The checkout was abandoned or expired: cancel it and release the reservation.
create or replace function public.cancel_checkout(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders
    set status = 'cancelled', cancel_reason = 'expired', closed_at = now()
    where id = p_order_id and status = 'checkout';
  if not found then
    return false;
  end if;
  perform 1 from public.inventory i
    where i.product_id in (select q.product_id from private.order_quantities(p_order_id) q)
    order by i.product_id
    for update;
  update public.inventory i
    set qty_reserved = greatest(i.qty_reserved - q.qty, 0)
    from private.order_quantities(p_order_id) q
    where i.product_id = q.product_id;
  return true;
end;
$$;

-- Safety net for missed expiry events: cancel checkouts well past their expiry.
create or replace function public.release_stale_checkouts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale uuid;
  released integer := 0;
begin
  for stale in
    select id from public.orders
    where status = 'checkout' and expires_at < now() - interval '1 hour'
    limit 50
  loop
    if public.cancel_checkout(stale) then
      released := released + 1;
    end if;
  end loop;
  return released;
end;
$$;

-- Close a placed order as cancelled or refunded, optionally putting its
-- stock back. Shipped orders can only be refunded.
create or replace function private.close_order(
  p_order_id uuid, p_status public.order_status, p_reason text, p_restock boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('cancelled', 'refunded') then
    raise exception 'close_order only sets cancelled or refunded';
  end if;
  update public.orders
    set status = p_status, cancel_reason = p_reason, closed_at = now()
    where id = p_order_id
      and status in ('pending_payment', 'paid', 'processing', 'ready_for_pickup', 'shipped', 'completed')
      and not (p_status = 'cancelled' and status in ('shipped', 'completed'));
  if not found then
    return false;
  end if;
  if p_restock then
    perform 1 from public.inventory i
      where i.product_id in (select q.product_id from private.order_quantities(p_order_id) q)
      order by i.product_id
      for update;
    update public.inventory i
      set qty_on_hand = i.qty_on_hand + q.qty
      from private.order_quantities(p_order_id) q
      where i.product_id = q.product_id;
  end if;
  return true;
end;
$$;

-- An ACH debit failed: the order never happened, so its stock goes back.
create or replace function public.fail_order_payment(p_order_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.close_order(p_order_id, 'cancelled', 'payment_failed', true);
$$;

-- Staff cancel or refund an order from /admin/orders (after refunding it in Stripe).
create or replace function public.staff_close_order(p_order_id uuid, p_status public.order_status, p_restock boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  return private.close_order(p_order_id, p_status, 'staff', p_restock);
end;
$$;

revoke all on function private.order_quantities(uuid) from public, anon, authenticated;
revoke all on function private.close_order(uuid, public.order_status, text, boolean) from public, anon, authenticated;
revoke all on function public.reserve_order_stock(uuid), public.place_order(uuid, public.order_status),
  public.mark_order_paid(uuid), public.cancel_checkout(uuid), public.release_stale_checkouts(),
  public.fail_order_payment(uuid), public.staff_close_order(uuid, public.order_status, boolean)
  from public, anon, authenticated;
grant execute on function public.reserve_order_stock(uuid), public.place_order(uuid, public.order_status),
  public.mark_order_paid(uuid), public.cancel_checkout(uuid), public.release_stale_checkouts(),
  public.fail_order_payment(uuid)
  to service_role;
grant execute on function public.staff_close_order(uuid, public.order_status, boolean) to authenticated;

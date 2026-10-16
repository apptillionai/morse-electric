-- Net-30 terms and business-account requests (Phase 2, step 3).
--
--   * Staff put a customer on Net-30 terms with a credit limit
--     (customers.terms / credit_limit_cents). Customers can't change either.
--   * A Net-30 order skips Stripe Checkout: place_net30_order() checks the
--     credit limit with the customer row locked (so two orders can't both
--     squeeze under it), then places the order as 'invoiced' and takes the
--     stock. The server then sends a Stripe invoice due in 30 days and
--     records it on the order (stripe_invoice_id, invoice_url, invoice_status).
--   * Open balance = Net-30 orders whose invoice is still open.
--   * account_requests holds "Request a business account" submissions from
--     the public form (stored with the service role, read by staff).

alter type public.order_status add value if not exists 'invoiced' after 'pending_payment';

alter table public.customers
  add column terms text not null default 'prepay' check (terms in ('prepay', 'net30')),
  add column credit_limit_cents integer not null default 0 check (credit_limit_cents between 0 and 100000000);

-- Customers can't give themselves terms or credit.
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
    if new.tax_cert_path is not null and new.tax_cert_path not like old.user_id::text || '/%' then
      raise exception 'Certificate must be in the customer''s own folder' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

alter table public.orders
  add column stripe_invoice_id text check (stripe_invoice_id is null or char_length(stripe_invoice_id) <= 255),
  add column invoice_url text check (invoice_url is null or char_length(invoice_url) <= 1000),
  add column invoice_status text check (invoice_status is null or invoice_status in ('open', 'paid', 'void', 'uncollectible')),
  add column invoice_due_date date,
  add column invoice_paid_at timestamptz;
create index orders_open_invoices_idx on public.orders (customer_id) where invoice_status = 'open';

-- Staff can't set or alter invoices by hand either; Stripe's webhook does.
create or replace function private.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if new.status is distinct from old.status
       and (new.status::text in ('checkout', 'pending_payment', 'invoiced', 'paid', 'cancelled', 'refunded')
            or old.status::text in ('checkout', 'pending_payment', 'cancelled', 'refunded')) then
      raise exception 'Use the cancel or refund action for that change' using errcode = '42501';
    end if;
    new.id := old.id;
    new.reference := old.reference;
    new.customer_id := old.customer_id;
    new.subtotal_cents := old.subtotal_cents;
    new.core_cents := old.core_cents;
    new.shipping_cents := old.shipping_cents;
    new.tax_cents := old.tax_cents;
    new.total_cents := old.total_cents;
    new.payment_method := old.payment_method;
    new.stripe_checkout_session_id := old.stripe_checkout_session_id;
    new.stripe_payment_intent_id := old.stripe_payment_intent_id;
    new.stripe_invoice_id := old.stripe_invoice_id;
    new.invoice_url := old.invoice_url;
    new.invoice_status := old.invoice_status;
    new.invoice_due_date := old.invoice_due_date;
    new.invoice_paid_at := old.invoice_paid_at;
    new.paid_at := old.paid_at;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Placing: 'invoiced' joins 'paid' and 'pending_payment'.
-- ---------------------------------------------------------------------------

create or replace function public.place_order(p_order_id uuid, p_status public.order_status)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.order_status;
  previous_reason text;
  return_days integer;
begin
  if p_status::text not in ('paid', 'pending_payment', 'invoiced') then
    raise exception 'place_order only sets paid, pending_payment or invoiced';
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
        paid_at = case when p_status::text = 'paid' then now() end,
        payment_method = case when p_status::text = 'invoiced' then 'net30' else payment_method end,
        invoice_status = case when p_status::text = 'invoiced' then 'open' else invoice_status end,
        cancel_reason = null,
        closed_at = null
    where id = p_order_id;

  select coalesce((select core_return_days from public.site_settings where id = 1), 30) into return_days;
  insert into public.core_returns (order_id, order_item_id, quantity, core_charge_cents, due_date)
    select oi.order_id, oi.id, oi.quantity, oi.core_charge_cents,
           (now() at time zone 'America/New_York')::date + return_days
    from public.order_items oi
    where oi.order_id = p_order_id and oi.core_charge_cents > 0
    on conflict (order_item_id) do nothing;
  return true;
end;
$$;

-- What a Net-30 customer owes on open invoices.
create or replace function private.open_balance_cents(p_customer_id uuid)
returns integer
language plpgsql
stable
set search_path = ''
as $$
begin
  return coalesce((
    select sum(o.total_cents)::integer from public.orders o
    where o.customer_id = p_customer_id and o.invoice_status = 'open'
  ), 0);
end;
$$;

-- Place a checkout on the customer's Net-30 account, if their terms and
-- credit allow. Returns 'placed', 'not_on_terms', 'over_limit' or
-- 'not_placed' (the order wasn't a checkout any more).
create or replace function public.place_net30_order(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid;
  order_total integer;
  account_terms text;
  credit_limit integer;
begin
  select customer_id, total_cents into customer, order_total from public.orders where id = p_order_id and status = 'checkout';
  if customer is null then
    return 'not_placed';
  end if;
  -- Lock the account so concurrent orders are checked one after another.
  select terms, credit_limit_cents into account_terms, credit_limit from public.customers where user_id = customer for update;
  if account_terms is distinct from 'net30' then
    return 'not_on_terms';
  end if;
  if private.open_balance_cents(customer) + order_total > credit_limit then
    return 'over_limit';
  end if;
  if not public.place_order(p_order_id, 'invoiced') then
    return 'not_placed';
  end if;
  return 'placed';
end;
$$;

-- Customers (and staff) see a customer's open balance through this, since
-- it sums orders the caller can already read.
create or replace function public.my_open_balance_cents()
returns integer
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return coalesce((
    select sum(o.total_cents)::integer from public.orders o
    where o.customer_id = (select auth.uid()) and o.invoice_status = 'open'
  ), 0);
end;
$$;

-- Cancelling an invoiced order works like any other placed order.
create or replace function private.close_order(
  p_order_id uuid, p_status public.order_status, p_reason text, p_restock boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status::text not in ('cancelled', 'refunded') then
    raise exception 'close_order only sets cancelled or refunded';
  end if;
  update public.orders
    set status = p_status, cancel_reason = p_reason, closed_at = now()
    where id = p_order_id
      and status::text in ('pending_payment', 'invoiced', 'paid', 'processing', 'ready_for_pickup', 'shipped', 'completed')
      and not (p_status::text = 'cancelled' and status::text in ('shipped', 'completed'));
  if not found then
    return false;
  end if;
  update public.core_returns
    set status = 'cancelled'
    where order_id = p_order_id and status in ('awaiting', 'received');
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

revoke all on function private.open_balance_cents(uuid) from public, anon, authenticated;
revoke all on function private.close_order(uuid, public.order_status, text, boolean) from public, anon, authenticated;
revoke all on function public.place_order(uuid, public.order_status), public.place_net30_order(uuid) from public, anon, authenticated;
grant execute on function public.place_order(uuid, public.order_status), public.place_net30_order(uuid) to service_role;
revoke all on function public.my_open_balance_cents() from public, anon;
grant execute on function public.my_open_balance_cents() to authenticated;

-- ---------------------------------------------------------------------------
-- "Request a business account"
-- ---------------------------------------------------------------------------

create sequence public.account_request_number_seq start 1001;

create table public.account_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('BA-' || nextval('public.account_request_number_seq')::text),
  status text not null default 'new' check (status in ('new', 'invited', 'dismissed')),
  name text not null check (char_length(name) between 1 and 120),
  company text not null check (char_length(company) between 1 and 160),
  email text not null check (char_length(email) between 3 and 254),
  phone text check (phone is null or char_length(phone) <= 40),
  wants_terms boolean not null default false,
  details text check (details is null or char_length(details) <= 4000),
  customer_id uuid references public.customers (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index account_requests_status_idx on public.account_requests (status, created_at desc);
create index account_requests_customer_idx on public.account_requests (customer_id) where customer_id is not null;

create trigger account_requests_updated_at before update on public.account_requests
  for each row execute function public.set_updated_at();

alter table public.account_requests enable row level security;
revoke all on public.account_requests from anon, authenticated;
grant select, update on public.account_requests to authenticated;
create policy "Staff read account requests" on public.account_requests
  for select to authenticated using ((select private.is_staff()));
create policy "Staff update account requests" on public.account_requests
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

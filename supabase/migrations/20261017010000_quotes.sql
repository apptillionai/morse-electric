-- Payable quotes and online repair approval (Phase 2, step 4).
--
--   * Staff price a quote request or a service job as a quote: lines (parts,
--     labour, cores), an optional shipping charge (none = pickup only), a
--     valid-until date and a message. One live quote per request; to change
--     a sent quote, staff take it back to draft and send it again.
--   * The customer opens it from the emailed link (a random token; only its
--     SHA-256 is stored) or from their account.
--       - Parts quote: paying it is accepting it.
--       - Repair quote: the customer approves (or declines) the work first,
--         then pays once the job is ready.
--   * Paying creates an ordinary order (orders.quote_id) through the same
--     Stripe Checkout or Net-30 path as the store. place_order() marks the
--     quote paid and the quote request won. Quote orders don't move stock:
--     quoted items are usually special orders, and staff manage stock by hand.
--   * Customers read their own sent quotes. Their responses and payments go
--     through server code (service role) and the functions below.

alter type public.service_status add value if not exists 'declined' after 'quoted';

create type public.quote_offer_status as enum ('draft', 'sent', 'approved', 'declined', 'withdrawn', 'paid');

create sequence public.quote_number_seq start 1001;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('QT-' || nextval('public.quote_number_seq')::text),
  quote_request_id uuid references public.quote_requests (id) on delete cascade,
  service_request_id uuid references public.service_requests (id) on delete cascade,
  customer_id uuid references public.customers (user_id) on delete set null,
  status public.quote_offer_status not null default 'draft',
  -- Who the quote is for, copied from the request so guests can be emailed.
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  message text check (message is null or char_length(message) <= 2000),
  -- Null: pickup only (or freight arranged separately).
  shipping_cents integer check (shipping_cents is null or shipping_cents between 0 and 10000000),
  valid_until date not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  order_id uuid references public.orders (id) on delete set null,
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 1000),
  sent_at timestamptz,
  responded_at timestamptz,
  paid_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(quote_request_id, service_request_id) = 1)
);
create unique index quotes_live_quote_request_key on public.quotes (quote_request_id)
  where quote_request_id is not null and status in ('draft', 'sent', 'approved', 'paid');
create unique index quotes_live_service_request_key on public.quotes (service_request_id)
  where service_request_id is not null and status in ('draft', 'sent', 'approved', 'paid');
create index quotes_quote_request_idx on public.quotes (quote_request_id) where quote_request_id is not null;
create index quotes_service_request_idx on public.quotes (service_request_id) where service_request_id is not null;
create index quotes_customer_idx on public.quotes (customer_id, created_at desc) where customer_id is not null;
create index quotes_order_idx on public.quotes (order_id) where order_id is not null;
create index quotes_created_by_idx on public.quotes (created_by) where created_by is not null;

create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  sku text check (sku is null or char_length(sku) <= 80),
  description text not null check (char_length(description) between 1 and 300),
  quantity integer not null check (quantity between 1 and 999),
  unit_price_cents integer not null check (unit_price_cents between 0 and 100000000),
  -- Per unit; refundable when the old unit comes back.
  core_charge_cents integer not null default 0 check (core_charge_cents between 0 and 100000000),
  sort_order integer not null default 0
);
create index quote_lines_quote_idx on public.quote_lines (quote_id, sort_order);
create index quote_lines_product_idx on public.quote_lines (product_id) where product_id is not null;

-- ---------------------------------------------------------------------------
-- Staff write quotes through their own session. They can send, take back to
-- draft and withdraw, but approving, declining and paying are the
-- customer's, so only the functions below set those.
-- ---------------------------------------------------------------------------

create or replace function private.guard_quote_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.order_id := null;
    new.decline_reason := null;
    new.sent_at := null;
    new.responded_at := null;
    new.paid_at := null;
    new.created_by := (select auth.uid());
    return new;
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('sent', 'withdrawn'))
    or (old.status = 'sent' and new.status in ('draft', 'withdrawn'))
    or (old.status = 'approved' and new.status = 'withdrawn')
  ) then
    raise exception 'A quote can''t go from % to %', old.status, new.status using errcode = '42501';
  end if;
  if old.status <> 'draft'
     and (new.name, new.email, new.message, new.shipping_cents, new.valid_until, new.customer_id)
         is distinct from (old.name, old.email, old.message, old.shipping_cents, old.valid_until, old.customer_id) then
    raise exception 'Take the quote back to draft before changing it' using errcode = '42501';
  end if;
  new.id := old.id;
  new.reference := old.reference;
  new.quote_request_id := old.quote_request_id;
  new.service_request_id := old.service_request_id;
  new.order_id := old.order_id;
  new.decline_reason := old.decline_reason;
  new.responded_at := old.responded_at;
  new.paid_at := old.paid_at;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;
revoke all on function private.guard_quote_write() from public, anon, authenticated;

create trigger quotes_guard before insert or update on public.quotes
  for each row execute function private.guard_quote_write();

-- Lines change only while their quote is a draft.
create or replace function private.guard_quote_line_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent public.quote_offer_status;
begin
  if current_user = 'authenticated' then
    if tg_op = 'UPDATE' and new.quote_id is distinct from old.quote_id then
      raise exception 'A line can''t move to another quote' using errcode = '42501';
    end if;
    select status into parent from public.quotes
      where id = case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
    -- No parent: the quote itself is being deleted (a draft), so its lines go too.
    if parent is not null and parent <> 'draft' then
      raise exception 'Take the quote back to draft before changing its lines' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.guard_quote_line_write() from public, anon, authenticated;

create trigger quote_lines_guard before insert or update or delete on public.quote_lines
  for each row execute function private.guard_quote_line_write();

alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
revoke all on public.quotes, public.quote_lines from anon, authenticated;
grant select, insert, update, delete on public.quotes, public.quote_lines to authenticated;

create policy "Customers read their own sent quotes; staff read all" on public.quotes
  for select to authenticated
  using ((customer_id = (select auth.uid()) and status <> 'draft') or (select private.is_staff()));
create policy "Staff add quotes" on public.quotes
  for insert to authenticated with check ((select private.is_staff()));
create policy "Staff update quotes" on public.quotes
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "Staff delete draft quotes" on public.quotes
  for delete to authenticated using ((select private.is_staff()) and status = 'draft');

-- A line is visible exactly when its quote is.
create policy "Read lines of quotes the reader can see" on public.quote_lines
  for select to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_lines.quote_id));
create policy "Staff add quote lines" on public.quote_lines
  for insert to authenticated with check ((select private.is_staff()));
create policy "Staff update quote lines" on public.quote_lines
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "Staff delete quote lines" on public.quote_lines
  for delete to authenticated using ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Orders from quotes
-- ---------------------------------------------------------------------------

alter table public.orders
  add column quote_id uuid references public.quotes (id) on delete set null;
create index orders_quote_idx on public.orders (quote_id) where quote_id is not null;

-- Quote lines can be labour or parts that aren't in the catalog.
alter table public.order_items
  alter column sku drop not null,
  alter column condition drop not null;

-- Staff can't re-point an order at another quote either.
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
    new.quote_id := old.quote_id;
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

-- Stock moves only for cart orders. Every stock function goes through this,
-- so reserving, placing, releasing and restocking a quote order touch nothing.
create or replace function private.order_quantities(p_order_id uuid)
returns table (product_id uuid, qty integer)
language sql
stable
set search_path = ''
as $$
  select oi.product_id, sum(oi.quantity)::integer
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.order_id = p_order_id and o.quote_id is null
  group by oi.product_id;
$$;

-- Placing a quote order also marks the quote paid and its request won.
create or replace function public.place_order(p_order_id uuid, p_status public.order_status)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.order_status;
  previous_reason text;
  from_quote uuid;
  return_days integer;
begin
  if p_status::text not in ('paid', 'pending_payment', 'invoiced') then
    raise exception 'place_order only sets paid, pending_payment or invoiced';
  end if;
  select status, cancel_reason, quote_id into previous, previous_reason, from_quote
    from public.orders where id = p_order_id for update;
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

  if from_quote is not null then
    update public.quotes
      set status = 'paid', paid_at = now(), order_id = p_order_id
      where id = from_quote and status in ('sent', 'approved');
    update public.quote_requests r
      set status = 'won'
      from public.quotes q
      where q.id = from_quote and r.id = q.quote_request_id and r.status in ('new', 'quoted', 'lost');
  end if;
  return true;
end;
$$;

-- The customer approves a repair quote (parts quotes are accepted by paying
-- them) or declines any quote. Only acts on a sent quote; approving needs
-- it to be still valid. Returns whether anything changed.
create or replace function public.respond_to_quote(p_quote_id uuid, p_approve boolean, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.quote_offer_status;
  repair uuid;
  parts uuid;
  valid date;
begin
  select status, service_request_id, quote_request_id, valid_until into current_status, repair, parts, valid
    from public.quotes where id = p_quote_id for update;
  if current_status is distinct from 'sent' then
    return false;
  end if;
  if p_approve then
    if repair is null or valid < (now() at time zone 'America/New_York')::date then
      return false;
    end if;
    update public.quotes set status = 'approved', responded_at = now() where id = p_quote_id;
    update public.service_requests set status = 'approved'
      where id = repair and status::text in ('received', 'teardown', 'quoted');
  else
    update public.quotes
      set status = 'declined', responded_at = now(), decline_reason = nullif(left(btrim(coalesce(p_reason, '')), 1000), '')
      where id = p_quote_id;
    update public.service_requests set status = 'declined'
      where id = repair and status::text in ('received', 'teardown', 'quoted');
    update public.quote_requests set status = 'lost'
      where id = parts and status in ('new', 'quoted');
  end if;
  return true;
end;
$$;

revoke all on function private.order_quantities(uuid) from public, anon, authenticated;
revoke all on function public.place_order(uuid, public.order_status), public.respond_to_quote(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.place_order(uuid, public.order_status), public.respond_to_quote(uuid, boolean, text)
  to service_role;

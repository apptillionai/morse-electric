-- Core charges and core returns (Phase 2, step 2).
--
-- Remanufactured and exchange units can carry a refundable core charge. It is
-- charged at checkout as its own line, and refunded when the customer's old
-- unit (the "core") comes back and passes inspection.
--
--   * order_items.core_charge_cents is the per-unit charge at the time of sale;
--     orders.core_cents is the order's total of them.
--   * Placing an order (place_order) opens one core_returns row per item that
--     carries a core, due back site_settings.core_return_days after placing.
--   * Staff move a core along at /admin/cores: awaiting → received →
--     credited (refunded through Stripe) or rejected. A trigger allows only
--     those steps and keeps the amounts fixed.
--   * Cancelling or refunding the whole order voids its open cores.
--   * Customers read the cores on their own orders.

alter table public.site_settings
  add column core_return_days integer not null default 30 check (core_return_days between 1 and 365);

alter table public.orders
  add column core_cents integer not null default 0 check (core_cents >= 0);
alter table public.order_items
  add column core_charge_cents integer not null default 0 check (core_charge_cents >= 0);

-- Staff can't change what an order charged for cores either.
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
    new.core_cents := old.core_cents;
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

-- ---------------------------------------------------------------------------
-- Core returns
-- ---------------------------------------------------------------------------

create type public.core_status as enum ('awaiting', 'received', 'credited', 'rejected', 'cancelled');

create table public.core_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid not null unique references public.order_items (id) on delete cascade,
  status public.core_status not null default 'awaiting',
  quantity integer not null check (quantity between 1 and 999),
  -- Per unit, copied from the order item.
  core_charge_cents integer not null check (core_charge_cents > 0),
  due_date date not null,
  received_at timestamptz,
  credited_at timestamptz,
  credit_cents integer check (credit_cents is null or credit_cents >= 0),
  stripe_refund_id text check (stripe_refund_id is null or char_length(stripe_refund_id) <= 255),
  -- Shown to the customer when a core is rejected.
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  reminder_sent_at timestamptz,
  overdue_notice_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index core_returns_order_idx on public.core_returns (order_id);
create index core_returns_open_idx on public.core_returns (status, due_date) where status in ('awaiting', 'received');

create trigger core_returns_updated_at before update on public.core_returns
  for each row execute function public.set_updated_at();

alter table public.core_returns enable row level security;
revoke all on public.core_returns from anon, authenticated;
grant select, update on public.core_returns to authenticated;

-- A core is visible exactly when its order is (the customer's own, or staff).
create policy "Read cores on orders the reader can see" on public.core_returns
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = core_returns.order_id));
create policy "Staff update core returns" on public.core_returns
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- Staff move a core one step at a time and can extend its due date, but
-- can't change what it was charged or which order it belongs to.
create or replace function private.guard_core_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if new.status is distinct from old.status and not (
      (old.status = 'awaiting' and new.status in ('received', 'rejected'))
      or (old.status = 'received' and new.status in ('awaiting', 'credited', 'rejected'))
    ) then
      raise exception 'A core can''t go from % to %', old.status, new.status using errcode = '42501';
    end if;
    new.id := old.id;
    new.order_id := old.order_id;
    new.order_item_id := old.order_item_id;
    new.quantity := old.quantity;
    new.core_charge_cents := old.core_charge_cents;
    new.created_at := old.created_at;
    if new.status = 'credited' and old.status <> 'credited' then
      if new.credit_cents is null or new.credit_cents > old.quantity * old.core_charge_cents then
        raise exception 'Credit must be set and no more than the core charge' using errcode = '42501';
      end if;
      new.credited_at := now();
    else
      new.credit_cents := old.credit_cents;
      new.credited_at := old.credited_at;
      new.stripe_refund_id := old.stripe_refund_id;
    end if;
    if new.status = 'received' and old.status = 'awaiting' then
      new.received_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_core_update() from public, anon, authenticated;

create trigger core_returns_guard before update on public.core_returns
  for each row execute function private.guard_core_update();

-- ---------------------------------------------------------------------------
-- Placing opens the cores; closing an order voids them.
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
  -- The whole payment goes back, so nothing is owed on open cores.
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

revoke all on function private.close_order(uuid, public.order_status, text, boolean) from public, anon, authenticated;
revoke all on function public.place_order(uuid, public.order_status) from public, anon, authenticated;
grant execute on function public.place_order(uuid, public.order_status) to service_role;

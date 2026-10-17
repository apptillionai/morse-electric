-- Live shipping rates (Phase 2, step 7).
--
--   * When staff switch on live rates (site_settings.live_rates_enabled) and
--     SHIPPO_API_KEY is set, the cart asks for the delivery ZIP code and offers
--     the carriers' real rates from Shippo instead of the weight bands. The
--     bands stay as the fallback when Shippo can't be reached, and they still
--     price the Google Shopping feed unless live rates are on.
--   * Parcels are packed from product weights into a default box
--     (parcel_*_in), up to 150 lb each. handling_cents is added to every rate.
--   * Rates are quoted to the ZIP code the customer gives in the cart; Stripe
--     Checkout still collects the full address (and works out tax from it).
--     orders.shipping_service / shipping_service_code record the service the
--     customer chose ("UPS Ground", "ups:ups_ground") and shipping_quote_postal
--     the ZIP it was quoted to, so staff ship it the way it was paid for and
--     are warned when the address entered at checkout is in another ZIP.
--     Like the totals, staff can't change them.

alter table public.site_settings
  add column live_rates_enabled boolean not null default false,
  add column parcel_length_in numeric(5, 1) not null default 18 check (parcel_length_in between 1 and 108),
  add column parcel_width_in numeric(5, 1) not null default 14 check (parcel_width_in between 1 and 108),
  add column parcel_height_in numeric(5, 1) not null default 12 check (parcel_height_in between 1 and 108),
  add column handling_cents integer not null default 0 check (handling_cents between 0 and 100000);

alter table public.orders
  add column shipping_service text check (shipping_service is null or char_length(shipping_service) <= 120),
  add column shipping_service_code text check (shipping_service_code is null or char_length(shipping_service_code) <= 120),
  add column shipping_quote_postal text check (shipping_quote_postal is null or shipping_quote_postal ~ '^[0-9]{5}$');

-- Staff can't change the shipping service a customer paid for.
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
    new.shipping_service := old.shipping_service;
    new.shipping_service_code := old.shipping_service_code;
    new.shipping_quote_postal := old.shipping_quote_postal;
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

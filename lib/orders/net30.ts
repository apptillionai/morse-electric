import "server-only";

import { after } from "next/server";
import type Stripe from "stripe";
import type { CustomerProfile } from "@/lib/customers/account";
import { SITE } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CartLine } from "./cart";
import { cartChargeLines, openOrder, stripeCustomerFor, type Admin, type ChargeLine, type CheckoutCustomer, type CheckoutError } from "./checkout";
import { sendOrderEmails } from "./email";
import type { Fulfillment } from "./pricing";
import { parseZip, type Destination } from "./shipping";
import { getStripe } from "./store";

export const NET30_DAYS = 30;

export type Net30Result = { ok: true; reference: string } | { ok: false; error: CheckoutError; cleaned?: CartLine[] };

/** The customer's shipping address (or billing, if that's all they gave), for the order and Stripe. */
function profileAddresses(customer: CustomerProfile) {
  const ship = customer.ship_line1
    ? {
        line1: customer.ship_line1,
        line2: customer.ship_line2,
        city: customer.ship_city,
        state: customer.ship_state,
        postal_code: customer.ship_postal,
      }
    : null;
  const bill =
    !customer.bill_same_as_ship && customer.bill_line1
      ? {
          line1: customer.bill_line1,
          line2: customer.bill_line2,
          city: customer.bill_city,
          state: customer.bill_state,
          postal_code: customer.bill_postal,
        }
      : ship;
  return { ship, bill };
}

/** Undo a Net-30 order whose invoice couldn't be sent: void the invoice, cancel the order, restock. */
async function unwind(stripe: Stripe, supabase: Admin, orderId: string, invoice: Stripe.Invoice | null) {
  if (invoice?.id) {
    await (invoice.status === "draft" ? stripe.invoices.del(invoice.id) : stripe.invoices.voidInvoice(invoice.id)).catch((e) =>
      console.error("[net30] couldn't void invoice", invoice.id, e instanceof Error ? e.message : e),
    );
  }
  const { error } = await supabase.rpc("fail_order_payment", { p_order_id: orderId });
  if (error) console.error("[net30] couldn't cancel order", orderId, error.message);
}

/**
 * Where a Net-30 order is quoted to: the ZIP code of the account's shipping
 * address (the cart quotes by ZIP code too, so both see the same rates).
 */
export function accountDestination(profile: CustomerProfile): Destination | null {
  const postal = parseZip(profile.ship_postal);
  return profile.ship_line1 && postal ? { postal } : null;
}

/**
 * Who a Net-30 order is billed and shipped to, from the customer's profile:
 * the Stripe customer details and the order's contact and address fields.
 */
export function accountBilling(
  userId: string,
  profile: CustomerProfile,
  fulfillment: Fulfillment,
): { ok: true; customer: CheckoutCustomer; orderFields: Record<string, unknown> } | { ok: false; error: CheckoutError } {
  if (profile.terms !== "net30") return { ok: false, error: "not_on_terms" };
  const { ship, bill } = profileAddresses(profile);
  // An invoice needs an address for tax, and a shipped order needs somewhere to go.
  if (!bill || (fulfillment === "ship" && !ship)) return { ok: false, error: "no_address" };
  const shipName = profile.company ?? profile.name;
  return {
    ok: true,
    customer: {
      id: userId,
      email: profile.email,
      name: profile.name,
      taxExempt: profile.tax_exempt,
      stripeCustomerId: profile.stripe_customer_id,
      address: bill,
      shipping: fulfillment === "ship" && ship ? { ...ship, name: shipName } : null,
    },
    orderFields: {
      phone: profile.phone,
      ...(fulfillment === "ship" && ship
        ? {
            ship_name: shipName,
            ship_line1: ship.line1,
            ship_line2: ship.line2,
            ship_city: ship.city,
            ship_state: ship.state,
            ship_postal: ship.postal_code,
            ship_country: "US",
          }
        : {}),
    },
  };
}

/**
 * Bill a placed Net-30 order: create, finalize and email a Stripe invoice due
 * in NET30_DAYS, and record it on the order. If anything fails, the invoice
 * is voided and the order cancelled (restocking a cart order), then the
 * error is rethrown.
 */
export async function invoiceOrder(
  stripe: Stripe,
  supabase: Admin,
  input: { order: { id: string; reference: string }; customer: CheckoutCustomer; lines: ChargeLine[]; shipping: number },
): Promise<void> {
  const { order, lines, shipping } = input;
  let invoice: Stripe.Invoice | null = null;
  try {
    const stripeCustomer = await stripeCustomerFor(stripe, supabase, input.customer);
    const metadata = { order_id: order.id, order_reference: order.reference };
    invoice = await stripe.invoices.create(
      {
        customer: stripeCustomer,
        collection_method: "send_invoice",
        days_until_due: NET30_DAYS,
        automatic_tax: { enabled: true },
        pending_invoice_items_behavior: "exclude",
        description: `${SITE.name} order ${order.reference}`,
        metadata,
      },
      { idempotencyKey: `net30-invoice-${order.id}` },
    );
    const line = (name: string, unitAmount: number, quantity: number) => ({
      quantity,
      price_data: { currency: "usd", unit_amount: unitAmount, tax_behavior: "exclusive" as const, product_data: { name } },
    });
    await stripe.invoices.addLines(invoice.id!, {
      lines: [
        ...lines.map((l) => line(l.description && !l.core ? `${l.name}, ${l.description}` : l.name, l.unitAmount, l.quantity)),
        ...(shipping > 0 ? [line("Ground shipping", shipping, 1)] : []),
      ],
    });
    invoice = await stripe.invoices.finalizeInvoice(invoice.id!, { auto_advance: true });
    invoice = await stripe.invoices.sendInvoice(invoice.id!);
  } catch (error) {
    await unwind(stripe, supabase, order.id, invoice);
    throw error;
  }

  const charged = lines.reduce((sum, l) => sum + l.unitAmount * l.quantity, 0) + shipping;
  const dueDate = invoice.due_date ? new Date(invoice.due_date * 1000).toISOString().slice(0, 10) : null;
  const { error } = await supabase
    .from("orders")
    .update({
      stripe_invoice_id: invoice.id,
      invoice_url: invoice.hosted_invoice_url ?? null,
      invoice_due_date: dueDate,
      total_cents: invoice.total,
      tax_cents: Math.max(0, invoice.total - charged),
    })
    .eq("id", order.id);
  // The invoice is out; a failed save is logged, not undone.
  if (error) console.error("[net30] saving invoice on order", order.reference, error.message);
}

/**
 * Place the cart on the customer's Net-30 account: no Stripe Checkout. The
 * database checks their terms and credit limit (with their account locked)
 * and takes the stock; then a Stripe invoice for the order is created,
 * finalized and emailed, due in 30 days. If Stripe fails, the order is
 * cancelled and restocked.
 */
export async function createNet30Order(input: {
  cart: CartLine[];
  fulfillment: Fulfillment;
  userId: string;
  customer: CustomerProfile;
  /** With live rates: the service chosen in the cart, and the ZIP code the cart quoted it to. */
  shipping?: { code: string | null; zip: string | null };
}): Promise<Net30Result> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "unavailable" };
  const billing = accountBilling(input.userId, input.customer, input.fulfillment);
  if (!billing.ok) return billing;
  const { customer, orderFields } = billing;
  // A Net-30 order ships to the account's address, so a live rate must have been quoted to its ZIP code.
  const to = accountDestination(input.customer);
  if (input.shipping?.code && to && input.shipping.zip !== to.postal) return { ok: false, error: "ship_zip_mismatch" };
  const supabase = createAdminClient();
  const opened = await openOrder(
    supabase,
    { cart: input.cart, fulfillment: input.fulfillment, customer, shipping: { to, code: input.shipping?.code ?? null } },
    orderFields,
  );
  if (!opened.ok) return opened;
  const { order, cart, shipping, cancel } = opened;

  const { data: placed, error: placeError } = await supabase.rpc("place_net30_order", { p_order_id: order.id });
  if (placeError || placed !== "placed") {
    if (placeError) console.error("[net30] place:", placeError.message);
    await cancel();
    return { ok: false, error: placed === "over_limit" ? "over_limit" : placed === "not_on_terms" ? "not_on_terms" : "unavailable" };
  }

  try {
    await invoiceOrder(stripe, supabase, { order, customer, lines: cartChargeLines(cart, opened.returnDays, opened.pricing), shipping });
  } catch (error) {
    console.error("[net30] invoice for", order.reference, error instanceof Error ? error.message : error);
    return { ok: false, error: "unavailable" };
  }

  after(() => sendOrderEmails(order.id, "placed"));
  return { ok: true, reference: order.reference };
}

/**
 * Cancelling a Net-30 order: void its invoice if it's unpaid; if it was
 * paid, issue a credit note that refunds what was paid through Stripe (and
 * records anything paid outside Stripe as settled out of band).
 */
export async function settleInvoiceForCancel(stripe: Stripe, invoiceId: string, orderId: string): Promise<void> {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  if (invoice.status === "open" || invoice.status === "uncollectible") {
    await stripe.invoices.voidInvoice(invoiceId);
    return;
  }
  if (invoice.status !== "paid") return; // draft or already void: nothing owed either way
  const remaining = invoice.amount_paid - (invoice.post_payment_credit_notes_amount ?? 0);
  if (remaining <= 0) return;
  const offStripe = Math.min(remaining, invoice.amount_paid_off_stripe ?? 0);
  await stripe.creditNotes.create(
    {
      invoice: invoiceId,
      amount: remaining,
      ...(remaining - offStripe > 0 ? { refund_amount: remaining - offStripe } : {}),
      ...(offStripe > 0 ? { out_of_band_amount: offStripe } : {}),
      reason: "order_change",
      metadata: { order_id: orderId },
    },
    { idempotencyKey: `cancel-${orderId}` },
  );
}

/**
 * Credit a returned core on a Net-30 invoice: an unpaid invoice is reduced;
 * a paid one leaves a credit on the customer's Stripe balance, which comes
 * off their next invoice. Returns the credit note id.
 */
export async function creditInvoice(stripe: Stripe, invoiceId: string, amount: number, key: string, metadata: Record<string, string>): Promise<string> {
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const note = await stripe.creditNotes.create(
    {
      invoice: invoiceId,
      amount,
      ...(invoice.status === "paid" ? { credit_amount: amount } : {}),
      memo: "Core returned",
      metadata,
    },
    { idempotencyKey: key },
  );
  return note.id;
}

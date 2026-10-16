import "server-only";

import { after } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProductId } from "./cart";
import { sendOrderEmails } from "./email";

/**
 * What happens when Stripe reports on a checkout. Called by the webhook and,
 * as a fallback, by the success page when the webhook hasn't arrived yet.
 * Every step runs through a database function that only acts from the
 * status it expects, so a repeated call changes nothing and sends no email.
 */

function orderIdOf(session: Stripe.Checkout.Session): string | null {
  const id = session.metadata?.order_id ?? session.client_reference_id;
  return isProductId(id) ? id : null;
}

const clip = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : undefined);

async function rpc(name: string, orderId: string, extra: Record<string, unknown> = {}): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc(name, { p_order_id: orderId, ...extra });
  if (error) throw new Error(`${name}(${orderId}): ${error.message}`);
  return data === true;
}

/** Payment submitted: place the order (paid, or pending while ACH clears) and record what Stripe collected. */
export async function applyCompletedSession(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = orderIdOf(session);
  if (!orderId || session.status !== "complete") return;
  const pending = session.payment_status === "unpaid";
  const supabase = createAdminClient();

  // Record what Stripe collected first, so the confirmation email (sent only
  // by whichever call places the order) always has the address and totals.
  const customer = session.customer_details;
  const ship = session.collected_information?.shipping_details;
  const details = Object.fromEntries(
    Object.entries({
      email: clip(customer?.email, 254),
      name: clip(customer?.name, 200),
      phone: clip(customer?.phone, 40),
      ship_name: clip(ship?.name, 200),
      ship_line1: clip(ship?.address.line1, 200),
      ship_line2: clip(ship?.address.line2, 200),
      ship_city: clip(ship?.address.city, 100),
      ship_state: clip(ship?.address.state, 40),
      ship_postal: clip(ship?.address.postal_code, 20),
      ship_country: clip(ship?.address.country, 2),
      // Stripe's subtotal includes core charges; ours keeps items and cores apart, so it stays as checkout set it.
      shipping_cents: session.total_details?.amount_shipping ?? undefined,
      tax_cents: session.total_details?.amount_tax ?? undefined,
      total_cents: session.amount_total ?? undefined,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
    }).filter(([, v]) => v !== undefined),
  );
  const { error } = await supabase.from("orders").update(details).eq("id", orderId).eq("stripe_checkout_session_id", session.id);
  if (error) throw new Error(`Order details ${orderId}: ${error.message}`);

  const placed = await rpc("place_order", orderId, { p_status: pending ? "pending_payment" : "paid" });
  if (placed) {
    // ACH is the only method Checkout leaves unpaid at this point.
    await supabase.from("orders").update({ payment_method: pending ? "ach" : "card" }).eq("id", orderId);
    after(() => sendOrderEmails(orderId, "placed"));
  }
}

/** An ACH debit cleared. */
export async function applyAsyncSucceeded(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = orderIdOf(session);
  if (orderId && (await rpc("mark_order_paid", orderId))) after(() => sendOrderEmails(orderId, "paid"));
}

/** An ACH debit failed: cancel the order and put its stock back. */
export async function applyAsyncFailed(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = orderIdOf(session);
  if (orderId && (await rpc("fail_order_payment", orderId))) after(() => sendOrderEmails(orderId, "payment_failed"));
}

/** The customer never paid: release the stock. */
export async function applyExpired(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = orderIdOf(session);
  if (orderId) await rpc("cancel_checkout", orderId);
}

/** A Net-30 invoice was paid, voided or written off in Stripe. */
export async function applyInvoiceStatus(invoice: Stripe.Invoice, status: "paid" | "void" | "uncollectible"): Promise<void> {
  const orderId = invoice.metadata?.order_id;
  if (!isProductId(orderId) || !invoice.id) return;
  const { data, error } = await createAdminClient()
    .from("orders")
    .update({ invoice_status: status, ...(status === "paid" ? { invoice_paid_at: new Date().toISOString() } : {}) })
    .eq("id", orderId)
    .eq("stripe_invoice_id", invoice.id)
    .neq("invoice_status", status)
    .select("id");
  if (error) throw new Error(`Invoice ${invoice.id} on ${orderId}: ${error.message}`);
  if (status === "paid" && data.length) after(() => sendOrderEmails(orderId, "invoice_paid"));
}

/** Route a verified webhook event. Unknown types are ignored. */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      return applyCompletedSession(event.data.object);
    case "checkout.session.async_payment_succeeded":
      return applyAsyncSucceeded(event.data.object);
    case "checkout.session.async_payment_failed":
      return applyAsyncFailed(event.data.object);
    case "checkout.session.expired":
      return applyExpired(event.data.object);
    case "invoice.paid":
      return applyInvoiceStatus(event.data.object, "paid");
    case "invoice.voided":
      return applyInvoiceStatus(event.data.object, "void");
    case "invoice.marked_uncollectible":
      return applyInvoiceStatus(event.data.object, "uncollectible");
  }
}

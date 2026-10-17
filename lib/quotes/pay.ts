import "server-only";

import { after } from "next/server";
import type { SignedInUser } from "@/lib/customers/account";
import {
  abandonCheckout,
  CHECKOUT_MINUTES,
  startCheckoutSession,
  type CheckoutCustomer,
} from "@/lib/orders/checkout";
import { sendOrderEmails } from "@/lib/orders/email";
import { accountBilling, invoiceOrder } from "@/lib/orders/net30";
import { getStripe } from "@/lib/orders/store";
import { getSiteSettings } from "@/lib/site-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { customerStep, deliveryOptions, quoteChargeLines, quoteTotals } from "./logic";
import { lineValues, quoteState, type Quote } from "./store";

export type QuotePayError = "unavailable" | "closed" | "processing" | "delivery" | "sign_in" | "not_on_terms" | "over_limit" | "no_address";

export const QUOTE_PAY_ERRORS: Record<QuotePayError, string> = {
  unavailable: "Online payment isn’t available right now. Please call us to pay.",
  closed: "This quote can’t be paid any more. Please call us.",
  processing: "A payment for this quote is already going through. Check your email for the confirmation, or call us.",
  delivery: "Choose pickup or delivery.",
  sign_in: "Sign in to the account this quote was sent to, to charge it to that account.",
  not_on_terms: "Your account isn’t set up for Net-30 terms. Pay by card or bank transfer instead.",
  over_limit: "This would go over your account’s credit limit. Pay by card or bank transfer instead, or call us.",
  no_address: "Add your company address in Company details first, so we can invoice (and ship) it.",
};

export const isQuotePayError = (value: unknown): value is QuotePayError => typeof value === "string" && value in QUOTE_PAY_ERRORS;

/**
 * Pay a quote: create its order (status 'checkout'; quote orders hold no
 * stock), then either open Stripe Checkout or, for a Net-30 customer paying
 * on account, place it and send the invoice. Returns where to send the
 * customer next. Paying marks the quote paid (place_order).
 */
export async function payQuote(input: {
  quote: Quote;
  fulfillment: "ship" | "pickup";
  onAccount: boolean;
  user: SignedInUser | null;
  origin: string;
  /** The page the customer paid from, to come back to from Stripe. */
  returnPath: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: QuotePayError }> {
  const { quote, fulfillment } = input;
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "unavailable" };
  if (customerStep(quoteState(quote)).step !== "pay") return { ok: false, error: "closed" };
  if (!deliveryOptions(quote.shipping_cents).includes(fulfillment)) return { ok: false, error: "delivery" };
  const supabase = createAdminClient();

  // One payment at a time: close any checkout this quote already has open.
  const { data: open } = await supabase.from("orders").select("id").eq("quote_id", quote.id).eq("status", "checkout");
  for (const o of open ?? []) await abandonCheckout(o.id);
  if (open?.length) {
    // A checkout that's still open after that was paid; its confirmation is on the way.
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("quote_id", quote.id).eq("status", "checkout");
    if (count) return { ok: false, error: "processing" };
  }

  // The account the quote belongs to (tax exemption, saved Stripe customer).
  let customer: CheckoutCustomer | null = null;
  let orderFields: Record<string, unknown> = {};
  if (input.onAccount) {
    if (!quote.customer_id || input.user?.id !== quote.customer_id || !input.user.customer) return { ok: false, error: "sign_in" };
    const billing = accountBilling(input.user.id, input.user.customer, fulfillment);
    if (!billing.ok) return { ok: false, error: billing.error === "no_address" ? "no_address" : "not_on_terms" };
    ({ customer, orderFields } = billing);
  } else if (quote.customer_id) {
    const { data: profile } = await supabase
      .from("customers")
      .select("user_id, email, name, tax_exempt, stripe_customer_id")
      .eq("user_id", quote.customer_id)
      .maybeSingle();
    if (profile) {
      customer = {
        id: profile.user_id,
        email: profile.email,
        name: profile.name,
        taxExempt: profile.tax_exempt,
        stripeCustomerId: profile.stripe_customer_id,
      };
    }
  }

  const values = lineValues(quote.lines);
  const totals = quoteTotals(values, quote.shipping_cents, fulfillment);
  const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60;
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      quote_id: quote.id,
      customer_id: quote.customer_id,
      email: customer?.email ?? quote.email,
      name: customer?.name ?? quote.name,
      fulfillment,
      subtotal_cents: totals.itemsCents,
      core_cents: totals.coreCents,
      shipping_cents: totals.shippingCents,
      total_cents: totals.totalCents,
      expires_at: new Date(expiresAt * 1000).toISOString(),
      ...orderFields,
    })
    .select("id, reference")
    .single();
  if (orderError) {
    console.error("[quotes] order insert:", orderError.message);
    return { ok: false, error: "unavailable" };
  }
  const cancel = async () => {
    await supabase.rpc("cancel_checkout", { p_order_id: order.id });
  };

  const { error: itemsError } = await supabase.from("order_items").insert(
    values.map((l, i) => ({
      order_id: order.id,
      product_id: l.productId,
      sku: l.sku,
      name: l.description,
      condition: null,
      unit_price_cents: l.unitPriceCents,
      core_charge_cents: l.coreChargeCents,
      quantity: l.quantity,
      sort_order: i,
    })),
  );
  if (itemsError) {
    console.error("[quotes] items insert:", itemsError.message);
    await cancel();
    return { ok: false, error: "unavailable" };
  }

  const { coreReturnDays } = await getSiteSettings();
  const lines = quoteChargeLines(values, coreReturnDays);

  if (input.onAccount && customer) {
    const { data: placed, error: placeError } = await supabase.rpc("place_net30_order", { p_order_id: order.id });
    if (placeError || placed !== "placed") {
      if (placeError) console.error("[quotes] place on account:", placeError.message);
      await cancel();
      return { ok: false, error: placed === "over_limit" ? "over_limit" : placed === "not_on_terms" ? "not_on_terms" : "unavailable" };
    }
    try {
      await invoiceOrder(stripe, supabase, { order, customer, lines, shipping: totals.shippingCents });
    } catch (error) {
      console.error("[quotes] invoice for", order.reference, error instanceof Error ? error.message : error);
      return { ok: false, error: "unavailable" };
    }
    after(() => sendOrderEmails(order.id, "placed"));
    return { ok: true, url: `/account/orders/${order.reference}?placed=1` };
  }

  try {
    const url = await startCheckoutSession(stripe, supabase, {
      order,
      lines,
      shipping: totals.shippingCents,
      fulfillment,
      customer,
      email: quote.email,
      expiresAt,
      // from=quote: the success page leaves the shopping cart alone.
      successUrl: `${input.origin}/api/checkout/complete?session_id={CHECKOUT_SESSION_ID}&from=quote`,
      cancelUrl: `${input.origin}${input.returnPath}?cancelled=1`,
    });
    return { ok: true, url };
  } catch (error) {
    console.error("[quotes] Stripe session:", error instanceof Error ? error.message : error);
    await cancel();
    return { ok: false, error: "unavailable" };
  }
}

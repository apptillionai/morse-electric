import "server-only";

import type Stripe from "stripe";
import { CONDITION_LABELS } from "@/lib/catalog/types";
import { getSiteSettings } from "@/lib/site-settings";
import { SITE } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CartLine } from "./cart";
import { priceCart, shippingCents, type Fulfillment } from "./pricing";
import { getStripe, loadBuyableProducts } from "./store";

/** Stripe needs at least 30 minutes; stock stays reserved this long. */
const CHECKOUT_MINUTES = 31;

export interface CheckoutCustomer {
  id: string;
  email: string;
  name: string;
  taxExempt: boolean;
  stripeCustomerId: string | null;
}

/** Why checkout didn't start; the cart page explains each one (CHECKOUT_ERRORS). */
export type CheckoutError = "unavailable" | "changed" | "empty" | "sold_out" | "no_shipping";

export const CHECKOUT_ERRORS: Record<CheckoutError, string> = {
  unavailable: "Online checkout isn’t available right now. Please call us to order.",
  changed: "Your cart changed since you last looked. Check it and try again.",
  empty: "Your cart is empty.",
  sold_out: "Someone just bought the last of something in your cart. Check it and try again.",
  no_shipping: "We can’t ship this order. Choose pickup, or call us for a freight quote.",
};

export function isCheckoutError(value: unknown): value is CheckoutError {
  return typeof value === "string" && value in CHECKOUT_ERRORS;
}

export type CheckoutResult =
  | { ok: true; url: string; orderId: string }
  /** `cleaned`: the cart as it should now be, when it changed under the customer. */
  | { ok: false; error: CheckoutError; cleaned?: CartLine[] };

type Admin = ReturnType<typeof createAdminClient>;


/** Cancel a checkout this browser started earlier, releasing its stock. Never throws. */
export async function abandonCheckout(orderId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("orders")
      .select("status, stripe_checkout_session_id")
      .eq("id", orderId)
      .maybeSingle();
    if (data?.status !== "checkout") return;
    const stripe = getStripe();
    if (stripe && data.stripe_checkout_session_id) {
      // Expire it first so it can no longer be paid; ignore "already expired / complete".
      await stripe.checkout.sessions.expire(data.stripe_checkout_session_id).catch(() => undefined);
      const session = await stripe.checkout.sessions.retrieve(data.stripe_checkout_session_id);
      if (session.status === "complete") return; // Paid after all: the webhook places it.
    }
    await supabase.rpc("cancel_checkout", { p_order_id: orderId });
  } catch (error) {
    console.error("[checkout] abandon failed:", error instanceof Error ? error.message : error);
  }
}

async function stripeCustomerFor(stripe: Stripe, supabase: Admin, customer: CheckoutCustomer): Promise<string> {
  const taxExempt = customer.taxExempt ? "exempt" : "none";
  if (customer.stripeCustomerId) {
    await stripe.customers.update(customer.stripeCustomerId, { tax_exempt: taxExempt });
    return customer.stripeCustomerId;
  }
  const created = await stripe.customers.create({
    email: customer.email,
    name: customer.name,
    tax_exempt: taxExempt,
    metadata: { morse_customer_id: customer.id },
  });
  await supabase.from("customers").update({ stripe_customer_id: created.id }).eq("user_id", customer.id);
  return created.id;
}

/**
 * Turn the cart into an order awaiting payment, reserve its stock and open a
 * Stripe Checkout session for it. Everything is priced again here from the
 * catalog, so the cookie only ever says what and how many.
 */
export async function createCheckout(input: {
  cart: CartLine[];
  fulfillment: Fulfillment;
  origin: string;
  customer: CheckoutCustomer | null;
}): Promise<CheckoutResult> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "unavailable" };
  const supabase = createAdminClient();

  // Free stock held by checkouts whose expiry event never arrived.
  await supabase.rpc("release_stale_checkouts").then(
    ({ error }) => error && console.error("[checkout] release stale:", error.message),
  );

  const { shippingRates, coreReturnDays: returnDays } = await getSiteSettings();
  const products = await loadBuyableProducts(input.cart.map((l) => l.productId));
  const cart = priceCart(input.cart, products, shippingRates);
  if (cart.adjustments.length) {
    return { ok: false, error: "changed", cleaned: cart.cleaned };
  }
  if (!cart.lines.length) return { ok: false, error: "empty" };
  const shipping = shippingCents(cart, input.fulfillment);
  if (shipping === null) {
    return { ok: false, error: "no_shipping" };
  }

  const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_MINUTES * 60;
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: input.customer?.id ?? null,
      email: input.customer?.email ?? null,
      name: input.customer?.name ?? null,
      fulfillment: input.fulfillment,
      subtotal_cents: cart.subtotalCents,
      core_cents: cart.coreCents,
      shipping_cents: shipping,
      total_cents: cart.subtotalCents + cart.coreCents + shipping,
      expires_at: new Date(expiresAt * 1000).toISOString(),
    })
    .select("id, reference")
    .single();
  if (orderError) {
    console.error("[checkout] order insert:", orderError.message);
    return { ok: false, error: "unavailable" };
  }

  const cancel = () => supabase.rpc("cancel_checkout", { p_order_id: order.id });

  const { error: itemsError } = await supabase.from("order_items").insert(
    cart.lines.map((l, i) => ({
      order_id: order.id,
      product_id: l.product.id,
      sku: l.product.sku,
      name: l.product.name,
      condition: l.product.condition,
      unit_price_cents: l.product.priceCents,
      core_charge_cents: Math.max(0, l.product.coreChargeCents ?? 0),
      quantity: l.quantity,
      weight_lb: l.product.weightLb,
      sort_order: i,
    })),
  );
  if (itemsError) {
    console.error("[checkout] items insert:", itemsError.message);
    await cancel();
    return { ok: false, error: "unavailable" };
  }

  const { data: reserved, error: reserveError } = await supabase.rpc("reserve_order_stock", { p_order_id: order.id });
  if (reserveError || !reserved) {
    if (reserveError) console.error("[checkout] reserve:", reserveError.message);
    await cancel();
    return {
      ok: false,
      error: reserveError ? "unavailable" : "sold_out",
      cleaned: input.cart,
    };
  }

  try {
    const customer = input.customer ? await stripeCustomerFor(stripe, supabase, input.customer) : undefined;
    const metadata = { order_id: order.id, order_reference: order.reference };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: order.id,
      metadata,
      payment_intent_data: { metadata, description: `${SITE.name} order ${order.reference}` },
      expires_at: expiresAt,
      line_items: cart.lines.flatMap<Stripe.Checkout.SessionCreateParams.LineItem>((l) => [
        {
          quantity: l.quantity,
          price_data: {
            currency: "usd",
            unit_amount: l.product.priceCents ?? 0,
            tax_behavior: "exclusive" as const,
            product_data: {
              name: `${l.product.name} (${CONDITION_LABELS[l.product.condition]})`,
              description: `Part # ${l.product.sku}`,
              metadata: { sku: l.product.sku, core: "false" },
            },
          },
        },
        // The refundable core charge is its own line, so the receipt shows it separately.
        ...(l.coreCents > 0
          ? [
              {
                quantity: l.quantity,
                price_data: {
                  currency: "usd",
                  unit_amount: l.product.coreChargeCents ?? 0,
                  tax_behavior: "exclusive" as const,
                  product_data: {
                    name: `Core charge (refundable): ${l.product.name}`,
                    description: `Refunded when your old unit comes back within ${returnDays} days and passes inspection.`,
                    metadata: { sku: l.product.sku, core: "true" },
                  },
                },
              },
            ]
          : []),
      ]),
      automatic_tax: { enabled: true },
      ...(customer
        ? { customer, customer_update: { address: "auto", shipping: "auto", name: "auto" } }
        : {}),
      phone_number_collection: { enabled: true },
      ...(input.fulfillment === "ship"
        ? {
            shipping_address_collection: { allowed_countries: ["US"] },
            shipping_options: [
              {
                shipping_rate_data: {
                  type: "fixed_amount",
                  display_name: "Ground shipping (UPS or FedEx)",
                  fixed_amount: { amount: shipping, currency: "usd" },
                  tax_behavior: "exclusive",
                },
              },
            ],
          }
        : // Pickup: no shipping address, so tax is worked out from the billing address.
          { billing_address_collection: "required" }),
      success_url: `${input.origin}/api/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${input.origin}/api/checkout/cancel`,
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    await supabase.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
    return { ok: true, url: session.url, orderId: order.id };
  } catch (error) {
    console.error("[checkout] Stripe session:", error instanceof Error ? error.message : error);
    await cancel();
    return { ok: false, error: "unavailable" };
  }
}

import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { handleStripeEvent } from "@/lib/orders/payments";
import { getStripe } from "@/lib/orders/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook. In the Stripe dashboard, send these events here:
 * checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed and checkout.session.expired, plus
 * invoice.paid, invoice.voided and invoice.marked_uncollectible (Net-30).
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Stripe is not configured", { status: 503 });

  let event: Stripe.Event;
  try {
    // The signature covers the exact bytes Stripe sent, so read the raw body.
    event = stripe.webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: seen } = await supabase.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return Response.json({ received: true, duplicate: true });

  try {
    await handleStripeEvent(event);
  } catch (error) {
    // A 500 makes Stripe retry later; the handlers are safe to run again.
    console.error(`[stripe] ${event.type} ${event.id}:`, error instanceof Error ? error.message : error);
    return new Response("Handler failed", { status: 500 });
  }

  const { error } = await supabase.from("stripe_events").insert({ id: event.id, type: event.type });
  if (error && error.code !== "23505") console.error(`[stripe] recording ${event.id}:`, error.message);
  return Response.json({ received: true });
}

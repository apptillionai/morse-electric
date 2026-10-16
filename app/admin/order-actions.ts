"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/admin/auth";
import { getOrderForStaff, NEXT_STEPS } from "@/lib/admin/orders";
import { sendOrderEmails } from "@/lib/orders/email";
import { settleInvoiceForCancel } from "@/lib/orders/net30";
import { getStripe } from "@/lib/orders/store";
import type { OrderStatus } from "@/lib/orders/types";
import { formFields } from "@/lib/requests/schemas";
import { createSessionClient } from "@/lib/supabase/server";

// Every action re-checks staff access and goes through the staff member's own
// session, so row-level security and the order guard trigger apply.

export interface OrderActionState {
  error?: string;
  saved?: string;
}

function revalidateOrder(orderId: string) {
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/account", "layout");
}

/** Move an order along: being prepared → shipped (with tracking) / ready for pickup → completed. */
export async function advanceOrderAction(orderId: string, _prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  await requireStaff();
  const supabase = await createSessionClient();
  const order = await getOrderForStaff(supabase, orderId);
  if (!order) return { error: "Order not found." };

  const { step, carrier, tracking_number } = formFields(formData, ["step", "carrier", "tracking_number"] as const);
  const allowed = NEXT_STEPS[order.status]?.[order.fulfillment] ?? [];
  if (!allowed.includes(step as OrderStatus)) return { error: "That step isn’t possible from the order’s current status. Reload the page." };
  if (carrier.length > 60 || tracking_number.length > 100) return { error: "Carrier or tracking number is too long." };

  const { error } = await supabase
    .from("orders")
    .update({
      status: step,
      ...(step === "shipped"
        ? { carrier: carrier.trim() || null, tracking_number: tracking_number.trim() || null, shipped_at: new Date().toISOString() }
        : {}),
      ...(step === "completed" ? { closed_at: new Date().toISOString() } : {}),
    })
    .eq("id", orderId)
    .eq("status", order.status);
  if (error) return { error: `Couldn’t update the order: ${error.message}` };

  if (step === "shipped") after(() => sendOrderEmails(orderId, "shipped"));
  if (step === "ready_for_pickup") after(() => sendOrderEmails(orderId, "ready"));
  revalidateOrder(orderId);
  return { saved: step === "shipped" || step === "ready_for_pickup" ? "Saved. We’ve emailed the customer." : "Saved." };
}

/**
 * Cancel (before it ships) or refund (after) an order: refund the full
 * payment in Stripe (for Net-30, void or credit the invoice), then close the
 * order, optionally restocking it. Partial refunds are done in the Stripe
 * dashboard.
 */
export async function closeOrderAction(orderId: string, _prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  await requireStaff();
  const supabase = await createSessionClient();
  const order = await getOrderForStaff(supabase, orderId);
  if (!order) return { error: "Order not found." };
  if (formData.get("confirm") !== "on") return { error: "Tick the box to confirm." };

  const shipped = order.status === "shipped" || order.status === "completed";
  const closing: OrderStatus = shipped ? "refunded" : "cancelled";
  if (order.status === "pending_payment") {
    return { error: "The bank payment is still clearing. Wait until it clears (or fails) before cancelling." };
  }
  if (!["invoiced", "paid", "processing", "ready_for_pickup", "shipped", "completed"].includes(order.status)) {
    return { error: "This order can’t be cancelled or refunded." };
  }
  const restock = formData.get("restock") === "on";

  if (order.stripe_invoice_id) {
    // Net-30: void the invoice, or credit and refund it if it was already paid.
    const stripe = getStripe();
    if (!stripe) return { error: "Stripe isn’t configured, so the invoice can’t be voided from here." };
    try {
      await settleInvoiceForCancel(stripe, order.stripe_invoice_id, order.id);
    } catch (error) {
      return { error: `Stripe refused to void or credit the invoice: ${error instanceof Error ? error.message : String(error)}` };
    }
  } else if (order.stripe_payment_intent_id && order.total_cents > 0) {
    const stripe = getStripe();
    if (!stripe) return { error: "Stripe isn’t configured, so the payment can’t be refunded from here." };
    try {
      await stripe.refunds.create(
        { payment_intent: order.stripe_payment_intent_id, metadata: { order_id: order.id, order_reference: order.reference } },
        // One full refund per order, even if the button is pressed twice.
        { idempotencyKey: `refund-${order.id}` },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already been refunded/i.test(message)) return { error: `Stripe refused the refund: ${message}` };
    }
  }

  const { data: closed, error } = await supabase.rpc("staff_close_order", { p_order_id: orderId, p_status: closing, p_restock: restock });
  if (error || !closed) {
    return { error: `The payment was refunded, but the order couldn’t be updated${error ? `: ${error.message}` : ""}. Reload and check its status.` };
  }
  after(() => sendOrderEmails(orderId, closing === "refunded" ? "refunded" : "cancelled"));
  revalidateOrder(orderId);
  return { saved: `Order ${closing}${restock ? " and restocked" : ""}. We’ve emailed the customer.` };
}

export async function saveOrderNotesAction(orderId: string, _prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const staff = await requireStaff();
  const text = String(formData.get("notes") ?? "").trim();
  if (text.length > 4000) return { error: "Notes must be 4,000 characters or fewer." };
  const supabase = await createSessionClient();
  const { error } = text
    ? await supabase.from("order_notes").upsert({ order_id: orderId, notes: text, updated_by: staff.id, updated_at: new Date().toISOString() })
    : await supabase.from("order_notes").delete().eq("order_id", orderId);
  if (error) return { error: `Couldn’t save the notes: ${error.message}` };
  revalidatePath(`/admin/orders/${orderId}`);
  return { saved: "Notes saved." };
}

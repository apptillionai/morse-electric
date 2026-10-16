"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/admin/auth";
import { getCore } from "@/lib/admin/cores";
import { sendOrderEmails } from "@/lib/orders/email";
import { getStripe } from "@/lib/orders/store";
import { createSessionClient } from "@/lib/supabase/server";

// Every action re-checks staff access and writes through the staff member's
// own session; the core_returns trigger only allows one step at a time.

export interface CoreActionState {
  error?: string;
  saved?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateCore(orderId: string) {
  revalidatePath("/admin", "layout");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/account", "layout");
}

/** One action per form: received, credit (refund through Stripe), reject, extend, or undo receipt. */
export async function updateCoreAction(coreId: string, _prev: CoreActionState, formData: FormData): Promise<CoreActionState> {
  await requireStaff();
  if (!UUID.test(coreId)) return { error: "Core not found." };
  const supabase = await createSessionClient();
  const core = await getCore(supabase, coreId);
  if (!core || !core.order) return { error: "Core not found." };
  const step = String(formData.get("step") ?? "");
  const owed = core.quantity * core.core_charge_cents;

  const update = async (values: Record<string, unknown>, from: string) => {
    const { data, error } = await supabase.from("core_returns").update(values).eq("id", coreId).eq("status", from).select("id");
    if (error) return error.message;
    return data.length ? null : "Someone else just changed this core. Reload the page.";
  };

  switch (step) {
    case "received": {
      const error = await update({ status: "received" }, "awaiting");
      if (error) return { error };
      revalidateCore(core.order_id);
      return { saved: "Marked as received." };
    }
    case "undo_received": {
      const error = await update({ status: "awaiting", received_at: null }, "received");
      if (error) return { error };
      revalidateCore(core.order_id);
      return { saved: "Back to waiting for the core." };
    }
    case "credit": {
      if (core.status !== "received") return { error: "Mark the core as received before refunding it." };
      if (!core.order.stripe_payment_intent_id) return { error: "This order has no Stripe payment to refund. Refund it another way and add a note." };
      const stripe = getStripe();
      if (!stripe) return { error: "Stripe isn’t configured, so the core charge can’t be refunded from here." };
      let refundId: string;
      try {
        const refund = await stripe.refunds.create(
          {
            payment_intent: core.order.stripe_payment_intent_id,
            amount: owed,
            metadata: { order_id: core.order_id, core_return_id: core.id, reason: "core returned" },
          },
          // One refund per core, even if the button is pressed twice.
          { idempotencyKey: `core-${core.id}` },
        );
        refundId = refund.id;
      } catch (error) {
        return { error: `Stripe refused the refund: ${error instanceof Error ? error.message : String(error)}` };
      }
      const error = await update({ status: "credited", credit_cents: owed, stripe_refund_id: refundId }, "received");
      if (error) return { error: `The ${(owed / 100).toFixed(2)} refund went through in Stripe (${refundId}), but the core couldn’t be updated: ${error}` };
      after(() => sendOrderEmails(core.order_id, "core_credited", core.id));
      revalidateCore(core.order_id);
      return { saved: "Refunded the core charge and emailed the customer." };
    }
    case "reject": {
      const reason = String(formData.get("reason") ?? "").trim();
      if (!reason) return { error: "Say why the core can’t be accepted; the customer sees this." };
      if (reason.length > 1000) return { error: "Keep the reason under 1,000 characters." };
      if (core.status !== "awaiting" && core.status !== "received") return { error: "This core is already settled." };
      const error = await update({ status: "rejected", rejection_reason: reason }, core.status);
      if (error) return { error };
      after(() => sendOrderEmails(core.order_id, "core_rejected", core.id));
      revalidateCore(core.order_id);
      return { saved: "Rejected and emailed the customer." };
    }
    case "extend": {
      const days = Number(formData.get("days"));
      if (!Number.isInteger(days) || days < 1 || days > 365) return { error: "Extend by 1 to 365 days." };
      if (core.status !== "awaiting") return { error: "Only a core we’re still waiting for can be extended." };
      const due = new Date(Date.parse(`${core.due_date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
      // A new deadline earns new reminders.
      const error = await update({ due_date: due, reminder_sent_at: null, overdue_notice_sent_at: null }, "awaiting");
      if (error) return { error };
      revalidateCore(core.order_id);
      return { saved: `Now due ${due}.` };
    }
    default:
      return { error: "Unknown action." };
  }
}

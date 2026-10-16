"use client";

import { useActionState } from "react";
import type { OrderActionState } from "@/app/admin/order-actions";
import { FormMessage, TextAreaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";

type Action = (prev: OrderActionState, formData: FormData) => Promise<OrderActionState>;

const heading = "font-display text-xl font-bold uppercase tracking-[0.04em]";

function Saved({ state, pending }: { state: OrderActionState; pending: boolean }) {
  return state.saved && !pending ? <span role="status" className="text-sm font-medium text-ok">{state.saved}</span> : null;
}

const STEP_LABELS: Record<string, string> = {
  processing: "Mark as being prepared",
  shipped: "Mark as shipped",
  ready_for_pickup: "Mark ready for pickup",
  completed: "Mark completed",
};

/** The next fulfilment steps for an order. Shipping asks for the carrier and tracking number. */
export function AdvanceOrderForm({ action, steps }: { action: Action; steps: string[] }) {
  const [state, formAction, pending] = useActionState(action, {});
  if (!steps.length) return null;
  return (
    <section className="flex flex-col gap-4 rounded-md border border-edge bg-surface p-5">
      <h2 className={heading}>Fulfil</h2>
      <FormMessage message={state.error} />
      {steps.map((step) => (
        <form key={step} action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="step" value={step} />
          {step === "shipped" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Carrier" name="carrier" placeholder="UPS, FedEx…" maxLength={60} />
              <TextField label="Tracking number" name="tracking_number" maxLength={100} />
            </div>
          )}
          <div>
            <Button type="submit" variant={step === "processing" ? "quiet" : "dark"} size="sm" disabled={pending}>
              {STEP_LABELS[step] ?? step}
            </Button>
          </div>
        </form>
      ))}
      <p className="text-[13px] text-fg-muted">Shipped and ready-for-pickup each email the customer.</p>
      <Saved state={state} pending={pending} />
    </section>
  );
}

/** Cancel (unshipped) or refund (shipped) in full, through Stripe. */
export function CloseOrderForm({ action, shipped }: { action: Action; shipped: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const verb = shipped ? "Refund" : "Cancel and refund";
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
      <h2 className={heading}>{shipped ? "Refund" : "Cancel"}</h2>
      <FormMessage message={state.error} />
      <p className="text-sm text-fg-muted">
        Refunds the full payment through Stripe and emails the customer. For a partial refund, use the Stripe dashboard.
      </p>
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
        <input type="checkbox" name="restock" defaultChecked={!shipped} className="size-[18px] accent-fg" />
        Put the items back in stock
      </label>
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold">
        <input type="checkbox" name="confirm" className="size-[18px] accent-fg" />
        Yes, {verb.toLowerCase()} this order
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Working…" : verb}</Button>
        <Saved state={state} pending={pending} />
      </div>
    </form>
  );
}

export function OrderNotesForm({ action, notes }: { action: Action; notes: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
      <h2 className={heading}>Notes</h2>
      <FormMessage message={state.error} />
      <TextAreaField label="Staff notes" name="notes" rows={5} defaultValue={notes} hint="Only staff see these." />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="dark" size="sm" disabled={pending}>{pending ? "Saving…" : "Save notes"}</Button>
        <Saved state={state} pending={pending} />
      </div>
    </form>
  );
}

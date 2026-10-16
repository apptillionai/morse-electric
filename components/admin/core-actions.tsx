"use client";

import { useActionState } from "react";
import type { CoreActionState } from "@/app/admin/core-actions";
import { Button } from "@/components/ui/button";

type Action = (prev: CoreActionState, formData: FormData) => Promise<CoreActionState>;

function Step({ step, label, variant = "quiet", pending }: { step: string; label: string; variant?: "quiet" | "dark" | "outline"; pending: boolean }) {
  return (
    <Button type="submit" name="step" value={step} variant={variant} size="sm" disabled={pending}>
      {label}
    </Button>
  );
}

/** What staff can do with a core in its current status. */
export function CoreActions({ action, status, amount }: { action: Action; status: string; amount: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="flex flex-col gap-2">
      {status === "awaiting" && (
        <>
          <form action={formAction} className="flex flex-wrap gap-2">
            <Step step="received" label="Mark received" variant="dark" pending={pending} />
          </form>
          <form action={formAction} className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm">
              Extend by
              <input type="number" name="days" min={1} max={365} defaultValue={14} className="h-9 w-16 rounded border border-edge-strong bg-surface px-2" />
              days
            </label>
            <Step step="extend" label="Extend" pending={pending} />
          </form>
        </>
      )}
      {status === "received" && (
        <form action={formAction} className="flex flex-wrap gap-2">
          <Step step="credit" label={`Accept & refund ${amount}`} variant="dark" pending={pending} />
          <Step step="undo_received" label="Not received after all" pending={pending} />
        </form>
      )}
      {(status === "awaiting" || status === "received") && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Reject…</summary>
          <form action={formAction} className="mt-2 flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              Why (the customer sees this)
              <textarea name="reason" rows={2} maxLength={1000} required className="rounded border border-edge-strong bg-surface p-2" />
            </label>
            <div>
              <Step step="reject" label="Reject core" variant="outline" pending={pending} />
            </div>
          </form>
        </details>
      )}
      {state.error && <p role="alert" className="text-sm font-medium text-danger">{state.error}</p>}
      {state.saved && !pending && <p role="status" className="text-sm font-medium text-ok">{state.saved}</p>}
    </div>
  );
}

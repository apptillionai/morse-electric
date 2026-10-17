"use client";

import { useActionState } from "react";
import { savePriceTierAction, type TierState } from "@/app/admin/actions";
import { FormMessage } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";

const input = "h-11 rounded border border-edge-strong bg-surface px-3 font-normal text-fg";

/** One tier's name and discount (or a blank one to add). Several sit on one page, so ids are per tier. */
export function PriceTierForm({ tier }: { tier: { id: string; name: string; discount_percent: number } | null }) {
  const [state, action, pending] = useActionState(savePriceTierAction.bind(null, tier?.id ?? null), {} as TierState);
  const id = tier?.id ?? "new";
  const name = state.values?.name ?? tier?.name ?? "";
  const discount = state.values?.discount ?? (tier ? String(tier.discount_percent) : "");
  const err = state.errors ?? {};

  return (
    <form action={action} key={state.version ?? "initial"} className="flex flex-col gap-2" noValidate>
      <FormMessage message={state.error} />
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={`tier-${id}-name`} className="flex min-w-0 flex-[1_1_200px] flex-col gap-1.5 text-sm font-semibold">
          Name
          <input
            id={`tier-${id}-name`}
            name="name"
            defaultValue={name}
            placeholder={tier ? undefined : "e.g. Contractor"}
            aria-invalid={err.name ? true : undefined}
            aria-describedby={err.name ? `tier-${id}-name-error` : undefined}
            className={input}
          />
        </label>
        <label htmlFor={`tier-${id}-discount`} className="flex w-36 flex-col gap-1.5 text-sm font-semibold">
          Discount (%)
          <input
            id={`tier-${id}-discount`}
            name="discount"
            inputMode="decimal"
            defaultValue={discount}
            placeholder={tier ? undefined : "10"}
            aria-invalid={err.discount ? true : undefined}
            aria-describedby={err.discount ? `tier-${id}-discount-error` : undefined}
            className={input}
          />
        </label>
        <Button type="submit" variant="dark" size="sm" disabled={pending} className="h-11">
          {pending ? "Saving…" : tier ? "Save" : "Add tier"}
        </Button>
        {state.saved && !pending && <span role="status" className="self-center text-sm font-medium text-ok">Saved.</span>}
      </div>
      {err.name && <p id={`tier-${id}-name-error`} className="text-sm font-medium text-danger">{err.name}</p>}
      {err.discount && <p id={`tier-${id}-discount-error`} className="text-sm font-medium text-danger">{err.discount}</p>}
    </form>
  );
}

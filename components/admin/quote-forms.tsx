"use client";

import { useActionState } from "react";
import type { QuoteActionState } from "@/app/admin/quote-actions";
import { FormMessage } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { BLANK_QUOTE_ROWS, moneyField } from "@/lib/admin/quote-form";
import type { QuoteLineValues } from "@/lib/quotes/logic";

type Action = (prev: QuoteActionState, formData: FormData) => Promise<QuoteActionState>;

const input = "h-10 w-full rounded border border-edge-strong bg-surface px-2 text-[15px] aria-[invalid=true]:border-danger";

function Done({ state, pending }: { state: QuoteActionState; pending: boolean }) {
  if (pending || !state.saved) return null;
  return (
    <div role="status" className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ok">{state.saved}</span>
      {state.link && (
        <span className="break-all">
          Customer’s link: <a href={state.link} target="_blank" rel="noreferrer">{state.link}</a>
        </span>
      )}
    </div>
  );
}

/** The draft editor: numbered line rows, shipping, validity and a message. Save, or save and send. */
export function QuoteEditor({
  action: save,
  lines,
  shippingCents,
  validDays,
  message,
  email,
  version,
}: {
  action: Action;
  lines: QuoteLineValues[];
  shippingCents: number | null;
  validDays: number;
  message: string | null;
  email: string;
  /** Changes whenever the saved quote does, so the form shows the saved values. */
  version: string;
}) {
  const [state, formAction, pending] = useActionState(save, {});
  const rows = [...lines, ...Array.from({ length: BLANK_QUOTE_ROWS }, () => null)];
  // After a failed save, show what was typed rather than the saved values.
  const typed = state.values;
  const value = (name: string, saved: string) => (typed ? (typed[name] ?? "") : saved);
  const err = state.fieldErrors ?? {};

  return (
    <form key={`${version}-${state.version ?? 0}`} action={formAction} className="flex flex-col gap-4">
      <FormMessage message={state.error} />
      <div role="region" aria-label="Quote lines" tabIndex={0} className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-fg-muted">
            <tr>
              <th scope="col" className="py-2 pr-2 font-semibold">Description</th>
              <th scope="col" className="w-28 py-2 pr-2 font-semibold">Part #</th>
              <th scope="col" className="w-16 py-2 pr-2 font-semibold">Qty</th>
              <th scope="col" className="w-28 py-2 pr-2 font-semibold">Price each</th>
              <th scope="col" className="w-28 py-2 font-semibold">Core each</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => {
              const f = (field: string) => `line_${i}_${field}`;
              const rowErrors = ["description", "sku", "qty", "price", "core"].map((k) => err[f(k)]).filter(Boolean);
              return (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-2">
                    <input type="hidden" name={f("product")} value={value(f("product"), l?.productId ?? "")} />
                    <input
                      name={f("description")}
                      aria-label={`Line ${i + 1} description`}
                      defaultValue={value(f("description"), l?.description ?? "")}
                      maxLength={300}
                      aria-invalid={err[f("description")] ? true : undefined}
                      className={input}
                    />
                    {rowErrors.length > 0 && <p className="mt-1 text-[13px] font-medium text-danger">{rowErrors.join(" ")}</p>}
                  </td>
                  <td className="py-1 pr-2">
                    <input name={f("sku")} aria-label={`Line ${i + 1} part number`} defaultValue={value(f("sku"), l?.sku ?? "")} maxLength={80} className={`${input} font-mono`} />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      name={f("qty")}
                      aria-label={`Line ${i + 1} quantity`}
                      inputMode="numeric"
                      defaultValue={value(f("qty"), l ? String(l.quantity) : "")}
                      aria-invalid={err[f("qty")] ? true : undefined}
                      className={input}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      name={f("price")}
                      aria-label={`Line ${i + 1} price each`}
                      inputMode="decimal"
                      defaultValue={value(f("price"), l ? moneyField(l.unitPriceCents) : "")}
                      aria-invalid={err[f("price")] ? true : undefined}
                      className={input}
                    />
                  </td>
                  <td className="py-1">
                    <input
                      name={f("core")}
                      aria-label={`Line ${i + 1} core charge each`}
                      inputMode="decimal"
                      defaultValue={value(f("core"), l && l.coreChargeCents > 0 ? moneyField(l.coreChargeCents) : "")}
                      aria-invalid={err[f("core")] ? true : undefined}
                      className={input}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-fg-muted">
        Need more lines? Save, and {BLANK_QUOTE_ROWS} more blank rows appear. Clear a row’s description to remove it. Core charges are refunded when the old unit comes back.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          <span>Shipping <span className="font-normal text-fg-muted">(blank: pickup only)</span></span>
          <input name="shipping" inputMode="decimal" defaultValue={value("shipping", moneyField(shippingCents))} aria-invalid={err.shipping ? true : undefined} className={input} />
          {err.shipping && <span className="text-[13px] font-medium text-danger">{err.shipping}</span>}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Valid for (days)
          <input name="valid_days" inputMode="numeric" defaultValue={value("valid_days", String(validDays))} aria-invalid={err.valid_days ? true : undefined} className={input} />
          {err.valid_days && <span className="text-[13px] font-medium text-danger">{err.valid_days}</span>}
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        <span>Message to the customer <span className="font-normal text-fg-muted">(optional)</span></span>
        <textarea name="message" rows={3} maxLength={2000} defaultValue={value("message", message ?? "")} className="rounded border border-edge-strong bg-surface p-3 font-normal" />
        {err.message && <span className="text-[13px] font-medium text-danger">{err.message}</span>}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="intent" value="save" variant="quiet" size="sm" disabled={pending}>Save draft</Button>
        <Button type="submit" name="intent" value="send" variant="dark" size="sm" disabled={pending}>
          {pending ? "Saving…" : `Save and send to ${email}`}
        </Button>
      </div>
      <Done state={state} pending={pending} />
    </form>
  );
}

/** One button that runs a quote action and reports back (edit, withdraw, resend). */
export function QuoteActionButton({
  action,
  label,
  variant = "quiet",
  confirm,
}: {
  action: (prev: QuoteActionState) => Promise<QuoteActionState>;
  label: string;
  variant?: "quiet" | "dark";
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <FormMessage message={state.error} />
      <div>
        <Button type="submit" variant={variant} size="sm" disabled={pending}>{pending ? "Working…" : label}</Button>
      </div>
      <Done state={state} pending={pending} />
    </form>
  );
}

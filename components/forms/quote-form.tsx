"use client";

import { useActionState } from "react";
import { submitQuoteRequest } from "@/app/actions/requests";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/requests/form-state";
import { FormMessage, Honeypot, TextAreaField, TextField } from "./fields";
import { RequestReceived } from "./request-received";
import { Turnstile } from "./turnstile";

export function QuoteForm({ product }: { product: { sku: string; name: string } | null }) {
  const [state, formAction, pending] = useActionState(submitQuoteRequest, INITIAL_FORM_STATE);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  if (state.status === "success") {
    return (
      <RequestReceived title="Quote request received" reference={state.reference}>
        We’ll check stock and pricing and reply by email, usually within one business day. Keep your reference number
        handy if you call us.
      </RequestReceived>
    );
  }

  return (
    <form action={formAction} className="relative flex flex-col gap-5" noValidate>
      <Honeypot />
      <input type="hidden" name="source_path" value={product ? `/quote?sku=${product.sku}` : "/quote"} />
      <FormMessage message={state.status === "error" ? state.message : undefined} />

      {product ? (
        <div className="rounded border border-edge bg-page px-4 py-3">
          <span className="text-[13px] text-fg-muted">Quoting</span>
          <p className="font-semibold">{product.name}</p>
          <span className="font-mono text-[13px] text-fg-muted">Part # {product.sku}</span>
          <input type="hidden" name="sku" value={product.sku} />
        </div>
      ) : (
        <TextField
          label="Part number"
          name="sku"
          defaultValue={v.sku}
          error={e.sku}
          hint="Our part #, the manufacturer’s, or leave blank and describe it below."
        />
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        <TextField label="Name" name="name" autoComplete="name" required defaultValue={v.name} error={e.name} />
        <TextField label="Company" name="company" autoComplete="organization" defaultValue={v.company} error={e.company} />
        <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue={v.email} error={e.email} />
        <TextField label="Phone" name="phone" type="tel" autoComplete="tel" defaultValue={v.phone} error={e.phone} />
        <TextField label="Quantity" name="quantity" inputMode="numeric" defaultValue={v.quantity} error={e.quantity} />
      </div>

      <TextAreaField
        label={product ? "Anything else we should know" : "What do you need?"}
        name="details"
        required={!product}
        defaultValue={v.details}
        error={e.details}
        placeholder="Nameplate details (make, HP, RPM, frame, voltage), application, or how soon you need it…"
      />

      <Turnstile action="quote" resetSignal={state} />

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Send quote request"}
        </Button>
      </div>
    </form>
  );
}

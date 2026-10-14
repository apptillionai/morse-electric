"use client";

import { useActionState } from "react";
import { submitServiceRequest } from "@/app/actions/requests";
import { Button } from "@/components/ui/button";
import { INITIAL_FORM_STATE } from "@/lib/requests/form-state";
import { EQUIPMENT_TYPES, type EquipmentType } from "@/lib/requests/schemas";
import { CheckboxField, FormMessage, Honeypot, TextAreaField, TextField } from "./fields";
import { RequestReceived } from "./request-received";
import { Turnstile } from "./turnstile";

export function ServiceRequestForm({ phone }: { phone: string }) {
  const [state, formAction, pending] = useActionState(submitServiceRequest, INITIAL_FORM_STATE);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  if (state.status === "success") {
    return (
      <RequestReceived title="Request received" reference={state.reference}>
        A service coordinator will call you to arrange drop-off or pickup. Line down? Call {phone} and give them your
        job number.
      </RequestReceived>
    );
  }

  return (
    <form action={formAction} className="relative flex flex-col gap-5" noValidate>
      <Honeypot />
      <input type="hidden" name="source_path" value="/service" />
      <FormMessage message={state.status === "error" ? state.message : undefined} />

      <fieldset className="m-0 border-0 p-0" aria-describedby={e.equipmentType ? "equipmentType-error" : undefined}>
        <legend className="mb-2.5 font-semibold">What needs service?</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(EQUIPMENT_TYPES) as EquipmentType[]).map((type) => (
            <label
              key={type}
              className="flex min-h-11 cursor-pointer items-center rounded-full border border-field bg-white px-4 text-sm font-semibold has-checked:border-ink has-checked:bg-ink has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-copper-bright"
            >
              <input
                type="radio"
                name="equipmentType"
                value={type}
                defaultChecked={(v.equipmentType || "motor") === type}
                className="sr-only"
              />
              {EQUIPMENT_TYPES[type]}
            </label>
          ))}
        </div>
        {e.equipmentType && (
          <span id="equipmentType-error" className="mt-1.5 block text-[13px] font-medium text-danger">
            {e.equipmentType}
          </span>
        )}
      </fieldset>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        <TextField label="Name" name="name" autoComplete="name" required defaultValue={v.name} error={e.name} />
        <TextField label="Company" name="company" autoComplete="organization" defaultValue={v.company} error={e.company} />
        <TextField label="Phone" name="phone" type="tel" autoComplete="tel" required defaultValue={v.phone} error={e.phone} />
        <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue={v.email} error={e.email} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
        <TextField label="Make / brand" name="make" defaultValue={v.make} error={e.make} />
        <TextField label="HP / size" name="size" defaultValue={v.size} error={e.size} />
        <TextField label="Model / serial" name="modelSerial" defaultValue={v.modelSerial} error={e.modelSerial} />
      </div>

      <TextAreaField
        label="What’s it doing?"
        name="symptoms"
        required
        defaultValue={v.symptoms}
        error={e.symptoms}
        placeholder="Tripping the breaker, noisy bearings, won’t hold vacuum, not charging…"
      />

      <fieldset className="m-0 flex flex-wrap gap-x-6 border-0 p-0">
        <legend className="sr-only">Logistics</legend>
        <CheckboxField label="Schedule a pickup" name="wantsPickup" defaultChecked={v.wantsPickup === "on"} />
        <CheckboxField label="Line is down: rush" name="isRush" defaultChecked={v.isRush === "on"} />
        <CheckboxField label="Quote a replacement too" name="wantsReplacementQuote" defaultChecked={v.wantsReplacementQuote === "on"} />
      </fieldset>

      <Turnstile action="service" resetSignal={state} />

      <div className="flex flex-wrap items-center gap-3.5">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </Button>
        <span className="text-sm text-muted">Line down after hours? Call {phone}.</span>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useRef, useState, type RefObject } from "react";
import { submitServiceRequest } from "@/app/actions/requests";
import { Button } from "@/components/ui/button";
import type { UnitPrefill } from "@/lib/customers/equipment";
import { INITIAL_FORM_STATE } from "@/lib/requests/form-state";
import { EQUIPMENT_TYPES, type EquipmentType } from "@/lib/requests/schemas";
import { SignedInNote, useAccountPrefill } from "./account-prefill";
import { CheckboxField, FormMessage, Honeypot, TextAreaField, TextField } from "./fields";
import { PhotoField } from "./photo-field";
import { RequestReceived } from "./request-received";
import { Turnstile } from "./turnstile";

/**
 * For signed-in customers with an equipment list: pick the unit, and its
 * nameplate details fill the form. /service?unit=<id> (from the account's
 * "Request a repair") picks it up front. The server checks the unit is theirs.
 */
function UnitPicker({ units, formRef }: { units: UnitPrefill[]; formRef: RefObject<HTMLFormElement | null> }) {
  // Only rendered in the browser (after the prefill request), so the URL is there.
  const [unitId, setUnitId] = useState(() => {
    const wanted = new URLSearchParams(window.location.search).get("unit");
    return wanted && units.some((u) => u.id === wanted) ? wanted : "";
  });

  const fillFrom = (id: string) => {
    const unit = units.find((u) => u.id === id);
    const form = formRef.current;
    if (!unit || !form) return;
    const set = (name: string, value: string) => {
      const input = form.elements.namedItem(name);
      if (input instanceof HTMLInputElement && value) input.value = value;
    };
    set("make", unit.make);
    set("size", unit.size);
    set("modelSerial", unit.modelSerial);
    const radio = form.querySelector<HTMLInputElement>(`input[name="equipmentType"][value="${unit.equipmentType}"]`);
    if (radio) radio.checked = true;
  };
  const fill = (id: string) => {
    setUnitId(id);
    fillFrom(id);
  };

  // A unit picked from the URL fills the form once.
  const initial = useRef(unitId);
  useEffect(() => {
    if (initial.current) fillFrom(initial.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      <span>Which of your units is it? <span className="font-normal text-fg-muted">(optional)</span></span>
      <select
        name="equipmentId"
        value={unitId}
        onChange={(event) => fill(event.target.value)}
        className="h-11 w-full rounded border border-edge-strong bg-surface px-2.5 text-[15px] font-normal"
      >
        <option value="">Not on my list / something else</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>{u.label}</option>
        ))}
      </select>
      <span className="text-[13px] font-normal text-fg-muted">Picking one fills in its details and adds this repair to its history.</span>
    </label>
  );
}

export function ServiceRequestForm({ phone }: { phone: string }) {
  const [state, formAction, pending] = useActionState(submitServiceRequest, INITIAL_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const profile = useAccountPrefill(formRef);
  const [photosBusy, setPhotosBusy] = useState(false);
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
    <form ref={formRef} action={formAction} className="relative flex flex-col gap-5" noValidate>
      <Honeypot />
      <SignedInNote profile={profile} />
      <input type="hidden" name="source_path" value="/service" />
      <FormMessage message={state.status === "error" ? state.message : undefined} />

      {profile?.units && profile.units.length > 0 && <UnitPicker units={profile.units} formRef={formRef} />}

      <fieldset className="m-0 border-0 p-0" aria-describedby={e.equipmentType ? "equipmentType-error" : undefined}>
        <legend className="mb-2.5 font-semibold">What needs service?</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(EQUIPMENT_TYPES) as EquipmentType[]).map((type) => (
            <label
              key={type}
              className="flex min-h-11 cursor-pointer items-center rounded-full border border-edge-strong bg-surface px-4 text-sm font-semibold has-checked:border-bold has-checked:bg-bold has-checked:text-on-bold has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
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

      <PhotoField error={e.photos} onBusyChange={setPhotosBusy} />

      {!profile && <Turnstile action="service" resetSignal={state} />}

      <div className="flex flex-wrap items-center gap-3.5">
        <Button type="submit" size="lg" disabled={pending || photosBusy}>
          {pending ? "Sending…" : "Send request"}
        </Button>
        <span className="text-sm text-fg-muted">Line down after hours? Call {phone}.</span>
      </div>
    </form>
  );
}

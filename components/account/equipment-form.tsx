"use client";

import { useActionState } from "react";
import type { EquipmentFormState } from "@/app/actions/equipment";
import { FormMessage, SelectField, TextAreaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { ENCLOSURE_LABELS, ENCLOSURES, POWER_LABELS, POWER_SUPPLIES } from "@/lib/catalog/types";
import type { EquipmentFormField } from "@/lib/customers/equipment";
import { EQUIPMENT_TYPES } from "@/lib/requests/schemas";

/** Add or edit one unit on the customer's equipment list. */
export function EquipmentForm({
  action: save,
  initial,
  submitLabel,
}: {
  action: (prev: EquipmentFormState, formData: FormData) => Promise<EquipmentFormState>;
  initial: Record<EquipmentFormField, string>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(save, {});
  const v = (f: EquipmentFormField) => state.values?.[f] ?? initial[f];
  const e = (f: EquipmentFormField) => state.fieldErrors?.[f];
  const name = (f: EquipmentFormField) => f;

  return (
    <form key={state.version ?? 0} action={formAction} className="flex flex-col gap-4">
      <FormMessage message={state.error} />
      <div className="grid gap-3.5 sm:grid-cols-2">
        <TextField label="Name" name={name("label")} required maxLength={120} defaultValue={v("label")} error={e("label")} hint="What you call it, like Cooling tower fan #2" />
        <SelectField
          label="Type"
         
          name={name("equipment_type")}
          required
          defaultValue={v("equipment_type")}
          error={e("equipment_type")}
          options={Object.entries(EQUIPMENT_TYPES).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-3">
        <TextField label="Make" name={name("make")} maxLength={120} defaultValue={v("make")} error={e("make")} />
        <TextField label="Model / catalog #" name={name("model")} maxLength={160} defaultValue={v("model")} error={e("model")} />
        <TextField label="Serial" name={name("serial")} maxLength={160} defaultValue={v("serial")} error={e("serial")} />
        <TextField label="HP" name={name("hp")} inputMode="decimal" defaultValue={v("hp")} error={e("hp")} />
        <TextField label="RPM" name={name("rpm")} inputMode="numeric" defaultValue={v("rpm")} error={e("rpm")} />
        <TextField label="Voltage" name={name("voltage")} maxLength={60} defaultValue={v("voltage")} error={e("voltage")} />
        <TextField label="Frame" name={name("frame")} maxLength={20} defaultValue={v("frame")} error={e("frame")} />
        <SelectField
          label="Enclosure"
         
          name={name("enclosure")}
          defaultValue={v("enclosure")}
          error={e("enclosure")}
          options={[{ value: "", label: "—" }, ...ENCLOSURES.map((x) => ({ value: x, label: ENCLOSURE_LABELS[x] }))]}
        />
        <SelectField
          label="Power"
         
          name={name("power")}
          defaultValue={v("power")}
          error={e("power")}
          options={[{ value: "", label: "—" }, ...POWER_SUPPLIES.map((x) => ({ value: x, label: POWER_LABELS[x] }))]}
        />
      </div>
      <TextField label="Where it is" name={name("location")} maxLength={160} defaultValue={v("location")} error={e("location")} hint="Building, line or room" />
      <TextAreaField label="Notes" name={name("notes")} rows={3} maxLength={2000} defaultValue={v("notes")} error={e("notes")} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="dark" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        {state.saved && !pending && <span role="status" className="text-sm font-medium text-ok">Saved.</span>}
      </div>
    </form>
  );
}

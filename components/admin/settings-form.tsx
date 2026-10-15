"use client";

import { useActionState } from "react";
import { saveSettingsAction, type SettingsState } from "@/app/admin/actions";
import { FormMessage, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import type { BusinessField } from "@/lib/business";
import { DEFAULT_THEME_LABELS, DEFAULT_THEME_OPTIONS, type DefaultTheme } from "@/lib/theme";

const legend = "mb-1 font-display text-xl font-bold uppercase tracking-[0.04em]";

export function SettingsForm({ defaultTheme, business }: { defaultTheme: DefaultTheme; business: Record<BusinessField, string> }) {
  const [state, action, pending] = useActionState(saveSettingsAction, {} as SettingsState);
  const v = (f: BusinessField) => state.values?.[f] ?? business[f];
  const e = state.fieldErrors ?? {};
  // Re-mount with the submitted values after an error so radios and fields keep what was typed.
  const key = state.values ? JSON.stringify(state) : "initial";
  const theme = (state.values?.default_theme as DefaultTheme | undefined) ?? defaultTheme;

  return (
    <form action={action} key={key} className="flex max-w-3xl flex-col gap-6" noValidate>
      <FormMessage message={state.error} />

      <fieldset className="grid gap-4 rounded-md border border-edge bg-surface p-6 sm:grid-cols-2" aria-describedby="business-hint">
        <legend className={legend}>Business details</legend>
        <p id="business-hint" className="text-sm text-fg-muted sm:col-span-2">
          Shown in the top bar, footer, contact page, repair and quote pages, and customer emails. Leave a field blank
          to show a placeholder such as [PHONE].
        </p>
        <TextField label="Phone" name="phone" type="tel" defaultValue={v("phone")} error={e.phone} hint="e.g. (978) 555-0100. Becomes a tap-to-call link." />
        <TextField label="Email" name="email" type="email" defaultValue={v("email")} error={e.email} hint="Public address for customers." />
        <TextField label="Street address" name="street" defaultValue={v("street")} error={e.street} className="sm:col-span-2" />
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_120px_140px]">
          <TextField label="City" name="city" defaultValue={v("city")} error={e.city} />
          <TextField label="State" name="state" defaultValue={v("state")} error={e.state} />
          <TextField label="ZIP" name="postal_code" inputMode="numeric" defaultValue={v("postal_code")} error={e.postal_code} />
        </div>
        <TextField label="Hours" name="hours" defaultValue={v("hours")} error={e.hours} hint="e.g. Mon–Fri 7:30–4:30, Sat 8–12" className="sm:col-span-2" />
        <TextField
          label="Service area"
          name="service_area"
          defaultValue={v("service_area")}
          error={e.service_area}
          hint="Finishes the sentence “Pickup available within …”, e.g. 75 miles of Gardner"
          className="sm:col-span-2"
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-md border border-edge bg-surface p-6" aria-describedby="theme-hint">
        <legend className={legend}>Default theme</legend>
        <p id="theme-hint" className="mb-2 text-sm text-fg-muted">
          What visitors see the first time they open the site. Anyone can still switch to Light, Mid or Dark at the top
          of the page, and their choice is remembered on their device.
        </p>
        {DEFAULT_THEME_OPTIONS.map((option) => (
          <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="radio" name="default_theme" value={option} defaultChecked={option === theme} className="size-[18px] accent-fg" />
            {DEFAULT_THEME_LABELS[option]}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
        {state.saved && !pending && <span role="status" className="text-sm font-medium text-ok">Saved. The website shows the new details now.</span>}
      </div>
    </form>
  );
}

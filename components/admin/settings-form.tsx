"use client";

import { useActionState } from "react";
import { saveSettingsAction, type SettingsState } from "@/app/admin/actions";
import { FormMessage } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { DEFAULT_THEME_LABELS, DEFAULT_THEME_OPTIONS, type DefaultTheme } from "@/lib/theme";

export function SettingsForm({ defaultTheme }: { defaultTheme: DefaultTheme }) {
  const [state, action, pending] = useActionState(saveSettingsAction, {} as SettingsState);
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5 rounded-md border border-edge bg-surface p-6">
      <FormMessage message={state.error} />
      <fieldset className="flex flex-col gap-2" aria-describedby="theme-hint">
        <legend className="mb-1 font-display text-xl font-bold uppercase tracking-[0.04em]">Default theme</legend>
        <p id="theme-hint" className="mb-2 text-sm text-fg-muted">
          What visitors see the first time they open the site. Anyone can still switch to Light, Mid or Dark at the top
          of the page, and their choice is remembered on their device.
        </p>
        {DEFAULT_THEME_OPTIONS.map((option) => (
          <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="radio" name="default_theme" value={option} defaultChecked={option === defaultTheme} className="size-[18px] accent-fg" />
            {DEFAULT_THEME_LABELS[option]}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
        {state.saved && !pending && <span role="status" className="text-sm font-medium text-ok">Saved. New visitors will see this theme.</span>}
      </div>
    </form>
  );
}

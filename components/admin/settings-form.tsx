"use client";

import { useActionState } from "react";
import { saveSettingsAction, type SettingsState } from "@/app/admin/actions";
import { FormMessage, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import type { BusinessField } from "@/lib/business";
import { RATE_ROWS } from "@/lib/orders/settings";
import { DEFAULT_THEME_LABELS, DEFAULT_THEME_OPTIONS, type DefaultTheme } from "@/lib/theme";

const legend = "mb-1 font-display text-xl font-bold uppercase tracking-[0.04em]";

export interface StoreSettings {
  enabled: boolean;
  /** rate_lb_N / rate_price_N form values. */
  rates: Record<string, string>;
  /** Which Stripe keys are missing on the server, if any. */
  missing: string[];
  coreReturnDays: number;
  live: {
    enabled: boolean;
    /** Form values: inches and the handling fee in dollars. */
    length: string;
    width: string;
    height: string;
    handlingFee: string;
    /** SHIPPO_API_KEY isn't set on the server. */
    keyMissing: boolean;
  };
}

export function SettingsForm({
  defaultTheme,
  business,
  store,
}: {
  defaultTheme: DefaultTheme;
  business: Record<BusinessField, string>;
  store: StoreSettings;
}) {
  const [state, action, pending] = useActionState(saveSettingsAction, {} as SettingsState);
  const v = (f: BusinessField) => state.values?.[f] ?? business[f];
  const e = state.fieldErrors ?? {};
  // Re-mount with the submitted values after an error so radios and fields keep what was typed.
  const key = state.values ? JSON.stringify(state) : "initial";
  const theme = (state.values?.default_theme as DefaultTheme | undefined) ?? defaultTheme;
  const storeOn = state.values ? state.values.store_enabled === "on" : store.enabled;
  const rate = (f: string) => state.values?.[f] ?? store.rates[f] ?? "";
  const liveOn = state.values ? state.values.live_rates_enabled === "on" : store.live.enabled;
  const shipFromMissing = !(v("street") && v("city") && v("state") && v("postal_code"));

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

      <fieldset className="flex flex-col gap-4 rounded-md border border-edge bg-surface p-6" aria-describedby="store-hint">
        <legend className={legend}>Online store</legend>
        <p id="store-hint" className="text-sm text-fg-muted">
          When the store is on, priced in-stock items that ship by parcel or are collected get an “Add to cart” button,
          and customers pay by card or bank transfer through Stripe. Everything else stays “Request a quote”. Freight items
          can’t be bought online. Core charges are added at checkout and refunded from Admin → Cores.
        </p>
        {store.missing.length > 0 && (
          <p role="note" className="rounded border-2 border-warn px-4 py-3 text-sm">
            Checkout won’t open until {store.missing.join(" and ")} {store.missing.length === 1 ? "is" : "are"} set in Vercel.
          </p>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
          <input type="checkbox" name="store_enabled" defaultChecked={storeOn} className="size-[18px] accent-fg" />
          Take orders online
        </label>
        <TextField
          label="Core return window (days)"
          name="core_return_days"
          inputMode="numeric"
          required
          defaultValue={state.values?.core_return_days ?? String(store.coreReturnDays)}
          error={e.core_return_days}
          hint="How long customers have to send back an old unit for a core-charge refund. Reminders go out a week before and on the due date."
          className="max-w-md"
        />
        <div className="flex flex-col gap-2">
          <span className="font-semibold">Parcel shipping by order weight</span>
          <span className="text-sm text-fg-muted">
            Each row is “orders up to this weight cost this much”. Heavier orders, and anything without a weight on file,
            can only be picked up. Pickup is always free. With live rates on, these only apply when Shippo can’t be reached,
            and they price Google Shopping only while live rates are off.
          </span>
          <div className="grid max-w-md grid-cols-2 gap-x-4 gap-y-2">
            {Array.from({ length: RATE_ROWS }, (_, i) => (
              <div key={i} className="contents">
                <TextField label="Up to (lb)" name={`rate_lb_${i}`} inputMode="decimal" defaultValue={rate(`rate_lb_${i}`)} error={e[`rate_lb_${i}`]} />
                <TextField label="Price ($)" name={`rate_price_${i}`} inputMode="decimal" defaultValue={rate(`rate_price_${i}`)} error={e[`rate_price_${i}`]} />
              </div>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-md border border-edge bg-surface p-6" aria-describedby="live-hint">
        <legend className={legend}>Live shipping rates</legend>
        <p id="live-hint" className="text-sm text-fg-muted">
          Customers enter their ZIP code in the cart and choose from real UPS, FedEx and USPS rates (through Shippo)
          instead of the weight bands. Orders are packed into the box below, up to 150 lb a box. The ship-from address is
          the business address above.
        </p>
        {(store.live.keyMissing || shipFromMissing) && (
          <p role="note" className="rounded border-2 border-warn px-4 py-3 text-sm">
            Live rates stay off until{" "}
            {[store.live.keyMissing && "SHIPPO_API_KEY is set in Vercel", shipFromMissing && "the business street, city, state and ZIP are filled in"]
              .filter(Boolean)
              .join(" and ")}
            .
          </p>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
          <input type="checkbox" name="live_rates_enabled" defaultChecked={liveOn} className="size-[18px] accent-fg" />
          Use live carrier rates
        </label>
        <div className="flex flex-col gap-2">
          <span className="font-semibold">Default box (inches)</span>
          <div className="grid max-w-md grid-cols-3 gap-x-4">
            <TextField label="Length" name="parcel_length" required inputMode="decimal" defaultValue={state.values?.parcel_length ?? store.live.length} error={e.parcel_length} />
            <TextField label="Width" name="parcel_width" required inputMode="decimal" defaultValue={state.values?.parcel_width ?? store.live.width} error={e.parcel_width} />
            <TextField label="Height" name="parcel_height" required inputMode="decimal" defaultValue={state.values?.parcel_height ?? store.live.height} error={e.parcel_height} />
          </div>
        </div>
        <TextField
          label="Handling fee ($)"
          name="handling_fee"
          inputMode="decimal"
          defaultValue={state.values?.handling_fee ?? store.live.handlingFee}
          error={e.handling_fee}
          hint="Added to every live rate for packing. Leave blank for none."
          className="max-w-md"
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

import { PageHeader } from "@/components/admin/admin-shell";
import { SettingsForm } from "@/components/admin/settings-form";
import { staffClient } from "@/lib/admin/auth";
import { BUSINESS_FIELDS, type BusinessField } from "@/lib/business";
import { parseShippingRates } from "@/lib/orders/pricing";
import { rateRowValues } from "@/lib/orders/settings";
import { FALLBACK_DEFAULT_THEME, isDefaultTheme } from "@/lib/theme";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await staffClient();
  const { data } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
  const row = (data ?? {}) as Record<string, unknown>;
  const current = isDefaultTheme(row.default_theme) ? row.default_theme : FALLBACK_DEFAULT_THEME;
  const business = Object.fromEntries(
    BUSINESS_FIELDS.map((f) => [f, typeof row[f] === "string" ? (row[f] as string) : ""]),
  ) as Record<BusinessField, string>;
  return (
    <>
      <PageHeader title="Settings" description="Business details and options for the public website." />
      <SettingsForm
        defaultTheme={current}
        business={business}
        store={{
          enabled: row.store_enabled === true,
          rates: rateRowValues(parseShippingRates(row.shipping_rates)),
          missing: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"].filter((k) => !process.env[k]),
          coreReturnDays: typeof row.core_return_days === "number" ? row.core_return_days : 30,
          live: {
            enabled: row.live_rates_enabled === true,
            length: String(row.parcel_length_in ?? 18),
            width: String(row.parcel_width_in ?? 14),
            height: String(row.parcel_height_in ?? 12),
            handlingFee: typeof row.handling_cents === "number" && row.handling_cents > 0 ? (row.handling_cents / 100).toFixed(2) : "",
            keyMissing: !process.env.SHIPPO_API_KEY,
          },
        }}
      />
    </>
  );
}

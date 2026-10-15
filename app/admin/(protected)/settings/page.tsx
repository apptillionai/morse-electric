import { PageHeader } from "@/components/admin/admin-shell";
import { SettingsForm } from "@/components/admin/settings-form";
import { staffClient } from "@/lib/admin/auth";
import { BUSINESS_FIELDS, type BusinessField } from "@/lib/business";
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
      <SettingsForm defaultTheme={current} business={business} />
    </>
  );
}

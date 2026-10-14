import { PageHeader } from "@/components/admin/admin-shell";
import { SettingsForm } from "@/components/admin/settings-form";
import { staffClient } from "@/lib/admin/auth";
import { FALLBACK_DEFAULT_THEME, isDefaultTheme } from "@/lib/theme";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await staffClient();
  const { data } = await supabase.from("site_settings").select("default_theme").eq("id", 1).maybeSingle();
  const current = isDefaultTheme(data?.default_theme) ? data.default_theme : FALLBACK_DEFAULT_THEME;
  return (
    <>
      <PageHeader title="Settings" description="Site-wide options for the public website." />
      <SettingsForm defaultTheme={current} />
    </>
  );
}
